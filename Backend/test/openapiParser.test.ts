import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { OpenApiParserService } from '../src/services/openapiParser.service.js';

const service = new OpenApiParserService();
const fixture = (name: string) => readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('normalizes OpenAPI 3 JSON metadata, endpoints, refs, schemas, and security', async () => {
  const result = await service.importSpecification(await fixture('openapi3.json'));
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.specification.version, 'openapi-3.0');
  assert.equal(result.specification.servers.length, 2);
  assert.equal(result.specification.endpoints.length, 2);
  const get = result.specification.endpoints.find((endpoint) => endpoint.method === 'GET');
  assert.equal(get?.parameters.length, 2);
  assert.equal(get?.responses.length, 2);
  assert.equal(get?.responses[0].content[0].schema?.reference, '#/components/schemas/User');
  assert.equal(result.specification.schemas.User.properties?.name.constraints?.minLength, 1);
  assert.equal(result.specification.securitySchemes.bearerAuth.scheme, 'bearer');
});

test('accepts OpenAPI 3.1 YAML', async () => {
  const result = await service.importSpecification(await fixture('openapi31.yaml'));
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.specification.version, 'openapi-3.1');
});

test('normalizes Swagger 2 servers, body parameters, definitions, and API keys', async () => {
  const result = await service.importSpecification(await fixture('swagger2.json'));
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(result.specification.servers.map((server) => server.url), ['https://legacy.example.com/api', 'http://legacy.example.com/api']);
  assert.equal(result.specification.endpoints[0].requestBody?.content[0].contentType, 'application/json');
  assert.equal(result.specification.schemas.Item.properties?.id.type, 'integer');
  assert.equal(result.specification.securitySchemes.key.location, 'query');
});

test('rejects empty, malformed, unsupported, and external-reference inputs', async () => {
  for (const input of ['', '{ invalid json', JSON.stringify({ openapi: '4.0.0', info: { title: 'X', version: '1' }, paths: {} }), "openapi: 3.0.0\ninfo: { title: X, version: '1' }\npaths: {}\ncomponents:\n  schemas:\n    X:\n      $ref: https://example.com/x.yaml"]) {
    const result = await service.importSpecification(input);
    assert.equal(result.success, false);
  }
});

test('rejects a specification missing required metadata', async () => {
  const result = await service.importSpecification('openapi: 3.0.0\ninfo: { title: Missing Version }\npaths: {}');
  assert.equal(result.success, false);
});

test('rejects malformed operations and unresolved internal references', async () => {
  for (const input of [
    "openapi: 3.0.0\ninfo: { title: X, version: '1' }\npaths:\n  /users:\n    get: {}",
    "openapi: 3.0.0\ninfo: { title: X, version: '1' }\npaths:\n  /users:\n    get:\n      responses:\n        '200': { description: OK, content: { application/json: { schema: { $ref: '#/components/schemas/Missing' } } } }",
  ]) {
    const result = await service.importSpecification(input);
    assert.equal(result.success, false);
  }
});

test('extracts every supported HTTP method, parameter location, form request body, response schema, and security scheme', async () => {
  const operation = {
    parameters: [
      { name: 'query', in: 'query', schema: { type: 'string' } },
      { name: 'header', in: 'header', schema: { type: 'string' } },
      { name: 'cookie', in: 'cookie', schema: { type: 'string' } },
    ],
    requestBody: { content: { 'application/x-www-form-urlencoded': { schema: { type: 'object', properties: { name: { type: 'string' } } } } } },
    responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } } } },
  };
  const paths = Object.fromEntries(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'].map((method) => [`/${method}`, { [method]: operation }]));
  const result = await service.importSpecification(JSON.stringify({
    openapi: '3.1.0', info: { title: 'Coverage', version: '1.0.0' }, paths,
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' }, basic: { type: 'http', scheme: 'basic' }, apiKey: { type: 'apiKey', name: 'X-Key', in: 'header' }, oauth: { type: 'oauth2', flows: { clientCredentials: { tokenUrl: 'https://example.com/token', scopes: {} } } }, oidc: { type: 'openIdConnect', openIdConnectUrl: 'https://example.com/.well-known/openid-configuration' } } },
  }));
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(result.specification.endpoints.map((endpoint) => endpoint.method), ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE']);
  assert.deepEqual(result.specification.endpoints[0].parameters.map((parameter) => parameter.location), ['query', 'header', 'cookie']);
  assert.equal(result.specification.endpoints[0].requestBody?.content[0].contentType, 'application/x-www-form-urlencoded');
  assert.equal(result.specification.endpoints[0].responses[0].content[0].schema?.properties?.success.type, 'boolean');
  assert.deepEqual(Object.values(result.specification.securitySchemes).map((scheme) => scheme.type).sort(), ['apiKey', 'http', 'http', 'oauth2', 'openIdConnect']);
});
