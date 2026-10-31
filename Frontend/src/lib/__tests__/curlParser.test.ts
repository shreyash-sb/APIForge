import { describe, it, expect } from 'vitest';
import { parseCurlCommand, parsePostmanCollection } from '../curlParser';
import { generateCurlSnippet, generateFetchSnippet, generateJavaSnippet, generatePythonSnippet } from '../codeGenerators';

describe('curlParser and codeGenerators', () => {
  it('parses a full cURL command with method, url, headers, and body', () => {
    const cmd = `curl -X POST "https://api.example.com/items?limit=10" -H "Content-Type: application/json" -H "Authorization: Bearer token123" -d '{"name": "Widget"}'`;
    const parsed = parseCurlCommand(cmd);

    expect(parsed.method).toBe('POST');
    expect(parsed.url).toContain('https://api.example.com/items');
    expect(parsed.headers.some((h) => h.key === 'Content-Type' && h.value === 'application/json')).toBe(true);
    expect(parsed.headers.some((h) => h.key === 'Authorization' && h.value === 'Bearer token123')).toBe(true);
    expect(parsed.queryParams.some((q) => q.key === 'limit' && q.value === '10')).toBe(true);
    expect(parsed.body).toBe('{"name": "Widget"}');
  });

  it('parses Postman collection v2.1 json string', () => {
    const collection = JSON.stringify({
      info: { name: 'Sample' },
      item: [
        {
          name: 'Get Orders',
          request: {
            method: 'GET',
            url: { raw: 'https://api.example.com/orders' },
            header: [{ key: 'Accept', value: 'application/json' }],
          },
        },
      ],
    });

    const items = parsePostmanCollection(collection);
    expect(items.length).toBe(1);
    expect(items[0].name).toBe('Get Orders');
    expect(items[0].method).toBe('GET');
    expect(items[0].url).toBe('https://api.example.com/orders');
    expect(items[0].headers[0].key).toBe('Accept');
  });

  it('generates multi-language code snippets accurately', () => {
    const opt = {
      method: 'POST' as const,
      url: 'https://api.example.com/users',
      queryParams: [{ id: '1', key: 'ref', value: 'promo', enabled: true }],
      headers: [{ id: '2', key: 'Content-Type', value: 'application/json', enabled: true }],
      auth: { type: 'bearer' as const, token: 'secret-xyz' },
      body: '{"username": "alice"}',
    };

    const curl = generateCurlSnippet(opt);
    expect(curl).toContain('curl -X POST');
    expect(curl).toContain('https://api.example.com/users?ref=promo');
    expect(curl).toContain('Authorization: Bearer secret-xyz');

    const js = generateFetchSnippet(opt);
    expect(js).toContain('fetch("https://api.example.com/users?ref=promo"');
    expect(js).toContain('method: "POST"');

    const py = generatePythonSnippet(opt);
    expect(py).toContain('requests.post');
    expect(py).toContain('import requests');
  });
});

describe('curl import query handling', () => {
  it('moves the query string into params so nothing is sent twice', () => {
    const parsed = parseCurlCommand(`curl 'http://127.0.0.1:4010/echo?source=curl&page=2'`);
    expect(parsed.url).toBe('http://127.0.0.1:4010/echo');
    expect(parsed.queryParams.map(({ key, value }) => [key, value])).toEqual([['source', 'curl'], ['page', '2']]);
  });
});

describe('code snippets are runnable and injection-safe', () => {
  const tricky = {
    method: 'PATCH' as const,
    url: 'https://api.example.test/echo',
    queryParams: [],
    headers: [{ id: 'h', key: 'X-Note', value: `it's "q" $HOME \`t\``, enabled: true }],
    auth: { type: 'basic' as const, username: 'u', password: 'p' },
    body: '{"ok":true,"none":null,"s":"$HOME `x`"}',
  };

  it('quotes shell values so $ and backticks are never interpreted', () => {
    const curl = generateCurlSnippet(tricky);
    expect(curl).toContain(`-H 'X-Note: it'\\''s "q" $HOME \`t\`'`);
    expect(curl).toContain(`--data-raw '{"ok":true,"none":null,"s":"$HOME \`x\`"}'`);
    expect(curl).toContain(`Authorization: Basic ${btoa('u:p')}`);
  });

  it('keeps JSON literals valid in Python and sends non-JSON bodies verbatim', () => {
    const py = generatePythonSnippet(tricky);
    expect(py).toContain('import json');
    expect(py).toContain('payload = json.loads(');
    expect(py).toContain('requests.patch(url, headers=headers, json=payload)');
    expect(generatePythonSnippet({ ...tricky, body: 'a=1&b=2' })).toContain('data = "a=1&b=2"');
  });

  it('generates compilable Java for every verb (no backtick strings, no PATCH()/GET(body))', () => {
    const java = generateJavaSnippet(tricky);
    expect(java).not.toContain('`{');
    expect(java).toContain('.method("PATCH", HttpRequest.BodyPublishers.ofString(');
    expect(generateJavaSnippet({ ...tricky, method: 'GET', body: '' })).toContain('.method("GET", HttpRequest.BodyPublishers.noBody())');
  });

  it('sends a non-JSON fetch body as-is rather than a JSON-quoted string', () => {
    expect(generateFetchSnippet({ ...tricky, body: '<a/>' })).toContain('body: "<a/>",');
  });
});
