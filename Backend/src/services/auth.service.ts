import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { UserModel, LoginActivityModel } from '../models/user.mongo.js';
import type {
  AuthResponse,
  ChangePasswordRequest,
  LoginActivity,
  LoginRequest,
  SanitizedUser,
  SignupRequest,
  User,
  UserRole,
} from '../types/auth.types.js';

const JWT_SECRET = process.env.JWT_SECRET || 'apiforge-cryptographic-secure-jwt-secret-key-2026';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const EXTENDED_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (remember me)

export class AuthService {
  private users: Map<string, User> = new Map(); // key: userId
  private emailIndex: Map<string, string> = new Map(); // key: lowercase email -> userId
  private loginActivities: LoginActivity[] = [];
  private invalidatedTokens: Set<string> = new Set();

  constructor() {
    // Zero hardcoded demo accounts - user creates and owns their account
  }

  /**
   * Reset store to initial state (for testing isolation)
   */
  public reset(): void {
    this.users.clear();
    this.emailIndex.clear();
    this.loginActivities = [];
    this.invalidatedTokens.clear();
  }

  /**
   * Rehydrate registered users from MongoDB on server startup
   */
  public async hydrateFromMongo(): Promise<void> {
    if (mongoose.connection.readyState === 1) {
      try {
        const docs = await UserModel.find({});
        for (const doc of docs) {
          const userRole = (['admin', 'engineer', 'viewer'].includes(doc.role) ? doc.role : 'engineer') as UserRole;
          const userObj: User = {
            id: doc.id,
            name: doc.name,
            email: doc.email,
            role: userRole,
            passwordHash: doc.passwordHash,
            salt: doc.salt,
            failedLoginAttempts: doc.failedLoginAttempts || 0,
            lockoutUntil: doc.lockoutUntil,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
          };
          this.users.set(userObj.id, userObj);
          this.emailIndex.set(userObj.email.toLowerCase(), userObj.id);
        }
        if (docs.length > 0) {
          console.log(`👤 Hydrated ${docs.length} user(s) from MongoDB`);
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.warn('⚠️ Could not hydrate users from MongoDB:', errorMsg);
      }
    }
  }

  public validatePasswordStrength(password: string): { valid: boolean; reason?: string } {
    if (!password || typeof password !== 'string') {
      return { valid: false, reason: 'Password is required' };
    }
    if (password.length < 8) {
      return { valid: false, reason: 'Password must be at least 8 characters long' };
    }
    if (!/[A-Z]/.test(password)) {
      return { valid: false, reason: 'Password must contain at least one uppercase letter' };
    }
    if (!/[a-z]/.test(password)) {
      return { valid: false, reason: 'Password must contain at least one lowercase letter' };
    }
    if (!/[0-9]/.test(password)) {
      return { valid: false, reason: 'Password must contain at least one number' };
    }
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
      return { valid: false, reason: 'Password must contain at least one special character' };
    }
    return { valid: true };
  }

  private hashPassword(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  }

