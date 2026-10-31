import axios from 'axios';
import type {
  AuthResponse,
  ChangePasswordPayload,
  LoginActivityItem,
  LoginCredentials,
  SignupCredentials,
  User,
} from '@/types/auth.types';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
  (typeof process !== 'undefined' && process.env?.VITE_API_BASE_URL) ||
  'http://localhost:3001';

export class AuthApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthApiError';
  }
}

function getAuthHeaders(token?: string) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const response = await axios.post<AuthResponse>(`${API_BASE_URL}/api/auth/login`, credentials, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data?.error) {
        throw new AuthApiError(error.response.data.error);
      }
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        throw new AuthApiError('Unable to connect to auth server. Please ensure backend is running.');
      }
      throw new AuthApiError((error as Error).message || 'Failed to sign in');
    }
  },

  async signup(credentials: SignupCredentials): Promise<AuthResponse> {
    try {
      const response = await axios.post<AuthResponse>(`${API_BASE_URL}/api/auth/signup`, credentials, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data?.error) {
        throw new AuthApiError(error.response.data.error);
      }
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        throw new AuthApiError('Unable to connect to auth server. Please ensure backend is running.');
      }
      throw new AuthApiError((error as Error).message || 'Failed to create account');
    }
  },

  async getMe(token: string): Promise<User> {
    try {
      const response = await axios.get<{ success: boolean; user: User }>(`${API_BASE_URL}/api/auth/me`, {
        headers: getAuthHeaders(token),
        timeout: 10000,
      });
      if (!response.data.success || !response.data.user) {
        throw new AuthApiError('Failed to fetch user profile');
      }
      return response.data.user;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data?.error) {
        throw new AuthApiError(error.response.data.error);
      }
      throw new AuthApiError((error as Error).message || 'Session verification failed');
    }
  },

  async logout(token?: string): Promise<void> {
    try {
      await axios.post(
        `${API_BASE_URL}/api/auth/logout`,
        {},
        {
          headers: getAuthHeaders(token),
          timeout: 5000,
        }
      );
    } catch {
      // Ignore network errors on logout
    }
  },

  async getLoginActivity(token?: string): Promise<LoginActivityItem[]> {
    try {
      const response = await axios.get<{ success: boolean; activities: LoginActivityItem[] }>(
        `${API_BASE_URL}/api/auth/activity`,
        {
          headers: getAuthHeaders(token),
          timeout: 10000,
        }
      );
      return response.data.activities || [];
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data?.error) {
        throw new AuthApiError(error.response.data.error);
      }
      return [];
    }
  },

  async changePassword(token: string, payload: ChangePasswordPayload): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await axios.post<{ success: boolean; message?: string; error?: string }>(
        `${API_BASE_URL}/api/auth/change-password`,
        payload,
        {
          headers: getAuthHeaders(token),
          timeout: 10000,
        }
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data?.error) {
        throw new AuthApiError(error.response.data.error);
      }
      throw new AuthApiError((error as Error).message || 'Failed to update password');
    }
  },

  async deleteAccount(token: string): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await axios.delete<{ success: boolean; message?: string; error?: string }>(
        `${API_BASE_URL}/api/auth/account`,
        {
          headers: getAuthHeaders(token),
          timeout: 10000,
        }
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data?.error) {
        throw new AuthApiError(error.response.data.error);
      }
      throw new AuthApiError((error as Error).message || 'Failed to permanently delete account');
    }
  },
};
