import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WorkflowEngineService,
  WorkflowValidationError,
  MAX_WORKFLOW_STEPS,
} from '../src/services/workflowEngine.service.js';
import { RequestExecutorService } from '../src/services/requestExecutor.service.js';
import type { ApiExecutionResult, ApiRequest } from '../src/types/request.types.js';
import type { WorkflowScenario, WorkflowStep } from '../src/types/workflow.types.js';

// Controlled Mock Request Executor to test workflow orchestration deterministically
class MockWorkflowRequestExecutor extends RequestExecutorService {
  public executedRequests: ApiRequest[] = [];
  public handler?: (request: ApiRequest, callIndex: number) => ApiExecutionResult | Promise<ApiExecutionResult>;
  public defaultResponse: ApiExecutionResult;

  constructor(defaultResponse?: ApiExecutionResult) {
    super();
    this.defaultResponse = defaultResponse || {
      success: true,
      status: 200,
      statusText: 'OK',
      responseTime: 10,
      headers: { 'content-type': 'application/json' },
      body: { ok: true },
      size: 15,
    };
  }

  override async execute(request: ApiRequest): Promise<ApiExecutionResult> {
    const callIndex = this.executedRequests.length;
    // Deep clone to ensure we record the exact request state at dispatch time
    this.executedRequests.push(JSON.parse(JSON.stringify(request)));
    if (this.handler) {
      return await this.handler(request, callIndex);
    }
    return this.defaultResponse;
  }
}

const createBaseStep = (overrides: Partial<WorkflowStep> & { id: string; name: string }): WorkflowStep => ({
  enabled: true,
  request: {
    method: 'GET',
    url: 'https://api.example.test/items',
    queryParams: [],
    headers: [],
    body: null,
    auth: { type: 'none' },
  },
  ...overrides,
});

// 1. Successful two-step request chaining
test('1. Successful two-step request chaining executes sequentially and passes', async () => {
  const mock = new MockWorkflowRequestExecutor();
  const engine = new WorkflowEngineService(mock);

  const scenario: WorkflowScenario = {
    id: 'scen_chaining',
    name: 'Sequential Two Step Chain',
    steps: [
      createBaseStep({
        id: 'step1',
        name: 'Step 1 - Create Resource',
        request: {
          method: 'POST',
          url: 'https://api.example.test/users',
          headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
          body: JSON.stringify({ name: 'Alice' }),
          auth: { type: 'none' },
        },
      }),
      createBaseStep({
        id: 'step2',
        name: 'Step 2 - Read Resource',
        dependsOn: ['step1'],
        request: {
          method: 'GET',
          url: 'https://api.example.test/users/alice',
          auth: { type: 'none' },
        },
      }),
    ],
  };

  const result = await engine.executeScenario(scenario);

  assert.strictEqual(result.status, 'COMPLETED');
  assert.strictEqual(result.summary.totalSteps, 2);
  assert.strictEqual(result.summary.executed, 2);
  assert.strictEqual(result.summary.passed, 2);
  assert.strictEqual(result.summary.failed, 0);
  assert.strictEqual(result.summary.blocked, 0);
  assert.strictEqual(mock.executedRequests.length, 2);
  assert.strictEqual(mock.executedRequests[0].method, 'POST');
  assert.strictEqual(mock.executedRequests[1].method, 'GET');
});

// 2. Extracting an ID from step 1 and interpolating it into step 2
test('2. Extracting an ID from step 1 and interpolating it into step 2', async () => {
  const mock = new MockWorkflowRequestExecutor();
  mock.handler = (_req, idx) => {
    if (idx === 0) {
      return {
        success: true,
        status: 201,
        statusText: 'Created',
        responseTime: 15,
        headers: { 'content-type': 'application/json' },
        body: { id: 'usr_abc_999', name: 'Bob' },
        size: 30,
      };
    }
    return {
      success: true,
      status: 200,
      statusText: 'OK',
      responseTime: 12,
      headers: { 'content-type': 'application/json' },
      body: { id: 'usr_abc_999', status: 'ACTIVE' },
      size: 30,
    };
  };

  const engine = new WorkflowEngineService(mock);

  const scenario: WorkflowScenario = {
    id: 'scen_id_extraction',
    name: 'ID Extraction and Chaining',
    steps: [
      createBaseStep({
        id: 'create_user',
        name: 'Create User',
        request: {
          method: 'POST',
          url: 'https://api.example.test/users',
          auth: { type: 'none' },
        },
        extractors: [
          { targetVariable: 'userId', source: 'BODY_JSONPATH', path: '$.id' },
        ],
      }),
      createBaseStep({
        id: 'get_user',
        name: 'Get User by ID',
        dependsOn: ['create_user'],
        request: {
          method: 'GET',
          url: 'https://api.example.test/users/{{userId}}',
          auth: { type: 'none' },
        },
      }),
    ],
  };

  const result = await engine.executeScenario(scenario);

  assert.strictEqual(result.status, 'COMPLETED');
  assert.strictEqual(result.stepResults[0].extractedVariables?.userId.value, 'usr_abc_999');
  assert.strictEqual(mock.executedRequests[1].url, 'https://api.example.test/users/usr_abc_999');
  assert.strictEqual(result.finalContext.userId.value, 'usr_abc_999');
});

