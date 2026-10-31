import type { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service.js';
import { sessionIdForToken, type AuthSession } from '../services/aiCredentialStore.service.js';

/** Enforces an existing APIForge bearer session at the backend boundary. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authorization = req.headers.authorization;
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  const result = authService.verifyToken(token);
  if (!result.valid || !result.user) {
    res.status(401).json({ success: false, error: result.error || 'Invalid session' });
    return;
  }

  res.locals.authUser = result.user;
  // Opaque per-login identity for session-scoped secrets; the raw token is never stored.
  const authSession: AuthSession = {
    id: sessionIdForToken(token),
    userId: result.user.id,
    expiresAt: result.expiresAt ?? Date.now(),
  };
  res.locals.authSession = authSession;
  next();
}
