import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkflowEngineService } from '../src/services/workflowEngine.service.js';
import { RequestExecutorService } from '../src/services/requestExecutor.service.js';
import { WorkflowSanitizerService } from '../src/services/workflowSanitizer.service.js';
import type { ApiExecutionResult, ApiRequest } from '../src/types/request.types.js';
import type { EnvironmentProfile, WorkflowScenario } from '../src/types/workflow.types.js';

// Deterministic Mock Request Executor
class MockHttpAdapter extends RequestExecutorService {
  public executedRequests: ApiRequest[] = [];
  public handler: (req: ApiRequest, index: number) => ApiExecutionResult | Promise<ApiExecutionResult>;

  constructor(handler: (req: ApiRequest, index: number) => ApiExecutionResult | Promise<ApiExecutionResult>) {
    super();
    this.handler = handler;
  }

  override async execute(request: ApiRequest): Promise<ApiExecutionResult> {
    const idx = this.executedRequests.length;
    this.executedRequests.push(JSON.parse(JSON.stringify(request)));
    return await this.handler(request, idx);
  }
}

// 1. Successful sequential workflow execution (3 steps)
test('1. Successful sequential workflow execution across 3 steps', async () => {
  const mockAdapter = new MockHttpAdapter((req, index) => {
    return {
      success: true,
      status: 200,
      statusText: 'OK',
      responseTime: 10 + index,
      headers: { 'content-type': 'application/json' },
      body: { stepIndex: index, url: req.url },
      size: 50,
    };
  });

  const engine = new WorkflowEngineService(mockAdapter);
  const scenario: WorkflowScenario = {
    id: 'wf_seq_3',
    name: 'Three Step Sequential Workflow',
    steps: [
      {
        id: 's1',
        name: 'Step One',
        enabled: true,
        request: { method: 'GET', url: 'https://api.test/step1', auth: { type: 'none' } },
      },
      {
        id: 's2',
        name: 'Step Two',
        enabled: true,
        dependsOn: ['s1'],
        request: { method: 'GET', url: 'https://api.test/step2', auth: { type: 'none' } },
      },
      {
        id: 's3',
        name: 'Step Three',
        enabled: true,
        dependsOn: ['s2'],
        request: { method: 'GET', url: 'https://api.test/step3', auth: { type: 'none' } },
      },
    ],
  };

  const result = await engine.executeScenario(scenario);

  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.summary.totalSteps, 3);
  assert.equal(result.summary.executed, 3);
  assert.equal(result.summary.passed, 3);
  assert.equal(result.summary.failed, 0);
  assert.equal(result.summary.blocked, 0);
  assert.equal(mockAdapter.executedRequests.length, 3);
  assert.equal(mockAdapter.executedRequests[0].url, 'https://api.test/step1');
  assert.equal(mockAdapter.executedRequests[1].url, 'https://api.test/step2');
  assert.equal(mockAdapter.executedRequests[2].url, 'https://api.test/step3');
});

