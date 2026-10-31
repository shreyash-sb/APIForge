import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { LookupFunction } from 'node:net';
import type {
  ApiRequest,
  ApiExecutionResult,
  ApiResponse,
  ApiErrorResponse,
  QueryParam,
} from '../types/request.types.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_HTTP_PAYLOAD_BYTES = 10 * 1024 * 1024;
type SafeAddress = { address: string; family: number };
type SafeRequestTransport = (url: URL, init: RequestInit, address: SafeAddress) => Promise<Response>;

export class RequestExecutorService {
  private readonly timeout: number;
  private readonly productionSafeMode: boolean;
  private readonly resolveHostname: (hostname: string) => Promise<SafeAddress[]>;
  private readonly safeRequestTransport?: SafeRequestTransport;

  constructor(
    timeout: number = DEFAULT_TIMEOUT_MS,
    productionSafeMode = process.env.NODE_ENV === 'production' || process.env.OUTBOUND_REQUEST_SAFE_MODE === 'true',
    resolveHostname: (hostname: string) => Promise<SafeAddress[]> = (hostname) => lookup(hostname, { all: true, verbatim: true }),
    safeRequestTransport?: SafeRequestTransport,
  ) {
    // A malformed environment value must not turn timeouts off (NaN/0).
    this.timeout = Number.isFinite(timeout) && timeout > 0
      ? Math.min(Math.floor(timeout), MAX_TIMEOUT_MS)
      : DEFAULT_TIMEOUT_MS;
    this.productionSafeMode = productionSafeMode;
    this.resolveHostname = resolveHostname;
    this.safeRequestTransport = safeRequestTransport;
  }

  async execute(request: ApiRequest, options: { timeoutMs?: number } = {}): Promise<ApiExecutionResult> {
    const startTime = Date.now();
    // Per-request timeout (e.g. the user's Settings value), bounded by the server maximum.
    const requested = Number(options.timeoutMs);
    const timeout = Number.isFinite(requested) && requested >= 1000 ? Math.min(Math.floor(requested), MAX_TIMEOUT_MS) : this.timeout;

    try {
      // Validate URL
      const validation = await this.validateRequest(request);
      if (validation && 'success' in validation) return validation;

      // Build URL with query parameters
      const url = this.buildUrl(request.url, request.queryParams, request.auth);

      // Build headers
      const headers = this.buildHeaders(request);

      // Prepare request body
      const methodUpper = request.method.toUpperCase();
      const hasBody = !['GET', 'HEAD'].includes(methodUpper) && request.body && request.body.trim() !== '';
      const requestBody = hasBody ? request.body : undefined;

      // AbortController for bounded timeouts
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      let response: Response;
      let text: string;
      try {
        const init: RequestInit = {
          method: request.method,
          headers,
          body: requestBody,
          signal: controller.signal,
          // Safe mode does not follow redirects without validating the next destination.
          redirect: this.productionSafeMode ? 'manual' : 'follow',
        };
        response = this.productionSafeMode
          ? await (this.safeRequestTransport ?? this.fetchPinnedRequest.bind(this))(new URL(url), init, validation?.safeAddress as SafeAddress)
          : await fetch(url, init);
        text = await response.text();
      } finally {
        // The timeout bounds both connection establishment and the response body.
        clearTimeout(timer);
      }

      const responseTime = Date.now() - startTime;

      // Extract headers into standard Record
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((val, key) => {
        responseHeaders[key] = val;
      });

      // Parse payload safely
      const contentType = response.headers.get('content-type') || '';
      let responseData: unknown = text;
      if (contentType.includes('application/json')) {
        try {
          responseData = JSON.parse(text);
        } catch {
          responseData = text;
        }
      }

      // Calculate response size
      const size = this.calculateSize(responseData);

      return {
        success: true,
        status: response.status,
        statusText: response.statusText,
        responseTime,
        headers: responseHeaders,
        body: responseData,
        size,
      } as ApiResponse;
    } catch (error) {
      return this.handleError(error, timeout);
    }
  }

