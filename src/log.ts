import { redactFrame } from './ble/protocol';

function scrub(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.includes('AT+') ? redactFrame(value) : value;
  }
  return value;
}

export const log = {
  info(msg: string, ...rest: unknown[]) {
    console.log(`[zk] ${msg}`, ...rest.map(scrub));
  },
  warn(msg: string, ...rest: unknown[]) {
    console.warn(`[zk] ${msg}`, ...rest.map(scrub));
  },
  error(msg: string, ...rest: unknown[]) {
    console.error(`[zk] ${msg}`, ...rest.map(scrub));
  },
};
