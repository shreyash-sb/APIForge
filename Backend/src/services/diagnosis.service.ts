/**
 * DiagnosisService — Phase 7 AI Diagnosis orchestration.
 *
 * Responsibilities:
 *  1. Sanitize raw test evidence (strip secrets, truncate bodies)
 *  2. Delegate to the configured AiProvider
 *  3. Return DiagnosisResult — advisory only; never mutates Phase 6 results
 *
 * Phase 6 ValidationService remains the deterministic source of truth.
 */

import { randomUUID } from 'node:crypto';
import type { TestCase } from '../types/testCase.types.js';
import type { TestCaseExecutionResult } from '../types/testExecution.types.js';
import type { TestCaseValidationResult } from '../types/validation.types.js';
import type {
  DiagnoseBatchFailure,
  DiagnoseBatchItem,
  DiagnoseBatchResult,
  DiagnosisResult,
  SanitizedEvidence,
} from '../types/diagnosis.types.js';
import { MAX_BODY_EXCERPT_BYTES, MAX_DIAGNOSIS_BATCH_SIZE } from '../types/diagnosis.types.js';
import { MockAiProvider, type AiProvider } from './aiProvider.service.js';
import { isSensitiveKey, redactDeep, redactSecrets } from '../utils/secretRedaction.js';

function sanitizeBodyExcerpt(body: unknown): string | null {
  if (body === null || body === undefined) return null;
  // Redact before truncating so a cut can never split a secret past the patterns.
  const raw = redactSecrets(typeof body === 'string' ? body : JSON.stringify(redactDeep(body)) ?? '');
  const truncated = raw.length > MAX_BODY_EXCERPT_BYTES ? raw.slice(0, MAX_BODY_EXCERPT_BYTES) + '…' : raw;
  return redactSecrets(truncated);
}

function sanitizeHeaders(raw: Record<string, string> | undefined): Record<string, string> {
  if (!raw) return {};
  const REDACTED_HEADER_KEYS = new Set([
    'authorization',
    'x-api-key',
    'x-auth-token',
    'cookie',
    'set-cookie',
    'proxy-authorization',
  ]);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = REDACTED_HEADER_KEYS.has(k.toLowerCase()) || isSensitiveKey(k) ? '[REDACTED]' : redactSecrets(String(v));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Core sanitization: TestCase + Execution + Validation → SanitizedEvidence
// ---------------------------------------------------------------------------

function buildEvidence(
  testCase: TestCase,
  executionResult: TestCaseExecutionResult,
  validationResult: TestCaseValidationResult
): SanitizedEvidence {
  return {
    testCase: {
      id: testCase.id,
      name: redactSecrets(String(testCase.name ?? '')),
      description: redactSecrets(String(testCase.description ?? '')),
      type: testCase.type,
      priority: testCase.priority,
      endpoint: {
        method: testCase.endpoint.method,
        path: redactSecrets(testCase.endpoint.path),
      },
      expected: {
        statusCodes: testCase.expected.statusCodes,
        statusClass: testCase.expected.statusClass,
        conditions: testCase.expected.conditions?.map((condition) => redactSecrets(String(condition))),
      },
    },
    execution: {
      status: executionResult.status,
      durationMs: executionResult.durationMs,
      response: executionResult.response
        ? {
            status: executionResult.response.status,
            statusText: executionResult.response.statusText,
            headers: sanitizeHeaders(executionResult.response.headers as Record<string, string>),
            bodyExcerpt: sanitizeBodyExcerpt(executionResult.response.body),
            size: executionResult.response.size ?? 0,
          }
        : undefined,
      error: executionResult.error
        ? redactSecrets(
            typeof executionResult.error === 'string'
              ? executionResult.error
              : (executionResult.error as { message?: string }).message ?? String(executionResult.error)
          )
        : undefined,
    },
    validation: {
      status: validationResult.status,
      summary: { ...validationResult.summary },
      failedAssertions: validationResult.assertions
        .filter((a) => !a.passed)
        .map((a) => ({
          category: a.category,
          path: a.path,
          expected: redactSecrets(String(a.expected ?? '')),
          actual: redactSecrets(String(a.actual ?? '')),
          message: redactSecrets(String(a.message ?? '')),
        })),
    },
  };
}

// ---------------------------------------------------------------------------
// DiagnosisService
// ---------------------------------------------------------------------------

export class DiagnosisService {
  /**
   * A provider injected at construction (tests, CLI) is always used.
   * Without one, callers pass a request-scoped provider resolved from the
   * authenticated user's session; the fallback is the mock/demo provider.
   */
  private readonly fixedProvider?: AiProvider;

  constructor(provider?: AiProvider) {
    this.fixedProvider = provider;
  }

  get usesFixedProvider(): boolean {
    return Boolean(this.fixedProvider);
  }

  private pickProvider(requestProvider?: AiProvider): AiProvider {
    return this.fixedProvider ?? requestProvider ?? new MockAiProvider();
  }

  async diagnoseSingle(
    testCase: TestCase,
    executionResult: TestCaseExecutionResult,
    validationResult: TestCaseValidationResult,
    requestProvider?: AiProvider
  ): Promise<DiagnosisResult> {
    const provider = this.pickProvider(requestProvider);
    const startedAt = Date.now();
    const evidence = buildEvidence(testCase, executionResult, validationResult);

    const aiResponse = await provider.diagnose(evidence);
    const providerStatus = aiResponse.providerStatus ?? (provider.name === 'mock' ? 'mock' : 'live');

    const durationMs = Date.now() - startedAt;

    return {
      diagnosisId: randomUUID(),
      testCaseId: testCase.id,
      executionId: executionResult.executionId,
      diagnosedAt: new Date().toISOString(),
      durationMs,
      // Fallback content was produced deterministically, so it is never labelled as Gemini.
      provider: providerStatus === 'live' ? provider.name : 'mock',
      providerStatus,
      fallbackReason: aiResponse.fallbackReason,
      validationStatus: validationResult.status,
      confidence: aiResponse.confidence,
      summary: aiResponse.summary,
      findings: aiResponse.findings,
      promptExcerpt: aiResponse.promptExcerpt,
    };
  }

  async diagnoseBatch(items: DiagnoseBatchItem[], requestProvider?: AiProvider): Promise<DiagnoseBatchResult> {
    if (items.length > MAX_DIAGNOSIS_BATCH_SIZE) {
      throw new Error(
        `Batch limit exceeded: maximum allowed is ${MAX_DIAGNOSIS_BATCH_SIZE} items, received ${items.length}.`
      );
    }

    const provider = this.pickProvider(requestProvider);
    const startedAt = Date.now();
    const results: DiagnosisResult[] = [];
    const failures: DiagnoseBatchFailure[] = [];

    for (const item of items) {
      // Sequential to respect rate limits; one failing item never discards the others.
      try {
        results.push(await this.diagnoseSingle(item.testCase, item.executionResult, item.validationResult, provider));
      } catch {
        failures.push({
          testCaseId: item.testCase.id,
          executionId: item.executionResult.executionId,
          message: 'This case could not be diagnosed. Retry later.',
        });
      }
    }

    return {
      batchId: randomUUID(),
      diagnosedAt: new Date().toISOString(),
      totalDurationMs: Date.now() - startedAt,
      results,
      ...(failures.length ? { failures } : {}),
    };
  }
}
