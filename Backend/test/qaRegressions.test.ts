/**
 * Regressions for defects found during end-to-end QA against a live backend.
 */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { TestGeneratorService } from '../src/services/testGenerator.service.js';
import { RequestExecutorService } from '../src/services/requestExecutor.service.js';
import { MockServerController } from '../src/controllers/mockServer.controller.js';
import { MockServerService } from '../src/services/mockServer.service.js';
import { WorkflowEngineService } from '../src/services/workflowEngine.service.js';
import type { ApiSpecification } from '../src/types/openapi.types.js';

const spec = (serverUrl: string): ApiSpecification => ({
  version: 'openapi-3.0', metadata: { title: 'QA', version: '1' }, servers: [{ url: serverUrl }], schemas: {}, securitySchemes: {},
  endpoints: [{
    id: 'GET /users/{id}/posts/{postId}', method: 'GET', path: '/users/{id}/posts/{postId}', tags: [], deprecated: false, security: null,
    parameters: [
      { name: 'id', location: 'path', required: true, example: '1', schema: { type: 'integer', constraints: { minimum: 1 } } },
      { name: 'postId', location: 'path', required: true, example: '1', schema: { type: 'string' } },
    ],
    responses: [{ statusCode: '200', headers: {}, content: [] }, { statusCode: '404', headers: {}, content: [] }],
  }],
});

test('path-parameter tests never rewrite the server host/port (127.0.0.1 with id=1)', () => {
  const tests = new TestGeneratorService().generate(spec('http://127.0.0.1:4010/v1'), { categories: ['POSITIVE', 'PARAMETER', 'BOUNDARY'], maxTestsPerEndpoint: 30 }).tests;
  assert.ok(tests.length > 3);
  for (const t of tests) assert.match(t.request.url, /^http:\/\/127\.0\.0\.1:4010\/v1\/users\//, t.request.url);
  const missingId = tests.find((t) => t.metadata.rule === 'missing-path' && t.metadata.mutation === 'id');
  assert.equal(missingId?.request.url, 'http://127.0.0.1:4010/v1/users/posts/1');
  const belowMin = tests.find((t) => t.metadata.rule === 'parameter-below-minimum');
  assert.equal(belowMin?.request.url, 'http://127.0.0.1:4010/v1/users/0/posts/1', 'only the targeted segment changes even when params share a value');
  const valid = tests.find((t) => t.type === 'POSITIVE');
  assert.equal(valid?.request.url, 'http://127.0.0.1:4010/v1/users/1/posts/1');
});

test('request executor sends non-JSON and malformed-JSON bodies verbatim and honours per-request timeout', async () => {
  const received: Array<{ type?: string; body: string }> = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.url === '/slow') { setTimeout(() => res.end('late'), 3000); return; }
      received.push({ type: req.headers['content-type'], body });
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as { port: number };
  try {
    const executor = new RequestExecutorService(30_000, false);
    for (const [type, body] of [['application/xml', '<a>1</a>'], ['application/x-www-form-urlencoded', 'a=1&b=2'], ['application/json', '{"broken":']] as const) {
      const result = await executor.execute({ method: 'POST', url: `http://127.0.0.1:${port}/x`, headers: [{ key: 'Content-Type', value: type, enabled: true }], body, auth: { type: 'none' } });
      assert.equal(result.success, true, JSON.stringify(result));
    }
    assert.deepEqual(received.map((r) => r.body), ['<a>1</a>', 'a=1&b=2', '{"broken":']);
    assert.equal(received[0].type, 'application/xml');

    const started = Date.now();
    const timedOut = await executor.execute({ method: 'GET', url: `http://127.0.0.1:${port}/slow`, auth: { type: 'none' } }, { timeoutMs: 1000 });
    assert.equal(timedOut.success, false);
    assert.match(JSON.stringify(timedOut), /timed out after 1000ms/);
    assert.ok(Date.now() - started < 2500);
  } finally {
    server.close();
  }
});