// 2. Extracting token and userId from mocked login and substituting into URLs, headers, and bodies
test('2. Extract token & userId from login and substitute into subsequent URL, header, and body', async () => {
  const mockAdapter = new MockHttpAdapter((req) => {
    if (req.url.includes('/auth/login')) {
      return {
        success: true,
        status: 200,
        statusText: 'OK',
        responseTime: 15,
        headers: { 'content-type': 'application/json' },
        body: {
          token: 'jwt_mock_token_999',
          user: { id: 'usr_4455', role: 'admin' },
        },
      };
    }
    if (req.url.includes('/users/usr_4455')) {
      return {
        success: true,
        status: 200,
        statusText: 'OK',
        responseTime: 10,
        headers: { 'content-type': 'application/json' },
        body: { id: 'usr_4455', profileCreated: true },
      };
    }
    return {
      success: true,
      status: 200,
      statusText: 'OK',
      responseTime: 12,
      headers: { 'content-type': 'application/json' },
      body: { status: 'acknowledged' },
    };
  });

  const engine = new WorkflowEngineService(mockAdapter);
  const scenario: WorkflowScenario = {
    id: 'wf_chain_extract',
    name: 'Auth and Resource Chaining',
    steps: [
      {
        id: 'step_login',
        name: 'Login Step',
        enabled: true,
        request: {
          method: 'POST',
          url: 'https://api.test/auth/login',
          headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
          body: JSON.stringify({ username: 'testuser' }),
          auth: { type: 'none' },
        },
        extractors: [
          { targetVariable: 'authToken', source: 'BODY_JSONPATH', path: '$.token', isSecret: true },
          { targetVariable: 'userId', source: 'BODY_JSONPATH', path: '$.user.id', isSecret: false },
        ],
      },
      {
        id: 'step_profile',
        name: 'Get User Profile',
        enabled: true,
        dependsOn: ['step_login'],
        request: {
          method: 'GET',
          // URL substitution with extracted userId
          url: 'https://api.test/users/{{userId}}',
          // Header substitution with extracted authToken
          headers: [{ key: 'Authorization', value: 'Bearer {{authToken}}', enabled: true }],
          auth: { type: 'none' },
        },
      },
      {
        id: 'step_update',
        name: 'Update User Profile',
        enabled: true,
        dependsOn: ['step_profile'],
        request: {
          method: 'PUT',
          url: 'https://api.test/users/{{userId}}/settings',
          headers: [
            { key: 'Authorization', value: 'Bearer {{authToken}}', enabled: true },
            { key: 'Content-Type', value: 'application/json', enabled: true },
          ],
          // Body substitution with extracted userId and authToken
          body: JSON.stringify({ targetUserId: '{{userId}}', tokenEcho: '{{authToken}}' }),
          auth: { type: 'none' },
        },
      },
    ],
  };

  const result = await engine.executeScenario(scenario);

  assert.equal(result.status, 'COMPLETED');
  assert.equal(mockAdapter.executedRequests.length, 3);

  // Assert Step 2 substitutions:
  const step2Req = mockAdapter.executedRequests[1];
  assert.equal(step2Req.url, 'https://api.test/users/usr_4455');
  assert.equal(step2Req.headers[0].value, 'Bearer jwt_mock_token_999');

  // Assert Step 3 substitutions in URL, headers, and body:
  const step3Req = mockAdapter.executedRequests[2];
  assert.equal(step3Req.url, 'https://api.test/users/usr_4455/settings');
  assert.equal(step3Req.headers[0].value, 'Bearer jwt_mock_token_999');
  const parsedBody = JSON.parse(step3Req.body as string);
  assert.equal(parsedBody.targetUserId, 'usr_4455');
  assert.equal(parsedBody.tokenEcho, 'jwt_mock_token_999');
});

// 3. Missing or unresolved variables
test('3. Missing or unresolved variables cause step to be safely SKIPPED with clear skipReason without dispatching HTTP', async () => {
  let dispatched = false;
  const mockAdapter = new MockHttpAdapter(() => {
    dispatched = true;
    return { success: true, status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: {} };
  });

  const engine = new WorkflowEngineService(mockAdapter);
  const scenario: WorkflowScenario = {
    id: 'wf_missing_var',
    name: 'Missing Variable Workflow',
    steps: [
      {
        id: 's1',
        name: 'Step With Unbound Token',
        enabled: true,
        request: {
          method: 'GET',
          url: 'https://api.test/items/{{nonExistentId}}',
          auth: { type: 'none' },
        },
      },
    ],
  };

  const result = await engine.executeScenario(scenario);

  assert.equal(result.status, 'FAILED');
  assert.equal(dispatched, false, 'No HTTP request should execute when required variable is missing');
  assert.equal(result.stepResults[0].status, 'SKIPPED');
  assert.ok(result.stepResults[0].skipReason?.includes('nonExistentId'));
  assert.ok(result.stepResults[0].skipReason?.includes('unresolved'));
});

