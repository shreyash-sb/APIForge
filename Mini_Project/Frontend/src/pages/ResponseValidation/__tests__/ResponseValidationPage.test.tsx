import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResponseValidationPage } from '../ResponseValidationPage';
import { validationService } from '@/services/validationService';
import { renderWithRouter, resetStore } from '@/test/test-utils';
import {
  mockSpecification,
  mockTestCase,
  mockExecutionResult,
  mockValidationResult,
} from '@/test/fixtures';
import { useAppStore } from '@/store/useAppStore';
import type { TestCaseExecutionResult } from '@/types/testExecution.types';

describe('ResponseValidationPage Component Tests', () => {
  beforeEach(() => {
    resetStore();
    vi.restoreAllMocks();
  });

  it('renders notice when no OpenAPI specification is loaded', () => {
    renderWithRouter(<ResponseValidationPage />);

    expect(
      screen.getByRole('heading', { name: /import an openapi specification/i })
    ).toBeInTheDocument();
  });

  it('renders notice when specification exists but no tests are generated', () => {
    useAppStore.getState().setActiveSpecification(mockSpecification);

    renderWithRouter(<ResponseValidationPage />);

    expect(
      screen.getByRole('heading', { name: /no generated tests available/i })
    ).toBeInTheDocument();
  });

  it('displays executed test cases ready for contract validation', () => {
    useAppStore.getState().setActiveSpecification(mockSpecification);
    useAppStore.getState().setGeneratedTests([mockTestCase]);
    useAppStore.getState().setExecutionResults({
      [mockTestCase.id]: mockExecutionResult,
    });

    renderWithRouter(<ResponseValidationPage />);

    expect(screen.getAllByText('GET /users/{id} - Valid Request').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /validate all executed/i })).toBeInTheDocument();
    expect(screen.getByText('Not Validated')).toBeInTheDocument();
  });

  it('validates executed suite and displays validation results and assertion categories', async () => {
    const user = userEvent.setup();
    useAppStore.getState().setActiveSpecification(mockSpecification);
    useAppStore.getState().setGeneratedTests([mockTestCase]);
    useAppStore.getState().setExecutionResults({
      [mockTestCase.id]: mockExecutionResult,
    });

    const mockBatchValResult = {
      validationSuiteId: 'val-suite-1',
      validatedAt: '2026-10-12T10:00:01.000Z',
      summary: {
        totalTests: 1,
        validatedTests: 1,
        passedValidation: 1,
        failedValidation: 0,
        notValidatable: 0,
        skipped: 0,
        totalAssertions: 2,
        passedAssertions: 2,
        failedAssertions: 0,
        totalDurationMs: 12,
      },
      results: [mockValidationResult],
    };

    const valSpy = vi.spyOn(validationService, 'validateBatch').mockResolvedValue(mockBatchValResult);

    renderWithRouter(<ResponseValidationPage />);

    const validateBtn = screen.getByRole('button', { name: /validate all executed/i });
    await user.click(validateBtn);

    await waitFor(() => {
      expect(valSpy).toHaveBeenCalled();
      expect(screen.getAllByText('Contract Valid').length).toBeGreaterThanOrEqual(1);
    });

    // Check assertion categories rendered
    expect(screen.getByText('Status Code')).toBeInTheDocument();
    expect(screen.getByText('Content-Type')).toBeInTheDocument();
  });

  it('distinguishes execution failures from contract assertion failures', () => {
    const failedExecResult: TestCaseExecutionResult = {
      ...mockExecutionResult,
      status: 'FAILED_EXECUTION',
      error: {
        type: 'NETWORK_ERROR',
        message: 'Backend server connection failed at socket layer',
      },
      response: undefined,
    };

    useAppStore.getState().setActiveSpecification(mockSpecification);
    useAppStore.getState().setGeneratedTests([mockTestCase]);
    useAppStore.getState().setExecutionResults({
      [mockTestCase.id]: failedExecResult,
    });

    renderWithRouter(<ResponseValidationPage />);

    // Test should be listed with execution failure indicated distinct from contract assertions
    expect(screen.getAllByText('GET /users/{id} - Valid Request').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/HTTP FAIL/i)).toBeInTheDocument();
  });

  it('handles validation API errors gracefully and resets loading state', async () => {
    const user = userEvent.setup();
    useAppStore.getState().setActiveSpecification(mockSpecification);
    useAppStore.getState().setGeneratedTests([mockTestCase]);
    useAppStore.getState().setExecutionResults({
      [mockTestCase.id]: mockExecutionResult,
    });

    vi.spyOn(validationService, 'validateBatch').mockRejectedValue(
      new Error('Validation service unreachable')
    );

    renderWithRouter(<ResponseValidationPage />);

    const validateBtn = screen.getByRole('button', { name: /validate all executed/i });
    await user.click(validateBtn);

    await waitFor(() => {
      expect(screen.getByText(/Validation service unreachable/i)).toBeInTheDocument();
    });

    // Button restored to idle
    expect(screen.getByRole('button', { name: /validate all executed/i })).not.toBeDisabled();
  });
});
