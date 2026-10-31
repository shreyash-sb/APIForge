import assert from 'node:assert/strict';
import test from 'node:test';
import { MockServerService } from '../src/services/mockServer.service.js';
import { MockServerController } from '../src/controllers/mockServer.controller.js';
import type { ApiSpecification } from '../src/types/openapi.types.js';

// Helper to mock Express Request and Response
function createMockHttp(options: {
  method?: string;
  url?: string;
  originalUrl?: string;
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  body?: unknown;
}) {
  let statusCode = 200;
  let responseData: unknown = null;
  const responseHeaders: Record<string, string> = {};

  const req = {
    method: options.method || 'GET',
    url: options.url || '/',
    originalUrl: options.originalUrl || options.url || '/',
    params: options.params || {},
    query: options.query || {},
    headers: options.headers || {},
    body: options.body,
  } as unknown as Parameters<MockServerController['serveMock']>[0];

  const res = {
    locals: { authUser: { id: 'test-user' } },
    status(code: number) {
      statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      responseHeaders[name] = value;
      return this;
    },
    json(data: unknown) {
      responseData = data;
      return this;
    },
    send(data: unknown) {
      responseData = data;
      return this;
    },
  } as unknown as Parameters<MockServerController['serveMock']>[1];

  return {
    req,
    res,
    getStatus: () => statusCode,
    getData: () => responseData,
    getHeaders: () => responseHeaders,
  };
}

