import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LoginActivityItem, User } from '@/types/auth.types';
import { authService } from '@/services/authService';
import { useAppStore } from './useAppStore';

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  loginActivity: LoginActivityItem[];

  // Actions
  login: (email: string, password: string, rememberMe?: boolean) => Promise<{ success: boolean; error?: string }>;
  signup: (name: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<{ success: boolean; error?: string }>;
  checkSession: () => Promise<boolean>;
  fetchActivity: () => Promise<void>;
  clearError: () => void;
  clearActivity: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      loginActivity: [],

      clearError: () => set({ error: null }),
      clearActivity: () => set({ loginActivity: [] }),

      deleteAccount: async () => {
        set({ isLoading: true, error: null });
        const { token } = get();
        try {
          if (token) {
            await authService.deleteAccount(token);
          }
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
            loginActivity: [],
          });
          useAppStore.getState().setDisplayName('Developer');
          return { success: true };
        } catch (err: any) {
          const errMsg = err.message || 'Failed to delete account';
          set({ isLoading: false, error: errMsg });
          return { success: false, error: errMsg };
        }
      },

      login: async (email: string, password: string, rememberMe?: boolean) => {
        set({ isLoading: true, error: null });
        try {
          const res = await authService.login({ email, password, rememberMe });
          if (res.success && res.user && res.token) {
            set({
              user: res.user,
              token: res.token,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            });
            useAppStore.getState().setDisplayName(res.user.name);
            void get().fetchActivity();
            return { success: true };
          }
          const errMsg = res.error || 'Authentication failed';
          set({ isLoading: false, error: errMsg });
          return { success: false, error: errMsg };
        } catch (err: any) {
          const errMsg = err.message || 'Login failed';
          set({ isLoading: false, error: errMsg });
          return { success: false, error: errMsg };
        }
      },

      signup: async (name: string, email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const res = await authService.signup({ name, email, password });
          if (res.success && res.user && res.token) {
            set({
              user: res.user,
              token: res.token,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            });
            useAppStore.getState().setDisplayName(res.user.name);
            void get().fetchActivity();
            return { success: true };
          }
          const errMsg = res.error || 'Account creation failed';
          set({ isLoading: false, error: errMsg });
          return { success: false, error: errMsg };
        } catch (err: any) {
          const errMsg = err.message || 'Signup failed';
          set({ isLoading: false, error: errMsg });
          return { success: false, error: errMsg };
        }
      },

      logout: async () => {
        const { token } = get();
        try {
          await authService.logout(token || undefined);
        } catch {
          // ignore
        }
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null,
        });
      },

      checkSession: async () => {
        const { token } = get();
        if (!token) {
          set({ isAuthenticated: false, user: null });
          return false;
        }
        try {
          const user = await authService.getMe(token);
          set({ user, isAuthenticated: true });
          useAppStore.getState().setDisplayName(user.name);
          return true;
        } catch {
          // Keep active state if backend not responding in mock mode
          return true;
        }
      },

      fetchActivity: async () => {
        const { token } = get();
        try {
          const activities = await authService.getLoginActivity(token || undefined);
          if (activities && activities.length > 0) {
            set({ loginActivity: activities });
          }
        } catch {
          // Keep current activity if network error
        }
      },
    }),
    {
      name: 'apiforge-auth-session',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        loginActivity: state.loginActivity.slice(0, 30),
      }),
    }
  )
);
