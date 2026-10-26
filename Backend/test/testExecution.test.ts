import assert from 'node:assert/strict';
import test from 'node:test';
import { TestExecutionService } from '../src/services/testExecution.service.js';
import { RequestExecutorService } from '../src/services/requestExecutor.service.js';
import type { ApiExecutionResult, ApiRequest } from '../src/types/request.types.js';
import type { TestCase } from '../src/types/testCase.types.js';
import { MAX_BATCH_SIZE } from '../src/types/testExecution.types.js';

// Helper mock executor to isolate execution outcomes deterministically without external network calls
class MockRequestExecutor extends RequestExecutorService {
  public executedRequests: ApiRequest[] = [];
  public mockResponse: ApiExecutionResult;

  constructor(mockResponse: ApiExecutionResult) {
    super();
    this.mockResponse = mockResponse;
  }

  override async execute(request: ApiRequest): Promise<ApiExecutionResult> {
    this.executedRequests.push(request);
    return this.mockResponse;
  }
}

const createTestCase = (overrides?: Partial<TestCase>): TestCase => ({
  id: 'test_1',
  name: 'Sample Test',
  description: 'A sample test for execution',
  type: 'POSITIVE',
  priority: 'HIGH',
  enabled: true,
  endpoint: { method: 'GET', path: '/users' },
  request: {
    method: 'GET',
    url: 'https://api.example.test/users',
    queryParams: [{ key: 'page', value: '1', enabled: true }],
    headers: [{ key: 'Accept', value: 'application/json', enabled: true }],
    body: null,
    auth: { type: 'none' },
  },
  pathParams: {},
  expected: { statusCodes: ['200'] },
  metadata: { sourceEndpointId: 'GET /users', rule: 'valid-request' },
  ...overrides,
});

test('single test execution with HTTP 200 records PASSED_EXECUTION and preserves response data', async () => {
  const mock = new MockRequestExecutor({
    success: true,
    status: 200,
    statusText: 'OK',
    responseTime: 42,
    headers: { 'content-type': 'application/json' },
    body: { id: 1, name: 'Alice' },
    size: 32,
  });

  const service = new TestExecutionService(mock);
  const tc = createTestCase();
  const result = await service.executeSingle(tc);

  assert.equal(result.testCaseId, 'test_1');
  assert.equal(result.status, 'PASSED_EXECUTION');
  assert.equal(result.response?.status, 200);
  assert.equal(result.response?.statusText, 'OK');
  assert.deepEqual(result.response?.body, { id: 1, name: 'Alice' });
  assert.equal(result.response?.responseTime, 42);
  assert.ok(result.durationMs >= 0);
  assert.equal(mock.executedRequests.length, 1);
});

test('single test execution with HTTP 404 or 500 is treated as PASSED_EXECUTION (Phase 5 records execution, not validation)', async () => {
  const notFoundMock = new MockRequestExecutor({
    success: true,
    status: 404,
    statusText: 'Not Found',
    responseTime: 30,
    headers: {},
    body: { error: 'Not found' },
    size: 22,
  });

  const service1 = new TestExecutionService(notFoundMock);
  const res1 = await service1.executeSingle(createTestCase());
  assert.equal(res1.status, 'PASSED_EXECUTION');
  assert.equal(res1.response?.status, 404);

  const serverErrorMock = new MockRequestExecutor({
    success: true,
    status: 500,
    statusText: 'Internal Server Error',
    responseTime: 55,
    headers: {},
    body: { error: 'Fatal error' },
    size: 24,
  });

  const service2 = new TestExecutionService(serverErrorMock);
  const res2 = await service2.executeSingle(createTestCase());
  assert.equal(res2.status, 'PASSED_EXECUTION');
  assert.equal(res2.response?.status, 500);
});

