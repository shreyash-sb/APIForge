import type { HttpMethod, Header, QueryParam } from '@/types/request.types';

export interface ParsedCurl {
  method: HttpMethod;
  url: string;
  queryParams: QueryParam[];
  headers: Header[];
  body: string;
}

/**
 * Parses a standard cURL command into RequestBuilder fields.
 */
export function parseCurlCommand(rawCommand: string): ParsedCurl {
  const trimmed = rawCommand.trim();
  let method: HttpMethod = 'GET';
  let url = '';
  const headers: Header[] = [];
  const queryParams: QueryParam[] = [];
  let body = '';

  // Clean shell continuation characters (backslashes and newlines)
  const cleaned = trimmed.replace(/\\\r?\n/g, ' ').replace(/\s+/g, ' ');

  // Extract explicit method: -X POST, --request POST
  const methodMatch = cleaned.match(/(?:-X|--request)\s+([A-Za-z]+)/i);
  if (methodMatch && methodMatch[1]) {
    const m = methodMatch[1].toUpperCase() as HttpMethod;
    if (['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE'].includes(m)) {
      method = m;
    }
  }

  // Extract Headers: -H "Key: Value" or -H 'Key: Value' or --header "..."
  const headerRegex = /(?:-H|--header)\s+["']([^"']+)["']/gi;
  let headerMatch: RegExpExecArray | null;
  while ((headerMatch = headerRegex.exec(cleaned)) !== null) {
    const rawHeader = headerMatch[1];
    const colonIdx = rawHeader.indexOf(':');
    if (colonIdx > 0) {
      const key = rawHeader.slice(0, colonIdx).trim();
      const value = rawHeader.slice(colonIdx + 1).trim();
      headers.push({
        id: crypto.randomUUID(),
        key,
        value,
        enabled: true,
      });
    }
  }

  // Extract Body: -d "...", -d '...', --data "...", --data '...', etc.
  const bodyMatch = cleaned.match(/(?:-d|--data|--data-raw|--data-binary)\s+(?:'([^']*)'|"([^"]*)")/i);
  if (bodyMatch) {
    body = bodyMatch[1] ?? bodyMatch[2] ?? '';
    // If no explicit method was set but body is present, default to POST
    if (!methodMatch) {
      method = 'POST';
    }
  }

  // Extract URL: usually begins with http:// or https:// or quoted URL
  // Exclude arguments following -X, -H, -d, -u
  const tokens = cleaned.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.startsWith('http://') || token.startsWith('https://')) {
      url = token.replace(/["';]/g, '');
      break;
    }
    // Also support quoted URLs like "https://..." or 'https://...'
    const unquoted = token.replace(/^["']|["']$/g, '');
    if (unquoted.startsWith('http://') || unquoted.startsWith('https://')) {
      url = unquoted;
      break;
    }
  }

  // If URL has query parameters, parse them out
  if (url.includes('?')) {
    try {
      const parsedUrl = new URL(url);
      parsedUrl.searchParams.forEach((val, key) => {
        queryParams.push({
          id: crypto.randomUUID(),
          key,
          value: val,
          enabled: true,
        });
      });
    } catch {
      // Keep URL as-is if URL constructor fails
    }
  }

  return { method, url, queryParams, headers, body };
}

export interface PostmanRequestItem {
  name: string;
  method: HttpMethod;
  url: string;
  headers: Header[];
  body: string;
}

/**
 * Parses Postman Collection v2.1 JSON into RequestBuilder items.
 */
export function parsePostmanCollection(jsonString: string): PostmanRequestItem[] {
  const result: PostmanRequestItem[] = [];
  try {
    const data = JSON.parse(jsonString);
    const extractItems = (items: unknown[]) => {
      if (!Array.isArray(items)) return;
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const it = item as Record<string, unknown>;
        if (it.item && Array.isArray(it.item)) {
          extractItems(it.item);
        } else if (it.request && typeof it.request === 'object') {
          const req = it.request as Record<string, unknown>;
          const rawMethod = (typeof req.method === 'string' ? req.method.toUpperCase() : 'GET') as HttpMethod;
          const method: HttpMethod = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE'].includes(rawMethod)
            ? rawMethod
            : 'GET';

          let rawUrl = '';
          if (typeof req.url === 'string') {
            rawUrl = req.url;
          } else if (req.url && typeof req.url === 'object') {
            const urlObj = req.url as Record<string, unknown>;
            rawUrl = typeof urlObj.raw === 'string' ? urlObj.raw : '';
          }

          const parsedHeaders: Header[] = [];
          if (Array.isArray(req.header)) {
            for (const h of req.header) {
              if (h && typeof h === 'object') {
                const hObj = h as Record<string, unknown>;
                parsedHeaders.push({
                  id: crypto.randomUUID(),
                  key: String(hObj.key || ''),
                  value: String(hObj.value || ''),
                  enabled: hObj.disabled !== true,
                });
              }
            }
          }

          let rawBody = '';
          if (req.body && typeof req.body === 'object') {
            const bObj = req.body as Record<string, unknown>;
            if (typeof bObj.raw === 'string') {
              rawBody = bObj.raw;
            }
          }

          result.push({
            name: typeof it.name === 'string' ? it.name : 'Postman Request',
            method,
            url: rawUrl,
            headers: parsedHeaders,
            body: rawBody,
          });
        }
      }
    };

    if (Array.isArray(data.item)) {
      extractItems(data.item);
    }
  } catch {
    // Return empty list on parse failure
  }

  return result;
}