// 4. Dependency ordering and failure propagation
test('4. Dependency ordering and failure propagation blocks downstream dependents but runs independent steps', async () => {
  const executedStepIds: string[] = [];
  const mockAdapter = new MockHttpAdapter((req) => {
    if (req.url.includes('/step_fail')) {
      executedStepIds.push('step_fail');
      return {
        success: false,
        error: { type: 'SERVER_ERROR', message: 'HTTP 500 Server Error' },
      };
    }
    if (req.url.includes('/step_independent')) {
      executedStepIds.push('step_independent');
      return { success: true, status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: {} };
    }
    executedStepIds.push('step_dependent');
    return { success: true, status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: {} };
  });

  const engine = new WorkflowEngineService(mockAdapter);
  const scenario: WorkflowScenario = {
    id: 'wf_dep_fail',
    name: 'Dependency Failure Scenario',
    steps: [
      {
        id: 'step_fail',
        name: 'Step that Fails',
        enabled: true,
        request: { method: 'GET', url: 'https://api.test/step_fail', auth: { type: 'none' } },
      },
      {
        id: 'step_dependent',
        name: 'Step Depending on Failed Step',
        enabled: true,
        dependsOn: ['step_fail'],
        request: { method: 'GET', url: 'https://api.test/step_dependent', auth: { type: 'none' } },
      },
      {
        id: 'step_independent',
        name: 'Independent Step',
        enabled: true,
        request: { method: 'GET', url: 'https://api.test/step_independent', auth: { type: 'none' } },
      },
    ],
  };

  const result = await engine.executeScenario(scenario);

  assert.equal(result.status, 'PARTIALLY_COMPLETED');
  assert.deepEqual(executedStepIds, ['step_fail', 'step_independent']);
  assert.equal(result.stepResults[0].status, 'FAILED_EXECUTION');
  assert.equal(result.stepResults[1].status, 'SKIPPED');
  assert.ok(result.stepResults[1].skipReason?.includes("Blocked by prerequisite step 'step_fail'"));
  assert.equal(result.stepResults[2].status, 'PASSED_EXECUTION');
});

// 5. Teardown execution after successful execution
test('5. Teardown execution runs in cleanup phase after successful scenario execution', async () => {
  const callOrder: string[] = [];
  const mockAdapter = new MockHttpAdapter((req) => {
    if (req.url.includes('/main1')) callOrder.push('main1');
    if (req.url.includes('/main2')) callOrder.push('main2');
    if (req.url.includes('/teardown')) callOrder.push('teardown');
    return { success: true, status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: {} };
  });

  const engine = new WorkflowEngineService(mockAdapter);
  const scenario: WorkflowScenario = {
    id: 'wf_td_success',
    name: 'Teardown on Success',
    steps: [
      {
        id: 's1',
        name: 'Main Step 1',
        enabled: true,
        request: { method: 'GET', url: 'https://api.test/main1', auth: { type: 'none' } },
      },
      {
        id: 's2',
        name: 'Main Step 2',
        enabled: true,
        dependsOn: ['s1'],
        request: { method: 'GET', url: 'https://api.test/main2', auth: { type: 'none' } },
      },
      {
        id: 's_td',
        name: 'Cleanup Step',
        isTeardown: true,
        enabled: true,
        request: { method: 'DELETE', url: 'https://api.test/teardown', auth: { type: 'none' } },
      },
    ],
  };

  const result = await engine.executeScenario(scenario);

  assert.equal(result.status, 'COMPLETED');
  assert.deepEqual(callOrder, ['main1', 'main2', 'teardown']);
  const tdStep = result.stepResults.find((s) => s.stepId === 's_td');
  assert.equal(tdStep?.status, 'PASSED_EXECUTION');
  assert.equal(tdStep?.isTeardown, true);
});

