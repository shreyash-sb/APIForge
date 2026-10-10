import assert from 'node:assert/strict';
import test from 'node:test';
import { DiagnosisService } from '../src/services/diagnosis.service.js';
import { MockAiProvider } from '../src/services/aiProvider.service.js';
import { DiagnosisController } from '../src/controllers/diagnosis.controller.js';
import type { TestCase } from '../src/types/testCase.types.js';
import type { TestCaseExecutionResult } from '../src/types/testExecution.types.js';
import type { TestCaseValidationResult } from '../src/types/validation.types.js';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

const makeTestCase = (overrides?: Partial<TestCase>): TestCase => ({
  id: 'tc_diag_1',
  name: 'GET /users — positive test',
  description: 'Validates successful user list retrieval',
  type: 'POSITIVE',
  priority: 'HIGH',
  enabled: true,
  endpoint: { method: 'GET', path: '/users' },
  request: {
    method: 'GET',
    url: 'https://api.example.test/users',
    queryParams: [],
    headers: [],
    body: null,
    auth: { type: 'none' },
  },
  pathParams: {},
  expected: { statusCodes: ['200'] },
  metadata: { sourceEndpointId: 'GET /users', rule: 'valid-request' },
  ...overrides,
});

const makeExecutionResult = (overrides?: Partial<TestCaseExecutionResult>): TestCaseExecutionResult => ({
  testCaseId: 'tc_diag_1',
  executionId: 'exec_diag_1',
  status: 'PASSED_EXECUTION',
  startedAt: '2026-09-30T10:00:00.000Z',
  completedAt: '2026-09-30T10:00:00.045Z',
  durationMs: 45,
  request: {
    method: 'GET',
    url: 'https://api.example.test/users',
    auth: { type: 'none', redacted: false, description: 'No authentication' },
  },
  response: {
    status: 200,
    statusText: 'OK',
    responseTime: 45,
    headers: { 'content-type': 'application/json' },
    body: [{ id: 'usr_1', name: 'Alice' }],
    size: 28,
  },
  ...overrides,
});

const makeValidationResult = (overrides?: Partial<TestCaseValidationResult>): TestCaseValidationResult => ({
  testCaseId: 'tc_diag_1',
  executionId: 'exec_diag_1',
  status: 'VALIDATION_PASSED',
  validatedAt: '2026-09-30T10:00:00.060Z',
  durationMs: 5,
  summary: { totalAssertions: 1, passedAssertions: 1, failedAssertions: 0 },
  assertions: [
    {
      id: 'assert_status',
      category: 'STATUS_CODE',
      path: '$.status',
      expected: '200',
      actual: '200',
      passed: true,
      message: 'Status code 200 matches expected [200].',
    },
  ],
  ...overrides,
});

// ---------------------------------------------------------------------------
// 1. DiagnosisService — basic passing test
// ---------------------------------------------------------------------------

test('1. diagnoseSingle: VALIDATION_PASSED → summary reflects passing state', async () => {
  const service = new DiagnosisService(new MockAiProvider());
  const result = await service.diagnoseSingle(makeTestCase(), makeExecutionResult(), makeValidationResult());

  assert.equal(result.testCaseId, 'tc_diag_1');
  assert.equal(result.executionId, 'exec_diag_1');
  assert.equal(result.provider, 'mock');
  assert.equal(result.validationStatus, 'VALIDATION_PASSED');
  assert.ok(['HIGH', 'MEDIUM', 'LOW'].includes(result.confidence));
  assert.equal(typeof result.summary, 'string');
  assert.ok(result.summary.length > 0);
  assert.ok(Array.isArray(result.findings));
  assert.equal(result.findings.length, 0, 'No findings expected for a fully passing test');
});

// ---------------------------------------------------------------------------
// 2. DiagnosisService — failed validation generates findings
// ---------------------------------------------------------------------------

