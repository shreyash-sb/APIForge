import assert from 'node:assert/strict';
import test from 'node:test';
import { ValidationService } from '../src/services/validation.service.js';
import { ValidationController } from '../src/controllers/validation.controller.js';
import type { ApiSchema } from '../src/types/openapi.types.js';
import type { TestCase } from '../src/types/testCase.types.js';
import type { TestCaseExecutionResult } from '../src/types/testExecution.types.js';

// --- Test Fixture Builders ---

const createTestCase = (overrides?: Partial<TestCase>): TestCase => ({
  id: 'tc_val_1',
  name: 'Sample Validation Test',
  description: 'Validates response contract',
  type: 'POSITIVE',
  priority: 'HIGH',
  enabled: true,
  endpoint: { method: 'GET', path: '/users' },
  request: {
    method: 'GET',
    url: 'https://api.example.test/users',
    queryParams: [],
    headers: [],
    body: null,
    auth: { type: 'none' },
  },
  pathParams: {},
  expected: { statusCodes: ['200'] },
  metadata: { sourceEndpointId: 'GET /users', rule: 'valid-request' },
  ...overrides,
});

const createExecutionResult = (overrides?: Partial<TestCaseExecutionResult>): TestCaseExecutionResult => ({
  executionId: 'exec_val_1',
  testCaseId: 'tc_val_1',
  status: 'PASSED_EXECUTION',
  executedAt: '2026-09-29T20:00:00.000Z',
  durationMs: 45,
  request: {
    method: 'GET',
    url: 'https://api.example.test/users',
    queryParams: [],
    headers: [],
    body: null,
    auth: { type: 'none' },
  },
  response: {
    status: 200,
    statusText: 'OK',
    responseTime: 45,
    headers: { 'content-type': 'application/json' },
    body: { id: 'usr_1', name: 'Alice' },
    size: 32,
  },
  ...overrides,
});

// ============================================================
// 1–4. Status Code & Status Class
// ============================================================

test('1. status code match: expected ["200"], actual 200 -> VALIDATION_PASSED', () => {
  const service = new ValidationService();
  const tc = createTestCase({ expected: { statusCodes: ['200'] } });
  const exec = createExecutionResult({ response: { status: 200, statusText: 'OK', responseTime: 20, headers: {}, body: null, size: 0 } });

  const result = service.validateSingle(tc, exec);
  assert.equal(result.status, 'VALIDATION_PASSED');
  assert.equal(result.summary.failedAssertions, 0);
  assert.equal(result.assertions[0].passed, true);
  assert.equal(result.assertions[0].path, '$.status');
});

test('2. status code mismatch: expected ["200"], actual 404 -> VALIDATION_FAILED', () => {
  const service = new ValidationService();
  const tc = createTestCase({ expected: { statusCodes: ['200'] } });
  const exec = createExecutionResult({ response: { status: 404, statusText: 'Not Found', responseTime: 20, headers: {}, body: null, size: 0 } });

  const result = service.validateSingle(tc, exec);
  assert.equal(result.status, 'VALIDATION_FAILED');
  assert.equal(result.summary.failedAssertions, 1);
  assert.equal(result.assertions[0].passed, false);
  assert.equal(result.assertions[0].expected, '200');
  assert.equal(result.assertions[0].actual, '404');
});

test('3. status class match: expected "4xx", actual 422 -> VALIDATION_PASSED', () => {
  const service = new ValidationService();
  const tc = createTestCase({ expected: { statusClass: '4xx' } });
  const exec = createExecutionResult({ response: { status: 422, statusText: 'Unprocessable', responseTime: 20, headers: {}, body: null, size: 0 } });

  const result = service.validateSingle(tc, exec);
  assert.equal(result.status, 'VALIDATION_PASSED');
  assert.equal(result.assertions[0].passed, true);
  assert.equal(result.assertions[0].expected, '4xx');
  assert.equal(result.assertions[0].actual, '422');
});

test('4. status class mismatch: expected "2xx", actual 500 -> VALIDATION_FAILED', () => {
  const service = new ValidationService();
  const tc = createTestCase({ expected: { statusClass: '2xx' } });
  const exec = createExecutionResult({ response: { status: 500, statusText: 'Server Error', responseTime: 20, headers: {}, body: null, size: 0 } });

  const result = service.validateSingle(tc, exec);
  assert.equal(result.status, 'VALIDATION_FAILED');
  assert.equal(result.summary.failedAssertions, 1);
  assert.equal(result.assertions[0].passed, false);
});

// ============================================================
// 5–8. Headers & Constraints
// ============================================================

test('5. header presence: expected header present in response', () => {
  const service = new ValidationService();
  const tc = createTestCase({
    expected: {
      headers: { 'X-Request-Id': { type: 'string' } },
    },
  });
  const exec = createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 20, headers: { 'X-Request-Id': 'req_xyz' }, body: null, size: 0 },
  });

  const result = service.validateSingle(tc, exec);
  const hdrAssert = result.assertions.find((a) => a.category === 'HEADER');
  assert.ok(hdrAssert);
  assert.equal(hdrAssert.passed, true);
  assert.equal(hdrAssert.path, '$.headers["x-request-id"]');
});

