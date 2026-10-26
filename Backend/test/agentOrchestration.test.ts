import assert from 'node:assert/strict';
import test from 'node:test';
import { AgentToolRegistryService } from '../src/services/agentToolRegistry.service.js';
import { AgentOrchestratorService } from '../src/services/agentOrchestrator.service.js';
import { AGENT_TOOL_POLICIES, type AgentToolName } from '../src/types/agentTool.types.js';

const SAMPLE_SPEC_JSON = {
  openapi: '3.1.0',
  info: { title: 'User Service API', version: '1.0.0' },
  servers: [{ url: 'http://localhost:3001' }],
  paths: {
    '/users': {
      get: {
        summary: 'List users',
        responses: {
          '200': {
            description: 'Success',
            content: { 'application/json': { schema: { type: 'array', items: { type: 'object' } } } },
          },
        },
      },
      post: {
        summary: 'Create user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
            },
          },
        },
        responses: {
          '201': {
            description: 'Created',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
        },
      },
    },
  },
};

test('Agent Tool Registry: all 10 tools are defined with explicit policies', () => {
  const expectedTools: AgentToolName[] = [
    'inspect_api',
    'send_api_request',
    'generate_test_cases',
    'run_api_tests',
    'generate_mock_api',
    'generate_openapi_spec',
    'analyze_failure',
    'generate_code_patch',
    'verify_code_patch',
    'get_execution_report',
  ];

  for (const tool of expectedTools) {
    const policy = AGENT_TOOL_POLICIES[tool];
    assert.ok(policy, `Policy exists for tool ${tool}`);
    assert.ok(policy.risk, `Risk defined for ${tool}`);
    assert.equal(typeof policy.requiresApproval, 'boolean');
  }
});

test('Tool 1: inspect_api inspects OpenAPI specification contracts', async () => {
  const registry = new AgentToolRegistryService();
  const output = await registry.inspectApi({ spec: SAMPLE_SPEC_JSON });

  assert.equal(output.title, 'User Service API');
  assert.equal(output.version, '1.0.0');
  assert.equal(output.endpointsCount, 2);
  assert.ok(output.endpoints.some((ep) => ep.method === 'GET' && ep.path === '/users'));
});

test('Tool 2: send_api_request validates URL and executes safely', async () => {
  const registry = new AgentToolRegistryService();
  await assert.rejects(
    async () => registry.sendApiRequest({ method: 'GET', url: '' }),
    /requires a valid url/
  );
});

test('Tool 3: generate_test_cases generates test suites from OpenAPI spec', async () => {
  const registry = new AgentToolRegistryService();
  const output = await registry.generateTestCases({
    spec: SAMPLE_SPEC_JSON,
    categories: ['POSITIVE', 'NEGATIVE'],
  });

  assert.ok(output.totalTests > 0);
  assert.equal(output.specTitle, 'User Service API');
  assert.ok(output.tests.every((t) => t.request && t.expected));
});

test('Tool 5: generate_mock_api mounts mock endpoints', async () => {
  const registry = new AgentToolRegistryService();
  const output = await registry.generateMockApi({
    routes: [
      {
        method: 'GET',
        path: '/api/v1/test-mock',
        statusCode: 200,
        responseBody: { ok: true },
      },
    ],
  });

  assert.ok(output.mockServerId);
  assert.equal(output.routesCount, 1);
  assert.equal(output.routes[0].method, 'GET');
  assert.equal(output.routes[0].path, '/api/v1/test-mock');
});

test('Tool 6: generate_openapi_spec produces validated OAS 3.1 specification', async () => {
  const registry = new AgentToolRegistryService();
  const output = await registry.generateOpenapiSpec({
    description: 'A customer order tracking API',
    title: 'Orders API',
    version: '1.2.0',
    endpoints: [
      {
        method: 'GET',
        path: '/orders',
        summary: 'List customer orders',
      },
    ],
  });

  assert.equal(output.isValid, true);
  assert.equal(output.endpointsCount, 1);
  assert.ok(output.specJson);
  assert.equal((output.specJson as any).info.title, 'Orders API');
});

test('Tool 7: analyze_failure diagnoses execution failure accurately', async () => {
  const registry = new AgentToolRegistryService();
  const output = await registry.analyzeFailure({
    failureMessage: 'HTTP 404 Not Found on endpoint /api/users/999',
  });

  assert.ok(output.rootCause);
  assert.ok(output.explanation);
  assert.ok(output.suggestedFix);
});

