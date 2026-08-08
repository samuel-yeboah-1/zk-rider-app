import { create } from 'zustand';

import type { IScooterConnection } from '../ble/connection';
import type { PasswordMode } from '../api/types';

interface RideState {
  rideId: string | null;
  imei: string | null;
  passwordMode: PasswordMode | null;
  blePassword: string | null;
  connection: IScooterConnection | null;
  isConnected: boolean;

  startRide: (args: {
    rideId: string;
    imei: string;
    blePassword: string;
    passwordMode: PasswordMode;
  }) => void;
  setConnection: (conn: IScooterConnection | null) => void;
  getPassword: () => string;
  clear: () => void;
}

export const useRideStore = create<RideState>((set, get) => ({
  rideId: null,
  imei: null,
  passwordMode: null,
  blePassword: null,
  connection: null,
  isConnected: false,

  startRide({ rideId, imei, blePassword, passwordMode }) {
    set({ rideId, imei, blePassword, passwordMode });
  },

  setConnection(conn) {
    set({ connection: conn, isConnected: !!conn });
  },

  getPassword() {
    const pwd = get().blePassword;
    if (!pwd) throw new Error('No active BLE password');
    return pwd;
  },

  clear() {
    set({
      rideId: null,
      imei: null,
      passwordMode: null,
      blePassword: null,
      connection: null,
      isConnected: false,
    });
  },
}));
