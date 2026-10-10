import assert from 'node:assert/strict';
import test from 'node:test';
import { ResponseExtractorService } from '../src/services/responseExtractor.service.js';
import type { ApiResponse } from '../src/types/request.types.js';
import type { ResponseExtractor } from '../src/types/workflow.types.js';

const mockResponse = (overrides?: Partial<ApiResponse>): ApiResponse => ({
  success: true,
  status: 200,
  statusText: 'OK',
  responseTime: 45,
  headers: {
    'content-type': 'application/json',
    'location': '/api/v1/users/usr_4455',
    'x-request-id': 'req_abc123',
    'x-rate-limit': '100',
  },
  body: {
    id: 'usr_4455',
    token: 'jwt_secret_token_123',
    data: {
      user: {
        email: 'ada@example.com',
        profile: {
          name: 'Ada Lovelace',
          age: 36,
          isActive: true,
          deletedAt: null,
          bio: '',
        },
      },
    },
    items: [
      { id: 'item_1', label: 'Primary Item' },
      { id: 'item_2', label: 'Secondary Item' },
    ],
    groups: [
      {
        name: 'Admins',
        members: [
          { userId: 'usr_1', role: 'owner' },
          { userId: 'usr_2', role: 'editor' },
        ],
      },
    ],
  },
  ...overrides,
});

test('1. Root-level property extraction', () => {
  const service = new ResponseExtractorService();
  const response = mockResponse();

  const extractor: ResponseExtractor = {
    targetVariable: 'userId',
    source: 'BODY_JSONPATH',
    path: '$.id',
  };

  const res = service.extract(extractor, response);
  assert.equal(res.success, true);
  assert.equal(res.targetVariable, 'userId');
  assert.equal(res.value, 'usr_4455');
  assert.equal(res.isSecret, false);
});

test('2. Nested property extraction', () => {
  const service = new ResponseExtractorService();
  const response = mockResponse();

  const extractor: ResponseExtractor = {
    targetVariable: 'userEmail',
    source: 'BODY_JSONPATH',
    path: '$.data.user.email',
  };

  const res = service.extract(extractor, response);
  assert.equal(res.success, true);
  assert.equal(res.value, 'ada@example.com');
});

test('3. Array index extraction', () => {
  const service = new ResponseExtractorService();
  const response = mockResponse();

  const extractor: ResponseExtractor = {
    targetVariable: 'firstItemId',
    source: 'BODY_JSONPATH',
    path: '$.items[0].id',
  };

  const res = service.extract(extractor, response);
  assert.equal(res.success, true);
  assert.equal(res.value, 'item_1');
});

test('4. Multiple nested array and object levels', () => {
  const service = new ResponseExtractorService();
  const response = mockResponse();

  const extractor: ResponseExtractor = {
    targetVariable: 'secondMemberRole',
    source: 'BODY_JSONPATH',
    path: '$.groups[0].members[1].role',
  };

  const res = service.extract(extractor, response);
  assert.equal(res.success, true);
  assert.equal(res.value, 'editor');
});

test('5. Header extraction', () => {
  const service = new ResponseExtractorService();
  const response = mockResponse();

  const extractor: ResponseExtractor = {
    targetVariable: 'requestId',
    source: 'HEADER',
    path: 'x-request-id',
  };

  const res = service.extract(extractor, response);
  assert.equal(res.success, true);
  assert.equal(res.value, 'req_abc123');
});

test('6. Case-insensitive header lookup', () => {
  const service = new ResponseExtractorService();
  const response = mockResponse();

  // Look up "Location" when response header is "location"
  const extractor1: ResponseExtractor = {
    targetVariable: 'locationUrl',
    source: 'HEADER',
    path: 'Location',
  };
  const res1 = service.extract(extractor1, response);
  assert.equal(res1.success, true);
  assert.equal(res1.value, '/api/v1/users/usr_4455');

  // Look up "Content-Type" when response header is "content-type"
  const extractor2: ResponseExtractor = {
    targetVariable: 'contentType',
    source: 'HEADER',
    path: 'Content-Type',
  };
  const res2 = service.extract(extractor2, response);
  assert.equal(res2.success, true);
  assert.equal(res2.value, 'application/json');
});

test('7. Missing property returns structured failure', () => {
  const service = new ResponseExtractorService();
  const response = mockResponse();

  const extractor: ResponseExtractor = {
    targetVariable: 'nonExistent',
    source: 'BODY_JSONPATH',
    path: '$.data.user.address.postalCode',
  };

  const res = service.extract(extractor, response);
  assert.equal(res.success, false);
  assert.equal(res.value, undefined);
  assert.equal(res.error?.code, 'PROPERTY_NOT_FOUND');
  assert(res.error?.message.includes('address') || res.error?.message.includes('Property'));
});

