import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAiProvider, GoogleAiProvider } from '../src/services/aiProvider.service.js';
import type { SanitizedEvidence } from '../src/types/diagnosis.types.js';

const evidence: SanitizedEvidence = {
  testCase: {
    id: 'qa-case-1',
    name: 'synthetic diagnosis case',
    description: '',
    type: 'POSITIVE',
    priority: 'P2',
    endpoint: { method: 'GET', path: '/health' },
    expected: {},
  },
  execution: { status: 'FAILED_EXECUTION', durationMs: 1, error: 'synthetic test failure' },
  validation: {
    status: 'NOT_VALIDATABLE',
    summary: { totalAssertions: 0, passedAssertions: 0, failedAssertions: 0 },
    failedAssertions: [],
  },
};

test('GoogleAiProvider does not retry permanent 401 responses and labels fallback accurately', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls += 1;
      return new Response('unauthorized', { status: 401 });
    };

    const result = await new GoogleAiProvider('qa-placeholder-key', 'qa-model').diagnose(evidence);

    assert.equal(calls, 1);
    assert.match(result.summary, /HTTP 401/);
    assert.doesNotMatch(result.summary, /503|high demand/i);
    assert.equal(result.findings.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

const validGeminiResponse = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ confidence: 'HIGH', summary: 'The request failed because the local service was unreachable.', findings: [{ title: 'Connection failed', explanation: 'The synthetic execution evidence reports a connection failure.', severity: 'ERROR', suggestion: 'Check service availability.', relatedAssertionId: null }] }) }] } }] }), { status: 200 });

test('Gemini provider factory requires a key only when the Gemini provider is selected', () => {
  const oldProvider = process.env.AI_PROVIDER;
  const oldKey = process.env.GEMINI_API_KEY;
  try {
    process.env.AI_PROVIDER = 'mock';
    delete process.env.GEMINI_API_KEY;
    assert.equal(createAiProvider().name, 'mock');
    process.env.AI_PROVIDER = 'google-gemini';
    assert.throws(() => createAiProvider(), /GEMINI_API_KEY is required/);
  } finally {
    if (oldProvider === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = oldProvider;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey;
  }
});

test('Gemini diagnosis accepts valid structured JSON and preserves evidence-consistent summary', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let requestUrl = '';
  let requestPayload: Record<string, any> | undefined;
  try {
    globalThis.fetch = async (input, init) => {
      calls += 1;
      requestUrl = String(input);
      requestPayload = JSON.parse(String(init?.body)) as Record<string, any>;
      return validGeminiResponse();
    };
    const result = await new GoogleAiProvider('qa-placeholder-key', 'qa-model').diagnose(evidence);
    assert.equal(calls, 1);
    assert.match(requestUrl, /models\/qa-model:generateContent/);
    assert.equal(requestPayload?.generationConfig?.responseMimeType, 'application/json');
    assert.equal(requestPayload?.generationConfig?.maxOutputTokens, 2048);
    assert.match(requestPayload?.contents?.[0]?.parts?.[0]?.text, /GET \/health/);
    assert.equal(result.confidence, 'HIGH');
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].severity, 'ERROR');
    assert.match(result.summary, /local service was unreachable/);
  } finally { globalThis.fetch = originalFetch; }
});

test('Gemini retries one transient 429, then returns provider result on recovery', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => ++calls === 1 ? new Response('{}', { status: 429 }) : validGeminiResponse();
    const result = await new GoogleAiProvider('qa-placeholder-key', 'qa-model').diagnose(evidence);
    assert.equal(calls, 2);
    assert.match(result.summary, /local service was unreachable/);
  } finally { globalThis.fetch = originalFetch; }
});

test('Gemini rate limit after retry falls back with HTTP status evidence', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => { calls += 1; return new Response('{}', { status: 429 }); };
    const result = await new GoogleAiProvider('qa-placeholder-key', 'qa-model').diagnose(evidence);
    assert.equal(calls, 2);
    assert.match(result.summary, /rate limit or quota exhausted \(HTTP 429\); deterministic fallback used/);
  } finally { globalThis.fetch = originalFetch; }
});

test('Gemini network failure retries once and uses deterministic fallback', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => { calls += 1; throw new TypeError('synthetic network failure'); };
    const result = await new GoogleAiProvider('qa-placeholder-key', 'qa-model').diagnose(evidence);
    assert.equal(calls, 2);
    assert.match(result.summary, /Gemini network request failed; deterministic fallback used/);
  } finally { globalThis.fetch = originalFetch; }
});

test('Gemini timeout retries once and uses deterministic fallback', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => { calls += 1; throw new DOMException('synthetic timeout', 'TimeoutError'); };
    const result = await new GoogleAiProvider('qa-placeholder-key', 'qa-model').diagnose(evidence);
    assert.equal(calls, 2);
    assert.match(result.summary, /Gemini request timed out; deterministic fallback used/);
  } finally { globalThis.fetch = originalFetch; }
});

test('Gemini malformed outer JSON and invalid structured payload use deterministic fallback', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('{invalid', { status: 200 });
    const provider = new GoogleAiProvider('qa-placeholder-key', 'qa-model');
    const malformed = await provider.diagnose(evidence);
    assert.match(malformed.summary, /deterministic fallback used/);
    assert.equal(malformed.findings.length, 1);

    globalThis.fetch = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ confidence: 72, summary: 12, findings: {} }) }] } }] }), { status: 200 });
    const invalidShape = await provider.diagnose(evidence);
    assert.match(invalidShape.summary, /deterministic fallback used/);
    assert.equal(invalidShape.findings.length, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('Gemini assistant labels mock fallback on credential rejection without leaking provider body', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => { calls += 1; return new Response('synthetic private provider error', { status: 401 }); };
    const reply = await new GoogleAiProvider('qa-placeholder-key', 'qa-model').assist('Explain a 404');
    assert.equal(calls, 1);
    assert.match(reply, /Mock\/demo response/);
    assert.doesNotMatch(reply, /synthetic private provider error/);
  } finally { globalThis.fetch = originalFetch; }
});