// 3. Header extraction followed by reuse in a later request
test('3. Header extraction followed by reuse in a later request', async () => {
  const mock = new MockWorkflowRequestExecutor();
  mock.handler = (_req, idx) => {
    if (idx === 0) {
      return {
        success: true,
        status: 200,
        statusText: 'OK',
        responseTime: 20,
        headers: { 'x-auth-token': 'jwt_super_secret_session_token' },
        body: { authenticated: true },
        size: 20,
      };
    }
    return {
      success: true,
      status: 200,
      statusText: 'OK',
      responseTime: 10,
      headers: {},
      body: { userProfile: 'alice' },
      size: 20,
    };
  };

  const engine = new WorkflowEngineService(mock);

  const scenario: WorkflowScenario = {
    id: 'scen_header_token',
    name: 'Header Token Propagation',
    steps: [
      createBaseStep({
        id: 'login',
        name: 'Login Step',
        request: {
          method: 'POST',
          url: 'https://api.example.test/auth/login',
          auth: { type: 'none' },
        },
        extractors: [
          { targetVariable: 'sessionToken', source: 'HEADER', path: 'x-auth-token', isSecret: true },
        ],
      }),
      createBaseStep({
        id: 'profile',
        name: 'Get Profile with Extracted Token',
        dependsOn: ['login'],
        request: {
          method: 'GET',
          url: 'https://api.example.test/profile',
          headers: [
            { key: 'Authorization', value: 'Bearer {{sessionToken}}', enabled: true },
          ],
          auth: { type: 'none' },
        },
      }),
    ],
  };

  const result = await engine.executeScenario(scenario);

  assert.strictEqual(result.status, 'COMPLETED');
  assert.strictEqual(result.finalContext.sessionToken.isSecret, true);
  // Verify that the actual dispatched request contained the extracted token
  assert.strictEqual(mock.executedRequests[1].headers?.[0].value, 'Bearer jwt_super_secret_session_token');
  // Verify that sanitized request in results redacted the secret
  const sanitizedAuthHeader = result.stepResults[1].request.headers?.[0].value;
  assert.strictEqual(sanitizedAuthHeader, '[REDACTED]');
});

// 4. Numeric extraction preserving the numeric type
test('4. Numeric extraction preserving the numeric type', async () => {
  const mock = new MockWorkflowRequestExecutor();
  mock.handler = (_req, idx) => {
    if (idx === 0) {
      return {
        success: true,
        status: 200,
        statusText: 'OK',
        responseTime: 10,
        headers: { 'content-type': 'application/json' },
        body: { stats: { totalCount: 42, score: 98.6 } },
        size: 30,
      };
    }
    return {
      success: true,
      status: 200,
      statusText: 'OK',
      responseTime: 10,
      headers: {},
      body: { acknowledged: true },
      size: 20,
    };
  };

  const engine = new WorkflowEngineService(mock);

  const scenario: WorkflowScenario = {
    id: 'scen_numeric_type',
    name: 'Numeric Type Preservation',
    steps: [
      createBaseStep({
        id: 'get_stats',
        name: 'Get Stats',
        request: {
          method: 'GET',
          url: 'https://api.example.test/stats',
          auth: { type: 'none' },
        },
        extractors: [
          { targetVariable: 'count', source: 'BODY_JSONPATH', path: '$.stats.totalCount' },
        ],
      }),
      createBaseStep({
        id: 'send_payload',
        name: 'Send JSON Payload with Numeric Field',
        dependsOn: ['get_stats'],
        request: {
          method: 'POST',
          url: 'https://api.example.test/process',
          headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
          body: JSON.stringify({ itemCount: '{{count}}', active: true }),
          auth: { type: 'none' },
        },
      }),
    ],
  };

  const result = await engine.executeScenario(scenario);

  assert.strictEqual(result.status, 'COMPLETED');
  const dispatchedBody = JSON.parse(mock.executedRequests[1].body as string);
  assert.strictEqual(dispatchedBody.itemCount, 42);
  assert.strictEqual(typeof dispatchedBody.itemCount, 'number');
});

// 5. Network failure blocking dependent steps
test('5. Network failure blocking dependent steps', async () => {
  const mock = new MockWorkflowRequestExecutor();
  mock.handler = (_req) => ({
    success: false,
    error: {
      type: 'NETWORK_ERROR',
      message: 'getaddrinfo ENOTFOUND api.example.test',
    },
  });

  const engine = new WorkflowEngineService(mock);

  const scenario: WorkflowScenario = {
    id: 'scen_network_fail',
    name: 'Network Failure Blocking',
    steps: [
      createBaseStep({
        id: 'step1',
        name: 'Step 1 - Fails Network',
      }),
      createBaseStep({
        id: 'step2',
        name: 'Step 2 - Dependent Step',
        dependsOn: ['step1'],
      }),
    ],
  };

  const result = await engine.executeScenario(scenario);

  assert.strictEqual(result.status, 'FAILED');
  assert.strictEqual(result.stepResults[0].status, 'FAILED_EXECUTION');
  assert.strictEqual(result.stepResults[1].status, 'SKIPPED');
  assert.match(result.stepResults[1].skipReason || '', /Blocked by prerequisite step 'step1' execution failure/);
  assert.strictEqual(result.summary.executed, 1);
  assert.strictEqual(result.summary.failed, 1);
  assert.strictEqual(result.summary.blocked, 1);
  assert.strictEqual(mock.executedRequests.length, 1);
});

