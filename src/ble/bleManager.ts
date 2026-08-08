import { BleManager, Characteristic, Device, State, Subscription } from 'react-native-ble-plx';
import { Buffer } from 'buffer';

import { log } from '../log';
import { CHARACTERISTIC_UUID, SERVICE_UUID } from './constants';
import { chunk, CommandName, parseAck, ParsedAck, redactFrame } from './protocol';

export interface ConnectOptions {
  scanTimeoutMs?: number;
  onDisconnect?: (error: Error | null) => void;
}

export interface SendOptions {
  ackTimeoutMs?: number;
}

const DEFAULT_SCAN_TIMEOUT = 15_000;
const DEFAULT_ACK_TIMEOUT = 8_000;

export class ScooterConnectionError extends Error {}
export class AckTimeoutError extends Error {}

export class ScooterConnection {
  private ackListeners = new Set<(ack: ParsedAck) => void>();
  private notifySub: Subscription | null = null;
  private disconnectSub: Subscription | null = null;
  private rxBuffer = '';

  private constructor(
    private readonly manager: BleManager,
    private device: Device,
    public readonly imei: string
  ) {}

  static async connect(
    manager: BleManager,
    imei: string,
    opts: ConnectOptions = {}
  ): Promise<ScooterConnection> {
    const device = await scanForImei(manager, imei, opts.scanTimeoutMs ?? DEFAULT_SCAN_TIMEOUT);
    log.info(`Connecting to scooter (IMEI matched)`);

    let connected = await device.connect();
    connected = await connected.discoverAllServicesAndCharacteristics();

    const conn = new ScooterConnection(manager, connected, imei);
    conn.disconnectSub = connected.onDisconnected((error) => {
      log.warn('Scooter disconnected', error?.message);
      opts.onDisconnect?.(error ? new Error(error.message) : null);
    });
    await conn.subscribe();
    return conn;
  }

  private handleNotification(characteristic: Characteristic | null): void {
    if (!characteristic?.value) return;
    this.rxBuffer += Buffer.from(characteristic.value, 'base64').toString('utf8');
    if (this.rxBuffer.length > 4096) this.rxBuffer = this.rxBuffer.slice(-4096);

    let idx: number;
    while ((idx = this.rxBuffer.indexOf('$')) !== -1) {
      const frame = this.rxBuffer.slice(0, idx + 1);
      this.rxBuffer = this.rxBuffer.slice(idx + 1);
      const ack = parseAck(frame);
      if (ack) this.ackListeners.forEach((fn) => fn(ack));
    }
  }

  private async subscribe(): Promise<void> {
    this.notifySub = this.device.monitorCharacteristicForService(
      SERVICE_UUID,
      CHARACTERISTIC_UUID,
      (error, characteristic) => {
        if (error) {
          if (!/cancell?ed/i.test(error.message)) log.warn('Notify error', error.message);
          return;
        }
        this.handleNotification(characteristic);
      }
    );
  }

  async send(frame: string, expect: CommandName, opts: SendOptions = {}): Promise<ParsedAck> {
    const timeout = opts.ackTimeoutMs ?? DEFAULT_ACK_TIMEOUT;
    log.info(`TX ${redactFrame(frame)}`);

    const ackPromise = this.waitForAck(expect, timeout);

    const chunks = chunk(frame);
    for (const part of chunks) {
      const base64 = Buffer.from(part, 'utf8').toString('base64');
      await this.device.writeCharacteristicWithResponseForService(
        SERVICE_UUID,
        CHARACTERISTIC_UUID,
        base64
      );
    }

    return ackPromise;
  }

  async sendRaw(frame: string): Promise<void> {
    log.info(`TX ${redactFrame(frame)}`);
    const chunks = chunk(frame);
    for (const part of chunks) {
      const base64 = Buffer.from(part, 'utf8').toString('base64');
      await this.device.writeCharacteristicWithResponseForService(
        SERVICE_UUID,
        CHARACTERISTIC_UUID,
        base64
      );
    }
  }

  private waitForAck(expect: CommandName, timeoutMs: number): Promise<ParsedAck> {
    return new Promise<ParsedAck>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.ackListeners.delete(listener);
        reject(new AckTimeoutError(`Timed out waiting for +ACK:${expect}`));
      }, timeoutMs);

      const listener = (ack: ParsedAck) => {
        if (ack.command !== expect) return;
        clearTimeout(timer);
        this.ackListeners.delete(listener);
        resolve(ack);
      };
      this.ackListeners.add(listener);
    });
  }

  async disconnect(): Promise<void> {
    this.notifySub?.remove();
    this.disconnectSub?.remove();
    this.ackListeners.clear();
    this.rxBuffer = '';
    try {
      await this.device.cancelConnection();
    } catch {
      log.info('Device already disconnected');
    }
  }
}

function scanForImei(manager: BleManager, imei: string, timeoutMs: number): Promise<Device> {
  return new Promise<Device>((resolve, reject) => {
    const timer = setTimeout(() => {
      manager.stopDeviceScan();
      reject(new ScooterConnectionError(`No scooter advertising IMEI within ${timeoutMs}ms`));
    }, timeoutMs);

    manager.startDeviceScan(null, { allowDuplicates: true }, (error, device) => {
      if (error) {
        clearTimeout(timer);
        manager.stopDeviceScan();
        reject(new ScooterConnectionError(error.message));
        return;
      }
      if (device && advertisesImei(device, imei)) {
        clearTimeout(timer);
        manager.stopDeviceScan();
        resolve(device);
      }
    });
  });
}

function advertisesImei(device: Device, imei: string): boolean {
  if (device.localName?.includes(imei) || device.name?.includes(imei)) return true;
  if (device.manufacturerData) {
    try {
      const decoded = Buffer.from(device.manufacturerData, 'base64').toString('utf8');
      if (decoded.includes(imei)) return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function waitForPoweredOn(manager: BleManager, timeoutMs = 10_000): Promise<void> {
  const state = await manager.state();
  if (state === State.PoweredOn) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      sub.remove();
      reject(new ScooterConnectionError(`Bluetooth not ready (state: ${state})`));
    }, timeoutMs);
    const sub = manager.onStateChange((s) => {
      if (s === State.PoweredOn) {
        clearTimeout(timer);
        sub.remove();
        resolve();
      }
    }, true);
  });
}

let _manager: BleManager | null = null;
export function getBleManager(): BleManager {
  if (!_manager) _manager = new BleManager();
  return _manager;
}