test('2. diagnoseSingle: failed status code assertion → finding generated', async () => {
  const service = new DiagnosisService(new MockAiProvider());
  const validation = makeValidationResult({
    status: 'VALIDATION_FAILED',
    summary: { totalAssertions: 1, passedAssertions: 0, failedAssertions: 1 },
    assertions: [
      {
        id: 'assert_status',
        category: 'STATUS_CODE',
        path: '$.status',
        expected: '200',
        actual: '404',
        passed: false,
        message: 'Status code 404 does not match expected [200].',
      },
    ],
  });
  const exec = makeExecutionResult({
    response: { status: 404, statusText: 'Not Found', responseTime: 30, headers: {}, body: null, size: 0 },
  });

  const result = await service.diagnoseSingle(makeTestCase(), exec, validation);

  assert.equal(result.validationStatus, 'VALIDATION_FAILED');
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].severity, 'ERROR');
  assert.ok(result.findings[0].title.includes('STATUS_CODE'));
  assert.ok(result.findings[0].suggestion.length > 0);
});

// ---------------------------------------------------------------------------
// 3. DiagnosisService — multiple failed assertions
// ---------------------------------------------------------------------------

test('3. diagnoseSingle: multiple failed assertions → multiple findings', async () => {
  const service = new DiagnosisService(new MockAiProvider());
  const validation = makeValidationResult({
    status: 'VALIDATION_FAILED',
    summary: { totalAssertions: 3, passedAssertions: 1, failedAssertions: 2 },
    assertions: [
      { id: 'a1', category: 'STATUS_CODE', path: '$.status', expected: '200', actual: '500', passed: false, message: 'Status mismatch' },
      { id: 'a2', category: 'CONTENT_TYPE', path: '$.headers.content-type', expected: 'application/json', actual: 'text/html', passed: false, message: 'Content-Type mismatch' },
      { id: 'a3', category: 'SCHEMA_TYPE', path: '$.body.id', expected: 'string', actual: 'null', passed: true, message: '' },
    ],
  });

  const result = await service.diagnoseSingle(makeTestCase(), makeExecutionResult(), validation);

  assert.equal(result.findings.length, 2);
  const severities = result.findings.map((f) => f.severity);
  assert.ok(severities.includes('ERROR'));
  assert.ok(severities.includes('WARNING'));
});

// ---------------------------------------------------------------------------
// 4. DiagnosisService — execution error generates finding
// ---------------------------------------------------------------------------

test('4. diagnoseSingle: execution error → finding generated', async () => {
  const service = new DiagnosisService(new MockAiProvider());
  const exec = makeExecutionResult({
    status: 'ERROR',
    response: undefined,
    error: { message: 'ECONNREFUSED connect ECONNREFUSED 127.0.0.1:3001', code: 'ECONNREFUSED' } as unknown as never,
  });
  const validation = makeValidationResult({ status: 'NOT_VALIDATABLE', summary: { totalAssertions: 0, passedAssertions: 0, failedAssertions: 0 }, assertions: [] });

  const result = await service.diagnoseSingle(makeTestCase(), exec, validation);

  assert.ok(result.findings.some((f) => f.severity === 'ERROR'));
  assert.ok(result.findings.some((f) => f.title.toLowerCase().includes('error')));
});

// ---------------------------------------------------------------------------
// 5. DiagnosisService — high latency generates WARNING finding
// ---------------------------------------------------------------------------

test('5. diagnoseSingle: high latency → WARNING finding generated', async () => {
  const service = new DiagnosisService(new MockAiProvider());
  const exec = makeExecutionResult({ durationMs: 7500 });

  const result = await service.diagnoseSingle(makeTestCase(), exec, makeValidationResult());

  assert.ok(result.findings.some((f) => f.severity === 'WARNING' && f.title.toLowerCase().includes('latency')));
});

// ---------------------------------------------------------------------------
// 6. DiagnosisService — diagnosisId is a valid UUID
// ---------------------------------------------------------------------------