// 6. Unexpected step error blocking dependent steps
test('6. Unexpected step error blocking dependent steps', async () => {
  const mock = new MockWorkflowRequestExecutor();
  mock.handler = () => {
    throw new Error('Unexpected fatal engine error');
  };

  const engine = new WorkflowEngineService(mock);

  const scenario: WorkflowScenario = {
    id: 'scen_unexpected_err',
    name: 'Unexpected Error Blocking',
    steps: [
      createBaseStep({ id: 'step1', name: 'Step 1 - Internal Throw' }),
      createBaseStep({ id: 'step2', name: 'Step 2 - Dependent Step', dependsOn: ['step1'] }),
    ],
  };

  const result = await engine.executeScenario(scenario);

  assert.strictEqual(result.status, 'FAILED');
  assert.strictEqual(result.stepResults[0].status, 'ERROR');
  assert.strictEqual(result.stepResults[1].status, 'SKIPPED');
  assert.match(result.stepResults[1].skipReason || '', /Blocked by prerequisite step 'step1'/);
  assert.strictEqual(mock.executedRequests.length, 1);
});

// 7. Validation failure blocking dependent steps by default
test('7. Validation failure blocking dependent steps by default', async () => {
  const mock = new MockWorkflowRequestExecutor({
    success: true,
    status: 200,
    statusText: 'OK',
    responseTime: 10,
    headers: { 'content-type': 'application/json' },
    body: { ok: true },
    size: 15,
  });

  const engine = new WorkflowEngineService(mock);

  const scenario: WorkflowScenario = {
    id: 'scen_val_failure',
    name: 'Validation Failure Blocks Dependents',
    steps: [
      createBaseStep({
        id: 'step1',
        name: 'Step 1 - Returns 200 but expects 201',
        expected: {
          statusCodes: ['201'],
        },
      }),
      createBaseStep({
        id: 'step2',
        name: 'Step 2 - Dependent Step',
        dependsOn: ['step1'],
      }),
    ],
  };

  const result = await engine.executeScenario(scenario);

  assert.strictEqual(result.status, 'FAILED');
  assert.strictEqual(result.stepResults[0].status, 'PASSED_EXECUTION');
  assert.strictEqual(result.stepResults[0].validationResult?.status, 'VALIDATION_FAILED');
  assert.strictEqual(result.stepResults[1].status, 'SKIPPED');
  assert.match(result.stepResults[1].skipReason || '', /contract validation failure/);
  assert.strictEqual(mock.executedRequests.length, 1);
});

// 8. Required extraction failure blocking dependent steps
test('8. Required extraction failure blocking dependent steps', async () => {
  const mock = new MockWorkflowRequestExecutor({
    success: true,
    status: 200,
    statusText: 'OK',
    responseTime: 10,
    headers: { 'content-type': 'application/json' },
    body: { user: {} },
    size: 15,
  });

  const engine = new WorkflowEngineService(mock);

  const scenario: WorkflowScenario = {
    id: 'scen_extraction_failure',
    name: 'Extraction Failure Blocks Dependents',
    steps: [
      createBaseStep({
        id: 'step1',
        name: 'Step 1 - Missing Property Extraction',
        extractors: [
          { targetVariable: 'nonExistentId', source: 'BODY_JSONPATH', path: '$.user.id' },
        ],
      }),
      createBaseStep({
        id: 'step2',
        name: 'Step 2 - Dependent on Step 1',
        dependsOn: ['step1'],
      }),
    ],
  };

  const result = await engine.executeScenario(scenario);

  assert.strictEqual(result.status, 'FAILED');
  assert.strictEqual(result.stepResults[0].status, 'PASSED_EXECUTION');
  assert.ok(result.stepResults[0].extractionErrors && result.stepResults[0].extractionErrors.length > 0);
  assert.strictEqual(result.stepResults[1].status, 'SKIPPED');
  assert.match(result.stepResults[1].skipReason || '', /response extraction failure/);
  assert.strictEqual(mock.executedRequests.length, 1);
});

// 9. Disabled step behavior
test('9. Disabled step behavior skips execution without network dispatch and blocks dependents', async () => {
  const mock = new MockWorkflowRequestExecutor();
  const engine = new WorkflowEngineService(mock);

  const scenario: WorkflowScenario = {
    id: 'scen_disabled',
    name: 'Disabled Step Handling',
    steps: [
      createBaseStep({
        id: 'step1',
        name: 'Disabled Step',
        enabled: false,
      }),
      createBaseStep({
        id: 'step2',
        name: 'Dependent on Disabled Step',
        dependsOn: ['step1'],
      }),
    ],
  };

  const result = await engine.executeScenario(scenario);

  assert.strictEqual(result.status, 'FAILED');
  assert.strictEqual(result.stepResults[0].status, 'SKIPPED');
  assert.strictEqual(result.stepResults[0].durationMs, 0);
  assert.strictEqual(result.stepResults[0].skipReason, 'Step is disabled.');
  assert.strictEqual(result.stepResults[1].status, 'SKIPPED');
  assert.match(result.stepResults[1].skipReason || '', /prerequisite step 'step1' which was skipped/);
  assert.strictEqual(mock.executedRequests.length, 0);
});

