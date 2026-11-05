import axios from 'axios'; import { formatApiErrorMessage } from './apiError';
import type { AssistantSessionContext } from '@/lib/assistantContext';
import { getApiBaseUrl } from '../config/api';
/** live = Gemini answered; mock = demo mode; fallback = Gemini failed and a deterministic reply was used; clarification = APIForge asked a follow-up without calling AI */
export type AssistantProviderStatus = 'live' | 'mock' | 'fallback' | 'clarification';
export type AssistantReply = { provider: 'google-gemini' | 'mock'; reply: string; contextUsed: boolean; providerStatus?: AssistantProviderStatus; fallbackReason?: string; contextTruncated?: boolean; evidence?: string[]; needsClarification?: boolean };
export type AssistantHistoryTurn = { role: 'user' | 'assistant'; content: string };
export type AssistantRequestOptions = { sessionContext?: AssistantSessionContext; history?: AssistantHistoryTurn[] };
export async function askAssistant(message: string, context?: string, options: AssistantRequestOptions = {}): Promise<AssistantReply> { try { return (await axios.post<AssistantReply>(`${getApiBaseUrl()}/api/assistant/chat`, { message, context, sessionContext: options.sessionContext, history: options.history?.slice(-6) }, { timeout: 35000 })).data; } catch (error) { throw new Error(formatApiErrorMessage(error, 'Assistant request failed.'), { cause: error }); } }
/** User-facing provenance label; mock and fallback output are never presented as Gemini. */
export function describeAssistantProvider(reply: Pick<AssistantReply, 'provider' | 'providerStatus' | 'fallbackReason'>): string {
  const status = reply.providerStatus ?? (reply.provider === 'mock' ? 'mock' : 'live');
  if (status === 'live') return 'Gemini (your key) · advisory';
  if (status === 'fallback') return `Gemini could not answer${reply.fallbackReason ? ` (${reply.fallbackReason})` : ''} · mock/deterministic fallback`;
  if (status === 'clarification') return 'APIForge follow-up question (no AI call)';
  return 'Mock (not a live LLM)';
}