// 6. Teardown execution after main step fails
test('6. Teardown execution executes in cleanup phase even after main step encounters network/transport failure', async () => {
  let teardownCalled = false;
  const mockAdapter = new MockHttpAdapter((req) => {
    if (req.url.includes('/fail')) {
      return {
        success: false,
        error: { type: 'NETWORK_ERROR', message: 'Connection reset by peer' },
      };
    }
    if (req.url.includes('/cleanup')) {
      teardownCalled = true;
      return { success: true, status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: {} };
    }
    return { success: true, status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: {} };
  });

  const engine = new WorkflowEngineService(mockAdapter);
  const scenario: WorkflowScenario = {
    id: 'wf_td_on_fail',
    name: 'Teardown on Failure',
    steps: [
      {
        id: 's1',
        name: 'Failing Main Step',
        enabled: true,
        request: { method: 'GET', url: 'https://api.test/fail', auth: { type: 'none' } },
      },
      {
        id: 's_clean',
        name: 'Delete Provisioned Resources',
        isTeardown: true,
        enabled: true,
        request: { method: 'DELETE', url: 'https://api.test/cleanup', auth: { type: 'none' } },
      },
    ],
  };

  const result = await engine.executeScenario(scenario);

  assert.equal(result.status, 'PARTIALLY_COMPLETED');
  assert.equal(teardownCalled, true, 'Teardown must run even when main step fails');
  assert.equal(result.stepResults[0].status, 'FAILED_EXECUTION');
  assert.equal(result.stepResults[1].status, 'PASSED_EXECUTION');
  assert.equal(result.stepResults[1].isTeardown, true);
});

// 7. Reporting teardown failure without concealing original workflow failure
test('7. Reporting teardown failure without concealing original main step failure', async () => {
  const mockAdapter = new MockHttpAdapter((req) => {
    if (req.url.includes('/main_fail')) {
      return {
        success: false,
        error: { type: 'SERVER_ERROR', message: 'Main step failed with HTTP 500' },
      };
    }
    if (req.url.includes('/td_fail')) {
      return {
        success: false,
        error: { type: 'TIMEOUT', message: 'Teardown step timed out' },
      };
    }
    return { success: true, status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: {} };
  });

  const engine = new WorkflowEngineService(mockAdapter);
  const scenario: WorkflowScenario = {
    id: 'wf_double_fail',
    name: 'Both Main and Teardown Fail',
    steps: [
      {
        id: 's_main',
        name: 'Failing Main',
        enabled: true,
        request: { method: 'GET', url: 'https://api.test/main_fail', auth: { type: 'none' } },
      },
      {
        id: 's_td',
        name: 'Failing Teardown',
        isTeardown: true,
        enabled: true,
        request: { method: 'DELETE', url: 'https://api.test/td_fail', auth: { type: 'none' } },
      },
    ],
  };

  const result = await engine.executeScenario(scenario);

  assert.equal(result.status, 'FAILED');
  assert.equal(result.summary.failed, 2);
  assert.equal(result.summary.passed, 0);
  assert.equal(result.stepResults[0].status, 'FAILED_EXECUTION');
  assert.equal(result.stepResults[0].error?.message, 'Main step failed with HTTP 500');
  assert.equal(result.stepResults[1].status, 'FAILED_EXECUTION');
  assert.equal(result.stepResults[1].error?.message, 'Teardown step timed out');
});