test('MockServerService - Core Routing and Management', async (t) => {
  await t.test('1. Default seed routes are loaded correctly', () => {
    const service = new MockServerService();
    const routes = service.getRoutes('test-user');
    assert.equal(routes.length, 0, 'Legacy routes without an owner are not exposed through private management');
    const userRoute = service.matchRoute('GET', '/api/v1/users');
    assert.ok(userRoute !== undefined);
    assert.equal(userRoute?.method, 'GET');
    assert.equal(userRoute?.path, '/api/v1/users');
    assert.equal(userRoute?.statusCode, 200);
  });

  await t.test('2. CRUD operations: create, update, delete mock route', () => {
    const service = new MockServerService();
    const created = service.createRoute({
      ownerUserId: 'test-user',
      name: 'Test Create Order',
      method: 'POST',
      path: '/api/v1/orders',
      statusCode: 201,
      body: { orderId: 'ord_99', created: true },
      enabled: true,
      delayMs: 10,
    });

    assert.ok(created.id.startsWith('mock_'));
    assert.equal(created.statusCode, 201);
    assert.equal(created.path, '/api/v1/orders');

    // Update
    const updated = service.updateRoute(created.id, {
      statusCode: 200,
      name: 'Updated Order Name',
    }, 'test-user');
    assert.equal(updated?.statusCode, 200);
    assert.equal(updated?.name, 'Updated Order Name');

    // Delete
    const deleted = service.deleteRoute(created.id, 'test-user');
    assert.equal(deleted, true);
    assert.equal(service.getRouteById(created.id, 'test-user'), undefined);
  });

  await t.test('3. Exact and parameterized route matching (:id and {id})', () => {
    const service = new MockServerService();
    // Exact match
    const exactMatch = service.matchRoute('GET', '/api/v1/users');
    assert.ok(exactMatch !== undefined);
    assert.equal(exactMatch?.id, 'mock_route_users');

    // Parameterized match with colon: /api/v1/users/:id
    const paramMatch = service.matchRoute('GET', '/api/v1/users/usr_5566');
    assert.ok(paramMatch !== undefined);
    assert.equal(paramMatch?.id, 'mock_route_user_detail');

    // Curly brace pattern matching
    service.createRoute({
      name: 'Item Detail',
      method: 'GET',
      path: '/items/{itemId}/reviews',
      statusCode: 200,
      body: [{ stars: 5 }],
      enabled: true,
    });
    const curlyMatch = service.matchRoute('GET', '/items/item_42/reviews');
    assert.ok(curlyMatch !== undefined);
    assert.equal(curlyMatch?.name, 'Item Detail');
  });

  await t.test('4. Disabled routes are excluded from matching', () => {
    const service = new MockServerService();
    const route = service.createRoute({ ownerUserId: 'test-user', name: 'Disabled owned route', method: 'GET', path: '/owned-disabled', statusCode: 200, body: {}, enabled: true });
    assert.ok(service.updateRoute(route.id, { enabled: false }, 'test-user'));

    const match = service.matchRoute('GET', '/owned-disabled');
    assert.equal(match, undefined, 'Disabled route must not match incoming traffic');
  });

  await t.test('5. Unmatched route returns 404 with diagnostic details', async () => {
    const service = new MockServerService();
    const result = await service.handleRequest('GET', '/non/existent/path', {}, {});

    assert.equal(result.statusCode, 404);
    assert.equal((result.body as Record<string, unknown>).error, 'Mock route not found');
    assert.equal(result.matchedRoute, undefined);
  });

  await t.test('6. Simulated delay is applied properly', async () => {
    const service = new MockServerService();
    service.createRoute({
      name: 'Delayed Endpoint',
      method: 'GET',
      path: '/delayed',
      statusCode: 200,
      body: { done: true },
      delayMs: 50,
      enabled: true,
    });

    const start = Date.now();
    const res = await service.handleRequest('GET', '/delayed', {}, {});
    const elapsed = Date.now() - start;

    assert.equal(res.statusCode, 200);
    assert.ok(elapsed >= 40, `Elapsed time ${elapsed}ms should reflect ~50ms simulated latency`);
  });

  await t.test('7. Traffic logging records requests and can be cleared', async () => {
    const service = new MockServerService();
    service.createRoute({ ownerUserId: 'test-user', name: 'Private Log Route', method: 'POST', path: '/private-log', statusCode: 200, body: {}, enabled: true });
    service.clearLogs('test-user');
    assert.equal(service.getLogs('test-user').length, 0);

    await service.handleRequest(
      'POST',
      '/private-log',
      { ref: 'test' },
      { authorization: 'Bearer token' },
      { username: 'testuser' }
    );

    const logs = service.getLogs('test-user');
    assert.equal(logs.length, 1);
    assert.equal(logs[0].method, 'POST');
    assert.equal(logs[0].path, '/private-log');
    assert.equal(logs[0].responseStatus, 200);
    assert.equal(logs[0].queryParams.ref, 'test');

    assert.equal(logs[0].headers.authorization, '[REDACTED]');

    service.clearLogs('test-user');
    assert.equal(service.getLogs('test-user').length, 0);
  });

  await t.test('7a. Traffic logs redact nested secrets and bound oversized values', async () => {
    const service = new MockServerService();
    service.createRoute({ ownerUserId: 'test-user', name: 'Private Log Route', method: 'POST', path: '/private-log', statusCode: 200, body: {}, enabled: true });
    await service.handleRequest(
      'POST',
      '/private-log',
      { apiKey: 'not-for-log' },
      { 'x-api-key': 'not-for-log' },
      { password: 'not-for-log', profile: { token: 'not-for-log' }, note: 'x'.repeat(5000) }
    );
    const log = service.getLogs('test-user')[0];
    assert.equal(log.queryParams.apiKey, '[REDACTED]');
    assert.equal(log.headers['x-api-key'], '[REDACTED]');
    assert.deepEqual(log.body, {
      password: '[REDACTED]',
      profile: { token: '[REDACTED]' },
      note: `${'x'.repeat(4096)}… [Truncated]`,
    });
  });

  await t.test('8. Auto-generating mock routes from OpenAPI Specification', () => {
    const service = new MockServerService();
    const spec: ApiSpecification = {
      version: 'openapi-3.0.0',
      metadata: { title: 'Store API', version: '1.0.0' },
      servers: [{ url: 'https://api.store.test' }],
      securitySchemes: {},
      endpoints: [
        {
          id: 'ep_products_list',
          method: 'GET',
          path: '/store/products',
          tags: ['Products'],
          summary: 'List products',
          parameters: [],
          responses: [
            {
              statusCode: '200',
              description: 'Successful product list',
              content: [
                {
                  contentType: 'application/json',
                  schema: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        title: { type: 'string' },
                        price: { type: 'number' },
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const genResult = service.generateFromSpec(spec, { defaultDelayMs: 15 }, 'test-user');
    assert.equal(genResult.generatedCount, 1);
    const generatedRoute = genResult.routes[0];
    assert.equal(generatedRoute.path, '/store/products');
    assert.equal(generatedRoute.method, 'GET');
    assert.equal(generatedRoute.statusCode, 200);
    assert.equal(generatedRoute.delayMs, 15);
    assert.ok(Array.isArray(generatedRoute.body));
  });
});

test('MockServerController - HTTP API Endpoints', async (t) => {
  await t.test('1. GET /api/mock/routes returns all routes', async () => {
    const service = new MockServerService();
    const controller = new MockServerController(service);
    const http = createMockHttp({});

    await controller.getRoutes(http.req, http.res);
    assert.equal(http.getStatus(), 200);
    const data = http.getData() as { routes: unknown[]; total: number };
    assert.ok(Array.isArray(data.routes));
    assert.equal(data.total, 0);
  });

  await t.test('2. POST /api/mock/routes creates a valid route', async () => {
    const service = new MockServerService();
    const controller = new MockServerController(service);
    const http = createMockHttp({
      body: {
        name: 'New Custom Endpoint',
        method: 'POST',
        path: '/custom/test',
        statusCode: 201,
        body: { created: true },
      },
    });

    await controller.createRoute(http.req, http.res);
    assert.equal(http.getStatus(), 201);
    const data = http.getData() as { id: string; statusCode: number };
    assert.ok(data.id.startsWith('mock_'));
    assert.equal(data.statusCode, 201);
  });

  await t.test('3. Dynamic mock server dispatch (ALL /api/mock/serve/*)', async () => {
    const service = new MockServerService();
    const controller = new MockServerController(service);

    const http = createMockHttp({
      method: 'GET',
      originalUrl: '/api/mock/serve/api/v1/users',
      query: { filter: 'active' },
      headers: { accept: 'application/json' },
    });

    await controller.serveMock(http.req, http.res);
    assert.equal(http.getStatus(), 200);
    const data = http.getData();
    assert.ok(Array.isArray(data));
    assert.equal((data as Array<Record<string, unknown>>)[0].name, 'Alice Smith');
  });

  await t.test('4. GET /api/mock/logs and DELETE /api/mock/logs', async () => {
    const service = new MockServerService();
    const controller = new MockServerController(service);

    // Call serveMock to generate a log entry
    const serveHttp = createMockHttp({
      method: 'GET',
      originalUrl: '/api/mock/serve/health',
    });
    service.createRoute({ ownerUserId: 'test-user', name: 'Private Health', method: 'GET', path: '/private-health', statusCode: 200, body: {}, enabled: true });
    serveHttp.req.originalUrl = '/api/mock/serve/private-health';
    await controller.serveMock(serveHttp.req, serveHttp.res);

    // Get logs
    const logHttp = createMockHttp({});
    await controller.getLogs(logHttp.req, logHttp.res);
    assert.equal(logHttp.getStatus(), 200);
    const logData = logHttp.getData() as { logs: unknown[]; total: number };
    assert.equal(logData.total, 1);

    // Clear logs
    const clearHttp = createMockHttp({});
    await controller.clearLogs(clearHttp.req, clearHttp.res);
    assert.equal(clearHttp.getStatus(), 200);

    // Verify empty
    const verifyHttp = createMockHttp({});
    await controller.getLogs(verifyHttp.req, verifyHttp.res);
    assert.equal((verifyHttp.getData() as { total: number }).total, 0);
  });

  await t.test('5. POST /api/mock/routes rejects missing required fields with 400', async () => {
    const service = new MockServerService();
    const controller = new MockServerController(service);

    const http = createMockHttp({ body: { name: 'Incomplete' } });
    await controller.createRoute(http.req, http.res);
    assert.equal(http.getStatus(), 400);
    const data = http.getData() as { error: { message: string } };
    assert.ok(data.error.message.includes('required'));
  });

  await t.test('6. GET, PUT, and DELETE return 404 for non-existent route IDs', async () => {
    const service = new MockServerService();
    const controller = new MockServerController(service);

    const getHttp = createMockHttp({ params: { id: 'non_existent_123' } });
    await controller.getRouteById(getHttp.req, getHttp.res);
    assert.equal(getHttp.getStatus(), 404);

    const putHttp = createMockHttp({ params: { id: 'non_existent_123' }, body: { statusCode: 200 } });
    await controller.updateRoute(putHttp.req, putHttp.res);
    assert.equal(putHttp.getStatus(), 404);

    const deleteHttp = createMockHttp({ params: { id: 'non_existent_123' } });
    await controller.deleteRoute(deleteHttp.req, deleteHttp.res);
    assert.equal(deleteHttp.getStatus(), 404);
  });

  await t.test('7. POST /api/mock/generate-from-spec rejects invalid payload with 400', async () => {
    const service = new MockServerService();
    const controller = new MockServerController(service);

    const http = createMockHttp({ body: {} });
    await controller.generateFromSpec(http.req, http.res);
    assert.equal(http.getStatus(), 400);
    const data = http.getData() as { error: { message: string } };
    assert.ok(data.error.message.includes('specification'));
  });
});

test('MockServerService - Advanced Edge Cases & Constraints', async (t) => {
  await t.test('1. Multi-segment parameters, trailing slash, and greedy wildcards', () => {
    const service = new MockServerService();
    service.createRoute({
      name: 'Team Member Resource',
      method: 'GET',
      path: '/api/v1/teams/:teamId/members/:memberId',
      statusCode: 200,
      body: { memberRole: 'lead' },
      enabled: true,
    });

    service.createRoute({
      name: 'Static Assets Wildcard',
      method: 'GET',
      path: '/static/*',
      statusCode: 200,
      body: 'asset-content',
      enabled: true,
    });

    // Multi-segment matching
    const multiMatch = service.matchRoute('GET', '/api/v1/teams/team_alpha/members/usr_999');
    assert.ok(multiMatch !== undefined);
    assert.equal(multiMatch?.name, 'Team Member Resource');

    // Trailing slash matching
    const trailingSlashMatch = service.matchRoute('GET', '/api/v1/teams/team_alpha/members/usr_999/');
    assert.ok(trailingSlashMatch !== undefined);

    // Greedy wildcard matching sub-paths
    const wildcardMatch = service.matchRoute('GET', '/static/images/badges/gold.svg');
    assert.ok(wildcardMatch !== undefined);
    assert.equal(wildcardMatch?.name, 'Static Assets Wildcard');
  });

  await t.test('2. Circular buffer caps traffic logs at 150 items', async () => {
    const service = new MockServerService();
    service.createRoute({ ownerUserId: 'test-user', name: 'Owned Health', method: 'GET', path: '/private-health', statusCode: 200, body: {}, enabled: true });

    // Generate 160 requests
    for (let i = 1; i <= 160; i++) {
      await service.handleRequest('GET', `/private-health?reqId=${i}`, { reqId: String(i) }, {});
    }

    const logs = service.getLogs('test-user');
    assert.equal(logs.length, 150, 'Logs must cap at maximum 150 entries');
    // Most recent request should be at index 0
    assert.equal(logs[0].queryParams.reqId, '160');
    // Oldest preserved request in circular buffer
    assert.equal(logs[149].queryParams.reqId, '11');
  });

  await t.test('3. Custom response headers and empty body for 204 No Content', async () => {
    const service = new MockServerService();
    service.createRoute({
      name: 'No Content Endpoint',
      method: 'DELETE',
      path: '/api/v1/items/:id',
      statusCode: 204,
      headers: {
        'X-Custom-Header': 'MockServer-Val',
        'Cache-Control': 'no-store',
      },
      body: '',
      enabled: true,
    });

    const res = await service.handleRequest('DELETE', '/api/v1/items/item_55', {}, {});
    assert.equal(res.statusCode, 204);
    assert.equal(res.headers['X-Custom-Header'], 'MockServer-Val');
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.equal(res.body, '');
  });

  await t.test('4. OpenAPI generation with overwriteExisting: true resets existing routes', () => {
    const service = new MockServerService();
    service.createRoute({ ownerUserId: 'test-user', name: 'Existing owned route', method: 'GET', path: '/existing', statusCode: 200, body: {}, enabled: true });
    service.createRoute({ ownerUserId: 'other-user', name: 'Other owner route', method: 'GET', path: '/other', statusCode: 200, body: {}, enabled: true });
    assert.equal(service.getRoutes('test-user').length, 1);

    const spec: ApiSpecification = {
      version: 'openapi-3.0.0',
      metadata: { title: 'Mini API', version: '1.0.0' },
      servers: [],
      securitySchemes: {},
      endpoints: [
        {
          id: 'ep_ping',
          method: 'GET',
          path: '/ping',
          tags: ['Ping'],
          summary: 'Ping Pong',
          parameters: [],
          responses: [
            {
              statusCode: '200',
              description: 'Pong response',
              content: [{ contentType: 'application/json', schema: { type: 'string' } }],
            },
          ],
        },
      ],
    };

    const res = service.generateFromSpec(spec, { overwriteExisting: true, defaultDelayMs: 0 }, 'test-user');
    assert.equal(res.generatedCount, 1);
    assert.equal(service.getRoutes('test-user').length, 1, 'Only the current user\'s routes are replaced');
    assert.equal(service.getRoutes('test-user')[0].path, '/ping');
    assert.equal(service.getRoutes('other-user')[0].path, '/other', 'overwriteExisting must preserve another owner\'s routes');
  });
});
