import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { createServer } from 'node:http';
import test from 'node:test';
import authRoutes from '../src/routes/auth.routes.js';
import mockRoutes from '../src/routes/mockServer.routes.js';
import requestRoutes from '../src/routes/request.routes.js';
import testExecutionRoutes from '../src/routes/testExecution.routes.js';
import { requireAuth } from '../src/middleware/requireAuth.js';
import { RequestExecutorService } from '../src/services/requestExecutor.service.js';

const runHttpIntegration = process.env.APIFORGE_RUN_HTTP_INTEGRATION === '1';

test('actual API routes execute against a controlled loopback endpoint', { skip: !runHttpIntegration }, async () => {
  const controlled = createServer((req, res) => {
    res.writeHead(req.url === '/missing' ? 404 : 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ path: req.url, method: req.method, controlled: true }));
  });
  controlled.listen(0, '127.0.0.1');
  await once(controlled, 'listening');
  const controlledAddress = controlled.address();
  assert.ok(controlledAddress && typeof controlledAddress !== 'string');
  const controlledUrl = `http://127.0.0.1:${controlledAddress.port}`;

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/requests', requireAuth, requestRoutes);
  app.use('/api/tests', requireAuth, testExecutionRoutes);
  app.use('/api/mock', mockRoutes);
  const api = createServer(app);
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  const apiAddress = api.address();
  assert.ok(apiAddress && typeof apiAddress !== 'string');
  const baseUrl = `http://127.0.0.1:${apiAddress.port}`;

  try {
    const malformed = await fetch(`${baseUrl}/api/requests/execute`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(malformed.status, 401);

    const anonymousExecution = await fetch(`${baseUrl}/api/requests/execute`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method: 'GET', url: `${controlledUrl}/echo`, auth: { type: 'none' } }) });
    assert.equal(anonymousExecution.status, 401);

    const signup = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'HTTP QA', email: `http-qa-${Date.now()}@example.test`, password: 'TestPassword!2026', role: 'admin' }),
    });
    assert.equal(signup.status, 201);
    const signupResult = await signup.json() as { user: { role: string }; token: string };
    assert.equal(signupResult.user.role, 'engineer');

    const malformedAuthenticated = await fetch(`${baseUrl}/api/requests/execute`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${signupResult.token}` }, body: '{}' });
    assert.equal(malformedAuthenticated.status, 400);

    const execution = await fetch(`${baseUrl}/api/requests/execute`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${signupResult.token}` },
      body: JSON.stringify({ method: 'GET', url: `${controlledUrl}/echo`, auth: { type: 'none' } }),
    });
    assert.equal(execution.status, 200);
    const executionBody = await execution.json() as { success: boolean; status: number; body: unknown };
    assert.equal(executionBody.success, true, JSON.stringify(executionBody));
    assert.equal(executionBody.status, 200);
    assert.deepEqual(executionBody.body, { path: '/echo', method: 'GET', controlled: true });

    const testExecution = await fetch(`${baseUrl}/api/tests/execute-single`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${signupResult.token}` },
      body: JSON.stringify({ testCase: { id: 'http-smoke', enabled: true, request: { method: 'GET', url: `${controlledUrl}/case`, auth: { type: 'none' } } } }),
    });
    assert.equal(testExecution.status, 200);
    const testResult = await testExecution.json() as { status: string; response?: { body: unknown } };
    assert.equal(testResult.status, 'PASSED_EXECUTION');
    assert.deepEqual(testResult.response?.body, { path: '/case', method: 'GET', controlled: true });

    const activityWithoutAuth = await fetch(`${baseUrl}/api/auth/activity`);
    assert.equal(activityWithoutAuth.status, 401);
    const activity = await fetch(`${baseUrl}/api/auth/activity`, { headers: { authorization: `Bearer ${signupResult.token}` } });
    assert.equal(activity.status, 200);
    assert.equal((await activity.json() as { activities: unknown[] }).activities.length, 1);

    const createdMock = await fetch(`${baseUrl}/api/mock/routes`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${signupResult.token}` },
      body: JSON.stringify({ name: 'QA loopback mock', method: 'GET', path: '/qa-loopback', statusCode: 202, body: { mocked: true } }),
    });
    assert.equal(createdMock.status, 201);
    const servedMock = await fetch(`${baseUrl}/api/mock/serve/qa-loopback`);
    assert.equal(servedMock.status, 202);
    assert.deepEqual(await servedMock.json(), { mocked: true });

  } finally {
    await Promise.all([
      new Promise<void>((resolve, reject) => api.close((error) => error ? reject(error) : resolve())),
      new Promise<void>((resolve, reject) => controlled.close((error) => error ? reject(error) : resolve())),
    ]);
  }
});


test('safe outbound transport connects to the validated pinned address and preserves the target host', { skip: !runHttpIntegration }, async () => {
  let observedHost = '';
  const controlled = createServer((req, res) => {
    observedHost = req.headers.host || '';
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ host: observedHost, fixture: true }));
  });
  controlled.listen(0, '127.0.0.1');
  await once(controlled, 'listening');
  const address = controlled.address();
  assert.ok(address && typeof address !== 'string');
  try {
    const serviceInternals = new RequestExecutorService() as unknown as {
      fetchPinnedRequest(url: URL, init: RequestInit, resolved: { address: string; family: number }): Promise<Response>;
    };
    const target = new URL(`http://synthetic-public.fixture.test:${address.port}/pinned`);
    const response = await serviceInternals.fetchPinnedRequest(
      target,
      { method: 'GET', headers: {}, redirect: 'manual' },
      { address: '127.0.0.1', family: 4 },
    );
    assert.equal(response.status, 200);
    assert.match(observedHost, /^synthetic-public\.fixture\.test:/);
    assert.deepEqual(await response.json(), { host: observedHost, fixture: true });
  } finally {
    await new Promise<void>((resolve, reject) => controlled.close((error) => error ? reject(error) : resolve()));
  }
});
