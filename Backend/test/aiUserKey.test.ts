import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import test from 'node:test';
import express from 'express';
import authRoutes from '../src/routes/auth.routes.js';
import assistantRoutes from '../src/routes/assistant.routes.js';
import diagnosisRoutes from '../src/routes/diagnosis.routes.js';
import aiSettingsRoutes, { aiSettingsBodyParser } from '../src/routes/aiSettings.routes.js';
import { requireAuth } from '../src/middleware/requireAuth.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { aiCredentialStore, AiCredentialStore, type AuthSession } from '../src/services/aiCredentialStore.service.js';
import { GoogleAiProvider, MockAiProvider } from '../src/services/aiProvider.service.js';

// Synthetic, format-valid placeholder keys. No live Gemini request is ever made.
const KEY_A = 'AIza' + 'SyTESTKEYuserAAAAAAAAAAAAAAAAAAAAAAA' /* synthetic test value, not a real key */;
const KEY_B = 'AIza' + 'SyTESTKEYuserBBBBBBBBBBBBBBBBBBBBBBB' /* synthetic test value, not a real key */;
const GEMINI = 'https://generativelanguage.googleapis.com/';

type GeminiHandler = (url: string, init: RequestInit) => Promise<Response> | Response;
const geminiText = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
const headerKey = (init: RequestInit) => new Headers(init.headers).get('x-goog-api-key') ?? '';

