/**
 * AssistantService — grounded, session-aware API assistant.
 *
 * The client sends a compact structured snapshot of the records relevant to the
 * question. This service re-validates and bounds every field, redacts secrets,
 * renders a deterministic data block for the provider, and decides when to ask a
 * clarifying question instead of calling the model. All supplied content is
 * treated as untrusted data.
 */

import { MockAiProvider, type AiProvider, type AssistResult } from './aiProvider.service.js';
import { isSensitiveKey, REDACTED, redactDeep, redactSecrets } from '../utils/secretRedaction.js';
import type {
  AssistantEndpointContext,
  AssistantHistoryTurn,
  AssistantReply,
  AssistantRequestContext,
  AssistantSessionContext,
  AssistantTestContext,
} from '../types/assistant.types.js';

export const MAX_MESSAGE = 4000;
export const MAX_CONTEXT = 12000;
const MAX_LEGACY_CONTEXT = 12000;
const MAX_HISTORY_TURNS = 6;
const MAX_HISTORY_TURN_CHARS = 800;
const LIMITS = {
  endpoints: 4,
  tests: 6,
  parameters: 20,
  responses: 10,
  failedAssertions: 6,
  endpointIndex: 100,
  securitySchemes: 10,
  headers: 20,
  facts: 12,
};

// ---------------------------------------------------------------------------
// Bounded, typed normalization of untrusted client input
// ---------------------------------------------------------------------------

type Truncation = { truncated: boolean };

function text(value: unknown, max: number, state: Truncation): string | undefined {
  if (value === undefined || value === null) return undefined;
  const raw = redactSecrets(typeof value === 'string' ? value : String(value));
  if (raw.length > max) {
    state.truncated = true;
    return `${raw.slice(0, max)}…[truncated]`;
  }
  return raw;
}

function list<T>(value: unknown, max: number, state: Truncation, map: (item: unknown) => T | undefined): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (value.length > max) state.truncated = true;
  const out = value.slice(0, max).map(map).filter((item): item is T => item !== undefined);
  return out.length ? out : undefined;
}

function obj(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Strips URL credentials and sensitive query values; keeps the host and path for grounding. */
export function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    for (const key of [...url.searchParams.keys()]) {
      if (isSensitiveKey(key) || /key|token|secret|password|signature|sig/i.test(key)) url.searchParams.set(key, REDACTED);
    }
    return redactSecrets(decodeURI(url.toString()));
  } catch {
    return redactSecrets(value).replace(/([?&][^=&]*(?:key|token|secret|password)[^=&]*=)[^&]*/gi, `$1${REDACTED}`);
  }
}

function keyValues(value: unknown, state: Truncation): Array<{ key: string; value: string }> | undefined {
  return list(value, LIMITS.headers, state, (item) => {
    const entry = obj(item);
    const key = text(entry?.key, 100, state);
    if (!key) return undefined;
    const sensitive = isSensitiveKey(key) || /key|token|secret|password|auth|cookie|session/i.test(key);
    return { key, value: sensitive ? REDACTED : text(entry?.value, 200, state) ?? '' };
  });
}

function normalizeEndpoint(item: unknown, state: Truncation): AssistantEndpointContext | undefined {
  const e = obj(item);
  const method = text(e?.method, 10, state);
  const path = text(e?.path, 300, state);
  if (!method || !path) return undefined;
  const body = obj(e?.requestBody);
  return {
    method: method.toUpperCase(),
    path,
    operationId: text(e?.operationId, 120, state),
    summary: text(e?.summary, 200, state),
    description: text(e?.description, 400, state),
    parameters: list(e?.parameters, LIMITS.parameters, state, (p) => {
      const param = obj(p);
      const name = text(param?.name, 100, state);
      if (!name) return undefined;
      return {
        name,
        location: text(param?.location, 20, state) ?? 'unknown',
        required: param?.required === true,
        type: text(param?.type, 60, state),
        description: text(param?.description, 200, state),
      };
    }),
    requestBody: body
      ? {
          required: body.required === true,
          contentTypes: list(body.contentTypes, 5, state, (c) => text(c, 80, state)) ?? [],
          schema: text(body.schema, 800, state),
        }
      : undefined,
    responses: list(e?.responses, LIMITS.responses, state, (r) => {
      const response = obj(r);
      const status = text(response?.status, 10, state);
      if (!status) return undefined;
      return { status, description: text(response?.description, 200, state), schema: text(response?.schema, 600, state) };
    }),
    security: list(e?.security, 5, state, (s) => text(s, 60, state)),
  };
}

