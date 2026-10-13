import axios from 'axios'; import { formatApiErrorMessage } from './apiError';
const base = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || 'http://localhost:3001';
export type AssistantReply = { provider: 'google-gemini' | 'mock'; reply: string; contextUsed: boolean };
export async function askAssistant(message: string, context?: string): Promise<AssistantReply> { try { return (await axios.post<AssistantReply>(`${base}/api/assistant/chat`, { message, context }, { timeout: 35000 })).data; } catch (error) { throw new Error(formatApiErrorMessage(error, 'Assistant request failed.'), { cause: error }); } }
