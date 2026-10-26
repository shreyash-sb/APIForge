export type UserRole = 'admin' | 'engineer' | 'viewer';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  passwordHash: string;
  salt: string;
  createdAt: string;
  updatedAt: string;
  failedLoginAttempts: number;
  lockoutUntil?: string;
}

export type SanitizedUser = Omit<User, 'passwordHash' | 'salt' | 'failedLoginAttempts' | 'lockoutUntil'>;

export type LoginStatus = 'SUCCESS' | 'FAILED_PASSWORD' | 'FAILED_NOT_FOUND' | 'LOCKED';

export interface LoginActivity {
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

export interface SignupRequest {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
}

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface AuthResponse {
  success: boolean;
  user?: SanitizedUser;
  token?: string;
  expiresIn?: string;
  message?: string;
  error?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}
