import assert from 'node:assert/strict';
import test from 'node:test';
import {
  VariableInterpolatorService,
  VariableInterpolationError,
} from '../src/services/variableInterpolator.service.js';
import type { ApiRequest } from '../src/types/request.types.js';
import type { EnvironmentProfile } from '../src/types/workflow.types.js';

test('1. Basic string substitution', () => {
  const service = new VariableInterpolatorService();
  const context = { name: 'APIForge', version: 'v1.0' };
  const res = service.interpolateString('Welcome to {{name}} ({{version}})', context);

  assert.equal(res.value, 'Welcome to APIForge (v1.0)');
  assert.deepEqual(res.resolvedVariables.sort(), ['name', 'version'].sort());
  assert.equal(res.containsSecret, false);
});

test('2. URL interpolation', () => {
  const service = new VariableInterpolatorService();
  const context = {
    protocol: 'https',
    host: 'api.example.com',
    userId: 'usr_9988',
  };
  const res = service.interpolateString('{{protocol}}://{{host}}/v1/users/{{userId}}', context);

  assert.equal(res.value, 'https://api.example.com/v1/users/usr_9988');
  assert.deepEqual(res.resolvedVariables.sort(), ['host', 'protocol', 'userId'].sort());
});

test('3. Query parameter interpolation', () => {
  const service = new VariableInterpolatorService();
  const request: ApiRequest = {
    method: 'GET',
    url: 'https://api.example.com/search',
    queryParams: [
      { key: '{{queryParamKey}}', value: '{{queryParamVal}}', enabled: true },
      { key: 'limit', value: '{{limit}}', enabled: false },
    ],
    headers: [],
    auth: { type: 'none' },
  };

  const context = {
    queryParamKey: 'filter',
    queryParamVal: 'active_users',
    limit: 50,
  };

  const res = service.interpolateRequest(request, context);
  assert.equal(res.value.queryParams?.[0].key, 'filter');
  assert.equal(res.value.queryParams?.[0].value, 'active_users');
  assert.equal(res.value.queryParams?.[0].enabled, true);
  assert.equal(res.value.queryParams?.[1].value, '50');
  assert.equal(res.value.queryParams?.[1].enabled, false);
});

test('4. Header interpolation', () => {
  const service = new VariableInterpolatorService();
  const request: ApiRequest = {
    method: 'POST',
    url: 'https://api.example.com/items',
    headers: [
      { key: 'X-Tenant-ID', value: '{{tenantId}}', enabled: true },
      { key: 'Content-Type', value: 'application/json', enabled: true },
    ],
    auth: { type: 'none' },
  };

  const context = { tenantId: 'tenant_omega_42' };
  const res = service.interpolateRequest(request, context);

  assert.equal(res.value.headers?.[0].value, 'tenant_omega_42');
  assert.equal(res.value.headers?.[1].value, 'application/json');
});

test('5. JSON body interpolation with structured fields', () => {
  const service = new VariableInterpolatorService();
  const request: ApiRequest = {
    method: 'POST',
    url: 'https://api.example.com/users',
    body: JSON.stringify({
      name: '{{name}}',
      role: '{{role}}',
    }),
    auth: { type: 'none' },
  };

  const context = { name: 'Ada Lovelace', role: 'admin' };
  const res = service.interpolateRequest(request, context);

  const parsed = JSON.parse(res.value.body!);
  assert.equal(parsed.name, 'Ada Lovelace');
  assert.equal(parsed.role, 'admin');
});

test('6. Numeric variable preservation in JSON', () => {
  const service = new VariableInterpolatorService();
  const request: ApiRequest = {
    method: 'POST',
    url: 'https://api.example.com/orders',
    body: JSON.stringify({
      orderId: '{{orderId}}',
      amount: '{{amount}}',
      taxRate: '{{taxRate}}',
    }),
    auth: { type: 'none' },
  };

  const context = {
    orderId: 98765,
    amount: 149.99,
    taxRate: 0.08,
  };

  const res = service.interpolateRequest(request, context);
  const parsed = JSON.parse(res.value.body!);

  assert.strictEqual(parsed.orderId, 98765);
  assert.strictEqual(typeof parsed.orderId, 'number');
  assert.strictEqual(parsed.amount, 149.99);
  assert.strictEqual(parsed.taxRate, 0.08);
});

