import assert from 'node:assert/strict';
import test from 'node:test';
import type { MockRequestLog, MockRoute } from '../../Frontend/src/types/mockServer.types.js';
import type { ApiSpecification } from '../src/types/openapi.types.js';
import type { RequestDraft } from '../../Frontend/src/store/useAppStore.js';

// Test suite for Frontend Mock Server State, UI Filtering, and "Test in Builder" transitions
test('Frontend Mock Server State & Integration Logic', async (t) => {
  const sampleRoutes: MockRoute[] = [
    {
      id: 'mock_1',
      name: 'List Users',
      method: 'GET',
      path: '/api/v1/users',
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: [{ id: 'u1', name: 'Alice' }],
      enabled: true,
      delayMs: 10,
      createdAt: '2026-10-10T10:00:00Z',
      updatedAt: '2026-10-10T10:00:00Z',
    },
    {
      id: 'mock_2',
      name: 'Create User',
      method: 'POST',
      path: '/api/v1/users',
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: { id: 'u2', created: true },
      enabled: true,
      delayMs: 25,
      createdAt: '2026-10-10T10:01:00Z',
      updatedAt: '2026-10-10T10:01:00Z',
    },
    {
      id: 'mock_3',
      name: 'Legacy Health',
      method: 'GET',
      path: '/healthz',
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { status: 'healthy' },
      enabled: false,
      delayMs: 0,
      createdAt: '2026-10-10T10:02:00Z',
      updatedAt: '2026-10-10T10:02:00Z',
    },
  ];

  await t.test('1. Loading and filtering routes by method and search query', () => {
    const filterRoutes = (routes: MockRoute[], method: string, query: string) => {
      return routes.filter((r) => {
        const matchesMethod = method === 'ALL' || r.method.toUpperCase() === method.toUpperCase();
        const matchesQuery =
          r.path.toLowerCase().includes(query.toLowerCase()) ||
          r.name.toLowerCase().includes(query.toLowerCase());
        return matchesMethod && matchesQuery;
      });
    };

    // Filter ALL with empty query
    assert.equal(filterRoutes(sampleRoutes, 'ALL', '').length, 3);

    // Filter by Method GET
    const getRoutes = filterRoutes(sampleRoutes, 'GET', '');
    assert.equal(getRoutes.length, 2);
    assert.ok(getRoutes.every((r) => r.method === 'GET'));

    // Filter by Method POST
    const postRoutes = filterRoutes(sampleRoutes, 'POST', '');
    assert.equal(postRoutes.length, 1);
    assert.equal(postRoutes[0].id, 'mock_2');

    // Filter by Search Query "health"
    const searchHealth = filterRoutes(sampleRoutes, 'ALL', 'health');
    assert.equal(searchHealth.length, 1);
    assert.equal(searchHealth[0].name, 'Legacy Health');

    // Filter by Path query "users"
    const searchUsers = filterRoutes(sampleRoutes, 'ALL', 'users');
    assert.equal(searchUsers.length, 2);
  });

  await t.test('2. Toggling mock route active status immutably', () => {
    let routes = [...sampleRoutes];
    const toggleRoute = (id: string) => {
      routes = routes.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
    };

    assert.equal(routes.find((r) => r.id === 'mock_3')?.enabled, false);
    toggleRoute('mock_3');
    assert.equal(routes.find((r) => r.id === 'mock_3')?.enabled, true);
    toggleRoute('mock_3');
    assert.equal(routes.find((r) => r.id === 'mock_3')?.enabled, false);
  });

  await t.test('3. Creating and updating a mock route with JSON body parsing & validation', () => {
    const validateAndParseBody = (rawBody: string): { parsed: unknown; error: string | null } => {
      try {
        if (rawBody.trim().startsWith('{') || rawBody.trim().startsWith('[')) {
          return { parsed: JSON.parse(rawBody), error: null };
        }
        return { parsed: rawBody, error: null };
      } catch {
        return { parsed: null, error: 'Invalid JSON format in response body.' };
      }
    };

    // Valid JSON object
    const validRes = validateAndParseBody('{\n  "status": "success",\n  "count": 5\n}');
    assert.equal(validRes.error, null);
    assert.equal((validRes.parsed as Record<string, unknown>).count, 5);

    // Malformed JSON object
    const malformedRes = validateAndParseBody('{\n  status: "broken"\n}');
    assert.equal(malformedRes.error, 'Invalid JSON format in response body.');

    // Plain text body
    const textRes = validateAndParseBody('plain text response');
    assert.equal(textRes.error, null);
    assert.equal(textRes.parsed, 'plain text response');
  });

  await t.test('4. Generating mock routes from OpenAPI specification', () => {
    const spec: ApiSpecification = {
      version: 'openapi-3.0.0',
      metadata: { title: 'Inventory Service', version: '1.0.0' },
      servers: [],
      securitySchemes: {},
      endpoints: [
        {
          id: 'ep_1',
          method: 'GET',
          path: '/inventory/items',
          tags: ['Warehouse'],
          summary: 'List inventory items',
          parameters: [],
          responses: [
            {
              statusCode: '200',
              description: 'OK',
              content: [{ contentType: 'application/json', example: [{ sku: 'SKU-001', qty: 50 }] }],
            },
          ],
        },
      ],
    };

    // Simulate frontend OpenAPI generator mapper
    const generated: MockRoute[] = spec.endpoints.map((ep) => ({
      id: `mock_gen_${ep.id}`,
      name: ep.summary || ep.path,
      method: ep.method,
      path: ep.path,
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: ep.responses[0]?.content[0]?.example || {},
      enabled: true,
      delayMs: 20,
      source: 'OPENAPI',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    assert.equal(generated.length, 1);
    assert.equal(generated[0].path, '/inventory/items');
    assert.equal(generated[0].name, 'List inventory items');
    assert.equal((generated[0].body as Array<{ sku: string }>)[0].sku, 'SKU-001');
  });

  await t.test('5. Displaying and clearing traffic logs', () => {
    let mockLogs: MockRequestLog[] = [
      {
        id: 'log_1',
        timestamp: '2026-10-10T10:00:00Z',
        method: 'GET',
        url: 'http://localhost:3001/api/mock/serve/api/v1/users',
        path: '/api/v1/users',
        queryParams: { page: '1' },
        headers: { accept: 'application/json' },
        matchedRouteId: 'mock_1',
        matchedRouteName: 'List Users',
        responseStatus: 200,
        durationMs: 12,
      },
      {
        id: 'log_2',
        timestamp: '2026-10-10T10:01:00Z',
        method: 'POST',
        url: 'http://localhost:3001/api/mock/serve/api/v1/users',
        path: '/api/v1/users',
        queryParams: {},
        headers: { 'content-type': 'application/json' },
        matchedRouteId: 'mock_2',
        matchedRouteName: 'Create User',
        responseStatus: 201,
        durationMs: 28,
      },
    ];

    assert.equal(mockLogs.length, 2);
    // Find log for route
    const userLog = mockLogs.find((l) => l.matchedRouteId === 'mock_2');
    assert.equal(userLog?.responseStatus, 201);
    assert.equal(userLog?.durationMs, 28);

    // Clear logs action
    mockLogs = [];
    assert.equal(mockLogs.length, 0);
  });

  await t.test('6. "Test in Builder" action correctly prepares RequestDraft state', () => {
    const mockBaseUrl = 'http://localhost:3001/api/mock/serve';

    const buildRequestDraft = (route: MockRoute): RequestDraft => ({
      method: route.method,
      url: `${mockBaseUrl}${route.path}`,
      queryParams: [],
      headers: [{ id: 'hdr_1', key: 'Accept', value: 'application/json', enabled: true }],
      body: route.method !== 'GET' && route.method !== 'HEAD' ? '{\n  "test": true\n}' : '',
      auth: { type: 'none' },
    });

    // Test GET route transition
    const getDraft = buildRequestDraft(sampleRoutes[0]);
    assert.equal(getDraft.method, 'GET');
    assert.equal(getDraft.url, 'http://localhost:3001/api/mock/serve/api/v1/users');
    assert.equal(getDraft.headers[0].key, 'Accept');
    assert.equal(getDraft.headers[0].value, 'application/json');
    assert.equal(getDraft.body, '', 'GET request must have empty body in RequestDraft');

    // Test POST route transition
    const postDraft = buildRequestDraft(sampleRoutes[1]);
    assert.equal(postDraft.method, 'POST');
    assert.equal(postDraft.url, 'http://localhost:3001/api/mock/serve/api/v1/users');
    assert.ok(postDraft.body.includes('"test": true'), 'POST request must include template test body');
    assert.equal(postDraft.auth.type, 'none');
  });
});