test('6. case-insensitive header matching: expected "X-Correlation-ID", response has "x-correlation-id"', () => {
  const service = new ValidationService();
  const tc = createTestCase({
    expected: {
      headers: { 'X-Correlation-ID': { type: 'string' } },
    },
  });
  const exec = createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 20, headers: { 'x-correlation-id': 'corr-999' }, body: null, size: 0 },
  });

  const result = service.validateSingle(tc, exec);
  const hdrAssert = result.assertions.find((a) => a.category === 'HEADER');
  assert.ok(hdrAssert);
  assert.equal(hdrAssert.passed, true);
});

test('7. missing header: expected response header is missing', () => {
  const service = new ValidationService();
  const tc = createTestCase({
    expected: {
      headers: { 'X-RateLimit-Remaining': { type: 'integer' } },
    },
  });
  const exec = createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 20, headers: {}, body: null, size: 0 },
  });

  const result = service.validateSingle(tc, exec);
  const hdrAssert = result.assertions.find((a) => a.category === 'HEADER');
  assert.ok(hdrAssert);
  assert.equal(hdrAssert.passed, false);
  assert.equal(hdrAssert.actual, 'Header missing');
});

test('8. header enum & pattern constraint: validates enum values and regex patterns', () => {
  const service = new ValidationService();
  const tc = createTestCase({
    expected: {
      headers: {
        'X-Env': { type: 'string', enum: ['prod', 'staging'] },
        'X-Version': { type: 'string', constraints: { pattern: '^v[0-9]+$' } },
      },
    },
  });

  // 8a: match
  const execPass = createExecutionResult({
    response: {
      status: 200,
      statusText: 'OK',
      responseTime: 20,
      headers: { 'x-env': 'prod', 'x-version': 'v2' },
      body: null,
      size: 0,
    },
  });
  const passResult = service.validateSingle(tc, execPass);
  assert.equal(passResult.assertions.filter((a) => a.category === 'HEADER').every((a) => a.passed), true);

  // 8b: mismatch
  const execFail = createExecutionResult({
    response: {
      status: 200,
      statusText: 'OK',
      responseTime: 20,
      headers: { 'x-env': 'dev', 'x-version': 'invalid-version' },
      body: null,
      size: 0,
    },
  });
  const failResult = service.validateSingle(tc, execFail);
  assert.equal(failResult.assertions.filter((a) => a.category === 'HEADER' && !a.passed).length, 2);
});

// ============================================================
// 9–10. Content-Type Validation
// ============================================================

test('9. content-type match: application/json and application/json; charset=utf-8 treated as same', () => {
  const service = new ValidationService();
  const tc = createTestCase({
    expected: {
      responseSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
    },
  });
  const exec = createExecutionResult({
    response: {
      status: 200,
      statusText: 'OK',
      responseTime: 20,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: { ok: true },
      size: 10,
    },
  });

  const result = service.validateSingle(tc, exec);
  const ctAssert = result.assertions.find((a) => a.category === 'CONTENT_TYPE');
  assert.ok(ctAssert);
  assert.equal(ctAssert.passed, true);
  assert.equal(ctAssert.actual, 'application/json');
});

test('10. content-type mismatch: text/html when application/json expected', () => {
  const service = new ValidationService();
  const tc = createTestCase({
    expected: {
      responseSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
    },
  });
  const exec = createExecutionResult({
    response: {
      status: 200,
      statusText: 'OK',
      responseTime: 20,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: { ok: true },
      size: 10,
    },
  });

  const result = service.validateSingle(tc, exec);
  const ctAssert = result.assertions.find((a) => a.category === 'CONTENT_TYPE');
  assert.ok(ctAssert);
  assert.equal(ctAssert.passed, false);
  assert.equal(ctAssert.actual, 'text/html');
});

// ============================================================
// 11–14. Body Parsing & Structure
// ============================================================

test('11. valid JSON / schema: matches complete object schema', () => {
  const service = new ValidationService();
  const tc = createTestCase({
    expected: {
      responseSchema: {
        type: 'object',
        required: ['id', 'email'],
        properties: {
          id: { type: 'string' },
          email: { type: 'string' },
        },
      },
    },
  });
  const exec = createExecutionResult({
    response: {
      status: 200,
      statusText: 'OK',
      responseTime: 20,
      headers: { 'content-type': 'application/json' },
      body: { id: 'usr_100', email: 'user@example.com' },
      size: 40,
    },
  });

  const result = service.validateSingle(tc, exec);
  assert.equal(result.status, 'VALIDATION_PASSED');
  assert.equal(result.summary.failedAssertions, 0);
});

test('12. malformed JSON string response fails with SCHEMA_STRUCTURE', () => {
  const service = new ValidationService();
  const tc = createTestCase({
    expected: {
      responseSchema: { type: 'object' },
    },
  });
  const exec = createExecutionResult({
    response: {
      status: 200,
      statusText: 'OK',
      responseTime: 20,
      headers: { 'content-type': 'application/json' },
      body: '{ invalid json: true, ',
      size: 20,
    },
  });

  const result = service.validateSingle(tc, exec);
  assert.equal(result.status, 'VALIDATION_FAILED');
  const bodyAssert = result.assertions.find((a) => a.path === '$.body');
  assert.ok(bodyAssert);
  assert.equal(bodyAssert.category, 'SCHEMA_STRUCTURE');
  assert.equal(bodyAssert.passed, false);
});

