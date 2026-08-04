import { API_BASE_URL } from '../config';
import { useAuthStore } from '../state/authStore';
import {
  ApiError,
  ApiErrorCode,
  CommandAuditBody,
  EndRideResponse,
  Scooter,
  StartRideResponse,
} from './types';

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  auth?: boolean;
  sensitive?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, sensitive = false } = opts;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (auth) {
    const token = useAuthStore.getState().token;
    if (!token) throw new ApiError('unauthorized', 401, 'Not logged in');
    headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new ApiError('network_error', 0, (e as Error).message);
  }

  if (!res.ok) {
    let code: ApiErrorCode = 'unknown';
    try {
      const json = await res.json();
      code = (json.error as ApiErrorCode) ?? 'unknown';
    } catch {
      code = 'unknown';
    }
    throw new ApiError(code, res.status, sensitive ? code : `${res.status} ${code}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  health(): Promise<{ ok: boolean }> {
    return request('/health', { auth: false });
  },

  getScooter(imei: string): Promise<Scooter> {
    return request(`/v1/scooters/${encodeURIComponent(imei)}`);
  },

  startRide(imei: string): Promise<StartRideResponse> {
    return request('/v1/rides/start', { method: 'POST', body: { imei }, sensitive: true });
  },

  endRide(rideId: string): Promise<EndRideResponse> {
    return request(`/v1/rides/${encodeURIComponent(rideId)}/end`, { method: 'POST' });
  },

  reportCommand(rideId: string, audit: CommandAuditBody): Promise<{ id: string }> {
    return request(`/v1/rides/${encodeURIComponent(rideId)}/commands`, {
      method: 'POST',
      body: audit,
    });
  },
};
