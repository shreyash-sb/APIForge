import type { AssertionCategory } from '../types/validation.types.js';
import { redactSecrets } from '../utils/secretRedaction.js';
import type {
  EndpointReportItem,
  FailureBreakdownItem,
  GenerateReportRequest,
  ReportSummary,
} from '../types/report.types.js';

const assertionCategories: AssertionCategory[] = [
  'STATUS_CODE', 'HEADER', 'CONTENT_TYPE', 'SCHEMA_TYPE', 'SCHEMA_REQUIRED',
  'SCHEMA_CONSTRAINT', 'SCHEMA_ENUM', 'SCHEMA_STRUCTURE',
];
const severities = ['CRITICAL', 'ERROR', 'WARNING', 'INFO'] as const;
const confidences = ['HIGH', 'MEDIUM', 'LOW'] as const;
const executionStatuses = ['PENDING', 'RUNNING', 'PASSED_EXECUTION', 'FAILED_EXECUTION', 'ERROR', 'SKIPPED'] as const;
const validationStatuses = ['VALIDATION_PASSED', 'VALIDATION_FAILED', 'NOT_VALIDATABLE', 'SKIPPED'] as const;
const providerNames = ['google-gemini', 'mock'] as const;
const providerStatuses = ['live', 'mock', 'fallback'] as const;

export class ReportValidationError extends Error {}

const rate = (numerator: number, denominator: number): number | null =>
  denominator === 0 ? null : Number(((numerator / denominator) * 100).toFixed(2));

const safeTarget = (value?: string): string | undefined => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch { return undefined; }
};

const sanitizeText = (value?: string): string | undefined => value === undefined ? undefined : redactSecrets(String(value)).replace(
  /(authorization|api[-_ ]?key|password|cookie|secret|token)\s*[:=]\s*(bearer\s+)?[^\s,;]+|bearer\s+[\w.-]+|:\/\/[^\s/@:]+:[^\s/@]+@/gi,
  '[REDACTED]'
);

