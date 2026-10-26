import type { Request, Response } from 'express';
import { authService } from '../services/auth.service.js';

export class AuthController {
  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.socket?.remoteAddress || req.ip || '127.0.0.1';
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
        const isLocked = result.error?.includes('locked');
        res.status(isLocked ? 429 : 401).json(result);
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
      let userId: string | undefined;

      if (token) {
        const verified = authService.verifyToken(token);
        if (verified.valid && verified.user) {
          userId = verified.user.id;
        }
      }

      const activities = authService.getLoginActivity(userId);
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
