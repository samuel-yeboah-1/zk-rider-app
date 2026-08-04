const http = require('http');

const PORT = process.env.PORT || 4000;
const PWD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

function randomPassword(len = 8) {
  let out = '';
  for (let i = 0; i < len; i++) out += PWD_CHARS[Math.floor(Math.random() * PWD_CHARS.length)];
  return out;
}

let rideSeq = 1;
let cmdSeq = 1;

const scooters = new Map([
  makeScooter('860111111111111', { batteryPct: 92, currentMileage: 1240, mode: 'dynamic' }),
  makeScooter('860222222222222', { batteryPct: 47, currentMileage: 355, mode: 'dynamic' }),
  makeScooter('860333333333333', { batteryPct: 88, currentMileage: 12, mode: 'static', staticPwd: 'Zk-Static-01' }),
  makeScooter('860444444444444', { batteryPct: 15, currentMileage: 980, mode: 'dynamic', noActivePwd: true }),
  makeScooter('860555555555555', { batteryPct: 60, currentMileage: 200, mode: 'dynamic', available: false }),
]);

function makeScooter(imei, opts) {
  return [
    imei,
    {
      imei,
      lockState: 'locked',
      batteryPct: opts.batteryPct,
      currentMileage: opts.currentMileage,
      lastSeenAt: new Date().toISOString(),
      available: opts.available !== false,
      passwordMode: opts.mode,
      activePassword: opts.mode === 'static' ? null : opts.noActivePwd ? null : randomPassword(),
      staticPassword: opts.mode === 'static' ? opts.staticPwd : null,
      inUseBy: null,
    },
  ];
}

const rides = new Map();
const commandLog = [];

function send(res, status, body) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(payload);
}
function err(res, status, code) {
  send(res, status, { error: code });
}
function readJson(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve(null);
      }
    });
  });
}
function bearer(req) {
  const h = req.headers['authorization'] || '';
  const m = /^Bearer\s+(.+)$/.exec(h);
  return m ? m[1] : null;
}
function publicScooter(s) {
  return {
    imei: s.imei,
    lockState: s.lockState,
    batteryPct: s.batteryPct,
    currentMileage: s.currentMileage,
    lastSeenAt: s.lastSeenAt,
    available: s.available,
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method;

  if (method === 'GET' && path === '/health') return send(res, 200, { ok: true });

  if (path.startsWith('/v1/')) {
    const token = bearer(req);
    if (!token) return err(res, 401, 'unauthorized');
    req.token = token;
  }

  let m;
  if (method === 'GET' && (m = path.match(/^\/v1\/scooters\/([^/]+)$/))) {
    const s = scooters.get(decodeURIComponent(m[1]));
    if (!s) return err(res, 404, 'scooter_not_found');
    return send(res, 200, publicScooter(s));
  }

  if (method === 'POST' && path === '/v1/rides/start') {
    const body = await readJson(req);
    if (!body || typeof body.imei !== 'string') return err(res, 400, 'invalid_body');
    const s = scooters.get(body.imei);
    if (!s) return err(res, 404, 'scooter_not_found');
    if (!s.available || s.inUseBy) return err(res, 409, 'scooter_in_use');

    let blePassword;
    if (s.passwordMode === 'static') {
      if (!s.staticPassword) return err(res, 409, 'no_static_password_set');
      blePassword = s.staticPassword;
    } else {
      if (!s.activePassword) return err(res, 409, 'no_active_password');
      blePassword = s.activePassword;
    }

    const rideId = `ride_${rideSeq++}`;
    rides.set(rideId, { rideId, imei: s.imei, token: req.token, endedAt: null });
    s.inUseBy = req.token;
    s.lockState = 'unlocked';
    s.available = false;
    return send(res, 201, { rideId, blePassword, passwordMode: s.passwordMode });
  }

  if (method === 'POST' && (m = path.match(/^\/v1\/rides\/([^/]+)\/end$/))) {
    const ride = rides.get(decodeURIComponent(m[1]));
    if (!ride) return err(res, 404, 'ride_not_found');
    if (ride.token !== req.token) return err(res, 403, 'not_your_ride');
    if (ride.endedAt) return err(res, 409, 'ride_already_ended');

    ride.endedAt = new Date().toISOString();
    const s = scooters.get(ride.imei);
    if (s) {
      s.inUseBy = null;
      s.lockState = 'locked';
      s.available = true;
      if (s.passwordMode === 'dynamic' && s.activePassword) s.activePassword = randomPassword();
    }
    return send(res, 200, { rideId: ride.rideId, endedAt: ride.endedAt });
  }

  if (method === 'POST' && (m = path.match(/^\/v1\/rides\/([^/]+)\/commands$/))) {
    const ride = rides.get(decodeURIComponent(m[1]));
    if (!ride) return err(res, 404, 'ride_not_found');
    if (ride.token !== req.token) return err(res, 403, 'not_your_ride');
    const body = await readJson(req);
    if (!body || typeof body.command !== 'string') return err(res, 400, 'invalid_body');

    const entry = {
      id: `cmd_${cmdSeq++}`,
      rideId: ride.rideId,
      command: body.command,
      params: Array.isArray(body.params) ? body.params : [],
      ackStatus: body.ackStatus ?? null,
      at: new Date().toISOString(),
    };
    commandLog.push(entry);
    return send(res, 201, { id: entry.id });
  }

  return err(res, 404, 'not_found');
});

server.listen(PORT, () => {
  console.log(`ZK mock backend on http://localhost:${PORT}`);
  console.log('Seeded scooters:');
  for (const s of scooters.values()) {
    console.log(
      `  ${s.imei}  mode=${s.passwordMode}  battery=${s.batteryPct}%  available=${s.available}`
    );
  }
  console.log('\nNote: blePassword is only returned by POST /v1/rides/start.');
});
