import { SchemaResolverService, schemaType } from './schemaResolver.service.js';
import type { ApiSchema, ApiSpecification } from '../types/openapi.types.js';
import type { TestCase } from '../types/testCase.types.js';
import type { TestCaseExecutionResult } from '../types/testExecution.types.js';
import {
  type AssertionResult,
  type TestCaseValidationResult,
  type TestSuiteValidationResult,
  type TestSuiteValidationSummary,
  type ValidateBatchItem,
  type ValidationStatus,
  MAX_VALIDATION_BATCH_SIZE,
} from '../types/validation.types.js';

const SENSITIVE_HEADER_KEYS = new Set([
  'authorization',
  'proxy-authorization',
  'x-api-key',
  'api-key',
  'set-cookie',
  'cookie',
  'x-auth-token',
  'x-csrf-token',
]);

const isSensitiveHeader = (name: string): boolean => {
  const lower = name.toLowerCase();
  return (
    SENSITIVE_HEADER_KEYS.has(lower) ||
    lower.includes('token') ||
    lower.includes('secret') ||
    lower.includes('password') ||
    lower.includes('auth') ||
    lower.includes('apikey')
  );
};

export class ValidationService {
  private readonly resolver: SchemaResolverService;

  constructor(resolver: SchemaResolverService = new SchemaResolverService()) {
    this.resolver = resolver;
  }

  validateSingle(
    testCase: TestCase,
    executionResult: TestCaseExecutionResult,
    schemas?: Record<string, ApiSchema> | ApiSpecification
  ): TestCaseValidationResult {
    const startedAt = Date.now();
    const validatedAt = new Date().toISOString();
    let assertionSeq = 0;
    const nextId = (prefix: string): string => `assert_${testCase.id}_${++assertionSeq}_${prefix}`;

    // 1. Check Execution State
    if (executionResult.status === 'SKIPPED') {
      return {
        testCaseId: testCase.id,
        executionId: executionResult.executionId,
        status: 'SKIPPED',
        validatedAt,
        durationMs: 0,
        summary: { totalAssertions: 0, passedAssertions: 0, failedAssertions: 0 },
        assertions: [],
      };
    }

    if (executionResult.status === 'FAILED_EXECUTION' || executionResult.status === 'ERROR') {
      const assertion: AssertionResult = {
        id: nextId('status_exec_fail'),
        category: 'STATUS_CODE',
        path: '$.status',
        expected: testCase.expected.statusCodes?.join(', ') ?? testCase.expected.statusClass ?? '2xx',
        actual: executionResult.error?.type ?? executionResult.status,
        passed: false,
        message: `Request execution failed (${executionResult.error?.message ?? executionResult.status}). No HTTP response available to validate.`,
      };
      return {
        testCaseId: testCase.id,
        executionId: executionResult.executionId,
        status: 'NOT_VALIDATABLE',
        validatedAt,
        durationMs: Date.now() - startedAt,
        summary: { totalAssertions: 1, passedAssertions: 0, failedAssertions: 1 },
        assertions: [assertion],
      };
    }

    const assertions: AssertionResult[] = [];
    const response = executionResult.response;

    if (!response) {
      const assertion: AssertionResult = {
        id: nextId('missing_resp'),
        category: 'STATUS_CODE',
        path: '$.response',
        expected: 'HTTP response object',
        actual: 'undefined',
        passed: false,
        message: 'No response data captured in execution result.',
      };
      return {
        testCaseId: testCase.id,
        executionId: executionResult.executionId,
        status: 'NOT_VALIDATABLE',
        validatedAt,
        durationMs: Date.now() - startedAt,
        summary: { totalAssertions: 1, passedAssertions: 0, failedAssertions: 1 },
        assertions: [assertion],
      };
    }

    // 2. Validate Status Code
    this.validateStatusCode(testCase, response.status, nextId, assertions);

    // 3. Validate Response Headers
    this.validateHeaders(testCase, response.headers, nextId, assertions);

    // 4. Validate Response Body & Schema
    this.validateBodyAndSchema(testCase, response.headers, response.body, schemas, nextId, assertions);

    const durationMs = Date.now() - startedAt;
    const failedCount = assertions.filter((a) => !a.passed).length;
    const passedCount = assertions.length - failedCount;
    const status: ValidationStatus = failedCount > 0 ? 'VALIDATION_FAILED' : 'VALIDATION_PASSED';

    return {
      testCaseId: testCase.id,
      executionId: executionResult.executionId,
      status,
      validatedAt,
      durationMs,
      summary: {
        totalAssertions: assertions.length,
        passedAssertions: passedCount,
        failedAssertions: failedCount,
      },
      assertions,
    };
  }

