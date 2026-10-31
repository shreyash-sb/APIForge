import type { ApiSpecification } from './openapi.types.js';
import type { TestCase, TestCaseType, TestPriority } from './testCase.types.js';
import type { TestExecutionStatus } from './testExecution.types.js';
import type { AssertionCategory, ValidationStatus } from './validation.types.js';
import type { AiProviderName, AiProviderStatus, DiagnosisConfidence, DiagnosisSeverity } from './diagnosis.types.js';

export type ReportTestCaseInput = Pick<TestCase, 'id' | 'name' | 'type' | 'priority' | 'enabled' | 'endpoint'>;

/** Deliberately excludes requests, headers, credentials, and response bodies. */
export interface ReportExecutionResultInput {
  testCaseId: string;
  executionId: string;
  status: TestExecutionStatus;
  durationMs: number;
  httpStatus?: number;
  errorMessage?: string;
}

export interface ReportValidationResultInput {
  testCaseId: string;
  executionId: string;
  status: ValidationStatus;
  durationMs: number;
  assertions: Array<{
    category: AssertionCategory;
    path: string;
    expected: string;
    actual: string;
    passed: boolean;
    message: string;
  }>;
}

export interface ReportDiagnosisResultInput {
  diagnosisId: string;
  testCaseId: string;
  executionId: string;
  durationMs: number;
  confidence: DiagnosisConfidence;
  summary: string;
  findings: Array<{ severity: DiagnosisSeverity }>;
  /** Safe provenance metadata only — never credentials */
  provider?: AiProviderName;
  providerStatus?: AiProviderStatus;
}

export interface GenerateReportRequest {
  specification: Pick<ApiSpecification, 'metadata' | 'servers'>;
  tests: ReportTestCaseInput[];
  executionResults: ReportExecutionResultInput[];
  validationResults: ReportValidationResultInput[];
  diagnosisResults?: ReportDiagnosisResultInput[];
}

export interface ReportMetadata {
  reportId: string;
  generatedAt: string;
  specificationTitle: string;
  specificationVersion: string;
  targetEnvironment?: string;
  executionDurationMs: number;
  validationDurationMs: number;
  diagnosisDurationMs: number;
}

export interface ReportExecutionMetrics {
  totalTests: number;
  executedTests: number;
  passedExecution: number;
  failedExecution: number;
  errors: number;
  skipped: number;
  unexecuted: number;
  averageDurationMs: number;
  passRate: number | null;
}

export interface ReportValidationMetrics {
  totalValidated: number;
  validationPassed: number;
  validationFailed: number;
  notValidatable: number;
  skipped: number;
  unvalidated: number;
  totalAssertions: number;
  passedAssertions: number;
  failedAssertions: number;
  assertionFailureRate: number | null;
  failureByCategory: Record<AssertionCategory, number>;
}

export interface ReportDiagnosisMetrics {
  diagnosedTests: number;
  totalFindings: number;
  severityDistribution: Record<DiagnosisSeverity, number>;
  confidenceDistribution: Record<DiagnosisConfidence, number>;
}

export type EndpointOverallStatus = 'PASSED' | 'FAILED' | 'PARTIAL' | 'UNTESTED';
export interface EndpointReportItem {
  method: string;
  path: string;
  operationId?: string;
  totalTests: number;
  executionPassed: number;
  executionFailed: number;
  validationPassed: number;
  validationFailed: number;
  notValidatable: number;
  unvalidated: number;
  passPercentage: number | null;
  overallStatus: EndpointOverallStatus;
}

export interface FailureBreakdownItem {
  testCaseId: string;
  testName: string;
  method: string;
  path: string;
  testType: TestCaseType;
  priority: TestPriority;
  executionStatus?: TestExecutionStatus;
  validationStatus: ValidationStatus | 'UNVALIDATED';
  httpStatus?: number;
  failedAssertionCount: number;
  failedAssertionCategories: AssertionCategory[];
  failedAssertionPaths: string[];
  expected?: string;
  actual?: string;
  message?: string;
  aiDiagnosisSummary?: string;
  aiSeverity?: DiagnosisSeverity;
  aiConfidence?: DiagnosisConfidence;
  aiProvider?: AiProviderName;
  aiProviderStatus?: AiProviderStatus;
  diagnosisId?: string;
}

export interface ReportSummary {
  metadata: ReportMetadata;
  execution: ReportExecutionMetrics;
  validation: ReportValidationMetrics;
  diagnosis: ReportDiagnosisMetrics;
  endpoints: EndpointReportItem[];
  failures: FailureBreakdownItem[];
}
