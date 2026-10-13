import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkflowController } from '../src/controllers/workflow.controller.js';
import { WorkflowEngineService } from '../src/services/workflowEngine.service.js';
import { RequestExecutorService } from '../src/services/requestExecutor.service.js';
import { WorkflowSanitizerService } from '../src/services/workflowSanitizer.service.js';
import type { ApiExecutionResult, ApiRequest } from '../src/types/request.types.js';
import type { EnvironmentProfile, WorkflowScenario } from '../src/types/workflow.types.js';

// Mock request executor to intercept calls deterministically without network dispatches
class MockRequestExecutor extends RequestExecutorService {
  public executedRequests: ApiRequest[] = [];
  public responseGenerator: (req: ApiRequest) => ApiExecutionResult;

  constructor(responseGenerator: (req: ApiRequest) => ApiExecutionResult) {
    super();
    this.responseGenerator = responseGenerator;
  }

  override async execute(request: ApiRequest): Promise<ApiExecutionResult> {
    this.executedRequests.push(request);
    return this.responseGenerator(request);
  }
}

// Helper to create mock Express request/response
function createMockHttp(body: unknown) {
  let statusCode = 200;
  let responseData: unknown = null;

  const req = { body } as Parameters<WorkflowController['execute']>[0];
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: unknown) {
      responseData = data;
      return this;
    },
  } as unknown as Parameters<WorkflowController['execute']>[1];

  return {
    req,
    res,
    getStatus: () => statusCode,
    getData: () => responseData as Record<string, unknown>,
  };
}

// Test fixtures
const createValidScenario = (): WorkflowScenario => ({
  id: 'wf_sample',
  name: 'Sample Workflow',
  steps: [
    {
      id: 'step_1',
      name: 'Login Step',
      enabled: true,
      request: {
        method: 'POST',
        url: 'https://api.example.test/login',
        headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
        body: JSON.stringify({ username: 'alice', password: '{{adminPassword}}' }),
        auth: { type: 'none' },
      },
      extractors: [
        {
          targetVariable: 'token',
          source: 'BODY_JSONPATH',
          path: '$.authToken',
          isSecret: true,
        },
      ],
    },
    {
      id: 'step_2',
      name: 'Fetch User Profile',
      enabled: true,
      dependsOn: ['step_1'],
      request: {
        method: 'GET',
        url: 'https://api.example.test/users/me',
        headers: [{ key: 'Authorization', value: 'Bearer {{token}}', enabled: true }],
        auth: { type: 'none' },
      },
    },
  ],
});

test('POST /api/workflows/validate returns valid: true for sound workflow scenario', async () => {
  const controller = new WorkflowController();
  const scenario = createValidScenario();
  const http = createMockHttp({ scenario });

  await controller.validate(http.req, http.res);

  assert.equal(http.getStatus(), 200);
  const data = http.getData();
  assert.equal(data.valid, true);
  assert.deepEqual(data.errors, []);
});

test('POST /api/workflows/validate rejects invalid scenario with descriptive errors', async () => {
  const controller = new WorkflowController();
  const invalidScenario: WorkflowScenario = {
    id: 'wf_bad',
    name: 'Bad Workflow',
    steps: [
      {
        id: 'step_a',
        name: 'Step A',
        enabled: true,
        dependsOn: ['step_b'],
        request: { method: 'GET', url: 'https://api.test', auth: { type: 'none' } },
      },
      {
        id: 'step_b',
        name: 'Step B',
        enabled: true,
        dependsOn: ['step_a'],
        request: { method: 'GET', url: 'https://api.test', auth: { type: 'none' } },
      },
    ],
  };

  const http = createMockHttp({ scenario: invalidScenario });
  await controller.validate(http.req, http.res);

  assert.equal(http.getStatus(), 200);
  const data = http.getData();
  assert.equal(data.valid, false);
  assert.ok(Array.isArray(data.errors));
  assert.ok((data.errors as string[]).some((err) => err.includes('Dependency cycle detected')));
});

