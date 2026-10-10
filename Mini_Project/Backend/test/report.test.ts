import assert from 'node:assert/strict';
import test from 'node:test';
import { ReportService, ReportValidationError } from '../src/services/report.service.js';
import { ReportController } from '../src/controllers/report.controller.js';
import type { GenerateReportRequest, ReportTestCaseInput } from '../src/types/report.types.js';

const spec = { metadata: { title: 'Sample API', version: '1.0.0' }, servers: [{ url: 'https://api.example.test/v1' }] };
const makeTest = (id: string, overrides: Partial<ReportTestCaseInput> = {}): ReportTestCaseInput => ({ id, name: `Test ${id}`, type: 'POSITIVE', priority: 'HIGH', enabled: true, endpoint: { method: 'GET', path: '/users' }, ...overrides });
const request = (overrides: Partial<GenerateReportRequest> = {}): GenerateReportRequest => ({ specification: spec, tests: [makeTest('one')], executionResults: [], validationResults: [], diagnosisResults: [], ...overrides });
const normalized = (value: ReturnType<ReportService['generateReport']>) => ({ ...value, metadata: { ...value.metadata, reportId: '', generatedAt: '' } });

test('report aggregates an empty suite without misleading percentages', () => {
  const report = new ReportService().generateReport(request({ tests: [] }));
  assert.equal(report.execution.totalTests, 0);
  assert.equal(report.execution.passRate, null);
  assert.equal(report.validation.assertionFailureRate, null);
  assert.deepEqual(report.endpoints, []);
});

test('report aggregates a complete passing suite', () => {
  const report = new ReportService().generateReport(request({
    executionResults: [{ testCaseId: 'one', executionId: 'exec', status: 'PASSED_EXECUTION', durationMs: 25, httpStatus: 200 }],
    validationResults: [{ testCaseId: 'one', executionId: 'exec', status: 'VALIDATION_PASSED', durationMs: 4, assertions: [{ category: 'STATUS_CODE', path: '$.status', expected: '200', actual: '200', passed: true, message: 'matched' }] }],
  }));
  assert.equal(report.execution.passRate, 100);
  assert.equal(report.validation.validationPassed, 1);
  assert.equal(report.endpoints[0].overallStatus, 'PASSED');
  assert.equal(report.failures.length, 0);
});

test('execution failures remain distinct from validation failures', () => {
  const report = new ReportService().generateReport(request({
    executionResults: [{ testCaseId: 'one', executionId: 'exec', status: 'FAILED_EXECUTION', durationMs: 9, errorMessage: 'DNS unavailable' }],
    validationResults: [{ testCaseId: 'one', executionId: 'exec', status: 'NOT_VALIDATABLE', durationMs: 0, assertions: [] }],
  }));
  assert.equal(report.execution.failedExecution, 1);
  assert.equal(report.validation.validationFailed, 0);
  assert.equal(report.validation.notValidatable, 1);
  assert.equal(report.failures[0].message, 'DNS unavailable');
});

test('report aggregates validation categories and optional AI findings separately', () => {
  const report = new ReportService().generateReport(request({
    executionResults: [{ testCaseId: 'one', executionId: 'exec', status: 'PASSED_EXECUTION', durationMs: 25, httpStatus: 200 }],
    validationResults: [{ testCaseId: 'one', executionId: 'exec', status: 'VALIDATION_FAILED', durationMs: 3, assertions: [{ category: 'SCHEMA_TYPE', path: '$.body.id', expected: 'string', actual: 'number', passed: false, message: 'type mismatch' }] }],
    diagnosisResults: [{ diagnosisId: 'd1', testCaseId: 'one', executionId: 'exec', durationMs: 8, confidence: 'HIGH', summary: 'Contract drift', findings: [{ severity: 'ERROR' }, { severity: 'WARNING' }] }],
  }));
  assert.equal(report.validation.failureByCategory.SCHEMA_TYPE, 1);
  assert.equal(report.diagnosis.totalFindings, 2);
  assert.equal(report.diagnosis.severityDistribution.ERROR, 1);
  assert.equal(report.failures[0].aiSeverity, 'ERROR');
});

