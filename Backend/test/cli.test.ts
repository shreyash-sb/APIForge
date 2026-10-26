import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CliRunner } from '../src/cli/runner.js';
import type { WorkflowScenario } from '../src/types/workflow.types.js';
import type { TestCase, TestSuite } from '../src/types/testCase.types.js';

test('APIForge Phase 11 — Headless CLI Runner & Export Verification', async (t) => {
  let mockServer: http.Server;
  let serverPort: number;
  let serverUrl: string;
  const runner = new CliRunner();
  const receivedRequests: Array<{ method?: string; url?: string; headers: http.IncomingHttpHeaders; body: string }> = [];
  // Setup temporary directory for test fixtures and reports
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apiforge-cli-test-'));

  // Start ephemeral HTTP mock server
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

        // 1. Auth login
        if (req.url === '/api/v1/auth/login' && req.method === 'POST') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              token: 'secret_jwt_token_e2e_9999',
              userId: 'usr_cli_101',
            })
          );
          return;
        }

        // 2. User profile
        if (req.url === '/api/v1/users/usr_cli_101' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              id: 'usr_cli_101',
              name: 'CLI Test Developer',
              role: 'engineer',
            })
          );
          return;
        }

        // 3. Expected 404 endpoint
        if (req.url === '/api/v1/expected-missing' && req.method === 'GET') {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Item not found as expected' }));
          return;
        }

        // 4. Failing endpoint returning 500
        if (req.url === '/api/v1/failing-step' && req.method === 'POST') {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal failure' }));
          return;
        }

        // 5. Teardown logout
        if (req.url === '/api/v1/auth/logout' && req.method === 'POST') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Route not found' }));
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
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await t.test('1. CLI help and version options return exit code 0', async () => {
    const helpRes = await runner.run(['--help']);
    assert.equal(helpRes.exitCode, 0);
    assert.ok(helpRes.stdout.includes('APIForge Headless Test Runner'));
    assert.ok(helpRes.stdout.includes('run-workflow'));
    assert.ok(helpRes.stdout.includes('run-suite'));

    const shortHelpRes = await runner.run(['-h']);
    assert.equal(shortHelpRes.exitCode, 0);

    const versionRes = await runner.run(['--version']);
    assert.equal(versionRes.exitCode, 0);
    assert.ok(versionRes.stdout.includes('v1.0.0'));
  });

  await t.test('2. Invalid arguments and missing command return exit code 2', async () => {
    // Missing command
    const noCmd = await runner.run([]);
    assert.equal(noCmd.exitCode, 0); // Defaults to help

    // Unknown command
    const unknownCmd = await runner.run(['invalid-cmd']);
    assert.equal(unknownCmd.exitCode, 2);
    assert.ok(unknownCmd.stderr.includes('Unrecognized command'));

    // Missing target file
    const missingTarget = await runner.run(['run-workflow']);
    assert.equal(missingTarget.exitCode, 2);
    assert.ok(missingTarget.stderr.includes('requires a target JSON file path'));

    // Invalid reporter
    const invalidReporter = await runner.run(['run-workflow', 'foo.json', '--reporter', 'unsupported']);
    assert.equal(invalidReporter.exitCode, 2);
    assert.ok(invalidReporter.stderr.includes('Invalid reporter'));
  });

  await t.test('3. Missing files and malformed JSON return exit code 2', async () => {
    // File not found
    const missingFileRes = await runner.run(['run-workflow', path.join(tempDir, 'does-not-exist.json')]);
    assert.equal(missingFileRes.exitCode, 2);
    assert.ok(missingFileRes.stderr.includes('file not found'));

    // Malformed JSON syntax
    const malformedPath = path.join(tempDir, 'broken.json');
    fs.writeFileSync(malformedPath, '{ "broken": json', 'utf-8');
    const malformedRes = await runner.run(['run-workflow', malformedPath]);
    assert.equal(malformedRes.exitCode, 2);
    assert.ok(malformedRes.stderr.includes('Error reading or parsing'));

    // Missing steps array
    const invalidSchemaPath = path.join(tempDir, 'invalid-schema.json');
    fs.writeFileSync(invalidSchemaPath, JSON.stringify({ id: 'bad_wf' }), 'utf-8');
    const invalidSchemaRes = await runner.run(['run-workflow', invalidSchemaPath]);
    assert.equal(invalidSchemaRes.exitCode, 2);
    assert.ok(invalidSchemaRes.stderr.includes('Invalid workflow scenario format'));
  });

  await t.test('4. Valid workflow execution with variable extraction passes with exit code 0', async () => {
    receivedRequests.length = 0;
    const scenario: WorkflowScenario = {
      id: 'wf_cli_login_flow',
      name: 'CLI Login & Profile Flow',
      steps: [
        {
          id: 'step_1_login',
          name: 'Authenticate via Login',
          enabled: true,
          request: {
            method: 'POST',
            url: `${serverUrl}/api/v1/auth/login`,
            headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
            body: JSON.stringify({ user: 'tester' }),
            auth: { type: 'none' },
          },
          extractors: [
            { targetVariable: 'sessionToken', source: 'BODY_JSONPATH', path: '$.token', isSecret: true },
            { targetVariable: 'userId', source: 'BODY_JSONPATH', path: '$.userId', isSecret: false },
          ],
        },
        {
          id: 'step_2_profile',
          name: 'Fetch User Profile',
          enabled: true,
          dependsOn: ['step_1_login'],
          request: {
            method: 'GET',
            url: `${serverUrl}/api/v1/users/{{userId}}`,
            headers: [{ key: 'Authorization', value: 'Bearer {{sessionToken}}', enabled: true }],
            auth: { type: 'none' },
          },
          expected: { statusCodes: ['200'] },
        },
      ],
    };

    const scenarioFile = path.join(tempDir, 'valid-scenario.json');
    fs.writeFileSync(scenarioFile, JSON.stringify(scenario, null, 2), 'utf-8');

    const res = await runner.run(['run-workflow', scenarioFile]);
    assert.equal(res.exitCode, 0);
    assert.ok(res.stdout.includes('✔ PASS  Authenticate via Login'));
    assert.ok(res.stdout.includes('✔ PASS  Fetch User Profile'));
    assert.ok(res.stdout.includes('Total: 2 | Passed: 2 | Failed: 0'));

    // Check actual requests sent
    assert.equal(receivedRequests.length, 2);
    assert.equal(receivedRequests[1].headers.authorization, 'Bearer secret_jwt_token_e2e_9999');
  });

  await t.test('5. Test-suite execution using supported format passes with exit code 0', async () => {
    const testCases: TestCase[] = [
      {
        id: 'tc_1',
        name: 'Get User Profile Valid',
        description: 'Verify 200 response on valid profile fetch',
        type: 'POSITIVE',
        priority: 'HIGH',
        enabled: true,
        endpoint: { method: 'GET', path: '/api/v1/users/usr_cli_101' },
        request: {
          method: 'GET',
          url: `${serverUrl}/api/v1/users/usr_cli_101`,
          queryParams: [],
          headers: [],
          body: '',
          auth: { type: 'none' },
        },
        pathParams: {},
        expected: { statusCodes: ['200'] },
        metadata: { sourceEndpointId: 'ep_user', rule: 'status-200' },
      },
    ];

    const suite: TestSuite = {
      specificationTitle: 'User Management API',
      generatedAt: 'deterministic',
      tests: testCases,
      groups: [],
    };

    const suiteFile = path.join(tempDir, 'test-suite.json');
    fs.writeFileSync(suiteFile, JSON.stringify(suite, null, 2), 'utf-8');

    const res = await runner.run(['run-suite', suiteFile]);
    assert.equal(res.exitCode, 0);
    assert.ok(res.stdout.includes('✔ PASS  Get User Profile Valid'));
    assert.ok(res.stdout.includes('Overall Status: ✔ PASSED'));
  });

  await t.test('6. Expected HTTP 4xx status is treated as PASS according to expectations', async () => {
    const testCaseExpected404: TestCase = {
      id: 'tc_neg_404',
      name: 'Verify Missing Item Returns 404',
      description: 'Tests negative 404 handling',
      type: 'NEGATIVE',
      priority: 'MEDIUM',
      enabled: true,
      endpoint: { method: 'GET', path: '/api/v1/expected-missing' },
      request: {
        method: 'GET',
        url: `${serverUrl}/api/v1/expected-missing`,
        queryParams: [],
        headers: [],
        body: '',
        auth: { type: 'none' },
      },
      pathParams: {},
      expected: { statusCodes: ['404'] },
      metadata: { sourceEndpointId: 'ep_missing', rule: 'status-404' },
    };

    const negSuiteFile = path.join(tempDir, 'neg-suite.json');
    fs.writeFileSync(negSuiteFile, JSON.stringify([testCaseExpected404], null, 2), 'utf-8');

    const res = await runner.run(['run-suite', negSuiteFile]);
    assert.equal(res.exitCode, 0, 'Expected 404 must not be treated as failure when expectation matches');
    assert.ok(res.stdout.includes('✔ PASS  Verify Missing Item Returns 404'));
  });

  await t.test('7. Assertion failure returns exit code 1', async () => {
    const failingScenario: WorkflowScenario = {
      id: 'wf_failing_assert',
      name: 'Scenario Expecting 200 But Server Returns 500',
      steps: [
        {
          id: 'step_fail',
          name: 'Call Failing Endpoint',
          enabled: true,
          request: {
            method: 'POST',
            url: `${serverUrl}/api/v1/failing-step`,
            auth: { type: 'none' },
          },
          expected: { statusCodes: ['200'] }, // Server returns 500 -> validation failure
        },
      ],
    };

    const failingFile = path.join(tempDir, 'failing-scenario.json');
    fs.writeFileSync(failingFile, JSON.stringify(failingScenario, null, 2), 'utf-8');

    const res = await runner.run(['run-workflow', failingFile]);
    assert.equal(res.exitCode, 1);
    assert.ok(res.stdout.includes('✖ FAIL  Call Failing Endpoint'));
    assert.ok(res.stdout.includes('Failed: 1'));
  });

  await t.test('8. Teardown executes after workflow step failure', async () => {
    receivedRequests.length = 0;
    const scenarioWithTeardown: WorkflowScenario = {
      id: 'wf_fail_with_teardown',
      name: 'Workflow with Teardown on Failure',
      steps: [
        {
          id: 'step_main_fails',
          name: 'Main Step Returns 500',
          enabled: true,
          request: {
            method: 'POST',
            url: `${serverUrl}/api/v1/failing-step`,
            auth: { type: 'none' },
          },
          expected: { statusCodes: ['200'] },
        },
        {
          id: 'step_teardown_logout',
          name: 'Teardown Logout',
          isTeardown: true,
          enabled: true,
          request: {
            method: 'POST',
            url: `${serverUrl}/api/v1/auth/logout`,
            auth: { type: 'none' },
          },
        },
      ],
    };

    const file = path.join(tempDir, 'td-fail-scenario.json');
    fs.writeFileSync(file, JSON.stringify(scenarioWithTeardown, null, 2), 'utf-8');

    const res = await runner.run(['run-workflow', file]);
    assert.equal(res.exitCode, 1, 'Overall exit code must be 1 because main step failed');
    assert.ok(res.stdout.includes('✖ FAIL  Main Step Returns 500'));
    assert.ok(res.stdout.includes('✔ PASS  Teardown Logout [Teardown]'));

    // Verify teardown request actually hit the mock server
    const logoutReq = receivedRequests.find((r) => r.url === '/api/v1/auth/logout');
    assert.ok(logoutReq !== undefined, 'Teardown HTTP request must execute even after main step failure');
  });

  await t.test('9. JUnit XML report output with accurate counts and structure', async () => {
    const scenario: WorkflowScenario = {
      id: 'wf_junit_check',
      name: 'JUnit Generation Scenario',
      steps: [
        {
          id: 'step_1',
          name: 'Login Step',
          enabled: true,
          request: { method: 'POST', url: `${serverUrl}/api/v1/auth/login`, auth: { type: 'none' } },
        },
      ],
    };

    const scenarioFile = path.join(tempDir, 'junit-scenario.json');
    const reportFile = path.join(tempDir, 'reports', 'junit.xml');
    fs.writeFileSync(scenarioFile, JSON.stringify(scenario, null, 2), 'utf-8');

    const res = await runner.run([
      'run-workflow',
      scenarioFile,
      '--reporter',
      'junit',
      '--output',
      reportFile,
    ]);

    assert.equal(res.exitCode, 0);
    assert.ok(fs.existsSync(reportFile));

    const xmlContent = fs.readFileSync(reportFile, 'utf-8');
    assert.ok(xmlContent.includes('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(xmlContent.includes('<testsuites name="APIForge" tests="1" failures="0"'));
    assert.ok(xmlContent.includes('<testsuite name="JUnit Generation Scenario"'));
    assert.ok(xmlContent.includes('<testcase name="Login Step"'));
  });

  await t.test('10. HTML report output and entity escaping', async () => {
    const scenario: WorkflowScenario = {
      id: 'wf_html_check',
      name: 'HTML Report <Test & Special Characters>',
      steps: [
        {
          id: 'step_html_1',
          name: 'Safe Step <script>alert(1)</script>',
          enabled: true,
          request: { method: 'POST', url: `${serverUrl}/api/v1/auth/login`, auth: { type: 'none' } },
        },
      ],
    };

    const scenarioFile = path.join(tempDir, 'html-scenario.json');
    const reportFile = path.join(tempDir, 'reports', 'nested', 'summary.html');
    fs.writeFileSync(scenarioFile, JSON.stringify(scenario, null, 2), 'utf-8');

    const res = await runner.run([
      'run-workflow',
      scenarioFile,
      '--reporter',
      'html',
      '--output',
      reportFile,
    ]);

    assert.equal(res.exitCode, 0);
    assert.ok(fs.existsSync(reportFile));

    const htmlContent = fs.readFileSync(reportFile, 'utf-8');
    assert.ok(htmlContent.includes('<!DOCTYPE html>'));
    assert.ok(htmlContent.includes('&lt;Test &amp; Special Characters&gt;'));
    assert.ok(htmlContent.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!htmlContent.includes('<script>alert(1)</script>'), 'Dangerous tags must be escaped');
    assert.ok(htmlContent.includes('PASSED'));
  });

  await t.test('11. Secret redaction in console and report outputs', async () => {
    const secretScenario: WorkflowScenario = {
      id: 'wf_secrets',
      name: 'Secret Redaction Scenario',
      steps: [
        {
          id: 'step_secret',
          name: 'Auth with Super Secret Token',
          enabled: true,
          request: {
            method: 'POST',
            url: `${serverUrl}/api/v1/auth/login`,
            headers: [{ key: 'Authorization', value: 'Bearer super_confidential_token_xyz', enabled: true }],
            auth: { type: 'none' },
          },
          extractors: [
            { targetVariable: 'secretToken', source: 'BODY_JSONPATH', path: '$.token', isSecret: true },
          ],
        },
      ],
    };

    const scenarioFile = path.join(tempDir, 'secret-scenario.json');
    const junitReport = path.join(tempDir, 'secret-junit.xml');
    const htmlReport = path.join(tempDir, 'secret-summary.html');
    fs.writeFileSync(scenarioFile, JSON.stringify(secretScenario, null, 2), 'utf-8');

    // Run with JUnit
    const junitRes = await runner.run([
      'run-workflow',
      scenarioFile,
      '--reporter',
      'junit',
      '--output',
      junitReport,
    ]);
    assert.equal(junitRes.exitCode, 0);

    // Run with HTML
    const htmlRes = await runner.run([
      'run-workflow',
      scenarioFile,
      '--reporter',
      'html',
      '--output',
      htmlReport,
    ]);
    assert.equal(htmlRes.exitCode, 0);

    // Assert console output
    assert.ok(!junitRes.stdout.includes('super_confidential_token_xyz'));
    assert.ok(!htmlRes.stdout.includes('super_confidential_token_xyz'));

    // Assert files
    const xml = fs.readFileSync(junitReport, 'utf-8');
    assert.ok(!xml.includes('super_confidential_token_xyz'));

    const html = fs.readFileSync(htmlReport, 'utf-8');
    assert.ok(!html.includes('super_confidential_token_xyz'));
  });

  await t.test('12. Report output path handling creates directories recursively', async () => {
    const deepReport = path.join(tempDir, 'a', 'b', 'c', 'deep.xml');
    const scenarioFile = path.join(tempDir, 'valid-scenario.json');

    const res = await runner.run([
      'run-workflow',
      scenarioFile,
      '--reporter',
      'junit',
      '--output',
      deepReport,
    ]);

    assert.equal(res.exitCode, 0);
    assert.ok(fs.existsSync(deepReport));
  });

  await t.test('13. Suite with zero executed tests clearly reports NO TESTS EXECUTED', async () => {
    const allDisabledSuite: TestSuite = {
      specificationTitle: 'All Disabled Suite',
      generatedAt: 'deterministic',
      tests: [
        {
          id: 'tc_disabled',
          name: 'Disabled Test Case',
          description: 'Intentional disabled test',
          type: 'POSITIVE',
          priority: 'LOW',
          enabled: false,
          endpoint: { method: 'GET', path: '/health' },
          request: { method: 'GET', url: 'http://127.0.0.1:3001/health', auth: { type: 'none' } },
          pathParams: {},
          expected: { statusCodes: ['200'] },
          metadata: { sourceEndpointId: 'ep_1', rule: 'rule_1' },
        },
      ],
      groups: [],
    };

    const suiteFile = path.join(tempDir, 'all-disabled.json');
    fs.writeFileSync(suiteFile, JSON.stringify(allDisabledSuite, null, 2), 'utf-8');

    const res = await runner.run(['run-suite', suiteFile]);
    assert.equal(res.exitCode, 0, 'Exit code remains 0 for intentional skips');
    assert.ok(res.stdout.includes('NO TESTS EXECUTED'), 'Console output must clearly report NO TESTS EXECUTED instead of falsely claiming PASSED');
    assert.ok(res.stdout.includes('Total: 1 | Passed: 0 | Failed: 0 | Skipped: 1'));
  });
});

