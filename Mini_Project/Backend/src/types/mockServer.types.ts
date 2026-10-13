import type { HttpMethod } from './request.types.js';

/**
 * Configuration for a single mock endpoint route
 */
export interface MockRoute {
  id: string;
  name: string;
  description?: string;
  method: HttpMethod;
  path: string; // URL path pattern (e.g., "/api/v1/users", "/users/:id")
  statusCode: number;
  headers?: Record<string, string>;
  body: unknown;
  contentType?: string;
  delayMs?: number; // Simulated network delay in milliseconds
  enabled: boolean;
  tags?: string[];
  source?: 'MANUAL' | 'OPENAPI';
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Execution log entry captured when a mock endpoint is called
 */
export interface MockRequestLog {
  id: string;
  timestamp: string;
  method: string;
  url: string;
  path: string;
  queryParams: Record<string, string>;
  headers: Record<string, string>;
  body?: unknown;
  matchedRouteId?: string;
  matchedRouteName?: string;
  responseStatus: number;
  durationMs: number;
}

/**
 * Options for generating mock routes from an OpenAPI Specification
 */
export interface MockGenerateOptions {
  defaultDelayMs?: number;
  overwriteExisting?: boolean;
}

/**
 * Result returned when generating mock routes from an OpenAPI Specification
 */
export interface MockGenerateResult {
  generatedCount: number;
  routes: MockRoute[];
}
