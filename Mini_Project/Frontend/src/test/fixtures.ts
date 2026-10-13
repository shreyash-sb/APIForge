import type { ApiSpecification } from '@/types/openapi.types';
import type { TestCase } from '@/types/testCase.types';
import type { TestCaseExecutionResult } from '@/types/testExecution.types';
import type { TestCaseValidationResult } from '@/types/validation.types';
import type { ReportSummary } from '@/types/report.types';
import type { WorkflowScenario } from '@/types/workflow.types';

export const mockSpecification: ApiSpecification = {
  version: 'openapi-3.0',
  metadata: {
    title: 'User Management API',
    version: '1.0.0',
    description: 'API for managing user records and authentication.',
  },
  servers: [{ url: 'https://api.example.com/v1', description: 'Production server' }],
  endpoints: [
    {
      id: 'ep-get-user',
      path: '/users/{id}',
      method: 'GET',
      operationId: 'getUserById',
      summary: 'Get User By ID',
      description: 'Retrieve user details using unique user identifier.',
      tags: ['Users'],
      deprecated: false,
      parameters: [
        {
          name: 'id',
          location: 'path',
          required: true,
          description: 'Unique user identifier',
          schema: { type: 'string' },
        },
        {
          name: 'expand',
          location: 'query',
          required: false,
          description: 'Expand related models',
          schema: { type: 'boolean' },
        },
      ],
      responses: [
        {
          statusCode: '200',
          description: 'User details found',
          headers: {},
          content: [
            {
              contentType: 'application/json',
              schema: { reference: '#/components/schemas/User' },
              example: { id: 'usr_123', name: 'Alice Smith', email: 'alice@example.com' },
            },
          ],
        },
        {
          statusCode: '404',
          description: 'User not found',
          headers: {},
          content: [],
        },
      ],
      security: [{ scheme: 'bearerAuth', scopes: [] }],
    },
    {
      id: 'ep-create-user',
      path: '/users',
      method: 'POST',
      operationId: 'createUser',
      summary: 'Create New User',
      tags: ['Users'],
      deprecated: false,
      parameters: [],
      requestBody: {
        required: true,
        content: [
          {
            contentType: 'application/json',
            schema: { reference: '#/components/schemas/NewUser' },
            example: { name: 'Bob Jones', email: 'bob@example.com' },
          },
        ],
      },
      responses: [
        {
          statusCode: '201',
          description: 'User created successfully',
          headers: {},
          content: [
            {
              contentType: 'application/json',
              example: { id: 'usr_456', name: 'Bob Jones' },
            },
          ],
        },
      ],
      security: [{ scheme: 'bearerAuth', scopes: [] }],
    },
  ],
  schemas: {
    User: {
      type: 'object',
      required: ['id', 'name', 'email'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        email: { type: 'string', format: 'email' },
      },
    },
  },
  securitySchemes: {
    bearerAuth: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    },
  },
};

export const mockTestCase: TestCase = {
  id: 'tc-get-user-pos',
  name: 'GET /users/{id} - Valid Request',
  description: 'Expect 200 OK with valid user response schema',
  type: 'POSITIVE',
  priority: 'HIGH',
  enabled: true,
  endpoint: {
    method: 'GET',
    path: '/users/{id}',
    operationId: 'getUserById',
  },
  request: {
    method: 'GET',
    url: 'https://api.example.com/v1/users/usr_123',
    queryParams: [],
    headers: [
      { key: 'Accept', value: 'application/json', enabled: true },
      { key: 'Authorization', value: 'Bearer mock-token', enabled: true },
    ],
    body: null,
    auth: { type: 'bearer', token: 'mock-token' },
  },
  pathParams: { id: 'usr_123' },
  expected: {
    statusCodes: ['200'],
    statusClass: '2xx',
  },
  metadata: {
    sourceEndpointId: 'ep-get-user',
    rule: 'POSITIVE_HAPPY_PATH',
  },
};

export const mockExecutionResult: TestCaseExecutionResult = {
  testCaseId: 'tc-get-user-pos',
  executionId: 'exec-1234',
  status: 'PASSED_EXECUTION',
  startedAt: '2026-10-12T10:00:00.000Z',
  completedAt: '2026-10-12T10:00:00.045Z',
  durationMs: 45,
  request: {
    method: 'GET',
    url: 'https://api.example.com/v1/users/usr_123',
    auth: {
      type: 'bearer',
      redacted: true,
      description: 'Bearer [REDACTED]',
    },
  },
  response: {
    success: true,
    status: 200,
    statusText: 'OK',
    responseTime: 45,
    headers: { 'content-type': 'application/json' },
    body: { id: 'usr_123', name: 'Alice Smith', email: 'alice@example.com' },
    size: 64,
  },
};

