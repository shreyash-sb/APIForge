import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestExecutorService } from '../src/services/requestExecutor.service.js';
import type { ApiRequest } from '../src/types/request.types.js';

const request = (url: string, auth: ApiRequest['auth'] = { type: 'none' }): ApiRequest => ({ method: 'GET', url, auth });
const internals = (service: RequestExecutorService) => service as unknown as { buildUrl: (url: string, query?: ApiRequest['queryParams'], auth?: ApiRequest['auth']) => string; buildHeaders: (input: ApiRequest) => Record<string, string>; validateRequest: (input: ApiRequest) => { success: false; error: { type: string; message: string } } | null };

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

test('keeps header API keys and never places credentials in validation errors', () => {
  const service = internals(new RequestExecutorService());
  assert.deepEqual(service.buildHeaders(request('https://api.example.test', { type: 'apikey', key: 'X-Key', value: 'not-a-real-secret', addTo: 'header' })), { 'X-Key': 'not-a-real-secret' });
  const result = service.validateRequest(request('ftp://not-a-real-secret.example'));
  assert.equal(result?.error.type, 'INVALID_URL');
  assert.equal(result?.error.message.includes('not-a-real-secret'), false);
});

test('outbound safety policy allows local development and blocks private production targets', () => {
  const development = internals(new RequestExecutorService(1000, false));
  assert.equal(development.validateRequest(request('http://127.0.0.1:3000')), null);
  const production = internals(new RequestExecutorService(1000, true));
  for (const url of ['http://localhost:3000', 'http://127.0.0.1', 'http://10.0.0.1', 'http://169.254.169.254', 'http://192.168.1.1', 'http://[::1]']) assert.equal(production.validateRequest(request(url))?.error.type, 'OUTBOUND_POLICY');
  assert.equal(production.validateRequest(request('https://api.example.test')), null);
  assert.equal(production.validateRequest(request('file:///etc/passwd'))?.error.type, 'INVALID_URL');
});