test('Gemini assistant returns bounded provider text on a successful response', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'A 404 means the requested resource was not found.' }] } }] }), { status: 200 });
    };
    const reply = await new GoogleAiProvider('qa-placeholder-key', 'qa-model').assist('What does 404 mean?');
    assert.equal(calls, 1);
    assert.match(reply, /resource was not found/);
    assert.doesNotMatch(reply, /Mock\/demo response/);
  } finally { globalThis.fetch = originalFetch; }
});

test('Gemini assistant falls back on timeout and malformed provider JSON', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => { calls += 1; throw new DOMException('synthetic timeout', 'TimeoutError'); };
    const provider = new GoogleAiProvider('qa-placeholder-key', 'qa-model');
    assert.match(await provider.assist('What does 404 mean?'), /Mock\/demo response/);
    assert.equal(calls, 1);

    globalThis.fetch = async () => { calls += 1; return new Response('{invalid', { status: 200 }); };
    assert.match(await provider.assist('What does 404 mean?'), /Mock\/demo response/);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = originalFetch; }
});


test('Gemini diagnosis classifies authorization and provider failures without retries or secret leakage', async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const [status, label] of [[403, 'Gemini authorization failed'], [500, 'Gemini provider unavailable']] as const) {
      let calls = 0;
      const providerKey = 'synthetic-secret-must-not-appear';
      globalThis.fetch = async () => { calls += 1; return new Response(providerKey, { status }); };
      const result = await new GoogleAiProvider(providerKey, 'qa-model').diagnose(evidence);
      assert.equal(calls, 1);
      assert.ok(result.summary.includes(`${label} (HTTP ${status})`), result.summary);
      assert.doesNotMatch(result.summary, new RegExp(providerKey));
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('Gemini assistant classifies provider HTTP and transport failures without exposing response bodies', async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const [status, label] of [[401, 'Gemini authentication failed'], [403, 'Gemini authorization failed'], [429, 'Gemini rate limit or quota exhausted'], [503, 'Gemini provider unavailable']] as const) {
      globalThis.fetch = async () => new Response('private-provider-body', { status });
      const reply = await new GoogleAiProvider('safe-test-key', 'qa-model').assist('Explain 404');
      assert.ok(reply.includes(`${label} (HTTP ${status})`), reply);
      assert.doesNotMatch(reply, /private-provider-body|safe-test-key/);
    }
    globalThis.fetch = async () => { throw new DOMException('synthetic timeout', 'TimeoutError'); };
    assert.match(await new GoogleAiProvider('safe-test-key', 'qa-model').assist('Explain 404'), /request timed out/);
    globalThis.fetch = async () => { throw new TypeError('synthetic network error'); };
    assert.match(await new GoogleAiProvider('safe-test-key', 'qa-model').assist('Explain 404'), /network request failed/);
  } finally { globalThis.fetch = originalFetch; }
});

test('Gemini 3+ requests ask for low thinking; older models get no thinking field', async () => {
  const { thinkingConfigFor } = await import('../src/services/aiProvider.service.js');
  assert.deepEqual(thinkingConfigFor('gemini-3.5-flash'), { thinkingLevel: 'low' });
  assert.deepEqual(thinkingConfigFor('gemini-3.8-flash'), { thinkingLevel: 'low' });
  assert.equal(thinkingConfigFor('gemini-2.5-flash'), undefined);
  assert.equal(thinkingConfigFor('custom-model'), undefined);

  const originalFetch = globalThis.fetch;
  const bodies: Array<Record<string, any>> = [];
  try {
    globalThis.fetch = async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), { status: 200 });
    };
    await new GoogleAiProvider('qa-placeholder-key', 'gemini-3.5-flash').assist('q');
    await new GoogleAiProvider('qa-placeholder-key', 'gemini-2.5-flash').assist('q');
    assert.deepEqual(bodies[0].generationConfig.thinkingConfig, { thinkingLevel: 'low' });
    assert.equal(bodies[1].generationConfig.thinkingConfig, undefined);
  } finally { globalThis.fetch = originalFetch; }
});

test('Gemini answer skips thought parts, flags truncation, and falls back when the budget is spent thinking', async () => {
  const originalFetch = globalThis.fetch;
  try {
    const provider = new GoogleAiProvider('qa-placeholder-key', 'gemini-3.5-flash');
    globalThis.fetch = async () => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'internal reasoning', thought: true }, { text: 'Visible ' }, { text: 'answer.' }] } }] }), { status: 200 });
    const visible = await provider.assistDetailed({ message: 'q' });
    assert.equal(visible.text, 'Visible answer.');
    assert.equal(visible.providerStatus, 'live');

    globalThis.fetch = async () => new Response(JSON.stringify({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'Partial' }] } }] }), { status: 200 });
    const cut = await provider.assistDetailed({ message: 'q' });
    assert.match(cut.text, /^Partial/);
    assert.match(cut.text, /cut off at the length limit/);

    globalThis.fetch = async () => new Response(JSON.stringify({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }] }), { status: 200 });
    const empty = await provider.assistDetailed({ message: 'q' });
    assert.equal(empty.providerStatus, 'fallback');
    assert.match(empty.fallbackReason ?? '', /whole output budget/);
  } finally { globalThis.fetch = originalFetch; }
});
