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

export function resolveJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const configuredSecret = env.JWT_SECRET?.trim();
  if (configuredSecret) {
    if (Buffer.byteLength(configuredSecret, 'utf8') < 32) {
      throw new Error('JWT_SECRET must contain at least 32 bytes.');
    }
    return configuredSecret;
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be configured when NODE_ENV=production.');
  }
  // Per-process random key keeps local development functional without a shared signing secret.
  // Sessions naturally expire on server restart unless the developer configures a private key.
  return crypto.randomBytes(64).toString('base64url');
}

const JWT_SECRET = resolveJwtSecret();
const MAX_FAILED_ATTEMPTS = 5; // per (email, client IP)
const ACCOUNT_MAX_FAILED_ATTEMPTS = 20; // account-wide, across all clients
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const MAX_THROTTLE_ENTRIES = 50_000;
const DUMMY_SALT = crypto.randomBytes(16).toString('hex');
const LOGIN_FAILED_MESSAGE = 'Invalid email or password.';
const LOGIN_LOCKED_MESSAGE = 'Too many failed sign-in attempts. Please wait 15 minutes and try again.';
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const EXTENDED_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (remember me)

export class AuthService {
  private users: Map<string, User> = new Map(); // key: userId
  private emailIndex: Map<string, string> = new Map(); // key: lowercase email -> userId
  private loginActivities: LoginActivity[] = [];
  /**
   * Revoked sessions as sha256(token) -> token expiry (epoch ms). Entries are pruned once
   * the token has expired (expired tokens are rejected anyway), so the list stays bounded
   * by the number of tokens revoked within the maximum token lifetime.
   */
  private revokedTokens: Map<string, number> = new Map();
  private lastRevocationPrune = 0;
  /** Failed sign-in tracking keyed by `${email}|${clientIp}` (insertion-ordered for eviction). */
  private loginThrottle: Map<string, { failures: number; firstFailureAt: number; blockedUntil?: number }> = new Map();

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
    this.revokedTokens.clear();
    this.loginThrottle.clear();
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

  public verifyToken(token: string): { valid: boolean; user?: SanitizedUser; error?: string; expiresAt?: number } {
    if (!token || typeof token !== 'string') {
      return { valid: false, error: 'Token missing' };
    }
    if (this.revokedTokens.has(this.tokenHash(token))) {
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

      return { valid: true, user: this.sanitizeUser(user), expiresAt: Number(payload.exp) };
    } catch {
      return { valid: false, error: 'Invalid token payload' };
    }
  }

