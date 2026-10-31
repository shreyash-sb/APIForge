import type { Request, Response } from 'express';
import { MockServerService, mockServerService as defaultMockServerService } from '../services/mockServer.service.js';
import type { ApiSpecification } from '../types/openapi.types.js';
import type { MockGenerateOptions, MockRoute } from '../types/mockServer.types.js';

const MOCK_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const MAX_MOCK_DELAY_MS = 30_000;

export class MockServerController {
  private readonly mockService: MockServerService;

  constructor(mockService: MockServerService = defaultMockServerService) {
    this.mockService = mockService;
  }

  private authenticatedUserId(res: Response): string {
    const userId = res.locals.authUser?.id;
    if (typeof userId !== 'string' || !userId) throw new Error('Authenticated user context is missing.');
    return userId;
  }

  /**
   * GET /api/mock/routes - List all mock routes
   */
  async getRoutes(_req: Request, res: Response): Promise<void> {
    try {
      const routes = this.mockService.getRoutes(this.authenticatedUserId(res));
      res.status(200).json({ routes, total: routes.length });
    } catch {
      res.status(500).json({ error: { message: 'Failed to retrieve mock routes.' } });
    }
  }

  /**
   * GET /api/mock/routes/:id - Get single mock route by ID
   */
  async getRouteById(req: Request, res: Response): Promise<void> {
    try {
      const route = this.mockService.getRouteById(req.params.id, this.authenticatedUserId(res));
      if (!route) {
        res.status(404).json({ error: { message: 'Mock route not found.' } });
        return;
      }
      res.status(200).json(route);
    } catch {
      res.status(500).json({ error: { message: 'Failed to retrieve mock route.' } });
    }
  }

