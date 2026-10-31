import type { AiProviderName, AiProviderStatus } from './diagnosis.types.js';

/** Compact, question-relevant slice of the imported OpenAPI operation. */
export interface AssistantEndpointContext {
  method: string;
  path: string;
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: Array<{ name: string; location: string; required: boolean; type?: string; description?: string }>;
  requestBody?: { required: boolean; contentTypes: string[]; schema?: string };
  responses?: Array<{ status: string; description?: string; schema?: string }>;
  security?: string[];
}

export interface AssistantTestContext {
  testCaseId: string;
  name: string;
  type?: string;
  /** e.g. "GET /users/{id}" */
  endpoint: string;
  expected?: { statusCodes?: string[]; statusClass?: string; conditions?: string[] };
  execution?: {
    executionId: string;
    status: string;
    httpStatus?: number;
    durationMs?: number;
    error?: string;
    responseExcerpt?: string;
  };
  validation?: {
    status: string;
    total: number;
    passed: number;
    failed: number;
    failedAssertions?: Array<{ category: string; path: string; expected: string; actual: string; message: string }>;
  };
  diagnosis?: { summary: string; confidence?: string; providerStatus?: string };
}

export interface AssistantRequestContext {
  method: string;
  url: string;
  headers?: Array<{ key: string; value: string }>;
  queryParams?: Array<{ key: string; value: string }>;
  body?: string;
  authType?: string;
}

export interface AssistantSessionContext {
  specification?: {
    title: string;
    version: string;
    endpointCount: number;
    securitySchemes?: Array<{ name: string; type: string; description?: string; location?: string; scheme?: string }>;
  };
  endpoints?: AssistantEndpointContext[];
  tests?: AssistantTestContext[];
  request?: AssistantRequestContext;
  /** "METHOD /path" labels only, used to offer clarification candidates */
  endpointIndex?: string[];
  selection?: { focusTestId?: string; matchedBy?: 'focus' | 'question' | 'none'; clientTruncated?: boolean };
}

export interface AssistantHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export type AssistantProviderStatus = AiProviderStatus | 'clarification';

export interface AssistantReply {
  /** The provider that actually produced the reply; never 'google-gemini' unless Gemini answered */
  provider: AiProviderName;
  providerStatus: AssistantProviderStatus;
  fallbackReason?: string;
  reply: string;
  contextUsed: boolean;
  contextTruncated: boolean;
  /** Short evidence labels the answer was grounded on */
  evidence: string[];
  needsClarification?: boolean;
}