test('POST /api/workflows/validate returns 400 for malformed payload', async () => {
  const controller = new WorkflowController();
  const http = createMockHttp(null);

  await controller.validate(http.req, http.res);
  assert.equal(http.getStatus(), 400);
  const errorObj = http.getData()?.error as { message?: string } | undefined;
  assert.ok(errorObj?.message?.includes('scenario'));
});

test('POST /api/workflows/execute rejects malformed payload with 400', async () => {
  const controller = new WorkflowController();
  const http = createMockHttp({});

  await controller.execute(http.req, http.res);
  assert.equal(http.getStatus(), 400);
  const errorObj = http.getData()?.error as { message?: string } | undefined;
  assert.ok(errorObj?.message?.includes('scenario'));
});

test('POST /api/workflows/execute rejects cycle and pre-validation failures with 400 before HTTP dispatch', async () => {
  let dispatched = false;
  const mockExecutor = new MockRequestExecutor(() => {
    dispatched = true;
    return { success: true, status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: {} };
  });
  const engine = new WorkflowEngineService(mockExecutor);
  const controller = new WorkflowController(engine);

  const cyclicScenario: WorkflowScenario = {
    id: 'wf_cycle',
    name: 'Cyclic Scenario',
    steps: [
      {
        id: 's1',
        name: 'Step 1',
        enabled: true,
        dependsOn: ['s1'],
        request: { method: 'GET', url: 'https://api.test', auth: { type: 'none' } },
      },
    ],
  };

  const http = createMockHttp({ scenario: cyclicScenario });
  await controller.execute(http.req, http.res);

  assert.equal(http.getStatus(), 400);
  assert.equal(dispatched, false, 'No HTTP request should execute when validation fails');
  const errorObj = http.getData()?.error as { details?: string[] } | undefined;
  assert.ok(errorObj?.details?.some((d) => d.includes('cannot declare a dependency on itself')));
});

test('POST /api/workflows/execute successfully runs multi-step flow and sanitizes output', async () => {
  const mockExecutor = new MockRequestExecutor((req) => {
    if (req.url.includes('/login')) {
      return {
        success: true,
        status: 200,
        statusText: 'OK',
        responseTime: 20,
        headers: { 'set-cookie': 'session=super_secret_cookie_val' },
        body: { authToken: 'super_secret_jwt_token_123', userId: 42 },
      };
    }
    return {
      success: true,
      status: 200,
      statusText: 'OK',
      responseTime: 15,
      headers: { 'content-type': 'application/json' },
      body: { id: 42, name: 'Alice' },
    };
  });

  const engine = new WorkflowEngineService(mockExecutor);
  const controller = new WorkflowController(engine);

  const scenario = createValidScenario();
  const environment: EnvironmentProfile = {
    id: 'env_1',
    name: 'Test Environment',
    variables: [
      { name: 'adminPassword', value: 'super_secret_admin_pass', isSecret: true, enabled: true },
    ],
  };

  const http = createMockHttp({ scenario, environment });
  await controller.execute(http.req, http.res);

  assert.equal(http.getStatus(), 200);
  const data = http.getData();
  assert.equal(data.status, 'COMPLETED');
  assert.equal(mockExecutor.executedRequests.length, 2);

  // CRITICAL SECURITY ASSERTIONS:
  // 1. Serialized json string must NOT contain any of the secrets in plaintext:
  const serialized = JSON.stringify(data);
  assert.ok(!serialized.includes('super_secret_admin_pass'), 'adminPassword must not leak');
  assert.ok(!serialized.includes('super_secret_jwt_token_123'), 'authToken must not leak');
  assert.ok(!serialized.includes('super_secret_cookie_val'), 'cookie secret must not leak');

  // 2. finalContext entries for secrets must be [REDACTED]
  const finalContext = data.finalContext as Record<string, { value: unknown; isSecret: boolean }>;
  assert.equal(finalContext.adminPassword.isSecret, true);
  assert.equal(finalContext.adminPassword.value, '[REDACTED]');
  assert.equal(finalContext.token.isSecret, true);
  assert.equal(finalContext.token.value, '[REDACTED]');

  // 3. Step 1 extractedVariables must be redacted
  const stepResults = data.stepResults as Array<Record<string, unknown>>;
  const step1Extracted = stepResults[0].extractedVariables as Record<string, { value: unknown; isSecret: boolean }>;
  assert.equal(step1Extracted.token.value, '[REDACTED]');
  assert.equal(step1Extracted.token.isSecret, true);

  // 4. Response headers for set-cookie must be redacted
  const step1Response = stepResults[0].response as { headers: Record<string, string>; body: Record<string, unknown> };
  assert.equal(step1Response.headers['set-cookie'], '[REDACTED]');

  // 5. Response body field containing the secret must be redacted
  assert.equal(step1Response.body.authToken, '[REDACTED]');
  assert.equal(step1Response.body.userId, 42); // Non-secret preserved
});