async function startApp(handler: GeminiHandler) {
  const originalFetch = globalThis.fetch;
  const geminiCalls: Array<{ url: string; key: string; body: string }> = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.startsWith(GEMINI)) {
      geminiCalls.push({ url, key: headerKey(init), body: String(init.body ?? '') });
      return handler(url, init);
    }
    return originalFetch(input, init);
  };

  const app = express();
  app.use('/api/ai-settings', aiSettingsBodyParser);
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/assistant', requireAuth, assistantRoutes);
  app.use('/api/diagnosis', requireAuth, diagnosisRoutes);
  app.use('/api/ai-settings', requireAuth, aiSettingsRoutes);
  app.use(errorHandler);
  const server: Server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;

  const call = async (path: string, token: string | undefined, method = 'GET', body?: unknown, raw?: string) => {
    const response = await originalFetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    const text = await response.text();
    return { status: response.status, text, json: text ? JSON.parse(text) : undefined };
  };
  const signup = async (label: string) => {
    const result = await call('/api/auth/signup', undefined, 'POST', {
      name: `AI ${label}`,
      email: `ai-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
      password: 'TestPassword!2026',
    });
    assert.equal(result.status, 201);
    return result.json.token as string;
  };
  const close = async () => {
    globalThis.fetch = originalFetch;
    server.close();
    await once(server, 'close');
  };
  return { call, signup, close, geminiCalls };
}

function captureConsole() {
  const lines: string[] = [];
  const originals = { log: console.log, warn: console.warn, error: console.error };
  for (const level of ['log', 'warn', 'error'] as const) {
    console[level] = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
  }
  return { lines, restore: () => Object.assign(console, originals) };
}

const diagnosisItem = (id: string, executionId = `exec_${id}`, validationExecutionId = executionId) => ({
  testCase: {
    id, name: `GET /users/{id} ${id}`, description: '', type: 'POSITIVE', priority: 'HIGH', enabled: true,
    endpoint: { method: 'GET', path: '/users/{id}' },
    request: { method: 'GET', url: 'https://api.example.test/users/1', queryParams: [], headers: [], body: null, auth: { type: 'none' } },
    pathParams: {}, expected: { statusCodes: ['200'] }, metadata: { sourceEndpointId: 'x', rule: 'valid' },
  },
  executionResult: {
    testCaseId: id, executionId, status: 'PASSED_EXECUTION', startedAt: '', completedAt: '', durationMs: 12,
    request: { method: 'GET', url: 'https://api.example.test/users/1', auth: { type: 'none', redacted: false, description: '' } },
    response: { status: 404, statusText: 'Not Found', responseTime: 12, headers: { 'content-type': 'application/json' }, body: { error: 'missing', apiKey: KEY_A }, size: 10 },
  },
  validationResult: {
    testCaseId: id, executionId: validationExecutionId, status: 'VALIDATION_FAILED', validatedAt: '', durationMs: 1,
    summary: { totalAssertions: 1, passedAssertions: 0, failedAssertions: 1 },
    assertions: [{ id: 'a1', category: 'STATUS_CODE', path: '$.status', expected: '200', actual: '404', passed: false, message: 'Expected 200 but received 404.' }],
  },
});

test('missing key: user AI requests use the mock/demo provider and are labelled honestly, even if a shared env key exists', async () => {
  const oldProvider = process.env.AI_PROVIDER;
  const oldKey = process.env.GEMINI_API_KEY;
  process.env.AI_PROVIDER = 'google-gemini';
  process.env.GEMINI_API_KEY = 'AIza' + 'SySHAREDappKEYmustNOTbeUSEDxxxxxxxxx' /* synthetic test value, not a real key */;
  const app = await startApp(() => geminiText('should not be called'));
  try {
    const token = await app.signup('nokey');
    const status = await app.call('/api/ai-settings', token);
    assert.equal(status.status, 200);
    assert.equal(status.json.configured, false);
    assert.equal(status.json.mode, 'mock-demo');

    const reply = await app.call('/api/assistant/chat', token, 'POST', { message: 'What does 404 mean?' });
    assert.equal(reply.status, 200);
    assert.equal(reply.json.provider, 'mock');
    assert.equal(reply.json.providerStatus, 'mock');
    assert.match(reply.json.reply, /Mock\/demo response/);

    const diagnosis = await app.call('/api/diagnosis/diagnose-single', token, 'POST', diagnosisItem('tc_nokey'));
    assert.equal(diagnosis.status, 200);
    assert.equal(diagnosis.json.provider, 'mock');
    assert.equal(diagnosis.json.providerStatus, 'mock');
    assert.equal(app.geminiCalls.length, 0, 'the shared application key must never be used for user requests');
  } finally {
    await app.close();
    if (oldProvider === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = oldProvider;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey;
  }
});

test('valid key: saved server-side, sent only as a header, never returned or logged', async () => {
  const consoleCapture = captureConsole();
  const app = await startApp((url) => (url.includes(':generateContent') ? geminiText('From your session: GET /users/{id} returned 404.') : new Response('{}', { status: 200 })));
  try {
    const token = await app.signup('valid');
    const saved = await app.call('/api/ai-settings/gemini-key', token, 'PUT', { apiKey: KEY_A });
    assert.equal(saved.status, 200);
    assert.equal(saved.json.configured, true);
    assert.equal(saved.json.mode, 'gemini');
    assert.equal(saved.json.storage, 'session');
    assert.equal(saved.json.keyHint, `••••${KEY_A.slice(-4)}`);
    assert.equal(saved.json.lastValidation.status, 'valid');

    const status = await app.call('/api/ai-settings', token);
    const retest = await app.call('/api/ai-settings/gemini-key/test', token, 'POST');
    const reply = await app.call('/api/assistant/chat', token, 'POST', { message: 'Explain 404' });
    assert.equal(reply.json.provider, 'google-gemini');
    assert.equal(reply.json.providerStatus, 'live');

    for (const response of [saved, status, retest, reply]) assert.equal(response.text.includes(KEY_A), false);
    assert.ok(app.geminiCalls.length >= 3);
    for (const call of app.geminiCalls) {
      assert.equal(call.key, KEY_A, 'key travels in the x-goog-api-key header');
      assert.equal(call.url.includes(KEY_A), false, 'key never appears in the provider URL');
      assert.equal(call.url.includes('key='), false);
    }
    // Malformed JSON with the key inside must not echo or log it.
    const malformed = await app.call('/api/ai-settings/gemini-key', token, 'PUT', undefined, `{"apiKey":"${KEY_A}"`);
    assert.equal(malformed.status, 400);
    assert.equal(malformed.text.includes(KEY_A), false);
    assert.equal(consoleCapture.lines.join('\n').includes(KEY_A), false, 'key must never be logged');
  } finally {
    consoleCapture.restore();
    await app.close();
  }
});

test('invalid key is rejected and not stored; malformed key is rejected without echo', async () => {
  const app = await startApp(() => new Response('API key not valid. private provider body', { status: 400 }));
  try {
    const token = await app.signup('invalid');
    const rejected = await app.call('/api/ai-settings/gemini-key', token, 'PUT', { apiKey: KEY_A });
    assert.equal(rejected.status, 422);
    assert.equal(rejected.json.status.configured, false);
    assert.equal(rejected.json.status.lastValidation.status, 'invalid');
    assert.doesNotMatch(rejected.text, /private provider body/);
    assert.equal(rejected.text.includes(KEY_A), false);

    const malformed = await app.call('/api/ai-settings/gemini-key', token, 'PUT', { apiKey: 'short key!' });
    assert.equal(malformed.status, 400);
    assert.doesNotMatch(malformed.text, /short key!/);

    const anonymous = await app.call('/api/ai-settings/gemini-key', undefined, 'PUT', { apiKey: KEY_A });
    assert.equal(anonymous.status, 401);
  } finally {
    await app.close();
  }
});

test('user isolation: another user cannot see, use, test, or remove a key', async () => {
  const app = await startApp((url, init) => (url.includes(':generateContent') ? geminiText(`answer-for-${headerKey(init).slice(-4)}`) : new Response('{}', { status: 200 })));
  try {
    const tokenA = await app.signup('isoA');
    const tokenB = await app.signup('isoB');
    assert.equal((await app.call('/api/ai-settings/gemini-key', tokenA, 'PUT', { apiKey: KEY_A })).status, 200);

    const statusB = await app.call('/api/ai-settings', tokenB);
    assert.equal(statusB.json.configured, false);
    assert.equal((await app.call('/api/ai-settings/gemini-key/test', tokenB, 'POST')).status, 404);
    await app.call('/api/ai-settings/gemini-key', tokenB, 'DELETE');
    assert.equal((await app.call('/api/ai-settings', tokenA)).json.configured, true, "B's delete must not touch A's key");

    const replyB = await app.call('/api/assistant/chat', tokenB, 'POST', { message: 'hello' });
    assert.equal(replyB.json.provider, 'mock');
    assert.equal(app.geminiCalls.some((call) => call.body.includes('hello')), false);

    // A forged session that reuses A's session id with B's user id resolves nothing.
    const store = new AiCredentialStore((key) => new GoogleAiProvider(key, 'm'));
    const sessionA: AuthSession = { id: 'sess-a', userId: 'usr_a', expiresAt: Date.now() + 60_000 };
    store.set(sessionA, KEY_A);
    assert.equal(store.hasKey({ ...sessionA, userId: 'usr_b' }), false);
    assert.equal(store.remove({ ...sessionA, userId: 'usr_b' }), false);
    assert.equal(store.resolveProvider({ ...sessionA, userId: 'usr_b' }).name, 'mock');
    assert.equal(store.hasKey(sessionA), true);
  } finally {
    await app.close();
  }
});

test('concurrent requests for different users each use their own request-scoped key', async () => {
  const app = await startApp(async (url, init) => {
    if (!url.includes(':generateContent')) return new Response('{}', { status: 200 });
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 25));
    return geminiText(`answered-with-${headerKey(init).slice(-4)}`);
  });
  try {
    const tokenA = await app.signup('concA');
    const tokenB = await app.signup('concB');
    await app.call('/api/ai-settings/gemini-key', tokenA, 'PUT', { apiKey: KEY_A });
    await app.call('/api/ai-settings/gemini-key', tokenB, 'PUT', { apiKey: KEY_B });
    const requests = Array.from({ length: 12 }, (_, i) => {
      const token = i % 2 === 0 ? tokenA : tokenB;
      return app.call('/api/assistant/chat', token, 'POST', { message: `question ${i}` }).then((r) => ({ i, reply: r.json.reply as string }));
    });
    for (const { i, reply } of await Promise.all(requests)) {
      assert.equal(reply, `answered-with-${(i % 2 === 0 ? KEY_A : KEY_B).slice(-4)}`);
    }
  } finally {
    await app.close();
  }
});

test('key replacement, removal, and logout cleanup', async () => {
  const app = await startApp(() => new Response('{}', { status: 200 }));
  try {
    const token = await app.signup('lifecycle');
    await app.call('/api/ai-settings/gemini-key', token, 'PUT', { apiKey: KEY_A });
    const replaced = await app.call('/api/ai-settings/gemini-key', token, 'PUT', { apiKey: KEY_B });
    assert.equal(replaced.json.keyHint, `••••${KEY_B.slice(-4)}`);

    const removed = await app.call('/api/ai-settings/gemini-key', token, 'DELETE');
    assert.equal(removed.json.configured, false);
    assert.equal((await app.call('/api/assistant/chat', token, 'POST', { message: 'hi' })).json.provider, 'mock');

    await app.call('/api/ai-settings/gemini-key', token, 'PUT', { apiKey: KEY_A });
    const sessionCount = () => (aiCredentialStore as unknown as { entries: Map<string, unknown> }).entries.size;
    const before = sessionCount();
    assert.equal((await app.call('/api/auth/logout', token, 'POST')).status, 200);
    assert.equal(sessionCount(), before - 1, 'logout removes the session key immediately');
    assert.equal((await app.call('/api/ai-settings', token)).status, 401);

    // A new login session starts without a key (session-only storage).
    const store = new AiCredentialStore();
    const now = Date.now();
    store.set({ id: 's1', userId: 'u1', expiresAt: now + 1000 }, KEY_A);
    store.set({ id: 's2', userId: 'u1', expiresAt: now + 1000 }, KEY_B);
    store.removeUser('u1');
    assert.equal(store.hasKey({ id: 's1', userId: 'u1', expiresAt: now + 1000 }), false);
    assert.equal(store.hasKey({ id: 's2', userId: 'u1', expiresAt: now + 1000 }), false);
  } finally {
    await app.close();
  }
});

test('session keys expire with the session token', () => {
  let now = 1_000;
  const store = new AiCredentialStore(undefined, () => now);
  const session: AuthSession = { id: 'exp', userId: 'u', expiresAt: 2_000 };
  store.set(session, KEY_A);
  assert.equal(store.status(session).configured, true);
  now = 2_001;
  assert.equal(store.status(session).configured, false);
  assert.equal(store.resolveProvider(session).name, 'mock');
});

test('Gemini key test classifies timeout, invalid key, quota, and model errors without leaking the key', async () => {
  const originalFetch = globalThis.fetch;
  try {
    const cases: Array<[() => Promise<Response>, string, RegExp]> = [
      [async () => new Response('x', { status: 200 }), 'valid', /accepted/],
      [async () => new Response(`bad ${KEY_A}`, { status: 400 }), 'invalid', /rejected this key \(HTTP 400\)/],
      [async () => new Response('x', { status: 403 }), 'invalid', /HTTP 403/],
      [async () => new Response('x', { status: 429 }), 'unverified', /rate limit or quota/],
      [async () => new Response('x', { status: 404 }), 'unverified', /not found/],
      [async () => { throw new DOMException('t', 'TimeoutError'); }, 'unverified', /timed out/],
    ];
    for (const [impl, status, message] of cases) {
      let calls = 0;
      globalThis.fetch = async () => { calls += 1; return impl(); };
      const result = await new GoogleAiProvider(KEY_A, 'qa-model').testCredentials();
      assert.equal(result.status, status);
      assert.match(result.message, message);
      assert.equal(result.message.includes(KEY_A), false);
      assert.equal(calls, 1, 'key tests are never retried');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('assistant fallback is labelled as fallback/mock, never as Gemini', async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const impl of [
      async () => new Response('x', { status: 429 }),
      async () => new Response('x', { status: 401 }),
      async () => new Response('{bad', { status: 200 }),
      async () => { throw new DOMException('t', 'TimeoutError'); },
    ]) {
      globalThis.fetch = impl;
      const result = await new GoogleAiProvider(KEY_A, 'qa-model').assistDetailed({ message: 'q', facts: ['GET /a — fact'] });
      assert.equal(result.providerStatus, 'fallback');
      assert.match(result.text, /Gemini could not answer, deterministic mock fallback used/);
      assert.match(result.text, /Mock\/demo response/);
      assert.ok(result.fallbackReason);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('diagnosis fallback output is labelled mock/fallback with a safe reason', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('{}', { status: 401 });
    const { DiagnosisService } = await import('../src/services/diagnosis.service.js');
    const item = diagnosisItem('tc_fb');
    const result = await new DiagnosisService().diagnoseSingle(item.testCase as never, item.executionResult as never, item.validationResult as never, new GoogleAiProvider(KEY_A, 'm'));
    assert.equal(result.provider, 'mock');
    assert.equal(result.providerStatus, 'fallback');
    assert.match(result.fallbackReason ?? '', /HTTP 401/);
    assert.equal(JSON.stringify(result).includes(KEY_A), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('diagnosis rejects stale evidence and preserves partial batch results', async () => {
  const app = await startApp(() => new Response('{}', { status: 200 }));
  try {
    const token = await app.signup('stale');
    const stale = await app.call('/api/diagnosis/diagnose-single', token, 'POST', diagnosisItem('tc_stale', 'exec_new', 'exec_old'));
    assert.equal(stale.status, 400);
    assert.match(stale.json.error.message, /Stale or mismatched evidence/);

    const staleBatch = await app.call('/api/diagnosis/diagnose-batch', token, 'POST', { items: [diagnosisItem('tc_1'), diagnosisItem('tc_2', 'exec_new', 'exec_old')] });
    assert.equal(staleBatch.status, 400);

    const tooMany = await app.call('/api/diagnosis/diagnose-batch', token, 'POST', { items: Array.from({ length: 21 }, (_, i) => diagnosisItem(`tc_${i}`)) });
    assert.equal(tooMany.status, 400);
    const atLimit = await app.call('/api/diagnosis/diagnose-batch', token, 'POST', { items: Array.from({ length: 20 }, (_, i) => diagnosisItem(`tc_${i}`)) });
    assert.equal(atLimit.status, 200);
    assert.equal(atLimit.json.results.length, 20);
    for (const result of atLimit.json.results) assert.equal(result.executionId, `exec_${result.testCaseId}`);
  } finally {
    await app.close();
  }

  const { DiagnosisService } = await import('../src/services/diagnosis.service.js');
  let calls = 0;
  const flaky = new MockAiProvider();
  flaky.diagnose = async (evidence) => {
    calls += 1;
    if (calls === 2) throw new Error(`provider exploded with ${KEY_A}`);
    return MockAiProvider.prototype.diagnose.call(flaky, evidence);
  };
  const batch = await new DiagnosisService(flaky).diagnoseBatch([diagnosisItem('a'), diagnosisItem('b'), diagnosisItem('c')] as never);
  assert.deepEqual(batch.results.map((r) => r.testCaseId), ['a', 'c']);
  assert.deepEqual(batch.failures?.map((f) => f.testCaseId), ['b']);
  assert.equal(JSON.stringify(batch).includes(KEY_A), false);
});

test('diagnosis evidence sent to Gemini is redacted', async () => {
  const originalFetch = globalThis.fetch;
  let body = '';
  try {
    globalThis.fetch = async (_input, init) => { body = String(init?.body); return new Response('{}', { status: 500 }); };
    const { DiagnosisService } = await import('../src/services/diagnosis.service.js');
    const item = diagnosisItem('tc_redact');
    item.executionResult.response.headers = { 'content-type': 'application/json', authorization: 'Bearer live-token-123', 'set-cookie': 'sid=abc' } as never;
    await new DiagnosisService(new GoogleAiProvider(KEY_B, 'm')).diagnoseSingle(item.testCase as never, item.executionResult as never, item.validationResult as never);
    assert.ok(body);
    for (const secret of [KEY_A, 'live-token-123', 'sid=abc']) assert.equal(body.includes(secret), false, secret);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mock provider is unaffected for unauthenticated controller usage (no session)', async () => {
  const store = new AiCredentialStore();
  assert.equal(store.resolveProvider(undefined).name, 'mock');
  assert.equal(store.status(undefined).configured, false);
});

test('report output carries only sanitized diagnosis content and safe provenance metadata', async () => {
  const { ReportService } = await import('../src/services/report.service.js');
  const report = new ReportService().generateReport({
    specification: { metadata: { title: 'Users', version: '1' }, servers: [] },
    tests: [{ id: 't1', name: 'get user', type: 'POSITIVE', priority: 'HIGH', enabled: true, endpoint: { method: 'GET', path: '/users/{id}' } }],
    executionResults: [{ testCaseId: 't1', executionId: 'e1', status: 'PASSED_EXECUTION', durationMs: 5, httpStatus: 404 }],
    validationResults: [{ testCaseId: 't1', executionId: 'e1', status: 'VALIDATION_FAILED', durationMs: 1, assertions: [{ category: 'STATUS_CODE', path: '$.status', expected: '200', actual: '404', passed: false, message: 'mismatch' }] }],
    diagnosisResults: [{ diagnosisId: 'd1', testCaseId: 't1', executionId: 'e1', durationMs: 2, confidence: 'LOW', summary: `Use key ${KEY_A} and Bearer tok-777`, findings: [{ severity: 'ERROR' }], provider: 'mock', providerStatus: 'fallback' }],
  } as never);
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes(KEY_A), false);
  assert.equal(serialized.includes('tok-777'), false);
  assert.equal(report.failures[0].aiProvider, 'mock');
  assert.equal(report.failures[0].aiProviderStatus, 'fallback');
  // AI output never changes deterministic counts.
  assert.equal(report.validation.validationFailed, 1);
  assert.equal(report.execution.passedExecution, 1);

  assert.throws(() => new ReportService().generateReport({
    specification: { metadata: { title: 'Users', version: '1' }, servers: [] },
    tests: [{ id: 't1', name: 'get user', type: 'POSITIVE', priority: 'HIGH', enabled: true, endpoint: { method: 'GET', path: '/users/{id}' } }],
    executionResults: [{ testCaseId: 't1', executionId: 'e1', status: 'PASSED_EXECUTION', durationMs: 5 }],
    validationResults: [],
    diagnosisResults: [{ diagnosisId: 'd1', testCaseId: 't1', executionId: 'e-stale', durationMs: 2, confidence: 'LOW', summary: 's', findings: [] }],
  } as never), /matching execution result/);
});

test('key format accepts classic AIza keys and newer dotted Google keys, rejects junk', () => {
  for (const key of [KEY_A, 'AQ.Ab8RN6TESTKEYabcdefghijklmnop_-123456']) assert.doesNotThrow(() => AiCredentialStore.assertKeyFormat(key));
  for (const key of ['short', 'has space in the middle of key 1234567', '"AIzaSyQuotedKeyxxxxxxxxxxxxxxxxxx"']) assert.throws(() => AiCredentialStore.assertKeyFormat(key));
});
