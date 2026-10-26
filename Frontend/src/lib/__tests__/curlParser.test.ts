import { describe, it, expect } from 'vitest';
import { parseCurlCommand, parsePostmanCollection } from '../curlParser';
import { generateCurlSnippet, generateFetchSnippet, generatePythonSnippet } from '../codeGenerators';

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