// 10. Missing dependency rejection before any request executes
test('10. Missing dependency rejection before any request executes', async () => {
  const mock = new MockWorkflowRequestExecutor();
  const engine = new WorkflowEngineService(mock);

  const scenario: WorkflowScenario = {
    id: 'scen_missing_dep',
    name: 'Missing Dependency Reference',
    steps: [
      createBaseStep({
        id: 'step1',
        name: 'Step 1',
        dependsOn: ['non_existent_step_id'],
      }),
    ],
  };

  const validation = engine.validateScenario(scenario);
  assert.strictEqual(validation.valid, false);
  assert.ok(validation.errors.some((e) => e.includes('non-existent dependency')));

  await assert.rejects(
    async () => await engine.executeScenario(scenario),
    (err: unknown) => err instanceof WorkflowValidationError && err.errors.length > 0
  );
  assert.strictEqual(mock.executedRequests.length, 0);
});

// 11. Duplicate step ID rejection
test('11. Duplicate step ID rejection', async () => {
  const mock = new MockWorkflowRequestExecutor();
  const engine = new WorkflowEngineService(mock);

  const scenario: WorkflowScenario = {
    id: 'scen_dup_id',
    name: 'Duplicate Step ID',
    steps: [
      createBaseStep({ id: 'step_dup', name: 'Step 1' }),
      createBaseStep({ id: 'step_dup', name: 'Step 2' }),
    ],
  };

  const validation = engine.validateScenario(scenario);
  assert.strictEqual(validation.valid, false);
  assert.ok(validation.errors.some((e) => e.includes('Duplicate step ID')));

  await assert.rejects(
    async () => await engine.executeScenario(scenario),
    WorkflowValidationError
  );
  assert.strictEqual(mock.executedRequests.length, 0);
});

// 12. Dependency-cycle rejection before execution
test('12. Dependency-cycle rejection before execution', async () => {
  const mock = new MockWorkflowRequestExecutor();
  const engine = new WorkflowEngineService(mock);

  const scenario: WorkflowScenario = {
    id: 'scen_cycle',
    name: 'Cyclic Dependencies',
    steps: [
      createBaseStep({ id: 'stepA', name: 'Step A', dependsOn: ['stepB'] }),
      createBaseStep({ id: 'stepB', name: 'Step B', dependsOn: ['stepA'] }),
    ],
  };

  const validation = engine.validateScenario(scenario);
  assert.strictEqual(validation.valid, false);
  assert.ok(validation.errors.some((e) => e.includes('Dependency cycle detected')));

  await assert.rejects(
    async () => await engine.executeScenario(scenario),
    WorkflowValidationError
  );
  assert.strictEqual(mock.executedRequests.length, 0);
});

// 13. Rejection of workflows exceeding 50 steps
test('13. Rejection of workflows exceeding 50 steps', async () => {
  const mock = new MockWorkflowRequestExecutor();
  const engine = new WorkflowEngineService(mock);

  const steps: WorkflowStep[] = [];
  for (let i = 1; i <= MAX_WORKFLOW_STEPS + 1; i++) {
    steps.push(createBaseStep({ id: `step_${i}`, name: `Step ${i}` }));
  }

  const scenario: WorkflowScenario = {
    id: 'scen_oversized',
    name: 'Oversized Workflow',
    steps,
  };

  const validation = engine.validateScenario(scenario);
  assert.strictEqual(validation.valid, false);
  assert.ok(validation.errors.some((e) => e.includes('exceeds maximum limit of 50 steps')));

  await assert.rejects(
    async () => await engine.executeScenario(scenario),
    WorkflowValidationError
  );
  assert.strictEqual(mock.executedRequests.length, 0);
});

// 14. Independent steps behaving according to documented ordering rules
test('14. Independent steps behaving according to documented ordering rules', async () => {
  const mock = new MockWorkflowRequestExecutor();
  const engine = new WorkflowEngineService(mock);

  const scenario: WorkflowScenario = {
    id: 'scen_ordering',
    name: 'Independent Order Preservation',
    steps: [
      createBaseStep({ id: 'step_alpha', name: 'Alpha', request: { method: 'GET', url: 'https://api.example.test/alpha', auth: { type: 'none' } } }),
      createBaseStep({ id: 'step_beta', name: 'Beta', request: { method: 'GET', url: 'https://api.example.test/beta', auth: { type: 'none' } } }),
      createBaseStep({ id: 'step_gamma', name: 'Gamma', request: { method: 'GET', url: 'https://api.example.test/gamma', auth: { type: 'none' } } }),
    ],
  };

  const result = await engine.executeScenario(scenario);

  assert.strictEqual(result.status, 'COMPLETED');
  assert.strictEqual(mock.executedRequests.length, 3);
  assert.strictEqual(mock.executedRequests[0].url, 'https://api.example.test/alpha');
  assert.strictEqual(mock.executedRequests[1].url, 'https://api.example.test/beta');
  assert.strictEqual(mock.executedRequests[2].url, 'https://api.example.test/gamma');
});

// 15. Teardown after successful execution
test('15. Teardown after successful execution runs in cleanup phase', async () => {
  const mock = new MockWorkflowRequestExecutor();
  const engine = new WorkflowEngineService(mock);

  const scenario: WorkflowScenario = {
    id: 'scen_teardown_success',
    name: 'Teardown on Success',
    steps: [
      createBaseStep({
        id: 'main_step',
        name: 'Main Step',
        request: { method: 'POST', url: 'https://api.example.test/resource', auth: { type: 'none' } },
      }),
      createBaseStep({
        id: 'cleanup_step',
        name: 'Cleanup Step',
        isTeardown: true,
        request: { method: 'DELETE', url: 'https://api.example.test/resource', auth: { type: 'none' } },
      }),
    ],
  };

  const result = await engine.executeScenario(scenario);

  assert.strictEqual(result.status, 'COMPLETED');
  assert.strictEqual(mock.executedRequests.length, 2);
  assert.strictEqual(mock.executedRequests[0].method, 'POST');
  assert.strictEqual(mock.executedRequests[1].method, 'DELETE');
  assert.strictEqual(result.stepResults[1].status, 'PASSED_EXECUTION');
});

