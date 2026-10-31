import type { DiagnosisResult } from '@/types/diagnosis.types';
import type { TestCaseExecutionResult } from '@/types/testExecution.types';
import type { TestCaseValidationResult } from '@/types/validation.types';
import type { SanitizedWorkflowExecutionResult } from '@/types/workflow.types';
import type { ManualRequestExecution } from '@/types/request.types';
import type { ApiHealthItem, ChartPoint, RecentRequest, StatsCardData } from '@/types/dashboard';
export { redactEndpoint } from '@/lib/requestRedaction';
import { redactEndpoint } from '@/lib/requestRedaction';

type ExecutionLike = {
  completedAt: string;
  durationMs: number;
  request: Pick<TestCaseExecutionResult['request'], 'method' | 'url'>;
  response?: Pick<NonNullable<TestCaseExecutionResult['response']>, 'status'>;
  status: string;
  source?: 'Test execution' | 'Workflow execution' | 'Manual request';
};

function isTransportFailure(result: ExecutionLike) {
  return result.status === 'FAILED_EXECUTION' || result.status === 'ERROR';
}

function toRecentRequest(result: ExecutionLike, collection = result.source ?? 'Test execution'): RecentRequest {
  return {
    method: result.request.method,
    endpoint: redactEndpoint(result.request.url),
    collection,
    status: result.response?.status,
    responseTime: `${result.durationMs} ms`,
    time: result.completedAt,
    outcome: isTransportFailure(result)
      ? 'Transport failure'
      : result.status === 'REQUEST_VALIDATION_FAILURE'
        ? 'Request validation failed'
        : undefined,
  };
}

export function getExecutionEvents(
  executions: Record<string, TestCaseExecutionResult>,
  workflow?: SanitizedWorkflowExecutionResult,
  manualRequests: ManualRequestExecution[] = [],
): ExecutionLike[] {
  const tests = Object.values(executions).map((event) => ({ ...event, source: 'Test execution' as const }));
  const workflowSteps = (workflow?.stepResults ?? []).map((event) => ({ ...event, source: 'Workflow execution' as const }));
  const manual = manualRequests.map((event) => ({
    status: event.status === 'TRANSPORT_FAILURE' ? 'FAILED_EXECUTION' : event.status,
    completedAt: event.completedAt,
    durationMs: event.durationMs,
    request: { method: event.method, url: event.endpoint },
    response: event.httpStatus === undefined ? undefined : { success: true as const, status: event.httpStatus, statusText: '', responseTime: event.durationMs, headers: {}, body: undefined },
    source: 'Manual request' as const,
  }));
  return [...tests, ...workflowSteps, ...manual].filter((event) => event.status !== 'SKIPPED' && event.status !== 'BLOCKED_BY_DEPENDENCY');
}

export function getDashboardStats(
  executions: Record<string, TestCaseExecutionResult>,
  validations: Record<string, TestCaseValidationResult>,
  diagnoses: Record<string, DiagnosisResult>,
): StatsCardData[] {
  const executed = Object.values(executions).filter((result) => result.status !== 'SKIPPED');
  const receivedHttpResponse = executed.filter((result) => result.status === 'PASSED_EXECUTION').length;
  const executionRate = executed.length ? Math.round((receivedHttpResponse / executed.length) * 100) : null;
  const validationFailures = Object.values(validations).filter((result) => result.status === 'VALIDATION_FAILED').length;

  return [
    { title: 'Executed Tests', value: String(executed.length), change: `${receivedHttpResponse} received an HTTP response`, trend: 'up', tone: 'primary' },
    { title: 'HTTP Execution Success', value: executionRate === null ? '—' : `${executionRate}%`, change: executed.length ? `${executed.length} attempted; HTTP 4xx/5xx are responses` : 'No executions yet', trend: 'up', tone: 'success' },
    { title: 'Validation Failures', value: String(validationFailures), change: `${Object.keys(validations).length} validation result${Object.keys(validations).length === 1 ? '' : 's'}`, trend: 'down', tone: 'warning' },
    { title: 'AI Diagnoses', value: String(Object.keys(diagnoses).length), change: 'Recorded diagnosis results', trend: 'up', tone: 'ai' },
  ];
}

export function getActivity(events: ExecutionLike[], now = new Date()): ChartPoint[] {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 6);
  cutoff.setHours(0, 0, 0, 0);
  const points = new Map<string, ChartPoint>();
  for (const event of events) {
    const completed = new Date(event.completedAt);
    if (Number.isNaN(completed.valueOf()) || completed < cutoff || completed > now) continue;
    const key = completed.toISOString().slice(0, 10);
    const point = points.get(key) ?? { day: completed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), requests: 0, httpErrors: 0, transportFailures: 0 };
    point.requests += 1;
    if (event.response && event.response.status >= 400) point.httpErrors += 1;
    if (isTransportFailure(event)) point.transportFailures += 1;
    points.set(key, point);
  }
  return [...points.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, point]) => point);
}

export function getRecentRequests(events: ExecutionLike[]): RecentRequest[] {
  return events
    .slice()
    .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))
    .slice(0, 5)
    .map((event) => toRecentRequest(event));
}

// APIForge has no health-check endpoint or persisted probe results. Do not infer health from ordinary requests.
export const unmonitoredHealth: ApiHealthItem[] = [{ service: 'Configured services', status: 'Not monitored', responseTime: '—' }];
