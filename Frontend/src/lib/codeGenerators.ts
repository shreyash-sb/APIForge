import type { HttpMethod, Header, QueryParam, Auth } from '@/types/request.types';

export interface CodeGenOptions {
  method: HttpMethod;
  url: string;
  queryParams: QueryParam[];
  headers: Header[];
  auth: Auth;
  body: string;
}

export function buildFullUrl(url: string, params: QueryParam[]): string {
  const activeParams = params.filter((p) => p.enabled && p.key.trim());
  if (!activeParams.length) return url;
  try {
    const u = new URL(url.startsWith('http') ? url : `http://localhost${url.startsWith('/') ? '' : '/'}${url}`);
    activeParams.forEach((p) => u.searchParams.set(p.key, p.value));
    return url.startsWith('http') ? u.toString() : `${url}?${u.searchParams.toString()}`;
  } catch {
    const qs = activeParams.map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
    return `${url}${url.includes('?') ? '&' : '?'}${qs}`;
  }
}

// ── Shared helpers ─────────────────────────────────────────────────────────
// Every snippet must be runnable as generated: same headers/auth/body as the request,
// with values escaped for the target language so quotes, `$`, or backticks cannot
// break (or inject into) the code.

const BODY_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/** A double-quoted literal valid in JavaScript, Python, Go, and Java. */
const str = (value: string) => JSON.stringify(value);

/** POSIX shell single-quoting: nothing inside is interpreted. */
const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

function base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function snippetUrl(opt: CodeGenOptions): string {
  const params = [...opt.queryParams];
  if (opt.auth.type === 'apikey' && opt.auth.addTo === 'query' && opt.auth.key.trim()) {
    params.push({ id: 'auth', key: opt.auth.key, value: opt.auth.value, enabled: true });
  }
  return buildFullUrl(opt.url || 'https://api.example.com', params);
}

/** User headers plus the configured authentication, in sending order. */
function snippetHeaders(opt: CodeGenOptions): Array<[string, string]> {
  const headers: Array<[string, string]> = opt.headers
    .filter((h) => h.enabled && h.key.trim())
    .map((h) => [h.key, h.value]);
  if (opt.auth.type === 'bearer' && opt.auth.token.trim()) {
    headers.push(['Authorization', `Bearer ${opt.auth.token.trim()}`]);
  } else if (opt.auth.type === 'basic' && (opt.auth.username || opt.auth.password)) {
    headers.push(['Authorization', `Basic ${base64(`${opt.auth.username}:${opt.auth.password}`)}`]);
  } else if (opt.auth.type === 'apikey' && opt.auth.addTo === 'header' && opt.auth.key.trim()) {
    headers.push([opt.auth.key, opt.auth.value]);
  }
  return headers;
}

/** The body exactly as written, plus its parsed JSON when it is valid JSON. */
function snippetBody(opt: CodeGenOptions): { raw: string; isJson: boolean } | undefined {
  if (!BODY_METHODS.includes(opt.method) || !opt.body.trim()) return undefined;
  try {
    JSON.parse(opt.body);
    return { raw: opt.body, isJson: true };
  } catch {
    return { raw: opt.body, isJson: false };
  }
}

export function generateCurlSnippet(opt: CodeGenOptions): string {
  const parts: string[] = [`curl -X ${opt.method} ${shellQuote(snippetUrl(opt))}`];
  for (const [key, value] of snippetHeaders(opt)) parts.push(`  -H ${shellQuote(`${key}: ${value}`)}`);
  const body = snippetBody(opt);
  if (body) parts.push(`  --data-raw ${shellQuote(body.raw)}`);
  return parts.join(' \\\n');
}

export function generateFetchSnippet(opt: CodeGenOptions): string {
  const headers = Object.fromEntries(snippetHeaders(opt));
  const body = snippetBody(opt);
  const bodyLine = body
    ? body.isJson
      ? `\n  body: JSON.stringify(${JSON.stringify(JSON.parse(body.raw), null, 2).replace(/\n/g, '\n  ')}),`
      : `\n  body: ${str(body.raw)},`
    : '';
  return `const response = await fetch(${str(snippetUrl(opt))}, {
  method: ${str(opt.method)},
  headers: ${JSON.stringify(headers, null, 2).replace(/\n/g, '\n  ')},${bodyLine}
});
const text = await response.text();
console.log(response.status, text);`;
}

export function generatePythonSnippet(opt: CodeGenOptions): string {
  const body = snippetBody(opt);
  const lines = ['import requests'];
  if (body?.isJson) lines.push('import json');
  lines.push('', `url = ${str(snippetUrl(opt))}`);
  const headers = snippetHeaders(opt);
  lines.push(headers.length ? `headers = {\n${headers.map(([k, v]) => `    ${str(k)}: ${str(v)},`).join('\n')}\n}` : 'headers = {}');
  const method = opt.method.toLowerCase();
  const call = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)
    ? `requests.${method}(url`
    : `requests.request(${str(opt.method)}, url`;
  if (body?.isJson) {
    // json.loads keeps JSON literals (true/false/null) valid in Python.
    lines.push(`payload = json.loads(${str(body.raw)})`);
    lines.push(`response = ${call}, headers=headers, json=payload)`);
  } else if (body) {
    lines.push(`data = ${str(body.raw)}`);
    lines.push(`response = ${call}, headers=headers, data=data)`);
  } else {
    lines.push(`response = ${call}, headers=headers)`);
  }
  lines.push('print(response.status_code)');
  lines.push('print(response.text)');
  return lines.join('\n');
}

export function generateGoSnippet(opt: CodeGenOptions): string {
  const body = snippetBody(opt);
  const headerLines = snippetHeaders(opt).map(([k, v]) => `    req.Header.Add(${str(k)}, ${str(v)})`).join('\n');
  return `package main

import (
    "fmt"
    "io"
    "net/http"${body ? '\n    "strings"' : ''}
)

func main() {
    url := ${str(snippetUrl(opt))}
${body ? `    payload := strings.NewReader(${str(body.raw)})
    req, err := http.NewRequest(${str(opt.method)}, url, payload)` : `    req, err := http.NewRequest(${str(opt.method)}, url, nil)`}
    if err != nil {
        panic(err)
    }
${headerLines ? `${headerLines}\n` : ''}
    res, err := http.DefaultClient.Do(req)
    if err != nil {
        panic(err)
    }
    defer res.Body.Close()

    body, _ := io.ReadAll(res.Body)
    fmt.Println(res.Status)
    fmt.Println(string(body))
}`;
}

export function generateJavaSnippet(opt: CodeGenOptions): string {
  const body = snippetBody(opt);
  const headerLines = snippetHeaders(opt).map(([k, v]) => `\n            .header(${str(k)}, ${str(v)})`).join('');
  // method(name, publisher) works for every verb; GET()/DELETE() take no body and PATCH() does not exist.
  const publisher = body ? `HttpRequest.BodyPublishers.ofString(${str(body.raw)})` : 'HttpRequest.BodyPublishers.noBody()';
  return `import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

public class ApiClient {
    public static void main(String[] args) throws Exception {
        HttpClient client = HttpClient.newHttpClient();
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(${str(snippetUrl(opt))}))${headerLines}
            .method(${str(opt.method)}, ${publisher})
            .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        System.out.println("Status: " + response.statusCode());
        System.out.println(response.body());
    }
}`;
}
