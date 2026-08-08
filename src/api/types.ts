export type PasswordMode = 'dynamic' | 'static';

export interface Scooter {
  imei: string;
  vehicleId?: string | null;
  lockState: 'locked' | 'unlocked';
  batteryPct: number;
  currentMileage: number;
  lastSeenAt: string;
  available: boolean;
}

export interface StartRideResponse {
  rideId: string;
  blePassword: string;
  passwordMode: PasswordMode;
}

export interface EndRideResponse {
  rideId: string;
  endedAt: string;
}

export interface CommandAuditBody {
  command: string;
  params?: string[];
  ackStatus?: string | number;
}

export type ApiErrorCode =
  | 'scooter_not_found'
  | 'vehicle_not_found'
  | 'scooter_in_use'
  | 'no_active_password'
  | 'no_static_password_set'
  | 'ride_not_found'
  | 'not_your_ride'
  | 'ride_already_ended'
  | 'invalid_body'
  | 'unauthorized'
  | 'network_error'
  | 'unknown';

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    public readonly status: number,
    message?: string
  ) {
    super(message ?? code);
    this.name = 'ApiError';
  }
}