test('13. missing body fails with SCHEMA_STRUCTURE', () => {
  const service = new ValidationService();
  const tc = createTestCase({
    expected: {
      responseSchema: { type: 'object' },
    },
  });
  const exec = createExecutionResult({
    response: {
      status: 200,
      statusText: 'OK',
      responseTime: 20,
      headers: {},
      body: undefined,
      size: 0,
    },
  });

  const result = service.validateSingle(tc, exec);
  assert.equal(result.status, 'VALIDATION_FAILED');
  const bodyAssert = result.assertions.find((a) => a.path === '$.body');
  assert.ok(bodyAssert);
  assert.equal(bodyAssert.category, 'SCHEMA_STRUCTURE');
  assert.equal(bodyAssert.passed, false);
});

test('14. non-JSON response body fails schema validation', () => {
  const service = new ValidationService();
  const tc = createTestCase({
    expected: {
      responseSchema: { type: 'object', properties: { count: { type: 'number' } } },
    },
  });
  const exec = createExecutionResult({
    response: {
      status: 200,
      statusText: 'OK',
      responseTime: 20,
      headers: { 'content-type': 'text/plain' },
      body: 12345, // primitive number when object expected
      size: 5,
    },
  });

  const result = service.validateSingle(tc, exec);
  assert.equal(result.status, 'VALIDATION_FAILED');
  const typeAssert = result.assertions.find((a) => a.path === '$.body');
  assert.ok(typeAssert);
  assert.equal(typeAssert.category, 'SCHEMA_TYPE');
  assert.equal(typeAssert.actual, 'number');
});

// ============================================================
// 15–18. Types & Object Properties
// ============================================================

test('15. primitive type mismatch: string expected but received boolean', () => {
  const service = new ValidationService();
  const tc = createTestCase({
    expected: {
      responseSchema: {
        type: 'object',
        properties: { name: { type: 'string' } },
      },
    },
  });
  const exec = createExecutionResult({
    response: {
      status: 200,
      statusText: 'OK',
      responseTime: 20,
      headers: {},
      body: { name: true },
      size: 15,
    },
  });

  const result = service.validateSingle(tc, exec);
  const assertNode = result.assertions.find((a) => a.path === '$.body.name');
  assert.ok(assertNode);
  assert.equal(assertNode.passed, false);
  assert.equal(assertNode.expected, 'string');
  assert.equal(assertNode.actual, 'boolean');
});

test('16. integer validation: passes on integer and fails on float', () => {
  const service = new ValidationService();
  const tc = createTestCase({
    expected: {
      responseSchema: {
        type: 'object',
        properties: { count: { type: 'integer' } },
      },
    },
  });

  // Integer pass
  const passResult = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: { count: 42 }, size: 10 },
  }));
  assert.equal(passResult.status, 'VALIDATION_PASSED');

  // Float fail
  const failResult = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: { count: 3.14159 }, size: 10 },
  }));
  assert.equal(failResult.status, 'VALIDATION_FAILED');
  const node = failResult.assertions.find((a) => a.path === '$.body.count');
  assert.ok(node);
  assert.equal(node.passed, false);
});

test('17. required property missing in object', () => {
  const service = new ValidationService();
  const tc = createTestCase({
    expected: {
      responseSchema: {
        type: 'object',
        required: ['id', 'username', 'email'],
        properties: {
          id: { type: 'string' },
          username: { type: 'string' },
          email: { type: 'string' },
        },
      },
    },
  });
  const exec = createExecutionResult({
    response: {
      status: 200,
      statusText: 'OK',
      responseTime: 20,
      headers: {},
      body: { id: 'usr_1', email: 'test@example.com' }, // username missing
      size: 30,
    },
  });

  const result = service.validateSingle(tc, exec);
  const reqAssert = result.assertions.find((a) => a.category === 'SCHEMA_REQUIRED');
  assert.ok(reqAssert);
  assert.equal(reqAssert.path, '$.body.username');
  assert.equal(reqAssert.passed, false);
});

test('18. additionalProperties=false fails when extraneous property is present', () => {
  const service = new ValidationService();
  const tc = createTestCase({
    expected: {
      responseSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        additionalProperties: false,
      },
    },
  });
  const exec = createExecutionResult({
    response: {
      status: 200,
      statusText: 'OK',
      responseTime: 20,
      headers: {},
      body: { id: 'usr_1', unexpectedField: 'bad_data' },
      size: 30,
    },
  });

  const result = service.validateSingle(tc, exec);
  const addlAssert = result.assertions.find((a) => a.path === '$.body.unexpectedField');
  assert.ok(addlAssert);
  assert.equal(addlAssert.category, 'SCHEMA_STRUCTURE');
  assert.equal(addlAssert.passed, false);
});

// ============================================================
// 19–21. Nested Objects & Arrays
// ============================================================

