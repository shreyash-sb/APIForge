/**
 * OpenAPI 3.1 Reverse Exporter for APIForge.
 * Converts collections, requests, and mock server routes into valid OpenAPI 3.1.0 specifications.
 */

import type { MockRoute } from '@/types/mockServer.types';
import type { ApiCollection } from '@/types/request.types';
import { getMockServeBaseUrl } from '@/config/api';

function inferSchema(value: unknown): Record<string, unknown> {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) {
    return {
      type: 'array',
      items: value.length > 0 ? inferSchema(value[0]) : { type: 'string' },
    };
  }
  if (typeof value === 'object') {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      properties[k] = inferSchema(v);
      required.push(k);
    }
    return {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
    };
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { type: 'integer' } : { type: 'number' };
  }
  if (typeof value === 'boolean') return { type: 'boolean' };
  return { type: 'string' };
}

function parseJsonSafe(content: string | undefined): unknown {
  if (!content || !content.trim()) return null;
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

export function exportMockRoutesToOpenApi(
  routes: MockRoute[],
  info: { title?: string; version?: string; description?: string; serverUrl?: string } = {}
): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of routes) {
    let cleanPath = route.path.startsWith('/') ? route.path : `/${route.path}`;
    // OpenAPI requires path without query string
    if (cleanPath.includes('?')) {
      cleanPath = cleanPath.split('?')[0];
    }

    if (!paths[cleanPath]) {
      paths[cleanPath] = {};
    }

    const methodLower = route.method.toLowerCase();
    const responseBodyParsed = typeof route.body === 'string' ? parseJsonSafe(route.body) : route.body;
    const statusCodeStr = String(route.statusCode || 200);

    const operation: Record<string, unknown> = {
      summary: route.name || `${route.method} ${cleanPath}`,
      description: `Mock endpoint mounted at ${cleanPath}`,
      operationId: `${methodLower}_${cleanPath.replace(/[^a-zA-Z0-9]/g, '_')}`,
      responses: {
        [statusCodeStr]: {
          description: `Response with status ${statusCodeStr}`,
          content: {
            'application/json': {
              schema: inferSchema(responseBodyParsed),
              example: responseBodyParsed,
            },
          },
        },
      },
    };

    paths[cleanPath][methodLower] = operation;
  }

  return {
    openapi: '3.1.0',
    info: {
      title: info.title || 'APIForge Mock Server Export',
      version: info.version || '1.0.0',
      description: info.description || 'OpenAPI 3.1 specification exported from active APIForge mock routes.',
    },
    servers: [
      {
        url: info.serverUrl || getMockServeBaseUrl(),
        description: 'APIForge Mock Server instance',
      },
    ],
    paths,
  };
}

export function exportCollectionToOpenApi(
  collection: ApiCollection,
  info: { title?: string; version?: string } = {}
): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const req of collection.requests) {
    let urlPath: string;
    try {
      const parsedUrl = new URL(req.url.startsWith('http') ? req.url : `http://localhost${req.url.startsWith('/') ? '' : '/'}${req.url}`);
      urlPath = parsedUrl.pathname;
    } catch {
      urlPath = req.url.startsWith('/') ? req.url : `/${req.url}`;
    }

    if (!paths[urlPath]) {
      paths[urlPath] = {};
    }

    const methodLower = req.method.toLowerCase();
    const requestBodyParsed = parseJsonSafe(req.body);

    const operation: Record<string, unknown> = {
      summary: req.name || `${req.method} ${urlPath}`,
      operationId: `${methodLower}_${req.name.replace(/[^a-zA-Z0-9]/g, '_')}`,
      parameters: (req.queryParams || []).map((p) => ({
        name: p.key,
        in: 'query',
        required: false,
        schema: { type: 'string', default: p.value },
      })),
      responses: {
        '200': {
          description: 'Successful response',
          content: {
            'application/json': {
              schema: { type: 'object' },
            },
          },
        },
      },
    };

    if (requestBodyParsed && req.method !== 'GET' && req.method !== 'HEAD') {
      operation.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: inferSchema(requestBodyParsed),
            example: requestBodyParsed,
          },
        },
      };
    }

    paths[urlPath][methodLower] = operation;
  }

  return {
    openapi: '3.1.0',
    info: {
      title: info.title || collection.name || 'APIForge Collection Export',
      version: info.version || '1.0.0',
      description: `OpenAPI 3.1 specification exported from collection "${collection.name}"`,
    },
    paths,
  };
}

export function exportSpecificationToOpenApi(spec: {
  metadata: { title: string; version: string; description?: string };
  servers: Array<{ url: string; description?: string }>;
  endpoints: Array<{
    path: string;
    method: string;
    summary?: string;
    operationId?: string;
    tags: string[];
    deprecated: boolean;
    parameters: Array<{
      name: string;
      location: string;
      required: boolean;
      description?: string;
      schema?: unknown;
    }>;
    requestBody?: {
      required: boolean;
      description?: string;
      content: Array<{ contentType: string; schema?: unknown }>;
    };
    responses: Array<{
      statusCode: string;
      description?: string;
      content: Array<{ contentType: string; schema?: unknown }>;
    }>;
  }>;
  schemas: Record<string, unknown>;
  securitySchemes: Record<string, unknown>;
}): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const ep of spec.endpoints) {
    if (!paths[ep.path]) paths[ep.path] = {};
    const methodLower = ep.method.toLowerCase();

    const operation: Record<string, unknown> = {
      summary: ep.summary || ep.operationId || `${ep.method} ${ep.path}`,
      tags: ep.tags,
      deprecated: ep.deprecated,
      parameters: ep.parameters.map((p) => ({
        name: p.name,
        in: p.location,
        required: p.required,
        description: p.description,
        schema: p.schema ?? { type: 'string' },
      })),
      responses: Object.fromEntries(
        ep.responses.map((r) => [
          r.statusCode,
          {
            description: r.description || `Response ${r.statusCode}`,
            content: Object.fromEntries(
              r.content.map((c) => [c.contentType, { schema: c.schema ?? { type: 'object' } }])
            ),
          },
        ])
      ),
    };

    if (ep.requestBody) {
      operation.requestBody = {
        required: ep.requestBody.required,
        description: ep.requestBody.description,
        content: Object.fromEntries(
          ep.requestBody.content.map((c) => [c.contentType, { schema: c.schema ?? { type: 'object' } }])
        ),
      };
    }

    paths[ep.path][methodLower] = operation;
  }

  return {
    openapi: '3.1.0',
    info: {
      title: spec.metadata.title,
      version: spec.metadata.version,
      description: spec.metadata.description,
    },
    servers: spec.servers,
    paths,
    components: {
      schemas: spec.schemas,
      securitySchemes: spec.securitySchemes,
    },
  };
}

export function downloadJsonFile(filename: string, data: object): void {
  if (typeof window === 'undefined') return;
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.json') ? filename : `${filename}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
