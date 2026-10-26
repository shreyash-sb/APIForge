export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class ConversationMemoryManager {
  private readonly maxTokens: number;
  private readonly preserveRecentCount: number;

  constructor(maxTokens = 4000, preserveRecentCount = 4) {
    this.maxTokens = maxTokens;
    this.preserveRecentCount = preserveRecentCount;
  }

  /**
   * Fast token estimation (roughly 1 token ≈ 4 characters for Latin text/code).
   */
  public estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Trims conversation to fit maxTokens while preserving the system prompt
   * and the most recent user/assistant turns. Older messages are summarized.
   */
  public async trimHistory(
    messages: ChatMessage[],
    summarizerFn?: (oldMessages: ChatMessage[]) => Promise<string>
  ): Promise<ChatMessage[]> {
    if (messages.length === 0) return [];

    const totalTokens = messages.reduce((acc, m) => acc + this.estimateTokens(m.content), 0);
    if (totalTokens <= this.maxTokens) {
      return [...messages];
    }

    // Separate system message if present
    const hasSystem = messages[0].role === 'system';
    const systemMessage = hasSystem ? messages[0] : null;
    const nonSystemMessages = hasSystem ? messages.slice(1) : [...messages];

    // Identify critical recent messages that must stay intact
    const recentMessages = nonSystemMessages.slice(-this.preserveRecentCount);
    const olderMessages = nonSystemMessages.slice(0, -this.preserveRecentCount);

    if (olderMessages.length === 0) {
      // Cannot split further; return as-is
      return messages;
    }

    // Condense older messages into a summary prompt
    let summaryContent = '';
    if (summarizerFn) {
      summaryContent = await summarizerFn(olderMessages);
    } else {
      // Deterministic fallback summary without LLM roundtrip
      summaryContent = olderMessages
        .map((m) => `[${m.role.toUpperCase()}]: ${m.content.slice(0, 100)}...`)
        .join(' | ');
    }

    const summaryMessage: ChatMessage = {
      role: 'system',
      content: `[Previous Context Summary]: ${summaryContent}`,
    };

    const trimmed: ChatMessage[] = [];
    if (systemMessage) trimmed.push(systemMessage);
    trimmed.push(summaryMessage);
    trimmed.push(...recentMessages);

    return trimmed;
  }
}
