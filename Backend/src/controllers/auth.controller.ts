import type { Request, Response } from 'express';
import { authService } from '../services/auth.service.js';
import { aiCredentialStore } from '../services/aiCredentialStore.service.js';

export class AuthController {
  /**
   * Client IP for auditing and sign-in throttling. Uses Express's req.ip, which only
   * honours X-Forwarded-For when TRUST_PROXY is configured; a raw header would let any
   * client choose its own IP and dodge per-IP limits.
   */
  private getClientIp(req: Request): string {
    return req.ip || req.socket?.remoteAddress || '127.0.0.1';
  }

  private getUserAgent(req: Request): string {
    return (req.headers['user-agent'] as string) || 'Unknown Browser';
  }

  private extractBearerToken(req: Request): string | undefined {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return undefined;
    }
    return header.slice(7).trim();
  }

  public signUp(req: Request, res: Response): void {
    try {
      const ip = this.getClientIp(req);
      const userAgent = this.getUserAgent(req);
      const result = authService.signUp(req.body, ip, userAgent);

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.status(201).json(result);
    } catch (error) {
      console.error('Error during sign up:', error);
      res.status(500).json({ success: false, error: 'Internal server error during account creation' });
    }
  }

  public login(req: Request, res: Response): void {
    try {
      const ip = this.getClientIp(req);
      const userAgent = this.getUserAgent(req);
      const result = authService.login(req.body, ip, userAgent);

      if (!result.success) {
        res.status(result.locked ? 429 : 401).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      console.error('Error during login:', error);
      res.status(500).json({ success: false, error: 'Internal server error during authentication' });
    }
  }

  public me(req: Request, res: Response): void {
    try {
      const token = this.extractBearerToken(req);
      if (!token) {
        res.status(401).json({ success: false, error: 'Authentication token required' });
        return;
      }

      const verified = authService.verifyToken(token);
      if (!verified.valid || !verified.user) {
        res.status(401).json({ success: false, error: verified.error || 'Invalid session' });
        return;
      }

      res.status(200).json({ success: true, user: verified.user });
    } catch (error) {
      console.error('Error checking current session:', error);
      res.status(500).json({ success: false, error: 'Failed to verify session' });
    }
  }

  public logout(req: Request, res: Response): void {
    try {
      const token = this.extractBearerToken(req);
      if (token) {
        authService.logout(token);
        // Session-only AI keys end with the session.
        aiCredentialStore.removeByToken(token);
      }
      res.status(200).json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      console.error('Error during logout:', error);
      res.status(500).json({ success: false, error: 'Failed to process logout' });
    }
  }

  public getActivity(req: Request, res: Response): void {
    try {
      const token = this.extractBearerToken(req);
      if (!token) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const verified = authService.verifyToken(token);
      if (!verified.valid || !verified.user) {
        res.status(401).json({ success: false, error: verified.error || 'Invalid session' });
        return;
      }

      const activities = authService.getLoginActivity(verified.user.id);
      res.status(200).json({ success: true, activities });
    } catch (error) {
      console.error('Error fetching login activity:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch login activity' });
    }
  }

  public changePassword(req: Request, res: Response): void {
    try {
      const token = this.extractBearerToken(req);
      if (!token) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const verified = authService.verifyToken(token);
      if (!verified.valid || !verified.user) {
        res.status(401).json({ success: false, error: verified.error || 'Invalid session' });
        return;
      }

      const result = authService.changePassword(verified.user.id, req.body);
      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      console.error('Error updating password:', error);
      res.status(500).json({ success: false, error: 'Failed to update password' });
    }
  }

  public async deleteAccount(req: Request, res: Response): Promise<void> {
    try {
      const token = this.extractBearerToken(req);
      if (!token) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const verified = authService.verifyToken(token);
      if (!verified.valid || !verified.user) {
        res.status(401).json({ success: false, error: verified.error || 'Invalid session' });
        return;
      }

      const result = await authService.deleteAccount(verified.user.id, token);
      if (result.success) aiCredentialStore.removeUser(verified.user.id);
      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      console.error('Error deleting account:', error);
      res.status(500).json({ success: false, error: 'Internal error during account deletion' });
    }
  }
}