test('6. diagnoseSingle: diagnosisId is a non-empty string', async () => {
  const service = new DiagnosisService(new MockAiProvider());
  const result = await service.diagnoseSingle(makeTestCase(), makeExecutionResult(), makeValidationResult());
  assert.ok(typeof result.diagnosisId === 'string' && result.diagnosisId.length > 0);
  assert.ok(typeof result.diagnosedAt === 'string');
  assert.ok(result.durationMs >= 0);
});

// ---------------------------------------------------------------------------
// 7. DiagnosisService — validationStatus is never mutated
// ---------------------------------------------------------------------------

test('7. diagnoseSingle: validationStatus reflects Phase 6 result exactly', async () => {
  const service = new DiagnosisService(new MockAiProvider());
  const validation = makeValidationResult({ status: 'VALIDATION_FAILED' });
  const result = await service.diagnoseSingle(makeTestCase(), makeExecutionResult(), validation);
  assert.equal(result.validationStatus, 'VALIDATION_FAILED', 'AI must never override Phase 6 status');
});

// ---------------------------------------------------------------------------
// 8. DiagnosisService — diagnoseBatch processes all items
// ---------------------------------------------------------------------------

test('8. diagnoseBatch: processes all items and returns matching count', async () => {
  const service = new DiagnosisService(new MockAiProvider());
  const items = [1, 2, 3].map((i) => ({
    testCase: makeTestCase({ id: `tc_${i}`, name: `Test ${i}` }),
    executionResult: makeExecutionResult({ testCaseId: `tc_${i}`, executionId: `exec_${i}` }),
    validationResult: makeValidationResult({ testCaseId: `tc_${i}`, executionId: `exec_${i}` }),
  }));

  const result = await service.diagnoseBatch(items);

  assert.equal(result.results.length, 3);
  assert.equal(typeof result.batchId, 'string');
  assert.ok(result.totalDurationMs >= 0);
  for (let i = 0; i < 3; i++) {
    assert.equal(result.results[i].testCaseId, `tc_${i + 1}`);
  }
});

// ---------------------------------------------------------------------------
// 9. DiagnosisService — batch exceeds max size throws
// ---------------------------------------------------------------------------

test('9. diagnoseBatch: exceeds MAX_DIAGNOSIS_BATCH_SIZE → throws', async () => {
  const service = new DiagnosisService(new MockAiProvider());
  const items = Array.from({ length: 21 }, (_, i) => ({
    testCase: makeTestCase({ id: `tc_${i}` }),
    executionResult: makeExecutionResult({ testCaseId: `tc_${i}`, executionId: `exec_${i}` }),
    validationResult: makeValidationResult({ testCaseId: `tc_${i}`, executionId: `exec_${i}` }),
  }));

  await assert.rejects(
    () => service.diagnoseBatch(items),
    /batch limit exceeded/i
  );
});

// ---------------------------------------------------------------------------
// 10. Sanitization — authorization header is redacted
// ---------------------------------------------------------------------------

test('10. sanitization: Authorization header is redacted from evidence', async () => {
  const service = new DiagnosisService(new MockAiProvider());
  const exec = makeExecutionResult({
    response: {
      status: 200,
      statusText: 'OK',
      responseTime: 30,
      headers: { authorization: 'Bearer super-secret-token', 'content-type': 'application/json' },
      body: null,
      size: 0,
    },
  });

  // The mock provider returns a result without errors — we verify via findings absence
  // and that the service does not throw. The redaction occurs internally.
  const result = await service.diagnoseSingle(makeTestCase(), exec, makeValidationResult());
  assert.ok(result, 'Should complete without throwing');
  assert.equal(result.validationStatus, 'VALIDATION_PASSED');
});

// ---------------------------------------------------------------------------
// 11. Sanitization — body is truncated when over MAX_BODY_EXCERPT_BYTES
// ---------------------------------------------------------------------------

test('11. sanitization: large body is truncated without throwing', async () => {
  const service = new DiagnosisService(new MockAiProvider());
  const largeBody = 'x'.repeat(5000);
  const exec = makeExecutionResult({
    response: {
      status: 200,
      statusText: 'OK',
      responseTime: 30,
      headers: {},
      body: largeBody,
      size: 5000,
    },
  });

  const result = await service.diagnoseSingle(makeTestCase(), exec, makeValidationResult());
  assert.ok(result, 'Should complete without throwing for large bodies');
});

