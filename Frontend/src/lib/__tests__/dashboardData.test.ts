import { describe, expect, it } from 'vitest';
import { getActivity, getDashboardStats, getExecutionEvents, getRecentRequests, redactEndpoint, unmonitoredHealth } from '@/lib/dashboardData';
import type { TestCaseExecutionResult } from '@/types/testExecution.types';
import type { TestCaseValidationResult } from '@/types/validation.types';

const execution = (overrides: Partial<TestCaseExecutionResult> = {}): TestCaseExecutionResult => ({
  testCaseId: 'test-1', executionId: 'exec-1', status: 'PASSED_EXECUTION', startedAt: '2026-10-13T08:00:00.000Z', completedAt: '2026-10-13T08:00:01.000Z', durationMs: 1000,
  request: { method: 'GET', url: 'https://api.example.test/users?token=super-secret', auth: { type: 'bearer', redacted: true, description: 'BEARER [REDACTED]' } },
  response: { success: true, status: 200, statusText: 'OK', responseTime: 900, headers: {}, body: {} },
  ...overrides,
});

describe('dashboard data', () => {
  it('calculates execution success separately from validation failures and AI diagnoses', () => {
    const passed = execution();
    const transport = execution({ testCaseId: 'test-2', status: 'FAILED_EXECUTION', response: undefined });
    const validation = { testCaseId: 'test-1', executionId: 'exec-1', status: 'VALIDATION_FAILED', validatedAt: passed.completedAt, durationMs: 1, summary: { totalAssertions: 1, passedAssertions: 0, failedAssertions: 1 }, assertions: [] } satisfies TestCaseValidationResult;
    const stats = getDashboardStats({ one: passed, two: transport }, { one: validation }, { one: { diagnosisId: 'd', testCaseId: 'test-1', executionId: 'exec-1', diagnosedAt: passed.completedAt, durationMs: 1, provider: 'mock', validationStatus: 'VALIDATION_FAILED', confidence: 'HIGH', summary: '', findings: [] } });
    expect(stats.map((stat) => stat.value)).toEqual(['2', '50%', '1', '1']);
  });

  it('distinguishes HTTP errors from transport failures and never invents inactive days', () => {
    const httpError = execution({ response: { success: true, status: 500, statusText: 'Error', responseTime: 1, headers: {}, body: {} } });
    const transport = execution({ testCaseId: 'test-2', status: 'ERROR', response: undefined });
    const events = getExecutionEvents({ one: httpError, two: transport });
    const activity = getActivity(events, new Date('2026-10-13T12:00:00.000Z'));
    expect(activity).toEqual([{ day: 'Oct 13', requests: 2, httpErrors: 1, transportFailures: 1 }]);
  });

  it('redacts sensitive query values in recent requests', () => {
    const requests = getRecentRequests(getExecutionEvents({ one: execution() }));
    expect(requests[0]?.endpoint).toContain('[REDACTED]');
    expect(requests[0]?.endpoint).not.toContain('super-secret');
    expect(redactEndpoint('https://api.example.test/a?password=x')).toBe('/a?password=[REDACTED]');
  });

  it('reports unavailable health checks as not monitored', () => {
    expect(unmonitoredHealth).toEqual([{ service: 'Configured services', status: 'Not monitored', responseTime: '—' }]);
  });

  it('includes manual requests in activity and recent requests without changing test metrics', () => {
    const manual = [{ id: 'manual-1', method: 'GET' as const, endpoint: '/api/mock/serve/demo-health', completedAt: '2026-10-13T08:00:01.000Z', durationMs: 12, status: 'HTTP_RESPONSE' as const, httpStatus: 200 }];
    const events = getExecutionEvents({}, undefined, manual);
    expect(getRecentRequests(events)).toEqual([expect.objectContaining({ collection: 'Manual request', endpoint: '/api/mock/serve/demo-health', status: 200 })]);
    expect(getActivity(events, new Date('2026-10-13T12:00:00.000Z'))[0]).toMatchObject({ requests: 1, httpErrors: 0, transportFailures: 0 });
    expect(getDashboardStats({}, {}, {}).map((stat) => stat.value)).toEqual(['0', '—', '0', '0']);
  });
});
