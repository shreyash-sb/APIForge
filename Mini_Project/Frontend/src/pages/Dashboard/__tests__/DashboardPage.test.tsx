import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { DashboardPage } from '@/pages/Dashboard/DashboardPage';
import { renderWithRouter, resetStore } from '@/test/test-utils';
import { useAppStore } from '@/store/useAppStore';
import { mockExecutionResult, mockTestCase } from '@/test/fixtures';

describe('DashboardPage', () => {
  beforeEach(() => resetStore());

  it('shows truthful empty states when no executions or collections exist', () => {
    renderWithRouter(<DashboardPage />, { route: '/dashboard' });
    expect(screen.getByText(/No recorded execution events in the last seven days/i)).toBeInTheDocument();
    expect(screen.getByText(/No recorded executions yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No saved collections yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Checking APIForge backend…/i)).toBeInTheDocument();
  });

  it('refreshes derived metrics after workspace reset', () => {
    useAppStore.getState().setExecutionResults({ [mockTestCase.id]: mockExecutionResult });
    const { rerender } = renderWithRouter(<DashboardPage />, { route: '/dashboard' });
    expect(screen.getByText('1')).toBeInTheDocument();
    useAppStore.getState().resetWorkspace();
    rerender(<DashboardPage />);
    expect(screen.getByText(/No recorded executions yet/i)).toBeInTheDocument();
  });

  it('refreshes recent requests when a Request Builder execution is recorded', async () => {
    renderWithRouter(<DashboardPage />, { route: '/dashboard' });
    useAppStore.getState().recordManualRequestExecution({ id: 'manual-1', method: 'GET', endpoint: '/api/mock/serve/demo-health', completedAt: new Date().toISOString(), durationMs: 10, status: 'HTTP_RESPONSE', httpStatus: 200 });
    await waitFor(() => expect(screen.getByText('/api/mock/serve/demo-health')).toBeInTheDocument());
    expect(screen.getByText('Manual request')).toBeInTheDocument();
    expect(screen.getByText('Executed Tests').parentElement).toHaveTextContent('0');
  });
});