function normalizeTest(item: unknown, state: Truncation): AssistantTestContext | undefined {
  const t = obj(item);
  const testCaseId = text(t?.testCaseId, 120, state);
  const name = text(t?.name, 200, state);
  const endpoint = text(t?.endpoint, 320, state);
  if (!testCaseId || !name || !endpoint) return undefined;
  const expected = obj(t?.expected);
  const execution = obj(t?.execution);
  const validation = obj(t?.validation);
  const diagnosis = obj(t?.diagnosis);
  return {
    testCaseId,
    name,
    type: text(t?.type, 30, state),
    endpoint,
    expected: expected
      ? {
          statusCodes: list(expected.statusCodes, 10, state, (c) => text(c, 10, state)),
          statusClass: text(expected.statusClass, 5, state),
          conditions: list(expected.conditions, 5, state, (c) => text(c, 200, state)),
        }
      : undefined,
    execution:
      execution && typeof execution.status === 'string'
        ? {
            executionId: text(execution.executionId, 120, state) ?? 'unknown',
            status: text(execution.status, 30, state) ?? 'unknown',
            httpStatus: num(execution.httpStatus),
            durationMs: num(execution.durationMs),
            error: text(execution.error, 300, state),
            responseExcerpt: text(
              typeof execution.responseExcerpt === 'string' ? execution.responseExcerpt : JSON.stringify(redactDeep(execution.responseExcerpt) ?? null),
              800,
              state
            ),
          }
        : undefined,
    validation:
      validation && typeof validation.status === 'string'
        ? {
            status: text(validation.status, 30, state) ?? 'unknown',
            total: num(validation.total) ?? 0,
            passed: num(validation.passed) ?? 0,
            failed: num(validation.failed) ?? 0,
            failedAssertions: list(validation.failedAssertions, LIMITS.failedAssertions, state, (a) => {
              const assertion = obj(a);
              if (!assertion) return undefined;
              return {
                category: text(assertion.category, 40, state) ?? 'UNKNOWN',
                path: text(assertion.path, 200, state) ?? '',
                expected: text(assertion.expected, 200, state) ?? '',
                actual: text(assertion.actual, 200, state) ?? '',
                message: text(assertion.message, 300, state) ?? '',
              };
            }),
          }
        : undefined,
    diagnosis:
      diagnosis && typeof diagnosis.summary === 'string'
        ? {
            summary: text(diagnosis.summary, 400, state) ?? '',
            confidence: text(diagnosis.confidence, 10, state),
            providerStatus: text(diagnosis.providerStatus, 20, state),
          }
        : undefined,
  };
}

function normalizeRequest(value: unknown, state: Truncation): AssistantRequestContext | undefined {
  const r = obj(value);
  const method = text(r?.method, 10, state);
  const url = typeof r?.url === 'string' ? r.url : undefined;
  if (!method || !url) return undefined;
  let body = typeof r?.body === 'string' ? r.body : undefined;
  if (body) {
    try {
      body = JSON.stringify(redactDeep(JSON.parse(body)));
    } catch {
      // Non-JSON bodies keep pattern-based redaction only.
    }
  }
  return {
    method: method.toUpperCase(),
    url: text(sanitizeUrl(url), 500, state) ?? '',
    headers: keyValues(r?.headers, state),
    queryParams: keyValues(r?.queryParams, state),
    body: text(body, 1000, state),
    authType: text(r?.authType, 20, state),
  };
}

export function normalizeSessionContext(raw: unknown): { context?: AssistantSessionContext; truncated: boolean } {
  const input = obj(raw);
  if (!input) return { truncated: false };
  const state: Truncation = { truncated: false };
  const spec = obj(input.specification);
  const selection = obj(input.selection);
  const context: AssistantSessionContext = {
    specification:
      spec && typeof spec.title === 'string'
        ? {
            title: text(spec.title, 200, state) ?? '',
            version: text(spec.version, 40, state) ?? '',
            endpointCount: num(spec.endpointCount) ?? 0,
            securitySchemes: list(spec.securitySchemes, LIMITS.securitySchemes, state, (s) => {
              const scheme = obj(s);
              const name = text(scheme?.name, 80, state);
              if (!name) return undefined;
              return {
                name,
                type: text(scheme?.type, 30, state) ?? 'unknown',
                description: text(scheme?.description, 200, state),
                location: text(scheme?.location, 20, state),
                scheme: text(scheme?.scheme, 30, state),
              };
            }),
          }
        : undefined,
    endpoints: list(input.endpoints, LIMITS.endpoints, state, (e) => normalizeEndpoint(e, state)),
    tests: list(input.tests, LIMITS.tests, state, (t) => normalizeTest(t, state)),
    request: normalizeRequest(input.request, state),
    endpointIndex: list(input.endpointIndex, LIMITS.endpointIndex, state, (e) => text(e, 320, state)),
    selection: selection
      ? {
          focusTestId: text(selection.focusTestId, 120, state),
          matchedBy: (['focus', 'question', 'none'] as const).find((value) => value === selection.matchedBy),
          clientTruncated: selection.clientTruncated === true,
        }
      : undefined,
  };
  if (context.selection?.clientTruncated) state.truncated = true;
  return { context, truncated: state.truncated };
}