  private tokenHash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /** Records a revocation until the token's own expiry, then forgets it. */
  private revokeToken(token: string): void {
    let expiresAt = Date.now() + EXTENDED_TOKEN_EXPIRY_MS;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf-8'));
      if (Number.isFinite(payload?.exp)) expiresAt = Math.min(Number(payload.exp), expiresAt);
    } catch {
      // Malformed tokens keep the maximum lifetime; they can never verify anyway.
    }
    this.revokedTokens.set(this.tokenHash(token), expiresAt);
    this.pruneRevokedTokens();
  }

  private pruneRevokedTokens(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastRevocationPrune < 60_000) return;
    this.lastRevocationPrune = now;
    for (const [hash, expiresAt] of this.revokedTokens) {
      if (expiresAt <= now) this.revokedTokens.delete(hash);
    }
  }

  /** Number of tracked revocations (diagnostics/tests). */
  public revokedTokenCount(): number {
    this.pruneRevokedTokens(true);
    return this.revokedTokens.size;
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
      // Public signup must not accept client-selected privileged roles.
      role: 'engineer',
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

  /**
   * Sign-in with enumeration- and lockout-abuse-resistant behaviour:
   *  - known and unknown emails get identical messages (and comparable timing);
   *  - failures are throttled per (email, client IP): 5 failures block that IP for 15 min,
   *    so an attacker cannot lock a victim out from the victim's own network;
   *  - an account-wide limit still stops distributed guessing.
   */
  public login(data: LoginRequest, ip: string, userAgent: string): AuthResponse {
    const email = (data.email || '').trim().toLowerCase();
    const password = data.password || '';
    const deviceType = this.parseDeviceType(userAgent);
    const clientIp = ip || '127.0.0.1';

    if (!email || !password) {
      return { success: false, error: 'Email and password are required' };
    }

    const throttleKey = `${email}|${clientIp}`;
    const userId = this.emailIndex.get(email);
    const user = userId ? this.users.get(userId) : undefined;
    const record = (status: LoginActivity['status'], failureReason?: string) =>
      this.recordActivity({ userId: user?.id, userEmail: email, ip: clientIp, userAgent: userAgent || 'Unknown', status, failureReason, deviceType });

    if (this.isThrottled(throttleKey) || this.isAccountLocked(user)) {
      record('LOCKED', 'Sign-in temporarily blocked after repeated failures.');
      return { success: false, locked: true, error: LOGIN_LOCKED_MESSAGE };
    }

    // Always run the password hash so response time does not reveal whether the email exists.
    const passwordValid = user
      ? this.verifyPassword(password, user.salt, user.passwordHash)
      : (this.verifyPassword(password, DUMMY_SALT, this.dummyHash()), false);

    if (!user || !passwordValid) {
      const nowBlocked = this.registerFailure(throttleKey);
      if (user) {
        user.failedLoginAttempts += 1;
        if (user.failedLoginAttempts >= ACCOUNT_MAX_FAILED_ATTEMPTS) {
          user.lockoutUntil = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString();
        }
      }
      const locked = nowBlocked || this.isAccountLocked(user);
      record(locked ? 'LOCKED' : user ? 'FAILED_PASSWORD' : 'FAILED_NOT_FOUND', user ? 'Incorrect password' : 'No user registered with this email');
      return locked
        ? { success: false, locked: true, error: LOGIN_LOCKED_MESSAGE }
        : { success: false, error: LOGIN_FAILED_MESSAGE };
    }

    // Success: reset this client's throttle and the account-wide counter.
    this.loginThrottle.delete(throttleKey);
    user.failedLoginAttempts = 0;
    user.lockoutUntil = undefined;
    user.updatedAt = new Date().toISOString();

    const sanitized = this.sanitizeUser(user);
    const { token, expiresIn } = this.createToken(sanitized, data.rememberMe);
    record('SUCCESS');

    return {
      success: true,
      user: sanitized,
      token,
      expiresIn,
      message: 'Signed in successfully',
    };
  }

  private isAccountLocked(user: User | undefined): boolean {
    if (!user?.lockoutUntil) return false;
    if (Date.now() < new Date(user.lockoutUntil).getTime()) return true;
    user.lockoutUntil = undefined;
    user.failedLoginAttempts = 0;
    return false;
  }

  private isThrottled(key: string): boolean {
    const entry = this.loginThrottle.get(key);
    if (!entry) return false;
    const now = Date.now();
    if (entry.blockedUntil && entry.blockedUntil > now) return true;
    if (entry.blockedUntil || now - entry.firstFailureAt > LOCKOUT_DURATION_MS) this.loginThrottle.delete(key);
    return false;
  }

  /** Records a failure for (email, IP); returns true when this failure triggers a block. */
  private registerFailure(key: string): boolean {
    const now = Date.now();
    const entry = this.loginThrottle.get(key);
    const current = entry && now - entry.firstFailureAt <= LOCKOUT_DURATION_MS ? entry : { failures: 0, firstFailureAt: now };
    current.failures += 1;
    if (current.failures >= MAX_FAILED_ATTEMPTS) current.blockedUntil = now + LOCKOUT_DURATION_MS;
    this.loginThrottle.delete(key);
    this.loginThrottle.set(key, current);
    // Bound memory: drop the oldest entries if an attacker sprays many emails.
    while (this.loginThrottle.size > MAX_THROTTLE_ENTRIES) {
      const oldest = this.loginThrottle.keys().next().value;
      if (oldest === undefined) break;
      this.loginThrottle.delete(oldest);
    }
    return Boolean(current.blockedUntil);
  }

  private dummyPasswordHash?: string;
  private dummyHash(): string {
    this.dummyPasswordHash ??= this.hashPassword(crypto.randomBytes(16).toString('hex'), DUMMY_SALT);
    return this.dummyPasswordHash;
  }

  public logout(token: string): { success: boolean; message: string } {
    if (token) {
      this.revokeToken(token);
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
      this.revokeToken(token);
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

    // 5. Purge user collections
    try {
      const { collectionService } = await import('./collection.service.js');
      await collectionService.deleteUserCollections(userId);
    } catch {
      // Ignore cleanup error
    }

    return {
      success: true,
      message: 'Account permanently deleted successfully',
    };
  }
}

export const authService = new AuthService();
