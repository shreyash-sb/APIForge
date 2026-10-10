import assert from 'node:assert/strict';
import test from 'node:test';
import { TestGeneratorService } from '../src/services/testGenerator.service.js';
import type { ApiSpecification } from '../src/types/openapi.types.js';

const specification: ApiSpecification = {
  version: 'openapi-3.1', metadata: { title: 'Generator API', version: '1.0.0' }, servers: [{ url: 'https://api.example.test/v1' }],
  schemas: {
    Address: { type: 'object', required: ['city'], properties: { city: { type: 'string', constraints: { minLength: 2 } } } },
    User: { type: 'object', required: ['email', 'age'], properties: { email: { type: 'string', format: 'email' }, age: { type: 'integer', constraints: { minimum: 18, maximum: 99 } }, role: { type: 'string', enum: ['admin', 'member'] }, tags: { type: 'array', constraints: { minItems: 1, maxItems: 2 }, items: { type: 'string' } }, address: { reference: '#/components/schemas/Address' } } },
  },
  securitySchemes: { bearer: { type: 'http', scheme: 'bearer' }, key: { type: 'apiKey', name: 'X-Key', location: 'header' }, basic: { type: 'http', scheme: 'basic' } },
  endpoints: [{ id: 'POST /users/{id}', method: 'POST', path: '/users/{id}', summary: 'Create User', tags: ['Users'], deprecated: false, parameters: [{ name: 'id', location: 'path', required: true, schema: { type: 'integer', constraints: { minimum: 1 } } }, { name: 'page', location: 'query', required: true, schema: { type: 'integer', constraints: { minimum: 1 } } }, { name: 'X-Trace', location: 'header', required: false, schema: { type: 'string' } }, { name: 'session', location: 'cookie', required: false, schema: { type: 'string' } }], requestBody: { required: true, content: [{ contentType: 'application/json', schema: { reference: '#/components/schemas/User' } }] }, responses: [{ statusCode: '201', description: 'Created', headers: {}, content: [{ contentType: 'application/json', schema: { reference: '#/components/schemas/User' } }] }, { statusCode: '400', description: 'Invalid', headers: {}, content: [] }, { statusCode: '401', description: 'Unauthorized', headers: {}, content: [] }], security: [{ scheme: 'bearer', scopes: [] }] }],
};

const settings = { categories: ['POSITIVE', 'NEGATIVE', 'BOUNDARY', 'SECURITY', 'SCHEMA', 'PARAMETER'] as const, maxTestsPerEndpoint: 30 };

test('generates deterministic executable-ready tests from normalized schemas', () => {
  const generator = new TestGeneratorService();
  const first = generator.generate(specification, settings);
  const second = generator.generate(specification, settings);
  assert.deepEqual(first, second);
  assert.ok(first.tests.some((item) => item.type === 'POSITIVE'));
  assert.ok(first.tests.some((item) => item.type === 'SCHEMA' && item.name.includes('Missing Required email')));
  assert.ok(first.tests.some((item) => item.type === 'BOUNDARY' && item.name.includes('Below Minimum age')));
  assert.ok(first.tests.some((item) => item.type === 'SECURITY' && item.name.includes('Missing bearer')));
  assert.ok(first.tests.some((item) => item.type === 'PARAMETER' && item.name.includes('page')));
  const valid = first.tests.find((item) => item.type === 'POSITIVE');
  assert.equal(valid?.request.method, 'POST');
  assert.equal(valid?.request.url, 'https://api.example.test/v1/users/1');
  assert.equal(valid?.request.queryParams?.[0].key, 'page');
  assert.equal(valid?.request.headers?.some((header) => header.key === 'Cookie'), true);
  assert.match(valid?.request.body ?? '', /user@example.com/);
  const missingPath = first.tests.find((item) => item.name.includes('Missing Required id'));
  assert.equal(missingPath?.request.url, 'https://api.example.test/v1/users');
});

test('honors category filtering, endpoint limits, and documented response expectations', () => {
  const suite = new TestGeneratorService().generate(specification, { categories: ['POSITIVE'], maxTestsPerEndpoint: 1 });
  assert.equal(suite.tests.length, 1);
  assert.equal(suite.tests[0].type, 'POSITIVE');
  assert.deepEqual(suite.tests[0].expected.statusCodes, ['201']);
  assert.equal(suite.groups[0].tests.length, 1);
});

test('handles unsupported or missing schema information without crashing', () => {
  const incomplete = structuredClone(specification);
  incomplete.endpoints[0].requestBody = { required: false, content: [{ contentType: 'application/json' }] };
  incomplete.endpoints[0].parameters = [{ name: 'free', location: 'query', required: false }];
  const suite = new TestGeneratorService().generate(incomplete, { categories: ['POSITIVE', 'NEGATIVE', 'BOUNDARY'], maxTestsPerEndpoint: 10 });
  assert.equal(suite.tests.length, 1);
  assert.equal(suite.tests[0].type, 'POSITIVE');
});
