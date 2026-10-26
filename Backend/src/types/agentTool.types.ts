import type { HttpMethod } from './request.types.js';
import type { TestCase } from './testCase.types.js';
import type { TestCaseExecutionResult } from './testExecution.types.js';
import type { TestCaseValidationResult } from './validation.types.js';
import type { SanitizedEvidence } from './diagnosis.types.js';

export const AGENT_TOOL_NAMES = [
  'inspect_api',
  'send_api_request',
  'generate_test_cases',
  'run_api_tests',
  'generate_mock_api',
  'generate_openapi_spec',
  'analyze_failure',
  'generate_code_patch',
  'verify_code_patch',
  'get_execution_report',
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

export type AgentToolRisk = 'READ_ONLY' | 'LOCAL_DRAFT' | 'NETWORK_EXECUTION' | 'DESTRUCTIVE';

export interface ToolPolicy {
  risk: AgentToolRisk;
  requiresApproval: boolean;
  description: string;
}

export const AGENT_TOOL_POLICIES: Record<AgentToolName, ToolPolicy> = {
  inspect_api: {
    risk: 'READ_ONLY',
    requiresApproval: false,
    description: 'Inspect OpenAPI specification or live endpoint contract.',
  },
  send_api_request: {
    risk: 'NETWORK_EXECUTION',
    requiresApproval: true,
    description: 'Execute an outbound HTTP request to an external or live API.',
  },
  generate_test_cases: {
    risk: 'READ_ONLY',
    requiresApproval: false,
    description: 'Generate comprehensive positive, negative, and boundary test cases.',
  },
  run_api_tests: {
    risk: 'NETWORK_EXECUTION',
    requiresApproval: true,
    description: 'Execute a batch of generated API tests and validate responses.',
  },
  generate_mock_api: {
    risk: 'LOCAL_DRAFT',
    requiresApproval: false,
    description: 'Provision ephemeral local mock routes from an OpenAPI spec or schema.',
  },
  generate_openapi_spec: {
    risk: 'LOCAL_DRAFT',
    requiresApproval: false,
    description: 'Synthesize a validated OpenAPI 3.1 contract from natural language or requirements.',
  },
  analyze_failure: {
    risk: 'READ_ONLY',
    requiresApproval: false,
    description: 'Perform deterministic and AI diagnosis of API test failures and HTTP errors.',
  },
  generate_code_patch: {
    risk: 'LOCAL_DRAFT',
    requiresApproval: false,
    description: 'Generate targeted code patch or handler implementation to fix defect.',
  },
  verify_code_patch: {
    risk: 'LOCAL_DRAFT',
    requiresApproval: false,
    description: 'Verify proposed code patch in an isolated sandbox by running test cases.',
  },
  get_execution_report: {
    risk: 'READ_ONLY',
    requiresApproval: false,
    description: 'Compile full execution analytics, pass/fail metrics, and compliance report.',
  },
};

// Tool Input & Output Definitions

export interface InspectApiInput {
  spec?: string | object;
  targetUrl?: string;
  endpointId?: string;
}

export interface InspectApiOutput {
  title: string;
  version: string;
  endpointsCount: number;
  endpoints: Array<{
    id: string;
    method: string;
    path: string;
    summary?: string;
    parameters: Array<{ name: string; in: string; required: boolean }>;
    requestBody?: boolean;
    responses: string[];
  }>;
}

export interface SendApiRequestInput {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export interface SendApiRequestOutput {
  status: number;
  statusText: string;
  durationMs: number;
  headers: Record<string, string>;
  body: unknown;
  success: boolean;
}

export interface GenerateTestCasesInput {
  spec: string | object;
  endpointIds?: string[];
  categories?: string[];
  maxTestsPerEndpoint?: number;
}

export interface GenerateTestCasesOutput {
  specTitle: string;
  totalTests: number;
  tests: TestCase[];
}

export interface RunApiTestsInput {
  tests?: TestCase[];
  spec?: string | object;
  baseUrl?: string;
  stopOnFailure?: boolean;
}

export interface RunApiTestsOutput {
  total: number;
  executed: number;
  passed: number;
  failed: number;
  durationMs: number;
  results: TestCaseExecutionResult[];
  validationSummary?: {
    totalAssertions: number;
    passedAssertions: number;
    failedAssertions: number;
    passRate: number;
  };
}

export interface GenerateMockApiInput {
  spec?: string | object;
  routes?: Array<{
    method: HttpMethod;
    path: string;
    statusCode: number;
    responseBody: unknown;
  }>;
}

export interface GenerateMockApiOutput {
  mockServerId: string;
  routesCount: number;
  routes: Array<{
    method: HttpMethod;
    path: string;
    fullPath: string;
    statusCode: number;
  }>;
}

export interface GenerateOpenapiSpecInput {
  description: string;
  title?: string;
  version?: string;
  endpoints?: Array<{
    method: HttpMethod;
    path: string;
    summary?: string;
    description?: string;
    parameters?: Array<{ name: string; in: 'query' | 'path' | 'header'; required?: boolean; type?: string }>;
    requestBody?: { description?: string; required?: boolean; schema?: object };
    responses?: Record<string, { description: string; schema?: object }>;
  }>;
}

export interface GenerateOpenapiSpecOutput {
  specYaml: string;
  specJson: Record<string, unknown>;
  isValid: boolean;
  endpointsCount: number;
  errors?: string[];
}

export interface AnalyzeFailureInput {
  evidence?: SanitizedEvidence;
  testCase?: TestCase;
  execution?: TestCaseExecutionResult;
  validation?: TestCaseValidationResult;
  failureMessage?: string;
}

export interface AnalyzeFailureOutput {
  rootCause: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  explanation: string;
  suggestedFix: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  relatedAssertionId?: string;
}

export interface GenerateCodePatchInput {
  failureSummary: string;
  currentCode: string;
  endpoint?: string;
  language?: string;
}

export interface GenerateCodePatchOutput {
  patchId: string;
  originalCode: string;
  modifiedCode: string;
  diff: string;
  explanation: string;
}

export interface VerifyCodePatchInput {
  originalCode?: string;
  modifiedCode: string;
  tests: TestCase[] | Array<{ name: string; input: unknown; expected: unknown }>;
}

export interface VerifyCodePatchOutput {
  verified: boolean;
  allTestsPassed: boolean;
  testResults: Array<{
    name: string;
    passed: boolean;
    actual?: unknown;
    expected?: unknown;
    error?: string;
  }>;
  output: string;
}

export interface GetExecutionReportInput {
  taskId?: string;
  testSuiteTitle?: string;
  executionResults?: TestCaseExecutionResult[];
  validationResults?: Record<string, TestCaseValidationResult>;
  format?: 'json' | 'markdown';
}

export interface GetExecutionReportOutput {
  reportId: string;
  generatedAt: string;
  summary: {
    totalTests: number;
    passedExecutions: number;
    failedExecutions: number;
    validationPassRate: number;
    averageDurationMs: number;
  };
  markdownReport: string;
  complianceStatus: 'COMPLIANT' | 'NEEDS_ATTENTION' | 'NON_COMPLIANT';
}

// Orchestrator Types

export type AgentTaskStatus =
  | 'PLANNING'
  | 'READY'
  | 'WAITING_FOR_APPROVAL'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type AgentStepStatus =
  | 'PENDING'
  | 'WAITING_FOR_APPROVAL'
  | 'APPROVED'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'SKIPPED';

export interface AgentStepProposal {
  stepId: string;
  tool: AgentToolName;
  arguments: Record<string, unknown>;
  dependsOn: string[];
  risk: AgentToolRisk;
  requiresApproval: boolean;
  summary: string;
  status: AgentStepStatus;
  startedAt?: string;
  completedAt?: string;
  output?: unknown;
  error?: string;
}

export interface AgentArtifact {
  id: string;
  name: string;
  type: 'openapi_spec' | 'test_suite' | 'code_patch' | 'report' | 'mock_server' | 'json';
  content: unknown;
  createdAt: string;
}

export interface AgentTask {
  taskId: string;
  goal: string;
  status: AgentTaskStatus;
  steps: AgentStepProposal[];
  currentStepIndex: number;
  artifacts: AgentArtifact[];
  advisoryPlan: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
}
