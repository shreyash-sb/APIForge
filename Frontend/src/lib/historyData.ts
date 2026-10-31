import type { ManualRequestExecution } from '@/types/request.types';
import type { TestCaseExecutionResult } from '@/types/testExecution.types';
import type { SanitizedWorkflowExecutionResult } from '@/types/workflow.types';
import { redactEndpoint } from '@/lib/requestRedaction';

export type HistoryItem = { id: string; method: string; endpoint: string; type: 'Manual request' | 'Generated test' | 'Workflow step'; status: string; durationMs: number; timestamp: string; httpStatus?: number; error?: string; validationStatus?: string };
export function getHistoryItems(tests: Record<string, TestCaseExecutionResult>, workflow: SanitizedWorkflowExecutionResult | undefined, manual: ManualRequestExecution[]): HistoryItem[] {
  const testItems = Object.values(tests).map((x) => ({ id: x.executionId, method: x.request.method, endpoint: redactEndpoint(x.request.url), type: 'Generated test' as const, status: x.status, durationMs: x.durationMs, timestamp: x.completedAt, httpStatus: x.response?.status, error: x.error?.message }));
  const workflowItems = (workflow?.stepResults ?? []).map((x) => ({ id: `${workflow?.scenarioId}-${x.stepId}-${x.completedAt}`, method: x.request.method, endpoint: redactEndpoint(x.request.url), type: 'Workflow step' as const, status: x.status, durationMs: x.durationMs, timestamp: x.completedAt, httpStatus: x.response?.status, error: x.error?.message ?? x.skipReason, validationStatus: x.validationResult?.status }));
  const manualItems = manual.map((x) => ({ id: x.id, method: x.method, endpoint: x.endpoint, type: 'Manual request' as const, status: x.status, durationMs: x.durationMs, timestamp: x.completedAt, httpStatus: x.httpStatus, error: x.errorType }));
  return [...testItems, ...workflowItems, ...manualItems].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}
