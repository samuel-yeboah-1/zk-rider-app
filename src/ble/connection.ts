import type { CommandName, ParsedAck } from './protocol';

export interface SendOptions {
  ackTimeoutMs?: number;
}

export interface IScooterConnection {
  readonly imei: string;
  send(frame: string, expect: CommandName, opts?: SendOptions): Promise<ParsedAck>;
  sendRaw(frame: string): Promise<void>;
  disconnect(): Promise<void>;
}
