import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import express from 'express';
import { createMockServerRouter } from '../src/routes/mockServer.routes.js';
import authRoutes from '../src/routes/auth.routes.js';
import { MockServerService } from '../src/services/mockServer.service.js';
import type { ApiSpecification } from '../src/types/openapi.types.js';

test('Mock Server HTTP Integration - Ephemeral Server E2E Flow', async (t) => {
  let server: http.Server;
  let baseUrl: string;

  // Spin up an Express app on an ephemeral port
  await new Promise<void>((resolve) => {
    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use('/api/mock', createMockServerRouter(new MockServerService()));

    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  const signupResponse = await fetch(`${baseUrl}/api/auth/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Mock HTTP QA', email: `mock-http-${Date.now()}@example.test`, password: 'TestPassword!2026' }) });
  assert.equal(signupResponse.status, 201);
  const signupData = await signupResponse.json() as { token: string; user: { id: string } };
  const authToken = signupData.token;
  const secondSignup = await fetch(`${baseUrl}/api/auth/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Mock HTTP QA B', email: `mock-http-b-${Date.now()}@example.test`, password: 'TestPassword!2026' }) });
  assert.equal(secondSignup.status, 201);
  const secondToken = (await secondSignup.json() as { token: string }).token;
  const authedFetch = (input: string, init: RequestInit = {}, token = authToken) => fetch(input, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` } });

  t.after(() => {
    server.close();
  });

  await t.test('1. GET /api/mock/routes hides ownerless legacy seed routes from management', async () => {
    const res = await authedFetch(`${baseUrl}/api/mock/routes`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as { routes: Array<{ path: string; method: string }>; total: number };
    assert.equal(data.total, 0);
    assert.equal(data.routes.some((r) => r.path === '/api/v1/users'), false);
  });

  await t.test('2. Dynamic mock dispatch via GET /api/mock/serve/api/v1/users', async () => {
    const res = await fetch(`${baseUrl}/api/mock/serve/api/v1/users?page=1`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type')?.includes('application/json'), true);
    const data = (await res.json()) as Array<{ id: string; name: string }>;
    assert.ok(Array.isArray(data));
    assert.equal(data[0].id, 'usr_101');
  });

  await t.test('3. Dynamic mock dispatch with path parameters /api/mock/serve/api/v1/users/:id', async () => {
    const res = await fetch(`${baseUrl}/api/mock/serve/api/v1/users/usr_custom_88`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as { id: string; name: string };
    assert.equal(data.name, 'Alice Smith');
  });

  await t.test('4. POST /api/mock/routes creates custom endpoint, then dispatches and logs', async () => {
    // Create new route
    const createRes = await authedFetch(`${baseUrl}/api/mock/routes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Ephemeral Order Creation',
        method: 'POST',
        path: '/api/v1/ephemeral-orders',
        statusCode: 201,
        headers: { 'X-Order-Source': 'integration-test' },
        body: { orderId: 'ord_e2e_55', confirmed: true },
        delayMs: 10,
        enabled: true,
        ownerUserId: 'spoofed-owner',
      }),
    });
    assert.equal(createRes.status, 201);
    const createdRoute = (await createRes.json()) as { id: string; path: string; ownerUserId: string };
    assert.ok(createdRoute.id.startsWith('mock_'));
    assert.equal(createdRoute.ownerUserId, signupData.user.id, 'Owner must come from verified auth context, not request payload');

    const ownRoute = await authedFetch(`${baseUrl}/api/mock/routes/${createdRoute.id}`);
    assert.equal(ownRoute.status, 200);
    const ownList = await authedFetch(`${baseUrl}/api/mock/routes`);
    assert.equal(((await ownList.json()) as { routes: Array<{ id: string }> }).routes.some((route) => route.id === createdRoute.id), true);
    const otherList = await authedFetch(`${baseUrl}/api/mock/routes`, {}, secondToken);
    assert.equal(otherList.status, 200);
    assert.equal(((await otherList.json()) as { routes: Array<{ id: string }> }).routes.some((route) => route.id === createdRoute.id), false);
    const otherRead = await authedFetch(`${baseUrl}/api/mock/routes/${createdRoute.id}`, {}, secondToken);
    assert.equal(otherRead.status, 404);
    const otherUpdate = await authedFetch(`${baseUrl}/api/mock/routes/${createdRoute.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statusCode: 418 }) }, secondToken);
    assert.equal(otherUpdate.status, 404);
    const otherDelete = await authedFetch(`${baseUrl}/api/mock/routes/${createdRoute.id}`, { method: 'DELETE' }, secondToken);
    assert.equal(otherDelete.status, 404);

    // Dispatch POST to newly created mock route
    const dispatchRes = await fetch(`${baseUrl}/api/mock/serve/api/v1/ephemeral-orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-123' },
      body: JSON.stringify({ customer: 'DevCorp' }),
    });
    assert.equal(dispatchRes.status, 201);
    assert.equal(dispatchRes.headers.get('x-order-source'), 'integration-test');
    const orderData = (await dispatchRes.json()) as { orderId: string; confirmed: boolean };
    assert.equal(orderData.orderId, 'ord_e2e_55');

    // Verify traffic logs captured the request
    const logsRes = await authedFetch(`${baseUrl}/api/mock/logs`);
    assert.equal(logsRes.status, 200);
    const logData = (await logsRes.json()) as { logs: Array<{ path: string; method: string; responseStatus: number }> };
    const orderLog = logData.logs.find((l) => l.path === '/api/v1/ephemeral-orders');
    assert.ok(orderLog !== undefined);
    assert.equal(orderLog?.method, 'POST');
    assert.equal(orderLog?.responseStatus, 201);
    const otherLogs = await authedFetch(`${baseUrl}/api/mock/logs`, {}, secondToken);
    assert.equal(((await otherLogs.json()) as { total: number }).total, 0);
    await authedFetch(`${baseUrl}/api/mock/logs`, { method: 'DELETE' }, secondToken);
    const logsAfterOtherClear = await authedFetch(`${baseUrl}/api/mock/logs`);
    assert.ok(((await logsAfterOtherClear.json()) as { logs: Array<{ path: string }> }).logs.some((log) => log.path === '/api/v1/ephemeral-orders'));

    // Update route status code to 200
    const updateRes = await authedFetch(`${baseUrl}/api/mock/routes/${createdRoute.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statusCode: 200 }),
    });
    assert.equal(updateRes.status, 200);

    // Dispatch again and assert updated 200
    const dispatchUpdated = await fetch(`${baseUrl}/api/mock/serve/api/v1/ephemeral-orders`, { method: 'POST' });
    assert.equal(dispatchUpdated.status, 200);

    // Delete route
    const deleteRes = await authedFetch(`${baseUrl}/api/mock/routes/${createdRoute.id}`, { method: 'DELETE' });
    assert.equal(deleteRes.status, 200);

    // Dispatch again, now should be 404
    const dispatchDeleted = await fetch(`${baseUrl}/api/mock/serve/api/v1/ephemeral-orders`, { method: 'POST' });
    assert.equal(dispatchDeleted.status, 404);
  });

  await t.test('5. POST /api/mock/generate-from-spec converts OpenAPI spec into live mock endpoints', async () => {
    const spec: ApiSpecification = {
      version: 'openapi-3.0.0',
      metadata: { title: 'Payments API', version: '2.0.0' },
      servers: [],
      securitySchemes: {},
      endpoints: [
        {
          id: 'ep_pay',
          method: 'POST',
          path: '/payments/charge',
          tags: ['Billing'],
          summary: 'Charge card',
          parameters: [],
          responses: [
            {
              statusCode: '200',
              description: 'Charge succeeded',
              content: [
                {
                  contentType: 'application/json',
                  schema: {
                    type: 'object',
                    properties: {
                      chargeId: { type: 'string', format: 'uuid' },
                      amount: { type: 'number' },
                      success: { type: 'boolean' },
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const genRes = await authedFetch(`${baseUrl}/api/mock/generate-from-spec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ specification: spec, options: { defaultDelayMs: 5 } }),
    });
    assert.equal(genRes.status, 200);
    const genData = (await genRes.json()) as { generatedCount: number; routes: Array<{ path: string }> };
    assert.equal(genData.generatedCount, 1);
    assert.deepEqual(genData.routes.map((route) => route.path), ['/payments/charge']);

    const userBRoutesBefore = await authedFetch(`${baseUrl}/api/mock/routes`, {}, secondToken);
    assert.equal(((await userBRoutesBefore.json()) as { routes: Array<{ path: string }> }).routes.some((route) => route.path === '/payments/charge'), false);
    const userBSpec = { ...spec, endpoints: [{ ...spec.endpoints[0], id: 'ep_b_charge', path: '/b/private-charge' }] };
    const userBGeneration = await authedFetch(`${baseUrl}/api/mock/generate-from-spec`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ specification: userBSpec, options: { overwriteExisting: true } }),
    }, secondToken);
    assert.equal(userBGeneration.status, 200);
    const userBGenerated = await userBGeneration.json() as { routes: Array<{ path: string }> };
    assert.deepEqual(userBGenerated.routes.map((route) => route.path), ['/b/private-charge']);
    const userARoutesAfterBOverwrite = await authedFetch(`${baseUrl}/api/mock/routes`);
    assert.equal(((await userARoutesAfterBOverwrite.json()) as { routes: Array<{ path: string }> }).routes.some((route) => route.path === '/payments/charge'), true);
    assert.equal(((await authedFetch(`${baseUrl}/api/mock/routes`, {}, secondToken).then((response) => response.json())) as { routes: Array<{ path: string }> }).routes.some((route) => route.path === '/payments/charge'), false);

    // Call the generated endpoint
    const chargeRes = await fetch(`${baseUrl}/api/mock/serve/payments/charge`, { method: 'POST' });
    assert.equal(chargeRes.status, 200);
    const chargeData = (await chargeRes.json()) as { chargeId: string; amount: number; success: boolean };
    assert.ok(typeof chargeData.chargeId === 'string');
    assert.equal(chargeData.amount, 100);
    assert.equal(chargeData.success, true);
  });

  await t.test('6. DELETE /api/mock/logs clears traffic inspector log store', async () => {
    const clearRes = await authedFetch(`${baseUrl}/api/mock/logs`, { method: 'DELETE' });
    assert.equal(clearRes.status, 200);

    const checkRes = await authedFetch(`${baseUrl}/api/mock/logs`);
    const checkData = (await checkRes.json()) as { total: number; logs: unknown[] };
    assert.equal(checkData.total, 0);
    assert.equal(checkData.logs.length, 0);
  });

  await t.test('7. unauthenticated management requests are rejected while public dispatch remains available', async () => {
    const management = await fetch(`${baseUrl}/api/mock/routes`);
    assert.equal(management.status, 401);
    const route = await fetch(`${baseUrl}/api/mock/serve/api/v1/users`);
    assert.equal(route.status, 200);
    for (const [method, url, init] of [
      ['GET', `${baseUrl}/api/mock/routes/mock_route_users`, {}],
      ['PUT', `${baseUrl}/api/mock/routes/mock_route_users`, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statusCode: 418 }) }],
      ['DELETE', `${baseUrl}/api/mock/routes/mock_route_users`, {}],
    ] as const) {
      const legacy = await authedFetch(url, { method, ...init });
      assert.equal(legacy.status, 404, `ownerless legacy route ${method} must not be manageable`);
    }
  });

  await t.test('8. second user can create, update, and delete their own route', async () => {
    const create = await authedFetch(`${baseUrl}/api/mock/routes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'B own route', method: 'GET', path: '/b-own', body: { owner: 'B' } }) }, secondToken);
    assert.equal(create.status, 201);
    const route = await create.json() as { id: string };
    const ownList = await authedFetch(`${baseUrl}/api/mock/routes`, {}, secondToken);
    assert.equal(((await ownList.json()) as { routes: Array<{ id: string }> }).routes.some((entry) => entry.id === route.id), true);
    assert.equal((await authedFetch(`${baseUrl}/api/mock/routes/${route.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statusCode: 202 }) }, secondToken)).status, 200);
    assert.equal((await authedFetch(`${baseUrl}/api/mock/routes/${route.id}`, { method: 'DELETE' }, secondToken)).status, 200);
  });
});
