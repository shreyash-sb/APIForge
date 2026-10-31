import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { WorkflowEngineService } from '../src/services/workflowEngine.service.js';
import { WorkflowSanitizerService } from '../src/services/workflowSanitizer.service.js';
import type { WorkflowScenario } from '../src/types/workflow.types.js';

// Automated E2E Smoke Test using an ephemeral local mock HTTP server
test('E2E Workflow Smoke Tests with Local Ephemeral Mock Server', async (t) => {
  let mockServer: http.Server;
  let serverPort: number;
  let serverUrl: string;
  const receivedRequests: Array<{ method?: string; url?: string; headers: http.IncomingHttpHeaders; body: string }> = [];

  // Start ephemeral server
  await new Promise<void>((resolve) => {
    mockServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        receivedRequests.push({
          method: req.method,
          url: req.url,
          headers: req.headers,
          body,
        });

        // Route: /api/v1/auth/login
        if (req.url === '/api/v1/auth/login' && req.method === 'POST') {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': 'session=secret_cookie_token_999; Path=/',
          });
          res.end(JSON.stringify({
            token: 'mock_jwt_session_token_xyz',
            userId: 'usr_8899',
            role: 'engineer',
          }));
          return;
        }

        // Route: /api/v1/users/usr_8899
        if (req.url === '/api/v1/users/usr_8899' && req.method === 'GET') {
          if (req.headers.authorization !== 'Bearer mock_jwt_session_token_xyz') {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            id: 'usr_8899',
            name: 'APIForge Test User',
            active: true,
          }));
          return;
        }

        // Route: /api/v1/orders
        if (req.url === '/api/v1/orders' && req.method === 'POST') {
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            orderId: 'ord_12345',
            status: 'CREATED',
            assignedTo: 'usr_8899',
          }));
          return;
        }

        // Route: /api/v1/fail-step
        if (req.url === '/api/v1/fail-step') {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error in business logic' }));
          return;
        }

        // Route: /api/v1/auth/logout (Teardown)
        if (req.url === '/api/v1/auth/logout' && req.method === 'POST') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            cleanedUpSession: true,
          }));
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      });
    });

    mockServer.listen(0, '127.0.0.1', () => {
      const addr = mockServer.address() as { port: number };
      serverPort = addr.port;
      serverUrl = `http://127.0.0.1:${serverPort}`;
      resolve();
    });
  });

  t.after(() => {
    mockServer.close();
  });

  await t.test('E2E-1: Three-step workflow with variable extraction, chaining, and teardown execution', async () => {
    receivedRequests.length = 0;
    const engine = new WorkflowEngineService();
    const sanitizer = new WorkflowSanitizerService();

    const scenario: WorkflowScenario = {
      id: 'wf_e2e_3step',
      name: 'E2E 3-Step Lifecycle Workflow',
      steps: [
        {
          id: 'step_auth',
          name: 'Authenticate User',
          enabled: true,
          request: {
            method: 'POST',
            url: `${serverUrl}/api/v1/auth/login`,
            headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
            body: JSON.stringify({ username: 'developer' }),
            auth: { type: 'none' },
          },
          extractors: [
            { targetVariable: 'sessionToken', source: 'BODY_JSONPATH', path: '$.token', isSecret: true },
            { targetVariable: 'userId', source: 'BODY_JSONPATH', path: '$.userId', isSecret: false },
          ],
        },
        {
          id: 'step_profile',
          name: 'Fetch Profile Details',
          enabled: true,
          dependsOn: ['step_auth'],
          request: {
            method: 'GET',
            url: `${serverUrl}/api/v1/users/{{userId}}`,
            headers: [{ key: 'Authorization', value: 'Bearer {{sessionToken}}', enabled: true }],
            auth: { type: 'none' },
          },
        },
        {
          id: 'step_order',
          name: 'Create Resource Order',
          enabled: true,
          dependsOn: ['step_profile'],
          request: {
            method: 'POST',
            url: `${serverUrl}/api/v1/orders`,
            headers: [
              { key: 'Authorization', value: 'Bearer {{sessionToken}}', enabled: true },
              { key: 'Content-Type', value: 'application/json', enabled: true },
            ],
            body: JSON.stringify({ requesterId: '{{userId}}' }),
            auth: { type: 'none' },
          },
        },
        {
          id: 'step_cleanup',
          name: 'Teardown Session Logout',
          isTeardown: true,
          enabled: true,
          request: {
            method: 'POST',
            url: `${serverUrl}/api/v1/auth/logout`,
            headers: [{ key: 'Authorization', value: 'Bearer {{sessionToken}}', enabled: true }],
            auth: { type: 'none' },
          },
        },
      ],
    };

    const rawResult = await engine.executeScenario(scenario);
    assert.equal(rawResult.status, 'COMPLETED');
    assert.equal(rawResult.summary.totalSteps, 4);
    assert.equal(rawResult.summary.executed, 4);
    assert.equal(rawResult.summary.passed, 4);
    assert.equal(rawResult.summary.failed, 0);

    // Verify all 4 HTTP requests reached the local server in sequence
    assert.equal(receivedRequests.length, 4);
    assert.equal(receivedRequests[0].url, '/api/v1/auth/login');
    assert.equal(receivedRequests[1].url, '/api/v1/users/usr_8899');
    assert.equal(receivedRequests[1].headers.authorization, 'Bearer mock_jwt_session_token_xyz');
    assert.equal(receivedRequests[2].url, '/api/v1/orders');
    assert.equal(JSON.parse(receivedRequests[2].body).requesterId, 'usr_8899');
    assert.equal(receivedRequests[3].url, '/api/v1/auth/logout');

    // Verify Sanitized Result DTO
    const sanitized = sanitizer.sanitizeExecutionResult(rawResult, scenario);
    assert.equal(sanitized.finalContext.sessionToken.value, '[REDACTED]');
    assert.equal(sanitized.finalContext.userId.value, 'usr_8899');

    // Verify teardown is flagged explicitly
    const teardownStep = sanitized.stepResults.find((s) => s.stepId === 'step_cleanup');
    assert.equal(teardownStep?.isTeardown, true);
    assert.equal(teardownStep?.status, 'PASSED_EXECUTION');

    // Verify serialized output has NO secret leakage
    const serialized = JSON.stringify(sanitized);
    assert.ok(!serialized.includes('mock_jwt_session_token_xyz'), 'Token must not leak in sanitized payload');
    assert.ok(!serialized.includes('secret_cookie_token_999'), 'Cookie secret must not leak in sanitized payload');
  });

  await t.test('E2E-2: Failed main step still executes teardown cleanup and reports separately', async () => {
    receivedRequests.length = 0;
    const engine = new WorkflowEngineService();
    const sanitizer = new WorkflowSanitizerService();

    const scenario: WorkflowScenario = {
      id: 'wf_e2e_fail_with_td',
      name: 'E2E Failure With Cleanup',
      steps: [
        {
          id: 'step_auth',
          name: 'Authenticate User',
          enabled: true,
          request: {
            method: 'POST',
            url: `${serverUrl}/api/v1/auth/login`,
            headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
            body: JSON.stringify({ username: 'developer' }),
            auth: { type: 'none' },
          },
          extractors: [
            { targetVariable: 'sessionToken', source: 'BODY_JSONPATH', path: '$.token', isSecret: true },
          ],
        },
        {
          id: 'step_failing',
          name: 'Main Step that Returns 500',
          enabled: true,
          dependsOn: ['step_auth'],
          request: {
            method: 'GET',
            url: `${serverUrl}/api/v1/fail-step`,
            auth: { type: 'none' },
          },
          expected: { statusCodes: ['200'] }, // 500 will fail validation
        },
        {
          id: 'step_blocked',
          name: 'Downstream Step Blocked by Failure',
          enabled: true,
          dependsOn: ['step_failing'],
          request: {
            method: 'GET',
            url: `${serverUrl}/api/v1/orders`,
            auth: { type: 'none' },
          },
        },
        {
          id: 'step_cleanup',
          name: 'Teardown Step Always Runs',
          isTeardown: true,
          enabled: true,
          request: {
            method: 'POST',
            url: `${serverUrl}/api/v1/auth/logout`,
            headers: [{ key: 'Authorization', value: 'Bearer {{sessionToken}}', enabled: true }],
            auth: { type: 'none' },
          },
        },
      ],
    };

    const rawResult = await engine.executeScenario(scenario);
    assert.equal(rawResult.status, 'PARTIALLY_COMPLETED');

    const sanitized = sanitizer.sanitizeExecutionResult(rawResult, scenario);
    const regularSteps = sanitized.stepResults.filter((s) => !s.isTeardown);
    const teardownSteps = sanitized.stepResults.filter((s) => s.isTeardown);

    assert.equal(regularSteps.length, 3);
    assert.equal(regularSteps[0].status, 'PASSED_EXECUTION');
    assert.equal(regularSteps[1].validationResult?.status, 'VALIDATION_FAILED');
    assert.equal(regularSteps[2].status, 'SKIPPED');
    assert.ok(regularSteps[2].skipReason?.includes('contract validation failure'));

    assert.equal(teardownSteps.length, 1);
    assert.equal(teardownSteps[0].stepId, 'step_cleanup');
    assert.equal(teardownSteps[0].status, 'PASSED_EXECUTION');
    assert.equal(teardownSteps[0].isTeardown, true);

    // Verify teardown request executed on the mock server
    const logoutReq = receivedRequests.find((r) => r.url === '/api/v1/auth/logout');
    assert.ok(logoutReq !== undefined, 'Teardown logout must be received by mock server');
    assert.equal(logoutReq?.headers.authorization, 'Bearer mock_jwt_session_token_xyz');
  });
});