  validateBatch(
    items: ValidateBatchItem[],
    schemas?: Record<string, ApiSchema> | ApiSpecification
  ): TestSuiteValidationResult {
    if (items.length > MAX_VALIDATION_BATCH_SIZE) {
      throw new Error(`Batch size exceeds maximum limit of ${MAX_VALIDATION_BATCH_SIZE} items.`);
    }

    const suiteStartedAt = Date.now();
    const validatedAt = new Date().toISOString();
    const validationSuiteId = `val_suite_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const results: TestCaseValidationResult[] = [];

    for (const item of items) {
      const res = this.validateSingle(item.testCase, item.executionResult, schemas);
      results.push(res);
    }

    const totalDurationMs = Date.now() - suiteStartedAt;
    const totalAssertions = results.reduce((acc, r) => acc + r.summary.totalAssertions, 0);
    const passedAssertions = results.reduce((acc, r) => acc + r.summary.passedAssertions, 0);
    const failedAssertions = results.reduce((acc, r) => acc + r.summary.failedAssertions, 0);

    const summary: TestSuiteValidationSummary = {
      totalTests: items.length,
      validatedTests: results.filter((r) => r.status !== 'SKIPPED' && r.status !== 'NOT_VALIDATABLE').length,
      passedValidation: results.filter((r) => r.status === 'VALIDATION_PASSED').length,
      failedValidation: results.filter((r) => r.status === 'VALIDATION_FAILED').length,
      notValidatable: results.filter((r) => r.status === 'NOT_VALIDATABLE').length,
      skipped: results.filter((r) => r.status === 'SKIPPED').length,
      totalAssertions,
      passedAssertions,
      failedAssertions,
      totalDurationMs,
    };

    return {
      validationSuiteId,
      validatedAt,
      summary,
      results,
    };
  }

  // --- Tier 1: Status Code Validation ---
  private validateStatusCode(
    testCase: TestCase,
    actualStatus: number,
    nextId: (p: string) => string,
    assertions: AssertionResult[]
  ): void {
    const expected = testCase.expected;
    const actualStr = String(actualStatus);

    if (expected.statusCodes && expected.statusCodes.length > 0) {
      const passed = expected.statusCodes.includes(actualStr);
      assertions.push({
        id: nextId('status_code'),
        category: 'STATUS_CODE',
        path: '$.status',
        expected: expected.statusCodes.join(' or '),
        actual: actualStr,
        passed,
        message: passed
          ? `Status code ${actualStr} matched expected (${expected.statusCodes.join(', ')}).`
          : `Expected status code ${expected.statusCodes.join(' or ')}, but received ${actualStr}.`,
      });
      return;
    }

    if (expected.statusClass) {
      let passed = false;
      if (expected.statusClass === '2xx') passed = actualStatus >= 200 && actualStatus < 300;
      else if (expected.statusClass === '4xx') passed = actualStatus >= 400 && actualStatus < 500;
      else if (expected.statusClass === '5xx') passed = actualStatus >= 500 && actualStatus < 600;
      else if (expected.statusClass === '3xx') passed = actualStatus >= 300 && actualStatus < 400;
      else if (expected.statusClass === '1xx') passed = actualStatus >= 100 && actualStatus < 200;

      assertions.push({
        id: nextId('status_class'),
        category: 'STATUS_CODE',
        path: '$.status',
        expected: expected.statusClass,
        actual: actualStr,
        passed,
        message: passed
          ? `Status code ${actualStr} satisfied ${expected.statusClass} class.`
          : `Expected status in ${expected.statusClass} class, but received ${actualStr}.`,
      });
      return;
    }

    // Default to expecting 2xx if neither statusCodes nor statusClass specified
    const defaultPassed = actualStatus >= 200 && actualStatus < 300;
    assertions.push({
      id: nextId('status_default'),
      category: 'STATUS_CODE',
      path: '$.status',
      expected: '2xx',
      actual: actualStr,
      passed: defaultPassed,
      message: defaultPassed
        ? `Status code ${actualStr} satisfied default 2xx class.`
        : `Expected status in 2xx class, but received ${actualStr}.`,
    });
  }

  // --- Tier 2: Response Headers Validation ---
  private validateHeaders(
    testCase: TestCase,
    actualHeaders: Record<string, string>,
    nextId: (p: string) => string,
    assertions: AssertionResult[]
  ): void {
    const expectedHeaders = testCase.expected.headers;
    if (!expectedHeaders || Object.keys(expectedHeaders).length === 0) return;

    // Build lowercase lookup map for case-insensitive header checking
    const lowerHeaders = new Map<string, string>();
    for (const [key, value] of Object.entries(actualHeaders)) {
      lowerHeaders.set(key.toLowerCase(), value);
    }

    for (const [headerName, headerSchema] of Object.entries(expectedHeaders)) {
      const lowerName = headerName.toLowerCase();
      const actualVal = lowerHeaders.get(lowerName);
      const path = `$.headers["${lowerName}"]`;
      const isSensitive = isSensitiveHeader(headerName);

      if (actualVal === undefined) {
        assertions.push({
          id: nextId(`hdr_missing_${lowerName}`),
          category: 'HEADER',
          path,
          expected: `Header '${headerName}' present`,
          actual: 'Header missing',
          passed: false,
          message: `Expected response header '${headerName}' was not returned.`,
        });
        continue;
      }

      const displayActual = isSensitive ? '[REDACTED]' : actualVal;

      // Type constraint (e.g. integer)
      if (headerSchema.type === 'integer') {
        const isInt = Number.isInteger(Number(actualVal));
        if (!isInt) {
          assertions.push({
            id: nextId(`hdr_type_${lowerName}`),
            category: 'HEADER',
            path,
            expected: 'integer',
            actual: displayActual,
            passed: false,
            message: `Header '${headerName}' expected integer value, but received '${displayActual}'.`,
          });
          continue;
        }
      }

      // Enum constraint
      if (headerSchema.enum && headerSchema.enum.length > 0) {
        // Special case: Content-Type can have charset parameters
        const isContentType = lowerName === 'content-type';
        const compareVal = isContentType ? actualVal.split(';')[0].trim().toLowerCase() : actualVal;
        const passed = headerSchema.enum
          .map((e) => (isContentType ? String(e).split(';')[0].trim().toLowerCase() : String(e)))
          .includes(compareVal);

        assertions.push({
          id: nextId(`hdr_enum_${lowerName}`),
          category: 'HEADER',
          path,
          expected: isSensitive ? '[REDACTED]' : headerSchema.enum.map(String).join(' or '),
          actual: displayActual,
          passed,
          message: passed
            ? `Header '${headerName}' matches allowed enum.`
            : `Header '${headerName}' value ${isSensitive ? '[REDACTED]' : `'${actualVal}'`} is not in allowed enum: ${headerSchema.enum.join(', ')}.`,
        });
        continue;
      }

      // Pattern constraint
      const pattern = typeof headerSchema.constraints?.pattern === 'string' ? headerSchema.constraints.pattern : undefined;
      if (pattern) {
        let passed: boolean;
        try {
          passed = new RegExp(pattern).test(actualVal);
        } catch {
          passed = true;
        }
        assertions.push({
          id: nextId(`hdr_pattern_${lowerName}`),
          category: 'HEADER',
          path,
          expected: `Matches /${pattern}/`,
          actual: displayActual,
          passed,
          message: passed
            ? `Header '${headerName}' matches expected pattern.`
            : `Header '${headerName}' value ${isSensitive ? '[REDACTED]' : `'${actualVal}'`} does not match pattern /${pattern}/.`,
        });
        continue;
      }

      // Header presence passed
      assertions.push({
        id: nextId(`hdr_pres_${lowerName}`),
        category: 'HEADER',
        path,
        expected: 'Header present',
        actual: displayActual,
        passed: true,
        message: `Header '${headerName}' is present.`,
      });
    }
  }

  // --- Tier 3: Body & Schema Validation ---
  private validateBodyAndSchema(
    testCase: TestCase,
    actualHeaders: Record<string, string>,
    actualBody: unknown,
    schemas: Record<string, ApiSchema> | ApiSpecification | undefined,
    nextId: (p: string) => string,
    assertions: AssertionResult[]
  ): void {
    const rawSchema = testCase.expected.responseSchema;
    if (!rawSchema) return;

    // Resolve references preserving composition semantics for validation
    const resolvedSchema = this.resolver.resolveForValidation(rawSchema, schemas) ?? rawSchema;

    // Validate Content-Type if JSON schema is expected and not already validated via expected.headers
    const alreadyCheckedContentType = Object.keys(testCase.expected.headers ?? {}).some(
      (k) => k.toLowerCase() === 'content-type'
    );
    if (!alreadyCheckedContentType) {
      const lowerContentType = Object.entries(actualHeaders)
        .find(([k]) => k.toLowerCase() === 'content-type')?.[1]
        ?.toLowerCase();

      const expectedType = schemaType(resolvedSchema);
      if ((expectedType === 'object' || expectedType === 'array' || resolvedSchema.properties) && lowerContentType) {
        const baseContentType = lowerContentType.split(';')[0].trim();
        const isJsonCompatible =
          baseContentType === 'application/json' ||
          baseContentType.endsWith('+json') ||
          baseContentType === 'text/json';

        if (isJsonCompatible) {
          assertions.push({
            id: nextId('content_type'),
            category: 'CONTENT_TYPE',
            path: '$.headers["content-type"]',
            expected: 'application/json',
            actual: baseContentType,
            passed: true,
            message: `Content-Type '${lowerContentType}' matches expected JSON media type.`,
          });
        } else {
          assertions.push({
            id: nextId('content_type'),
            category: 'CONTENT_TYPE',
            path: '$.headers["content-type"]',
            expected: 'application/json',
            actual: baseContentType,
            passed: false,
            message: `Expected 'application/json' content-type for schema response, but received '${baseContentType}'.`,
          });
        }
      }
    }

    // Body presence and parsing
    if (actualBody === undefined) {
      assertions.push({
        id: nextId('body_missing'),
        category: 'SCHEMA_STRUCTURE',
        path: '$.body',
        expected: 'Response body conforming to schema',
        actual: 'undefined',
        passed: false,
        message: 'Expected response body conforming to schema, but response body is missing.',
      });
      return;
    }

    if (actualBody === null) {
      if (resolvedSchema.nullable || (Array.isArray(resolvedSchema.type) && resolvedSchema.type.includes('null'))) {
        assertions.push({
          id: nextId('body_null'),
          category: 'SCHEMA_TYPE',
          path: '$.body',
          expected: 'nullable schema',
          actual: 'null',
          passed: true,
          message: 'Body is null and schema is nullable.',
        });
        return;
      }
      assertions.push({
        id: nextId('body_null_invalid'),
        category: 'SCHEMA_TYPE',
        path: '$.body',
        expected: 'Non-null body conforming to schema',
        actual: 'null',
        passed: false,
        message: 'Expected non-null response body conforming to schema, but received null.',
      });
      return;
    }

    let parsedBody = actualBody;
    if (typeof actualBody === 'string') {
      try {
        parsedBody = JSON.parse(actualBody);
      } catch {
        // If the expected schema requires an object/array and not a string, parsing failure is a malformed JSON failure
        const allowedTypes = new Set<string>();
        const collectTypes = (s: ApiSchema) => {
          const t = schemaType(s);
          if (t) allowedTypes.add(t);
          s.anyOf?.forEach(collectTypes);
          s.oneOf?.forEach(collectTypes);
          s.allOf?.forEach(collectTypes);
        };
        collectTypes(resolvedSchema);

        if (!allowedTypes.has('string')) {
          assertions.push({
            id: nextId('body_malformed_json'),
            category: 'SCHEMA_STRUCTURE',
            path: '$.body',
            expected: 'Valid JSON',
            actual: 'Malformed JSON / Plain text',
            passed: false,
            message: 'Expected valid JSON response body, but parsing failed.',
          });
          return;
        }
        parsedBody = actualBody;
      }
    }

    // Recursive schema validation
    this.validateSchemaNode(resolvedSchema, parsedBody, '$.body', schemas, assertions, nextId, 0);
  }

  private validateSchemaNode(
    schema: ApiSchema,
    val: unknown,
    path: string,
    schemas: Record<string, ApiSchema> | ApiSpecification | undefined,
    assertions: AssertionResult[],
    nextId: (p: string) => string,
    depth: number
  ): void {
    if (depth > 12) return;

    const resolved = this.resolver.resolveForValidation(schema, schemas) ?? schema;
    const type = schemaType(resolved);

    // Nullability check
    if (val === null) {
      if (resolved.nullable || (Array.isArray(resolved.type) && resolved.type.includes('null'))) {
        return; // Valid null
      }
      assertions.push({
        id: nextId(`null_${path}`),
        category: 'SCHEMA_TYPE',
        path,
        expected: type ?? 'non-null',
        actual: 'null',
        passed: false,
        message: `Field '${path}' is null, but schema is not nullable.`,
      });
      return;
    }

    // Type validation
    if (type) {
      const typeValid = this.checkType(type, val);
      if (!typeValid) {
        const actualType = Array.isArray(val) ? 'array' : typeof val;
        assertions.push({
          id: nextId(`type_${path}`),
          category: 'SCHEMA_TYPE',
          path,
          expected: type,
          actual: actualType,
          passed: false,
          message: `Field '${path}' expected type '${type}', but received '${actualType}'.`,
        });
        return; // Skip constraint validation if type itself is wrong
      }
    }

    // Enum validation
    if (resolved.enum && resolved.enum.length > 0) {
      const match = resolved.enum.some((item) => item === val);
      if (!match) {
        assertions.push({
          id: nextId(`enum_${path}`),
          category: 'SCHEMA_ENUM',
          path,
          expected: resolved.enum.map(String).join(' or '),
          actual: String(val),
          passed: false,
          message: `Field '${path}' value '${String(val)}' is not in allowed enum: [${resolved.enum.map(String).join(', ')}].`,
        });
      }
    }

    // String constraints
    if (typeof val === 'string') {
      const constraints = resolved.constraints ?? {};
      const minLength = typeof constraints.minLength === 'number' ? constraints.minLength : undefined;
      const maxLength = typeof constraints.maxLength === 'number' ? constraints.maxLength : undefined;
      const pattern = typeof constraints.pattern === 'string' ? constraints.pattern : undefined;

      if (minLength !== undefined && val.length < minLength) {
        assertions.push({
          id: nextId(`minlen_${path}`),
          category: 'SCHEMA_CONSTRAINT',
          path,
          expected: `>= ${minLength} characters`,
          actual: `${val.length} characters`,
          passed: false,
          message: `Field '${path}' length ${val.length} is less than minimum length of ${minLength}.`,
        });
      }

      if (maxLength !== undefined && val.length > maxLength) {
        assertions.push({
          id: nextId(`maxlen_${path}`),
          category: 'SCHEMA_CONSTRAINT',
          path,
          expected: `<= ${maxLength} characters`,
          actual: `${val.length} characters`,
          passed: false,
          message: `Field '${path}' length ${val.length} exceeds maximum length of ${maxLength}.`,
        });
      }

      if (pattern) {
        let patternPassed: boolean;
        try {
          patternPassed = new RegExp(pattern).test(val);
        } catch {
          patternPassed = true;
        }
        if (!patternPassed) {
          assertions.push({
            id: nextId(`pattern_${path}`),
            category: 'SCHEMA_CONSTRAINT',
            path,
            expected: `Matches /${pattern}/`,
            actual: val,
            passed: false,
            message: `Field '${path}' value '${val}' does not match pattern /${pattern}/.`,
          });
        }
      }
    }

    // Number & Integer constraints
    if (typeof val === 'number') {
      const constraints = resolved.constraints ?? {};
      const minimum = typeof constraints.minimum === 'number' ? constraints.minimum : undefined;
      const maximum = typeof constraints.maximum === 'number' ? constraints.maximum : undefined;
      const exclusiveMinimum =
        typeof constraints.exclusiveMinimum === 'number'
          ? constraints.exclusiveMinimum
          : constraints.exclusiveMinimum === true
          ? minimum
          : undefined;
      const exclusiveMaximum =
        typeof constraints.exclusiveMaximum === 'number'
          ? constraints.exclusiveMaximum
          : constraints.exclusiveMaximum === true
          ? maximum
          : undefined;
      const multipleOf = typeof constraints.multipleOf === 'number' ? constraints.multipleOf : undefined;

      if (minimum !== undefined && exclusiveMinimum === undefined && val < minimum) {
        assertions.push({
          id: nextId(`min_${path}`),
          category: 'SCHEMA_CONSTRAINT',
          path,
          expected: `>= ${minimum}`,
          actual: String(val),
          passed: false,
          message: `Field '${path}' value ${val} is less than minimum ${minimum}.`,
        });
      }

      if (exclusiveMinimum !== undefined && val <= exclusiveMinimum) {
        assertions.push({
          id: nextId(`excl_min_${path}`),
          category: 'SCHEMA_CONSTRAINT',
          path,
          expected: `> ${exclusiveMinimum}`,
          actual: String(val),
          passed: false,
          message: `Field '${path}' value ${val} violates exclusive minimum ${exclusiveMinimum}.`,
        });
      }

      if (maximum !== undefined && exclusiveMaximum === undefined && val > maximum) {
        assertions.push({
          id: nextId(`max_${path}`),
          category: 'SCHEMA_CONSTRAINT',
          path,
          expected: `<= ${maximum}`,
          actual: String(val),
          passed: false,
          message: `Field '${path}' value ${val} exceeds maximum ${maximum}.`,
        });
      }

      if (exclusiveMaximum !== undefined && val >= exclusiveMaximum) {
        assertions.push({
          id: nextId(`excl_max_${path}`),
          category: 'SCHEMA_CONSTRAINT',
          path,
          expected: `< ${exclusiveMaximum}`,
          actual: String(val),
          passed: false,
          message: `Field '${path}' value ${val} violates exclusive maximum ${exclusiveMaximum}.`,
        });
      }

      if (multipleOf !== undefined && multipleOf > 0) {
        const remainder = Math.abs(val % multipleOf);
        const isMultiple = remainder < 1e-9 || Math.abs(remainder - multipleOf) < 1e-9;
        if (!isMultiple) {
          assertions.push({
            id: nextId(`multipleof_${path}`),
            category: 'SCHEMA_CONSTRAINT',
            path,
            expected: `Multiple of ${multipleOf}`,
            actual: String(val),
            passed: false,
            message: `Field '${path}' value ${val} is not a multiple of ${multipleOf}.`,
          });
        }
      }
    }

    // Object validation
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      const obj = val as Record<string, unknown>;
      const required = resolved.required ?? [];
      const constraints = resolved.constraints ?? {};
      const minProperties = typeof constraints.minProperties === 'number' ? constraints.minProperties : undefined;
      const maxProperties = typeof constraints.maxProperties === 'number' ? constraints.maxProperties : undefined;
      const propCount = Object.keys(obj).length;

      if (minProperties !== undefined && propCount < minProperties) {
        assertions.push({
          id: nextId(`minprops_${path}`),
          category: 'SCHEMA_CONSTRAINT',
          path,
          expected: `>= ${minProperties} properties`,
          actual: `${propCount} properties`,
          passed: false,
          message: `Object at '${path}' has ${propCount} properties, fewer than minimum ${minProperties}.`,
        });
      }

      if (maxProperties !== undefined && propCount > maxProperties) {
        assertions.push({
          id: nextId(`maxprops_${path}`),
          category: 'SCHEMA_CONSTRAINT',
          path,
          expected: `<= ${maxProperties} properties`,
          actual: `${propCount} properties`,
          passed: false,
          message: `Object at '${path}' has ${propCount} properties, exceeding maximum ${maxProperties}.`,
        });
      }

      for (const reqKey of required) {
        if (!(reqKey in obj) || obj[reqKey] === undefined) {
          assertions.push({
            id: nextId(`req_${reqKey}`),
            category: 'SCHEMA_REQUIRED',
            path: `${path}.${reqKey}`,
            expected: `Required property '${reqKey}' present`,
            actual: 'Property missing',
            passed: false,
            message: `Missing required property '${reqKey}' in '${path}'.`,
          });
        }
      }

      // Validate defined properties
      if (resolved.properties) {
        for (const [propName, propSchema] of Object.entries(resolved.properties)) {
          if (propName in obj && obj[propName] !== undefined) {
            this.validateSchemaNode(
              propSchema,
              obj[propName],
              `${path}.${propName}`,
              schemas,
              assertions,
              nextId,
              depth + 1
            );
          }
        }
      }

      // Check additionalProperties === false
      if (resolved.additionalProperties === false) {
        const allowed = new Set(Object.keys(resolved.properties ?? {}));
        for (const propName of Object.keys(obj)) {
          if (!allowed.has(propName)) {
            assertions.push({
              id: nextId(`addl_${propName}`),
              category: 'SCHEMA_STRUCTURE',
              path: `${path}.${propName}`,
              expected: 'No additional properties',
              actual: `Found property '${propName}'`,
              passed: false,
              message: `Unexpected property '${propName}' in '${path}' (additionalProperties is false).`,
            });
          }
        }
      } else if (typeof resolved.additionalProperties === 'object' && resolved.additionalProperties !== null) {
        const allowed = new Set(Object.keys(resolved.properties ?? {}));
        for (const [propName, propVal] of Object.entries(obj)) {
          if (!allowed.has(propName)) {
            this.validateSchemaNode(
              resolved.additionalProperties,
              propVal,
              `${path}.${propName}`,
              schemas,
              assertions,
              nextId,
              depth + 1
            );
          }
        }
      }
    }

    // Array validation
    if (Array.isArray(val)) {
      const constraints = resolved.constraints ?? {};
      const minItems = typeof constraints.minItems === 'number' ? constraints.minItems : undefined;
      const maxItems = typeof constraints.maxItems === 'number' ? constraints.maxItems : undefined;
      const uniqueItems = constraints.uniqueItems === true;

      if (minItems !== undefined && val.length < minItems) {
        assertions.push({
          id: nextId(`minitems_${path}`),
          category: 'SCHEMA_CONSTRAINT',
          path,
          expected: `>= ${minItems} items`,
          actual: `${val.length} items`,
          passed: false,
          message: `Array at '${path}' has ${val.length} items, fewer than minimum ${minItems}.`,
        });
      }

      if (maxItems !== undefined && val.length > maxItems) {
        assertions.push({
          id: nextId(`maxitems_${path}`),
          category: 'SCHEMA_CONSTRAINT',
          path,
          expected: `<= ${maxItems} items`,
          actual: `${val.length} items`,
          passed: false,
          message: `Array at '${path}' has ${val.length} items, exceeding maximum ${maxItems}.`,
        });
      }

      if (uniqueItems && val.length > 1) {
        const seen = new Set<string>();
        let hasDuplicates = false;
        for (const item of val) {
          const serialized = JSON.stringify(item);
          if (seen.has(serialized)) {
            hasDuplicates = true;
            break;
          }
          seen.add(serialized);
        }
        if (hasDuplicates) {
          assertions.push({
            id: nextId(`uniqueitems_${path}`),
            category: 'SCHEMA_CONSTRAINT',
            path,
            expected: 'Unique items in array',
            actual: 'Duplicate items found',
            passed: false,
            message: `Array at '${path}' contains duplicate items (uniqueItems is true).`,
          });
        }
      }

      if (resolved.items) {
        for (const [index, item] of val.entries()) {
          this.validateSchemaNode(
            resolved.items,
            item,
            `${path}[${index}]`,
            schemas,
            assertions,
            nextId,
            depth + 1
          );
        }
      }
    }

    // Composition: allOf
    if (resolved.allOf && resolved.allOf.length > 0) {
      for (const branch of resolved.allOf) {
        this.validateSchemaNode(branch, val, path, schemas, assertions, nextId, depth + 1);
      }
    }

    // Composition: oneOf
    if (resolved.oneOf && resolved.oneOf.length > 0) {
      let matchingBranches = 0;
      for (const branch of resolved.oneOf) {
        const branchAssertions: AssertionResult[] = [];
        this.validateSchemaNode(branch, val, path, schemas, branchAssertions, nextId, depth + 1);
        if (branchAssertions.every((a) => a.passed)) {
          matchingBranches++;
        }
      }
      if (matchingBranches !== 1) {
        assertions.push({
          id: nextId(`oneof_${path}`),
          category: 'SCHEMA_STRUCTURE',
          path,
          expected: 'Exactly 1 matching oneOf schema branch',
          actual: `${matchingBranches} branches matched`,
          passed: false,
          message: `Expected value at '${path}' to match exactly 1 'oneOf' schema branch, but ${matchingBranches} matched.`,
        });
      }
    }

    // Composition: anyOf
    if (resolved.anyOf && resolved.anyOf.length > 0) {
      let matchingBranches = 0;
      for (const branch of resolved.anyOf) {
        const branchAssertions: AssertionResult[] = [];
        this.validateSchemaNode(branch, val, path, schemas, branchAssertions, nextId, depth + 1);
        if (branchAssertions.every((a) => a.passed)) {
          matchingBranches++;
        }
      }
      if (matchingBranches < 1) {
        assertions.push({
          id: nextId(`anyof_${path}`),
          category: 'SCHEMA_STRUCTURE',
          path,
          expected: 'At least 1 matching anyOf schema branch',
          actual: '0 branches matched',
          passed: false,
          message: `Expected value at '${path}' to match at least 1 'anyOf' schema branch, but none matched.`,
        });
      }
    }
  }

  private checkType(expectedType: string, val: unknown): boolean {
    if (expectedType === 'string') return typeof val === 'string';
    if (expectedType === 'number') return typeof val === 'number' && !Number.isNaN(val);
    if (expectedType === 'integer') return typeof val === 'number' && Number.isInteger(val);
    if (expectedType === 'boolean') return typeof val === 'boolean';
    if (expectedType === 'object') return typeof val === 'object' && val !== null && !Array.isArray(val);
    if (expectedType === 'array') return Array.isArray(val);
    if (expectedType === 'null') return val === null;
    return true;
  }
}