test('19. nested object schema validation produces accurate JSON paths', () => {
  const service = new ValidationService();
  const tc = createTestCase({
    expected: {
      responseSchema: {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              profile: {
                type: 'object',
                properties: {
                  age: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    },
  });
  const exec = createExecutionResult({
    response: {
      status: 200,
      statusText: 'OK',
      responseTime: 20,
      headers: {},
      body: { user: { profile: { age: 'not_a_number' } } },
      size: 40,
    },
  });

  const result = service.validateSingle(tc, exec);
  const node = result.assertions.find((a) => a.path === '$.body.user.profile.age');
  assert.ok(node);
  assert.equal(node.passed, false);
  assert.equal(node.expected, 'integer');
  assert.equal(node.actual, 'string');
});

test('20. array item validation validates all array elements', () => {
  const service = new ValidationService();
  const tc = createTestCase({
    expected: {
      responseSchema: {
        type: 'array',
        items: { type: 'number' },
      },
    },
  });
  const exec = createExecutionResult({
    response: {
      status: 200,
      statusText: 'OK',
      responseTime: 20,
      headers: {},
      body: [10, 20, 'thirty', 40],
      size: 20,
    },
  });

  const result = service.validateSingle(tc, exec);
  const failItem = result.assertions.find((a) => a.path === '$.body[2]');
  assert.ok(failItem);
  assert.equal(failItem.passed, false);
  assert.equal(failItem.expected, 'number');
  assert.equal(failItem.actual, 'string');
});

test('21. nested array / object validation validates path $.body.items[2].name', () => {
  const service = new ValidationService();
  const tc = createTestCase({
    expected: {
      responseSchema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name'],
              properties: { name: { type: 'string' } },
            },
          },
        },
      },
    },
  });
  const exec = createExecutionResult({
    response: {
      status: 200,
      statusText: 'OK',
      responseTime: 20,
      headers: {},
      body: {
        items: [
          { name: 'Item 0' },
          { name: 'Item 1' },
          { name: 999 }, // Invalid type at items[2].name
        ],
      },
      size: 50,
    },
  });

  const result = service.validateSingle(tc, exec);
  const failItem = result.assertions.find((a) => a.path === '$.body.items[2].name');
  assert.ok(failItem);
  assert.equal(failItem.passed, false);
  assert.equal(failItem.expected, 'string');
  assert.equal(failItem.actual, 'number');
});

// ============================================================
// 22–27. Constraints (Enum, Bounds, MultipleOf, Length, Pattern)
// ============================================================

test('22. enum validation: matches valid enum member and rejects invalid member', () => {
  const service = new ValidationService();
  const tc = createTestCase({
    expected: {
      responseSchema: {
        type: 'object',
        properties: { status: { type: 'string', enum: ['PENDING', 'ACTIVE', 'ARCHIVED'] } },
      },
    },
  });

  const pass = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: { status: 'ACTIVE' }, size: 20 },
  }));
  assert.equal(pass.status, 'VALIDATION_PASSED');

  const fail = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: { status: 'DELETED' }, size: 20 },
  }));
  assert.equal(fail.status, 'VALIDATION_FAILED');
  const node = fail.assertions.find((a) => a.path === '$.body.status');
  assert.ok(node);
  assert.equal(node.category, 'SCHEMA_ENUM');
  assert.equal(node.passed, false);
});

test('23. minimum and maximum bounds validation', () => {
  const service = new ValidationService();
  const tc = createTestCase({
    expected: {
      responseSchema: {
        type: 'object',
        properties: { score: { type: 'number', constraints: { minimum: 10, maximum: 100 } } },
      },
    },
  });

  // Too low (5 < 10)
  const low = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: { score: 5 }, size: 10 },
  }));
  assert.equal(low.status, 'VALIDATION_FAILED');

  // Too high (105 > 100)
  const high = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: { score: 105 }, size: 10 },
  }));
  assert.equal(high.status, 'VALIDATION_FAILED');

  // Valid (50)
  const valid = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: { score: 50 }, size: 10 },
  }));
  assert.equal(valid.status, 'VALIDATION_PASSED');
});

test('24. exclusive bounds validation (exclusiveMinimum & exclusiveMaximum)', () => {
  const service = new ValidationService();
  const tc = createTestCase({
    expected: {
      responseSchema: {
        type: 'object',
        properties: { val: { type: 'number', constraints: { exclusiveMinimum: 10, exclusiveMaximum: 20 } } },
      },
    },
  });

  // Exact boundary 10 fails (> 10 required)
  const low = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: { val: 10 }, size: 10 },
  }));
  assert.equal(low.status, 'VALIDATION_FAILED');

  // Exact boundary 20 fails (< 20 required)
  const high = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: { val: 20 }, size: 10 },
  }));
  assert.equal(high.status, 'VALIDATION_FAILED');

  // Value 15 passes
  const ok = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: { val: 15 }, size: 10 },
  }));
  assert.equal(ok.status, 'VALIDATION_PASSED');
});

test('25. multipleOf constraint validation', () => {
  const service = new ValidationService();
  const tc = createTestCase({
    expected: {
      responseSchema: {
        type: 'object',
        properties: { quantity: { type: 'number', constraints: { multipleOf: 5 } } },
      },
    },
  });

  const pass = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: { quantity: 25 }, size: 10 },
  }));
  assert.equal(pass.status, 'VALIDATION_PASSED');

  const fail = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: { quantity: 23 }, size: 10 },
  }));
  assert.equal(fail.status, 'VALIDATION_FAILED');
  const node = fail.assertions.find((a) => a.path === '$.body.quantity');
  assert.ok(node);
  assert.equal(node.category, 'SCHEMA_CONSTRAINT');
});

