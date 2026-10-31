import type { Request, Response } from 'express';
import { AssistantService } from '../services/assistant.service.js';
import type { AiProvider } from '../services/aiProvider.service.js';
import { aiCredentialStore, type AuthSession } from '../services/aiCredentialStore.service.js';

type ProviderResolver = (session: AuthSession | undefined) => AiProvider;

export class AssistantController {
  constructor(
    private readonly service = new AssistantService(),
    private readonly resolveProvider: ProviderResolver = (session) => aiCredentialStore.resolveProvider(session)
  ) {}

  async ask(req: Request, res: Response) {
    let provider: AiProvider | undefined;
    if (!this.service.usesFixedProvider) {
      provider = this.resolveProvider((res.locals as { authSession?: AuthSession } | undefined)?.authSession);
    }
    try {
      res.json(
        await this.service.ask(req.body?.message, req.body?.context, {
          sessionContext: req.body?.sessionContext,
          history: req.body?.history,
          provider,
        })
      );
    } catch (error) {
      // Validation errors from AssistantService are user-safe; anything else is generic.
      const message = error instanceof Error && /message/i.test(error.message) ? error.message : 'Assistant request failed.';
      res.status(400).json({ error: { message } });
    }
  }
}