/** A read-only aggregation of already-produced lifecycle data. */
export class ReportService {
  generateReport(input: GenerateReportRequest): ReportSummary {
    this.validate(input);
    const executions = new Map(input.executionResults.map((item) => [item.testCaseId, item]));
    const validations = new Map(input.validationResults.map((item) => [item.testCaseId, item]));
    const diagnoses = new Map((input.diagnosisResults ?? []).map((item) => [item.testCaseId, item]));

    const execution = {
      totalTests: input.tests.length, executedTests: 0, passedExecution: 0, failedExecution: 0,
      errors: 0, skipped: 0, unexecuted: 0, averageDurationMs: 0, passRate: null as number | null,
    };
    const failureByCategory = Object.fromEntries(assertionCategories.map((category) => [category, 0])) as Record<AssertionCategory, number>;
    const validation = {
      totalValidated: 0, validationPassed: 0, validationFailed: 0, notValidatable: 0, skipped: 0,
      unvalidated: 0, totalAssertions: 0, passedAssertions: 0, failedAssertions: 0,
      assertionFailureRate: null as number | null, failureByCategory,
    };
    const diagnosis = {
      diagnosedTests: diagnoses.size, totalFindings: 0,
      severityDistribution: { CRITICAL: 0, ERROR: 0, WARNING: 0, INFO: 0 },
      confidenceDistribution: { HIGH: 0, MEDIUM: 0, LOW: 0 },
    };
    const endpointMap = new Map<string, EndpointReportItem>();
    const failures: FailureBreakdownItem[] = [];
    let totalExecutionDuration = 0;

    for (const item of diagnoses.values()) {
      diagnosis.confidenceDistribution[item.confidence]++;
      diagnosis.totalFindings += item.findings.length;
      for (const finding of item.findings) diagnosis.severityDistribution[finding.severity]++;
    }

    for (const test of input.tests) {
      const key = `${test.endpoint.method} ${test.endpoint.path}`;
      let endpoint = endpointMap.get(key);
      if (!endpoint) {
        endpoint = { method: test.endpoint.method, path: test.endpoint.path, operationId: test.endpoint.operationId,
          totalTests: 0, executionPassed: 0, executionFailed: 0, validationPassed: 0, validationFailed: 0,
          notValidatable: 0, unvalidated: 0, passPercentage: null, overallStatus: 'UNTESTED' };
        endpointMap.set(key, endpoint);
      }
      endpoint.totalTests++;
      const executionResult = executions.get(test.id);
      const validationResult = validations.get(test.id);
      const diagnosisResult = diagnoses.get(test.id);
      if (!executionResult) execution.unexecuted++;
      else {
        if (executionResult.status === 'PASSED_EXECUTION') { totalExecutionDuration += executionResult.durationMs; execution.executedTests++; execution.passedExecution++; endpoint.executionPassed++; }
        else if (executionResult.status === 'FAILED_EXECUTION') { totalExecutionDuration += executionResult.durationMs; execution.executedTests++; execution.failedExecution++; endpoint.executionFailed++; }
        else if (executionResult.status === 'ERROR') { totalExecutionDuration += executionResult.durationMs; execution.executedTests++; execution.errors++; endpoint.executionFailed++; }
        else if (executionResult.status === 'SKIPPED') execution.skipped++;
        else execution.unexecuted++;
      }

      if (!validationResult) { validation.unvalidated++; endpoint.unvalidated++; }
      else {
        const summary = validationResult.assertions.reduce((totals, assertion) => {
          totals.total++;
          if (assertion.passed) totals.passed++;
          else { totals.failed++; failureByCategory[assertion.category]++; }
          return totals;
        }, { total: 0, passed: 0, failed: 0 });
        validation.totalAssertions += summary.total; validation.passedAssertions += summary.passed; validation.failedAssertions += summary.failed;
        if (validationResult.status === 'VALIDATION_PASSED') { validation.totalValidated++; validation.validationPassed++; endpoint.validationPassed++; }
        if (validationResult.status === 'VALIDATION_FAILED') { validation.totalValidated++; validation.validationFailed++; endpoint.validationFailed++; }
        if (validationResult.status === 'NOT_VALIDATABLE') { validation.notValidatable++; endpoint.notValidatable++; }
        if (validationResult.status === 'SKIPPED') validation.skipped++;
      }

      const failedAssertions = validationResult?.assertions.filter((assertion) => !assertion.passed) ?? [];
      const isExecutionIssue = executionResult?.status === 'FAILED_EXECUTION' || executionResult?.status === 'ERROR';
      const isValidationIssue = validationResult?.status === 'VALIDATION_FAILED' || validationResult?.status === 'NOT_VALIDATABLE';
      if (isExecutionIssue || isValidationIssue) {
        const first = failedAssertions[0];
        const highestSeverity = diagnosisResult?.findings.map((finding) => finding.severity)
          .sort((a, b) => severities.indexOf(a) - severities.indexOf(b))[0];
        failures.push({ testCaseId: test.id, testName: test.name, method: test.endpoint.method, path: test.endpoint.path,
          testType: test.type, priority: test.priority, executionStatus: executionResult?.status,
          validationStatus: validationResult?.status ?? 'UNVALIDATED', httpStatus: executionResult?.httpStatus,
          failedAssertionCount: failedAssertions.length, failedAssertionCategories: [...new Set(failedAssertions.map((a) => a.category))],
          failedAssertionPaths: failedAssertions.map((a) => a.path),
          message: sanitizeText(first?.message ?? executionResult?.errorMessage), expected: sanitizeText(first?.expected), actual: sanitizeText(first?.actual), aiDiagnosisSummary: sanitizeText(diagnosisResult?.summary),
          aiSeverity: highestSeverity, aiConfidence: diagnosisResult?.confidence,
          aiProvider: diagnosisResult?.provider, aiProviderStatus: diagnosisResult?.providerStatus, diagnosisId: diagnosisResult?.diagnosisId });
      }
    }
    execution.averageDurationMs = execution.executedTests ? Number((totalExecutionDuration / execution.executedTests).toFixed(2)) : 0;
    execution.passRate = rate(execution.passedExecution, execution.executedTests);
    validation.assertionFailureRate = rate(validation.failedAssertions, validation.totalAssertions);
    const endpoints = [...endpointMap.values()].map((endpoint) => {
      endpoint.passPercentage = rate(endpoint.validationPassed, endpoint.totalTests);
      endpoint.overallStatus = endpoint.executionPassed + endpoint.executionFailed === 0 ? 'UNTESTED'
        : endpoint.executionFailed > 0 || endpoint.validationFailed > 0 ? 'FAILED'
        : endpoint.unvalidated > 0 || endpoint.notValidatable > 0 || endpoint.validationPassed < endpoint.totalTests ? 'PARTIAL' : 'PASSED';
      return endpoint;
    }).sort((a, b) => a.method.localeCompare(b.method) || a.path.localeCompare(b.path));
    failures.sort((a, b) => a.method.localeCompare(b.method) || a.path.localeCompare(b.path) || a.testCaseId.localeCompare(b.testCaseId));
    return {
      metadata: { reportId: crypto.randomUUID(), generatedAt: new Date().toISOString(), specificationTitle: input.specification.metadata.title,
        specificationVersion: input.specification.metadata.version, targetEnvironment: safeTarget(input.specification.servers?.[0]?.url),
        executionDurationMs: totalExecutionDuration, validationDurationMs: input.validationResults.reduce((sum, item) => sum + item.durationMs, 0),
        diagnosisDurationMs: (input.diagnosisResults ?? []).reduce((sum, item) => sum + item.durationMs, 0) },
      execution, validation, diagnosis, endpoints, failures,
    };
  }

