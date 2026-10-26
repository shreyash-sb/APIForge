import { describe, it, expect } from 'vitest';
import { exportMockRoutesToOpenApi, exportCollectionToOpenApi } from '../openApiExporter';
import type { MockRoute } from '@/types/mockServer.types';
import type { ApiCollection } from '@/types/request.types';

describe('OpenAPI 3.1 Reverse Exporter', () => {
  it('exports mock routes to a valid OpenAPI 3.1.0 document structure', () => {
    const routes: MockRoute[] = [
      {
        id: 'r1',
        name: 'List Products',
        method: 'GET',
        path: '/products',
        statusCode: 200,
        headers: {},
        body: [{ id: 1, name: 'Phone', inStock: true }],
        enabled: true,
      },
      {
        id: 'r2',
        name: 'Create Product',
        method: 'POST',
        path: '/products',
        statusCode: 201,
        headers: {},
        body: { id: 2, name: 'Laptop' },
        enabled: true,
      },
    ];

    const doc = exportMockRoutesToOpenApi(routes, { title: 'Product Service API' });
    expect(doc.openapi).toBe('3.1.0');
    expect((doc.info as { title: string }).title).toBe('Product Service API');
    const paths = doc.paths as Record<string, Record<string, any>>;
    expect(paths['/products']).toBeDefined();
    expect(paths['/products'].get).toBeDefined();
    expect(paths['/products'].post).toBeDefined();
    expect(paths['/products'].get.responses['200']).toBeDefined();
    expect(paths['/products'].post.responses['201']).toBeDefined();
  });

  it('exports a collection to OpenAPI 3.1 with parameters and requestBody', () => {
    const collection: ApiCollection = {
      id: 'c1',
      name: 'Auth Collection',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      requests: [
        {
          id: 'req1',
          name: 'Login Request',
          method: 'POST',
          url: 'https://api.example.com/auth/login',
          queryParams: [{ id: 'q1', key: 'redirect', value: 'dashboard', enabled: true }],
          headers: [],
          body: JSON.stringify({ email: 'user@example.com', pass: 'secret' }),
          auth: { type: 'none' },
        },
      ],
    };

    const doc = exportCollectionToOpenApi(collection);
    expect(doc.openapi).toBe('3.1.0');
    const paths = doc.paths as Record<string, Record<string, any>>;
    expect(paths['/auth/login']).toBeDefined();
    expect(paths['/auth/login'].post).toBeDefined();
    expect(paths['/auth/login'].post.parameters[0].name).toBe('redirect');
    expect(paths['/auth/login'].post.requestBody).toBeDefined();
  });
});