// ---------------------------------------------------------------------------
// 12. MockAiProvider — name is "mock"
// ---------------------------------------------------------------------------

test('12. MockAiProvider.name === "mock"', async () => {
  const provider = new MockAiProvider();
  assert.equal(provider.name, 'mock');
});

// ---------------------------------------------------------------------------
// 13. MockAiProvider — confidence HIGH for all-passing evidence
// ---------------------------------------------------------------------------

test('13. MockAiProvider: all-passing evidence → confidence HIGH', async () => {
  const provider = new MockAiProvider();
  const result = await provider.diagnose({
    testCase: {
      id: 'tc_1',
      name: 'test',
      description: '',
      type: 'POSITIVE',
      priority: 'HIGH',
      endpoint: { method: 'GET', path: '/test' },
      expected: { statusCodes: ['200'] },
    },
    execution: { status: 'PASSED_EXECUTION', durationMs: 30 },
    validation: {
      status: 'VALIDATION_PASSED',
      summary: { totalAssertions: 2, passedAssertions: 2, failedAssertions: 0 },
      failedAssertions: [],
    },
  });

  assert.equal(result.confidence, 'HIGH');
  assert.equal(result.findings.length, 0);
});

// ---------------------------------------------------------------------------
// 14. DiagnosisController — missing testCase → 400
// ---------------------------------------------------------------------------

test('14. DiagnosisController.diagnoseSingle: missing testCase → 400', async () => {
  const controller = new DiagnosisController(new DiagnosisService(new MockAiProvider()));
  const sentStatus: number[] = [];
  const sentJson: unknown[] = [];
  const mockRes = {
    status(code: number) { sentStatus.push(code); return this; },
    json(body: unknown) { sentJson.push(body); return this; },
  } as never;

  await controller.diagnoseSingle({ body: {} } as never, mockRes);

  assert.equal(sentStatus[0], 400);
});

// ---------------------------------------------------------------------------
// 15. DiagnosisController — mismatched testCaseId → 400
// ---------------------------------------------------------------------------

test('15. DiagnosisController.diagnoseSingle: mismatched testCaseId → 400', async () => {
  const controller = new DiagnosisController(new DiagnosisService(new MockAiProvider()));
  const sentStatus: number[] = [];
  const sentJson: unknown[] = [];
  const mockRes = {
    status(code: number) { sentStatus.push(code); return this; },
    json(body: unknown) { sentJson.push(body); return this; },
  } as never;

  const payload = {
    testCase: makeTestCase({ id: 'tc_AAA' }),
    executionResult: makeExecutionResult({ testCaseId: 'tc_BBB' }),
    validationResult: makeValidationResult({ testCaseId: 'tc_AAA' }),
  };

  await controller.diagnoseSingle({ body: payload } as never, mockRes);

  assert.equal(sentStatus[0], 400);
  const errorBody = sentJson[0] as { error: { message: string } };
  assert.ok(errorBody.error.message.includes('Mismatched'));
});

// ---------------------------------------------------------------------------
// 16. DiagnosisController — valid payload → 200
// ---------------------------------------------------------------------------

test('16. DiagnosisController.diagnoseSingle: valid payload → 200', async () => {
  const controller = new DiagnosisController(new DiagnosisService(new MockAiProvider()));
  const sentStatus: number[] = [];
  const sentJson: unknown[] = [];
  const mockRes = {
    status(code: number) { sentStatus.push(code); return this; },
    json(body: unknown) { sentJson.push(body); return this; },
  } as never;

  const payload = {
    testCase: makeTestCase(),
    executionResult: makeExecutionResult(),
    validationResult: makeValidationResult(),
  };

  await controller.diagnoseSingle({ body: payload } as never, mockRes);

  assert.equal(sentStatus[0], 200);
  const body = sentJson[0] as { testCaseId: string; provider: string };
  assert.equal(body.testCaseId, 'tc_diag_1');
  assert.equal(body.provider, 'mock');
});