// 16. Teardown after network failure
test('16. Teardown after network failure still executes', async () => {
  const mock = new MockWorkflowRequestExecutor();
  mock.handler = (_req, idx) => {
    if (idx === 0) {
      return {
        success: false,
        error: { type: 'TIMEOUT', message: 'Request timed out after 30000ms' },
      };
    }
    return {
      success: true,
      status: 204,
      statusText: 'No Content',
      responseTime: 10,
      headers: {},
      body: null,
      size: 0,
    };
  };

  const engine = new WorkflowEngineService(mock);

  const scenario: WorkflowScenario = {
    id: 'scen_teardown_network_err',
    name: 'Teardown After Network Error',
    steps: [
      createBaseStep({
        id: 'main_step',
        name: 'Main Step That Times Out',
      }),
      createBaseStep({
        id: 'cleanup_step',
        name: 'Teardown Must Still Execute',
        isTeardown: true,
        request: { method: 'DELETE', url: 'https://api.example.test/cleanup', auth: { type: 'none' } },
      }),
    ],
  };

  const result = await engine.executeScenario(scenario);

  assert.strictEqual(result.status, 'PARTIALLY_COMPLETED');
  assert.strictEqual(result.stepResults[0].status, 'FAILED_EXECUTION');
  assert.strictEqual(result.stepResults[1].status, 'PASSED_EXECUTION');
  assert.strictEqual(mock.executedRequests.length, 2);
  assert.strictEqual(mock.executedRequests[1].method, 'DELETE');
});

// 17. Teardown after validation failure
test('17. Teardown after validation failure still executes', async () => {
  const mock = new MockWorkflowRequestExecutor({
    success: true,
    status: 200,
    statusText: 'OK',
    responseTime: 10,
    headers: { 'content-type': 'application/json' },
    body: { ok: true },
    size: 15,
  });

  const engine = new WorkflowEngineService(mock);

  const scenario: WorkflowScenario = {
    id: 'scen_teardown_val_err',
    name: 'Teardown After Validation Failure',
    steps: [
      createBaseStep({
        id: 'main_step',
        name: 'Main Step Failing Expectation',
        expected: { statusCodes: ['204'] },
      }),
      createBaseStep({
        id: 'cleanup_step',
        name: 'Teardown Cleanup Step',
        isTeardown: true,
        request: { method: 'DELETE', url: 'https://api.example.test/cleanup', auth: { type: 'none' } },
      }),
    ],
  };

  const result = await engine.executeScenario(scenario);

  assert.strictEqual(result.stepResults[0].validationResult?.status, 'VALIDATION_FAILED');
  assert.strictEqual(result.stepResults[1].status, 'PASSED_EXECUTION');
  assert.strictEqual(mock.executedRequests.length, 2);
});

// 18. Cleanup failure being reported without hiding the original failure
test('18. Cleanup failure being reported without hiding the original failure', async () => {
  const mock = new MockWorkflowRequestExecutor();
  mock.handler = (_req, idx) => {
    if (idx === 0) {
      return {
        success: false,
        error: { type: 'NETWORK_ERROR', message: 'Main step socket closed' },
      };
    }
    return {
      success: false,
      error: { type: 'NETWORK_ERROR', message: 'Teardown connection refused' },
    };
  };

  const engine = new WorkflowEngineService(mock);

  const scenario: WorkflowScenario = {
    id: 'scen_both_fail',
    name: 'Both Main and Teardown Fail',
    steps: [
      createBaseStep({ id: 'main_step', name: 'Main Step' }),
      createBaseStep({ id: 'cleanup_step', name: 'Cleanup Step', isTeardown: true }),
    ],
  };

  const result = await engine.executeScenario(scenario);

  assert.strictEqual(result.status, 'FAILED');
  assert.strictEqual(result.stepResults[0].status, 'FAILED_EXECUTION');
  assert.strictEqual(result.stepResults[0].error?.message, 'Main step socket closed');
  assert.strictEqual(result.stepResults[1].status, 'FAILED_EXECUTION');
  assert.strictEqual(result.stepResults[1].error?.message, 'Teardown connection refused');
  assert.strictEqual(result.summary.failed, 2);
});