test('26. string length constraints (minLength & maxLength)', () => {
  const service = new ValidationService();
  const tc = createTestCase({
    expected: {
      responseSchema: {
        type: 'object',
        properties: { code: { type: 'string', constraints: { minLength: 3, maxLength: 6 } } },
      },
    },
  });

  // minLength violation
  const tooShort = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: { code: 'ab' }, size: 10 },
  }));
  assert.equal(tooShort.status, 'VALIDATION_FAILED');

  // maxLength violation
  const tooLong = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: { code: 'abcdefg' }, size: 10 },
  }));
  assert.equal(tooLong.status, 'VALIDATION_FAILED');

  // Valid length
  const valid = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: { code: 'abcd' }, size: 10 },
  }));
  assert.equal(valid.status, 'VALIDATION_PASSED');
});

test('27. regex pattern validation', () => {
  const service = new ValidationService();
  const tc = createTestCase({
    expected: {
      responseSchema: {
        type: 'object',
        properties: { zipCode: { type: 'string', constraints: { pattern: '^[0-9]{5}$' } } },
      },
    },
  });

  const pass = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: { zipCode: '90210' }, size: 10 },
  }));
  assert.equal(pass.status, 'VALIDATION_PASSED');

  const fail = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: { zipCode: '90210-extra' }, size: 10 },
  }));
  assert.equal(fail.status, 'VALIDATION_FAILED');
  const node = fail.assertions.find((a) => a.path === '$.body.zipCode');
  assert.ok(node);
  assert.equal(node.category, 'SCHEMA_CONSTRAINT');
});

// ============================================================
// 28–30. Array Constraints, Object Constraints, Nullable
// ============================================================

test('28. array constraints: minItems, maxItems, and uniqueItems', () => {
  const service = new ValidationService();
  const tc = createTestCase({
    expected: {
      responseSchema: {
        type: 'array',
        items: { type: 'string' },
        constraints: { minItems: 2, maxItems: 4, uniqueItems: true },
      },
    },
  });

  // minItems failure
  const shortArr = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: ['apple'], size: 10 },
  }));
  assert.equal(shortArr.status, 'VALIDATION_FAILED');

  // uniqueItems failure (duplicate 'apple')
  const dupArr = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: ['apple', 'apple'], size: 10 },
  }));
  assert.equal(dupArr.status, 'VALIDATION_FAILED');
  const dupAssert = dupArr.assertions.find((a) => a.category === 'SCHEMA_CONSTRAINT' && a.message.includes('uniqueItems'));
  assert.ok(dupAssert);

  // Valid array
  const validArr = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: ['apple', 'banana'], size: 10 },
  }));
  assert.equal(validArr.status, 'VALIDATION_PASSED');
});

test('29. object property constraints (minProperties & maxProperties)', () => {
  const service = new ValidationService();
  const tc = createTestCase({
    expected: {
      responseSchema: {
        type: 'object',
        constraints: { minProperties: 2, maxProperties: 3 },
      },
    },
  });

  // minProperties failure
  const fewProps = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: { a: 1 }, size: 10 },
  }));
  assert.equal(fewProps.status, 'VALIDATION_FAILED');

  // maxProperties failure
  const manyProps = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: { a: 1, b: 2, c: 3, d: 4 }, size: 10 },
  }));
  assert.equal(manyProps.status, 'VALIDATION_FAILED');

  // Valid
  const okProps = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: { a: 1, b: 2 }, size: 10 },
  }));
  assert.equal(okProps.status, 'VALIDATION_PASSED');
});

test('30. nullable schema: accepts null when nullable is true, rejects when false', () => {
  const service = new ValidationService();
  const nullableTc = createTestCase({
    expected: {
      responseSchema: {
        type: 'object',
        properties: { description: { type: 'string', nullable: true } },
      },
    },
  });

  const passNull = service.validateSingle(nullableTc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: { description: null }, size: 10 },
  }));
  assert.equal(passNull.status, 'VALIDATION_PASSED');

  const nonNullableTc = createTestCase({
    expected: {
      responseSchema: {
        type: 'object',
        properties: { description: { type: 'string', nullable: false } },
      },
    },
  });

  const failNull = service.validateSingle(nonNullableTc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: { description: null }, size: 10 },
  }));
  assert.equal(failNull.status, 'VALIDATION_FAILED');
  const node = failNull.assertions.find((a) => a.path === '$.body.description');
  assert.ok(node);
  assert.equal(node.passed, false);
});

// ============================================================
// 31–34. References & Composition (allOf, anyOf, oneOf)
// ============================================================

