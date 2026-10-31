import { RequestExecutorService } from './requestExecutor.service.js';
import type { ApiRequest, QueryParam, Header } from '../types/request.types.js';
import type { TestCase } from '../types/testCase.types.js';
import {
  MAX_BATCH_SIZE,
  type SanitizedApiRequest,
  type TestCaseExecutionResult,
  type TestExecutionStatus,
  type TestExecutionSummary,
  type TestSuiteExecutionResult,
} from '../types/testExecution.types.js';

export class TestExecutionService {
  private readonly requestExecutor: RequestExecutorService;

  constructor(requestExecutor: RequestExecutorService = new RequestExecutorService()) {
    this.requestExecutor = requestExecutor;
  }

  async executeSingle(testCase: TestCase): Promise<TestCaseExecutionResult> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const sanitizedRequest = this.sanitizeRequest(testCase.request);

    // If test is disabled, skip execution immediately without sending network requests
    if (!testCase.enabled) {
      const completedAt = new Date().toISOString();
      return {
        testCaseId: testCase.id,
        executionId,
        status: 'SKIPPED',
        startedAt,
        completedAt,
        durationMs: 0,
        request: sanitizedRequest,
      };
    }

    // Reuse existing Phase 2 RequestExecutorService
    const result = await this.requestExecutor.execute(testCase.request);
    const durationMs = Date.now() - startTime;
    const completedAt = new Date().toISOString();

    if (result.success) {
      // Any HTTP response (2xx, 3xx, 4xx, 5xx) counts as PASSED_EXECUTION because
      // the network request succeeded in reaching the server and receiving an HTTP response.
      // Response validation against expectations will be performed in Phase 6.
      return {
        testCaseId: testCase.id,
        executionId,
        status: 'PASSED_EXECUTION',
        startedAt,
        completedAt,
        durationMs,
        request: sanitizedRequest,
        response: result,
      };
    }

    // When the request failed to complete (DNS error, timeout, connection refused, blocked target)
    const status: TestExecutionStatus =
      result.error.type === 'UNKNOWN_ERROR' ? 'ERROR' : 'FAILED_EXECUTION';

    return {
      testCaseId: testCase.id,
      executionId,
      status,
      startedAt,
      completedAt,
      durationMs,
      request: sanitizedRequest,
      error: result.error,
    };
  }

  async executeBatch(testCases: TestCase[]): Promise<TestSuiteExecutionResult> {
    if (testCases.length > MAX_BATCH_SIZE) {
      throw new Error(`Batch size exceeds maximum limit of ${MAX_BATCH_SIZE} test cases.`);
    }

    const suiteExecutionId = `suite_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    const results: TestCaseExecutionResult[] = [];

    // Strictly sequential execution loop to prevent target flooding and ensure deterministic ordering
    for (const testCase of testCases) {
      const result = await this.executeSingle(testCase);
      results.push(result);
    }

    const completedAt = new Date().toISOString();
    const totalDurationMs = Date.now() - startTime;

    const summary: TestExecutionSummary = {
      total: testCases.length,
      executed: results.filter((r) => r.status !== 'SKIPPED').length,
      passedExecution: results.filter((r) => r.status === 'PASSED_EXECUTION').length,
      failedExecution: results.filter((r) => r.status === 'FAILED_EXECUTION').length,
      errors: results.filter((r) => r.status === 'ERROR').length,
      skipped: results.filter((r) => r.status === 'SKIPPED').length,
      totalDurationMs,
    };

    return {
      suiteExecutionId,
      startedAt,
      completedAt,
      summary,
      results,
    };
  }

  private sanitizeRequest(request: ApiRequest): SanitizedApiRequest {
    // Redact authentication headers and secrets
    const sanitizedHeaders: Header[] = (request.headers ?? []).map((header) => {
      const lowerKey = header.key.toLowerCase();
      if (
        lowerKey === 'authorization' ||
        lowerKey === 'x-api-key' ||
        (request.auth.type === 'apikey' &&
          request.auth.addTo === 'header' &&
          lowerKey === request.auth.key.toLowerCase())
      ) {
        return {
          ...header,
          value: '[REDACTED]',
        };
      }
      return { ...header };
    });

    // Redact query parameter credentials
    const sanitizedQueryParams: QueryParam[] = (request.queryParams ?? []).map((param) => {
      const lowerKey = param.key.toLowerCase();
      if (
        (request.auth.type === 'apikey' &&
          request.auth.addTo === 'query' &&
          lowerKey === request.auth.key.toLowerCase()) ||
        lowerKey.includes('apikey') ||
        lowerKey.includes('api_key') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('token')
      ) {
        return {
          ...param,
          value: '[REDACTED]',
        };
      }
      return { ...param };
    });

    // Redact query secrets in the displayed URL if present
    let sanitizedUrl = request.url;
    try {
      const parsedUrl = new URL(request.url);
      let modified = false;

      if (request.auth.type === 'apikey' && request.auth.addTo === 'query' && request.auth.key) {
        if (parsedUrl.searchParams.has(request.auth.key)) {
          parsedUrl.searchParams.set(request.auth.key, '[REDACTED]');
          modified = true;
        }
      }

      for (const [key] of parsedUrl.searchParams.entries()) {
        const lower = key.toLowerCase();
        if (
          lower.includes('apikey') ||
          lower.includes('api_key') ||
          lower.includes('secret') ||
          lower.includes('token')
        ) {
          parsedUrl.searchParams.set(key, '[REDACTED]');
          modified = true;
        }
      }

      if (modified) {
        sanitizedUrl = parsedUrl.toString();
      }
    } catch {
      // In case URL is relative or invalid, keep original string
    }

    return {
      method: request.method,
      url: sanitizedUrl,
      queryParams: sanitizedQueryParams,
      headers: sanitizedHeaders,
      body: request.body,
      auth: {
        type: request.auth.type,
        redacted: request.auth.type !== 'none',
        description:
          request.auth.type === 'none' ? 'None' : `${request.auth.type.toUpperCase()} [REDACTED]`,
      },
    };
  }
}
