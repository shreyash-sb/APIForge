import type { ApiEndpoint, ApiSchema, ApiSpecification } from '@/types/openapi.types';
import type { RequestDraft } from '@/types/request.types';
import type { TestCase } from '@/types/testCase.types';
import type { TestCaseExecutionResult } from '@/types/testExecution.types';
import type { TestCaseValidationResult } from '@/types/validation.types';
import type { DiagnosisResult } from '@/types/diagnosis.types';

/**
 * Builds a compact, question-relevant snapshot of the current APIForge session for
 * the assistant. Only matching endpoints/tests are included (never the whole spec
 * or full test history), secrets are stripped, and the backend re-validates,
 * re-redacts, and bounds everything again.
 */

export interface AssistantSessionContext {
  specification?: {
    title: string;
    version: string;
    endpointCount: number;
    securitySchemes?: Array<{ name: string; type: string; description?: string; location?: string; scheme?: string }>;
  };
  endpoints?: Array<{
    method: string;
    path: string;
    operationId?: string;
    summary?: string;
    description?: string;
    parameters?: Array<{ name: string; location: string; required: boolean; type?: string; description?: string }>;
    requestBody?: { required: boolean; contentTypes: string[]; schema?: string };
    responses?: Array<{ status: string; description?: string; schema?: string }>;
    security?: string[];
  }>;
  tests?: Array<{
    testCaseId: string;
    name: string;
    type?: string;
    endpoint: string;
    expected?: { statusCodes?: string[]; statusClass?: string; conditions?: string[] };
    execution?: { executionId: string; status: string; httpStatus?: number; durationMs?: number; error?: string; responseExcerpt?: string };
    validation?: {
      status: string;
      total: number;
      passed: number;
      failed: number;
      failedAssertions?: Array<{ category: string; path: string; expected: string; actual: string; message: string }>;
    };
    diagnosis?: { summary: string; confidence?: string; providerStatus?: string };
  }>;
  request?: { method: string; url: string; headers?: Array<{ key: string; value: string }>; queryParams?: Array<{ key: string; value: string }>; body?: string; authType?: string };
  endpointIndex?: string[];
  selection?: { focusTestId?: string; matchedBy: 'focus' | 'question' | 'none'; clientTruncated?: boolean };
}

export interface AssistantSessionInput {
  question: string;
  specification?: ApiSpecification;
  tests: TestCase[];
  executionResults: Record<string, TestCaseExecutionResult>;
  validationResults: Record<string, TestCaseValidationResult>;
  diagnosisResults: Record<string, DiagnosisResult>;
  requestDraft?: RequestDraft;
  focusTestId?: string;
}

const MAX_ENDPOINTS = 3;
const MAX_TESTS = 5;
const MAX_INDEX = 100;
const SENSITIVE = /(authorization|cookie|password|passwd|secret|token|api[-_]?key|apikey|session|private[-_]?key|credential)/i;
const STOP_WORDS = new Set(['what', 'when', 'where', 'which', 'with', 'this', 'that', 'does', 'have', 'from', 'about', 'there', 'their', 'should', 'would', 'could', 'endpoint', 'test', 'tests', 'request', 'response', 'please', 'explain']);

