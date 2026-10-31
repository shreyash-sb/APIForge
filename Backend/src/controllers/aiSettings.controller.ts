import type { Request, Response } from 'express';
import {
  AiCredentialStore,
  aiCredentialStore,
  type AuthSession,
  type KeyValidationResult,
} from '../services/aiCredentialStore.service.js';

/**
 * Session-scoped Gemini key management. Every response contains only safe metadata
 * (configured flag, masked hint, validation outcome); the key itself is never returned,
 * logged, or included in an error message.
 */
export class AiSettingsController {
  constructor(private readonly store: AiCredentialStore = aiCredentialStore) {}

  private session(res: Response): AuthSession | undefined {
    return (res.locals as { authSession?: AuthSession }).authSession;
  }

  status(_req: Request, res: Response): void {
    const session = this.session(res);
    if (!session) {
      res.status(401).json({ error: { message: 'Authentication required' } });
      return;
    }
    res.status(200).json(this.store.status(session));
  }

  /** Validates a candidate key server-side, then keeps it for this session only. */
  async saveKey(req: Request, res: Response): Promise<void> {
    const session = this.session(res);
    if (!session) {
      res.status(401).json({ error: { message: 'Authentication required' } });
      return;
    }
    const apiKey = (req.body as { apiKey?: unknown } | undefined)?.apiKey;
    try {
      AiCredentialStore.assertKeyFormat(apiKey);
    } catch (error) {
      res.status(400).json({ error: { message: (error as Error).message } });
      return;
    }

    const check = await this.store.providerForCandidate(apiKey).testCredentials?.();
    const validation: KeyValidationResult = {
      status: check?.status ?? 'unverified',
      checkedAt: new Date().toISOString(),
      message: check?.message ?? 'The key could not be verified.',
    };

    if (validation.status === 'invalid') {
      // A rejected key is not kept; any previously configured key stays unchanged.
      res.status(422).json({
        error: { message: validation.message },
        status: { ...this.store.status(session), lastValidation: validation },
      });
      return;
    }

    try {
      res.status(200).json(this.store.set(session, apiKey, validation));
    } catch (error) {
      res.status(503).json({ error: { message: (error as Error).message } });
    }
  }

  /** Re-tests the key already stored for this session. */
  async testKey(_req: Request, res: Response): Promise<void> {
    const session = this.session(res);
    if (!session) {
      res.status(401).json({ error: { message: 'Authentication required' } });
      return;
    }
    if (!this.store.hasKey(session)) {
      res.status(404).json({ error: { message: 'No Gemini API key is configured for this session.' }, status: this.store.status(session) });
      return;
    }
    const check = await this.store.resolveProvider(session).testCredentials?.();
    this.store.setValidation(session, {
      status: check?.status ?? 'unverified',
      checkedAt: new Date().toISOString(),
      message: check?.message ?? 'The key could not be verified.',
    });
    res.status(200).json(this.store.status(session));
  }

  removeKey(_req: Request, res: Response): void {
    const session = this.session(res);
    if (!session) {
      res.status(401).json({ error: { message: 'Authentication required' } });
      return;
    }
    this.store.remove(session);
    res.status(200).json(this.store.status(session));
  }
}