test('POST /api/workflows/execute preserves input immutability and does not mutate engine result', async () => {
  const mockExecutor = new MockRequestExecutor(() => ({
    success: true,
    status: 200,
    statusText: 'OK',
    responseTime: 10,
    headers: {},
    body: { secret: 'top_secret_xyz' },
  }));

  const engine = new WorkflowEngineService(mockExecutor);
  const sanitizer = new WorkflowSanitizerService();

  const scenario: WorkflowScenario = {
    id: 'wf_mut',
    name: 'Mutation Check',
    steps: [
      {
        id: 's1',
        name: 'Step 1',
        enabled: true,
        request: { method: 'GET', url: 'https://api.test', auth: { type: 'none' } },
        extractors: [
          { targetVariable: 'extractedSec', source: 'BODY_JSONPATH', path: '$.secret', isSecret: true },
        ],
      },
    ],
  };

  const rawEngineResult = await engine.executeScenario(scenario);
  assert.equal(rawEngineResult.finalContext.extractedSec.value, 'top_secret_xyz', 'Internal engine retains raw value');

  const sanitizedDto = sanitizer.sanitizeExecutionResult(rawEngineResult, scenario);
  assert.equal(sanitizedDto.finalContext.extractedSec.value, '[REDACTED]', 'Sanitized DTO redacts value');
  assert.equal(rawEngineResult.finalContext.extractedSec.value, 'top_secret_xyz', 'Internal engine result was NOT mutated');
});

test('POST /api/workflows/execute accurately reports step failures and teardown outcomes', async () => {
  let teardownExecuted = false;
  const mockExecutor = new MockRequestExecutor((req) => {
    if (req.url.includes('/fail')) {
      return {
        success: false,
        error: { type: 'NETWORK_ERROR', message: 'Connection refused' },
      };
    }
    if (req.url.includes('/teardown')) {
      teardownExecuted = true;
      return {
        success: true,
        status: 200,
        statusText: 'OK',
        responseTime: 10,
        headers: {},
        body: { cleaned: true },
      };
    }
    return { success: true, status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: {} };
  });

  const engine = new WorkflowEngineService(mockExecutor);
  const controller = new WorkflowController(engine);

  const scenario: WorkflowScenario = {
    id: 'wf_td',
    name: 'Teardown Flow',
    steps: [
      {
        id: 's1',
        name: 'Failing Step',
        enabled: true,
        request: { method: 'GET', url: 'https://api.test/fail', auth: { type: 'none' } },
      },
      {
        id: 's2',
        name: 'Dependent Step',
        enabled: true,
        dependsOn: ['s1'],
        request: { method: 'GET', url: 'https://api.test/dependent', auth: { type: 'none' } },
      },
      {
        id: 's_cleanup',
        name: 'Cleanup Step',
        enabled: true,
        isTeardown: true,
        request: { method: 'DELETE', url: 'https://api.test/teardown', auth: { type: 'none' } },
      },
    ],
  };

  const http = createMockHttp({ scenario });
  await controller.execute(http.req, http.res);

  assert.equal(http.getStatus(), 200);
  const data = http.getData();
  assert.equal(data.status, 'PARTIALLY_COMPLETED');
  assert.equal(teardownExecuted, true, 'Teardown step must execute even when regular step fails');

  const stepResults = data.stepResults as Array<Record<string, unknown>>;
  assert.equal(stepResults[0].status, 'FAILED_EXECUTION');
  assert.equal(stepResults[1].status, 'SKIPPED');
  assert.ok((stepResults[1].skipReason as string)?.includes('prerequisite step'));
  assert.equal(stepResults[2].status, 'PASSED_EXECUTION');
});