test('7. Boolean and null values preservation in JSON', () => {
  const service = new VariableInterpolatorService();
  const body = JSON.stringify({
    isActive: '{{isActive}}',
    isArchived: '{{isArchived}}',
    deletedAt: '{{deletedAt}}',
  });

  const context = {
    isActive: true,
    isArchived: false,
    deletedAt: null,
  };

  const res = service.interpolateBody(body, service.normalizeContext(context));
  const parsed = JSON.parse(res.value);

  assert.strictEqual(parsed.isActive, true);
  assert.strictEqual(parsed.isArchived, false);
  assert.strictEqual(parsed.deletedAt, null);
});

test('8. Arrays and nested objects interpolation', () => {
  const service = new VariableInterpolatorService();
  const body = JSON.stringify({
    user: {
      profile: {
        city: '{{city}}',
        coordinates: ['{{lat}}', '{{lon}}'],
      },
    },
    tags: ['{{primaryTag}}', 'general'],
  });

  const context = {
    city: 'San Francisco',
    lat: 37.7749,
    lon: -122.4194,
    primaryTag: 'engineering',
  };

  const res = service.interpolateBody(body, service.normalizeContext(context));
  const parsed = JSON.parse(res.value);

  assert.equal(parsed.user.profile.city, 'San Francisco');
  assert.strictEqual(parsed.user.profile.coordinates[0], 37.7749);
  assert.strictEqual(parsed.user.profile.coordinates[1], -122.4194);
  assert.equal(parsed.tags[0], 'engineering');
  assert.equal(parsed.tags[1], 'general');
});

test('9. Embedded text substitution', () => {
  const service = new VariableInterpolatorService();
  const context = { token: 'jwt_token_xyz_123', prefix: 'api', id: '456' };

  const authHeader = service.interpolateString('Bearer {{token}}', context);
  assert.equal(authHeader.value, 'Bearer jwt_token_xyz_123');

  const formattedId = service.interpolateString('urn:{{prefix}}:entity:{{id}}', context);
  assert.equal(formattedId.value, 'urn:api:entity:456');
});

test('10. Missing variables fail with structured error', () => {
  const service = new VariableInterpolatorService();
  const context = { definedVar: 'value' };

  assert.throws(
    () => service.interpolateString('{{definedVar}} and {{missingVar}}', context),
    (err: unknown) => {
      assert(err instanceof VariableInterpolationError);
      assert.equal(err.code, 'UNRESOLVED_VARIABLE');
      assert.equal(err.variableName, 'missingVar');
      assert(err.message.includes('missingVar'));
      return true;
    }
  );
});

test('11. Malformed template syntax is rejected safely', () => {
  const service = new VariableInterpolatorService();
  const context = { a: '1' };

  // Unclosed opening brace
  assert.throws(
    () => service.interpolateString('https://api.com/{{unclosed', context),
    (err: unknown) => {
      assert(err instanceof VariableInterpolationError);
      assert.equal(err.code, 'MALFORMED_VARIABLE_SYNTAX');
      return true;
    }
  );

  // Empty variable braces
  assert.throws(
    () => service.interpolateString('https://api.com/{{}}', context),
    (err: unknown) => {
      assert(err instanceof VariableInterpolationError);
      assert.equal(err.code, 'MALFORMED_VARIABLE_SYNTAX');
      return true;
    }
  );

  assert.throws(
    () => service.interpolateString('https://api.com/{{   }}', context),
    (err: unknown) => {
      assert(err instanceof VariableInterpolationError);
      assert.equal(err.code, 'MALFORMED_VARIABLE_SYNTAX');
      return true;
    }
  );
});

