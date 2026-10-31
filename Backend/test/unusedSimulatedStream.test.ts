import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { test } from 'node:test';

const exists = async (path: string) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

test('the unused canned AI chat stream is removed without removing other SSE workflows', async () => {
  const serverEntry = await readFile('src/index.ts', 'utf8');
  const assistantPage = await readFile('../Frontend/src/pages/AI/AIAssistantPage.tsx', 'utf8');
  const requestBuilder = await readFile('../Frontend/src/pages/RequestBuilder/RequestBuilderPage.tsx', 'utf8');

  assert.equal(serverEntry.includes("from './routes/stream.routes.js'"), false);
  assert.equal(serverEntry.includes("app.use('/api/stream'"), false);
  assert.equal(await exists('src/routes/stream.routes.ts'), false);
  assert.equal(await exists('src/controllers/stream.controller.ts'), false);
  assert.equal(await exists('../Frontend/src/hooks/useSSEChat.ts'), false);

  assert.match(assistantPage, /askAssistant\(/);
  assert.doesNotMatch(assistantPage, /useSSEChat/);
  assert.match(requestBuilder, /new EventSource\(url\)/);
  // The keyword-based agent workspace (and its task stream) was removed in favour of the real tools.
  assert.equal(serverEntry.includes("app.use('/api/agent'"), false);
  assert.equal(await exists('src/routes/agent.routes.ts'), false);
});