test('31. nested $ref resolution resolves internal definitions and validates schema', () => {
  const service = new ValidationService();
  const schemas: Record<string, ApiSchema> = {
    Address: {
      type: 'object',
      required: ['city'],
      properties: { city: { type: 'string' } },
    },
    User: {
      type: 'object',
      required: ['id', 'address'],
      properties: {
        id: { type: 'string' },
        address: { reference: '#/components/schemas/Address' },
      },
    },
  };

  const tc = createTestCase({
    expected: {
      responseSchema: { reference: '#/components/schemas/User' },
    },
  });

  // Valid nested ref
  const valid = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: { id: 'u1', address: { city: 'Paris' } }, size: 30 },
  }), schemas);
  assert.equal(valid.status, 'VALIDATION_PASSED');

  // Invalid nested ref (city is missing)
  const invalid = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: { id: 'u1', address: {} }, size: 30 },
  }), schemas);
  assert.equal(invalid.status, 'VALIDATION_FAILED');
  const cityAssert = invalid.assertions.find((a) => a.path === '$.body.address.city');
  assert.ok(cityAssert);
  assert.equal(cityAssert.passed, false);
});

test('32. allOf: all branches must be satisfied', () => {
  const service = new ValidationService();
  const tc = createTestCase({
    expected: {
      responseSchema: {
        type: 'object',
        allOf: [
          { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
          { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
        ],
      },
    },
  });

  // Passes both branches
  const pass = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: { id: '1', name: 'Alpha' }, size: 20 },
  }));
  assert.equal(pass.status, 'VALIDATION_PASSED');

  // Fails branch 2 (missing name)
  const fail = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: { id: '1' }, size: 20 },
  }));
  assert.equal(fail.status, 'VALIDATION_FAILED');
  const nameAssert = fail.assertions.find((a) => a.path === '$.body.name');
  assert.ok(nameAssert);
  assert.equal(nameAssert.passed, false);
});

test('33. anyOf: at least one branch must be satisfied', () => {
  const service = new ValidationService();
  const tc = createTestCase({
    expected: {
      responseSchema: {
        anyOf: [
          { type: 'string' },
          { type: 'number' },
        ],
      },
    },
  });

  // Matches branch 1
  const pass1 = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: 'hello', size: 10 },
  }));
  assert.equal(pass1.status, 'VALIDATION_PASSED');

  // Matches branch 2
  const pass2 = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: 42, size: 10 },
  }));
  assert.equal(pass2.status, 'VALIDATION_PASSED');

  // Matches neither (boolean)
  const fail = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: true, size: 10 },
  }));
  assert.equal(fail.status, 'VALIDATION_FAILED');
  const anyAssert = fail.assertions.find((a) => a.id.includes('anyof'));
  assert.ok(anyAssert);
  assert.equal(anyAssert.passed, false);
});

test('34. oneOf: exactly one branch must be satisfied', () => {
  const service = new ValidationService();
  const tc = createTestCase({
    expected: {
      responseSchema: {
        oneOf: [
          { type: 'number', constraints: { multipleOf: 2 } }, // Even numbers
          { type: 'number', constraints: { multipleOf: 3 } }, // Multiples of 3
        ],
      },
    },
  });

  // Matches only branch 1 (val: 4 -> divisible by 2, not 3) -> PASS
  const pass1 = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: 4, size: 10 },
  }));
  assert.equal(pass1.status, 'VALIDATION_PASSED');

  // Matches only branch 2 (val: 9 -> divisible by 3, not 2) -> PASS
  const pass2 = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: 9, size: 10 },
  }));
  assert.equal(pass2.status, 'VALIDATION_PASSED');

  // Matches BOTH branches (val: 6 -> divisible by 2 and 3) -> FAIL
  const failBoth = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: 6, size: 10 },
  }));
  assert.equal(failBoth.status, 'VALIDATION_FAILED');
  const bothAssert = failBoth.assertions.find((a) => a.id.includes('oneof'));
  assert.ok(bothAssert);
  assert.equal(bothAssert.passed, false);

  // Matches NEITHER branch (val: 5 -> divisible by neither) -> FAIL
  const failNeither = service.validateSingle(tc, createExecutionResult({
    response: { status: 200, statusText: 'OK', responseTime: 10, headers: {}, body: 5, size: 10 },
  }));
  assert.equal(failNeither.status, 'VALIDATION_FAILED');
});

// ============================================================
// 35–39. Execution States, Multi-Failure, Immutability & Determinism
// ============================================================

test('35. execution failure / error maps to NOT_VALIDATABLE', () => {
  const service = new ValidationService();
  const tc = createTestCase();

  // FAILED_EXECUTION
  const execFailed = createExecutionResult({
    status: 'FAILED_EXECUTION',
    error: { type: 'NETWORK_ERROR', message: 'Connection refused' },
    response: undefined,
  });
  const resFailed = service.validateSingle(tc, execFailed);
  assert.equal(resFailed.status, 'NOT_VALIDATABLE');
  assert.equal(resFailed.summary.totalAssertions, 1);
  assert.equal(resFailed.summary.failedAssertions, 1);

  // ERROR
  const execError = createExecutionResult({
    status: 'ERROR',
    error: { type: 'INTERNAL_ERROR', message: 'System error' },
    response: undefined,
  });
  const resError = service.validateSingle(tc, execError);
  assert.equal(resError.status, 'NOT_VALIDATABLE');
});

test('36. skipped execution maps to SKIPPED with 0 assertions', () => {
  const service = new ValidationService();
  const tc = createTestCase();
  const execSkipped = createExecutionResult({ status: 'SKIPPED', response: undefined });

  const result = service.validateSingle(tc, execSkipped);
  assert.equal(result.status, 'SKIPPED');
  assert.equal(result.summary.totalAssertions, 0);
  assert.equal(result.assertions.length, 0);
});