export const mockValidationResult: TestCaseValidationResult = {
  testCaseId: 'tc-get-user-pos',
  executionId: 'exec-1234',
  status: 'VALIDATION_PASSED',
  validatedAt: '2026-10-12T10:00:01.000Z',
  durationMs: 12,
  summary: {
    totalAssertions: 2,
    passedAssertions: 2,
    failedAssertions: 0,
  },
  assertions: [
    {
      id: 'as-1',
      category: 'STATUS_CODE',
      path: 'response.status',
      expected: '200',
      actual: '200',
      passed: true,
      message: 'Status code matches expected 200',
    },
    {
      id: 'as-2',
      category: 'CONTENT_TYPE',
      path: 'response.headers.content-type',
      expected: 'application/json',
      actual: 'application/json',
      passed: true,
      message: 'Content type matches JSON schema',
    },
  ],
};

export const mockReportSummary: ReportSummary = {
  metadata: {
    reportId: 'rep-mock-001',
    generatedAt: '2026-10-12T10:00:05.000Z',
    specificationTitle: 'User Management API',
    specificationVersion: '1.0.0',
    targetEnvironment: 'Production',
    executionDurationMs: 45,
    validationDurationMs: 12,
    diagnosisDurationMs: 0,
  },
  execution: {
    totalTests: 1,
    executedTests: 1,
    passedExecution: 1,
    failedExecution: 0,
    errors: 0,
    skipped: 0,
    unexecuted: 0,
    averageDurationMs: 45,
    passRate: 100,
  },
  validation: {
    totalValidated: 1,
    validationPassed: 1,
    validationFailed: 0,
    notValidatable: 0,
    skipped: 0,
    unvalidated: 0,
    totalAssertions: 2,
    passedAssertions: 2,
    failedAssertions: 0,
    assertionFailureRate: 0,
    failureByCategory: {
      STATUS_CODE: 0,
      HEADER: 0,
      CONTENT_TYPE: 0,
      SCHEMA_TYPE: 0,
      SCHEMA_REQUIRED: 0,
      SCHEMA_CONSTRAINT: 0,
      SCHEMA_ENUM: 0,
      SCHEMA_STRUCTURE: 0,
    },
  },
  diagnosis: {
    diagnosedTests: 0,
    totalFindings: 0,
    severityDistribution: {
      CRITICAL: 0,
      ERROR: 0,
      WARNING: 0,
      INFO: 0,
    },
    confidenceDistribution: {
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    },
  },
  endpoints: [
    {
      method: 'GET',
      path: '/users/{id}',
      operationId: 'getUserById',
      totalTests: 1,
      executionPassed: 1,
      executionFailed: 0,
      validationPassed: 1,
      validationFailed: 0,
      notValidatable: 0,
      unvalidated: 0,
      passPercentage: 100,
      overallStatus: 'PASSED',
    },
  ],
  failures: [],
};

export const mockWorkflow: WorkflowScenario = {
  id: 'wf-test-01',
  name: 'User Onboarding Workflow',
  description: 'Simulates complete user onboarding pipeline',
  metadata: {
    createdAt: '2026-10-12T10:00:00.000Z',
    updatedAt: '2026-10-12T10:00:00.000Z',
  },
  steps: [
    {
      id: 'step-create',
      name: 'Register User',
      description: 'Create user account',
      enabled: true,
      request: {
        method: 'POST',
        url: '{{baseUrl}}/users',
        headers: [{ id: 'h1', key: 'Content-Type', value: 'application/json', enabled: true }],
        queryParams: [],
        body: JSON.stringify({ name: 'Charlie', email: 'charlie@example.com' }),
        auth: { type: 'none' },
      },
      extractors: [
        {
          targetVariable: 'createdUserId',
          source: 'BODY_JSONPATH',
          path: '$.id',
          defaultValue: 'default-id',
          isSecret: false,
        },
      ],
    },
    {
      id: 'step-get',
      name: 'Verify User',
      description: 'Fetch created user',
      enabled: true,
      dependsOn: ['step-create'],
      request: {
        method: 'GET',
        url: '{{baseUrl}}/users/{{createdUserId}}',
        headers: [],
        queryParams: [],
        body: '',
        auth: { type: 'none' },
      },
    },
  ],
};
