import { create } from 'zustand';

interface AuthState {
  token: string | null;
  email: string | null;
  isAuthenticated: boolean;
  login: (email: string) => Promise<void>;
  logout: () => void;
}

// Signin is removed for testing: the app boots already authenticated with a
// dev token. The backend ignores the token, but the API client still sends it.
const DEV_TOKEN = 'dev-token';

export const useAuthStore = create<AuthState>((set) => ({
  token: DEV_TOKEN,
  email: 'rider@example.com',
  isAuthenticated: true,

  async login(email: string) {
    set({ token: DEV_TOKEN, email, isAuthenticated: true });
  },

  logout() {
    // No signin flow to return to; keep the session so we never show Login.
    set({ token: DEV_TOKEN, isAuthenticated: true });
  },
}));