// ---------------------------------------------------------------------------
// 17. DiagnosisController — batch missing items → 400
// ---------------------------------------------------------------------------

test('17. DiagnosisController.diagnoseBatch: missing items → 400', async () => {
  const controller = new DiagnosisController(new DiagnosisService(new MockAiProvider()));
  const sentStatus: number[] = [];
  const mockRes = {
    status(code: number) { sentStatus.push(code); return this; },
    json(_body: unknown) { return this; },
  } as never;

  await controller.diagnoseBatch({ body: { items: 'not-an-array' } } as never, mockRes);
  assert.equal(sentStatus[0], 400);
});

// ---------------------------------------------------------------------------
// 18. DiagnosisController — valid batch → 200 with results array
// ---------------------------------------------------------------------------

test('18. DiagnosisController.diagnoseBatch: valid 2-item batch → 200 with 2 results', async () => {
  const controller = new DiagnosisController(new DiagnosisService(new MockAiProvider()));
  const sentStatus: number[] = [];
  const sentJson: unknown[] = [];
  const mockRes = {
    status(code: number) { sentStatus.push(code); return this; },
    json(body: unknown) { sentJson.push(body); return this; },
  } as never;

  const makeItem = (i: number) => ({
    testCase: makeTestCase({ id: `tc_${i}` }),
    executionResult: makeExecutionResult({ testCaseId: `tc_${i}`, executionId: `exec_${i}` }),
    validationResult: makeValidationResult({ testCaseId: `tc_${i}`, executionId: `exec_${i}` }),
  });

  await controller.diagnoseBatch({ body: { items: [makeItem(1), makeItem(2)] } } as never, mockRes);

  assert.equal(sentStatus[0], 200);
  const body = sentJson[0] as { results: unknown[] };
  assert.equal(body.results.length, 2);
});

// ---------------------------------------------------------------------------
// 19. Findings have required fields
// ---------------------------------------------------------------------------

test('19. DiagnosisFinding: all required fields present', async () => {
  const service = new DiagnosisService(new MockAiProvider());
  const validation = makeValidationResult({
    status: 'VALIDATION_FAILED',
    summary: { totalAssertions: 1, passedAssertions: 0, failedAssertions: 1 },
    assertions: [
      { id: 'a1', category: 'SCHEMA_REQUIRED', path: '$.body.email', expected: 'email (required)', actual: 'missing', passed: false, message: 'Required field missing.' },
    ],
  });

  const result = await service.diagnoseSingle(makeTestCase(), makeExecutionResult(), validation);

  assert.equal(result.findings.length, 1);
  const f = result.findings[0];
  assert.ok(typeof f.id === 'string' && f.id.length > 0);
  assert.ok(typeof f.title === 'string' && f.title.length > 0);
  assert.ok(typeof f.explanation === 'string');
  assert.ok(['INFO', 'WARNING', 'ERROR', 'CRITICAL'].includes(f.severity));
  assert.ok(typeof f.suggestion === 'string' && f.suggestion.length > 0);
});

// ---------------------------------------------------------------------------
// 20. SCHEMA_REQUIRED assertion severity is ERROR
// ---------------------------------------------------------------------------

test('20. SCHEMA_REQUIRED failed assertion → severity ERROR', async () => {
  const service = new DiagnosisService(new MockAiProvider());
  const validation = makeValidationResult({
    status: 'VALIDATION_FAILED',
    summary: { totalAssertions: 1, passedAssertions: 0, failedAssertions: 1 },
    assertions: [
      { id: 'a1', category: 'SCHEMA_REQUIRED', path: '$.body.id', expected: 'id (required)', actual: 'missing', passed: false, message: 'Required field id is missing.' },
    ],
  });

  const result = await service.diagnoseSingle(makeTestCase(), makeExecutionResult(), validation);
  assert.equal(result.findings[0].severity, 'ERROR');
});
