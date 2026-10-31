import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkflowsPage } from '../WorkflowsPage';
import { workflowService, WorkflowApiError } from '@/services/workflowService';
import { renderWithRouter, resetStore } from '@/test/test-utils';
import { mockWorkflow } from '@/test/fixtures';
import { useAppStore } from '@/store/useAppStore';
import type { SanitizedWorkflowExecutionResult } from '@/types/workflow.types';

describe('WorkflowsPage Component Tests', () => {
  beforeEach(() => {
    resetStore();
    vi.restoreAllMocks();
  });

  it('renders workflow steps and configuration editor', () => {
    useAppStore.getState().setWorkflows([mockWorkflow]);
    useAppStore.getState().setActiveWorkflowId(mockWorkflow.id);

    renderWithRouter(<WorkflowsPage />);

    expect(screen.getByRole('heading', { name: /workflows/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Register User')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Verify User')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /run workflow/i })).toBeInTheDocument();
  });

  it('allows users to add a new step to the workflow', async () => {
    const user = userEvent.setup();
    useAppStore.getState().setWorkflows([mockWorkflow]);
    useAppStore.getState().setActiveWorkflowId(mockWorkflow.id);

    renderWithRouter(<WorkflowsPage />);

    const addStepBtn = screen.getByRole('button', { name: /add step/i });
    await user.click(addStepBtn);

    await waitFor(() => {
      expect(useAppStore.getState().workflows[0].steps).toHaveLength(3);
    });

    expect(screen.getByText(/3 \/ 50 steps/i)).toBeInTheDocument();
  });

  it('validates a workflow scenario structure via Validate button', async () => {
    const user = userEvent.setup();
    useAppStore.getState().setWorkflows([mockWorkflow]);
    useAppStore.getState().setActiveWorkflowId(mockWorkflow.id);

    const valSpy = vi.spyOn(workflowService, 'validateWorkflow').mockResolvedValue({
      valid: true,
      errors: [],
    });

    renderWithRouter(<WorkflowsPage />);

    const validateBtn = screen.getByRole('button', { name: /validate/i });
    await user.click(validateBtn);

    await waitFor(() => {
      expect(valSpy).toHaveBeenCalledWith(mockWorkflow);
      expect(
        screen.getByText(/workflow scenario definition is structurally valid/i)
      ).toBeInTheDocument();
    });
  });

  it('triggers workflow execution and displays successful results in execution view', async () => {
    const user = userEvent.setup();
    useAppStore.getState().setWorkflows([mockWorkflow]);
    useAppStore.getState().setActiveWorkflowId(mockWorkflow.id);

    const mockExecutionSuccess: SanitizedWorkflowExecutionResult = {
      scenarioId: mockWorkflow.id,
      scenarioName: mockWorkflow.name,
      status: 'COMPLETED',
      startedAt: '2026-10-12T10:00:00.000Z',
      completedAt: '2026-10-12T10:00:01.200Z',
      durationMs: 1200,
      stepResults: [
        {
          stepId: 'step-create',
          stepName: 'Register User',
          status: 'PASSED_EXECUTION',
          startedAt: '2026-10-12T10:00:00.000Z',
          completedAt: '2026-10-12T10:00:00.600Z',
          durationMs: 600,
          request: {
            method: 'POST',
            url: 'https://api.example.com/users',
            auth: { type: 'none', redacted: false, description: 'No Auth' },
          },
          response: {
            success: true,
            status: 201,
            statusText: 'Created',
            responseTime: 600,
            headers: {},
            body: { id: 'usr_abc' },
          },
          extractedVariables: {
            createdUserId: { value: 'usr_abc', isSecret: false },
          },
        },
      ],
      finalContext: {
        createdUserId: { value: 'usr_abc', isSecret: false },
      },
      summary: {
        totalSteps: 1,
        executed: 1,
        passed: 1,
        failed: 0,
        skipped: 0,
        blocked: 0,
        totalDurationMs: 600,
      },
    };

    const execSpy = vi.spyOn(workflowService, 'executeWorkflow').mockResolvedValue(mockExecutionSuccess);

    renderWithRouter(<WorkflowsPage />);

    const runBtn = screen.getByRole('button', { name: /run workflow/i });
    await user.click(runBtn);

    await waitFor(() => {
      expect(execSpy).toHaveBeenCalled();
      expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Passed').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Register User')).toBeInTheDocument();
  });

  it('displays failed step details when scenario execution has step failures', async () => {
    const user = userEvent.setup();
    useAppStore.getState().setWorkflows([mockWorkflow]);
    useAppStore.getState().setActiveWorkflowId(mockWorkflow.id);

    const mockExecutionFailed: SanitizedWorkflowExecutionResult = {
      scenarioId: mockWorkflow.id,
      scenarioName: mockWorkflow.name,
      status: 'FAILED',
      startedAt: '2026-10-12T10:00:00.000Z',
      completedAt: '2026-10-12T10:00:00.800Z',
      durationMs: 800,
      stepResults: [
        {
          stepId: 'step-create',
          stepName: 'Register User',
          status: 'FAILED_EXECUTION',
          startedAt: '2026-10-12T10:00:00.000Z',
          completedAt: '2026-10-12T10:00:00.800Z',
          durationMs: 800,
          request: {
            method: 'POST',
            url: 'https://api.example.com/users',
            auth: { type: 'none', redacted: false, description: 'No Auth' },
          },
          error: {
            type: 'HTTP_500',
            message: 'Internal server error processing registration payload',
          },
        },
      ],
      finalContext: {},
      summary: {
        totalSteps: 1,
        executed: 1,
        passed: 0,
        failed: 1,
        skipped: 0,
        blocked: 0,
        totalDurationMs: 800,
      },
    };

    vi.spyOn(workflowService, 'executeWorkflow').mockResolvedValue(mockExecutionFailed);

    renderWithRouter(<WorkflowsPage />);

    const runBtn = screen.getByRole('button', { name: /run workflow/i });
    await user.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText('FAILED')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Failed').length).toBeGreaterThanOrEqual(1);
  });

  it('handles network dispatch failures gracefully, shows error banner and does not claim success', async () => {
    const user = userEvent.setup();
    useAppStore.getState().setWorkflows([mockWorkflow]);
    useAppStore.getState().setActiveWorkflowId(mockWorkflow.id);

    vi.spyOn(workflowService, 'executeWorkflow').mockRejectedValue(
      new WorkflowApiError('Unable to reach backend service at http://localhost:3001')
    );

    renderWithRouter(<WorkflowsPage />);

    const runBtn = screen.getByRole('button', { name: /run workflow/i });
    await user.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText(/Execution Dispatch Failed:/i)).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Unable to reach backend service at http:\/\/localhost:3001/i)
    ).toBeInTheDocument();

    // Verify running indicator reset, Run Workflow button restored to idle
    expect(screen.getByRole('button', { name: /run workflow/i })).not.toBeDisabled();
    expect(useAppStore.getState().workflowExecutionRunning).toBe(false);
  });
});
