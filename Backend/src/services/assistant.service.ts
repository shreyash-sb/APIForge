import { createAiProvider, type AiProvider } from './aiProvider.service.js';
const MAX_MESSAGE = 4000; const MAX_CONTEXT = 12000;
const secret = /((?:bearer\s+)|(?:api[_-]?key|authorization|cookie|password|secret|token)["']?\s*[:=]\s*["']?)[^\s,}"']+/gi;
export class AssistantService {
  constructor(private readonly provider: AiProvider = createAiProvider()) {}
  async ask(message: unknown, context?: unknown) {
    if (typeof message !== 'string' || !message.trim()) throw new Error('A message is required.');
    if (message.length > MAX_MESSAGE) throw new Error(`Message exceeds ${MAX_MESSAGE} characters.`);
    const safeContext = typeof context === 'string' ? context.replace(secret, '$1[REDACTED]').slice(0, MAX_CONTEXT) : undefined;
    const reply = await this.provider.assist(message.replace(secret, '$1[REDACTED]'), safeContext);
    return { provider: this.provider.name, reply, contextUsed: Boolean(safeContext) };
  }
}