test('POST /api/workflows/preview-request resolves variables and redacts secrets without network calls', async () => {
  const controller = new WorkflowController();
  const request: ApiRequest = {
    method: 'POST',
    url: '{{baseUrl}}/users/{{userId}}',
    queryParams: [
      { key: 'api_key', value: '{{secretKey}}', enabled: true },
      { key: 'filter', value: 'active', enabled: true },
    ],
    headers: [
      { key: 'Authorization', value: 'Bearer {{secretToken}}', enabled: true },
      { key: 'X-Client', value: 'APIForge', enabled: true },
    ],
    body: JSON.stringify({ userId: '{{userId}}', clientSecret: '{{secretKey}}' }),
    auth: { type: 'bearer', token: '{{secretToken}}' },
  };

  const environment: EnvironmentProfile = {
    id: 'env_preview',
    name: 'Preview Env',
    baseUrl: 'https://api.staging.test',
    variables: [
      { name: 'userId', value: '99', isSecret: false, enabled: true },
      { name: 'secretKey', value: 'super_secret_api_key_777', isSecret: true, enabled: true },
      { name: 'secretToken', value: 'super_secret_bearer_token_888', isSecret: true, enabled: true },
    ],
  };

  const http = createMockHttp({ request, environment });
  await controller.previewRequest(http.req, http.res);

  assert.equal(http.getStatus(), 200);
  const data = http.getData();
  assert.equal(data.containsSecret, true);
  assert.deepEqual(data.resolvedVariables, ['baseUrl', 'userId', 'secretKey', 'secretToken']);

  const sanitized = data.sanitizedRequest as { url: string; auth: { redacted: boolean } };
  assert.equal(sanitized.url, 'https://api.staging.test/users/99');
  assert.equal(sanitized.auth.redacted, true);

  // Redactions in headers, queryParams, and body:
  const serialized = JSON.stringify(data);
  assert.ok(!serialized.includes('super_secret_api_key_777'), 'secretKey must not be in preview');
  assert.ok(!serialized.includes('super_secret_bearer_token_888'), 'secretToken must not be in preview');
});

test('POST /api/workflows/preview-request rejects missing request with 400', async () => {
  const controller = new WorkflowController();
  const http = createMockHttp({});

  await controller.previewRequest(http.req, http.res);
  assert.equal(http.getStatus(), 400);
  const errorObj = http.getData()?.error as { message?: string } | undefined;
  assert.ok(errorObj?.message?.includes('request'));
});