  private async validateRequest(request: ApiRequest): Promise<{ safeAddress?: SafeAddress } | ApiErrorResponse | null> {
    // Validate URL
    try {
      const url = new URL(request.url);

      // Only allow HTTP and HTTPS
      if (!['http:', 'https:'].includes(url.protocol)) {
        return {
          success: false,
          error: {
            type: 'INVALID_URL',
            message: 'Only HTTP and HTTPS protocols are supported',
          },
        };
      }
      let safeAddress: SafeAddress | undefined;
      if (this.productionSafeMode) {
        safeAddress = await this.getSafeAddress(url.hostname) ?? undefined;
        if (!safeAddress) {
        return {
          success: false,
          error: {
            type: 'OUTBOUND_POLICY',
            message: 'This destination is blocked by the outbound-request policy',
          },
        };
        }
      }

      // Bodies are sent exactly as written: XML, form-encoded, plain text, and deliberately
      // malformed JSON (negative testing) are all legitimate. Only the type is checked.
      if (request.body !== undefined && request.body !== null && typeof request.body !== 'string') {
        return { success: false, error: { type: 'VALIDATION_ERROR', message: 'Request body must be a string.' } };
      }
      return this.productionSafeMode ? { safeAddress } : null;
    } catch (error) {
      return {
        success: false,
        error: {
          type: 'INVALID_URL',
          message: 'Invalid URL format',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }

  }

  private buildUrl(baseUrl: string, queryParams?: QueryParam[], auth?: ApiRequest['auth']): string {
    const url = new URL(baseUrl);
    const enabledParams = queryParams?.filter((p) => p.enabled) ?? [];

    enabledParams.forEach((param) => {
      url.searchParams.append(param.key, param.value);
    });

    // set() preserves unrelated URL/query parameters and prevents duplicate key values.
    if (auth?.type === 'apikey' && auth.addTo === 'query' && auth.key.trim()) {
      url.searchParams.set(auth.key, auth.value);
    }

    return url.toString();
  }

  private async getSafeAddress(hostname: string): Promise<SafeAddress | null> {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (host === 'localhost' || host.endsWith('.localhost')) return null;

    let addresses: Array<{ address: string; family: number }>;
    if (isIP(host)) addresses = [{ address: host, family: isIP(host) }];
    else {
      try { addresses = await this.resolveHostname(host); }
      catch { return null; }
    }
    // Block the entire hostname if any answer is non-public, avoiding selection of a
    // public answer from a mixed public/private DNS response.
    if (addresses.length === 0 || addresses.some(({ address }) => isNonPublicAddress(address))) return null;
    return addresses[0];
  }

  private async fetchPinnedRequest(url: URL, init: RequestInit, address: SafeAddress): Promise<Response> {
    if (!address) throw new Error('Safe outbound request requires a validated destination address.');
    if (init.signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
    const requestFn = url.protocol === 'https:' ? httpsRequest : httpRequest;
    return new Promise<Response>((resolve, reject) => {
      const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
        if (typeof options === 'object' && options.all) {
          (callback as (error: NodeJS.ErrnoException | null, addresses: SafeAddress[]) => void)(null, [address]);
        } else {
          (callback as (error: NodeJS.ErrnoException | null, address: string, family: number) => void)(null, address.address, address.family);
        }
      };
      const outgoing = requestFn(url, { method: init.method, headers: init.headers as Record<string, string>, lookup: pinnedLookup }, (incoming) => {
        const chunks: Buffer[] = [];
        let length = 0;
        const declaredLength = Number(incoming.headers['content-length']);
        if (Number.isFinite(declaredLength) && declaredLength > MAX_HTTP_PAYLOAD_BYTES) {
          outgoing.destroy(new Error('Outbound response exceeded the 10 MB limit.'));
          return;
        }
        incoming.on('data', (chunk: Buffer | string) => {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          length += bytes.length;
          if (length > MAX_HTTP_PAYLOAD_BYTES) {
            outgoing.destroy(new Error('Outbound response exceeded the 10 MB limit.'));
            return;
          }
          chunks.push(bytes);
        });
        incoming.on('end', () => {
          const headers = new Headers();
          for (const [key, value] of Object.entries(incoming.headers)) {
            if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
          }
          const status = incoming.statusCode ?? 502;
          const body = [204, 205, 304].includes(status) ? null : Buffer.concat(chunks);
          resolve(new Response(body, { status, statusText: incoming.statusMessage, headers }));
        });
        incoming.on('error', reject);
      });
      const abort = () => outgoing.destroy(new DOMException('Request aborted', 'AbortError'));
      init.signal?.addEventListener('abort', abort, { once: true });
      outgoing.on('error', reject);
      outgoing.on('close', () => init.signal?.removeEventListener('abort', abort));
      if (typeof init.body === 'string') outgoing.write(init.body);
      outgoing.end();
    });
  }

  private buildHeaders(request: ApiRequest): Record<string, string> {
    const headers: Record<string, string> = {};

    // Add user-defined headers
    if (request.headers) {
      request.headers
        .filter((h) => h.enabled && h.key.trim() !== '')
        .forEach((h) => {
          headers[h.key] = h.value;
        });
    }

    // Add authentication headers
    // Credentials are only sent when actually provided: an empty "Bearer " or a blank
    // header name is never a meaningful request (and a blank name makes fetch throw).
    if (request.auth.type === 'bearer') {
      if (request.auth.token?.trim()) headers['Authorization'] = `Bearer ${request.auth.token.trim()}`;
    } else if (request.auth.type === 'apikey' && request.auth.addTo === 'header') {
      if (request.auth.key?.trim()) headers[request.auth.key.trim()] = request.auth.value ?? '';
    } else if (request.auth.type === 'basic' && (request.auth.username || request.auth.password)) {
      const credentials = Buffer.from(
        `${request.auth.username}:${request.auth.password}`
      ).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }

    // Auto-set Content-Type for JSON body if not explicitly set
    if (request.body && request.body.trim() !== '' && !headers['Content-Type'] && !headers['content-type']) {
      try {
        JSON.parse(request.body);
        headers['Content-Type'] = 'application/json';
      } catch {
        // Not JSON, don't set Content-Type
      }
    }

    return headers;
  }

  private parseBody(body: string | null | undefined): unknown {
    if (!body || body.trim() === '') {
      return undefined;
    }

    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }

  private calculateSize(data: unknown): number {
    if (!data) return 0;

    try {
      const str = typeof data === 'string' ? data : JSON.stringify(data);
      return new Blob([str]).size;
    } catch {
      return 0;
    }
  }

  private handleError(error: unknown, timeout = this.timeout): ApiErrorResponse {
    if (error instanceof Error) {
      // Timeout error (AbortError / TimeoutError)
      if (
        error.name === 'AbortError' ||
        error.name === 'TimeoutError' ||
        (error as any).code === 'ECONNABORTED' ||
        (error as any).code === 'ETIMEDOUT'
      ) {
        return {
          success: false,
          error: {
            type: 'TIMEOUT',
            message: `Request timed out after ${timeout}ms`,
          },
        };
      }

      const code = (error as any).code || (error as any).cause?.code || '';
      const msg = error.message || '';

      // DNS error
      if (code === 'ENOTFOUND' || msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
        return {
          success: false,
          error: {
            type: 'NETWORK_ERROR',
            message: 'DNS lookup failed - host not found',
            details: error.message,
          },
        };
      }

      // Connection refused
      if (code === 'ECONNREFUSED' || msg.includes('ECONNREFUSED')) {
        return {
          success: false,
          error: {
            type: 'NETWORK_ERROR',
            message: 'Connection refused - target server is not reachable',
            details: error.message,
          },
        };
      }

      // Connection reset
      if (code === 'ECONNRESET' || msg.includes('ECONNRESET')) {
        return {
          success: false,
          error: {
            type: 'NETWORK_ERROR',
            message: 'Connection reset by peer',
            details: error.message,
          },
        };
      }

      // SSL / TLS errors
      if (
        code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
        code === 'CERT_HAS_EXPIRED' ||
        msg.includes('certificate') ||
        msg.includes('SSL')
      ) {
        return {
          success: false,
          error: {
            type: 'NETWORK_ERROR',
            message: 'SSL/TLS certificate validation failed',
            details: error.message,
          },
        };
      }

      // Generic network error
      return {
        success: false,
        error: {
          type: 'NETWORK_ERROR',
          message: 'Network request failed',
          details: error.message,
        },
      };
    }

    // Unknown error
    return {
      success: false,
      error: {
        type: 'UNKNOWN_ERROR',
        message: 'An unexpected error occurred',
        details: typeof error === 'string' ? error : 'Unknown error',
      },
    };
  }
}


function isNonPublicAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (isIP(normalized) === 4) {
    const parts = normalized.split('.').map(Number);
    const [a, b, c] = parts;
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 192 && b === 0 && c === 0)
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && c === 100)
      || (a === 203 && b === 0 && c === 113);
  }

  if (isIP(normalized) !== 6) return true;
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    if (isIP(mapped) === 4) return isNonPublicAddress(mapped);
    const hex = mapped.split(':').slice(-2);
    if (hex.length === 2 && hex.every((part) => /^[0-9a-f]{1,4}$/.test(part))) {
      const value = `${parseInt(hex[0], 16) >> 8}.${parseInt(hex[0], 16) & 255}.${parseInt(hex[1], 16) >> 8}.${parseInt(hex[1], 16) & 255}`;
      return isNonPublicAddress(value);
    }
    return true;
  }
  const first = parseInt(normalized.split(':')[0] || '0', 16);
  return normalized === '::' || normalized === '::1'
    || (first & 0xfe00) === 0xfc00 // unique local
    || (first & 0xffc0) === 0xfe80 // link local
    || (first & 0xff00) === 0xff00; // multicast
}