test('duplicate test IDs are rejected and inputs are never mutated', () => {
  const input = request({ tests: [makeTest('same'), makeTest('same')] });
  const before = structuredClone(input);
  assert.throws(() => new ReportService().generateReport(input), ReportValidationError);
  assert.deepEqual(input, before);
});

test('aggregation is deterministic apart from generated metadata and handles a large suite', () => {
  const tests = Array.from({ length: 500 }, (_, index) => makeTest(`t-${index}`, { endpoint: { method: index % 2 ? 'POST' : 'GET', path: `/items/${index % 10}` } }));
  const input = request({ tests, executionResults: tests.map((item, index) => ({ testCaseId: item.id, executionId: `e-${index}`, status: 'PASSED_EXECUTION' as const, durationMs: 1, httpStatus: 200 })), validationResults: tests.map((item, index) => ({ testCaseId: item.id, executionId: `e-${index}`, status: 'VALIDATION_PASSED' as const, durationMs: 1, assertions: [] })) });
  const service = new ReportService();
  assert.deepEqual(normalized(service.generateReport(input)), normalized(service.generateReport(input)));
  assert.equal(service.generateReport(input).endpoints.length, 10);
});

test('mixed execution and validation states preserve skipped, unvalidated, and not-validatable semantics', () => {
  const tests = ['pass', 'execution-fail', 'error', 'skipped', 'unvalidated', 'not-validatable'].map((id) => makeTest(id));
  const report = new ReportService().generateReport(request({
    tests,
    executionResults: [
      { testCaseId: 'pass', executionId: 'e1', status: 'PASSED_EXECUTION', durationMs: 1 },
      { testCaseId: 'execution-fail', executionId: 'e2', status: 'FAILED_EXECUTION', durationMs: 1 },
      { testCaseId: 'error', executionId: 'e3', status: 'ERROR', durationMs: 1 },
      { testCaseId: 'skipped', executionId: 'e4', status: 'SKIPPED', durationMs: 0 },
      { testCaseId: 'unvalidated', executionId: 'e5', status: 'PASSED_EXECUTION', durationMs: 1 },
      { testCaseId: 'not-validatable', executionId: 'e6', status: 'FAILED_EXECUTION', durationMs: 1 },
    ],
    validationResults: [
      { testCaseId: 'pass', executionId: 'e1', status: 'VALIDATION_PASSED', durationMs: 1, assertions: [] },
      { testCaseId: 'execution-fail', executionId: 'e2', status: 'NOT_VALIDATABLE', durationMs: 0, assertions: [] },
      { testCaseId: 'error', executionId: 'e3', status: 'NOT_VALIDATABLE', durationMs: 0, assertions: [] },
      { testCaseId: 'skipped', executionId: 'e4', status: 'SKIPPED', durationMs: 0, assertions: [] },
      { testCaseId: 'not-validatable', executionId: 'e6', status: 'NOT_VALIDATABLE', durationMs: 0, assertions: [] },
    ],
  }));
  assert.deepEqual(report.execution, { totalTests: 6, executedTests: 5, passedExecution: 2, failedExecution: 2, errors: 1, skipped: 1, unexecuted: 0, averageDurationMs: 1, passRate: 40 });
  assert.equal(report.validation.validationFailed, 0);
  assert.equal(report.validation.notValidatable, 3);
  assert.equal(report.validation.skipped, 1);
  assert.equal(report.validation.unvalidated, 1);
});

test('all validation failures retain multiple assertion categories and group endpoints deterministically', () => {
  const tests = [makeTest('a', { endpoint: { method: 'POST', path: '/orders' } }), makeTest('b', { endpoint: { method: 'GET', path: '/users' } })];
  const report = new ReportService().generateReport(request({
    tests,
    executionResults: tests.map((item, index) => ({ testCaseId: item.id, executionId: `e${index}`, status: 'PASSED_EXECUTION' as const, durationMs: 1 })),
    validationResults: tests.map((item, index) => ({ testCaseId: item.id, executionId: `e${index}`, status: 'VALIDATION_FAILED' as const, durationMs: 1, assertions: [
      { category: 'STATUS_CODE' as const, path: '$.status', expected: '200', actual: '500', passed: false, message: 'wrong status' },
      { category: 'SCHEMA_TYPE' as const, path: '$.body.id', expected: 'string', actual: 'number', passed: false, message: 'wrong type' },
    ] })),
  }));
  assert.equal(report.validation.validationFailed, 2);
  assert.equal(report.validation.failedAssertions, 4);
  assert.equal(report.validation.failureByCategory.STATUS_CODE, 2);
  assert.equal(report.failures[0].failedAssertionCount, 2);
  assert.deepEqual(report.endpoints.map((item) => `${item.method} ${item.path}`), ['GET /users', 'POST /orders']);
});

