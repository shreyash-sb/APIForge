import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OpenAPIPage } from '../OpenAPIPage';
import { openApiService } from '@/services/openapiService';
import { renderWithRouter, resetStore } from '@/test/test-utils';
import { mockSpecification } from '@/test/fixtures';
import { useAppStore } from '@/store/useAppStore';

describe('OpenAPIPage Component Tests', () => {
  beforeEach(() => {
    resetStore();
    vi.restoreAllMocks();
  });

  it('renders the initial dropzone and file upload interface', () => {
    renderWithRouter(<OpenAPIPage />);

    expect(screen.getByRole('heading', { name: /import an api specification/i })).toBeInTheDocument();
    expect(screen.getByText(/drop your specification here, or choose a file/i)).toBeInTheDocument();
  });

  it('shows an error when an unsupported file type is selected', () => {
    const { container } = renderWithRouter(<OpenAPIPage />);

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    const invalidFile = new File(['content'], 'spec.txt', { type: 'text/plain' });
    fireEvent.change(fileInput, { target: { files: [invalidFile] } });

    expect(screen.getByText(/unsupported file type/i)).toBeInTheDocument();
  });

  it('shows an error when an empty file is selected', () => {
    const { container } = renderWithRouter(<OpenAPIPage />);

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const emptyFile = new File([], 'spec.json', { type: 'application/json' });
    fireEvent.change(fileInput, { target: { files: [emptyFile] } });

    expect(screen.getByText(/the selected file is empty/i)).toBeInTheDocument();
  });

  it('imports a valid specification and displays the specification explorer and endpoints', async () => {
    const user = userEvent.setup();
    const importSpy = vi.spyOn(openApiService, 'importSpecification').mockResolvedValue({
      success: true,
      specification: mockSpecification,
    });

    const { container } = renderWithRouter(<OpenAPIPage />);

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const validFile = new File([JSON.stringify({ openapi: '3.0.0' })], 'openapi.json', {
      type: 'application/json',
    });
    fireEvent.change(fileInput, { target: { files: [validFile] } });

    // Verify file badge is shown with Import button
    expect(screen.getByText('openapi.json')).toBeInTheDocument();
    const importButton = screen.getByRole('button', { name: /import/i });
    expect(importButton).toBeInTheDocument();

    await user.click(importButton);

    await waitFor(() => {
      expect(importSpy).toHaveBeenCalledWith('openapi.json', expect.any(String));
      expect(screen.getByRole('heading', { name: 'User Management API' })).toBeInTheDocument();
    });

    // Verify endpoints list is rendered
    expect(screen.getAllByText('/users/{id}').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('/users')).toBeInTheDocument();
    expect(screen.getByText(/Version 1.0.0/i)).toBeInTheDocument();

    // Verify store has active specification set
    expect(useAppStore.getState().activeSpecification?.metadata.title).toBe('User Management API');
  });

  it('handles backend import failure, shows error details and resets loading state', async () => {
    const user = userEvent.setup();
    vi.spyOn(openApiService, 'importSpecification').mockResolvedValue({
      success: false,
      error: {
        message: 'Invalid OpenAPI schema structure',
        details: ['Missing required info.version field', 'Invalid path syntax at line 14'],
      },
    });

    const { container } = renderWithRouter(<OpenAPIPage />);

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const invalidFile = new File(['{"openapi": "3.0.0"}'], 'invalid.json', {
      type: 'application/json',
    });
    fireEvent.change(fileInput, { target: { files: [invalidFile] } });

    const importButton = screen.getByRole('button', { name: /import/i });
    await user.click(importButton);

    await waitFor(() => {
      expect(screen.getByText('Invalid OpenAPI schema structure')).toBeInTheDocument();
    });

    expect(screen.getByText('Missing required info.version field')).toBeInTheDocument();
    expect(screen.getByText('Invalid path syntax at line 14')).toBeInTheDocument();
    // Loading indicator reset, Import button re-enabled
    expect(screen.getByRole('button', { name: /import/i })).not.toBeDisabled();
  });

  it('handles unexpected network exceptions during import and resets loading state', async () => {
    const user = userEvent.setup();
    vi.spyOn(openApiService, 'importSpecification').mockRejectedValue(
      new Error('Connection refused by backend at http://localhost:3001')
    );

    const { container } = renderWithRouter(<OpenAPIPage />);

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['{"openapi": "3.0.0"}'], 'spec.json', {
      type: 'application/json',
    });
    fireEvent.change(fileInput, { target: { files: [file] } });

    const importButton = screen.getByRole('button', { name: /import/i });
    await user.click(importButton);

    await waitFor(() => {
      expect(screen.getByText(/Connection refused by backend/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /import/i })).not.toBeDisabled();
  });

  it('resets explorer back to dropzone when clicking "Import another file"', async () => {
    const user = userEvent.setup();
    // Pre-seed store with active specification
    useAppStore.getState().setActiveSpecification(mockSpecification);

    renderWithRouter(<OpenAPIPage />);

    expect(screen.getByRole('heading', { name: 'User Management API' })).toBeInTheDocument();

    const resetBtn = screen.getByRole('button', { name: /import another file/i });
    await user.click(resetBtn);

    expect(screen.getByText(/drop your specification here, or choose a file/i)).toBeInTheDocument();
    expect(useAppStore.getState().activeSpecification).toBeUndefined();
  });
});
