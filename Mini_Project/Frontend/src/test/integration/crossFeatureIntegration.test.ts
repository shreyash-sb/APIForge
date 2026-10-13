import { describe, it, expect, beforeEach } from 'vitest';
import { openApiService } from '@/services/openapiService';
import { testGeneratorService } from '@/services/testGeneratorService';
import { testExecutionService } from '@/services/testExecutionService';
import { validationService } from '@/services/validationService';
import { diagnosisService } from '@/services/diagnosisService';
import { reportService } from '@/services/reportService';
import { mockServerService } from '@/services/mockServerService';
import { workflowService, WorkflowApiError } from '@/services/workflowService';
import { requestService } from '@/services/requestService';
import { useAppStore } from '@/store/useAppStore';
import type { ApiResponse } from '@/types/request.types';
import type { TestCase } from '@/types/testCase.types';
import type { TestCaseExecutionResult } from '@/types/testExecution.types';
import type { TestCaseValidationResult } from '@/types/validation.types';
import type { WorkflowScenario } from '@/types/workflow.types';
import type { FrontendEnvironmentProfile } from '@/types/environment.types';

// Deterministic OpenAPI 3.0 specification for cross-feature integration testing
const SAMPLE_OPENAPI_SPEC = JSON.stringify({
  openapi: '3.0.3',
  info: {
    title: 'Cross Integration Inventory API',
    version: '1.0.0',
    description: 'API specification for end-to-end integration verification',
  },
  servers: [{ url: 'http://localhost:3001', description: 'Local Backend' }],
  paths: {
    '/api/mock/serve/items': {
      get: {
        summary: 'List inventory items',
        operationId: 'listItems',
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['items'],
                  properties: {
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['id', 'name'],
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
});

describe('Phase 12 Task 3: Cross-Feature Integration Suite', () => {
  beforeEach(() => {
    useAppStore.getState().resetWorkspace();
  });

  describe('Task 1 & Task 2 — Complete End-to-End User Journey Pipeline', () => {
    it('executes full pipeline: Import OpenAPI -> Generate Tests -> Execute -> Validate Contract -> AI Diagnose -> Generate Report -> Persist & Rehydrate', async () => {
      // 1. Setup Mock Endpoint to serve deterministic responses for test execution
      const createdRoute = await mockServerService.createRoute({
        name: 'Inventory Items Mock Endpoint',
        method: 'GET',
        path: '/items',
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { items: [{ id: 'item_1', name: 'Widget Pro' }] },
        enabled: true,
      });
      expect(createdRoute.id).toBeDefined();

      try {
        // 2. Import OpenAPI Specification
        const importResult = await openApiService.importSpecification(
          'inventory-spec.json',
          SAMPLE_OPENAPI_SPEC
        );
        expect(importResult.success).toBe(true);
        if (!importResult.success) {
          throw new Error('Import specification failed');
        }
        const spec = importResult.specification;
        expect(spec.endpoints.length).toBeGreaterThanOrEqual(1);

        // Update Store with active specification
        useAppStore.getState().setActiveSpecification(spec);
        expect(useAppStore.getState().activeSpecification?.metadata.title).toBe(
          'Cross Integration Inventory API'
        );

        // 3. Generate Deterministic Test Cases
        const generatedSuite = await testGeneratorService.generate({
          specification: spec,
          settings: {
            categories: ['POSITIVE', 'SCHEMA'],
            maxTestsPerEndpoint: 2,
          },
        });
        expect(generatedSuite.tests.length).toBeGreaterThanOrEqual(1);

        // Update Store with generated test cases
        useAppStore.getState().setGeneratedTests(generatedSuite.tests);
        expect(useAppStore.getState().generatedTests.length).toBe(generatedSuite.tests.length);

        // 4. Execute Test Case against Real Local Mock Endpoint
        const testCaseToRun = generatedSuite.tests.find(
          (t) => t.endpoint.method === 'GET'
        ) || generatedSuite.tests[0];

        // Ensure target test request points to the running backend mock serve endpoint
        const targetTestCase: TestCase = {
          ...testCaseToRun,
          request: {
            ...testCaseToRun.request,
            url: 'http://localhost:3001/api/mock/serve/items',
          },
        };

        const execResult: TestCaseExecutionResult = await testExecutionService.executeSingle(
          targetTestCase
        );
        expect(execResult.status).toBe('PASSED_EXECUTION');
        expect(execResult.response?.status).toBe(200);
        expect(execResult.response?.body).toEqual({
          items: [{ id: 'item_1', name: 'Widget Pro' }],
        });

        // Store execution result
        useAppStore.getState().updateExecutionResult(testCaseToRun.id, execResult);
        expect(useAppStore.getState().executionResults[testCaseToRun.id]).toBeDefined();

        // 5. Validate Returned Contract Assertions
        const valResult: TestCaseValidationResult = await validationService.validateSingle(
          testCaseToRun,
          execResult,
          spec.schemas
        );
        expect(valResult.testCaseId).toBe(testCaseToRun.id);
        expect(valResult.status).toBe('VALIDATION_PASSED');
        expect(valResult.assertions.length).toBeGreaterThan(0);
        expect(valResult.summary.failedAssertions).toBe(0);

        // Store validation result
        useAppStore.getState().updateValidationResult(testCaseToRun.id, valResult);
        expect(useAppStore.getState().validationResults[testCaseToRun.id]).toBeDefined();

        // 6. AI Diagnosis for Controlled Failure
        // Construct a controlled contract failure scenario
        const failingExecResult: TestCaseExecutionResult = {
          ...execResult,
          status: 'PASSED_EXECUTION',
          response: {
            ...execResult.response!,
            status: 500,
            body: { error: 'Internal Server Error' },
          },
        };
        const failingValResult: TestCaseValidationResult = {
          ...valResult,
          status: 'VALIDATION_FAILED',
          summary: {
            totalAssertions: 2,
            passedAssertions: 0,
            failedAssertions: 2,
          },
          assertions: [
            {
              id: 'ast_1',
              category: 'STATUS_CODE',
              path: 'status',
              passed: false,
              message: 'Expected status 200, got 500',
              actual: '500',
              expected: '200',
            },
          ],
        };

        const diagnosis = await diagnosisService.diagnoseSingle(
          testCaseToRun,
          failingExecResult,
          failingValResult
        );
        expect(diagnosis).toBeDefined();
        expect(diagnosis.findings).toBeDefined();
        expect(diagnosis.summary).toBeTruthy();

        // Store diagnosis result
        useAppStore.getState().updateDiagnosisResult(testCaseToRun.id, diagnosis);
        expect(useAppStore.getState().diagnosisResults[testCaseToRun.id]).toBeDefined();

        // 7. Generate Aggregated Report
        const reportPayload = reportService.createPayload(
          spec,
          [testCaseToRun],
          [execResult],
          [valResult],
          [diagnosis]
        );
        const reportSummary = await reportService.generateReport(reportPayload);
        expect(reportSummary.metadata.reportId).toBeDefined();
        expect(reportSummary.execution.totalTests).toBe(1);
        expect(reportSummary.execution.passRate).toBeGreaterThanOrEqual(0);

        // Store report in workspace
        useAppStore.getState().setReportSummary(reportSummary);
        expect(useAppStore.getState().reportSummary?.metadata.reportId).toBe(
          reportSummary.metadata.reportId
        );

        // 8. Verify Persistence and Rehydration State Integrity
        const storedRaw = localStorage.getItem('apiforge-workspace');
        expect(storedRaw).toBeTruthy();
        const parsed = JSON.parse(storedRaw!);
        expect(parsed.state.activeSpecification.metadata.title).toBe(
          'Cross Integration Inventory API'
        );
        expect(parsed.state.generatedTests.length).toBeGreaterThan(0);
        expect(parsed.state.executionResults[testCaseToRun.id]).toBeDefined();
        expect(parsed.state.validationResults[testCaseToRun.id]).toBeDefined();
        expect(parsed.state.reportSummary.metadata.reportId).toBe(reportSummary.metadata.reportId);
      } finally {
        // Cleanup mock route
        if (createdRoute.id) {
          await mockServerService.deleteRoute(createdRoute.id);
        }
      }
    });
  });

  describe('Task 3 — Workflows and Mock Server Integration', () => {
    it('creates mock route, dispatches request, checks traffic logs, and executes multi-step workflow with variable substitution', async () => {
      // 1. Create Mock Route
      const orderRoute = await mockServerService.createRoute({
        name: 'Order Checkout Mock',
        method: 'POST',
        path: '/orders/checkout',
        statusCode: 201,
        headers: { 'Content-Type': 'application/json', 'X-Order-Status': 'Created' },
        body: {
          orderId: 'ord_auto_777',
          status: 'CONFIRMED',
          total: 89.99,
        },
        enabled: true,
      });
      expect(orderRoute.id).toBeDefined();

      try {
        // 2. Direct HTTP Dispatch via requestService
        const directReqResult = await requestService.executeRequest({
          method: 'POST',
          url: 'http://localhost:3001/api/mock/serve/orders/checkout',
          headers: [{ id: 'h1', key: 'Content-Type', value: 'application/json', enabled: true }],
          body: JSON.stringify({ customer: 'Ada Lovelace', quantity: 2 }),
          auth: { type: 'none' },
        });

        expect(directReqResult.success).toBe(true);
        const successResp = directReqResult as ApiResponse;
        expect(successResp.status).toBe(201);
        expect(successResp.body).toEqual({
          orderId: 'ord_auto_777',
          status: 'CONFIRMED',
          total: 89.99,
        });

        // 3. Verify Traffic Logging
        const logs = await mockServerService.getLogs();
        expect(logs.length).toBeGreaterThan(0);
        const matchingLog = logs.find(
          (l) => l.path.includes('/orders/checkout') && l.method === 'POST'
        );
        expect(matchingLog).toBeDefined();
        expect(matchingLog?.responseStatus).toBe(201);

        // 4. Multi-step Workflow with variable extraction & substitution
        const workflowEnvironment: FrontendEnvironmentProfile = {
          id: 'env_wf_test',
          name: 'Integration Test Environment',
          baseUrl: 'http://localhost:3001',
          variables: [
            { name: 'customerCode', value: 'CUST-001', isSecret: false, enabled: true },
          ],
        };

        const workflowScenario: WorkflowScenario = {
          id: 'wf_cross_test_1',
          name: 'Order Lifecycle Workflow',
          description: 'Tests extraction and propagation against live mock endpoints',
          steps: [
            {
              id: 'step_1_create_order',
              name: 'Create Order',
              enabled: true,
              request: {
                method: 'POST',
                url: 'http://localhost:3001/api/mock/serve/orders/checkout',
                headers: [{ id: 'h1', key: 'Content-Type', value: 'application/json', enabled: true }],
                body: JSON.stringify({ code: '{{customerCode}}' }),
                auth: { type: 'none' },
              },
              extractors: [
                {
                  targetVariable: 'extractedOrderId',
                  source: 'BODY_JSONPATH',
                  path: '$.orderId',
                },
              ],
            },
            {
              id: 'step_2_verify_order',
              name: 'Verify Order Created',
              enabled: true,
              dependsOn: ['step_1_create_order'],
              request: {
                method: 'GET',
                url: 'http://localhost:3001/health',
                headers: [{ id: 'h2', key: 'X-Extracted-Id', value: '{{extractedOrderId}}', enabled: true }],
                auth: { type: 'none' },
              },
            },
            {
              id: 'teardown_cleanup',
              name: 'Teardown Step',
              enabled: true,
              isTeardown: true,
              request: {
                method: 'GET',
                url: 'http://localhost:3001/health',
                headers: [],
                auth: { type: 'none' },
              },
            },
          ],
        };

        const workflowResult = await workflowService.executeWorkflow(
          workflowScenario,
          workflowEnvironment
        );

        expect(workflowResult.status).toBe('COMPLETED');
        expect(workflowResult.stepResults.length).toBeGreaterThanOrEqual(2);
        expect(workflowResult.finalContext['extractedOrderId']?.value).toBe('ord_auto_777');
      } finally {
        if (orderRoute.id) {
          await mockServerService.deleteRoute(orderRoute.id);
        }
      }
    });
  });

  describe('Task 4 — State, Error Consistency, and Secret Sanitization', () => {
    it('preserves error typing and guarantees secret sanitization in persisted store', async () => {
      // 1. Error typing on invalid workflow payload
      const invalidWorkflow = {
        id: 'invalid_wf',
        name: 'Empty Workflow',
        steps: [],
      } as unknown as WorkflowScenario;

      await expect(
        workflowService.executeWorkflow(invalidWorkflow)
      ).rejects.toThrow(WorkflowApiError);

      // 2. Secret sanitization verification in localStorage
      useAppStore.getState().createEnvironment({
        name: 'Production Secrets',
        description: 'Environment with secrets',
        baseUrl: 'http://localhost:3001',
        variables: [
          { name: 'API_KEY', value: 'super-secret-key-9999', isSecret: true, enabled: true },
          { name: 'PUBLIC_URL', value: 'http://localhost:3001', isSecret: false, enabled: true },
        ],
      });

      const storedRaw = localStorage.getItem('apiforge-workspace');
      expect(storedRaw).toBeTruthy();
      expect(storedRaw).not.toContain('super-secret-key-9999');
      expect(storedRaw).toContain('PUBLIC_URL');

      // 3. Reset Workspace restores default empty state
      useAppStore.getState().resetWorkspace();
      expect(useAppStore.getState().activeSpecification).toBeUndefined();
      expect(useAppStore.getState().generatedTests).toEqual([]);
      expect(useAppStore.getState().executionResults).toEqual({});
      expect(useAppStore.getState().validationResults).toEqual({});
      expect(useAppStore.getState().reportSummary).toBeUndefined();
    });
  });
});