  /**
   * Validates user-editable route fields. Returns a user-facing message or undefined.
   * Bounds keep a single route from producing invalid HTTP or tying up /serve.
   */
  private validateRouteInput(input: Record<string, unknown>, isCreate: boolean): string | undefined {
    const has = (key: string) => input[key] !== undefined;
    if (isCreate || has('name')) {
      if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120) return 'name must be a non-empty string of at most 120 characters.';
    }
    if (isCreate || has('method')) {
      if (typeof input.method !== 'string' || !MOCK_METHODS.includes(input.method.toUpperCase())) return `method must be one of ${MOCK_METHODS.join(', ')}.`;
    }
    if (isCreate || has('path')) {
      if (typeof input.path !== 'string' || !input.path.trim() || input.path.length > 500) return 'path must be a non-empty string of at most 500 characters.';
    }
    if (has('statusCode')) {
      const code = Number(input.statusCode);
      if (!Number.isInteger(code) || code < 100 || code > 599) return 'statusCode must be an integer between 100 and 599.';
    }
    if (has('delayMs')) {
      const delay = Number(input.delayMs);
      if (!Number.isFinite(delay) || delay < 0 || delay > MAX_MOCK_DELAY_MS) return `delayMs must be between 0 and ${MAX_MOCK_DELAY_MS}.`;
    }
    if (has('headers') && (typeof input.headers !== 'object' || input.headers === null || Array.isArray(input.headers))) return 'headers must be an object of header names to values.';
    return undefined;
  }

  /**
   * POST /api/mock/routes - Create a new mock route
   */
  async createRoute(req: Request, res: Response): Promise<void> {
    try {
      const { name, method, path, statusCode, body, headers, delayMs, enabled, tags, description } = req.body;

      if (!name || !method || !path) {
        res.status(400).json({
          error: { message: 'Invalid payload: name, method, and path are required.' },
        });
        return;
      }
      const invalid = this.validateRouteInput(req.body, true);
      if (invalid) {
        res.status(400).json({ error: { message: `Invalid payload: ${invalid}` } });
        return;
      }

      const newRoute = this.mockService.createRoute({
        ownerUserId: this.authenticatedUserId(res),
        name,
        method: String(method).toUpperCase() as MockRoute['method'],
        path,
        statusCode: statusCode === undefined ? 200 : Number(statusCode),
        body: body !== undefined ? body : {},
        headers: headers || { 'Content-Type': 'application/json' },
        delayMs: Number(delayMs) || 0,
        enabled: enabled ?? true,
        tags: Array.isArray(tags) ? tags : [],
        description: description || '',
        source: 'MANUAL',
      });

      res.status(201).json(newRoute);
    } catch {
      res.status(500).json({ error: { message: 'Failed to create mock route.' } });
    }
  }

  /**
   * PUT /api/mock/routes/:id - Update an existing mock route
   */
  async updateRoute(req: Request, res: Response): Promise<void> {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const invalid = this.validateRouteInput(body, false);
      if (invalid) {
        res.status(400).json({ error: { message: `Invalid payload: ${invalid}` } });
        return;
      }
      // Only user-editable fields; identity, ownership, source, and timestamps are server-controlled.
      const updates: Partial<MockRoute> = {};
      for (const key of ['name', 'description', 'path', 'body', 'headers', 'enabled', 'tags', 'contentType'] as const) {
        if (body[key] !== undefined) (updates as Record<string, unknown>)[key] = body[key];
      }
      if (body.method !== undefined) updates.method = String(body.method).toUpperCase() as MockRoute['method'];
      if (body.statusCode !== undefined) updates.statusCode = Number(body.statusCode);
      if (body.delayMs !== undefined) updates.delayMs = Number(body.delayMs);
      const updated = this.mockService.updateRoute(req.params.id, updates, this.authenticatedUserId(res));
      if (!updated) {
        res.status(404).json({ error: { message: 'Mock route not found.' } });
        return;
      }
      res.status(200).json(updated);
    } catch {
      res.status(500).json({ error: { message: 'Failed to update mock route.' } });
    }
  }

  /**
   * DELETE /api/mock/routes/:id - Delete a mock route
   */
  async deleteRoute(req: Request, res: Response): Promise<void> {
    try {
      const deleted = this.mockService.deleteRoute(req.params.id, this.authenticatedUserId(res));
      if (!deleted) {
        res.status(404).json({ error: { message: 'Mock route not found.' } });
        return;
      }
      res.status(200).json({ success: true, message: `Mock route '${req.params.id}' deleted.` });
    } catch {
      res.status(500).json({ error: { message: 'Failed to delete mock route.' } });
    }
  }

  /**
   * POST /api/mock/generate-from-spec - Auto-generate mock routes from OpenAPI Spec
   */
  async generateFromSpec(req: Request, res: Response): Promise<void> {
    try {
      const specification = req.body?.specification as ApiSpecification | undefined;
      const options = req.body?.options as MockGenerateOptions | undefined;

      if (!specification || !Array.isArray(specification.endpoints)) {
        res.status(400).json({
          error: { message: 'Invalid payload: specification object with endpoints is required.' },
        });
        return;
      }

      const result = this.mockService.generateFromSpec(specification, options, this.authenticatedUserId(res));
      res.status(200).json(result);
    } catch {
      res.status(500).json({ error: { message: 'Failed to generate mock routes from specification.' } });
    }
  }

  /**
   * GET /api/mock/logs - Retrieve mock request logs
   */
  async getLogs(_req: Request, res: Response): Promise<void> {
    try {
      const logs = this.mockService.getLogs(this.authenticatedUserId(res));
      res.status(200).json({ logs, total: logs.length });
    } catch {
      res.status(500).json({ error: { message: 'Failed to retrieve mock logs.' } });
    }
  }

  /**
   * DELETE /api/mock/logs - Clear mock request logs
   */
  async clearLogs(_req: Request, res: Response): Promise<void> {
    try {
      this.mockService.clearLogs(this.authenticatedUserId(res));
      res.status(200).json({ success: true, message: 'Mock logs cleared.' });
    } catch {
      res.status(500).json({ error: { message: 'Failed to clear mock logs.' } });
    }
  }

  /**
   * Dynamic Mock Dispatcher: Serves mock endpoints for any HTTP verb
   * ALL /api/mock/serve/*
   */
  async serveMock(req: Request, res: Response): Promise<void> {
    try {
      const method = req.method;
      const originalUrl = req.originalUrl || req.url;
      const queryParams: Record<string, string> = {};
      for (const [key, val] of Object.entries(req.query)) {
        queryParams[key] = String(val);
      }

      const headers: Record<string, string> = {};
      for (const [key, val] of Object.entries(req.headers)) {
        if (typeof val === 'string') {
          headers[key] = val;
        } else if (Array.isArray(val)) {
          headers[key] = val.join(', ');
        }
      }

      const result = await this.mockService.handleRequest(
        method,
        originalUrl,
        queryParams,
        headers,
        req.body
      );

      // Set custom response headers
      for (const [headerKey, headerVal] of Object.entries(result.headers)) {
        if (headerKey.toLowerCase() !== 'content-length') {
          res.setHeader(headerKey, headerVal);
        }
      }

      res.status(result.statusCode);

      if (typeof result.body === 'object' && result.body !== null) {
        res.json(result.body);
      } else {
        res.send(result.body !== undefined ? String(result.body) : '');
      }
    } catch {
      res.status(500).json({ error: { message: 'Mock dispatch failed due to internal error.' } });
    }
  }
}
