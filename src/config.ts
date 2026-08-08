import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_PORT = 4000;

function metroHost(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).expoGoConfig?.debuggerHost ||
    (Constants as any).manifest2?.extra?.expoClient?.hostUri;
  if (typeof hostUri === 'string' && hostUri.length > 0) {
    return hostUri.split(':')[0];
  }
  return null;
}

function defaultBaseUrl(): string {
  const extra = (Constants.expoConfig?.extra ?? {}) as { apiBaseUrl?: unknown };
  if (typeof extra.apiBaseUrl === 'string' && extra.apiBaseUrl.length > 0) {
    return extra.apiBaseUrl;
  }

  const host = metroHost();
  if (host) return `http://${host}:${API_PORT}`;

  if (Platform.OS === 'android') return `http://10.0.2.2:${API_PORT}`;
  return `http://localhost:${API_PORT}`;
}

export const API_BASE_URL = defaultBaseUrl();