test('mock route API rejects invalid status, method, delay and protects owner/id on update', async () => {
  const service = new MockServerService();
  const controller = new MockServerController(service);
  const run = async (fn: 'createRoute' | 'updateRoute', body: unknown, params: Record<string, string> = {}) => {
    let status = 0; let json: unknown;
    const res = { locals: { authUser: { id: 'owner-1' } }, status(code: number) { status = code; return this; }, json(value: unknown) { json = value; return this; } };
    await controller[fn]({ body, params } as never, res as never);
    return { status, json: json as Record<string, unknown> };
  };
  for (const body of [
    { name: 'a', method: 'GET', path: '/a', statusCode: 999 },
    { name: 'a', method: 'GET', path: '/a', statusCode: 42 },
    { name: 'a', method: 'FETCH', path: '/a' },
    { name: 'a', method: 'GET', path: '/a', delayMs: 10_000_000 },
    { name: '   ', method: 'GET', path: '/a' },
  ]) assert.equal((await run('createRoute', body)).status, 400, JSON.stringify(body));

  const created = await run('createRoute', { name: 'ok', method: 'get', path: '/ok', statusCode: 204 });
  assert.equal(created.status, 201);
  assert.equal(created.json.method, 'GET');
  assert.equal(created.json.statusCode, 204);
  const id = String(created.json.id);
  assert.equal((await run('updateRoute', { statusCode: 0 }, { id })).status, 400);
  const updated = await run('updateRoute', { id: 'hijack', ownerUserId: 'attacker', source: 'OPENAPI', name: 'renamed' }, { id });
  assert.equal(updated.status, 200);
  assert.equal(updated.json.id, id);
  assert.equal(updated.json.ownerUserId, 'owner-1');
  assert.equal(updated.json.source, 'MANUAL');
  assert.equal(updated.json.name, 'renamed');
});

test('workflow summary counts a validation-failed step as failed, not passed', async () => {
  const server = createServer((_req, res) => { res.writeHead(401, { 'content-type': 'application/json' }).end('{"error":"no"}'); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as { port: number };
  try {
    const engine = new WorkflowEngineService(new RequestExecutorService(5000, false));
    const result = await engine.executeScenario({
      id: 'w', name: 'w',
      steps: [
        { id: 's1', name: 'login', enabled: true, request: { method: 'GET', url: `http://127.0.0.1:${port}/`, auth: { type: 'none' } }, expected: { statusCodes: ['200'] } },
        { id: 's2', name: 'next', enabled: true, dependsOn: ['s1'], request: { method: 'GET', url: `http://127.0.0.1:${port}/`, auth: { type: 'none' } } },
      ],
    });
    assert.equal(result.status, 'FAILED');
    assert.equal(result.summary.passed, 0);
    assert.equal(result.summary.failed, 1);
    assert.equal(result.summary.blocked, 1);
  } finally {
    server.close();
  }
});

test('empty auth credentials are not sent (no "Bearer " header, no blank API-key header)', async () => {
  const seen: Array<Record<string, string | string[] | undefined>> = [];
  const server = createServer((req, res) => { seen.push(req.headers); res.writeHead(200).end('{}'); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as { port: number };
  try {
    const executor = new RequestExecutorService(5000, false);
    const url = `http://127.0.0.1:${port}/`;
    for (const auth of [{ type: 'bearer', token: '' }, { type: 'bearer', token: '   ' }, { type: 'apikey', key: '', value: 'v', addTo: 'header' }, { type: 'basic', username: '', password: '' }] as const) {
      const result = await executor.execute({ method: 'GET', url, auth: auth as never });
      assert.equal(result.success, true, JSON.stringify(result));
    }
    for (const headers of seen) assert.equal(headers.authorization, undefined);
    await executor.execute({ method: 'GET', url, auth: { type: 'bearer', token: 'tok' } });
    assert.equal(seen.at(-1)?.authorization, 'Bearer tok');
  } finally {
    server.close();
  }
});
