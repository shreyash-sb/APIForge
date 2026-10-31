import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestExecutorService } from '../src/services/requestExecutor.service.js';
import type { ApiRequest } from '../src/types/request.types.js';

const request = (url: string, auth: ApiRequest['auth'] = { type: 'none' }): ApiRequest => ({ method: 'GET', url, auth });
const internals = (service: RequestExecutorService) => service as unknown as { buildUrl: (url: string, query?: ApiRequest['queryParams'], auth?: ApiRequest['auth']) => string; buildHeaders: (input: ApiRequest) => Record<string, string>; validateRequest: (input: ApiRequest) => Promise<{ success: false; error: { type: string; message: string } } | null> };

test('adds a query API key once while preserving and encoding query parameters', () => {
  const service = internals(new RequestExecutorService());
  const url = service.buildUrl('https://api.example.test/users?page=2', [{ key: 'search', value: 'a b&c', enabled: true }], { type: 'apikey', key: 'api key', value: 'value/+', addTo: 'query' });
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('page'), '2');
  assert.equal(parsed.searchParams.get('search'), 'a b&c');
  assert.equal(parsed.searchParams.get('api key'), 'value/+');
  assert.equal(parsed.searchParams.getAll('api key').length, 1);
  assert.equal(new URL(service.buildUrl('https://api.example.test/users', undefined, { type: 'apikey', key: 'key', value: 'x', addTo: 'query' })).searchParams.get('key'), 'x');
});

test('keeps header API keys and never places credentials in validation errors', async () => {
  const service = internals(new RequestExecutorService());
  assert.deepEqual(service.buildHeaders(request('https://api.example.test', { type: 'apikey', key: 'X-Key', value: 'not-a-real-secret', addTo: 'header' })), { 'X-Key': 'not-a-real-secret' });
  const result = await service.validateRequest(request('ftp://not-a-real-secret.example'));
  assert.equal(result?.error.type, 'INVALID_URL');
  assert.equal(result?.error.message.includes('not-a-real-secret'), false);
});

test('outbound safety policy allows local development and blocks private production targets', async () => {
  const development = internals(new RequestExecutorService(1000, false));
  assert.equal(await development.validateRequest(request('http://127.0.0.1:3000')), null);
  const production = internals(new RequestExecutorService(1000, true, async () => [{ address: '8.8.8.8', family: 4 }]));
  for (const url of ['http://localhost:3000', 'http://127.0.0.1', 'http://10.0.0.1', 'http://169.254.169.254', 'http://192.168.1.1', 'http://[::1]', 'http://[fe80::1]', 'http://[fd00::1]', 'http://[::ffff:127.0.0.1]']) assert.equal((await production.validateRequest(request(url)))?.error.type, 'OUTBOUND_POLICY', url);
  assert.deepEqual(await production.validateRequest(request('https://api.example.test')), { safeAddress: { address: '8.8.8.8', family: 4 } });
  assert.equal((await production.validateRequest(request('file:///etc/passwd')))?.error.type, 'INVALID_URL');
});

test('normalizes invalid and excessive request timeout configuration to bounded values', () => {
  const timeoutOf = (timeout: number) => (new RequestExecutorService(timeout) as unknown as { timeout: number }).timeout;
  assert.equal(timeoutOf(Number.NaN), 30_000);
  assert.equal(timeoutOf(0), 30_000);
  assert.equal(timeoutOf(250_000), 120_000);
  assert.equal(timeoutOf(1_500), 1_500);
});


test('safe mode resolves hostnames and blocks private or mixed DNS answers', async () => {
  const privateDns = new RequestExecutorService(1000, true, async () => [{ address: '10.0.0.7', family: 4 }]);
  assert.equal((await internals(privateDns).validateRequest(request('https://private.fixture.test')))?.error.type, 'OUTBOUND_POLICY');
  const mixedDns = new RequestExecutorService(1000, true, async () => [{ address: '203.0.113.8', family: 4 }, { address: '192.168.1.2', family: 4 }]);
  assert.equal((await internals(mixedDns).validateRequest(request('https://mixed.fixture.test')))?.error.type, 'OUTBOUND_POLICY');
  const failedDns = new RequestExecutorService(1000, true, async () => { throw new Error('fixture DNS failure'); });
  assert.equal((await internals(failedDns).validateRequest(request('https://unresolved.fixture.test')))?.error.type, 'OUTBOUND_POLICY');
});

test('safe mode pins DNS results and does not follow redirects to an unvalidated destination', async () => {
  const calls: RequestInit[] = [];
  const service = new RequestExecutorService(
    1000,
    true,
    async () => [{ address: '8.8.8.8', family: 4 }],
    async (_url, init, address) => {
      calls.push(init);
      assert.deepEqual(address, { address: '8.8.8.8', family: 4 });
      return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } });
    },
  );
  const result = await service.execute(request('https://safe.fixture.test/resource', { type: 'bearer', token: 'fixture-secret' }));
  assert.equal(result.success, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].redirect, 'manual');
});