const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max)}…` : value);

function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redactValue(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, SENSITIVE.test(key) ? '[REDACTED]' : redactValue(item, depth + 1)])
    );
  }
  if (typeof value === 'string') return value.replace(/\b(bearer|basic)\s+[\w.~+/=-]+/gi, '$1 [REDACTED]').replace(/AIza[\w-]{30,}/g, '[REDACTED]');
  return value;
}

function excerpt(body: unknown, max = 600): string | undefined {
  if (body === undefined || body === null || body === '') return undefined;
  let value = body;
  if (typeof body === 'string') {
    try {
      value = JSON.parse(body);
    } catch {
      return clip(String(redactValue(body)), max);
    }
  }
  return clip(JSON.stringify(redactValue(value)), max);
}

/** Compact one-line schema description, e.g. object{id*:string,tags:array<string>}. */
export function summarizeSchema(schema: ApiSchema | undefined, depth = 0): string | undefined {
  if (!schema) return undefined;
  if (depth > 2) return schema.reference ? schema.reference.split('/').pop() : 'object';
  const type = Array.isArray(schema.type) ? schema.type.join('|') : schema.type;
  if (schema.properties) {
    const required = new Set(schema.required ?? []);
    const fields = Object.entries(schema.properties)
      .slice(0, 15)
      .map(([name, child]) => `${name}${required.has(name) ? '*' : ''}:${summarizeSchema(child, depth + 1) ?? 'any'}`);
    return clip(`object{${fields.join(',')}}`, 500);
  }
  if (schema.items) return `array<${summarizeSchema(schema.items, depth + 1) ?? 'any'}>`;
  if (schema.enum) return `${type ?? 'enum'}(${schema.enum.slice(0, 8).join('|')})`;
  for (const combo of ['allOf', 'anyOf', 'oneOf'] as const) {
    if (schema[combo]?.length) return `${combo}[${schema[combo]!.slice(0, 4).map((s) => summarizeSchema(s, depth + 1)).join(',')}]`;
  }
  return type ?? (schema.reference ? schema.reference.split('/').pop() : undefined);
}

function pathPattern(path: string): RegExp {
  const escaped = path
    .split('/')
    .map((segment) => (/^\{.+\}$|^:.+/.test(segment) ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`^${escaped}/?$`, 'i');
}

function questionSignals(question: string) {
  const lower = question.toLowerCase();
  const paths = [...question.matchAll(/(?:^|\s|`)(\/[\w{}\-./:~%]*)/g)].map((match) => match[1].split('?')[0].replace(/[.,;:!?`]+$/, ''));
  const methods = new Set([...question.matchAll(/\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)].map((m) => m[1]));
  const statuses = new Set([...question.matchAll(/\b([1-5]\d\d)\b/g)].map((m) => m[1]));
  const words = new Set(lower.split(/[^a-z0-9_]+/).filter((word) => word.length >= 4 && !STOP_WORDS.has(word)));
  return { lower, paths, methods, statuses, words };
}

type Signals = ReturnType<typeof questionSignals>;

function scoreEndpoint(endpoint: Pick<ApiEndpoint, 'method' | 'path' | 'operationId' | 'summary' | 'tags'>, signals: Signals): number {
  let score = 0;
  const pattern = pathPattern(endpoint.path);
  for (const path of signals.paths) {
    if (path.toLowerCase() === endpoint.path.toLowerCase()) score += 6;
    else if (pattern.test(path)) score += 4;
  }
  if (score > 0 && signals.methods.has(endpoint.method)) score += 2;
  if (score > 0 && signals.methods.size && !signals.methods.has(endpoint.method)) score -= 3;
  if (endpoint.operationId && signals.lower.includes(endpoint.operationId.toLowerCase())) score += 5;
  const text = `${endpoint.summary ?? ''} ${(endpoint.tags ?? []).join(' ')} ${endpoint.path}`.toLowerCase();
  let overlap = 0;
  for (const word of signals.words) if (text.includes(word)) overlap += 1;
  return score + Math.min(overlap, 3);
}

const isFailure = (execution?: TestCaseExecutionResult, validation?: TestCaseValidationResult) =>
  execution?.status === 'FAILED_EXECUTION' || execution?.status === 'ERROR' || validation?.status === 'VALIDATION_FAILED';

function compactEndpoint(endpoint: ApiEndpoint): NonNullable<AssistantSessionContext['endpoints']>[number] {
  return {
    method: endpoint.method,
    path: endpoint.path,
    operationId: endpoint.operationId,
    summary: endpoint.summary ? clip(endpoint.summary, 200) : undefined,
    description: endpoint.description ? clip(endpoint.description, 300) : undefined,
    parameters: endpoint.parameters.slice(0, 15).map((param) => ({
      name: param.name,
      location: param.location,
      required: param.required,
      type: summarizeSchema(param.schema),
      description: param.description ? clip(param.description, 150) : undefined,
    })),
    requestBody: endpoint.requestBody
      ? {
          required: endpoint.requestBody.required,
          contentTypes: endpoint.requestBody.content.map((content) => content.contentType).slice(0, 4),
          schema: summarizeSchema(endpoint.requestBody.content[0]?.schema),
        }
      : undefined,
    responses: endpoint.responses.slice(0, 8).map((response) => ({
      status: response.statusCode,
      description: response.description ? clip(response.description, 150) : undefined,
      schema: summarizeSchema(response.content[0]?.schema),
    })),
    security: endpoint.security?.map((requirement) => requirement.scheme),
  };
}

function compactTest(
  test: TestCase,
  execution: TestCaseExecutionResult | undefined,
  validation: TestCaseValidationResult | undefined,
  diagnosis: DiagnosisResult | undefined
): NonNullable<AssistantSessionContext['tests']>[number] {
  // Only associate validation/diagnosis records produced for the current execution.
  const currentValidation = validation && execution && validation.executionId === execution.executionId ? validation : undefined;
  const currentDiagnosis = diagnosis && execution && diagnosis.executionId === execution.executionId ? diagnosis : undefined;
  const failed = currentValidation?.assertions.filter((assertion) => !assertion.passed) ?? [];
  return {
    testCaseId: test.id,
    name: test.name,
    type: test.type,
    endpoint: `${test.endpoint.method} ${test.endpoint.path}`,
    expected: {
      statusCodes: test.expected.statusCodes,
      statusClass: test.expected.statusClass,
      conditions: test.expected.conditions?.slice(0, 4),
    },
    execution: execution
      ? {
          executionId: execution.executionId,
          status: execution.status,
          httpStatus: execution.response?.status,
          durationMs: execution.durationMs,
          error: execution.error?.message ? clip(String(redactValue(execution.error.message)), 300) : undefined,
          responseExcerpt: excerpt(execution.response?.body),
        }
      : undefined,
    validation: currentValidation
      ? {
          status: currentValidation.status,
          total: currentValidation.summary.totalAssertions,
          passed: currentValidation.summary.passedAssertions,
          failed: currentValidation.summary.failedAssertions,
          failedAssertions: failed.slice(0, 5).map(({ category, path, expected, actual, message }) => ({
            category,
            path,
            expected: clip(String(redactValue(expected)), 200),
            actual: clip(String(redactValue(actual)), 200),
            message: clip(String(redactValue(message)), 300),
          })),
        }
      : undefined,
    diagnosis: currentDiagnosis
      ? { summary: clip(currentDiagnosis.summary, 400), confidence: currentDiagnosis.confidence, providerStatus: currentDiagnosis.providerStatus ?? currentDiagnosis.provider }
      : undefined,
  };
}

function compactRequest(draft: RequestDraft): AssistantSessionContext['request'] {
  let url: string;
  try {
    const parsed = new URL(draft.url);
    parsed.username = '';
    parsed.password = '';
    for (const key of [...parsed.searchParams.keys()]) if (SENSITIVE.test(key)) parsed.searchParams.set(key, '[REDACTED]');
    url = decodeURI(parsed.toString());
  } catch {
    url = draft.url.replace(/\/\/[^/@\s]+@/, '//').replace(/([?&][^=&]*(?:key|token|secret|password)[^=&]*=)[^&]*/gi, '$1[REDACTED]');
  }
  const pairs = (items: Array<{ key: string; value: string; enabled: boolean }>) =>
    items
      .filter((item) => item.enabled && item.key.trim())
      .slice(0, 15)
      .map((item) => ({ key: item.key, value: SENSITIVE.test(item.key) ? '[REDACTED]' : clip(item.value, 200) }));
  return {
    method: draft.method,
    url: clip(url, 500),
    headers: pairs(draft.headers),
    queryParams: pairs(draft.queryParams),
    body: excerpt(draft.body, 1000),
    authType: draft.auth.type,
  };
}

export function buildAssistantContext(input: AssistantSessionInput): AssistantSessionContext | undefined {
  const { specification, tests, executionResults, validationResults, diagnosisResults, requestDraft } = input;
  if (!specification && !tests.length && !requestDraft?.url) return undefined;
  const signals = questionSignals(input.question);
  let clientTruncated = false;

  // Tests: the focused test always wins; then tests scored against the question.
  const focus = tests.find((test) => test.id === input.focusTestId);
  // "Which tests failed?" pulls in failures broadly; a question naming a method/path stays specific.
  const namesTarget = signals.paths.length > 0 || signals.methods.size > 0;
  const generalFailureQuery =
    !namesTarget && /\b(fail|failed|failing|failures?|errors?|broken)\b/i.test(input.question) && !/\b(this|that|it)\b/i.test(input.question);
  // An explicitly named HTTP method is a hard filter, not just a scoring hint.
  const methodMatches = (method: string) => signals.methods.size === 0 || signals.methods.has(method);
  const scoredTests = tests
    .filter((test) => test.id !== focus?.id && methodMatches(test.endpoint.method))
    .map((test) => {
      const execution = executionResults[test.id];
      const validation = validationResults[test.id];
      let score = scoreEndpoint({ ...test.endpoint, summary: test.name, tags: [] }, signals);
      if (score > 0 && isFailure(execution, validation)) score += 1;
      if (execution?.response && signals.statuses.has(String(execution.response.status))) score += 2;
      if (generalFailureQuery && isFailure(execution, validation)) score += 3;
      return { test, score };
    })
    .filter((item) => item.score >= 3)
    .sort((a, b) => b.score - a.score);
  if (scoredTests.length > MAX_TESTS - (focus ? 1 : 0)) clientTruncated = true;
  const selectedTests = [...(focus ? [focus] : []), ...scoredTests.slice(0, MAX_TESTS - (focus ? 1 : 0)).map((item) => item.test)];

  // Endpoints: those referenced by selected tests first, then direct matches.
  const endpoints = specification?.endpoints ?? [];
  const byKey = new Map(endpoints.map((endpoint) => [`${endpoint.method} ${endpoint.path}`, endpoint]));
  const selectedEndpoints: ApiEndpoint[] = [];
  const addEndpoint = (endpoint: ApiEndpoint | undefined) => {
    if (!endpoint || selectedEndpoints.includes(endpoint)) return;
    if (selectedEndpoints.length >= MAX_ENDPOINTS) {
      clientTruncated = true;
      return;
    }
    selectedEndpoints.push(endpoint);
  };
  for (const test of selectedTests) addEndpoint(byKey.get(`${test.endpoint.method} ${test.endpoint.path}`));
  endpoints
    .filter((endpoint) => methodMatches(endpoint.method))
    .map((endpoint) => ({ endpoint, score: scoreEndpoint(endpoint, signals) }))
    .filter((item) => item.score >= 3)
    .sort((a, b) => b.score - a.score)
    .forEach((item) => addEndpoint(item.endpoint));

  const wantsRequest =
    Boolean(requestDraft?.url) &&
    (/\b(request builder|my request|this request|my call|header|headers|payload|body|url)\b/i.test(input.question) ||
      signals.paths.some((path) => requestDraft!.url.includes(path) && path.length > 1));
  const wantsSecurity = /\b(auth|authentication|authorization|token|security|bearer|oauth|api key|apikey|401|403)\b/i.test(input.question);

  if (endpoints.length > MAX_INDEX) clientTruncated = true;
  return {
    specification: specification
      ? {
          title: specification.metadata.title,
          version: specification.metadata.version,
          endpointCount: endpoints.length,
          securitySchemes:
            wantsSecurity || selectedEndpoints.some((endpoint) => endpoint.security?.length)
              ? Object.entries(specification.securitySchemes).slice(0, 8).map(([name, scheme]) => ({
                  name,
                  type: scheme.type,
                  description: scheme.description ? clip(scheme.description, 200) : undefined,
                  location: scheme.location,
                  scheme: scheme.scheme,
                }))
              : undefined,
        }
      : undefined,
    endpoints: selectedEndpoints.map(compactEndpoint),
    tests: selectedTests.map((test) => compactTest(test, executionResults[test.id], validationResults[test.id], diagnosisResults[test.id])),
    request: wantsRequest && requestDraft ? compactRequest(requestDraft) : undefined,
    endpointIndex: endpoints.slice(0, MAX_INDEX).map((endpoint) => `${endpoint.method} ${endpoint.path}`),
    selection: {
      focusTestId: focus?.id,
      matchedBy: focus ? 'focus' : selectedTests.length || selectedEndpoints.length || wantsRequest ? 'question' : 'none',
      clientTruncated,
    },
  };
}
