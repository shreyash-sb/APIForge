/**
 * AiCredentialStore — session-only, per-user storage for user-supplied Gemini API keys.
 *
 * Design (see Backend/README.md "User-supplied Gemini keys"):
 *  - Keys live only in this process's memory. They are never written to MongoDB,
 *    logs, reports, chat history, or returned by any endpoint.
 *  - Entries are keyed by a SHA-256 hash of the authenticated bearer token (the
 *    login session) AND bound to the owning userId. A lookup must present both, so
 *    one user can never read, replace, delete, or use another user's key.
 *  - Entries expire with the session token, are removed on logout and account
 *    deletion, and disappear on server restart. Users re-enter the key per session.
 *  - Providers are constructed per request from the stored key; there is no
 *    process-global "current key".
 */

import crypto from 'node:crypto';
import { GoogleAiProvider, MockAiProvider, type AiProvider } from './aiProvider.service.js';

export interface AuthSession {
  /** SHA-256 of the bearer token; never the token itself. */
  id: string;
  userId: string;
  /** Epoch ms when the session token expires. */
  expiresAt: number;
}

export type KeyValidationStatus = 'valid' | 'invalid' | 'unverified';

export interface KeyValidationResult {
  status: KeyValidationStatus;
  checkedAt: string;
  message: string;
}

export interface AiKeyStatus {
  provider: 'google-gemini';
  configured: boolean;
  /** Masked indicator such as "••••abcd"; never the key. */
  keyHint?: string;
  storage: 'session';
  configuredAt?: string;
  expiresAt?: string;
  model: string;
  /** Which provider user AI requests resolve to right now. */
  mode: 'gemini' | 'mock-demo';
  lastValidation?: KeyValidationResult;
}

interface CredentialEntry {
  userId: string;
  apiKey: string;
  configuredAt: string;
  expiresAt: number;
  lastValidation?: KeyValidationResult;
}

const MAX_ENTRIES = 10_000;
// Classic keys look like AIza…; newer Google keys may contain '.', so only the charset and length are checked.
const KEY_FORMAT = /^[A-Za-z0-9._~+/=-]{20,512}$/;

export function sessionIdForToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function resolveGeminiModel(env: NodeJS.ProcessEnv = process.env): string {
  const model = env.GEMINI_MODEL?.trim();
  return model && /^[A-Za-z0-9._-]{1,80}$/.test(model) ? model : 'gemini-3.5-flash';
}

export class AiCredentialStore {
  private readonly entries = new Map<string, CredentialEntry>();

  constructor(
    private readonly providerFactory: (apiKey: string, model: string) => AiProvider = (apiKey, model) =>
      new GoogleAiProvider(apiKey, model),
    private readonly now: () => number = Date.now
  ) {}

  /** Throws a user-safe message when the key is obviously malformed. Never echoes the key. */
  static assertKeyFormat(apiKey: unknown): asserts apiKey is string {
    if (typeof apiKey !== 'string' || !KEY_FORMAT.test(apiKey.trim())) {
      throw new Error('That does not look like a Gemini API key. Paste the whole key without spaces, quotes, or line breaks.');
    }
  }

  set(session: AuthSession, apiKey: string, lastValidation?: KeyValidationResult): AiKeyStatus {
    AiCredentialStore.assertKeyFormat(apiKey);
    this.prune();
    if (!this.entries.has(session.id) && this.entries.size >= MAX_ENTRIES) {
      throw new Error('AI key storage is temporarily at capacity. Try again later.');
    }
    this.entries.set(session.id, {
      userId: session.userId,
      apiKey: apiKey.trim(),
      configuredAt: new Date(this.now()).toISOString(),
      expiresAt: session.expiresAt,
      lastValidation,
    });
    return this.status(session);
  }

  /** Returns the key only when the entry belongs to this exact session and user. */
  private getEntry(session: AuthSession | undefined): CredentialEntry | undefined {
    if (!session) return undefined;
    const entry = this.entries.get(session.id);
    if (!entry) return undefined;
    if (entry.userId !== session.userId || entry.expiresAt <= this.now()) {
      if (entry.expiresAt <= this.now()) this.entries.delete(session.id);
      return undefined;
    }
    return entry;
  }

  hasKey(session: AuthSession | undefined): boolean {
    return Boolean(this.getEntry(session));
  }

  setValidation(session: AuthSession, result: KeyValidationResult): void {
    const entry = this.getEntry(session);
    if (entry) entry.lastValidation = result;
  }

  remove(session: AuthSession): boolean {
    const entry = this.entries.get(session.id);
    if (!entry || entry.userId !== session.userId) return false;
    return this.entries.delete(session.id);
  }

  /** Logout path: the token has already been verified by the caller. */
  removeByToken(token: string): void {
    this.entries.delete(sessionIdForToken(token));
  }

  removeUser(userId: string): void {
    for (const [id, entry] of this.entries) {
      if (entry.userId === userId) this.entries.delete(id);
    }
  }

  status(session: AuthSession | undefined): AiKeyStatus {
    const entry = this.getEntry(session);
    const model = resolveGeminiModel();
    if (!entry) {
      return { provider: 'google-gemini', configured: false, storage: 'session', model, mode: 'mock-demo' };
    }
    return {
      provider: 'google-gemini',
      configured: true,
      keyHint: `••••${entry.apiKey.slice(-4)}`,
      storage: 'session',
      configuredAt: entry.configuredAt,
      expiresAt: new Date(entry.expiresAt).toISOString(),
      model,
      mode: 'gemini',
      lastValidation: entry.lastValidation,
    };
  }

  /**
   * Request-scoped provider resolution. Users without a key get the mock/demo provider;
   * the shared application GEMINI_API_KEY is deliberately never used for user requests.
   */
  resolveProvider(session: AuthSession | undefined): AiProvider {
    const entry = this.getEntry(session);
    return entry ? this.providerFactory(entry.apiKey, resolveGeminiModel()) : new MockAiProvider();
  }

  /** Creates a provider for an unsaved candidate key (used by save-and-test). */
  providerForCandidate(apiKey: string): AiProvider {
    return this.providerFactory(apiKey.trim(), resolveGeminiModel());
  }

  prune(): void {
    const now = this.now();
    for (const [id, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(id);
    }
  }

  /** Test isolation helper. */
  reset(): void {
    this.entries.clear();
  }
}

export const aiCredentialStore = new AiCredentialStore();
