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
  DiagnoseBatchItem,
  DiagnoseBatchResult,
  DiagnosisResult,
  SanitizedEvidence,
} from '../types/diagnosis.types.js';
import { MAX_BODY_EXCERPT_BYTES, MAX_DIAGNOSIS_BATCH_SIZE } from '../types/diagnosis.types.js';
import type { AiProvider } from './aiProvider.service.js';
import { createAiProvider } from './aiProvider.service.js';

// Patterns for values that must never leave the backend
const SECRET_PATTERNS = [
  /bearer\s+\S+/gi,
  // JSON commonly wraps property names and values in quotes; the old patterns
  // only matched `token: value`, allowing `{ "token": "value" }` through.
  /(["']?(?:access[_-]?token|refresh[_-]?token|auth(?:orization)?|api[-_]?key|password|secret|token)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,}\]]+)/gi,
];

function redactSecrets(value: string): string {
  let out = value;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  return out;
}

function sanitizeBodyExcerpt(body: unknown): string | null {
  if (body === null || body === undefined) return null;
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
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
    out[k] = REDACTED_HEADER_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : v;
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
      name: testCase.name,
      description: testCase.description,
      type: testCase.type,
      priority: testCase.priority,
      endpoint: {
        method: testCase.endpoint.method,
        path: testCase.endpoint.path,
      },
      expected: {
        statusCodes: testCase.expected.statusCodes,
        statusClass: testCase.expected.statusClass,
        conditions: testCase.expected.conditions,
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
          expected: redactSecrets(a.expected),
          actual: redactSecrets(a.actual),
          message: redactSecrets(a.message),
        })),
    },
  };
}

// ---------------------------------------------------------------------------
// DiagnosisService
// ---------------------------------------------------------------------------

export class DiagnosisService {
  private readonly provider: AiProvider;

  constructor(provider?: AiProvider) {
    this.provider = provider ?? createAiProvider();
  }

  async diagnoseSingle(
    testCase: TestCase,
    executionResult: TestCaseExecutionResult,
    validationResult: TestCaseValidationResult
  ): Promise<DiagnosisResult> {
    const startedAt = Date.now();
    const evidence = buildEvidence(testCase, executionResult, validationResult);

    const aiResponse = await this.provider.diagnose(evidence);

    const durationMs = Date.now() - startedAt;

    return {
      diagnosisId: randomUUID(),
      testCaseId: testCase.id,
      executionId: executionResult.executionId,
      diagnosedAt: new Date().toISOString(),
      durationMs,
      provider: this.provider.name,
      validationStatus: validationResult.status,
      confidence: aiResponse.confidence,
      summary: aiResponse.summary,
      findings: aiResponse.findings,
      promptExcerpt: aiResponse.promptExcerpt,
    };
  }

  async diagnoseBatch(items: DiagnoseBatchItem[]): Promise<DiagnoseBatchResult> {
    if (items.length > MAX_DIAGNOSIS_BATCH_SIZE) {
      throw new Error(
        `Batch limit exceeded: maximum allowed is ${MAX_DIAGNOSIS_BATCH_SIZE} items, received ${items.length}.`
      );
    }

    const startedAt = Date.now();
    const results: DiagnosisResult[] = [];

    for (const item of items) {
      // Sequential to respect rate limits
      const result = await this.diagnoseSingle(
        item.testCase,
        item.executionResult,
        item.validationResult
      );
      results.push(result);
    }

    return {
      batchId: randomUUID(),
      diagnosedAt: new Date().toISOString(),
      totalDurationMs: Date.now() - startedAt,
      results,
    };
  }
}
