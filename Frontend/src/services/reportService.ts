import axios from 'axios';
import type { ApiSpecification } from '@/types/openapi.types';
import type { TestCase } from '@/types/testCase.types';
import type { TestCaseExecutionResult } from '@/types/testExecution.types';
import type { TestCaseValidationResult } from '@/types/validation.types';
import type { DiagnosisResult } from '@/types/diagnosis.types';
import type { EndpointReportItem, FailureBreakdownItem, GenerateReportRequest, ReportSummary } from '@/types/report.types';
import { formatApiErrorMessage } from './apiError';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
  (typeof process !== 'undefined' && process.env?.VITE_API_BASE_URL) ||
  'http://localhost:3001';
export class ReportApiError extends Error { constructor(message: string) { super(message); this.name = 'ReportApiError'; } }

const csv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const download = (filename: string, type: string, content: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
};

export const reportService = {
  createPayload(specification: ApiSpecification, tests: TestCase[], executionResults: TestCaseExecutionResult[], validationResults: TestCaseValidationResult[], diagnosisResults: DiagnosisResult[]): GenerateReportRequest {
    return {
      specification: { metadata: specification.metadata, servers: specification.servers.map(({ url, description }) => {
        try { const parsed = new URL(url); return { url: `${parsed.protocol}//${parsed.host}${parsed.pathname}`, description }; }
        catch { return { url: '', description }; }
      }).filter((server) => server.url) },
      tests: tests.map(({ id, name, type, priority, enabled, endpoint }) => ({ id, name, type, priority, enabled, endpoint })),
      executionResults: executionResults.map((item) => ({ testCaseId: item.testCaseId, executionId: item.executionId, status: item.status, durationMs: item.durationMs, httpStatus: item.response?.status, errorMessage: item.error?.message })),
      validationResults: validationResults.map((item) => ({ testCaseId: item.testCaseId, executionId: item.executionId, status: item.status, durationMs: item.durationMs, assertions: item.assertions.map(({ category, path, expected, actual, passed, message }) => ({ category, path, expected, actual, passed, message })) })),
      diagnosisResults: diagnosisResults.map((item) => ({ diagnosisId: item.diagnosisId, testCaseId: item.testCaseId, executionId: item.executionId, durationMs: item.durationMs, confidence: item.confidence, summary: item.summary, findings: item.findings.map(({ severity }) => ({ severity })), provider: item.provider, providerStatus: item.providerStatus })),
    };
  },
  async generateReport(payload: GenerateReportRequest): Promise<ReportSummary> {
    try { return (await axios.post<ReportSummary>(`${API_BASE_URL}/api/reports/generate`, payload, { timeout: 30000 })).data; }
    catch (error: unknown) { const message = formatApiErrorMessage(error, 'Unable to generate report.'); throw new ReportApiError(message); }
  },
  downloadReportJson(report: ReportSummary) { download(`apiforge-report-${report.metadata.reportId}.json`, 'application/json', JSON.stringify(report, null, 2)); },
  downloadEndpointCsv(endpoints: EndpointReportItem[]) {
    const rows = [['Method', 'Endpoint', 'Tests', 'Execution Passed', 'Execution Failed', 'Validation Passed', 'Validation Failed', 'Pass Rate', 'Status'], ...endpoints.map((item) => [item.method, item.path, item.totalTests, item.executionPassed, item.executionFailed, item.validationPassed, item.validationFailed, item.passPercentage === null ? '' : `${item.passPercentage}%`, item.overallStatus])];
    download('apiforge-endpoints.csv', 'text/csv;charset=utf-8', rows.map((row) => row.map(csv).join(',')).join('\n'));
  },
  downloadFailureCsv(failures: FailureBreakdownItem[]) {
    const rows = [['Test', 'Method', 'Endpoint', 'Execution Status', 'Validation Status', 'Failed Assertions', 'Categories', 'Paths', 'AI Severity', 'AI Confidence', 'AI Source', 'AI Summary', 'Message'], ...failures.map((item) => [item.testName, item.method, item.path, item.executionStatus, item.validationStatus, item.failedAssertionCount, item.failedAssertionCategories.join('; '), item.failedAssertionPaths.join('; '), item.aiSeverity, item.aiConfidence, item.aiProviderStatus ?? (item.diagnosisId ? item.aiProvider : 'Not diagnosed'), item.aiDiagnosisSummary, item.message])];
    download('apiforge-failures.csv', 'text/csv;charset=utf-8', rows.map((row) => row.map(csv).join(',')).join('\n'));
  },
};
