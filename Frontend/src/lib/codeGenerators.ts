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

export function generateCurlSnippet(opt: CodeGenOptions): string {
  const fullUrl = buildFullUrl(opt.url || 'https://api.example.com', opt.queryParams);
  const parts: string[] = [`curl -X ${opt.method} "${fullUrl}"`];

  // Headers
  opt.headers
    .filter((h) => h.enabled && h.key.trim())
    .forEach((h) => {
      parts.push(`  -H "${h.key}: ${h.value}"`);
    });

  // Auth
  if (opt.auth.type === 'bearer' && opt.auth.token) {
    parts.push(`  -H "Authorization: Bearer ${opt.auth.token}"`);
  } else if (opt.auth.type === 'basic' && opt.auth.username) {
    parts.push(`  -u "${opt.auth.username}:${opt.auth.password}"`);
  } else if (opt.auth.type === 'apikey' && opt.auth.key) {
    if (opt.auth.addTo === 'header') {
      parts.push(`  -H "${opt.auth.key}: ${opt.auth.value}"`);
    }
  }

  // Body
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(opt.method) && opt.body.trim()) {
    const escaped = opt.body.replace(/"/g, '\\"');
    parts.push(`  -d "${escaped}"`);
  }

  return parts.join(' \\\n');
}

export function generateFetchSnippet(opt: CodeGenOptions): string {
  const fullUrl = buildFullUrl(opt.url || 'https://api.example.com', opt.queryParams);
  const headersObj: Record<string, string> = {};

  opt.headers
    .filter((h) => h.enabled && h.key.trim())
    .forEach((h) => {
      headersObj[h.key] = h.value;
    });

  if (opt.auth.type === 'bearer' && opt.auth.token) {
    headersObj['Authorization'] = `Bearer ${opt.auth.token}`;
  }

  const options: Record<string, unknown> = {
    method: opt.method,
    headers: headersObj,
  };

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(opt.method) && opt.body.trim()) {
    try {
      options.body = JSON.parse(opt.body);
    } catch {
      options.body = opt.body;
    }
  }

  return `const response = await fetch("${fullUrl}", {
  method: "${opt.method}",
  headers: ${JSON.stringify(headersObj, null, 4).replace(/\n/g, '\n  ')},
  ${options.body ? `body: JSON.stringify(${JSON.stringify(options.body, null, 2).replace(/\n/g, '\n  ')})` : ''}
});
const data = await response.json();
console.log(data);`;
}

export function generatePythonSnippet(opt: CodeGenOptions): string {
  const fullUrl = buildFullUrl(opt.url || 'https://api.example.com', opt.queryParams);
  const lines = ['import requests', ''];

  const headersObj: Record<string, string> = {};
  opt.headers
    .filter((h) => h.enabled && h.key.trim())
    .forEach((h) => {
      headersObj[h.key] = h.value;
    });

  if (opt.auth.type === 'bearer' && opt.auth.token) {
    headersObj['Authorization'] = `Bearer ${opt.auth.token}`;
  }

  lines.push(`url = "${fullUrl}"`);
  lines.push(`headers = ${JSON.stringify(headersObj, null, 4)}`);

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(opt.method) && opt.body.trim()) {
    lines.push(`payload = ${opt.body}`);
    lines.push(`response = requests.${opt.method.toLowerCase()}(url, headers=headers, json=payload)`);
  } else {
    lines.push(`response = requests.${opt.method.toLowerCase()}(url, headers=headers)`);
  }

  lines.push('print(response.status_code)');
  lines.push('print(response.json())');

  return lines.join('\n');
}

export function generateGoSnippet(opt: CodeGenOptions): string {
  const fullUrl = buildFullUrl(opt.url || 'https://api.example.com', opt.queryParams);
  const hasBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(opt.method) && opt.body.trim();

  return `package main

import (
    "fmt"
    "io"
    "net/http"
    ${hasBody ? '"strings"' : ''}
)

func main() {
    url := "${fullUrl}"
    ${hasBody ? `payload := strings.NewReader(\`${opt.body}\`)\n    req, _ := http.NewRequest("${opt.method}", url, payload)` : `req, _ := http.NewRequest("${opt.method}", url, nil)`}

    ${opt.headers
      .filter((h) => h.enabled && h.key.trim())
      .map((h) => `req.Header.Add("${h.key}", "${h.value}")`)
      .join('\n    ')}

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
  const fullUrl = buildFullUrl(opt.url || 'https://api.example.com', opt.queryParams);
  const hasBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(opt.method) && opt.body.trim();

  return `import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

public class ApiClient {
    public static void main(String[] args) throws Exception {
        HttpClient client = HttpClient.newHttpClient();
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create("${fullUrl}"))
            ${opt.headers
              .filter((h) => h.enabled && h.key.trim())
              .map((h) => `.header("${h.key}", "${h.value}")`)
              .join('\n            ')}
            .${opt.method}(${hasBody ? `HttpRequest.BodyPublishers.ofString(\`${opt.body}\`)` : 'HttpRequest.BodyPublishers.noBody()'})
            .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        System.out.println("Status: " + response.statusCode());
        System.out.println(response.body());
    }
}`;
}