test('REGRESSION 1: Explicit isSetup and isTeardown flags propagate for arbitrary-named and unnamed steps', async () => {
  const mockExecutor = new MockRequestExecutor((req) => ({
    success: true,
    status: 200,
    statusText: 'OK',
    responseTime: 10,
    headers: {},
    body: { url: req.url },
  }));

  const engine = new WorkflowEngineService(mockExecutor);
  const controller = new WorkflowController(engine);

  const scenario: WorkflowScenario = {
    id: 'wf_flags',
    name: 'Setup and Arbitrary Teardown Scenario',
    steps: [
      {
        id: 's_init',
        name: 'Seed Database Records',
        isSetup: true,
        enabled: true,
        request: { method: 'POST', url: 'https://api.test/setup', auth: { type: 'none' } },
      },
      {
        id: 's_main',
        name: 'Process Order Operation',
        enabled: true,
        request: { method: 'POST', url: 'https://api.test/process', auth: { type: 'none' } },
      },
      {
        id: 's_teardown_custom',
        name: 'Delete Temporary Order', // Arbitrary name without "teardown" or "cleanup"
        isTeardown: true,
        enabled: true,
        request: { method: 'DELETE', url: 'https://api.test/orders/temp', auth: { type: 'none' } },
      },
    ],
  };

  const http = createMockHttp({ scenario });
  await controller.execute(http.req, http.res);

  assert.equal(http.getStatus(), 200);
  const data = http.getData();
  const stepResults = data.stepResults as Array<Record<string, unknown>>;

  assert.equal(stepResults.length, 3);
  // Setup step metadata
  assert.equal(stepResults[0].stepId, 's_init');
  assert.equal(stepResults[0].isSetup, true);
  assert.equal(stepResults[0].isTeardown, undefined);

  // Normal step metadata
  assert.equal(stepResults[1].stepId, 's_main');
  assert.equal(stepResults[1].isSetup, undefined);
  assert.equal(stepResults[1].isTeardown, undefined);

  // Teardown step with arbitrary name
  assert.equal(stepResults[2].stepId, 's_teardown_custom');
  assert.equal(stepResults[2].stepName, 'Delete Temporary Order');
  assert.equal(stepResults[2].isTeardown, true);
  assert.equal(stepResults[2].isSetup, undefined);
});

test('REGRESSION 2: Sanitizer handles numeric secrets, URL-encoded secrets, nested objects, and context copies', async () => {
  const mockExecutor = new MockRequestExecutor((req) => ({
    success: true,
    status: 200,
    statusText: 'OK',
    responseTime: 12,
    headers: { 'x-auth-echo': req.headers[0]?.value || '' },
    body: {
      account: {
        pin: 987654,
        nested: {
          tokenRef: 'special/token+val#1',
        },
      },
      tags: ['public-tag', 'special/token+val#1'],
    },
  }));

  const engine = new WorkflowEngineService(mockExecutor);
  const controller = new WorkflowController(engine);

  const scenario: WorkflowScenario = {
    id: 'wf_hardened_secrets',
    name: 'Hardened Secrets Flow',
    steps: [
      {
        id: 's_login',
        name: 'Login Step',
        enabled: true,
        request: {
          method: 'GET',
          // URL contains percent-encoded secret in query param
          url: 'https://api.test/auth?token={{secretToken}}&pin={{numericPin}}',
          headers: [{ key: 'X-Token', value: '{{secretToken}}', enabled: true }],
          auth: { type: 'none' },
        },
        extractors: [
          {
            targetVariable: 'extractedPin',
            source: 'BODY_JSONPATH',
            path: '$.account.pin',
            isSecret: true,
          },
          {
            targetVariable: 'extractedNested',
            source: 'BODY_JSONPATH',
            path: '$.account.nested.tokenRef',
            isSecret: true,
          },
        ],
      },
    ],
  };

  const environment: EnvironmentProfile = {
    id: 'env_secrets',
    name: 'Secrets Test Env',
    variables: [
      { name: 'numericPin', value: 987654, isSecret: true, enabled: true },
      { name: 'secretToken', value: 'special/token+val#1', isSecret: true, enabled: true },
    ],
  };

  const http = createMockHttp({ scenario, environment });
  await controller.execute(http.req, http.res);

  assert.equal(http.getStatus(), 200);
  const data = http.getData();
  const serialized = JSON.stringify(data);

  // Verify no plaintext leakage of string or numeric secrets in raw or URL-encoded form
  assert.ok(!serialized.includes('987654'), 'Numeric PIN must not appear in serialized response');
  assert.ok(!serialized.includes('special/token+val#1'), 'Raw secret token must not appear');
  assert.ok(!serialized.includes(encodeURIComponent('special/token+val#1')), 'URL-encoded token must not appear');

  const stepResults = data.stepResults as Array<Record<string, unknown>>;
  const stepRes = stepResults[0].response as {
    headers: Record<string, string>;
    body: { account: { pin: unknown; nested: { tokenRef: unknown } }; tags: unknown[] };
  };

  // Response body redactions
  assert.equal(stepRes.body.account.pin, '[REDACTED]');
  assert.equal(stepRes.body.account.nested.tokenRef, '[REDACTED]');
  assert.equal(stepRes.body.tags[0], 'public-tag');
  assert.equal(stepRes.body.tags[1], '[REDACTED]');

  // Extracted variables metadata and values
  const step1Extracted = stepResults[0].extractedVariables as Record<string, { value: unknown; isSecret: boolean }>;
  assert.equal(step1Extracted.extractedPin.isSecret, true);
  assert.equal(step1Extracted.extractedPin.value, '[REDACTED]');
  assert.equal(step1Extracted.extractedNested.isSecret, true);
  assert.equal(step1Extracted.extractedNested.value, '[REDACTED]');

  // Final context metadata and values
  const finalContext = data.finalContext as Record<string, { value: unknown; isSecret: boolean }>;
  assert.equal(finalContext.numericPin.isSecret, true);
  assert.equal(finalContext.numericPin.value, '[REDACTED]');
  assert.equal(finalContext.extractedPin.isSecret, true);
  assert.equal(finalContext.extractedPin.value, '[REDACTED]');
});