// 19. Missing cleanup variables being handled safely
test('19. Missing cleanup variables being handled safely without false success claims', async () => {
  const mock = new MockWorkflowRequestExecutor();
  mock.handler = () => ({
    success: false,
    error: { type: 'NETWORK_ERROR', message: 'Failed to create resource' },
  });

  const engine = new WorkflowEngineService(mock);

  const scenario: WorkflowScenario = {
    id: 'scen_missing_cleanup_var',
    name: 'Missing Cleanup Variable',
    steps: [
      createBaseStep({
        id: 'create_item',
        name: 'Create Item',
        extractors: [
          { targetVariable: 'createdItemId', source: 'BODY_JSONPATH', path: '$.id' },
        ],
      }),
      createBaseStep({
        id: 'delete_item',
        name: 'Teardown Delete Item',
        isTeardown: true,
        request: {
          method: 'DELETE',
          url: 'https://api.example.test/items/{{createdItemId}}',
          auth: { type: 'none' },
        },
      }),
    ],
  };

  const result = await engine.executeScenario(scenario);

  assert.strictEqual(result.stepResults[0].status, 'FAILED_EXECUTION');
  assert.strictEqual(result.stepResults[1].status, 'SKIPPED');
  assert.match(
    result.stepResults[1].skipReason || '',
    /Teardown skipped: required cleanup variable is not available in context/
  );
  // Teardown HTTP request was never sent with an unresolved variable
  assert.strictEqual(mock.executedRequests.length, 1);
});

// 20. Environment/extracted-variable precedence
test('20. Environment/extracted-variable precedence: runtime extraction overrides environment', async () => {
  const mock = new MockWorkflowRequestExecutor();
  mock.handler = (_req, idx) => {
    if (idx === 0) {
      return {
        success: true,
        status: 200,
        statusText: 'OK',
        responseTime: 10,
        headers: {},
        body: { token: 'dynamic_runtime_token_999' },
        size: 30,
      };
    }
    return {
      success: true,
      status: 200,
      statusText: 'OK',
      responseTime: 10,
      headers: {},
      body: { ok: true },
      size: 10,
    };
  };

  const engine = new WorkflowEngineService(mock);

  const scenario: WorkflowScenario = {
    id: 'scen_precedence',
    name: 'Precedence Verification',
    steps: [
      createBaseStep({
        id: 'step1',
        name: 'Extract Fresh Token',
        extractors: [
          { targetVariable: 'authToken', source: 'BODY_JSONPATH', path: '$.token' },
        ],
      }),
      createBaseStep({
        id: 'step2',
        name: 'Use Token',
        dependsOn: ['step1'],
        request: {
          method: 'GET',
          url: 'https://api.example.test/data',
          headers: [{ key: 'x-token', value: '{{authToken}}', enabled: true }],
          auth: { type: 'none' },
        },
      }),
    ],
  };

  // Environment provides an initial default token
  const environment = {
    authToken: 'static_environment_token',
  };

  const result = await engine.executeScenario(scenario, environment);

  assert.strictEqual(result.status, 'COMPLETED');
  // Dispatched request for step 2 must have the extracted token, overriding the environment token
  assert.strictEqual(mock.executedRequests[1].headers?.[0].value, 'dynamic_runtime_token_999');
});

// 21. Secret metadata propagation and redaction
test('21. Secret metadata propagation and redaction', async () => {
  const mock = new MockWorkflowRequestExecutor();
  mock.handler = () => ({
    success: true,
    status: 200,
    statusText: 'OK',
    responseTime: 10,
    headers: {},
    body: { apiKey: 'my_super_secret_api_key_42' },
    size: 20,
  });

  const engine = new WorkflowEngineService(mock);

  const scenario: WorkflowScenario = {
    id: 'scen_secret_redact',
    name: 'Secret Redaction Tracking',
    steps: [
      createBaseStep({
        id: 'step1',
        name: 'Extract Secret API Key',
        extractors: [
          { targetVariable: 'apiKey', source: 'BODY_JSONPATH', path: '$.apiKey', isSecret: true },
        ],
      }),
      createBaseStep({
        id: 'step2',
        name: 'Use API Key in Query Param',
        dependsOn: ['step1'],
        request: {
          method: 'GET',
          url: 'https://api.example.test/secure',
          queryParams: [{ key: 'apikey', value: '{{apiKey}}', enabled: true }],
          auth: { type: 'none' },
        },
      }),
    ],
  };

  const result = await engine.executeScenario(scenario);

  assert.strictEqual(result.status, 'COMPLETED');
  assert.strictEqual(result.finalContext.apiKey.isSecret, true);
  // Real request sent with actual key
  assert.strictEqual(mock.executedRequests[1].queryParams?.[0].value, 'my_super_secret_api_key_42');
  // Sanitized step result has [REDACTED]
  assert.strictEqual(result.stepResults[1].request.queryParams?.[0].value, '[REDACTED]');
});

// 22. Input immutability
test('22. Input immutability: scenario definition and steps are not mutated', async () => {
  const mock = new MockWorkflowRequestExecutor();
  const engine = new WorkflowEngineService(mock);

  const scenario: WorkflowScenario = {
    id: 'scen_immutability',
    name: 'Immutability Check',
    steps: [
      createBaseStep({
        id: 'step1',
        name: 'Step 1',
        request: {
          method: 'GET',
          url: 'https://api.example.test/users/{{var}}',
          queryParams: [{ key: 'q', value: '{{var}}', enabled: true }],
          headers: [{ key: 'x-custom', value: '{{var}}', enabled: true }],
          body: JSON.stringify({ item: '{{var}}' }),
          auth: { type: 'none' },
        },
      }),
    ],
  };

  const snapshotBefore = JSON.stringify(scenario);

  await engine.executeScenario(scenario, { var: 'concrete_value' });

  const snapshotAfter = JSON.stringify(scenario);
  assert.strictEqual(snapshotBefore, snapshotAfter);
});