// ---------------------------------------------------------------------------
// Deterministic rendering, facts, and clarification
// ---------------------------------------------------------------------------

/** Renders sections in priority order within MAX_CONTEXT; items that do not fit are dropped and flagged. */
export function renderContext(context: AssistantSessionContext): { text: string; truncated: boolean } {
  const lines: string[] = [];
  let used = 0;
  let truncated = false;
  const push = (label: string, value: unknown): void => {
    if (value === undefined) return;
    const line = `${label}: ${JSON.stringify(value)}`;
    if (used + line.length + 1 > MAX_CONTEXT) {
      truncated = true;
      return;
    }
    lines.push(line);
    used += line.length + 1;
  };
  push('specification', context.specification);
  for (const test of context.tests ?? []) push('test', test);
  for (const endpoint of context.endpoints ?? []) push('endpoint', endpoint);
  push('request_builder', context.request);
  if (context.endpointIndex?.length) push('all_endpoint_labels', context.endpointIndex);
  return { text: lines.join('\n') || 'No APIForge session context matched this question.', truncated };
}

export function extractFacts(context: AssistantSessionContext | undefined): string[] {
  if (!context) return [];
  const facts: string[] = [];
  for (const test of context.tests ?? []) {
    const expected = test.expected?.statusCodes?.length
      ? test.expected.statusCodes.join('/')
      : test.expected?.statusClass;
    if (test.execution) {
      const received = test.execution.httpStatus !== undefined ? `received HTTP ${test.execution.httpStatus}` : 'no HTTP response';
      facts.push(`${test.endpoint} — test "${test.name}": expected ${expected ?? 'any status'}, ${received} (${test.execution.status}).`);
      if (test.execution.error) facts.push(`${test.endpoint} — transport error: ${test.execution.error}`);
    } else {
      facts.push(`${test.endpoint} — test "${test.name}" has not been executed in this session.`);
    }
    if (test.validation) {
      facts.push(`${test.endpoint} — validation ${test.validation.status}: ${test.validation.failed} of ${test.validation.total} assertions failed.`);
      for (const assertion of test.validation.failedAssertions?.slice(0, 2) ?? []) {
        facts.push(`${test.endpoint} — ${assertion.category} at ${assertion.path}: expected ${assertion.expected}, actual ${assertion.actual}.`);
      }
    }
    if (test.diagnosis) facts.push(`${test.endpoint} — existing diagnosis (${test.diagnosis.providerStatus ?? 'unknown source'}): ${test.diagnosis.summary}`);
  }
  for (const endpoint of context.endpoints ?? []) {
    const statuses = endpoint.responses?.map((response) => response.status).join(', ');
    const required = endpoint.parameters?.filter((param) => param.required).map((param) => `${param.name} (${param.location})`).join(', ');
    facts.push(
      `${endpoint.method} ${endpoint.path}${endpoint.operationId ? ` (${endpoint.operationId})` : ''} is in the imported spec` +
        `${statuses ? `; documented responses: ${statuses}` : ''}${required ? `; required parameters: ${required}` : ''}.`
    );
  }
  if (context.request) facts.push(`Request builder: ${context.request.method} ${context.request.url}.`);
  return facts.slice(0, LIMITS.facts);
}

function evidenceLabels(context: AssistantSessionContext | undefined): string[] {
  if (!context) return [];
  const labels = new Set<string>();
  for (const test of context.tests ?? []) labels.add(`${test.endpoint} · ${test.name}`);
  for (const endpoint of context.endpoints ?? []) labels.add(`${endpoint.method} ${endpoint.path}`);
  if (context.request) labels.add('Request builder draft');
  return [...labels].slice(0, 8);
}