test('8. Missing array element returns ARRAY_INDEX_OUT_OF_BOUNDS', () => {
  const service = new ResponseExtractorService();
  const response = mockResponse();

  const extractor: ResponseExtractor = {
    targetVariable: 'outOfBoundsItem',
    source: 'BODY_JSONPATH',
    path: '$.items[99].id',
  };

  const res = service.extract(extractor, response);
  assert.equal(res.success, false);
  assert.equal(res.error?.code, 'ARRAY_INDEX_OUT_OF_BOUNDS');
});

test('9. Missing header returns HEADER_NOT_FOUND', () => {
  const service = new ResponseExtractorService();
  const response = mockResponse();

  const extractor: ResponseExtractor = {
    targetVariable: 'missingHeader',
    source: 'HEADER',
    path: 'X-Nonexistent-Header',
  };

  const res = service.extract(extractor, response);
  assert.equal(res.success, false);
  assert.equal(res.error?.code, 'HEADER_NOT_FOUND');
});

test('10. Valid extraction of explicit null value', () => {
  const service = new ResponseExtractorService();
  const response = mockResponse();

  const extractor: ResponseExtractor = {
    targetVariable: 'userDeletedAt',
    source: 'BODY_JSONPATH',
    path: '$.data.user.profile.deletedAt',
  };

  const res = service.extract(extractor, response);
  // Must distinguish valid null from missing property!
  assert.equal(res.success, true);
  assert.strictEqual(res.value, null);
});

test('11. Empty string values are extracted successfully', () => {
  const service = new ResponseExtractorService();
  const response = mockResponse();

  const extractor: ResponseExtractor = {
    targetVariable: 'userBio',
    source: 'BODY_JSONPATH',
    path: '$.data.user.profile.bio',
  };

  const res = service.extract(extractor, response);
  assert.equal(res.success, true);
  assert.strictEqual(res.value, '');
});

test('12. Malformed path syntax is rejected', () => {
  const service = new ResponseExtractorService();
  const response = mockResponse();

  // Unclosed bracket
  const res1 = service.extract(
    { targetVariable: 'v', source: 'BODY_JSONPATH', path: '$.items[0' },
    response
  );
  assert.equal(res1.success, false);
  assert.equal(res1.error?.code, 'MALFORMED_PATH');

  // Consecutive dots
  const res2 = service.extract(
    { targetVariable: 'v', source: 'BODY_JSONPATH', path: '$.data..user' },
    response
  );
  assert.equal(res2.success, false);
  assert.equal(res2.error?.code, 'UNSUPPORTED_SYNTAX');
});

test('13. Unsupported path syntax (wildcards, slices, filters)', () => {
  const service = new ResponseExtractorService();
  const response = mockResponse();

  const wild = service.extract(
    { targetVariable: 'v', source: 'BODY_JSONPATH', path: '$.items[*].id' },
    response
  );
  assert.equal(wild.success, false);
  assert.equal(wild.error?.code, 'UNSUPPORTED_SYNTAX');

  const slice = service.extract(
    { targetVariable: 'v', source: 'BODY_JSONPATH', path: '$.items[0:2]' },
    response
  );
  assert.equal(slice.success, false);
  assert.equal(slice.error?.code, 'UNSUPPORTED_SYNTAX');

  const filter = service.extract(
    { targetVariable: 'v', source: 'BODY_JSONPATH', path: '$.items[?(@.id)]' },
    response
  );
  assert.equal(filter.success, false);
  assert.equal(filter.error?.code, 'UNSUPPORTED_SYNTAX');
});

test('14. Out-of-range or invalid array indices', () => {
  const service = new ResponseExtractorService();
  const response = mockResponse();

  // Non-numeric index inside brackets
  const res1 = service.extract(
    { targetVariable: 'v', source: 'BODY_JSONPATH', path: '$.items[abc]' },
    response
  );
  assert.equal(res1.success, false);
  assert.equal(res1.error?.code, 'INVALID_ARRAY_INDEX');

  // Excessive index number
  const res2 = service.extract(
    { targetVariable: 'v', source: 'BODY_JSONPATH', path: '$.items[999999]' },
    response
  );
  assert.equal(res2.success, false);
  assert.equal(res2.error?.code, 'INVALID_ARRAY_INDEX');
});

test('15. Prototype pollution paths are strictly blocked', () => {
  const service = new ResponseExtractorService();
  const response = mockResponse();

  const p1 = service.extract(
    { targetVariable: 'v', source: 'BODY_JSONPATH', path: '$.__proto__.polluted' },
    response
  );
  assert.equal(p1.success, false);
  assert.equal(p1.error?.code, 'PROTOTYPE_POLLUTION_ATTEMPT');

  const p2 = service.extract(
    { targetVariable: 'v', source: 'BODY_JSONPATH', path: '$.constructor.name' },
    response
  );
  assert.equal(p2.success, false);
  assert.equal(p2.error?.code, 'PROTOTYPE_POLLUTION_ATTEMPT');

  const p3 = service.extract(
    { targetVariable: 'v', source: 'BODY_JSONPATH', path: '$.prototype.polluted' },
    response
  );
  assert.equal(p3.success, false);
  assert.equal(p3.error?.code, 'PROTOTYPE_POLLUTION_ATTEMPT');
});

