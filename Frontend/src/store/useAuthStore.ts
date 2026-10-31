import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LoginActivityItem, User } from '@/types/auth.types';
import { authService } from '@/services/authService';
import { useAppStore } from './useAppStore';
import { SESSION_EXPIRED_EVENT } from '@/services/authAxios';

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
          useAppStore.getState().clearUserWorkspace();
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
            // Wipe browser-stored workspace data that belongs to a different account.
            useAppStore.getState().claimWorkspace(res.user.id);
            useAppStore.getState().setDisplayName(res.user.name);
            void useAppStore.getState().loadCollections();
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
            // Wipe browser-stored workspace data that belongs to a different account.
            useAppStore.getState().claimWorkspace(res.user.id);
            useAppStore.getState().setDisplayName(res.user.name);
            void useAppStore.getState().loadCollections();
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
          loginActivity: [],
        });
        // Signing out removes this account's specs, tests, results, environments, and history
        // from the browser so the next person on this machine cannot see them.
        useAppStore.getState().clearUserWorkspace();
      },

      checkSession: async () => {
        const { token } = get();
        if (!token) {
          set({ isAuthenticated: false, user: null });
          return false;
        }
        try {
          const user = await authService.getMe(token);
          useAppStore.getState().claimWorkspace(user.id);
          set({ user, isAuthenticated: true });
          useAppStore.getState().setDisplayName(user.name);
          void useAppStore.getState().loadCollections();
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

// A 401 from APIForge's backend means the stored session is no longer valid (expired,
// revoked, or the server restarted). Clear it so routing returns to Sign in with a clear
// message instead of leaving the UI looking signed in while every request fails.
if (typeof window !== 'undefined') {
  window.addEventListener(SESSION_EXPIRED_EVENT, () => {
    if (!useAuthStore.getState().token) return;
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: 'Your session has expired. Please sign in again.',
      loginActivity: [],
    });
    // Workspace data is kept for the same user signing back in; claimWorkspace() wipes it
    // if a different account signs in next.
    useAppStore.getState().setCollections([]);
  });
}
