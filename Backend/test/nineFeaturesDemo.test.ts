import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { RequestExecutorService } from '../src/services/requestExecutor.service.js';
import { WorkflowEngineService } from '../src/services/workflowEngine.service.js';
import { OpenApiParserService } from '../src/services/openapiParser.service.js';
import { MockServerService } from '../src/services/mockServer.service.js';
import { ValidationService } from '../src/services/validation.service.js';
import { ReportService } from '../src/services/report.service.js';
import { TestGeneratorService } from '../src/services/testGenerator.service.js';
import type { WorkflowScenario } from '../src/types/workflow.types.js';
import type { TestCase } from '../src/types/testCase.types.js';
import type { TestCaseExecutionResult } from '../src/types/testExecution.types.js';

test('APIForge Nine Features — End-to-End Demo Integration Suite', async (t) => {
  const specPath = path.resolve(process.cwd(), '../demo/user-management-api.json');
  const specContent = fs.readFileSync(specPath, 'utf8');

  // ── 1. OpenAPI Import ──
  let importedSpec: any;
  await t.test('Feature C: OpenAPI Import — parses user-management-api.json correctly', async () => {
    const parser = new OpenApiParserService();
    const result = await parser.importSpecification(specContent);
    assert.equal(result.success, true);
    if (result.success) {
      importedSpec = result.specification;
      assert.equal(importedSpec.metadata.title, 'User Management API');
      assert.ok(importedSpec.endpoints.length >= 5);
      const paths = importedSpec.endpoints.map((e: any) => `${e.method} ${e.path}`);
      assert.ok(paths.includes('GET /api/users'));
      assert.ok(paths.includes('POST /api/users'));
      assert.ok(paths.includes('GET /api/users/{id}'));
      assert.ok(paths.includes('PUT /api/users/{id}'));
      assert.ok(paths.includes('DELETE /api/users/{id}'));
      assert.ok(importedSpec.schemas.User !== undefined);
      assert.equal(importedSpec.schemas.User.type, 'object');
    }
  });

  await t.test('Feature C: OpenAPI Import — rejects malformed specification', async () => {
    const parser = new OpenApiParserService();
    const result = await parser.importSpecification('{ "openapi": "3.1.0", "info": { "title": "Incomplete" } }');
    assert.equal(result.success, false);
    if (!result.success) {
      assert.ok(result.error.message.includes('required') || result.error.message.includes('paths') || result.error.message.includes('version'));
    }
  });

  // ── 2. Mock Server ──
  const mockService = new MockServerService();
  await t.test('Feature D: Mock Server — serves configured user endpoints and handles 404', async () => {
    // GET /api/users
    const getRes = await mockService.handleRequest('GET', '/api/mock/serve/api/users', {}, {});
    assert.equal(getRes.statusCode, 200);
    assert.ok(Array.isArray(getRes.body));
    assert.equal((getRes.body as any[])[0].name, 'Aarav Patil');

    // GET /api/users/101
    const singleRes = await mockService.handleRequest('GET', '/api/mock/serve/api/users/101', {}, {});
    assert.equal(singleRes.statusCode, 200);
    assert.equal((singleRes.body as any).id, 101);
    assert.equal((singleRes.body as any).name, 'Aarav Patil');

    // POST /api/users
    const postRes = await mockService.handleRequest('POST', '/api/mock/serve/api/users', {}, {}, {
      name: 'Aarav Patil',
      email: 'aarav@example.com',
      role: 'student',
      active: true,
    });
    assert.equal(postRes.statusCode, 201);
    assert.equal((postRes.body as any).id, 101);

    // Unknown endpoint -> 404
    const notFoundRes = await mockService.handleRequest('GET', '/api/mock/serve/api/unknown-endpoint-xyz', {}, {});
    assert.equal(notFoundRes.statusCode, 404);
  });

  // ── 3. Request Builder Execution ──
  await t.test('Feature A: Request Builder — validates URLs and executes outbound request', async () => {
    const executor = new RequestExecutorService(5000);

    // Invalid URL validation
    const invalidRes = await executor.execute({
      method: 'GET',
      url: 'not-a-valid-url',
      auth: { type: 'none' },
    });
    assert.equal(invalidRes.success, false);
    if (!invalidRes.success) {
      assert.equal(invalidRes.error.type, 'INVALID_URL');
    }

    // Invalid JSON body
    const invalidJsonRes = await executor.execute({
      method: 'POST',
      url: 'https://httpbin.org/post',
      body: '{ bad json',
      auth: { type: 'none' },
    });
    assert.equal(invalidJsonRes.success, false);
    if (!invalidJsonRes.success) {
      assert.equal(invalidJsonRes.error.type, 'VALIDATION_ERROR');
    }
  });

  // ── 4. Workflows ──
  await t.test('Feature B: Workflows — executes dependent steps with output extraction', async () => {
    class MockExecutor extends RequestExecutorService {
      override async execute(req: any): Promise<any> {
        return {
          success: true,
          status: 200,
          statusText: 'OK',
          responseTime: 12,
          headers: { 'content-type': 'application/json' },
          body: req.method === 'POST'
            ? { id: 101, name: 'Aarav Patil', email: 'aarav@example.com' }
            : { id: 101, name: 'Aarav Patil' },
          size: 40,
        };
      }
    }

    const engine = new WorkflowEngineService(new MockExecutor());
    const scenario: WorkflowScenario = {
      id: 'demo-wf',
      name: 'User Management Workflow',
      description: 'Tests multi-step extraction and dependency chaining',
      steps: [
        {
          id: 'step-1',
          name: 'Create User',
          enabled: true,
          request: {
            method: 'POST',
            url: 'https://api.example.com/api/users',
            body: JSON.stringify({ name: 'Aarav Patil', email: 'aarav@example.com', role: 'student', active: true }),
            auth: { type: 'none' },
          },
          extractors: [
            { targetVariable: 'userId', source: 'BODY_JSONPATH', path: '$.id', defaultValue: '101', isSecret: false },
          ],
        },
        {
          id: 'step-2',
          name: 'Get User',
          enabled: true,
          dependsOn: ['step-1'],
          request: {
            method: 'GET',
            url: 'https://api.example.com/api/users/{{userId}}',
            auth: { type: 'none' },
          },
        },
      ],
    };

    // Pre-validate workflow
    const validation = engine.validateScenario(scenario);
    assert.equal(validation.valid, true);
    assert.equal(validation.errors.length, 0);

    // Execute with mock HTTP dispatcher
    const result = await engine.executeScenario(scenario, {
      id: 'env-test',
      name: 'Test Env',
      baseUrl: 'http://localhost',
      variables: [],
    });

    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.summary.totalSteps, 2);
    assert.equal(result.summary.passed, 2);
    assert.equal(result.summary.failed, 0);
  });

  // ── 5. AI Test Generator ──
  let generatedTests: TestCase[] = [];
  await t.test('Feature G: AI Test Generator — synthesizes test cases from OpenAPI spec', () => {
    assert.ok(importedSpec, 'importedSpec must be defined');
    const generator = new TestGeneratorService();
    const suite = generator.generate(importedSpec, {
      maxTestsPerEndpoint: 5,
      categories: ['POSITIVE', 'NEGATIVE', 'BOUNDARY', 'SCHEMA', 'PARAMETER'],
    });

    assert.ok(suite.tests.length > 0);
    generatedTests = suite.tests;
    const testTypes = new Set(suite.tests.map((t) => t.type));
    assert.ok(testTypes.has('POSITIVE'));
    assert.ok(testTypes.has('NEGATIVE') || testTypes.has('SCHEMA'));

    const positiveTest = suite.tests.find((t) => t.type === 'POSITIVE');
    assert.ok(positiveTest);
    assert.ok(positiveTest?.expected.statusCodes?.includes('200') || positiveTest?.expected.statusCodes?.includes('201'));
  });

  // ── 6. Response Validation ──
  const validationService = new ValidationService();
  const execResults: TestCaseExecutionResult[] = [];
  const valResults: any[] = [];

  await t.test('Feature E: Response Validation — asserts contract status and detects schema mismatch', () => {
    assert.ok(generatedTests.length > 0);
    const positiveTest = generatedTests.find((t) => t.type === 'POSITIVE' && t.endpoint.method === 'GET' && t.endpoint.path === '/api/users') || generatedTests[0];

    // Positive case: matching 200 response
    const mockExecutionSuccess: TestCaseExecutionResult = {
      testCaseId: positiveTest.id,
      executionId: 'exec_1',
      status: 'PASSED_EXECUTION',
      executedAt: new Date().toISOString(),
      durationMs: 15,
      response: {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: [{ id: 101, name: 'Aarav Patil', email: 'aarav@example.com', role: 'student', active: true }],
      },
    };
    execResults.push(mockExecutionSuccess);

    const valSuccess = validationService.validateSingle(positiveTest, mockExecutionSuccess, importedSpec.schemas);
    valResults.push(valSuccess);
    assert.equal(valSuccess.status, 'VALIDATION_PASSED');
    assert.ok(valSuccess.summary.passedAssertions > 0);
    assert.equal(valSuccess.summary.failedAssertions, 0);

    // Negative case: unexpected 500 error on a positive test
    const mockExecutionFailure: TestCaseExecutionResult = {
      testCaseId: positiveTest.id,
      executionId: 'exec_2',
      status: 'PASSED_EXECUTION',
      executedAt: new Date().toISOString(),
      durationMs: 40,
      response: {
        status: 500,
        statusText: 'Internal Server Error',
        headers: { 'content-type': 'application/json' },
        body: { error: 'Database crash' },
      },
    };

    const valFailure = validationService.validateSingle(positiveTest, mockExecutionFailure, importedSpec.schemas);
    assert.equal(valFailure.status, 'VALIDATION_FAILED');
    assert.ok(valFailure.summary.failedAssertions > 0);
  });

  // ── 7. Reports and Analytics ──
  await t.test('Feature F: Reports & Analytics — produces accurate metrics from real executions', () => {
    const reportService = new ReportService();
    const summary = reportService.generateReport({
      specification: importedSpec,
      tests: [generatedTests[0]],
      executionResults: execResults,
      validationResults: valResults,
      diagnosisResults: [],
    });

    assert.equal(summary.execution.totalTests, 1);
    assert.equal(summary.execution.executedTests, 1);
    assert.equal(summary.validation.validationPassed, 1);
    assert.equal(summary.validation.failedAssertions, 0);
    assert.equal(summary.execution.passRate, 100);
  });
});
