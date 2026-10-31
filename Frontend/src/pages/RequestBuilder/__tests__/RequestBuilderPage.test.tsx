import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RequestBuilderPage } from '../RequestBuilderPage';
import { requestService } from '@/services/requestService';
import { renderWithRouter, resetStore } from '@/test/test-utils';
import { useAppStore } from '@/store/useAppStore';
import type { ApiExecutionResult } from '@/types/request.types';

describe('RequestBuilderPage Component Tests', () => {
  beforeEach(() => {
    resetStore();
    vi.restoreAllMocks();
  });

  it('renders the request builder page with initial GET method and Send button', () => {
    renderWithRouter(<RequestBuilderPage />);

    expect(screen.getByRole('heading', { name: /request builder/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /GET/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('https://api.example.com/users')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  it('allows changing the HTTP method and editing the URL', async () => {
    const user = userEvent.setup();
    renderWithRouter(<RequestBuilderPage />);

    // Open method dropdown and select POST
    const methodButton = screen.getByRole('button', { name: /GET/i });
    await user.click(methodButton);

    const postOption = screen.getByRole('button', { name: 'POST' });
    await user.click(postOption);

    expect(screen.getByRole('button', { name: /POST/i })).toBeInTheDocument();

    // Type in URL input
    const urlInput = screen.getByPlaceholderText('https://api.example.com/users');
    await user.clear(urlInput);
    await user.type(urlInput, 'https://api.example.com/v1/orders');

    expect(urlInput).toHaveValue('https://api.example.com/v1/orders');
  });

  it('allows adding and editing query parameters and headers', async () => {
    const user = userEvent.setup();
    renderWithRouter(<RequestBuilderPage />);

    // Add Query Parameter
    const addParamBtn = screen.getByRole('button', { name: /add parameter/i });
    await user.click(addParamBtn);

    const paramKeyInput = screen.getByPlaceholderText('Key');
    const paramValInput = screen.getByPlaceholderText('Value');
    await user.type(paramKeyInput, 'status');
    await user.type(paramValInput, 'active');

    expect(paramKeyInput).toHaveValue('status');
    expect(paramValInput).toHaveValue('active');

    // Switch to Headers tab
    const headersTab = screen.getByRole('button', { name: /headers/i });
    await user.click(headersTab);

    // Add Header
    const addHeaderBtn = screen.getByRole('button', { name: /add header/i });
    await user.click(addHeaderBtn);

    const headerKeyInputs = screen.getAllByPlaceholderText('Key');
    const headerValInputs = screen.getAllByPlaceholderText('Value');
    await user.type(headerKeyInputs[0], 'X-Client-Id');
    await user.type(headerValInputs[0], 'forge-client-99');

    expect(headerKeyInputs[0]).toHaveValue('X-Client-Id');
    expect(headerValInputs[0]).toHaveValue('forge-client-99');
  });

  it('validates empty URL on submit and displays validation error', async () => {
    const user = userEvent.setup();
    const executeSpy = vi.spyOn(requestService, 'executeRequest');

    renderWithRouter(<RequestBuilderPage />);

    // Click Send with empty URL
    const sendButton = screen.getByRole('button', { name: /send/i });
    await user.click(sendButton);

    expect(screen.getByText('VALIDATION_ERROR')).toBeInTheDocument();
    expect(screen.getByText('URL is required')).toBeInTheDocument();
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('submits a request using mocked backend response and displays status and body', async () => {
    const user = userEvent.setup();
    const mockSuccessResponse: ApiExecutionResult = {
      success: true,
      status: 200,
      statusText: 'OK',
      responseTime: 85,
      size: 120,
      headers: { 'content-type': 'application/json' },
      body: { message: 'Order created', id: 42 },
    };

    vi.spyOn(requestService, 'executeRequest').mockResolvedValue(mockSuccessResponse);

    renderWithRouter(<RequestBuilderPage />);

    const urlInput = screen.getByPlaceholderText('https://api.example.com/users');
    await user.type(urlInput, 'https://api.example.com/v1/orders');

    const sendButton = screen.getByRole('button', { name: /send/i });
    await user.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText('200 OK')).toBeInTheDocument();
    });

    expect(screen.getByText(/85 ms/i)).toBeInTheDocument();
    expect(screen.getByText(/"message": "Order created"/i)).toBeInTheDocument();
    expect(useAppStore.getState().manualRequestExecutions).toEqual([
      expect.objectContaining({ method: 'GET', endpoint: '/v1/orders', status: 'HTTP_RESPONSE', httpStatus: 200 }),
    ]);
  });

  it('displays useful error message when the backend request fails and resets loading state', async () => {
    const user = userEvent.setup();
    const mockErrorResponse: ApiExecutionResult = {
      success: false,
      error: {
        type: 'NETWORK_ERROR',
        message: 'Cannot connect to backend server at http://localhost:3001. Make sure it is running.',
      },
    };

    vi.spyOn(requestService, 'executeRequest').mockResolvedValue(mockErrorResponse);

    renderWithRouter(<RequestBuilderPage />);

    const urlInput = screen.getByPlaceholderText('https://api.example.com/users');
    await user.type(urlInput, 'https://api.example.com/v1/unreachable');

    const sendButton = screen.getByRole('button', { name: /send/i });
    await user.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText('NETWORK_ERROR')).toBeInTheDocument();
    });

    expect(screen.getByText(/Cannot connect to backend server/i)).toBeInTheDocument();
    // Loading indicator reset, Send button idle
    expect(screen.getByRole('button', { name: /send/i })).not.toBeDisabled();
    expect(useAppStore.getState().manualRequestExecutions).toEqual([
      expect.objectContaining({ endpoint: '/v1/unreachable', status: 'TRANSPORT_FAILURE', errorType: 'NETWORK_ERROR' }),
    ]);
  });

  it('handles unexpected exceptions and resets loading state gracefully', async () => {
    const user = userEvent.setup();
    vi.spyOn(requestService, 'executeRequest').mockRejectedValue(new Error('Fatal connection drop'));

    renderWithRouter(<RequestBuilderPage />);

    const urlInput = screen.getByPlaceholderText('https://api.example.com/users');
    await user.type(urlInput, 'https://api.example.com/v1/fail');

    const sendButton = screen.getByRole('button', { name: /send/i });
    await user.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText('UNKNOWN_ERROR')).toBeInTheDocument();
    });

    expect(screen.getByText(/Failed to execute request/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).not.toBeDisabled();
  });

  it('allows saving the active request into a collection', async () => {
    const user = userEvent.setup();
    useAppStore.getState().setCollections([]);
    renderWithRouter(<RequestBuilderPage />);

    const urlInput = screen.getByPlaceholderText('https://api.example.com/users');
    await user.type(urlInput, 'https://api.example.com/v1/users');

    // Click Save button
    const saveBtn = screen.getByRole('button', { name: /save/i });
    await user.click(saveBtn);

    expect(screen.getByText('Save Request to Collection')).toBeInTheDocument();

    // Type collection name if new
    const nameInput = screen.getByPlaceholderText('e.g. Authentication Suite');
    await user.type(nameInput, 'User API');

    // Click Save Request
    const confirmBtn = screen.getByRole('button', { name: /Save Request/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(useAppStore.getState().collections).toHaveLength(1);
      expect(useAppStore.getState().collections[0].name).toBe('User API');
      expect(useAppStore.getState().collections[0].requests).toHaveLength(1);
      expect(useAppStore.getState().collections[0].requests[0].url).toBe('https://api.example.com/v1/users');
    });
  });
});
