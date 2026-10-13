import type { Request, Response } from 'express';
import { MockServerService, mockServerService as defaultMockServerService } from '../services/mockServer.service.js';
import type { ApiSpecification } from '../types/openapi.types.js';
import type { MockGenerateOptions, MockRoute } from '../types/mockServer.types.js';

export class MockServerController {
  private readonly mockService: MockServerService;

  constructor(mockService: MockServerService = defaultMockServerService) {
    this.mockService = mockService;
  }

  /**
   * GET /api/mock/routes - List all mock routes
   */
  async getRoutes(_req: Request, res: Response): Promise<void> {
    try {
      const routes = this.mockService.getRoutes();
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
      const route = this.mockService.getRouteById(req.params.id);
      if (!route) {
        res.status(404).json({ error: { message: `Mock route '${req.params.id}' not found.` } });
        return;
      }
      res.status(200).json(route);
    } catch {
      res.status(500).json({ error: { message: 'Failed to retrieve mock route.' } });
    }
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

      const newRoute = this.mockService.createRoute({
        name,
        method,
        path,
        statusCode: Number(statusCode) || 200,
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
      const updated = this.mockService.updateRoute(req.params.id, req.body as Partial<MockRoute>);
      if (!updated) {
        res.status(404).json({ error: { message: `Mock route '${req.params.id}' not found.` } });
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
      const deleted = this.mockService.deleteRoute(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: { message: `Mock route '${req.params.id}' not found.` } });
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

      const result = this.mockService.generateFromSpec(specification, options);
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
      const logs = this.mockService.getLogs();
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
      this.mockService.clearLogs();
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
