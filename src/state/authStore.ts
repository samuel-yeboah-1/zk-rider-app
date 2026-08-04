import { create } from 'zustand';

interface AuthState {
  token: string | null;
  email: string | null;
  isAuthenticated: boolean;
  login: (email: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  email: null,
  isAuthenticated: false,

  async login(email: string) {
    await new Promise((r) => setTimeout(r, 300));
    const fakeToken = `dev-token-${email}`;
    set({ token: fakeToken, email, isAuthenticated: true });
  },

  logout() {
    set({ token: null, email: null, isAuthenticated: false });
  },
}));