  private validate(input: GenerateReportRequest): void {
    if (!input || !input.specification?.metadata?.title || !input.specification.metadata.version || !Array.isArray(input.tests) || !Array.isArray(input.executionResults) || !Array.isArray(input.validationResults)) throw new ReportValidationError('A specification, tests, executionResults, and validationResults are required.');
    const ids = new Set<string>();
    for (const test of input.tests) { if (!test?.id || !test.name || !test.endpoint?.method || !test.endpoint.path) throw new ReportValidationError('Every test must include an id, name, and endpoint.'); if (ids.has(test.id)) throw new ReportValidationError(`Duplicate test ID detected: '${test.id}'.`); ids.add(test.id); }
    const verifyReferences = (items: Array<{ testCaseId?: string }>, label: string) => {
      const seen = new Set<string>();
      for (const item of items) { if (!item?.testCaseId || !ids.has(item.testCaseId)) throw new ReportValidationError(`${label} references an unknown testCaseId.`); if (seen.has(item.testCaseId)) throw new ReportValidationError(`Duplicate ${label} for testCaseId '${item.testCaseId}'.`); seen.add(item.testCaseId); }
    };
    verifyReferences(input.executionResults, 'execution result'); verifyReferences(input.validationResults, 'validation result'); verifyReferences(input.diagnosisResults ?? [], 'diagnosis result');
    const executions = new Map(input.executionResults.map((item) => [item.testCaseId, item]));
    for (const item of input.executionResults) {
      if (!executionStatuses.includes(item.status) || !Number.isFinite(item.durationMs) || !item.executionId) throw new ReportValidationError('Every execution result must include a valid status, executionId, and duration.');
    }
    for (const item of input.validationResults) {
      const execution = executions.get(item.testCaseId);
      if (!execution || execution.executionId !== item.executionId || !validationStatuses.includes(item.status) || !Number.isFinite(item.durationMs) || !Array.isArray(item.assertions)) throw new ReportValidationError('Every validation result must reference its matching execution result and include a valid status.');
    }
    for (const item of input.diagnosisResults ?? []) {
      const execution = executions.get(item.testCaseId);
      if (!execution || execution.executionId !== item.executionId || !item.diagnosisId || !confidences.includes(item.confidence) || !Array.isArray(item.findings) || item.findings.some((finding) => !severities.includes(finding.severity))
      || (item.provider !== undefined && !providerNames.includes(item.provider))
      || (item.providerStatus !== undefined && !providerStatuses.includes(item.providerStatus))) throw new ReportValidationError('Every diagnosis result must reference its matching execution result and contain valid AI metrics.');
    }
  }
}
