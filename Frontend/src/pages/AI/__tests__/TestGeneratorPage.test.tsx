import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestGeneratorPage } from '../TestGeneratorPage';
import { testGeneratorService } from '@/services/testGeneratorService';
import { testExecutionService } from '@/services/testExecutionService';
import { renderWithRouter, resetStore } from '@/test/test-utils';
import { mockSpecification, mockTestCase, mockExecutionResult } from '@/test/fixtures';
import { useAppStore } from '@/store/useAppStore';
import type { TestSuite } from '@/types/testCase.types';
import type { TestSuiteExecutionResult } from '@/types/testExecution.types';

describe('TestGeneratorPage Component Tests', () => {
  beforeEach(() => {
    resetStore();
    vi.restoreAllMocks();
  });

  it('renders explanation and import link when no specification is loaded', () => {
    renderWithRouter(<TestGeneratorPage />);

    expect(
      screen.getByRole('heading', { name: /import an api before generating tests/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /import openapi/i })).toBeInTheDocument();
  });

  it('renders generation controls when an active specification is loaded', () => {
    useAppStore.getState().setActiveSpecification(mockSpecification);

    renderWithRouter(<TestGeneratorPage />);

    expect(screen.getByRole('heading', { name: 'User Management API' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate tests/i })).toBeInTheDocument();
    expect(screen.getByText(/choose categories and generate a test suite/i)).toBeInTheDocument();
  });

  it('generates tests from specification and displays them in the tests table', async () => {
    const user = userEvent.setup();
    useAppStore.getState().setActiveSpecification(mockSpecification);

    const mockSuite: TestSuite = {
      specificationTitle: 'User Management API',
      generatedAt: 'deterministic',
      tests: [mockTestCase],
      groups: [{ endpoint: mockTestCase.endpoint, tests: [mockTestCase] }],
    };

    const genSpy = vi.spyOn(testGeneratorService, 'generate').mockResolvedValue(mockSuite);

    renderWithRouter(<TestGeneratorPage />);

    const generateBtn = screen.getByRole('button', { name: /generate tests/i });
    await user.click(generateBtn);

    await waitFor(() => {
      expect(genSpy).toHaveBeenCalled();
      expect(screen.getByText('GET /users/{id} - Valid Request')).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: /generated tests/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /run all tests/i })).toBeInTheDocument();
    expect(useAppStore.getState().generatedTests).toHaveLength(1);
  });

  it('executes a batch test suite and displays execution status and results', async () => {
    const user = userEvent.setup();
    useAppStore.getState().setActiveSpecification(mockSpecification);
    useAppStore.getState().setGeneratedTests([mockTestCase]);

    const mockBatchResult: TestSuiteExecutionResult = {
      suiteExecutionId: 'batch-exec-1',
      startedAt: '2026-10-12T10:00:00.000Z',
      completedAt: '2026-10-12T10:00:00.050Z',
      summary: {
        total: 1,
        executed: 1,
        passedExecution: 1,
        failedExecution: 0,
        errors: 0,
        skipped: 0,
        totalDurationMs: 50,
      },
      results: [mockExecutionResult],
    };

    const batchSpy = vi.spyOn(testExecutionService, 'executeBatch').mockResolvedValue(mockBatchResult);

    renderWithRouter(<TestGeneratorPage />);

    const runAllBtn = screen.getByRole('button', { name: /run all tests/i });
    await user.click(runAllBtn);

    await waitFor(() => {
      expect(batchSpy).toHaveBeenCalledWith([mockTestCase]);
      expect(screen.getByText(/HTTP 200/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/1 \/ 1 executed/i)).toBeInTheDocument();
    expect(useAppStore.getState().executionResults[mockTestCase.id]).toBeDefined();
  });

  it('executes a single test case using Run Test in detail view', async () => {
    const user = userEvent.setup();
    useAppStore.getState().setActiveSpecification(mockSpecification);
    useAppStore.getState().setGeneratedTests([mockTestCase]);

    const singleSpy = vi.spyOn(testExecutionService, 'executeSingle').mockResolvedValue(mockExecutionResult);

    renderWithRouter(<TestGeneratorPage />);

    const runSingleBtn = screen.getByRole('button', { name: /run test/i });
    await user.click(runSingleBtn);

    await waitFor(() => {
      expect(singleSpy).toHaveBeenCalledWith(mockTestCase);
      expect(screen.getByText(/HTTP 200/i)).toBeInTheDocument();
    });
  });

  it('displays useful error when test generation fails and resets loading state', async () => {
    const user = userEvent.setup();
    useAppStore.getState().setActiveSpecification(mockSpecification);

    vi.spyOn(testGeneratorService, 'generate').mockRejectedValue(
      new Error('Test generation engine unavailable. Backend error.')
    );

    renderWithRouter(<TestGeneratorPage />);

    const generateBtn = screen.getByRole('button', { name: /generate tests/i });
    await user.click(generateBtn);

    await waitFor(() => {
      expect(screen.getByText(/Test generation engine unavailable/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /generate tests/i })).not.toBeDisabled();
  });

  it('displays useful error when batch execution fails and allows retry', async () => {
    const user = userEvent.setup();
    useAppStore.getState().setActiveSpecification(mockSpecification);
    useAppStore.getState().setGeneratedTests([mockTestCase]);

    vi.spyOn(testExecutionService, 'executeBatch').mockRejectedValue(
      new Error('Cannot reach HTTP executor at localhost:3001')
    );

    renderWithRouter(<TestGeneratorPage />);

    const runAllBtn = screen.getByRole('button', { name: /run all tests/i });
    await user.click(runAllBtn);

    await waitFor(() => {
      expect(screen.getByText(/Cannot reach HTTP executor/i)).toBeInTheDocument();
    });

    // Button restored to idle for retry
    expect(screen.getByRole('button', { name: /run all tests/i })).not.toBeDisabled();
  });
});
