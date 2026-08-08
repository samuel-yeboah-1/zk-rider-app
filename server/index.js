const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const fs = require('fs');
const express = require('express');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 4000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');
const FLEET_PATH = path.join(__dirname, 'fleet.json');
const FLEET_PASSWORD = process.env.FLEET_PASSWORD || '';
const AUTO_REGISTER = process.env.AUTO_REGISTER !== '0';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS scooters (
    imei            TEXT PRIMARY KEY,
    ble_password    TEXT,
    password_mode   TEXT NOT NULL DEFAULT 'static',
    battery_pct     INTEGER NOT NULL DEFAULT 100,
    current_mileage INTEGER NOT NULL DEFAULT 0,
    lock_state      TEXT NOT NULL DEFAULT 'locked',
    available       INTEGER NOT NULL DEFAULT 1,
    last_seen_at    TEXT,
    vehicle_id      TEXT,
    qr_url          TEXT
  );
  CREATE TABLE IF NOT EXISTS rides (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    imei       TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at   TEXT
  );
  CREATE TABLE IF NOT EXISTS commands (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ride_id    TEXT NOT NULL,
    command    TEXT NOT NULL,
    params     TEXT,
    ack_status TEXT,
    at         TEXT NOT NULL
  );
`);

for (const [col, type] of [['vehicle_id', 'TEXT'], ['qr_url', 'TEXT']]) {
  const cols = db.prepare('PRAGMA table_info(scooters)').all().map((c) => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE scooters ADD COLUMN ${col} ${type}`);
}

function seedScooters(seedPath) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  } catch {
    return;
  }
  const entries = Array.isArray(raw) ? raw : [];
  const now = new Date().toISOString();

  const exists = db.prepare('SELECT imei FROM scooters WHERE imei = ?');
  const insert = db.prepare(`
    INSERT INTO scooters (imei, ble_password, password_mode, battery_pct, current_mileage, lock_state, available, last_seen_at, vehicle_id, qr_url)
    VALUES (@imei, @blePassword, @passwordMode, @batteryPct, @currentMileage, 'locked', 1, @now, @vehicleId, @qrUrl)
  `);
  const updateConfig = db.prepare(`
    UPDATE scooters SET ble_password = COALESCE(@blePassword, ble_password), password_mode = @passwordMode,
      battery_pct = @batteryPct, current_mileage = @currentMileage, last_seen_at = @now,
      vehicle_id = @vehicleId, qr_url = @qrUrl
    WHERE imei = @imei
  `);

  const tx = db.transaction((rows) => {
    for (const r of rows) {
      if (!r || typeof r.imei !== 'string' || r.imei.startsWith('REPLACE_')) continue;
      const row = {
        imei: r.imei,
        blePassword: r.blePassword ?? null,
        passwordMode: r.passwordMode === 'dynamic' ? 'dynamic' : 'static',
        batteryPct: Number.isFinite(r.batteryPct) ? r.batteryPct : 100,
        currentMileage: Number.isFinite(r.currentMileage) ? r.currentMileage : 0,
        vehicleId: typeof r.vehicleId === 'string' ? r.vehicleId : null,
        qrUrl: typeof r.qrUrl === 'string' ? r.qrUrl : null,
        now,
      };
      if (exists.get(row.imei)) updateConfig.run(row);
      else insert.run(row);
    }
  });
  tx(entries);
}
seedScooters(FLEET_PATH);

function publicScooter(s) {
  return {
    imei: s.imei,
    vehicleId: s.vehicle_id ?? null,
    lockState: s.lock_state,
    batteryPct: s.battery_pct,
    currentMileage: s.current_mileage,
    lastSeenAt: s.last_seen_at,
    available: !!s.available,
  };
}

const getScooter = db.prepare('SELECT * FROM scooters WHERE imei = ?');
const getByVehicle = db.prepare('SELECT * FROM scooters WHERE vehicle_id = ?');
const getRide = db.prepare('SELECT * FROM rides WHERE id = ?');
const insertAuto = db.prepare(`
  INSERT INTO scooters (imei, ble_password, password_mode, battery_pct, current_mileage, lock_state, available, last_seen_at)
  VALUES (?, ?, 'static', 100, 0, 'locked', 1, ?)
`);