test('12. Invalid variable names are rejected', () => {
  const service = new VariableInterpolatorService();
  const context = { 'valid_var': '123' };

  assert.throws(
    () => service.interpolateString('https://api.com/{{foo@bar}}', context),
    (err: unknown) => {
      assert(err instanceof VariableInterpolationError);
      assert(err.code === 'INVALID_VARIABLE_NAME' || err.code === 'MALFORMED_VARIABLE_SYNTAX');
      return true;
    }
  );
});

test('13. Cyclic variable references are detected', () => {
  const service = new VariableInterpolatorService();
  const context = {
    varA: '{{varB}}',
    varB: '{{varC}}',
    varC: '{{varA}}',
  };

  assert.throws(
    () => service.interpolateString('Result: {{varA}}', context),
    (err: unknown) => {
      assert(err instanceof VariableInterpolationError);
      assert.equal(err.code, 'CYCLIC_VARIABLE');
      return true;
    }
  );
});

test('14. Maximum expansion depth is enforced', () => {
  const service = new VariableInterpolatorService(3);
  const context = {
    lvl0: '{{lvl1}}',
    lvl1: '{{lvl2}}',
    lvl2: '{{lvl3}}',
    lvl3: '{{lvl4}}',
    lvl4: 'done',
  };

  assert.throws(
    () => service.interpolateString('{{lvl0}}', context, { maxDepth: 3 }),
    (err: unknown) => {
      assert(err instanceof VariableInterpolationError);
      assert.equal(err.code, 'MAX_DEPTH_EXCEEDED');
      return true;
    }
  );
});

test('15. Secret redaction and metadata tracking', () => {
  const service = new VariableInterpolatorService();
  const context: Record<string, { value: unknown; isSecret: boolean }> = {
    publicHost: { value: 'api.example.com', isSecret: false },
    secretToken: { value: 'super_secret_password_999', isSecret: true },
  };

  const res = service.interpolateString('https://{{publicHost}}/login?token={{secretToken}}', context);
  assert.equal(res.value, 'https://api.example.com/login?token=super_secret_password_999');
  assert.equal(res.containsSecret, true);

  // When error occurs on missing variable, ensure secret is NOT in error message
  assert.throws(
    () => service.interpolateString('https://{{publicHost}}/{{secretToken}}/{{missing}}', context),
    (err: unknown) => {
      assert(err instanceof VariableInterpolationError);
      assert.equal(err.code, 'UNRESOLVED_VARIABLE');
      assert(!err.message.includes('super_secret_password_999'));
      return true;
    }
  );
});

test('16. Input immutability is strictly preserved', () => {
  const service = new VariableInterpolatorService();
  const originalRequest: ApiRequest = Object.freeze({
    method: 'POST',
    url: 'https://{{host}}/items',
    queryParams: Object.freeze([{ key: 'filter', value: '{{filter}}', enabled: true }]),
    headers: Object.freeze([{ key: 'X-App', value: '{{app}}', enabled: true }]),
    body: JSON.stringify({ item: '{{item}}' }),
    auth: Object.freeze({ type: 'bearer', token: '{{token}}' }),
  });

  const context = {
    host: 'api.test.com',
    filter: 'new',
    app: 'APIForge',
    item: 'Gadget',
    token: 'jwt_123',
  };

  const res = service.interpolateRequest(originalRequest, context);

  // Original request remains unchanged
  assert.equal(originalRequest.url, 'https://{{host}}/items');
  assert.equal(originalRequest.queryParams?.[0].value, '{{filter}}');
  assert.equal(originalRequest.headers?.[0].value, '{{app}}');
  assert.equal(originalRequest.auth.type === 'bearer' ? originalRequest.auth.token : '', '{{token}}');

  // Resolved request has interpolated values
  assert.equal(res.value.url, 'https://api.test.com/items');
  assert.equal(res.value.queryParams?.[0].value, 'new');
  assert.equal(res.value.headers?.[0].value, 'APIForge');
  assert.equal(res.value.auth.type === 'bearer' ? res.value.auth.token : '', 'jwt_123');
});

test('17. Multiple occurrences of a variable', () => {
  const service = new VariableInterpolatorService();
  const context = { tag: 'alpha' };
  const res = service.interpolateString('/{{tag}}/items/{{tag}}/details/{{tag}}', context);

  assert.equal(res.value, '/alpha/items/alpha/details/alpha');
  assert.deepEqual(res.resolvedVariables, ['tag']);
});