test('37. multiple validation failures collected without early exit', () => {
  const service = new ValidationService();
  const tc = createTestCase({
    expected: {
      statusCodes: ['200'],
      headers: { 'X-Required': { type: 'string' } },
      responseSchema: {
        type: 'object',
        required: ['id', 'email'],
        properties: {
          id: { type: 'string' },
          email: { type: 'string' },
        },
      },
    },
  });

  const exec = createExecutionResult({
    response: {
      status: 404, // Status failure
      statusText: 'Not Found',
      responseTime: 20,
      headers: {}, // Missing header X-Required
      body: { id: 123 }, // email missing AND id is wrong type (number instead of string)
      size: 20,
    },
  });

  const result = service.validateSingle(tc, exec);
  assert.equal(result.status, 'VALIDATION_FAILED');
  assert.ok(result.summary.failedAssertions >= 4, `Expected >= 4 failures, found ${result.summary.failedAssertions}`);

  const hasStatusFail = result.assertions.some((a) => a.category === 'STATUS_CODE' && !a.passed);
  const hasHdrFail = result.assertions.some((a) => a.category === 'HEADER' && !a.passed);
  const hasReqFail = result.assertions.some((a) => a.category === 'SCHEMA_REQUIRED' && !a.passed);
  const hasTypeFail = result.assertions.some((a) => a.category === 'SCHEMA_TYPE' && !a.passed);

  assert.equal(hasStatusFail, true);
  assert.equal(hasHdrFail, true);
  assert.equal(hasReqFail, true);
  assert.equal(hasTypeFail, true);
});

test('38. deterministic validation output on repeated runs', () => {
  const service = new ValidationService();
  const tc = createTestCase({
    expected: {
      statusCodes: ['200'],
      responseSchema: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string' } },
      },
    },
  });
  const exec = createExecutionResult({
    response: {
      status: 200,
      statusText: 'OK',
      responseTime: 20,
      headers: { 'content-type': 'application/json' },
      body: { name: 'Alice' },
      size: 20,
    },
  });

  const res1 = service.validateSingle(tc, exec);
  const res2 = service.validateSingle(tc, exec);

  assert.equal(res1.status, res2.status);
  assert.equal(res1.summary.totalAssertions, res2.summary.totalAssertions);
  assert.equal(res1.summary.passedAssertions, res2.summary.passedAssertions);
  assert.equal(res1.assertions.length, res2.assertions.length);

  for (let i = 0; i < res1.assertions.length; i++) {
    assert.equal(res1.assertions[i].id, res2.assertions[i].id);
    assert.equal(res1.assertions[i].category, res2.assertions[i].category);
    assert.equal(res1.assertions[i].path, res2.assertions[i].path);
    assert.equal(res1.assertions[i].expected, res2.assertions[i].expected);
    assert.equal(res1.assertions[i].actual, res2.assertions[i].actual);
    assert.equal(res1.assertions[i].passed, res2.assertions[i].passed);
  }
});

test('39. input immutability: Object.freeze guarantees inputs are never mutated', () => {
  const service = new ValidationService();
  const tc = Object.freeze(createTestCase({
    expected: Object.freeze({
      statusCodes: Object.freeze(['200']),
      headers: Object.freeze({ 'x-token': Object.freeze({ type: 'string' }) }),
      responseSchema: Object.freeze({
        type: 'object',
        required: Object.freeze(['id']),
        properties: Object.freeze({ id: Object.freeze({ type: 'string' }) }),
      }),
    }),
  }));

  const exec = Object.freeze(createExecutionResult({
    response: Object.freeze({
      status: 200,
      statusText: 'OK',
      responseTime: 20,
      headers: Object.freeze({ 'x-token': 'abc', 'content-type': 'application/json' }),
      body: Object.freeze({ id: '123' }),
      size: 20,
    }),
  }));

  const schemas: Record<string, ApiSchema> = Object.freeze({
    Item: Object.freeze({ type: 'object' }),
  });

  assert.doesNotThrow(() => {
    const res = service.validateSingle(tc, exec, schemas);
    assert.equal(res.status, 'VALIDATION_PASSED');
  });
});

test('40. security: sensitive header values (tokens, credentials, api-keys) are redacted in assertions', () => {
  const service = new ValidationService();
  const tc = createTestCase({
    expected: {
      headers: {
        'Authorization': { type: 'string', enum: ['Bearer secret_token_12345'] },
        'X-API-Key': { type: 'string' },
      },
    },
  });

  const exec = createExecutionResult({
    response: {
      status: 200,
      statusText: 'OK',
      responseTime: 20,
      headers: {
        'authorization': 'Bearer secret_token_12345',
        'x-api-key': 'super_secret_key_999',
      },
      body: null,
      size: 0,
    },
  });

  const result = service.validateSingle(tc, exec);
  for (const assertion of result.assertions) {
    if (assertion.category === 'HEADER') {
      assert.ok(!assertion.actual.includes('secret_token_12345'), 'Actual header assertion exposed bearer token');
      assert.ok(!assertion.actual.includes('super_secret_key_999'), 'Actual header assertion exposed API key');
      assert.ok(!assertion.message.includes('super_secret_key_999'), 'Assertion message exposed API key');
    }
  }
});

