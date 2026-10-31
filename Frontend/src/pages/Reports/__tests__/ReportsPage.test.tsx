import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportsPage } from '../ReportsPage';
import { reportService, ReportApiError } from '@/services/reportService';
import { renderWithRouter, resetStore } from '@/test/test-utils';
import { mockSpecification, mockTestCase, mockReportSummary } from '@/test/fixtures';
import { useAppStore } from '@/store/useAppStore';

describe('ReportsPage Component Tests', () => {
  beforeEach(() => {
    resetStore();
    vi.restoreAllMocks();
  });

  it('renders empty state when no OpenAPI specification is imported', () => {
    renderWithRouter(<ReportsPage />);

    expect(
      screen.getByRole('heading', { name: /import an openapi specification/i })
    ).toBeInTheDocument();
  });

  it('renders empty state when specification exists but tests are not generated', () => {
    useAppStore.getState().setActiveSpecification(mockSpecification);

    renderWithRouter(<ReportsPage />);

    expect(
      screen.getByRole('heading', { name: /no generated tests available/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open test generator/i })).toBeInTheDocument();
  });

  it('generates a report from valid data and displays analytics cards and tables', async () => {
    const user = userEvent.setup();
    useAppStore.getState().setActiveSpecification(mockSpecification);
    useAppStore.getState().setGeneratedTests([mockTestCase]);

    const genReportSpy = vi.spyOn(reportService, 'generateReport').mockResolvedValue(mockReportSummary);

    renderWithRouter(<ReportsPage />);

    const generateBtn = screen.getByRole('button', { name: /generate current-run report/i });
    expect(generateBtn).toBeInTheDocument();

    await user.click(generateBtn);

    await waitFor(() => {
      expect(genReportSpy).toHaveBeenCalled();
      expect(screen.getByRole('heading', { name: /endpoint health/i })).toBeInTheDocument();
    });

    expect(screen.getByText(/User Management API/i)).toBeInTheDocument();
    expect(screen.getByText('/users/{id}')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /endpoints csv/i })).toBeInTheDocument();
  });

  it('renders pre-existing reportSummary from store directly', () => {
    useAppStore.getState().setActiveSpecification(mockSpecification);
    useAppStore.getState().setGeneratedTests([mockTestCase]);
    useAppStore.getState().setReportSummary(mockReportSummary);

    renderWithRouter(<ReportsPage />);

    expect(screen.getByRole('heading', { name: /endpoint health/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /failure & anomaly analysis/i })).toBeInTheDocument();
    expect(screen.getByText(/User Management API/i)).toBeInTheDocument();
  });

  it('handles report API errors gracefully and resets button state', async () => {
    const user = userEvent.setup();
    useAppStore.getState().setActiveSpecification(mockSpecification);
    useAppStore.getState().setGeneratedTests([mockTestCase]);

    vi.spyOn(reportService, 'generateReport').mockRejectedValue(
      new ReportApiError('Failed to generate analytics aggregation from backend.')
    );

    renderWithRouter(<ReportsPage />);

    const generateBtn = screen.getByRole('button', { name: /generate current-run report/i });
    await user.click(generateBtn);

    await waitFor(() => {
      expect(
        screen.getByText('Failed to generate analytics aggregation from backend.')
      ).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /generate current-run report/i })).not.toBeDisabled();
  });
});