// 8. Correct distinction between HTTP transport success vs workflow-step success
test('8. Distinction between HTTP transport success and workflow-step validation outcome', async () => {
  const mockAdapter = new MockHttpAdapter((req) => {
    if (req.url.includes('/get_404_expected')) {
      return {
        success: true, // HTTP transport succeeded in receiving response
        status: 404,
        statusText: 'Not Found',
        responseTime: 10,
        headers: { 'content-type': 'application/json' },
        body: { error: 'Resource missing' },
      };
    }
    if (req.url.includes('/get_404_unexpected')) {
      return {
        success: true, // HTTP transport succeeded
        status: 404,
        statusText: 'Not Found',
        responseTime: 10,
        headers: { 'content-type': 'application/json' },
        body: { error: 'Resource missing' },
      };
    }
    return { success: true, status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: {} };
  });

  const engine = new WorkflowEngineService(mockAdapter);

  // Case A: Step expects HTTP 200, but receives HTTP 404 -> validation failure
  const scenarioUnexpected: WorkflowScenario = {
    id: 'wf_unexp_404',
    name: 'Unexpected 404 Step',
    steps: [
      {
        id: 's1',
        name: 'Query Resource Expected 200',
        enabled: true,
        request: { method: 'GET', url: 'https://api.test/get_404_unexpected', auth: { type: 'none' } },
        expected: { statusCodes: ['200'] },
      },
      {
        id: 's2',
        name: 'Dependent Step',
        enabled: true,
        dependsOn: ['s1'],
        request: { method: 'GET', url: 'https://api.test/subsequent', auth: { type: 'none' } },
      },
    ],
  };

  const resA = await engine.executeScenario(scenarioUnexpected);
  assert.equal(resA.stepResults[0].validationResult?.status, 'VALIDATION_FAILED', 'Validation must fail when 200 was expected');
  assert.equal(resA.stepResults[1].status, 'SKIPPED', 'Dependent step must be blocked on validation failure');

  // Case B: Step explicitly expects HTTP 404 -> validation passes
  const scenarioExpected: WorkflowScenario = {
    id: 'wf_exp_404',
    name: 'Expected 404 Step',
    steps: [
      {
        id: 's1',
        name: 'Query Deleted Resource Expected 404',
        enabled: true,
        request: { method: 'GET', url: 'https://api.test/get_404_expected', auth: { type: 'none' } },
        expected: { statusCodes: ['404'] },
      },
      {
        id: 's2',
        name: 'Dependent Step After Confirmed 404',
        enabled: true,
        dependsOn: ['s1'],
        request: { method: 'GET', url: 'https://api.test/subsequent', auth: { type: 'none' } },
      },
    ],
  };

  const resB = await engine.executeScenario(scenarioExpected);
  assert.equal(resB.stepResults[0].validationResult?.status, 'VALIDATION_PASSED', 'Validation must pass when 404 matches expected');
  assert.equal(resB.stepResults[1].status, 'PASSED_EXECUTION', 'Dependent step must proceed when expected status was met');
  assert.equal(resB.status, 'COMPLETED');
});

// 9. HTTP timeout/network errors and malformed responses
test('9. HTTP timeout and network errors handled gracefully with structured error info', async () => {
  const mockAdapter = new MockHttpAdapter((req) => {
    if (req.url.includes('/timeout')) {
      return {
        success: false,
        error: { type: 'TIMEOUT', message: 'Request timed out after 30000ms' },
      };
    }
    if (req.url.includes('/network_error')) {
      return {
        success: false,
        error: { type: 'NETWORK_ERROR', message: 'getaddrinfo ENOTFOUND api.unknown.test' },
      };
    }
    return {
      success: true,
      status: 200,
      statusText: 'OK',
      responseTime: 10,
      headers: { 'content-type': 'text/plain' },
      body: '<html>malformed non-json</html>',
    };
  });

  const engine = new WorkflowEngineService(mockAdapter);
  const scenario: WorkflowScenario = {
    id: 'wf_errors',
    name: 'Network Error Handling',
    steps: [
      {
        id: 's_timeout',
        name: 'Timed Out Step',
        enabled: true,
        request: { method: 'GET', url: 'https://api.test/timeout', auth: { type: 'none' } },
      },
      {
        id: 's_net',
        name: 'Network Failed Step',
        enabled: true,
        request: { method: 'GET', url: 'https://api.test/network_error', auth: { type: 'none' } },
      },
    ],
  };

  const result = await engine.executeScenario(scenario);

  assert.equal(result.status, 'FAILED');
  assert.equal(result.stepResults[0].status, 'FAILED_EXECUTION');
  assert.equal(result.stepResults[0].error?.type, 'TIMEOUT');
  assert.equal(result.stepResults[1].status, 'FAILED_EXECUTION');
  assert.equal(result.stepResults[1].error?.type, 'NETWORK_ERROR');
});