function ensureScooter(imei) {
  let s = getScooter.get(imei);
  if (!s && AUTO_REGISTER && FLEET_PASSWORD && /^\d{14,16}$/.test(imei)) {
    insertAuto.run(imei, FLEET_PASSWORD, new Date().toISOString());
    s = getScooter.get(imei);
  }
  return s;
}

function err(res, status, code) {
  return res.status(status).json({ error: code });
}

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/v1/scooters/:imei', (req, res) => {
  const s = ensureScooter(req.params.imei);
  if (!s) return err(res, 404, 'scooter_not_found');
  res.json(publicScooter(s));
});

app.get('/v1/vehicles/:vehicleId', (req, res) => {
  const s = getByVehicle.get(req.params.vehicleId);
  if (!s) return err(res, 404, 'vehicle_not_found');
  res.json(publicScooter(s));
});

app.post('/v1/rides/start', (req, res) => {
  const { imei } = req.body || {};
  if (typeof imei !== 'string') return err(res, 400, 'invalid_body');

  let s = ensureScooter(imei);
  if (!s) return err(res, 404, 'scooter_not_found');

  // Single-operator app: reclaim any stale/abandoned open ride on this scooter
  // instead of rejecting with scooter_in_use.
  if (!s.available || s.lock_state === 'unlocked') {
    db.prepare('UPDATE rides SET ended_at = ? WHERE imei = ? AND ended_at IS NULL').run(new Date().toISOString(), imei);
    db.prepare("UPDATE scooters SET available = 1, lock_state = 'locked' WHERE imei = ?").run(imei);
    s = getScooter.get(imei);
  }

  const blePassword = s.ble_password || FLEET_PASSWORD;
  if (!blePassword) {
    return err(res, 409, s.password_mode === 'static' ? 'no_static_password_set' : 'no_active_password');
  }

  const startedAt = new Date().toISOString();
  const info = db
    .prepare('INSERT INTO rides (imei, started_at, ended_at) VALUES (?, ?, NULL)')
    .run(imei, startedAt);
  db.prepare("UPDATE scooters SET lock_state = 'unlocked', available = 0 WHERE imei = ?").run(imei);

  res.status(201).json({
    rideId: `ride_${info.lastInsertRowid}`,
    blePassword,
    passwordMode: s.password_mode,
  });
});

function rideIdNum(raw) {
  const m = /^ride_(\d+)$/.exec(raw);
  return m ? Number(m[1]) : null;
}

app.post('/v1/rides/:id/end', (req, res) => {
  const id = rideIdNum(req.params.id);
  const ride = id != null ? getRide.get(id) : null;
  if (!ride) return err(res, 404, 'ride_not_found');
  if (ride.ended_at) return err(res, 409, 'ride_already_ended');

  const endedAt = new Date().toISOString();
  db.prepare('UPDATE rides SET ended_at = ? WHERE id = ?').run(endedAt, id);
  db.prepare("UPDATE scooters SET lock_state = 'locked', available = 1 WHERE imei = ?").run(ride.imei);

  res.json({ rideId: `ride_${id}`, endedAt });
});

app.post('/v1/rides/:id/commands', (req, res) => {
  const id = rideIdNum(req.params.id);
  const ride = id != null ? getRide.get(id) : null;
  if (!ride) return err(res, 404, 'ride_not_found');

  const { command, params, ackStatus } = req.body || {};
  if (typeof command !== 'string') return err(res, 400, 'invalid_body');

  const info = db
    .prepare('INSERT INTO commands (ride_id, command, params, ack_status, at) VALUES (?, ?, ?, ?, ?)')
    .run(
      `ride_${id}`,
      command,
      JSON.stringify(Array.isArray(params) ? params : []),
      ackStatus != null ? String(ackStatus) : null,
      new Date().toISOString()
    );
  res.status(201).json({ id: `cmd_${info.lastInsertRowid}` });
});

app.use((_req, res) => err(res, 404, 'not_found'));

app.listen(PORT);