test('REGRESSION 3: Unexpected HTTP 500 error handler never leaks exception credentials', async () => {
  // Mock engine that throws an internal error containing a fake credential
  const leakyEngine = {
    validateScenario: () => ({ valid: true, errors: [] }),
    executeScenario: async () => {
      throw new Error('Connection failed to backend: token=super_secret_leakable_password_xyz&key=12345');
    },
  } as unknown as WorkflowEngineService;

  const controller = new WorkflowController(leakyEngine);
  const scenario = createValidScenario();
  const http = createMockHttp({ scenario });

  await controller.execute(http.req, http.res);

  assert.equal(http.getStatus(), 500);
  const responseData = http.getData();
  const serialized = JSON.stringify(responseData);

  assert.ok(!serialized.includes('super_secret_leakable_password_xyz'), 'Credential in error message must NOT leak');
  assert.ok(!serialized.includes('Connection failed to backend'), 'Raw unhandled error message must not be exposed');

  const errorObj = responseData?.error as { type?: string; message?: string; details?: unknown } | undefined;
  assert.equal(errorObj?.type, 'INTERNAL_ERROR');
  assert.equal(errorObj?.message, 'Workflow execution failed due to an unexpected server error.');
  assert.equal(errorObj?.details, undefined, 'Details should not contain raw exception message');
});

test('REGRESSION 4: CORS configuration permits dynamic local dev origins (e.g., port 5175 and 127.0.0.1)', () => {
  const allowedOrigins = ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:3000'];
  const isDev = true;

  const corsOriginHandler = (origin: string | undefined): boolean => {
    if (!origin) return true;
    if (allowedOrigins.includes(origin)) return true;
    if (isDev && /^http:\/\/(localhost|127\.0\.0\.1)(:[0-9]+)?$/.test(origin)) return true;
    return false;
  };

  assert.equal(corsOriginHandler('http://localhost:5175'), true, 'Vite port 5175 must be permitted');
  assert.equal(corsOriginHandler('http://127.0.0.1:5175'), true, '127.0.0.1:5175 must be permitted');
  assert.equal(corsOriginHandler('http://localhost:5173'), true, 'Port 5173 must be permitted');
  assert.equal(corsOriginHandler('http://localhost:3000'), true, 'Port 3000 must be permitted');
  assert.equal(corsOriginHandler(undefined), true, 'Server-to-server/no-origin calls must be permitted');
  assert.equal(corsOriginHandler('http://evil.com'), false, 'Untrusted origin must be rejected');
});