// ============================================================
// 41–44. API Endpoint & Controller Tests
// ============================================================

test('POST /api/validation/validate-single: validates valid payload and handles edge cases', () => {
  const service = new ValidationService();
  const controller = new ValidationController(service);

  let statusCode = 200;
  let responseData: Record<string, unknown> | null = null;
  const mockRes = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: unknown) {
      responseData = data as Record<string, unknown>;
      return this;
    },
  };

  type Req = Parameters<typeof controller.validateSingle>[0];
  type Res = Parameters<typeof controller.validateSingle>[1];

  // 1. Missing body -> 400
  controller.validateSingle({ body: null } as Req, mockRes as unknown as Res);
  assert.equal(statusCode, 400);

  // 2. Missing testCase -> 400
  controller.validateSingle({ body: { executionResult: createExecutionResult() } } as Req, mockRes as unknown as Res);
  assert.equal(statusCode, 400);

  // 3. Missing executionResult -> 400
  controller.validateSingle({ body: { testCase: createTestCase() } } as Req, mockRes as unknown as Res);
  assert.equal(statusCode, 400);

  // 4. Mismatched testCaseId -> 400
  controller.validateSingle({
    body: {
      testCase: createTestCase({ id: 'tc_100' }),
      executionResult: createExecutionResult({ testCaseId: 'tc_200' }),
    },
  } as Req, mockRes as unknown as Res);
  assert.equal(statusCode, 400);
  const errMsg = (responseData?.error as { message?: string })?.message;
  assert.ok(errMsg?.includes('Mismatched testCaseId'));

  // 5. Valid payload -> 200
  statusCode = 200;
  controller.validateSingle({
    body: {
      testCase: createTestCase({ id: 'tc_1' }),
      executionResult: createExecutionResult({ testCaseId: 'tc_1' }),
    },
  } as Req, mockRes as unknown as Res);
  assert.equal(statusCode, 200);
  assert.equal(responseData?.status, 'VALIDATION_PASSED');
});

test('POST /api/validation/validate-batch: validates batch items, preserves order, and enforces limit', () => {
  const service = new ValidationService();
  const controller = new ValidationController(service);

  let statusCode = 200;
  let responseData: Record<string, unknown> | null = null;
  const mockRes = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: unknown) {
      responseData = data as Record<string, unknown>;
      return this;
    },
  };

  type Req = Parameters<typeof controller.validateBatch>[0];
  type Res = Parameters<typeof controller.validateBatch>[1];

  // 1. Non-array items -> 400
  controller.validateBatch({ body: { items: 'not-an-array' } } as Req, mockRes as unknown as Res);
  assert.equal(statusCode, 400);

  // 2. Oversized batch (> 100) -> 400
  const oversizedItems = Array.from({ length: 101 }, (_, i) => ({
    testCase: createTestCase({ id: `tc_${i}` }),
    executionResult: createExecutionResult({ testCaseId: `tc_${i}` }),
  }));
  controller.validateBatch({ body: { items: oversizedItems } } as Req, mockRes as unknown as Res);
  assert.equal(statusCode, 400);
  const errMsg = (responseData?.error as { message?: string })?.message;
  assert.ok(errMsg?.includes('Batch limit exceeded'));

  // 3. Mismatched testCaseId in batch item -> 400
  controller.validateBatch({
    body: {
      items: [
        {
          testCase: createTestCase({ id: 'tc_1' }),
          executionResult: createExecutionResult({ testCaseId: 'tc_2' }),
        },
      ],
    },
  } as Req, mockRes as unknown as Res);
  assert.equal(statusCode, 400);

  // 4. Empty batch -> 200 with totalTests: 0
  statusCode = 200;
  controller.validateBatch({ body: { items: [] } } as Req, mockRes as unknown as Res);
  assert.equal(statusCode, 200);
  const emptySummary = responseData?.summary as { totalTests?: number };
  assert.equal(emptySummary?.totalTests, 0);

  // 5. Multiple items with preserved input order -> 200
  statusCode = 200;
  const batchItems = [
    { testCase: createTestCase({ id: 'tc_first' }), executionResult: createExecutionResult({ testCaseId: 'tc_first' }) },
    { testCase: createTestCase({ id: 'tc_second' }), executionResult: createExecutionResult({ testCaseId: 'tc_second' }) },
    { testCase: createTestCase({ id: 'tc_third' }), executionResult: createExecutionResult({ testCaseId: 'tc_third' }) },
  ];
  controller.validateBatch({ body: { items: batchItems } } as Req, mockRes as unknown as Res);
  assert.equal(statusCode, 200);
  const batchSummary = responseData?.summary as { totalTests?: number; passedValidation?: number };
  assert.equal(batchSummary?.totalTests, 3);
  assert.equal(batchSummary?.passedValidation, 3);

  const results = responseData?.results as Array<{ testCaseId: string }>;
  assert.equal(results.length, 3);
  assert.equal(results[0].testCaseId, 'tc_first');
  assert.equal(results[1].testCaseId, 'tc_second');
  assert.equal(results[2].testCaseId, 'tc_third');
});
