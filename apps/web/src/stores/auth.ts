import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/lib/api';

interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, name: string) => Promise<boolean>;
  logout: () => void;
  loadUser: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isLoading: true,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const { token, user } = await api.login(email, password);
          api.setToken(token);
          set({ token, user, isLoading: false });
          return true;
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Login failed';
          set({ error: message, isLoading: false });
          return false;
        }
      },

      register: async (email: string, password: string, name: string) => {
        set({ isLoading: true, error: null });
        try {
          const { token, user } = await api.register(email, password, name);
          api.setToken(token);
          set({ token, user, isLoading: false });
          return true;
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Registration failed';
          set({ error: message, isLoading: false });
          return false;
        }
      },

      logout: () => {
        api.setToken(null);
        set({ token: null, user: null, isLoading: false, error: null });
      },

      loadUser: async () => {
        const { token } = get();
        if (!token) {
          set({ isLoading: false });
          return;
        }

        api.setToken(token);
        try {
          const { user } = await api.getMe();
          set({ user, isLoading: false });
        } catch {
          set({ token: null, user: null, isLoading: false });
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token }),
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          api.setToken(state.token);
          state.loadUser();
        } else {
          state?.loadUser();
        }
      },
    }
  )
);