const TARGET_DEPENDENT = /\b(?:this|that|the|my|it'?s?)\s+(?:endpoint|test|request|failure|error|call|route|response|operation)\b|\bwhy\s+(?:did|does|is|was)\s+(?:it|this|that)\b|\bwhat\s+went\s+wrong\b|\bwhy\s+(?:did\s+it\s+)?fail/i;

export function needsClarification(message: string, context: AssistantSessionContext | undefined): boolean {
  if (!context || !TARGET_DEPENDENT.test(message)) return false;
  const hasTarget = Boolean(context.tests?.length || context.endpoints?.length || context.request);
  return !hasTarget && (context.endpointIndex?.length ?? 0) > 1;
}

function normalizeHistory(raw: unknown): string | undefined {
  if (!Array.isArray(raw)) return undefined;
  const turns = raw
    .slice(-MAX_HISTORY_TURNS)
    .map((item) => obj(item))
    .filter((turn): turn is Record<string, unknown> => Boolean(turn) && (turn?.role === 'user' || turn?.role === 'assistant') && typeof turn?.content === 'string')
    .map((turn) => {
      const content = redactSecrets(String(turn.content)).slice(0, MAX_HISTORY_TURN_CHARS);
      return `${(turn.role as AssistantHistoryTurn['role']) === 'user' ? 'User' : 'Assistant'}: ${content}`;
    });
  return turns.length ? turns.join('\n') : undefined;
}

const DETAIL_REQUEST = /\b(?:in\s+detail|detailed|in\s+depth|step[-\s]by[-\s]step|elaborate|thorough(?:ly)?|explain\s+more)\b/i;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface AskOptions {
  sessionContext?: unknown;
  history?: unknown;
  /** Request-scoped provider (the caller's own key, or mock/demo) */
  provider?: AiProvider;
}

export class AssistantService {
  private readonly fixedProvider?: AiProvider;

  /** A provider injected here (tests) is always used; otherwise callers pass a request-scoped provider. */
  constructor(provider?: AiProvider) {
    this.fixedProvider = provider;
  }

  get usesFixedProvider(): boolean {
    return Boolean(this.fixedProvider);
  }

  async ask(message: unknown, context?: unknown, options: AskOptions = {}): Promise<AssistantReply> {
    if (typeof message !== 'string' || !message.trim()) throw new Error('A message is required.');
    if (message.length > MAX_MESSAGE) throw new Error(`Message exceeds ${MAX_MESSAGE} characters.`);
    const provider = this.fixedProvider ?? options.provider ?? new MockAiProvider();
    const safeMessage = redactSecrets(message);

    const { context: session, truncated: normalizationTruncated } = normalizeSessionContext(options.sessionContext);

    if (session) {
      if (needsClarification(safeMessage, session)) {
        const candidates = (session.endpointIndex ?? []).slice(0, 5).join(', ');
        return {
          provider: 'mock',
          providerStatus: 'clarification',
          reply: `Which endpoint or test do you mean? Your session has several, for example: ${candidates}. Pick one in the context selector or mention its method and path.`,
          contextUsed: false,
          contextTruncated: normalizationTruncated,
          evidence: [],
          needsClarification: true,
        };
      }
      const rendered = renderContext(session);
      const facts = extractFacts(session);
      const result = await this.callProvider(provider, {
        message: safeMessage,
        context: rendered.text,
        facts,
        history: normalizeHistory(options.history),
        detailed: DETAIL_REQUEST.test(message),
      });
      return {
        provider: result.providerStatus === 'live' ? provider.name : 'mock',
        providerStatus: result.providerStatus,
        fallbackReason: result.fallbackReason,
        reply: result.text,
        contextUsed: facts.length > 0,
        contextTruncated: normalizationTruncated || rendered.truncated,
        evidence: evidenceLabels(session),
      };
    }

    // Legacy free-text context contract (kept for existing callers).
    let contextTruncated = false;
    let safeContext: string | undefined;
    if (typeof context === 'string') {
      safeContext = redactSecrets(context);
      if (safeContext.length > MAX_LEGACY_CONTEXT) {
        safeContext = safeContext.slice(0, MAX_LEGACY_CONTEXT);
        contextTruncated = true;
      }
    }
    const result = await this.callProvider(provider, {
      message: safeMessage,
      context: safeContext,
      history: normalizeHistory(options.history),
      detailed: DETAIL_REQUEST.test(message),
    });
    return {
      provider: result.providerStatus === 'live' ? provider.name : 'mock',
      providerStatus: result.providerStatus,
      fallbackReason: result.fallbackReason,
      reply: result.text,
      contextUsed: Boolean(safeContext),
      contextTruncated,
      evidence: [],
    };
  }

  private async callProvider(provider: AiProvider, input: Parameters<NonNullable<AiProvider['assistDetailed']>>[0]): Promise<AssistResult> {
    if (provider.assistDetailed) return provider.assistDetailed(input);
    const text = await provider.assist(input.message, input.context);
    return { text, providerStatus: provider.name === 'mock' ? 'mock' : 'live' };
  }
}