test('network failure, timeout, and outbound policy blocks are treated as FAILED_EXECUTION', async () => {
  const timeoutMock = new MockRequestExecutor({
    success: false,
    error: {
      type: 'TIMEOUT',
      message: 'Request timed out after 30000ms',
    },
  });

  const service1 = new TestExecutionService(timeoutMock);
  const res1 = await service1.executeSingle(createTestCase());
  assert.equal(res1.status, 'FAILED_EXECUTION');
  assert.equal(res1.error?.type, 'TIMEOUT');
  assert.equal(res1.response, undefined);

  const networkMock = new MockRequestExecutor({
    success: false,
    error: {
      type: 'NETWORK_ERROR',
      message: 'DNS lookup failed - host not found',
    },
  });

  const service2 = new TestExecutionService(networkMock);
  const res2 = await service2.executeSingle(createTestCase());
  assert.equal(res2.status, 'FAILED_EXECUTION');
  assert.equal(res2.error?.type, 'NETWORK_ERROR');

  const policyMock = new MockRequestExecutor({
    success: false,
    error: {
      type: 'OUTBOUND_POLICY',
      message: 'This destination is blocked by the outbound-request policy',
    },
  });

  const service3 = new TestExecutionService(policyMock);
  const res3 = await service3.executeSingle(createTestCase());
  assert.equal(res3.status, 'FAILED_EXECUTION');
  assert.equal(res3.error?.type, 'OUTBOUND_POLICY');
});

test('unknown internal error is classified as ERROR', async () => {
  const errorMock = new MockRequestExecutor({
    success: false,
    error: {
      type: 'UNKNOWN_ERROR',
      message: 'Internal execution glitch',
    },
  });

  const service = new TestExecutionService(errorMock);
  const res = await service.executeSingle(createTestCase());
  assert.equal(res.status, 'ERROR');
  assert.equal(res.error?.type, 'UNKNOWN_ERROR');
});

test('disabled testCase (enabled: false) is SKIPPED with 0ms duration and no HTTP dispatch', async () => {
  const mock = new MockRequestExecutor({
    success: true,
    status: 200,
    statusText: 'OK',
    responseTime: 10,
    headers: {},
    body: {},
  });

  const service = new TestExecutionService(mock);
  const tc = createTestCase({ enabled: false });
  const result = await service.executeSingle(tc);

  assert.equal(result.status, 'SKIPPED');
  assert.equal(result.durationMs, 0);
  assert.equal(result.response, undefined);
  assert.equal(mock.executedRequests.length, 0);
});

test('sequential batch execution preserves order and calculates accurate execution summary', async () => {
  let callCount = 0;
  class DynamicMockExecutor extends RequestExecutorService {
    override async execute(req: ApiRequest): Promise<ApiExecutionResult> {
      callCount++;
      if (req.url.includes('fail')) {
        return {
          success: false,
          error: { type: 'NETWORK_ERROR', message: 'Target unreachable' },
        };
      }
      return {
        success: true,
        status: 200,
        statusText: 'OK',
        responseTime: 20,
        headers: {},
        body: { count: callCount },
      };
    }
  }

  const service = new TestExecutionService(new DynamicMockExecutor());
  const testCases: TestCase[] = [
    createTestCase({ id: 'tc_1', request: { method: 'GET', url: 'https://api.test/pass1', auth: { type: 'none' } } }),
    createTestCase({ id: 'tc_2', enabled: false }),
    createTestCase({ id: 'tc_3', request: { method: 'GET', url: 'https://api.test/fail', auth: { type: 'none' } } }),
    createTestCase({ id: 'tc_4', request: { method: 'GET', url: 'https://api.test/pass2', auth: { type: 'none' } } }),
  ];

  const batchResult = await service.executeBatch(testCases);

  assert.equal(batchResult.results.length, 4);
  assert.equal(batchResult.results[0].testCaseId, 'tc_1');
  assert.equal(batchResult.results[0].status, 'PASSED_EXECUTION');
  assert.equal(batchResult.results[1].testCaseId, 'tc_2');
  assert.equal(batchResult.results[1].status, 'SKIPPED');
  assert.equal(batchResult.results[2].testCaseId, 'tc_3');
  assert.equal(batchResult.results[2].status, 'FAILED_EXECUTION');
  assert.equal(batchResult.results[3].testCaseId, 'tc_4');
  assert.equal(batchResult.results[3].status, 'PASSED_EXECUTION');

  assert.deepEqual(batchResult.summary, {
    total: 4,
    executed: 3,
    passedExecution: 2,
    failedExecution: 1,
    errors: 0,
    skipped: 1,
    totalDurationMs: batchResult.summary.totalDurationMs,
  });
  assert.ok(batchResult.summary.totalDurationMs >= 0);
});