// 23. No network calls for invalid workflows
test('23. No network calls for invalid workflows', async () => {
  const mock = new MockWorkflowRequestExecutor();
  const engine = new WorkflowEngineService(mock);

  const invalidWorkflows: WorkflowScenario[] = [
    { id: '', name: 'Empty ID', steps: [createBaseStep({ id: 's1', name: 'S1' })] },
    { id: 'scen', name: 'Cycle', steps: [
      createBaseStep({ id: 'a', name: 'A', dependsOn: ['b'] }),
      createBaseStep({ id: 'b', name: 'B', dependsOn: ['a'] }),
    ]},
    { id: 'scen', name: 'Self Dependency', steps: [
      createBaseStep({ id: 'a', name: 'A', dependsOn: ['a'] }),
    ]},
    { id: 'scen', name: 'Non Existent Dependency', steps: [
      createBaseStep({ id: 'a', name: 'A', dependsOn: ['missing'] }),
    ]},
  ];

  for (const wf of invalidWorkflows) {
    await assert.rejects(async () => await engine.executeScenario(wf), WorkflowValidationError);
  }

  assert.strictEqual(mock.executedRequests.length, 0);
});

// 24. Existing outbound safety restrictions remaining active
test('24. Existing outbound safety restrictions remaining active via RequestExecutorService', async () => {
  // Real RequestExecutorService in production safe mode blocks private IP ranges
  const safeExecutor = new RequestExecutorService(5000, true);
  const engine = new WorkflowEngineService(safeExecutor);

  const scenario: WorkflowScenario = {
    id: 'scen_safety_policy',
    name: 'Outbound Safety Enforcement',
    steps: [
      createBaseStep({
        id: 'blocked_step',
        name: 'Blocked Private Target',
        request: {
          method: 'GET',
          url: 'http://192.168.1.50/private-data',
          auth: { type: 'none' },
        },
      }),
    ],
  };

  const result = await engine.executeScenario(scenario);

  assert.strictEqual(result.status, 'FAILED');
  assert.strictEqual(result.stepResults[0].status, 'FAILED_EXECUTION');
  assert.strictEqual(result.stepResults[0].error?.type, 'OUTBOUND_POLICY');
});

// 25. Isolation between consecutive workflow executions
test('25. Isolation between consecutive workflow executions', async () => {
  const mock = new MockWorkflowRequestExecutor();
  mock.handler = (_req, idx) => {
    if (idx === 0) {
      return {
        success: true,
        status: 200,
        statusText: 'OK',
        responseTime: 10,
        headers: {},
        body: { secretRunKey: 'unique_run_1_key' },
        size: 30,
      };
    }
    return {
      success: true,
      status: 200,
      statusText: 'OK',
      responseTime: 10,
      headers: {},
      body: { ok: true },
      size: 10,
    };
  };

  const engine = new WorkflowEngineService(mock);

  // Run 1 extracts secretRunKey
  const scenarioRun1: WorkflowScenario = {
    id: 'scen_run1',
    name: 'Run 1',
    steps: [
      createBaseStep({
        id: 'step_r1',
        name: 'Extract Secret',
        extractors: [
          { targetVariable: 'secretRunKey', source: 'BODY_JSONPATH', path: '$.secretRunKey' },
        ],
      }),
    ],
  };

  const resultRun1 = await engine.executeScenario(scenarioRun1);
  assert.strictEqual(resultRun1.finalContext.secretRunKey.value, 'unique_run_1_key');

  // Run 2 attempts to use secretRunKey without setting it
  const scenarioRun2: WorkflowScenario = {
    id: 'scen_run2',
    name: 'Run 2',
    steps: [
      createBaseStep({
        id: 'step_r2',
        name: 'Attempt to Use Leaked Variable',
        request: {
          method: 'GET',
          url: 'https://api.example.test/resource/{{secretRunKey}}',
          auth: { type: 'none' },
        },
      }),
    ],
  };

  const resultRun2 = await engine.executeScenario(scenarioRun2);

  // Must NOT leak context from Run 1!
  assert.strictEqual(resultRun2.status, 'FAILED');
  assert.strictEqual(resultRun2.stepResults[0].status, 'SKIPPED');
  assert.match(resultRun2.stepResults[0].skipReason || '', /required variable 'secretRunKey' is unresolved/);
});

// 26. Multi-dependency topological sorting (step 3 depends on step 1 & step 2 declared out of order)
test('26. Multi-dependency topological sorting orders dependencies before dependents', async () => {
  const mock = new MockWorkflowRequestExecutor();
  const engine = new WorkflowEngineService(mock);

  const scenario: WorkflowScenario = {
    id: 'scen_topo_multi',
    name: 'Topological Multi Dependency',
    steps: [
      createBaseStep({
        id: 'step3',
        name: 'Step 3 - Final Aggregation',
        dependsOn: ['step1', 'step2'],
        request: { method: 'GET', url: 'https://api.example.test/step3', auth: { type: 'none' } },
      }),
      createBaseStep({
        id: 'step1',
        name: 'Step 1 - First Prerequisite',
        request: { method: 'GET', url: 'https://api.example.test/step1', auth: { type: 'none' } },
      }),
      createBaseStep({
        id: 'step2',
        name: 'Step 2 - Second Prerequisite',
        request: { method: 'GET', url: 'https://api.example.test/step2', auth: { type: 'none' } },
      }),
    ],
  };

  const result = await engine.executeScenario(scenario);

  assert.strictEqual(result.status, 'COMPLETED');
  assert.strictEqual(mock.executedRequests.length, 3);
  assert.strictEqual(mock.executedRequests[0].url, 'https://api.example.test/step1');
  assert.strictEqual(mock.executedRequests[1].url, 'https://api.example.test/step2');
  assert.strictEqual(mock.executedRequests[2].url, 'https://api.example.test/step3');
});