test('AI confidence is counted separately and failures without a diagnosis remain visible', () => {
  const tests = [makeTest('diagnosed'), makeTest('not-diagnosed')];
  const executions = tests.map((item, index) => ({ testCaseId: item.id, executionId: `e${index}`, status: 'PASSED_EXECUTION' as const, durationMs: 1 }));
  const validations = tests.map((item, index) => ({ testCaseId: item.id, executionId: `e${index}`, status: 'VALIDATION_FAILED' as const, durationMs: 1, assertions: [{ category: 'HEADER' as const, path: '$.headers.x', expected: 'present', actual: 'missing', passed: false, message: 'missing header' }] }));
  const report = new ReportService().generateReport(request({ tests, executionResults: executions, validationResults: validations, diagnosisResults: [{ diagnosisId: 'd1', testCaseId: 'diagnosed', executionId: 'e0', durationMs: 2, confidence: 'LOW', summary: 'Needs review', findings: [{ severity: 'CRITICAL' }] }] }));
  assert.equal(report.diagnosis.confidenceDistribution.LOW, 1);
  assert.equal(report.diagnosis.severityDistribution.CRITICAL, 1);
  assert.equal(report.failures.find((item) => item.testCaseId === 'not-diagnosed')?.diagnosisId, undefined);
});

test('malformed requests and duplicate result references are rejected', () => {
  const service = new ReportService();
  assert.throws(() => service.generateReport({} as GenerateReportRequest), ReportValidationError);
  assert.throws(() => service.generateReport(request({ executionResults: [
    { testCaseId: 'one', executionId: 'e1', status: 'PASSED_EXECUTION', durationMs: 1 },
    { testCaseId: 'one', executionId: 'e2', status: 'PASSED_EXECUTION', durationMs: 1 },
  ] })), /Duplicate execution result/);
  assert.throws(() => service.generateReport(request({
    executionResults: [{ testCaseId: 'one', executionId: 'e1', status: 'PASSED_EXECUTION', durationMs: 1 }],
    validationResults: [{ testCaseId: 'one', executionId: 'other', status: 'VALIDATION_PASSED', durationMs: 1, assertions: [] }],
  })), /matching execution result/);
});

test('report output redacts credentials and ignores raw request and response fields', () => {
  const unsafe = request({ specification: { metadata: spec.metadata, servers: [{ url: 'https://name:password@example.test/v1' }] },
    executionResults: [{ testCaseId: 'one', executionId: 'e1', status: 'FAILED_EXECUTION', durationMs: 1, errorMessage: 'Authorization: Bearer top-secret-token' }],
    validationResults: [{ testCaseId: 'one', executionId: 'e1', status: 'NOT_VALIDATABLE', durationMs: 0, assertions: [] }],
  }) as GenerateReportRequest & { requestBody?: string; responseBody?: string };
  unsafe.requestBody = 'password=super-secret'; unsafe.responseBody = 'cookie=session-secret';
  const serialized = JSON.stringify(new ReportService().generateReport(unsafe));
  assert.equal(serialized.includes('top-secret-token'), false);
  assert.equal(serialized.includes('super-secret'), false);
  assert.equal(serialized.includes('session-secret'), false);
  assert.equal(serialized.includes('name:password@'), false);
});

test('report controller returns 400 for a malformed report request', () => {
  const controller = new ReportController();
  let statusCode = 0; let payload: unknown;
  const response = { status(code: number) { statusCode = code; return this; }, json(value: unknown) { payload = value; return this; } };
  controller.generate({ body: {} } as never, response as never);
  assert.equal(statusCode, 400);
  assert.match((payload as { error: { message: string } }).error.message, /required/);
});
