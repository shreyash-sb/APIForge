import assert from 'node:assert/strict';
import test from 'node:test';
import { TestGeneratorService } from '../src/services/testGenerator.service.js';
import type { ApiSpecification } from '../src/types/openapi.types.js';

const spec: ApiSpecification = {
  version: 'openapi-3.1', metadata: { title: 'Phase 4', version: '1' }, servers: [{ url: 'https://api.example.test' }],
  schemas: {
    Address: { type: 'object', required: ['code'], properties: { code: { type: 'string', enum: ['A1', 'B2'] } } },
    Payload: { allOf: [{ type: 'object', required: ['name'], properties: { name: { type: 'string', constraints: { minLength: 2, maxLength: 4, pattern: '^[A-Z]+$' } }, low: { type: 'integer', constraints: { minimum: 10 } }, high: { type: 'integer', constraints: { maximum: 100 } }, exclusiveLow: { type: 'integer', constraints: { exclusiveMinimum: 10 } }, exclusiveHigh: { type: 'integer', constraints: { exclusiveMaximum: 100 } }, tags: { type: 'array', constraints: { minItems: 1, maxItems: 2 }, items: { type: 'string' } }, role: { type: 'string', enum: ['admin', 'user'] }, address: { reference: '#/components/schemas/Address' } } }], additionalProperties: false },
    Choice: { oneOf: [{ type: 'object', required: ['kind'], properties: { kind: { type: 'string', enum: ['one'] } } }, { type: 'object', required: ['two'], properties: { two: { type: 'boolean' } } }] },
    Either: { anyOf: [{ type: 'object', required: ['value'], properties: { value: { type: 'string' } } }] },
    Cycle: { type: 'object', properties: { self: { reference: '#/components/schemas/Cycle' } } },
  }, securitySchemes: { oauth: { type: 'oauth2' }, oidc: { type: 'openIdConnect' } },
  endpoints: [
    { id: 'POST /payload', method: 'POST', path: '/payload', tags: [], deprecated: false, parameters: [], requestBody: { required: true, content: [{ contentType: 'application/json', schema: { reference: '#/components/schemas/Payload' } }] }, responses: [{ statusCode: '201', headers: {}, content: [] }, { statusCode: '400', headers: {}, content: [] }], security: [{ scheme: 'oauth', scopes: [] }] },
    { id: 'POST /choice', method: 'POST', path: '/choice', tags: [], deprecated: false, parameters: [], requestBody: { required: true, content: [{ contentType: 'application/json', schema: { reference: '#/components/schemas/Choice' } }] }, responses: [{ statusCode: '200', headers: {}, content: [] }], security: [{ scheme: 'oidc', scopes: [] }] },
    { id: 'GET /cookie', method: 'GET', path: '/cookie', tags: [], deprecated: false, parameters: [{ name: 'session', location: 'cookie', required: true, schema: { type: 'string', enum: ['ok'] } }], responses: [{ statusCode: '200', headers: {}, content: [] }], security: null },
  ],
};

test('generates deterministic bounded Phase 4 cases for constraints, nested refs, composition, cookies, and security templates', () => {
  const generator = new TestGeneratorService(); const settings = { categories: ['POSITIVE', 'NEGATIVE', 'BOUNDARY', 'SECURITY', 'SCHEMA', 'PARAMETER'] as const, maxTestsPerEndpoint: 50 };
  const first = generator.generate(spec, settings); assert.deepEqual(first, generator.generate(spec, settings)); assert.ok(first.tests.every((item) => item.id && item.request));
  const payloadTests = first.tests.filter((item) => item.metadata.sourceEndpointId === 'POST /payload'); const rules = new Set(payloadTests.map((item) => item.metadata.rule));
  for (const rule of ['body-minimum', 'body-maximum', 'body-exclusive-minimum', 'body-exclusive-maximum', 'body-min-length', 'body-max-length', 'body-min-items', 'body-max-items', 'invalid-enum', 'pattern-invalid']) assert.ok([...rules].some((value) => value.includes(rule)) || payloadTests.some((item) => item.metadata.rule === rule), `${rule}; found: ${[...rules].join(', ')}`);
  const valid = payloadTests.find((item) => item.type === 'POSITIVE'); assert.match(valid?.request.body ?? '', /"role":"admin"/); assert.match(valid?.request.body ?? '', /"code":"A1"/); assert.ok(payloadTests.some((item) => item.metadata.mutation?.includes('address.code-invalid-enum'))); assert.ok(payloadTests.some((item) => item.request.auth.type === 'bearer' && item.request.auth.token === '{{OAUTH2_ACCESS_TOKEN}}'));
  const choice = first.tests.find((item) => item.metadata.sourceEndpointId === 'POST /choice' && item.type === 'POSITIVE'); assert.match(choice?.request.body ?? '', /"kind":"one"/); assert.ok(first.tests.some((item) => item.metadata.sourceEndpointId === 'POST /choice' && item.request.auth.type === 'bearer' && item.request.auth.token === '{{OPENID_CONNECT_ACCESS_TOKEN}}'));
  const cookie = first.tests.find((item) => item.metadata.sourceEndpointId === 'GET /cookie' && item.metadata.rule === 'parameter-invalid-enum'); assert.match(cookie?.request.headers?.find((header) => header.key === 'Cookie')?.value ?? '', /session=__invalid_enum__/);
  assert.ok(first.tests.length <= 150);
});

test('handles anyOf and cyclic references safely', () => {
  const generator = new TestGeneratorService(); const copy = structuredClone(spec); copy.endpoints[0].requestBody = { required: true, content: [{ contentType: 'application/json', schema: { reference: '#/components/schemas/Either' } }] }; copy.endpoints[0].id = 'POST /either'; copy.endpoints[0].path = '/either'; copy.endpoints[0].security = null;
  const suite = generator.generate(copy, { categories: ['POSITIVE'], maxTestsPerEndpoint: 2 }); assert.match(suite.tests.find((item) => item.metadata.sourceEndpointId === 'POST /either')?.request.body ?? '', /"value":"example"/);
  copy.endpoints[0].requestBody = { required: true, content: [{ contentType: 'application/json', schema: { reference: '#/components/schemas/Cycle' } }] }; assert.doesNotThrow(() => generator.generate(copy, { categories: ['POSITIVE', 'SCHEMA'], maxTestsPerEndpoint: 2 }));
});
