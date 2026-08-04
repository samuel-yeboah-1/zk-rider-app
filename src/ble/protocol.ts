import { MAX_CHUNK_BYTES } from './constants';

export const FRAME_SUFFIX = '$\r\n';

export type CommandName =
  | 'BKSCT'
  | 'BKECP'
  | 'BKLED'
  | 'BKLOC'
  | 'BKWRN'
  | 'BKPWD'
  | 'BKINF'
  | 'BKVER';

export const LockCommand = {
  UnlockEcu: 0,
  LockEcu: 1,
  EnhancedUnlockEcu: 2,
  UnlockBattery: 10,
  LockBattery: 11,
  UnlockPile: 20,
  LockPile: 21,
  UnlockBasket: 30,
  LockBasket: 31,
  UnlockSpare: 40,
  LockSpare: 41,
} as const;
export type LockCommandId = (typeof LockCommand)[keyof typeof LockCommand];

export const RESULT_FAILURE = 0;
export const RESULT_SUCCESS = 1;

export function buildFrame(command: CommandName, parts: Array<string | number>): string {
  const body = parts.map(String).join(',');
  return `AT+${command}=${body}${FRAME_SUFFIX}`;
}

export function chunk(message: string, maxBytes: number = MAX_CHUNK_BYTES): string[] {
  if (maxBytes <= 0) throw new Error('maxBytes must be > 0');
  const bytes = utf8Bytes(message);
  if (bytes.length <= maxBytes) return [message];

  const chunks: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + maxBytes, bytes.length);
    while (end > start && (bytes[end] & 0xc0) === 0x80) end--;
    if (end === start) end = Math.min(start + maxBytes, bytes.length);
    chunks.push(bytesToString(bytes.slice(start, end)));
    start = end;
  }
  return chunks;
}

function utf8Bytes(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let code = s.charCodeAt(i);
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const hi = code;
      const lo = s.charCodeAt(++i);
      code = 0x10000 + ((hi - 0xd800) << 10) + (lo - 0xdc00);
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    } else {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return out;
}

function bytesToString(bytes: number[]): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b < 0x80) {
      out += String.fromCharCode(b);
      i += 1;
    } else if ((b & 0xe0) === 0xc0) {
      out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
      i += 2;
    } else if ((b & 0xf0) === 0xe0) {
      out += String.fromCharCode(
        ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f)
      );
      i += 3;
    } else {
      const cp =
        ((b & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f);
      const c = cp - 0x10000;
      out += String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 0x3ff));
      i += 4;
    }
  }
  return out;
}

export const commands = {
  lockControl(pwd: string, cmd: LockCommandId): string {
    return buildFrame('BKSCT', [pwd, cmd]);
  },

  rideConfig(
    pwd: string,
    opts: { maxSpeed: number; speedMode: 0 | 1; displayUnit: 0 | 1 }
  ): string {
    if (opts.maxSpeed < 0 || opts.maxSpeed > 63) {
      throw new Error('maxSpeed must be 0-63 km/h');
    }
    return buildFrame('BKECP', [pwd, 1, opts.maxSpeed, opts.speedMode, opts.displayUnit]);
  },

  headlamp(pwd: string, on: boolean): string {
    return buildFrame('BKLED', [pwd, 0, on ? 1 : 0]);
  },

  locate(pwd: string): string {
    return buildFrame('BKLOC', [pwd, 0]);
  },

  warning(pwd: string): string {
    return buildFrame('BKWRN', [pwd, 0]);
  },

  changePassword(pwd: string, newPwd: string): string {
    if (!isValidPassword(newPwd)) {
      throw new Error('newPwd must be 4-20 chars from [0-9 a-z A-Z - _]');
    }
    return buildFrame('BKPWD', [pwd, newPwd]);
  },

  queryInfo(pwd: string): string {
    return buildFrame('BKINF', [pwd, 0]);
  },

  queryVersion(pwd: string): string {
    return buildFrame('BKVER', [pwd, 0]);
  },
};

const PASSWORD_RE = /^[0-9a-zA-Z_-]{4,20}$/;
export function isValidPassword(pwd: string): boolean {
  return PASSWORD_RE.test(pwd);
}

export interface ParsedAck {
  command: CommandName;
  fields: string[];
}

export function stripFraming(raw: string): string {
  return raw.replace(/[$\r\n]+$/g, '').trim();
}

export function parseAck(raw: string): ParsedAck | null {
  const clean = stripFraming(raw);
  const m = /^\+ACK:([A-Z]+),?(.*)$/.exec(clean);
  if (!m) return null;
  const command = m[1] as CommandName;
  const rest = m[2];
  const fields = rest.length ? rest.split(',') : [];
  return { command, fields };
}

export function parseResultAck(ack: ParsedAck): { success: boolean; raw: number } {
  const raw = Number(ack.fields[0]);
  return { success: raw === RESULT_SUCCESS, raw };
}

export interface BksctAck {
  status: number;
  ecuUnlocked: boolean;
  ecuLocked: boolean;
}
export function parseBksctAck(ack: ParsedAck): BksctAck {
  const status = Number(ack.fields[0]);
  return { status, ecuUnlocked: status === 0, ecuLocked: status === 1 };
}

export interface ScooterInfo {
  locked: boolean;
  speedKmh: number;
  currentMileageKm: number;
  totalMileageKm: number;
  rideTimeSeconds: number;
  batteryPct: number;
  headlampOn: boolean;
}
export function parseInfoAck(ack: ParsedAck): ScooterInfo {
  const [lock, speed, cur, total, time, batt, lamp] = ack.fields.map(Number);
  return {
    locked: lock === 1,
    speedKmh: speed,
    currentMileageKm: cur,
    totalMileageKm: total,
    rideTimeSeconds: time,
    batteryPct: batt,
    headlampOn: lamp === 1,
  };
}

export interface VersionPair {
  software: string;
  hardware: string;
}
export interface ScooterVersions {
  mcu: string;
  ble: string;
  ecu: VersionPair;
  meter: VersionPair;
  bms: VersionPair;
  batteryLock: VersionPair;
  pileLock: VersionPair;
  basketLock: VersionPair;
}
export function splitVersion(field: string, half: number): VersionPair {
  return { software: field.slice(0, half), hardware: field.slice(half) };
}
export function parseVersionAck(ack: ParsedAck): ScooterVersions {
  const [mcu, ble, ecu, meter, bms, batteryLock, pileLock, basketLock] = ack.fields;
  return {
    mcu,
    ble,
    ecu: splitVersion(ecu ?? '', 8),
    meter: splitVersion(meter ?? '', 8),
    bms: splitVersion(bms ?? '', 8),
    batteryLock: splitVersion(batteryLock ?? '', 16),
    pileLock: splitVersion(pileLock ?? '', 16),
    basketLock: splitVersion(basketLock ?? '', 16),
  };
}

const REDACTION = '***';

export function redactFrame(frame: string): string {
  return frame.replace(/^(AT\+[A-Z]+=)([^,\r\n$]*)/, `$1${REDACTION}`);
}

export function redactParams(params: Array<string | number>): string[] {
  if (params.length === 0) return [];
  return [REDACTION, ...params.slice(1).map(String)];
}
