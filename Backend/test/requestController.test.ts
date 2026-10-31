import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Request, Response } from 'express';
import { RequestController } from '../src/controllers/request.controller.js';

function createResponse() {
  const result: { statusCode?: number; body?: unknown } = {};
  const response = {
    status(code: number) {
      result.statusCode = code;
      return this;
    },
    json(body: unknown) {
      result.body = body;
      return this;
    },
  } as unknown as Response;
  return { result, response };
}

async function invoke(body: unknown) {
  const { result, response } = createResponse();
  await new RequestController().executeRequest({ body } as Request, response);
  return result;
}

test('RequestController rejects absent, null, and incomplete payloads as client errors', async () => {
  for (const body of [
    undefined,
    null,
    [],
    {},
    { method: 'GET' },
    { url: 'https://controlled.test' },
    { method: 7, url: 'https://controlled.test' },
    { method: 'GET', url: 7 },
    { method: ' ', url: 'https://controlled.test' },
  ]) {
    const result = await invoke(body);
    assert.equal(result.statusCode, 400, `body ${JSON.stringify(body)} should be rejected with 400`);
    assert.equal((result.body as { success: boolean }).success, false);
  }
});

test('RequestController dispatches a valid request and returns parsed response evidence', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  try {
    globalThis.fetch = async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({ controlled: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const result = await invoke({
      method: 'GET',
      url: 'https://controlled.test/health',
      headers: [],
      queryParams: [],
      auth: { type: 'none' },
      body: '',
    });

    assert.equal(result.statusCode, 200);
    assert.equal(requestedUrl, 'https://controlled.test/health');
    assert.deepEqual((result.body as { body: unknown }).body, { controlled: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
