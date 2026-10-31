import crypto from 'node:crypto';
import type { HttpMethod } from '../types/request.types.js';
import type { ApiSchema, ApiSpecification } from '../types/openapi.types.js';
import type {
  MockGenerateOptions,
  MockGenerateResult,
  MockRequestLog,
  MockRoute,
} from '../types/mockServer.types.js';

const MAX_LOGS_LIMIT = 150;
const MAX_LOG_VALUE_CHARS = 4096;
const SENSITIVE_FIELD = /(?:authorization|api[-_]?key|auth[-_]?token|cookie|password|secret|token)/i;

/**
 * Seed mock routes initialized by default
 */
const DEFAULT_MOCK_ROUTES: MockRoute[] = [
  {
    id: 'mock_route_users',
    name: 'Get All Users',
    description: 'Returns mock user directory',
    method: 'GET',
    path: '/api/v1/users',
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: [
      { id: 'usr_101', name: 'Alice Smith', email: 'alice@example.com', role: 'admin', active: true },
      { id: 'usr_102', name: 'Bob Jones', email: 'bob@example.com', role: 'developer', active: true },
    ],
    contentType: 'application/json',
    delayMs: 20,
    enabled: true,
    tags: ['Users'],
    source: 'MANUAL',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'mock_route_user_detail',
    name: 'Get User By ID',
    description: 'Returns single user detail for parameterized ID',
    method: 'GET',
    path: '/api/v1/users/:id',
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      id: 'usr_101',
      name: 'Alice Smith',
      email: 'alice@example.com',
      role: 'admin',
      active: true,
      lastLogin: '2026-10-10T12:00:00Z',
    },
    contentType: 'application/json',
    delayMs: 15,
    enabled: true,
    tags: ['Users'],
    source: 'MANUAL',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'mock_route_auth_login',
    name: 'User Authentication',
    description: 'Issues mock JWT session token',
    method: 'POST',
    path: '/api/v1/auth/login',
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'mock_session=jwt_token_seed_abc; Path=/',
    },
    body: {
      token: 'jwt_mock_token_secret_12345',
      userId: 'usr_101',
      expiresIn: 3600,
    },
    contentType: 'application/json',
    delayMs: 30,
    enabled: true,
    tags: ['Auth'],
    source: 'MANUAL',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'mock_route_health',
    name: 'Health Check',
    description: 'Returns mock service health',
    method: 'GET',
    path: '/health',
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      status: 'ok',
      service: 'APIForge Mock Server',
      timestamp: new Date().toISOString(),
    },
    contentType: 'application/json',
    delayMs: 5,
    enabled: true,
    tags: ['System'],
    source: 'MANUAL',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'mock_route_demo_users_get',
    name: 'Get All Users (Demo)',
    description: 'Retrieve users list for User Management scenario',
    method: 'GET',
    path: '/api/users',
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: [
      {
        id: 101,
        name: 'Aarav Patil',
        email: 'aarav@example.com',
        role: 'student',
        active: true,
      },
    ],
    contentType: 'application/json',
    delayMs: 10,
    enabled: true,
    tags: ['User Management'],
    source: 'MANUAL',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'mock_route_demo_user_get_single',
    name: 'Get Single User (Demo)',
    description: 'Retrieve one user by ID (101)',
    method: 'GET',
    path: '/api/users/:id',
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      id: 101,
      name: 'Aarav Patil',
      email: 'aarav@example.com',
      role: 'student',
      active: true,
    },
    contentType: 'application/json',
    delayMs: 10,
    enabled: true,
    tags: ['User Management'],
    source: 'MANUAL',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'mock_route_demo_user_post',
    name: 'Create User (Demo)',
    description: 'Create a new user',
    method: 'POST',
    path: '/api/users',
    statusCode: 201,
    headers: { 'Content-Type': 'application/json' },
    body: {
      id: 101,
      name: 'Aarav Patil',
      email: 'aarav@example.com',
      role: 'student',
      active: true,
      created: true,
    },
    contentType: 'application/json',
    delayMs: 15,
    enabled: true,
    tags: ['User Management'],
    source: 'MANUAL',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'mock_route_demo_user_put',
    name: 'Update User (Demo)',
    description: 'Update user 101 details',
    method: 'PUT',
    path: '/api/users/:id',
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      id: 101,
      name: 'Aarav Patil',
      email: 'aarav@example.com',
      role: 'student',
      active: true,
      updated: true,
    },
    contentType: 'application/json',
    delayMs: 10,
    enabled: true,
    tags: ['User Management'],
    source: 'MANUAL',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'mock_route_demo_user_delete',
    name: 'Delete User (Demo)',
    description: 'Delete user 101',
    method: 'DELETE',
    path: '/api/users/:id',
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      success: true,
      message: 'User 101 deleted successfully',
    },
    contentType: 'application/json',
    delayMs: 10,
    enabled: true,
    tags: ['User Management'],
    source: 'MANUAL',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'mock_route_ecommerce_products_get',
    name: 'List Products (QuickCart Demo)',
    description: 'Returns catalog of products for QuickCart E-Commerce scenario',
    method: 'GET',
    path: '/api/products',
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: [
      {
        id: 201,
        title: 'UltraBook Pro 15',
        price: 1299.99,
        category: 'electronics',
        inStock: true,
        rating: 4.8,
      },
      {
        id: 202,
        title: 'Noise Cancelling Headphones',
        price: 199.5,
        category: 'electronics',
        inStock: true,
        rating: 4.6,
      },
      {
        id: 203,
        title: 'Wireless Gaming Mouse',
        price: 59.99,
        category: 'electronics',
        inStock: true,
        rating: 5.0,
      },
    ],
    contentType: 'application/json',
    delayMs: 15,
    enabled: true,
    tags: ['QuickCart E-Commerce'],
    source: 'MANUAL',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'mock_route_ecommerce_product_get_single',
    name: 'Get Product By ID (QuickCart Demo)',
    description: 'Returns product details for ID 201',
    method: 'GET',
    path: '/api/products/:id',
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      id: 201,
      title: 'UltraBook Pro 15',
      price: 1299.99,
      category: 'electronics',
      inStock: true,
      rating: 4.8,
    },
    contentType: 'application/json',
    delayMs: 10,
    enabled: true,
    tags: ['QuickCart E-Commerce'],
    source: 'MANUAL',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'mock_route_ecommerce_product_post',
    name: 'Create Product (QuickCart Demo)',
    description: 'Adds a new product to inventory',
    method: 'POST',
    path: '/api/products',
    statusCode: 201,
    headers: { 'Content-Type': 'application/json' },
    body: {
      id: 203,
      title: 'Wireless Gaming Mouse',
      price: 59.99,
      category: 'electronics',
      inStock: true,
      rating: 5.0,
    },
    contentType: 'application/json',
    delayMs: 15,
    enabled: true,
    tags: ['QuickCart E-Commerce'],
    source: 'MANUAL',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'mock_route_ecommerce_order_post',
    name: 'Create Order (QuickCart Demo)',
    description: 'Creates checkout order',
    method: 'POST',
    path: '/api/orders',
    statusCode: 201,
    headers: { 'Content-Type': 'application/json' },
    body: {
      orderId: 'ORD-9021',
      customerEmail: 'customer@example.com',
      totalAmount: 1299.99,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    },
    contentType: 'application/json',
    delayMs: 20,
    enabled: true,
    tags: ['QuickCart E-Commerce'],
    source: 'MANUAL',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'mock_route_ecommerce_order_get_single',
    name: 'Get Order By ID (QuickCart Demo)',
    description: 'Retrieves order status by reference',
    method: 'GET',
    path: '/api/orders/:id',
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      orderId: 'ORD-9021',
      customerEmail: 'customer@example.com',
      totalAmount: 1299.99,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    },
    contentType: 'application/json',
    delayMs: 10,
    enabled: true,
    tags: ['QuickCart E-Commerce'],
    source: 'MANUAL',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'mock_route_ecommerce_order_delete',
    name: 'Cancel Order (QuickCart Demo)',
    description: 'Cancels order ORD-9021',
    method: 'DELETE',
    path: '/api/orders/:id',
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      success: true,
      message: 'Order ORD-9021 cancelled successfully',
    },
    contentType: 'application/json',
    delayMs: 10,
    enabled: true,
    tags: ['QuickCart E-Commerce'],
    source: 'MANUAL',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'mock_route_ecommerce_product_put',
    name: 'Update Product Stock (QuickCart Demo)',
    description: 'Updates inventory and price for product',
    method: 'PUT',
    path: '/api/products/:id',
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      id: 201,
      title: 'UltraBook Pro 15',
      price: 899.99,
      category: 'electronics',
      inStock: true,
      stock: 45,
      updated: true,
    },
    contentType: 'application/json',
    delayMs: 10,
    enabled: true,
    tags: ['QuickCart E-Commerce'],
    source: 'MANUAL',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export class MockServerService {
  private routes: Map<string, MockRoute> = new Map();
  private logs: MockRequestLog[] = [];

  constructor(initialRoutes: MockRoute[] = DEFAULT_MOCK_ROUTES) {
    for (const route of initialRoutes) {
      this.routes.set(route.id, { ...route });
    }
  }

  /**
   * Returns all registered mock routes
   */
  getRoutes(ownerUserId: string): MockRoute[] {
    return Array.from(this.routes.values()).filter((route) => route.ownerUserId === ownerUserId);
  }

  /**
   * Retrieves a single mock route by its ID
   */
  getRouteById(id: string, ownerUserId: string): MockRoute | undefined {
    const route = this.routes.get(id);
    return route?.ownerUserId === ownerUserId ? route : undefined;
  }

  /**
   * Creates a new mock route
   */
  createRoute(routeData: Omit<MockRoute, 'id'>): MockRoute {
    const id = `mock_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const cleanPath = this.normalizePath(routeData.path || '/');

    const newRoute: MockRoute = {
      ...routeData,
      id,
      path: cleanPath,
      createdAt: now,
      updatedAt: now,
      enabled: routeData.enabled ?? true,
      statusCode: routeData.statusCode || 200,
      delayMs: Math.max(0, Number(routeData.delayMs) || 0),
    };

    this.routes.set(id, newRoute);
    return newRoute;
  }

  /**
   * Updates an existing mock route
   */
  updateRoute(id: string, updates: Partial<MockRoute>, ownerUserId: string): MockRoute | undefined {
    const existing = this.routes.get(id);
    if (!existing || existing.ownerUserId !== ownerUserId) return undefined;

    const cleanPath = updates.path !== undefined ? this.normalizePath(updates.path) : existing.path;
    const updated: MockRoute = {
      ...existing,
      ...updates,
      id,
      ownerUserId: existing.ownerUserId,
      path: cleanPath,
      updatedAt: new Date().toISOString(),
      delayMs: updates.delayMs !== undefined ? Math.max(0, Number(updates.delayMs) || 0) : existing.delayMs,
    };

    this.routes.set(id, updated);
    return updated;
  }

  /**
   * Deletes a mock route by ID
   */
  deleteRoute(id: string, ownerUserId: string): boolean {
    const existing = this.routes.get(id);
    if (!existing || existing.ownerUserId !== ownerUserId) return false;
    return this.routes.delete(id);
  }

  /**
   * Resets mock routes to default state
   */
  resetRoutes(): void {
    this.routes.clear();
    for (const route of DEFAULT_MOCK_ROUTES) {
      this.routes.set(route.id, { ...route });
    }
  }

  /**
   * Auto-generates mock routes from an imported OpenAPI Specification
   */
  generateFromSpec(spec: ApiSpecification, options: MockGenerateOptions | undefined, ownerUserId: string): MockGenerateResult {
    if (options?.overwriteExisting) {
      for (const route of this.getRoutes(ownerUserId)) this.routes.delete(route.id);
    }

    const defaultDelay = Math.max(0, options?.defaultDelayMs || 0);
    const generatedRoutes: MockRoute[] = [];

    for (const endpoint of spec.endpoints) {
      // Find primary success response (200, 201, 204, or first response)
      const successResponse =
        endpoint.responses.find((r) => r.statusCode.startsWith('2')) || endpoint.responses[0];

      const statusCode = successResponse ? parseInt(successResponse.statusCode, 10) || 200 : 200;
      const content = successResponse?.content[0];
      const contentType = content?.contentType || 'application/json';

      let body: unknown = {};
      if (content?.example !== undefined) {
        body = content.example;
      } else if (content?.schema) {
        body = this.generateSchemaExample(content.schema);
      } else if (statusCode === 204) {
        body = '';
      }

      const id = `mock_spec_${crypto.randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();

      const route: MockRoute = {
        id,
        ownerUserId,
        name: endpoint.summary || endpoint.operationId || `${endpoint.method} ${endpoint.path}`,
        description: endpoint.description || `Auto-generated mock from OpenAPI for ${endpoint.method} ${endpoint.path}`,
        method: endpoint.method as HttpMethod,
        path: this.normalizePath(endpoint.path),
        statusCode,
        headers: { 'Content-Type': contentType },
        body,
        contentType,
        delayMs: defaultDelay,
        enabled: true,
        tags: endpoint.tags.length > 0 ? endpoint.tags : ['OpenAPI'],
        source: 'OPENAPI',
        createdAt: now,
        updatedAt: now,
      };

      this.routes.set(id, route);
      generatedRoutes.push(route);
    }

    return {
      generatedCount: generatedRoutes.length,
      routes: generatedRoutes,
    };
  }

  /**
   * Matches an incoming HTTP request against registered mock routes
   */
  matchRoute(method: string, incomingPath: string): MockRoute | undefined {
    const normIncoming = this.normalizePath(incomingPath);
    const upperMethod = method.toUpperCase();

    const enabledRoutes = Array.from(this.routes.values()).filter(
      (r) => r.enabled && r.method.toUpperCase() === upperMethod
    );

    // 1. Exact path match first
    const exactMatch = enabledRoutes.find((r) => this.normalizePath(r.path) === normIncoming);
    if (exactMatch) return exactMatch;

    // 2. Parameterized path match (e.g., /users/:id or /users/{id})
    for (const route of enabledRoutes) {
      if (this.isPathMatch(route.path, normIncoming)) {
        return route;
      }
    }

    // 3. Fallback: try matching with or without /api prefix for maximum flexibility
    const altIncoming = normIncoming.startsWith('/api/')
      ? this.normalizePath(normIncoming.slice(4))
      : this.normalizePath(`/api${normIncoming}`);

    const altExactMatch = enabledRoutes.find((r) => this.normalizePath(r.path) === altIncoming);
    if (altExactMatch) return altExactMatch;

    for (const route of enabledRoutes) {
      if (this.isPathMatch(route.path, altIncoming)) {
        return route;
      }
    }

    return undefined;
  }

  /**
   * Handles incoming mock traffic, logs the request, applies simulated latency, and returns the response
   */
  async handleRequest(
    method: string,
    rawUrl: string,
    queryParams: Record<string, string>,
    headers: Record<string, string>,
    body?: unknown
  ): Promise<{
    statusCode: number;
    headers: Record<string, string>;
    body: unknown;
    matchedRoute?: MockRoute;
    durationMs: number;
  }> {
    const startTime = Date.now();
    const urlObj = new URL(rawUrl, 'http://localhost');
    let targetPath = urlObj.pathname;

    // Strip mock server base prefix if present (/api/mock/serve, /mock/serve, /serve)
    if (targetPath.startsWith('/api/mock/serve')) {
      targetPath = targetPath.slice('/api/mock/serve'.length) || '/';
    } else if (targetPath.startsWith('/mock/serve')) {
      targetPath = targetPath.slice('/mock/serve'.length) || '/';
    } else if (targetPath.startsWith('/serve')) {
      targetPath = targetPath.slice('/serve'.length) || '/';
    }

    const matchedRoute = this.matchRoute(method, targetPath);

    let statusCode = 404;
    let responseHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    let responseBody: unknown = {
      error: 'Mock route not found',
      message: `No active mock endpoint matched ${method.toUpperCase()} ${targetPath}`,
      path: targetPath,
      method: method.toUpperCase(),
    };

    if (matchedRoute) {
      // Apply simulated network latency
      if (matchedRoute.delayMs && matchedRoute.delayMs > 0) {
        const delay = Math.min(matchedRoute.delayMs, 10000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      statusCode = matchedRoute.statusCode || 200;
      responseHeaders = {
        'Content-Type': matchedRoute.contentType || 'application/json',
        ...(matchedRoute.headers || {}),
      };
      responseBody = matchedRoute.body;
    }

    const durationMs = Date.now() - startTime;

    // Record request log
    const logEntry: MockRequestLog = {
      id: `log_${crypto.randomUUID().slice(0, 8)}`,
      ownerUserId: matchedRoute?.ownerUserId,
      timestamp: new Date().toISOString(),
      method: method.toUpperCase(),
      url: rawUrl,
      path: targetPath,
      queryParams: this.sanitizeLogRecord(queryParams),
      headers: this.sanitizeLogRecord(headers),
      body: this.sanitizeLogValue(body),
      matchedRouteId: matchedRoute?.id,
      matchedRouteName: matchedRoute?.name,
      responseStatus: statusCode,
      durationMs,
    };

    this.logs.unshift(logEntry);
    if (this.logs.length > MAX_LOGS_LIMIT) {
      this.logs.length = MAX_LOGS_LIMIT;
    }

    return {
      statusCode,
      headers: responseHeaders,
      body: responseBody,
      matchedRoute,
      durationMs,
    };
  }

  /**
   * Retrieves request execution logs
   */
  getLogs(ownerUserId: string): MockRequestLog[] {
    return this.logs.filter((log) => log.ownerUserId === ownerUserId);
  }

  /**
   * Clears all request execution logs
   */
  clearLogs(ownerUserId: string): void {
    this.logs = this.logs.filter((log) => log.ownerUserId !== ownerUserId);
  }

  // --- Internal Helpers ---

  /** Keep the traffic inspector useful without retaining credentials or arbitrarily large payloads. */
  private sanitizeLogRecord(record: Record<string, string>): Record<string, string> {
    return Object.fromEntries(
      Object.entries(record).map(([key, value]) => [
        key,
        SENSITIVE_FIELD.test(key) ? '[REDACTED]' : this.truncateLogValue(value),
      ])
    );
  }

  private sanitizeLogValue(value: unknown, key?: string): unknown {
    if (key && SENSITIVE_FIELD.test(key)) return '[REDACTED]';
    if (typeof value === 'string') return this.truncateLogValue(value);
    if (Array.isArray(value)) return value.map((item) => this.sanitizeLogValue(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
          entryKey,
          this.sanitizeLogValue(entryValue, entryKey),
        ])
      );
    }
    return value;
  }

  private truncateLogValue(value: string): string {
    return value.length > MAX_LOG_VALUE_CHARS
      ? `${value.slice(0, MAX_LOG_VALUE_CHARS)}… [Truncated]`
      : value;
  }

  private normalizePath(path: string): string {
    if (!path) return '/';
    let clean = path.trim();
    if (!clean.startsWith('/')) clean = `/${clean}`;
    if (clean.length > 1 && clean.endsWith('/')) clean = clean.slice(0, -1);
    return clean;
  }

  private isPathMatch(pattern: string, actualPath: string): boolean {
    const patternSegments = this.normalizePath(pattern).split('/').filter(Boolean);
    const actualSegments = this.normalizePath(actualPath).split('/').filter(Boolean);

    // Greedy wildcard support: if pattern ends with * or **, it matches any remaining segments
    if (patternSegments.length > 0 && (patternSegments[patternSegments.length - 1] === '*' || patternSegments[patternSegments.length - 1] === '**')) {
      const prefixLength = patternSegments.length - 1;
      if (actualSegments.length < prefixLength) {
        return false;
      }
      for (let i = 0; i < prefixLength; i++) {
        const p = patternSegments[i];
        const a = actualSegments[i];
        if (p.startsWith(':') || (p.startsWith('{') && p.endsWith('}'))) {
          continue;
        }
        if (p !== a) {
          return false;
        }
      }
      return true;
    }

    if (patternSegments.length !== actualSegments.length) {
      return false;
    }

    for (let i = 0; i < patternSegments.length; i++) {
      const p = patternSegments[i];
      const a = actualSegments[i];

      // Match colon parameters (e.g. :id) or curly brace parameters (e.g. {id}) or wildcards (*)
      if (p.startsWith(':') || (p.startsWith('{') && p.endsWith('}')) || p === '*') {
        continue;
      }

      if (p !== a) {
        return false;
      }
    }

    return true;
  }

  private generateSchemaExample(schema?: ApiSchema, depth = 0): unknown {
    if (!schema || depth > 4) return schema?.example ?? schema?.default ?? {};
    if (schema.example !== undefined) return schema.example;
    if (schema.default !== undefined) return schema.default;
    if (schema.enum && schema.enum.length > 0) return schema.enum[0];

    const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;

    if (type === 'string') {
      if (schema.format === 'date-time') return new Date().toISOString();
      if (schema.format === 'email') return 'developer@example.com';
      if (schema.format === 'uuid') return crypto.randomUUID();
      return 'sample_string';
    }

    if (type === 'number' || type === 'integer') {
      return 100;
    }

    if (type === 'boolean') {
      return true;
    }

    if (type === 'array') {
      const itemSchema = schema.items;
      return [this.generateSchemaExample(itemSchema, depth + 1)];
    }

    if (type === 'object' || schema.properties) {
      const obj: Record<string, unknown> = {};
      if (schema.properties) {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          obj[key] = this.generateSchemaExample(propSchema, depth + 1);
        }
      }
      return obj;
    }

    return {};
  }
}

export const mockServerService = new MockServerService();
