import type { ApiRequest, ApiResponse } from './request.types';
import type { SanitizedApiRequest } from './testExecution.types';
import type { TestExpectation } from './testCase.types';
import type { TestCaseValidationResult } from './validation.types';
import type { FrontendEnvironmentProfile } from './environment.types';

export const MAX_WORKFLOW_STEPS = 50;

export type ExtractorSource = 'BODY_JSONPATH' | 'HEADER' | 'STATUS_CODE';

export interface ResponseExtractor {
  targetVariable: string;
  source: ExtractorSource;
  path?: string;
  defaultValue?: string;
  isSecret?: boolean;
}

export interface WorkflowStep {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  request: ApiRequest;
  dependsOn?: string[];
  extractors?: ResponseExtractor[];
  expected?: TestExpectation;
  isSetup?: boolean;
  isTeardown?: boolean;
  continueOnValidationFailure?: boolean;
}

export interface WorkflowScenario {
  id: string;
  name: string;
  description?: string;
  environmentId?: string;
  steps: WorkflowStep[];
  metadata?: {
    tags?: string[];
    createdAt?: string;
    updatedAt?: string;
  };
}

export type WorkflowStepStatus =
  | 'PASSED_EXECUTION'
  | 'FAILED_EXECUTION'
  | 'ERROR'
  | 'SKIPPED'
  | 'BLOCKED_BY_DEPENDENCY';

export interface SanitizedVariableEntry {
  value: unknown;
  isSecret: boolean;
}

export interface SanitizedWorkflowStepExecutionResult {
  stepId: string;
  stepName: string;
  status: WorkflowStepStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  request: SanitizedApiRequest;
  response?: ApiResponse;
  validationResult?: TestCaseValidationResult;
  skipReason?: string;
  isSetup?: boolean;
  isTeardown?: boolean;
  error?: {
    type: string;
    message: string;
    details?: string;
  };
  extractedVariables?: Record<string, SanitizedVariableEntry>;
  extractionErrors?: Array<{ targetVariable: string; message: string }>;
}

export interface WorkflowExecutionSummary {
  totalSteps: number;
  executed: number;
  passed: number;
  failed: number;
  skipped: number;
  blocked: number;
  totalDurationMs: number;
}

export interface SanitizedWorkflowExecutionResult {
  scenarioId: string;
  scenarioName: string;
  status: 'COMPLETED' | 'FAILED' | 'PARTIALLY_COMPLETED' | 'CANCELLED';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  stepResults: SanitizedWorkflowStepExecutionResult[];
  finalContext: Record<string, SanitizedVariableEntry>;
  summary: WorkflowExecutionSummary;
}

export interface ExecuteWorkflowRequest {
  scenario: WorkflowScenario;
  environment?: FrontendEnvironmentProfile;
}

export interface ValidateWorkflowResponse {
  valid: boolean;
  errors: string[];
}

export interface PreviewRequestWorkflowResponse {
  sanitizedRequest: SanitizedApiRequest;
  resolvedVariables: string[];
  containsSecret: boolean;
}
