import { api } from './api/client';
import { AckTimeoutError, ScooterConnection } from './ble/bleManager';
import {
  commands,
  LockCommand,
  parseBksctAck,
  parseInfoAck,
  parseResultAck,
  parseVersionAck,
  redactParams,
  ScooterInfo,
  ScooterVersions,
} from './ble/protocol';
import { log } from './log';
import { useRideStore } from './state/rideStore';

async function audit(command: string, params: Array<string | number>, ackStatus?: string | number) {
  const { rideId } = useRideStore.getState();
  if (!rideId) return;
  try {
    await api.reportCommand(rideId, {
      command,
      params: redactParams(params),
      ackStatus,
    });
  } catch (e) {
    log.warn('Audit report failed (non-fatal)', (e as Error).message);
  }
}

function requireConnection(): ScooterConnection {
  const conn = useRideStore.getState().connection;
  if (!conn) throw new Error('Not connected to a scooter');
  return conn;
}

export const rideActions = {
  async unlock(): Promise<boolean> {
    const conn = requireConnection();
    const pwd = useRideStore.getState().getPassword();
    const ack = await conn.send(commands.lockControl(pwd, LockCommand.UnlockEcu), 'BKSCT');
    const { ecuUnlocked, status } = parseBksctAck(ack);
    void audit('BKSCT', [pwd, LockCommand.UnlockEcu], status);
    return ecuUnlocked;
  },

  async lock(): Promise<boolean> {
    const conn = requireConnection();
    const pwd = useRideStore.getState().getPassword();
    const ack = await conn.send(commands.lockControl(pwd, LockCommand.LockEcu), 'BKSCT');
    const { ecuLocked, status } = parseBksctAck(ack);
    void audit('BKSCT', [pwd, LockCommand.LockEcu], status);
    return ecuLocked;
  },

  async setHeadlamp(on: boolean): Promise<boolean> {
    const conn = requireConnection();
    const pwd = useRideStore.getState().getPassword();
    const ack = await conn.send(commands.headlamp(pwd, on), 'BKLED');
    const { success, raw } = parseResultAck(ack);
    void audit('BKLED', [pwd, 0, on ? 1 : 0], raw);
    return success;
  },

  async locate(): Promise<boolean> {
    const conn = requireConnection();
    const pwd = useRideStore.getState().getPassword();
    const ack = await conn.send(commands.locate(pwd), 'BKLOC');
    const { success, raw } = parseResultAck(ack);
    void audit('BKLOC', [pwd, 0], raw);
    return success;
  },

  async warn(): Promise<boolean> {
    const conn = requireConnection();
    const pwd = useRideStore.getState().getPassword();
    const ack = await conn.send(commands.warning(pwd), 'BKWRN');
    const { success, raw } = parseResultAck(ack);
    void audit('BKWRN', [pwd, 0], raw);
    return success;
  },

  async configure(opts: { maxSpeed: number; speedMode: 0 | 1; displayUnit: 0 | 1 }): Promise<boolean> {
    const conn = requireConnection();
    const pwd = useRideStore.getState().getPassword();
    const ack = await conn.send(commands.rideConfig(pwd, opts), 'BKECP');
    const { success, raw } = parseResultAck(ack);
    void audit('BKECP', [pwd, 1, opts.maxSpeed, opts.speedMode, opts.displayUnit], raw);
    return success;
  },

  async changePassword(newPwd: string): Promise<boolean> {
    const conn = requireConnection();
    const pwd = useRideStore.getState().getPassword();
    const ack = await conn.send(commands.changePassword(pwd, newPwd), 'BKPWD');
    const { success, raw } = parseResultAck(ack);
    void audit('BKPWD', [pwd, '***'], raw);
    return success;
  },

  async queryInfo(): Promise<ScooterInfo> {
    const conn = requireConnection();
    const pwd = useRideStore.getState().getPassword();
    const ack = await conn.send(commands.queryInfo(pwd), 'BKINF');
    return parseInfoAck(ack);
  },

  async queryVersion(): Promise<ScooterVersions> {
    const conn = requireConnection();
    const pwd = useRideStore.getState().getPassword();
    const ack = await conn.send(commands.queryVersion(pwd), 'BKVER');
    return parseVersionAck(ack);
  },
};

export { AckTimeoutError };
