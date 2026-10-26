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
