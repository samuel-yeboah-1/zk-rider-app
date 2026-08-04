export function uuid16(short: string): string {
  const s = short.toLowerCase().padStart(4, '0');
  return `0000${s}-0000-1000-8000-00805f9b34fb`;
}

export const SERVICE_UUID = uuid16('2c00');

export const CHARACTERISTIC_UUID = uuid16('2c10');

export const MAX_CHUNK_BYTES = 20;
