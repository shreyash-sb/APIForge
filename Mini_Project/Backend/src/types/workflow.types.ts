import type { ApiRequest, ApiResponse } from './request.types.js';
import type { SanitizedApiRequest } from './testExecution.types.js';
import type { TestExpectation } from './testCase.types.js';
import type { TestCaseValidationResult } from './validation.types.js';

/**
 * Environment Variable representation
 */
export interface EnvironmentVariable {
  name: string;
  value: string;
  isSecret: boolean;
  enabled?: boolean;
  description?: string;
}

/**
 * Environment Profile containing baseUrl and variables
 */
export interface EnvironmentProfile {
  id: string;
  name: string;
  description?: string;
  baseUrl?: string;
  variables: EnvironmentVariable[];
  headers?: Record<string, string>;
  isDefault?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Supported sources for response extraction
 */
export type ExtractorSource = 'BODY_JSONPATH' | 'HEADER' | 'STATUS_CODE';

/**
 * Extraction rule to capture values from an executed step response into context
 */
export interface ResponseExtractor {
  targetVariable: string;
  source: ExtractorSource;
  path?: string; // e.g. "$.id", "$.data.token", "Location", "x-request-id"
  defaultValue?: string;
  isSecret?: boolean;
}

export const MAX_WORKFLOW_STEPS = 50;

/**
 * A single step within an automated multi-step workflow scenario
 */
export interface WorkflowStep {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  request: ApiRequest;
  dependsOn?: string[]; // IDs of prerequisite steps in the scenario
  extractors?: ResponseExtractor[];
  expected?: TestExpectation;
  isSetup?: boolean;
  isTeardown?: boolean;
  continueOnValidationFailure?: boolean;
}

/**
 * Multi-step Workflow Scenario
 */
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

/**
 * Explicit execution status for workflow steps
 */
export type WorkflowStepStatus =
  | 'PASSED_EXECUTION'
  | 'FAILED_EXECUTION'
  | 'ERROR'
  | 'SKIPPED'
  | 'BLOCKED_BY_DEPENDENCY';

/**
 * Execution result for a single workflow step
 */
export interface WorkflowStepExecutionResult {
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
  extractedVariables?: Record<string, { value: unknown; isSecret: boolean }>;
  extractionErrors?: Array<{ targetVariable: string; message: string }>;
}

/**
 * Overall workflow scenario execution summary and result
 */
export interface WorkflowExecutionSummary {
  totalSteps: number;
  executed: number;
  passed: number;
  failed: number;
  skipped: number;
  blocked: number;
  totalDurationMs: number;
}

export interface WorkflowExecutionResult {
  scenarioId: string;
  scenarioName: string;
  status: 'COMPLETED' | 'FAILED' | 'PARTIALLY_COMPLETED' | 'CANCELLED';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  stepResults: WorkflowStepExecutionResult[];
  finalContext: Record<string, { value: unknown; isSecret: boolean }>;
  summary: WorkflowExecutionSummary;
}

/**
 * Sanitized Variable Entry ensuring secret values are never exposed raw in public DTOs
 */
export interface SanitizedVariableEntry {
  value: unknown;
  isSecret: boolean;
}

/**
 * Sanitized step execution result for API exposure
 */
export interface SanitizedWorkflowStepExecutionResult extends Omit<WorkflowStepExecutionResult, 'extractedVariables'> {
  extractedVariables?: Record<string, SanitizedVariableEntry>;
}

/**
 * Sanitized workflow scenario execution result DTO
 */
export interface SanitizedWorkflowExecutionResult extends Omit<WorkflowExecutionResult, 'stepResults' | 'finalContext'> {
  stepResults: SanitizedWorkflowStepExecutionResult[];
  finalContext: Record<string, SanitizedVariableEntry>;
}

/**
 * API Request & Response DTOs
 */
export interface ExecuteWorkflowRequest {
  scenario: WorkflowScenario;
  environment?: EnvironmentProfile;
}

export interface ValidateWorkflowRequest {
  scenario: WorkflowScenario;
}

export interface ValidateWorkflowResponse {
  valid: boolean;
  errors: string[];
}

export interface PreviewRequestWorkflowRequest {
  request: ApiRequest;
  environment?: EnvironmentProfile;
}

export interface PreviewRequestWorkflowResponse {
  sanitizedRequest: SanitizedApiRequest;
  resolvedVariables: string[];
  containsSecret: boolean;
}

