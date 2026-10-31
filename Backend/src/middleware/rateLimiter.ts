import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request, Response } from 'express';

export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15-minute window
  max: 100, // Limit each IP/user to 100 requests per windowMs
  standardHeaders: true, // Return standard `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  keyGenerator: (req: Request): string => {
    // Rate limit per authenticated user if available, otherwise fallback to normalized IP
    const user = (req as Request & { user?: { id?: string } }).user;
    if (user?.id) return user.id;
    return ipKeyGenerator(req.ip || req.socket.remoteAddress || '127.0.0.1');
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests generated. Please wait 15 minutes before retrying.',
      },
    });
  },
});

/** Keys AI limits by the authenticated user (set by requireAuth), falling back to the client IP. */
const aiUserKey = (req: Request, res: Response): string => {
  const userId = (res.locals as { authUser?: { id?: string } }).authUser?.id;
  return userId ? `user:${userId}` : ipKeyGenerator(req.ip || req.socket.remoteAddress || '127.0.0.1');
};

const aiLimitHandler = (message: string) => (_req: Request, res: Response) => {
  res.status(429).json({ error: { code: 'AI_RATE_LIMIT_EXCEEDED', message } });
};

/** Per-user cap on AI assistant/diagnosis calls so one account cannot exhaust the backend or its own key. */
export const aiRequestRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: aiUserKey,
  handler: aiLimitHandler('Too many AI requests. Please wait a minute before retrying.'),
});

/** Tighter cap on saving/testing Gemini keys (each test makes an outbound Google request). */
export const aiKeyRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: aiUserKey,
  handler: aiLimitHandler('Too many Gemini key changes or tests. Please wait before trying again.'),
});

const envLimit = (name: string, fallback: number): number => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

const authLimitHandler = (message: string) => (_req: Request, res: Response) => {
  res.status(429).json({ success: false, error: message });
};

/**
 * Per-IP cap on sign-in attempts. Complements the per-(email, IP) lockout in AuthService:
 * stops one client from spraying passwords across many accounts.
 */
export const authLoginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: envLimit('AUTH_LOGIN_RATE_LIMIT', 30),
  standardHeaders: true,
  legacyHeaders: false,
  handler: authLimitHandler('Too many sign-in attempts from this network. Please wait 15 minutes and try again.'),
});

/** Per-IP cap on account creation to slow automated sign-ups. */
export const authSignupRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: envLimit('AUTH_SIGNUP_RATE_LIMIT', 20),
  standardHeaders: true,
  legacyHeaders: false,
  handler: authLimitHandler('Too many accounts created from this network. Please try again later.'),
});
