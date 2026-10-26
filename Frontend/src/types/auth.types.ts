export type UserRole = 'admin' | 'engineer' | 'viewer';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt?: string;
  updatedAt?: string;
}

export type LoginStatus = 'SUCCESS' | 'FAILED_PASSWORD' | 'FAILED_NOT_FOUND' | 'LOCKED';

export interface LoginActivityItem {
  id: string;
  userId?: string;
  userEmail: string;
  timestamp: string;
  ip: string;
  userAgent: string;
  status: LoginStatus;
  failureReason?: string;
  deviceType: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface SignupCredentials {
  name: string;
  email: string;
  password: string;
  confirmPassword?: string;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  token?: string;
  expiresIn?: string;
  message?: string;
  error?: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}