test('enforces batch limit of MAX_BATCH_SIZE (100)', async () => {
  const service = new TestExecutionService(new MockRequestExecutor({ success: true, status: 200, statusText: 'OK', responseTime: 1, headers: {}, body: null }));
  const oversizedBatch: TestCase[] = Array.from({ length: MAX_BATCH_SIZE + 1 }, (_, i) =>
    createTestCase({ id: `tc_${i}` })
  );

  await assert.rejects(
    async () => {
      await service.executeBatch(oversizedBatch);
    },
    {
      message: `Batch size exceeds maximum limit of ${MAX_BATCH_SIZE} test cases.`,
    }
  );
});

test('handles empty batch gracefully', async () => {
  const service = new TestExecutionService(new MockRequestExecutor({ success: true, status: 200, statusText: 'OK', responseTime: 1, headers: {}, body: null }));
  const emptyResult = await service.executeBatch([]);
  assert.equal(emptyResult.results.length, 0);
  assert.deepEqual(emptyResult.summary, {
    total: 0,
    executed: 0,
    passedExecution: 0,
    failedExecution: 0,
    errors: 0,
    skipped: 0,
    totalDurationMs: emptyResult.summary.totalDurationMs,
  });
});

test('redacts Bearer tokens, Basic passwords, and header API keys in sanitized request', async () => {
  const service = new TestExecutionService(new MockRequestExecutor({ success: true, status: 200, statusText: 'OK', responseTime: 1, headers: {}, body: null }));

  const bearerTc = createTestCase({
    request: {
      method: 'GET',
      url: 'https://api.test/profile',
      headers: [{ key: 'Authorization', value: 'Bearer secret_token_123', enabled: true }],
      auth: { type: 'bearer', token: 'secret_token_123' },
    },
  });

  const bearerRes = await service.executeSingle(bearerTc);
  assert.equal(bearerRes.request.auth.redacted, true);
  assert.equal(bearerRes.request.headers?.[0].value, '[REDACTED]');

  const basicTc = createTestCase({
    request: {
      method: 'GET',
      url: 'https://api.test/admin',
      headers: [{ key: 'Authorization', value: 'Basic dXNlcjpwYXNz', enabled: true }],
      auth: { type: 'basic', username: 'admin', password: 'supersecretpassword' },
    },
  });

  const basicRes = await service.executeSingle(basicTc);
  assert.equal(basicRes.request.auth.redacted, true);
  assert.equal(basicRes.request.headers?.[0].value, '[REDACTED]');

  const keyTc = createTestCase({
    request: {
      method: 'GET',
      url: 'https://api.test/items',
      headers: [{ key: 'X-API-KEY', value: 'my_secret_key_999', enabled: true }],
      auth: { type: 'apikey', key: 'X-API-KEY', value: 'my_secret_key_999', addTo: 'header' },
    },
  });

  const keyRes = await service.executeSingle(keyTc);
  assert.equal(keyRes.request.auth.redacted, true);
  assert.equal(keyRes.request.headers?.[0].value, '[REDACTED]');
});

test('redacts query API keys in queryParams and display URL', async () => {
  const service = new TestExecutionService(new MockRequestExecutor({ success: true, status: 200, statusText: 'OK', responseTime: 1, headers: {}, body: null }));

  const queryKeyTc = createTestCase({
    request: {
      method: 'GET',
      url: 'https://api.test/items?api_key=secret_query_val&other=safe',
      queryParams: [
        { key: 'api_key', value: 'secret_query_val', enabled: true },
        { key: 'other', value: 'safe', enabled: true },
      ],
      auth: { type: 'apikey', key: 'api_key', value: 'secret_query_val', addTo: 'query' },
    },
  });

  const res = await service.executeSingle(queryKeyTc);
  assert.equal(res.request.auth.redacted, true);
  assert.equal(res.request.queryParams?.[0].value, '[REDACTED]');
  assert.equal(res.request.queryParams?.[1].value, 'safe');
  assert.ok(res.request.url.includes('api_key=%5BREDACTED%5D') || res.request.url.includes('api_key=[REDACTED]'));
  assert.ok(!res.request.url.includes('secret_query_val'));
});