// 27. Safe policy override with continueOnValidationFailure
test('27. Safe policy override with continueOnValidationFailure allows dependent execution', async () => {
  const mock = new MockWorkflowRequestExecutor({
    success: true,
    status: 200,
    statusText: 'OK',
    responseTime: 10,
    headers: { 'content-type': 'application/json' },
    body: { ok: true },
    size: 15,
  });

  const engine = new WorkflowEngineService(mock);

  const scenario: WorkflowScenario = {
    id: 'scen_continue_policy',
    name: 'Continue on Validation Failure Policy',
    steps: [
      createBaseStep({
        id: 'step1',
        name: 'Step 1 - Fails Status Expectation',
        expected: { statusCodes: ['204'] },
      }),
      createBaseStep({
        id: 'step2',
        name: 'Step 2 - Explicitly Continues on Step 1 Validation Failure',
        dependsOn: ['step1'],
        continueOnValidationFailure: true,
      }),
    ],
  };

  const result = await engine.executeScenario(scenario);

  assert.strictEqual(result.stepResults[0].validationResult?.status, 'VALIDATION_FAILED');
  assert.strictEqual(result.stepResults[1].status, 'PASSED_EXECUTION');
  assert.strictEqual(mock.executedRequests.length, 2);
});

// 28. Teardown steps with mutual dependencies execute in topological order
test('28. Teardown steps with mutual dependencies execute in topological order', async () => {
  const mock = new MockWorkflowRequestExecutor();
  const engine = new WorkflowEngineService(mock);

  const scenario: WorkflowScenario = {
    id: 'scen_teardown_deps',
    name: 'Teardown Step Dependencies',
    steps: [
      createBaseStep({ id: 'main', name: 'Main Step' }),
      createBaseStep({
        id: 'teardown_2',
        name: 'Teardown 2 (depends on Teardown 1)',
        isTeardown: true,
        dependsOn: ['teardown_1'],
        request: { method: 'DELETE', url: 'https://api.example.test/cleanup/2', auth: { type: 'none' } },
      }),
      createBaseStep({
        id: 'teardown_1',
        name: 'Teardown 1',
        isTeardown: true,
        request: { method: 'DELETE', url: 'https://api.example.test/cleanup/1', auth: { type: 'none' } },
      }),
    ],
  };

  const result = await engine.executeScenario(scenario);

  assert.strictEqual(result.status, 'COMPLETED');
  assert.strictEqual(mock.executedRequests.length, 3);
  assert.strictEqual(mock.executedRequests[1].url, 'https://api.example.test/cleanup/1');
  assert.strictEqual(mock.executedRequests[2].url, 'https://api.example.test/cleanup/2');
});

// 29. Non-JSON body handling with STATUS_CODE extractor
test('29. Non-JSON body handling with STATUS_CODE extractor', async () => {
  const mock = new MockWorkflowRequestExecutor({
    success: true,
    status: 200,
    statusText: 'OK',
    responseTime: 10,
    headers: { 'content-type': 'text/plain' },
    body: 'Plain text payload',
    size: 18,
  });

  const engine = new WorkflowEngineService(mock);

  const scenario: WorkflowScenario = {
    id: 'scen_status_code_extractor',
    name: 'Status Code Extractor',
    steps: [
      createBaseStep({
        id: 'step1',
        name: 'Step 1 - Plain Text Response',
        extractors: [
          { targetVariable: 'httpStatus', source: 'STATUS_CODE' },
        ],
      }),
    ],
  };

  const result = await engine.executeScenario(scenario);

  assert.strictEqual(result.status, 'COMPLETED');
  assert.strictEqual(result.finalContext.httpStatus.value, 200);
});

// 30. Extraction default value fallback when property is missing
test('30. Extraction default value fallback when property is missing', async () => {
  const mock = new MockWorkflowRequestExecutor({
    success: true,
    status: 200,
    statusText: 'OK',
    responseTime: 10,
    headers: { 'content-type': 'application/json' },
    body: { otherField: 'val' },
    size: 20,
  });

  const engine = new WorkflowEngineService(mock);

  const scenario: WorkflowScenario = {
    id: 'scen_extractor_default_val',
    name: 'Extractor Default Value',
    steps: [
      createBaseStep({
        id: 'step1',
        name: 'Step 1 - Missing Field with Default',
        extractors: [
          {
            targetVariable: 'optionalVar',
            source: 'BODY_JSONPATH',
            path: '$.missingField',
            defaultValue: 'fallback_default',
          },
        ],
      }),
      createBaseStep({
        id: 'step2',
        name: 'Step 2 - Uses Default Variable',
        dependsOn: ['step1'],
        request: {
          method: 'GET',
          url: 'https://api.example.test/items/{{optionalVar}}',
          auth: { type: 'none' },
        },
      }),
    ],
  };

  const result = await engine.executeScenario(scenario);

  assert.strictEqual(result.status, 'COMPLETED');
  assert.strictEqual(mock.executedRequests[1].url, 'https://api.example.test/items/fallback_default');
});
