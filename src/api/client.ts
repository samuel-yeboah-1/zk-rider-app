import { API_BASE_URL } from '../config';
import { log } from '../log';
import { useAuthStore } from '../state/authStore';
import {
  ApiError,
  ApiErrorCode,
  CommandAuditBody,
  EndRideResponse,
  Scooter,
  StartRideResponse,
} from './types';

// The backend runs on a plan that spins down when idle, so the first request
// after a quiet spell can wait for a ~30-60s cold start. Give each attempt a
// generous timeout and retry once: a cold start usually finishes by attempt 2,
// which then hits a warm server and returns fast. `warmUp()` (fired when the
// app opens) exists to absorb that cold start before the rider taps Find.
const REQUEST_TIMEOUT_MS = 30_000;
const RETRYABLE: ReadonlySet<ApiErrorCode> = new Set(['network_error', 'timeout']);

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  auth?: boolean;
  sensitive?: boolean;
  timeoutMs?: number;
  retries?: number;
}

async function attempt<T>(path: string, opts: RequestOptions): Promise<T> {
  const { method = 'GET', body, auth = true, sensitive = false, timeoutMs = REQUEST_TIMEOUT_MS } = opts;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (auth) {
    const token = useAuthStore.getState().token;
    if (!token) throw new ApiError('unauthorized', 401, 'Not logged in');
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    if (controller.signal.aborted) {
      throw new ApiError('timeout', 0, `Request timed out after ${timeoutMs}ms`);
    }
    throw new ApiError('network_error', 0, (e as Error).message);
  } finally {
    clearTimeout(timer);
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

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const retries = opts.retries ?? 1;
  for (let i = 0; ; i++) {
    try {
      return await attempt<T>(path, opts);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'unknown';
      if (i >= retries || !RETRYABLE.has(code)) throw e;
      log.warn(`request ${path} failed (${code}); retrying`);
    }
  }
}

// Fire-and-forget nudge to wake the (idle-spun-down) backend as early as
// possible — ideally while the rider is still logging in / typing an IMEI — so
// the lookup that follows hits a warm server instead of a cold start. Never
// throws: a failed warm-up just means the real request pays the cold start.
export function warmUp(): void {
  attempt('/health', { auth: false, timeoutMs: 60_000, retries: 0 }).catch(() => {});
}

export const api = {
  health(): Promise<{ ok: boolean }> {
    return request('/health', { auth: false });
  },

  getScooter(imei: string): Promise<Scooter> {
    return request(`/v1/scooters/${encodeURIComponent(imei)}`);
  },

  resolveVehicle(vehicleId: string): Promise<Scooter> {
    return request(`/v1/vehicles/${encodeURIComponent(vehicleId)}`);
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