test('16. Stringified JSON body and non-JSON body handling', () => {
  const service = new ResponseExtractorService();

  // Valid JSON string in response body
  const stringifiedResponse = mockResponse({
    body: JSON.stringify({ extractedToken: 'tok_998877' }),
  });
  const res1 = service.extract(
    { targetVariable: 'tok', source: 'BODY_JSONPATH', path: '$.extractedToken' },
    stringifiedResponse
  );
  assert.equal(res1.success, true);
  assert.equal(res1.value, 'tok_998877');

  // Non-JSON plain text body
  const plainTextResponse = mockResponse({
    body: '<html><body>Internal Server Error</body></html>',
  });
  const res2 = service.extract(
    { targetVariable: 'tok', source: 'BODY_JSONPATH', path: '$.token' },
    plainTextResponse
  );
  assert.equal(res2.success, false);
  assert.equal(res2.error?.code, 'NON_JSON_BODY');
});

test('17. Input immutability', () => {
  const service = new ResponseExtractorService();
  const rawBody = { a: { b: [1, 2, 3] } };
  const originalResponse = Object.freeze(mockResponse({ body: Object.freeze(rawBody) }));
  const extractor = Object.freeze<ResponseExtractor>({
    targetVariable: 'v',
    source: 'BODY_JSONPATH',
    path: '$.a.b[1]',
  });

  const res = service.extract(extractor, originalResponse);
  assert.equal(res.success, true);
  assert.equal(res.value, 2);
});

test('18. Secret flag propagation without value leakage in errors', () => {
  const service = new ResponseExtractorService();
  const response = mockResponse();

  const secretExtractor: ResponseExtractor = {
    targetVariable: 'authToken',
    source: 'BODY_JSONPATH',
    path: '$.token',
    isSecret: true,
  };

  const res = service.extract(secretExtractor, response);
  assert.equal(res.success, true);
  assert.equal(res.value, 'jwt_secret_token_123');
  assert.equal(res.isSecret, true);

  // When failed, error message does NOT expose body content
  const failedSecret: ResponseExtractor = {
    targetVariable: 'missingSecret',
    source: 'BODY_JSONPATH',
    path: '$.invalidSecretField',
    isSecret: true,
  };
  const failRes = service.extract(failedSecret, response);
  assert.equal(failRes.success, false);
  assert(!failRes.error?.message.includes('jwt_secret_token_123'));
});

test('19. Path depth bound enforcement', () => {
  const service = new ResponseExtractorService();
  const response = mockResponse();

  const deepPath = '$.a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.p.q.r.s.t';
  const res = service.extract(
    { targetVariable: 'deep', source: 'BODY_JSONPATH', path: deepPath },
    response
  );
  assert.equal(res.success, false);
  assert.equal(res.error?.code, 'PATH_DEPTH_EXCEEDED');
});

test('20. HTTP Status code extraction and fallback default value', () => {
  const service = new ResponseExtractorService();
  const response = mockResponse({ status: 201 });

  const resStatus = service.extract(
    { targetVariable: 'httpStatus', source: 'STATUS_CODE' },
    response
  );
  assert.equal(resStatus.success, true);
  assert.equal(resStatus.value, 201);

  // Default value fallback for missing header
  const resDefault = service.extract(
    {
      targetVariable: 'optionalHeader',
      source: 'HEADER',
      path: 'X-Optional',
      defaultValue: 'default_header_value',
    },
    response
  );
  assert.equal(resDefault.success, true);
  assert.equal(resDefault.value, 'default_header_value');
});

test('21. Batch extraction with extractAll and context dictionary generation', () => {
  const service = new ResponseExtractorService();
  const response = mockResponse();

  const extractors: ResponseExtractor[] = [
    { targetVariable: 'userId', source: 'BODY_JSONPATH', path: '$.id' },
    { targetVariable: 'token', source: 'BODY_JSONPATH', path: '$.token', isSecret: true },
    { targetVariable: 'loc', source: 'HEADER', path: 'Location' },
    { targetVariable: 'missing', source: 'HEADER', path: 'X-Missing' },
  ];

  const batch = service.extractAll(extractors, response);
  assert.equal(batch.total, 4);
  assert.equal(batch.successfulCount, 3);
  assert.equal(batch.failedCount, 1);
  assert.equal(batch.allSuccessful, false);

  // Context contains only successful extractions
  assert.equal(batch.context['userId']?.value, 'usr_4455');
  assert.equal(batch.context['userId']?.isSecret, false);
  assert.equal(batch.context['token']?.value, 'jwt_secret_token_123');
  assert.equal(batch.context['token']?.isSecret, true);
  assert.equal(batch.context['loc']?.value, '/api/v1/users/usr_4455');
  assert.equal(batch.context['missing'], undefined);
});
