import type { HttpMethod } from './request.types';

export interface MockRoute {
  id: string;
  name: string;
  description?: string;
  method: HttpMethod;
  path: string;
  statusCode: number;
  headers?: Record<string, string>;
  body: unknown;
  contentType?: string;
  delayMs?: number;
  enabled: boolean;
  tags?: string[];
  source?: 'MANUAL' | 'OPENAPI';
  createdAt?: string;
  updatedAt?: string;
}

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

export interface MockGenerateOptions {
  defaultDelayMs?: number;
  overwriteExisting?: boolean;
}

export interface MockGenerateResult {
  generatedCount: number;
  routes: MockRoute[];
}
