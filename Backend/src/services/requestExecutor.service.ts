import { isIP } from 'node:net';
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

export class RequestExecutorService {
  private readonly timeout: number;
  private readonly productionSafeMode: boolean;

  constructor(timeout: number = DEFAULT_TIMEOUT_MS, productionSafeMode = process.env.OUTBOUND_REQUEST_SAFE_MODE === 'true') {
    // A malformed environment value must not turn timeouts off (NaN/0).
    this.timeout = Number.isFinite(timeout) && timeout > 0
      ? Math.min(Math.floor(timeout), MAX_TIMEOUT_MS)
      : DEFAULT_TIMEOUT_MS;
    this.productionSafeMode = productionSafeMode;
  }

  async execute(request: ApiRequest): Promise<ApiExecutionResult> {
    const startTime = Date.now();

    try {
      // Validate URL
      const validationError = this.validateRequest(request);
      if (validationError) {
        return validationError;
      }

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
      const timer = setTimeout(() => controller.abort(), this.timeout);

      let response: Response;
      try {
        response = await fetch(url, {
          method: request.method,
          headers,
          body: requestBody,
          signal: controller.signal,
          redirect: 'follow',
        });
      } finally {
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
      const text = await response.text();
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
      return this.handleError(error);
    }
  }

  private validateRequest(request: ApiRequest): ApiErrorResponse | null {
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
      if (this.productionSafeMode && this.isPrivateTarget(url.hostname)) {
        return {
          success: false,
          error: {
            type: 'OUTBOUND_POLICY',
            message: 'This destination is blocked by the outbound-request policy',
          },
        };
      }
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

    // Validate payload size
    if (request.body && Buffer.byteLength(request.body, 'utf8') > MAX_HTTP_PAYLOAD_BYTES) {
      return {
        success: false,
        error: {
          type: 'VALIDATION_ERROR',
          message: `Request body exceeds maximum allowed size of ${MAX_HTTP_PAYLOAD_BYTES} bytes`,
        },
      };
    }

    // Validate JSON body if present
    if (request.body && request.body.trim() !== '') {
      try {
        JSON.parse(request.body);
      } catch (error) {
        return {
          success: false,
          error: {
            type: 'VALIDATION_ERROR',
            message: 'Invalid JSON in request body',
            details: error instanceof Error ? error.message : 'Unknown error',
          },
        };
      }
    }

    return null;
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

  private isPrivateTarget(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.localhost')) return true;
    if (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return true;
    const version = isIP(host);
    if (version === 4) {
      const [a, b] = host.split('.').map(Number);
      return a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127;
    }
    return version === 6 && (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd'));
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
    if (request.auth.type === 'bearer') {
      headers['Authorization'] = `Bearer ${request.auth.token}`;
    } else if (request.auth.type === 'apikey' && request.auth.addTo === 'header') {
      headers[request.auth.key] = request.auth.value;
    } else if (request.auth.type === 'basic') {
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

  private handleError(error: unknown): ApiErrorResponse {
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
            message: `Request timed out after ${this.timeout}ms`,
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
