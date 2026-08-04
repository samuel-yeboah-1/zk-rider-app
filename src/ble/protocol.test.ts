import {
  buildFrame,
  chunk,
  commands,
  FRAME_SUFFIX,
  isValidPassword,
  LockCommand,
  parseAck,
  parseBksctAck,
  parseInfoAck,
  parseResultAck,
  parseVersionAck,
  redactFrame,
  redactParams,
  splitVersion,
  stripFraming,
} from './protocol';

describe('framing', () => {
  it('builds a comma-separated frame with password first and the terminator', () => {
    expect(buildFrame('BKSCT', ['pw123', 0])).toBe(`AT+BKSCT=pw123,0${FRAME_SUFFIX}`);
  });

  it('terminates with $\\r\\n', () => {
    expect(FRAME_SUFFIX).toBe('$\r\n');
    expect(commands.queryInfo('pw')).toMatch(/\$\r\n$/);
  });
});

describe('chunking (§2.3, <=20 bytes)', () => {
  it('does not split short messages', () => {
    const msg = 'AT+BKINF=pw,0';
    expect(chunk(msg)).toEqual([msg]);
  });

  it('splits long messages into <=20-byte chunks preserving order and content', () => {
    const msg = commands.queryVersion('a-fairly-long-password-value');
    const chunks = chunk(msg);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => expect(Buffer.byteLength(c, 'utf8')).toBeLessThanOrEqual(20));
    expect(chunks.join('')).toBe(msg);
  });

  it('respects a custom chunk size', () => {
    expect(chunk('abcdefgh', 3)).toEqual(['abc', 'def', 'gh']);
  });
});

describe('command builders (all 8 commands)', () => {
  const pw = 'secret1';

  it('BKSCT unlock/lock', () => {
    expect(commands.lockControl(pw, LockCommand.UnlockEcu)).toBe(`AT+BKSCT=${pw},0${FRAME_SUFFIX}`);
    expect(commands.lockControl(pw, LockCommand.LockEcu)).toBe(`AT+BKSCT=${pw},1${FRAME_SUFFIX}`);
    expect(commands.lockControl(pw, LockCommand.UnlockBattery)).toBe(
      `AT+BKSCT=${pw},10${FRAME_SUFFIX}`
    );
  });

  it('BKECP ride config with fixed ecuType=1', () => {
    expect(commands.rideConfig(pw, { maxSpeed: 25, speedMode: 1, displayUnit: 1 })).toBe(
      `AT+BKECP=${pw},1,25,1,1${FRAME_SUFFIX}`
    );
  });

  it('BKECP rejects out-of-range maxSpeed', () => {
    expect(() => commands.rideConfig(pw, { maxSpeed: 64, speedMode: 0, displayUnit: 0 })).toThrow();
  });

  it('BKLED headlamp on/off', () => {
    expect(commands.headlamp(pw, true)).toBe(`AT+BKLED=${pw},0,1${FRAME_SUFFIX}`);
    expect(commands.headlamp(pw, false)).toBe(`AT+BKLED=${pw},0,0${FRAME_SUFFIX}`);
  });

  it('BKLOC / BKWRN carry reserved 0', () => {
    expect(commands.locate(pw)).toBe(`AT+BKLOC=${pw},0${FRAME_SUFFIX}`);
    expect(commands.warning(pw)).toBe(`AT+BKWRN=${pw},0${FRAME_SUFFIX}`);
  });

  it('BKPWD validates the new password', () => {
    expect(commands.changePassword(pw, 'New_Pass-1')).toBe(
      `AT+BKPWD=${pw},New_Pass-1${FRAME_SUFFIX}`
    );
    expect(() => commands.changePassword(pw, 'no')).toThrow();
    expect(() => commands.changePassword(pw, 'has spaces')).toThrow();
  });

  it('BKINF / BKVER queries', () => {
    expect(commands.queryInfo(pw)).toBe(`AT+BKINF=${pw},0${FRAME_SUFFIX}`);
    expect(commands.queryVersion(pw)).toBe(`AT+BKVER=${pw},0${FRAME_SUFFIX}`);
  });
});

describe('password validation', () => {
  it('accepts 4-20 chars from the allowed set', () => {
    expect(isValidPassword('ab12')).toBe(true);
    expect(isValidPassword('A_valid-Pass99')).toBe(true);
  });
  it('rejects too short, too long, or bad chars', () => {
    expect(isValidPassword('abc')).toBe(false);
    expect(isValidPassword('x'.repeat(21))).toBe(false);
    expect(isValidPassword('has space')).toBe(false);
    expect(isValidPassword('emoji😀xx')).toBe(false);
  });
});

describe('ack parsing', () => {
  it('strips framing noise', () => {
    expect(stripFraming('+ACK:BKSCT,0$\r\n')).toBe('+ACK:BKSCT,0');
  });

  it('parses generic ack into command + fields', () => {
    expect(parseAck('+ACK:BKLED,1\r\n')).toEqual({ command: 'BKLED', fields: ['1'] });
  });

  it('returns null on non-ack payloads', () => {
    expect(parseAck('garbage')).toBeNull();
  });

  it('parses BKSCT status', () => {
    expect(parseBksctAck(parseAck('+ACK:BKSCT,0')!)).toMatchObject({ status: 0, ecuUnlocked: true });
    expect(parseBksctAck(parseAck('+ACK:BKSCT,1')!)).toMatchObject({ status: 1, ecuLocked: true });
  });

  it('parses a result ack', () => {
    expect(parseResultAck(parseAck('+ACK:BKLED,1')!)).toEqual({ success: true, raw: 1 });
    expect(parseResultAck(parseAck('+ACK:BKLED,0')!)).toEqual({ success: false, raw: 0 });
  });

  it('parses BKINF into typed info', () => {
    const info = parseInfoAck(parseAck('+ACK:BKINF,0,18,3,1200,900,84,1')!);
    expect(info).toEqual({
      locked: false,
      speedKmh: 18,
      currentMileageKm: 3,
      totalMileageKm: 1200,
      rideTimeSeconds: 900,
      batteryPct: 84,
      headlampOn: true,
    });
  });

  it('parses BKVER with the documented packing', () => {
    const ecu = 'SOFT0001HARD0001';
    const lock = 'S'.repeat(16) + 'H'.repeat(16);
    const v = parseVersionAck(
      parseAck(`+ACK:BKVER,MCUv1,BLEv2,${ecu},${ecu},${ecu},${lock},${lock},${lock},0,0`)!
    );
    expect(v.mcu).toBe('MCUv1');
    expect(v.ecu).toEqual({ software: 'SOFT0001', hardware: 'HARD0001' });
    expect(v.batteryLock).toEqual({ software: 'S'.repeat(16), hardware: 'H'.repeat(16) });
  });

  it('splitVersion splits at the given half length', () => {
    expect(splitVersion('AAAABBBB', 4)).toEqual({ software: 'AAAA', hardware: 'BBBB' });
  });
});

describe('password redaction (§4 — never log the password)', () => {
  it('redacts the password in a full frame', () => {
    const frame = commands.lockControl('supersecret', LockCommand.UnlockEcu);
    const redacted = redactFrame(frame);
    expect(redacted).not.toContain('supersecret');
    expect(redacted).toBe(`AT+BKSCT=***,0${FRAME_SUFFIX}`);
  });

  it('redacts the first element of a params array', () => {
    expect(redactParams(['supersecret', 0, 1])).toEqual(['***', '0', '1']);
    expect(redactParams([])).toEqual([]);
  });
});