test('Tool 8: generate_code_patch drafts targeted diff', async () => {
  const registry = new AgentToolRegistryService();
  const output = await registry.generateCodePatch({
    failureSummary: 'Missing Content-Type header on response',
    currentCode: 'app.get("/items", (req, res) => res.status(200).json({ ok: true }));',
  });

  assert.ok(output.patchId);
  assert.ok(output.diff);
  assert.ok(output.modifiedCode.includes('Content-Type') || output.modifiedCode.includes('res.status'));
});

test('Tool 9: verify_code_patch verifies code in sandbox', async () => {
  const registry = new AgentToolRegistryService();
  const output = await registry.verifyCodePatch({
    modifiedCode: 'function handler(req, res) { return { status: 200 }; }',
    tests: [{ name: 'Test 1', input: {}, expected: 200 }],
  });

  assert.equal(output.verified, true);
  assert.equal(output.allTestsPassed, true);
  assert.ok(output.output.includes('[Sandbox Verified]'));
});

test('Tool 10: get_execution_report compiles metrics and markdown', async () => {
  const registry = new AgentToolRegistryService();
  const output = await registry.getExecutionReport({
    taskId: 'test-task-1',
    executionResults: [
      {
        testCaseId: 'tc1',
        executionId: 'e1',
        status: 'PASSED_EXECUTION',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 45,
        request: { method: 'GET', url: 'http://localhost/test' },
      },
    ],
    validationResults: {
      tc1: {
        testCaseId: 'tc1',
        status: 'VALIDATION_PASSED',
        assertions: [],
        summary: { totalAssertions: 2, passedAssertions: 2, failedAssertions: 0 },
      },
    },
  });

  assert.equal(output.reportId, 'test-task-1');
  assert.equal(output.summary.totalTests, 1);
  assert.equal(output.summary.validationPassRate, 100);
  assert.equal(output.complianceStatus, 'COMPLIANT');
  assert.ok(output.markdownReport.includes('APIForge Engineering Execution Report'));
});

test('Agent Orchestrator: plans bounded multi-step task and pauses for required approval', async () => {
  const orchestrator = new AgentOrchestratorService();
  const task = await orchestrator.createPlan({
    goal: 'Run regression tests on my user API',
    context: { spec: SAMPLE_SPEC_JSON, baseUrl: 'http://localhost:3001' },
  });

  assert.ok(task.taskId);
  assert.equal(task.status, 'READY');
  assert.ok(task.steps.length >= 3);
  assert.equal(task.steps[0].tool, 'inspect_api');

  // Step 3 is run_api_tests, which has requiresApproval: true
  const runTestsStep = task.steps.find((s) => s.tool === 'run_api_tests');
  assert.ok(runTestsStep);
  assert.equal(runTestsStep.requiresApproval, true);

  // Execute task: it will run inspect_api and generate_test_cases, then pause at run_api_tests
  const updated = await orchestrator.executeTask(task.taskId);
  assert.equal(updated.status, 'WAITING_FOR_APPROVAL');
  assert.equal(runTestsStep.status, 'WAITING_FOR_APPROVAL');

  // Approving the step allows execution to proceed
  const approved = await orchestrator.approveStep(task.taskId, runTestsStep.stepId);
  assert.ok(['COMPLETED', 'FAILED', 'RUNNING'].includes(approved.status));
});

test('Agent Orchestrator: rejection safely aborts task', async () => {
  const orchestrator = new AgentOrchestratorService();
  const task = await orchestrator.createPlan({
    goal: 'Test my orders endpoint',
    context: { spec: SAMPLE_SPEC_JSON },
  });

  await orchestrator.executeTask(task.taskId);
  const runTestsStep = task.steps.find((s) => s.tool === 'run_api_tests');
  assert.ok(runTestsStep);

  const rejected = await orchestrator.rejectStep(task.taskId, runTestsStep.stepId, 'Forbidden in prod');
  assert.equal(rejected.status, 'FAILED');
  assert.equal(runTestsStep.status, 'REJECTED');
  assert.ok(rejected.error?.includes('rejected by user'));
});

test('Agent Orchestrator: task cancellation halts remaining steps', async () => {
  const orchestrator = new AgentOrchestratorService();
  const task = await orchestrator.createPlan({
    goal: 'Create mock API for Petstore',
  });

  const cancelled = await orchestrator.cancelTask(task.taskId);
  assert.equal(cancelled.status, 'CANCELLED');
  assert.ok(cancelled.steps.every((s) => s.status === 'CANCELLED'));
});
