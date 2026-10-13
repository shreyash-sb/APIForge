import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import express from 'express';
import mockServerRoutes from '../src/routes/mockServer.routes.js';
import type { ApiSpecification } from '../src/types/openapi.types.js';

test('Mock Server HTTP Integration - Ephemeral Server E2E Flow', async (t) => {
  let server: http.Server;
  let baseUrl: string;

  // Spin up an Express app on an ephemeral port
  await new Promise<void>((resolve) => {
    const app = express();
    app.use(express.json());
    app.use('/api/mock', mockServerRoutes);

    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  t.after(() => {
    server.close();
  });

  await t.test('1. GET /api/mock/routes returns initialized seed routes over HTTP', async () => {
    const res = await fetch(`${baseUrl}/api/mock/routes`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as { routes: Array<{ path: string; method: string }>; total: number };
    assert.ok(data.total >= 3);
    assert.ok(data.routes.some((r) => r.path === '/api/v1/users'));
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
    const createRes = await fetch(`${baseUrl}/api/mock/routes`, {
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
      }),
    });
    assert.equal(createRes.status, 201);
    const createdRoute = (await createRes.json()) as { id: string; path: string };
    assert.ok(createdRoute.id.startsWith('mock_'));

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
    const logsRes = await fetch(`${baseUrl}/api/mock/logs`);
    assert.equal(logsRes.status, 200);
    const logData = (await logsRes.json()) as { logs: Array<{ path: string; method: string; responseStatus: number }> };
    const orderLog = logData.logs.find((l) => l.path === '/api/v1/ephemeral-orders');
    assert.ok(orderLog !== undefined);
    assert.equal(orderLog?.method, 'POST');
    assert.equal(orderLog?.responseStatus, 201);

    // Update route status code to 200
    const updateRes = await fetch(`${baseUrl}/api/mock/routes/${createdRoute.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statusCode: 200 }),
    });
    assert.equal(updateRes.status, 200);

    // Dispatch again and assert updated 200
    const dispatchUpdated = await fetch(`${baseUrl}/api/mock/serve/api/v1/ephemeral-orders`, { method: 'POST' });
    assert.equal(dispatchUpdated.status, 200);

    // Delete route
    const deleteRes = await fetch(`${baseUrl}/api/mock/routes/${createdRoute.id}`, { method: 'DELETE' });
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

    const genRes = await fetch(`${baseUrl}/api/mock/generate-from-spec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ specification: spec, options: { defaultDelayMs: 5 } }),
    });
    assert.equal(genRes.status, 200);
    const genData = (await genRes.json()) as { generatedCount: number };
    assert.equal(genData.generatedCount, 1);

    // Call the generated endpoint
    const chargeRes = await fetch(`${baseUrl}/api/mock/serve/payments/charge`, { method: 'POST' });
    assert.equal(chargeRes.status, 200);
    const chargeData = (await chargeRes.json()) as { chargeId: string; amount: number; success: boolean };
    assert.ok(typeof chargeData.chargeId === 'string');
    assert.equal(chargeData.amount, 100);
    assert.equal(chargeData.success, true);
  });

  await t.test('6. DELETE /api/mock/logs clears traffic inspector log store', async () => {
    const clearRes = await fetch(`${baseUrl}/api/mock/logs`, { method: 'DELETE' });
    assert.equal(clearRes.status, 200);

    const checkRes = await fetch(`${baseUrl}/api/mock/logs`);
    const checkData = (await checkRes.json()) as { total: number; logs: unknown[] };
    assert.equal(checkData.total, 0);
    assert.equal(checkData.logs.length, 0);
  });
});
