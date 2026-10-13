import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

function runCliAsync(cliBin: string, args: string[]): Promise<{ status: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const cp = spawn('node', [cliBin, ...args]);
    let stdout = '';
    let stderr = '';
    cp.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    cp.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    cp.on('close', (status) => {
      resolve({ status: status ?? 0, stdout, stderr });
    });
  });
}

async function runSmokeVerification() {
  console.log('--- Starting APIForge Phase 11 Real Execution Smoke Verification ---');

  const receivedRequests: Array<{ method?: string; url?: string; headers: http.IncomingHttpHeaders; body: string }> = [];
  let serverPort = 0;
  let serverUrl = '';

  const mockServer = http.createServer((req, res) => {
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

      // 1. Health endpoint
      if (req.url === '/api/v1/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', service: 'smoke-test' }));
        return;
      }

      // 2. Auth login
      if (req.url === '/api/v1/auth/login' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ token: 'smoke_jwt_secret_token_888', userId: 'usr_smoke_1' }));
        return;
      }

      // 3. User profile
      if (req.url === '/api/v1/users/usr_smoke_1' && req.method === 'GET') {
        if (req.headers.authorization !== 'Bearer smoke_jwt_secret_token_888') {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'usr_smoke_1', name: 'Verified User', role: 'admin' }));
        return;
      }

      // 4. Failing endpoint
      if (req.url === '/api/v1/fail' && req.method === 'GET') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal failure encountered' }));
        return;
      }

      // 5. Teardown logout
      if (req.url === '/api/v1/auth/logout' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ loggedOut: true }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });
  });

  await new Promise<void>((resolve) => {
    mockServer.listen(0, '127.0.0.1', () => {
      const addr = mockServer.address() as { port: number };
      serverPort = addr.port;
      serverUrl = `http://127.0.0.1:${serverPort}`;
      console.log(`Ephemeral local HTTP mock server listening on: ${serverUrl}`);
      resolve();
    });
  });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apiforge-smoke-'));
  const cliBin = path.resolve(process.cwd(), 'dist/cli/index.js');

  try {
    // -------------------------------------------------------------
    // Task 1: Genuine Successful Enabled Test Suite
    // -------------------------------------------------------------
    console.log('\n[Task 1] Running genuine enabled test suite...');
    receivedRequests.length = 0;

    const suiteSuccess = {
      specificationTitle: 'Genuine Smoke Test Suite',
      tests: [
        {
          id: 'tc_smoke_real_1',
          name: 'Health Endpoint Check Real HTTP',
          description: 'Verifies real HTTP 200 response from live ephemeral server',
          type: 'POSITIVE',
          priority: 'HIGH',
          enabled: true,
          endpoint: { method: 'GET', path: '/api/v1/health' },
          request: {
            method: 'GET',
            url: `${serverUrl}/api/v1/health`,
            queryParams: [],
            headers: [],
            body: '',
            auth: { type: 'none' },
          },
          pathParams: {},
          expected: { statusCodes: ['200'] },
          metadata: { sourceEndpointId: 'ep_health', rule: 'status-200' },
        },
      ],
    };

    const suiteSuccessPath = path.join(tempDir, 'suite-success.json');
    fs.writeFileSync(suiteSuccessPath, JSON.stringify(suiteSuccess, null, 2), 'utf-8');

    const run1 = await runCliAsync(cliBin, ['run-suite', suiteSuccessPath]);
    console.log(`> Exit code: ${run1.status}`);
    console.log(run1.stdout);
    assert.equal(run1.status, 0, 'Genuine enabled suite must exit with code 0');
    assert.ok(run1.stdout.includes('✔ PASS  Health Endpoint Check Real HTTP'));
    assert.ok(run1.stdout.includes('Total: 1 | Passed: 1 | Failed: 0'));
    assert.equal(receivedRequests.length, 1, 'Mock server must receive exactly 1 real HTTP request');
    assert.equal(receivedRequests[0].url, '/api/v1/health');
    console.log('✔ Task 1 PASSED: Real HTTP request executed and test counted as passed.');

    // -------------------------------------------------------------
    // Task 2: Failure Semantics (Assertion failure, Missing file, Malformed JSON)
    // -------------------------------------------------------------
    console.log('\n[Task 2] Running intentional failure assertion suite...');
    receivedRequests.length = 0;

    const suiteFail = {
      specificationTitle: 'Intentional Failing Test Suite',
      tests: [
        {
          id: 'tc_smoke_fail_1',
          name: 'Expect 200 But Server Returns 500',
          type: 'POSITIVE',
          priority: 'CRITICAL',
          enabled: true,
          endpoint: { method: 'GET', path: '/api/v1/fail' },
          request: {
            method: 'GET',
            url: `${serverUrl}/api/v1/fail`,
            queryParams: [],
            headers: [],
            body: '',
            auth: { type: 'none' },
          },
          pathParams: {},
          expected: { statusCodes: ['200'] }, // Server returns 500
          metadata: { sourceEndpointId: 'ep_fail', rule: 'status-200' },
        },
      ],
    };

    const suiteFailPath = path.join(tempDir, 'suite-fail.json');
    const junitFailReport = path.join(tempDir, 'fail-junit.xml');
    const htmlFailReport = path.join(tempDir, 'fail-report.html');
    fs.writeFileSync(suiteFailPath, JSON.stringify(suiteFail, null, 2), 'utf-8');

    const run2 = await runCliAsync(cliBin, [
      'run-suite',
      suiteFailPath,
      '--reporter',
      'junit',
      '--output',
      junitFailReport,
    ]);
    console.log(`> Exit code: ${run2.status}`);
    console.log(run2.stdout);
    assert.equal(run2.status, 1, 'Failing assertion must exit with code 1');
    assert.ok(run2.stdout.includes('✖ FAIL  Expect 200 But Server Returns 500'));
    assert.ok(fs.existsSync(junitFailReport));
    const junitContent = fs.readFileSync(junitFailReport, 'utf-8');
    assert.ok(junitContent.includes('<failure message='));
    assert.ok(junitContent.includes('failures="1"'));

    // HTML report check
    const run2Html = await runCliAsync(cliBin, [
      'run-suite',
      suiteFailPath,
      '--reporter',
      'html',
      '--output',
      htmlFailReport,
    ]);
    assert.equal(run2Html.status, 1);
    assert.ok(fs.existsSync(htmlFailReport));
    const htmlContent = fs.readFileSync(htmlFailReport, 'utf-8');
    assert.ok(htmlContent.includes('FAILED'));

    // Missing file check -> exit 2
    const runMissing = await runCliAsync(cliBin, ['run-suite', 'nonexistent.json']);
    console.log(`> Missing file exit code: ${runMissing.status}`);
    assert.equal(runMissing.status, 2, 'Missing file must exit with code 2');

    // Malformed JSON check -> exit 2
    const malformedFile = path.join(tempDir, 'malformed.json');
    fs.writeFileSync(malformedFile, '{ bad json', 'utf-8');
    const runMalformed = await runCliAsync(cliBin, ['run-suite', malformedFile]);
    console.log(`> Malformed JSON exit code: ${runMalformed.status}`);
    assert.equal(runMalformed.status, 2, 'Malformed JSON must exit with code 2');
    console.log('✔ Task 2 PASSED: Verified exit code 1 for assertions and exit code 2 for config errors.');

    // -------------------------------------------------------------
    // Task 3: Workflow Execution & Teardown on Failure
    // -------------------------------------------------------------
    console.log('\n[Task 3.1] Running multi-step workflow with variable extraction...');
    receivedRequests.length = 0;

    const workflowSuccess = {
      id: 'wf_smoke_success',
      name: 'Smoke Workflow Success Flow',
      steps: [
        {
          id: 'step_auth',
          name: 'Authenticate User',
          enabled: true,
          request: {
            method: 'POST',
            url: `${serverUrl}/api/v1/auth/login`,
            headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
            body: JSON.stringify({ user: 'smoke-dev' }),
            auth: { type: 'none' },
          },
          extractors: [
            { targetVariable: 'sessionToken', source: 'BODY_JSONPATH', path: '$.token', isSecret: true },
            { targetVariable: 'userId', source: 'BODY_JSONPATH', path: '$.userId', isSecret: false },
          ],
        },
        {
          id: 'step_profile',
          name: 'Fetch Profile with Token',
          enabled: true,
          dependsOn: ['step_auth'],
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

    const wfSuccessPath = path.join(tempDir, 'wf-success.json');
    fs.writeFileSync(wfSuccessPath, JSON.stringify(workflowSuccess, null, 2), 'utf-8');

    const run3a = await runCliAsync(cliBin, ['run-workflow', wfSuccessPath]);
    console.log(`> Workflow exit code: ${run3a.status}`);
    console.log(run3a.stdout);
    assert.equal(run3a.status, 0, 'Successful workflow must exit with code 0');
    assert.ok(run3a.stdout.includes('✔ PASS  Authenticate User'));
    assert.ok(run3a.stdout.includes('✔ PASS  Fetch Profile with Token'));
    assert.equal(receivedRequests.length, 2);
    assert.equal(receivedRequests[1].headers.authorization, 'Bearer smoke_jwt_secret_token_888');
    assert.ok(!run3a.stdout.includes('smoke_jwt_secret_token_888'), 'Secret token must be redacted');

    console.log('\n[Task 3.2] Running workflow with failing step and mandatory teardown cleanup...');
    receivedRequests.length = 0;

    const workflowTeardown = {
      id: 'wf_smoke_teardown',
      name: 'Workflow with Failure and Teardown',
      steps: [
        {
          id: 'step_fail',
          name: 'Main Failing Step',
          enabled: true,
          request: {
            method: 'GET',
            url: `${serverUrl}/api/v1/fail`,
            auth: { type: 'none' },
          },
          expected: { statusCodes: ['200'] }, // Server returns 500
        },
        {
          id: 'step_teardown',
          name: 'Teardown Session Logout',
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

    const wfTeardownPath = path.join(tempDir, 'wf-teardown.json');
    fs.writeFileSync(wfTeardownPath, JSON.stringify(workflowTeardown, null, 2), 'utf-8');

    const run3b = await runCliAsync(cliBin, ['run-workflow', wfTeardownPath]);
    console.log(`> Teardown Workflow exit code: ${run3b.status}`);
    console.log(run3b.stdout);
    assert.equal(run3b.status, 1, 'Failed workflow with teardown must exit with code 1');
    assert.ok(run3b.stdout.includes('✖ FAIL  Main Failing Step'));
    assert.ok(run3b.stdout.includes('✔ PASS  Teardown Session Logout [Teardown]'));
    const logoutReq = receivedRequests.find((r) => r.url === '/api/v1/auth/logout');
    assert.ok(logoutReq !== undefined, 'Teardown HTTP request was received by mock server');
    console.log('✔ Task 3 PASSED: Workflow execution, variable chaining, and teardown cleanup verified.');

    // -------------------------------------------------------------
    // Task 4: Zero Executed Tests Hardened Verification
    // -------------------------------------------------------------
    console.log('\n[Task 4] Running suite with 0 executed tests (all disabled)...');
    const suiteZeroExecuted = {
      specificationTitle: 'All Disabled Suite',
      tests: [
        {
          id: 'tc_disabled',
          name: 'Disabled Test',
          type: 'POSITIVE',
          priority: 'LOW',
          enabled: false,
          endpoint: { method: 'GET', path: '/health' },
          request: { method: 'GET', url: `${serverUrl}/health`, auth: { type: 'none' } },
          pathParams: {},
          expected: { statusCodes: ['200'] },
          metadata: { sourceEndpointId: 'ep_1', rule: 'rule_1' },
        },
      ],
    };
    const zeroExecutedPath = path.join(tempDir, 'zero-executed.json');
    fs.writeFileSync(zeroExecutedPath, JSON.stringify(suiteZeroExecuted, null, 2), 'utf-8');

    const run4 = await runCliAsync(cliBin, ['run-suite', zeroExecutedPath]);
    console.log(`> Zero executed exit code: ${run4.status}`);
    console.log(run4.stdout);
    assert.equal(run4.status, 0);
    assert.ok(run4.stdout.includes('NO TESTS EXECUTED'), 'Must clearly declare NO TESTS EXECUTED');
    console.log('✔ Task 4 PASSED: Hardened zero-executed tests report verified.');

    console.log('\n=============================================================');
    console.log('ALL PHASE 11 REAL EXECUTION SMOKE TESTS PASSED SUCCESSFULLY!');
    console.log('=============================================================');
  } finally {
    mockServer.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

runSmokeVerification().catch((err) => {
  console.error('Smoke Verification Failed:', err);
  process.exit(1);
});