test('does NOT mutate the original TestCase or its request', async () => {
  const service = new TestExecutionService(new MockRequestExecutor({ success: true, status: 200, statusText: 'OK', responseTime: 1, headers: {}, body: null }));

  const originalTc = createTestCase({
    request: {
      method: 'GET',
      url: 'https://api.test/users',
      headers: [{ key: 'Authorization', value: 'Bearer secret_token', enabled: true }],
      queryParams: [{ key: 'api_key', value: 'secret_key', enabled: true }],
      body: '{"foo":"bar"}',
      auth: { type: 'bearer', token: 'secret_token' },
    },
  });

  const clonedBefore = JSON.parse(JSON.stringify(originalTc));
  await service.executeSingle(originalTc);
  assert.deepEqual(originalTc, clonedBefore);
});

test('TestExecutionController validates single test case payload and executes successfully', async () => {
  const { TestExecutionController } = await import('../src/controllers/testExecution.controller.js');
  const service = new TestExecutionService(new MockRequestExecutor({ success: true, status: 200, statusText: 'OK', responseTime: 15, headers: {}, body: { ok: true } }));
  const controller = new TestExecutionController(service);

  let statusCode = 200;
  let responseData: Record<string, unknown> | null = null;
  const mockRes = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: unknown) {
      responseData = data as Record<string, unknown>;
      return this;
    },
  };

  type Req = Parameters<typeof controller.executeSingle>[0];
  type Res = Parameters<typeof controller.executeSingle>[1];

  // Missing testCase -> 400
  await controller.executeSingle({ body: {} } as Req, mockRes as unknown as Res);
  assert.equal(statusCode, 400);

  // Valid testCase -> 200
  statusCode = 200;
  await controller.executeSingle({ body: { testCase: createTestCase() } } as Req, mockRes as unknown as Res);
  assert.equal(statusCode, 200);
  assert.equal(responseData?.status, 'PASSED_EXECUTION');
});

test('TestExecutionController validates batch payload and rejects oversized batches', async () => {
  const { TestExecutionController } = await import('../src/controllers/testExecution.controller.js');
  const service = new TestExecutionService(new MockRequestExecutor({ success: true, status: 200, statusText: 'OK', responseTime: 15, headers: {}, body: { ok: true } }));
  const controller = new TestExecutionController(service);

  let statusCode = 200;
  let responseData: Record<string, unknown> | null = null;
  const mockRes = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: unknown) {
      responseData = data as Record<string, unknown>;
      return this;
    },
  };

  type Req = Parameters<typeof controller.executeBatch>[0];
  type Res = Parameters<typeof controller.executeBatch>[1];

  // Non-array testCases -> 400
  await controller.executeBatch({ body: { testCases: 'not-array' } } as Req, mockRes as unknown as Res);
  assert.equal(statusCode, 400);

  // Oversized batch -> 400
  statusCode = 200;
  const oversized = Array.from({ length: 101 }, (_, i) => createTestCase({ id: `tc_${i}` }));
  await controller.executeBatch({ body: { testCases: oversized } } as Req, mockRes as unknown as Res);
  assert.equal(statusCode, 400);
  const errorObj = responseData?.error as { message?: string } | undefined;
  assert.ok(errorObj?.message?.includes('Batch limit exceeded'));

  // Valid batch -> 200
  statusCode = 200;
  await controller.executeBatch({ body: { testCases: [createTestCase()] } } as Req, mockRes as unknown as Res);
  assert.equal(statusCode, 200);
  const summaryObj = responseData?.summary as { total?: number } | undefined;
  assert.equal(summaryObj?.total, 1);
});