// 10. Secret redaction, including extracted tokens and sensitive environment values
test('10. Secret redaction for environment secrets and extracted tokens in sanitized DTO and serialized JSON', async () => {
  const mockAdapter = new MockHttpAdapter(() => ({
    success: true,
    status: 200,
    statusText: 'OK',
    responseTime: 10,
    headers: {
      'set-cookie': 'session=super_secret_cookie_token',
      'authorization': 'Bearer super_secret_auth_token',
    },
    body: {
      account: {
        pin: 554433,
        apiKey: 'sk_live_super_secret_key_123',
      },
      publicInfo: 'visible-data',
    },
  }));

  const engine = new WorkflowEngineService(mockAdapter);
  const sanitizer = new WorkflowSanitizerService();

  const scenario: WorkflowScenario = {
    id: 'wf_secrets',
    name: 'Secrets Workflow',
    steps: [
      {
        id: 's1',
        name: 'Login and Extract',
        enabled: true,
        request: {
          method: 'POST',
          url: 'https://api.test/login?key={{envSecretKey}}',
          headers: [{ key: 'X-Api-Key', value: '{{envSecretKey}}', enabled: true }],
          body: JSON.stringify({ secretInput: '{{envSecretKey}}' }),
          auth: { type: 'bearer', token: '{{envSecretKey}}' },
        },
        extractors: [
          { targetVariable: 'extractedApiKey', source: 'BODY_JSONPATH', path: '$.account.apiKey', isSecret: true },
          { targetVariable: 'extractedPin', source: 'BODY_JSONPATH', path: '$.account.pin', isSecret: true },
        ],
      },
    ],
  };

  const environment: EnvironmentProfile = {
    id: 'env_1',
    name: 'Secure Env',
    variables: [
      { name: 'envSecretKey', value: 'env_secret_token_abc_789', isSecret: true, enabled: true },
    ],
  };

  const rawResult = await engine.executeScenario(scenario, environment);
  const sanitized = sanitizer.sanitizeExecutionResult(rawResult, scenario, environment);

  // 1. Assert internal raw engine result was NOT mutated and retains raw values for internal processing:
  assert.equal(rawResult.finalContext.extractedApiKey.value, 'sk_live_super_secret_key_123');
  assert.equal(rawResult.finalContext.extractedPin.value, 554433);

  // 2. Assert sanitized DTO has redacted values:
  assert.equal(sanitized.finalContext.envSecretKey.value, '[REDACTED]');
  assert.equal(sanitized.finalContext.extractedApiKey.value, '[REDACTED]');
  assert.equal(sanitized.finalContext.extractedPin.value, '[REDACTED]');
  assert.equal(sanitized.finalContext.extractedApiKey.isSecret, true);

  // 3. Assert serialized JSON string contains NO secrets:
  const serialized = JSON.stringify(sanitized);
  assert.ok(!serialized.includes('env_secret_token_abc_789'), 'envSecretKey must not leak');
  assert.ok(!serialized.includes('sk_live_super_secret_key_123'), 'extractedApiKey must not leak');
  assert.ok(!serialized.includes('554433'), 'extractedPin must not leak');
  assert.ok(!serialized.includes('super_secret_cookie_token'), 'cookie token must not leak');
  assert.ok(serialized.includes('visible-data'), 'Non-secret public info must be retained');
});

// 11. Runtime context isolation between workflow executions
test('11. Runtime context isolation between consecutive workflow executions', async () => {
  const capturedRequests: ApiRequest[] = [];
  const mockAdapter = new MockHttpAdapter((req) => {
    capturedRequests.push(req);
    return {
      success: true,
      status: 200,
      statusText: 'OK',
      responseTime: 10,
      headers: {},
      body: { token: 'token_from_run_1' },
    };
  });

  const engine = new WorkflowEngineService(mockAdapter);

  const scenario1: WorkflowScenario = {
    id: 'wf_run_1',
    name: 'Run 1',
    steps: [
      {
        id: 's1',
        name: 'Extract Token',
        enabled: true,
        request: { method: 'GET', url: 'https://api.test/auth', auth: { type: 'none' } },
        extractors: [
          { targetVariable: 'sessionToken', source: 'BODY_JSONPATH', path: '$.token', isSecret: true },
        ],
      },
    ],
  };

  const scenario2: WorkflowScenario = {
    id: 'wf_run_2',
    name: 'Run 2',
    steps: [
      {
        id: 's2',
        name: 'Expect Missing Token',
        enabled: true,
        request: {
          method: 'GET',
          url: 'https://api.test/resource/{{sessionToken}}',
          auth: { type: 'none' },
        },
      },
    ],
  };

  // Run scenario 1 (populates sessionToken)
  const res1 = await engine.executeScenario(scenario1);
  assert.equal(res1.status, 'COMPLETED');
  assert.equal(res1.finalContext.sessionToken.value, 'token_from_run_1');

  // Run scenario 2 (must NOT inherit sessionToken from scenario 1)
  const res2 = await engine.executeScenario(scenario2);
  assert.equal(res2.status, 'FAILED');
  assert.equal(res2.stepResults[0].status, 'SKIPPED');
  assert.ok(res2.stepResults[0].skipReason?.includes('sessionToken'));
  assert.equal(res2.finalContext.sessionToken, undefined, 'Run 2 context must not contain variables from Run 1');
});