  private verifyPassword(password: string, salt: string, storedHash: string): boolean {
    const calculatedHash = this.hashPassword(password, salt);
    const bufA = Buffer.from(calculatedHash, 'hex');
    const bufB = Buffer.from(storedHash, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  private parseDeviceType(userAgent: string): string {
    const ua = (userAgent || '').toLowerCase();
    if (ua.includes('postman') || ua.includes('insomnia') || ua.includes('curl') || ua.includes('axios')) {
      return 'API Client / CLI';
    }
    if (ua.includes('mobile') || ua.includes('iphone') || ua.includes('android')) {
      return 'Mobile Browser';
    }
    if (ua.includes('macintosh') || ua.includes('mac os')) {
      return 'Desktop (macOS)';
    }
    if (ua.includes('windows')) {
      return 'Desktop (Windows)';
    }
    if (ua.includes('linux')) {
      return 'Desktop (Linux)';
    }
    return 'Web Browser';
  }

  private createToken(user: SanitizedUser, rememberMe?: boolean): { token: string; expiresIn: string } {
    const now = Date.now();
    const duration = rememberMe ? EXTENDED_TOKEN_EXPIRY_MS : TOKEN_EXPIRY_MS;
    const expiresAt = now + duration;

    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      iat: now,
      exp: expiresAt,
      jti: crypto.randomBytes(16).toString('hex'),
    };

    const header = { alg: 'HS256', typ: 'JWT' };
    const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
    const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');

    const signature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${b64Header}.${b64Payload}`)
      .digest('base64url');

    const token = `${b64Header}.${b64Payload}.${signature}`;
    return { token, expiresIn: rememberMe ? '7d' : '24h' };
  }

  public verifyToken(token: string): { valid: boolean; user?: SanitizedUser; error?: string } {
    if (!token || typeof token !== 'string') {
      return { valid: false, error: 'Token missing' };
    }
    if (this.invalidatedTokens.has(token)) {
      return { valid: false, error: 'Token has been revoked or logged out' };
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Malformed token structure' };
    }

    const [b64Header, b64Payload, signature] = parts;
    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${b64Header}.${b64Payload}`)
      .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSig);

    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return { valid: false, error: 'Invalid token signature' };
    }

    try {
      const payload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf-8'));
      if (Date.now() > payload.exp) {
        return { valid: false, error: 'Token expired' };
      }

      const user = this.users.get(payload.sub);
      if (!user) {
        return { valid: false, error: 'User no longer exists' };
      }

      return { valid: true, user: this.sanitizeUser(user) };
    } catch {
      return { valid: false, error: 'Invalid token payload' };
    }
  }

  private sanitizeUser(user: User): SanitizedUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private recordActivity(activity: Omit<LoginActivity, 'id' | 'timestamp'>): LoginActivity {
    const record: LoginActivity = {
      ...activity,
      id: `act_${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
    };
    this.loginActivities.unshift(record);
    // Boundary size: retain up to 300 recent entries
    if (this.loginActivities.length > 300) {
      this.loginActivities = this.loginActivities.slice(0, 300);
    }
    if (mongoose.connection.readyState === 1) {
      LoginActivityModel.create(record).catch(() => {});
    }
    return record;
  }

  public signUp(data: SignupRequest, ip: string, userAgent: string): AuthResponse {
    const name = (data.name || '').trim();
    const email = (data.email || '').trim().toLowerCase();
    const password = data.password || '';

    if (!name) {
      return { success: false, error: 'Full name is required' };
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { success: false, error: 'A valid email address is required' };
    }

    if (this.emailIndex.has(email)) {
      return { success: false, error: 'An account with this email already exists' };
    }

    const passCheck = this.validatePasswordStrength(password);
    if (!passCheck.valid) {
      return { success: false, error: passCheck.reason };
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = this.hashPassword(password, salt);
    const now = new Date().toISOString();

    const newUser: User = {
      id: `usr_${crypto.randomUUID().slice(0, 8)}`,
      name,
      email,
      role: data.role || 'engineer',
      passwordHash,
      salt,
      createdAt: now,
      updatedAt: now,
      failedLoginAttempts: 0,
    };

    this.users.set(newUser.id, newUser);
    this.emailIndex.set(email, newUser.id);

    if (mongoose.connection.readyState === 1) {
      UserModel.create(newUser).catch(() => {});
    }

    const sanitized = this.sanitizeUser(newUser);
    const { token, expiresIn } = this.createToken(sanitized);

    this.recordActivity({
      userId: newUser.id,
      userEmail: email,
      ip: ip || '127.0.0.1',
      userAgent: userAgent || 'Unknown',
      status: 'SUCCESS',
      deviceType: this.parseDeviceType(userAgent),
    });

    return {
      success: true,
      user: sanitized,
      token,
      expiresIn,
      message: 'Account created successfully',
    };
  }

  public login(data: LoginRequest, ip: string, userAgent: string): AuthResponse {
    const email = (data.email || '').trim().toLowerCase();
    const password = data.password || '';
    const deviceType = this.parseDeviceType(userAgent);

    if (!email || !password) {
      return { success: false, error: 'Email and password are required' };
    }

    const userId = this.emailIndex.get(email);
    if (!userId) {
      this.recordActivity({
        userEmail: email,
        ip: ip || '127.0.0.1',
        userAgent: userAgent || 'Unknown',
        status: 'FAILED_NOT_FOUND',
        failureReason: 'No user registered with this email',
        deviceType,
      });
      return { success: false, error: 'Invalid email or password' };
    }

    const user = this.users.get(userId)!;

    // Check account lockout
    if (user.lockoutUntil) {
      const lockExpiry = new Date(user.lockoutUntil).getTime();
      if (Date.now() < lockExpiry) {
        const minutesLeft = Math.ceil((lockExpiry - Date.now()) / (60 * 1000));
        this.recordActivity({
          userId: user.id,
          userEmail: email,
          ip: ip || '127.0.0.1',
          userAgent: userAgent || 'Unknown',
          status: 'LOCKED',
          failureReason: `Account temporarily locked. Retry in ${minutesLeft}m.`,
          deviceType,
        });
        return {
          success: false,
          error: `Too many failed login attempts. Account temporarily locked for ${minutesLeft} more minute(s).`,
        };
      } else {
        // Lockout expired, reset counter
        user.lockoutUntil = undefined;
        user.failedLoginAttempts = 0;
      }
    }

    const passwordValid = this.verifyPassword(password, user.salt, user.passwordHash);

    if (!passwordValid) {
      user.failedLoginAttempts += 1;
      let failureReason = 'Incorrect password';

      if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        user.lockoutUntil = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString();
        failureReason = `Maximum attempts reached (${MAX_FAILED_ATTEMPTS}). Locked for 15 minutes.`;
      }

      this.recordActivity({
        userId: user.id,
        userEmail: email,
        ip: ip || '127.0.0.1',
        userAgent: userAgent || 'Unknown',
        status: user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS ? 'LOCKED' : 'FAILED_PASSWORD',
        failureReason,
        deviceType,
      });

      if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        return {
          success: false,
          error: 'Maximum failed login attempts exceeded. Account is locked for 15 minutes for your security.',
        };
      }

      const remaining = MAX_FAILED_ATTEMPTS - user.failedLoginAttempts;
      return {
        success: false,
        error: `Invalid email or password. (${remaining} attempt(s) remaining before lockout)`,
      };
    }

    // Success: reset attempts
    user.failedLoginAttempts = 0;
    user.lockoutUntil = undefined;
    user.updatedAt = new Date().toISOString();

    const sanitized = this.sanitizeUser(user);
    const { token, expiresIn } = this.createToken(sanitized, data.rememberMe);

    this.recordActivity({
      userId: user.id,
      userEmail: email,
      ip: ip || '127.0.0.1',
      userAgent: userAgent || 'Unknown',
      status: 'SUCCESS',
      deviceType,
    });

    return {
      success: true,
      user: sanitized,
      token,
      expiresIn,
      message: 'Signed in successfully',
    };
  }

  public logout(token: string): { success: boolean; message: string } {
    if (token) {
      this.invalidatedTokens.add(token);
    }
    return { success: true, message: 'Logged out successfully' };
  }

  public getLoginActivity(userId?: string): LoginActivity[] {
    if (!userId) {
      return this.loginActivities.slice(0, 50);
    }
    return this.loginActivities.filter((a) => a.userId === userId).slice(0, 50);
  }

  public changePassword(userId: string, data: ChangePasswordRequest): { success: boolean; error?: string; message?: string } {
    const user = this.users.get(userId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    if (!this.verifyPassword(data.currentPassword, user.salt, user.passwordHash)) {
      return { success: false, error: 'Current password is incorrect' };
    }

    const check = this.validatePasswordStrength(data.newPassword);
    if (!check.valid) {
      return { success: false, error: check.reason };
    }

    const newSalt = crypto.randomBytes(16).toString('hex');
    user.salt = newSalt;
    user.passwordHash = this.hashPassword(data.newPassword, newSalt);
    user.updatedAt = new Date().toISOString();

    if (mongoose.connection.readyState === 1) {
      UserModel.updateOne(
        { id: user.id },
        { passwordHash: user.passwordHash, salt: user.salt, updatedAt: user.updatedAt }
      ).catch(() => {});
    }

    return { success: true, message: 'Password updated successfully' };
  }

  public getUserById(userId: string): SanitizedUser | undefined {
    const user = this.users.get(userId);
    return user ? this.sanitizeUser(user) : undefined;
  }

  /**
   * Permanently delete a user account and invalidate active sessions.
   */
  public async deleteAccount(userId: string, token?: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const user = this.users.get(userId);
    if (!user) {
      return { success: false, error: 'User account not found' };
    }

    // 1. Invalidate active token if provided
    if (token) {
      this.invalidatedTokens.add(token);
    }

    // 2. Remove user from index and storage
    this.emailIndex.delete(user.email.toLowerCase());
    this.users.delete(userId);

    // 3. Clear user login activity logs
    this.loginActivities = this.loginActivities.filter((act) => act.userId !== userId);

    // 4. Purge from MongoDB if connected
    if (mongoose.connection.readyState === 1) {
      await Promise.all([
        UserModel.deleteOne({ id: userId }).catch(() => {}),
        LoginActivityModel.deleteMany({ userId }).catch(() => {}),
      ]);
    }

    return {
      success: true,
      message: 'Account permanently deleted successfully',
    };
  }
}

export const authService = new AuthService();