test('18. Empty string values are handled cleanly', () => {
  const service = new VariableInterpolatorService();
  const context = { emptyValue: '', prefix: 'start' };
  const res = service.interpolateString('{{prefix}}-{{emptyValue}}-end', context);

  assert.equal(res.value, 'start--end');
});

test('19. Variable values containing special characters', () => {
  const service = new VariableInterpolatorService();
  const context = {
    jsonChars: '{"nested": "value", "slash": "a/b/c"}',
    unicode: '🚀 APIForge 日本語',
  };

  const res = service.interpolateString('Message: {{unicode}} - {{jsonChars}}', context);
  assert.equal(res.value, 'Message: 🚀 APIForge 日本語 - {"nested": "value", "slash": "a/b/c"}');
});

test('20. Regression coverage for Auth variants', () => {
  const service = new VariableInterpolatorService();

  // Bearer
  const bearerAuth = service.interpolateAuth(
    { type: 'bearer', token: '{{token}}' },
    service.normalizeContext({ token: 'tok_abc' })
  );
  assert.deepEqual(bearerAuth.value, { type: 'bearer', token: 'tok_abc' });

  // ApiKey in header
  const apiKeyAuth = service.interpolateAuth(
    { type: 'apikey', key: '{{headerName}}', value: '{{apiSecret}}', addTo: 'header' },
    service.normalizeContext({ headerName: 'X-API-KEY', apiSecret: 'sec_123' })
  );
  assert.deepEqual(apiKeyAuth.value, { type: 'apikey', key: 'X-API-KEY', value: 'sec_123', addTo: 'header' });

  // Basic auth
  const basicAuth = service.interpolateAuth(
    { type: 'basic', username: '{{user}}', password: '{{pass}}' },
    service.normalizeContext({ user: 'admin', pass: 'secretPass' })
  );
  assert.deepEqual(basicAuth.value, { type: 'basic', username: 'admin', password: 'secretPass' });

  // No auth
  const noAuth = service.interpolateAuth(
    { type: 'none' },
    service.normalizeContext({})
  );
  assert.deepEqual(noAuth.value, { type: 'none' });
});

test('21. Context normalization from EnvironmentProfile and EnvironmentVariable[]', () => {
  const service = new VariableInterpolatorService();

  const profile: EnvironmentProfile = {
    id: 'env_prod',
    name: 'Production',
    baseUrl: 'https://prod.api.com',
    variables: [
      { name: 'apiKey', value: 'prod_key_123', isSecret: true, enabled: true },
      { name: 'disabledVar', value: 'hidden', isSecret: false, enabled: false },
    ],
  };

  const contextMap = service.normalizeContext(profile);
  assert.equal(contextMap.get('baseUrl')?.value, 'https://prod.api.com');
  assert.equal(contextMap.get('apiKey')?.value, 'prod_key_123');
  assert.equal(contextMap.get('apiKey')?.isSecret, true);
  assert.equal(contextMap.has('disabledVar'), false);

  const res = service.interpolateString('{{baseUrl}}/v1/ping', profile);
  assert.equal(res.value, 'https://prod.api.com/v1/ping');
});

test('22. Non-strict mode preserves unresolved tokens', () => {
  const service = new VariableInterpolatorService();
  const context = { known: 'resolvedValue' };
  const res = service.interpolateString('{{known}} and {{unknown}}', context, { strict: false });

  assert.equal(res.value, 'resolvedValue and {{unknown}}');
  assert.deepEqual(res.resolvedVariables, ['known', 'unknown']);
});

test('23. Object key interpolation in JSON bodies', () => {
  const service = new VariableInterpolatorService();
  const body = JSON.stringify({
    '{{dynamicKey}}': 'dynamicValue',
  });

  const context = { dynamicKey: 'customField' };
  const res = service.interpolateBody(body, service.normalizeContext(context));
  const parsed = JSON.parse(res.value);

  assert.equal(parsed.customField, 'dynamicValue');
});