// 12. Setup and teardown metadata propagation to result DTO
test('12. Setup and teardown metadata propagation to execution results and sanitized DTOs', async () => {
  const mockAdapter = new MockHttpAdapter(() => ({
    success: true,
    status: 200,
    statusText: 'OK',
    responseTime: 10,
    headers: {},
    body: {},
  }));

  const engine = new WorkflowEngineService(mockAdapter);
  const sanitizer = new WorkflowSanitizerService();

  const scenario: WorkflowScenario = {
    id: 'wf_meta',
    name: 'Metadata Test',
    steps: [
      {
        id: 's_setup',
        name: 'Initialize Database',
        isSetup: true,
        enabled: true,
        request: { method: 'POST', url: 'https://api.test/setup', auth: { type: 'none' } },
      },
      {
        id: 's_normal',
        name: 'Normal Operation',
        enabled: true,
        request: { method: 'GET', url: 'https://api.test/data', auth: { type: 'none' } },
      },
      {
        id: 's_teardown',
        name: 'Purge Test Database',
        isTeardown: true,
        enabled: true,
        request: { method: 'DELETE', url: 'https://api.test/teardown', auth: { type: 'none' } },
      },
    ],
  };

  const raw = await engine.executeScenario(scenario);
  const sanitized = sanitizer.sanitizeExecutionResult(raw, scenario);

  assert.equal(sanitized.stepResults[0].isSetup, true);
  assert.equal(sanitized.stepResults[0].isTeardown, undefined);

  assert.equal(sanitized.stepResults[1].isSetup, undefined);
  assert.equal(sanitized.stepResults[1].isTeardown, undefined);

  assert.equal(sanitized.stepResults[2].isSetup, undefined);
  assert.equal(sanitized.stepResults[2].isTeardown, true);
});

// 13. Optional dependencies, extractors, or teardown steps absent
test('13. Correct execution when optional dependencies, extractors, and teardown steps are absent', async () => {
  const mockAdapter = new MockHttpAdapter(() => ({
    success: true,
    status: 200,
    statusText: 'OK',
    responseTime: 10,
    headers: {},
    body: { status: 'minimal' },
  }));

  const engine = new WorkflowEngineService(mockAdapter);
  const scenario: WorkflowScenario = {
    id: 'wf_minimal',
    name: 'Minimal Workflow',
    steps: [
      {
        id: 's_single',
        name: 'Single Independent Step',
        enabled: true,
        request: { method: 'GET', url: 'https://api.test/minimal', auth: { type: 'none' } },
      },
    ],
  };

  const result = await engine.executeScenario(scenario);

  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.summary.totalSteps, 1);
  assert.equal(result.summary.executed, 1);
  assert.equal(result.summary.passed, 1);
  assert.equal(result.stepResults.length, 1);
  assert.equal(result.stepResults[0].status, 'PASSED_EXECUTION');
  assert.equal(result.stepResults[0].extractedVariables, undefined);
  assert.equal(result.stepResults[0].isTeardown, undefined);
  assert.equal(result.stepResults[0].isSetup, undefined);
});
