import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CollectionsPage } from '../CollectionsPage';
import { renderWithRouter, resetStore } from '@/test/test-utils';
import { useAppStore } from '@/store/useAppStore';
import { requestService } from '@/services/requestService';

describe('CollectionsPage Enhanced Features', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
    useAppStore.getState().setCollections([]);
  });

  it('renders empty state when no collections exist', () => {
    renderWithRouter(<CollectionsPage />);
    expect(screen.getByText(/No saved collections yet/i)).toBeInTheDocument();
  });

  it('creates a new collection and allows adding multiple HTTP method requests', async () => {
    const user = userEvent.setup();
    renderWithRouter(<CollectionsPage />);

    // Create a collection
    const input = screen.getByLabelText('Collection name');
    await user.type(input, 'E-Commerce Suite');
    await user.click(screen.getByRole('button', { name: /^Create$/i }));

    expect(screen.getByLabelText('Collection E-Commerce Suite')).toBeInTheDocument();

    // Add a POST endpoint
    await user.click(screen.getByRole('button', { name: /Add POST/i }));

    // Verify method dropdown shows POST
    const methodSelect = screen.getByLabelText(/Request 1 method/i) as HTMLSelectElement;
    expect(methodSelect.value).toBe('POST');

    // Add a DELETE endpoint
    await user.click(screen.getByRole('button', { name: /Add DELETE/i }));
    const methodSelect2 = screen.getByLabelText(/Request 2 method/i) as HTMLSelectElement;
    expect(methodSelect2.value).toBe('DELETE');
  });

  it('allows changing request method to any HTTP verb via dropdown', async () => {
    const user = userEvent.setup();
    useAppStore.getState().createCollection('API Suite');
    const colId = useAppStore.getState().collections[0].id;
    useAppStore.getState().updateCollection(colId, {
      requests: [
        {
          id: 'req-1',
          name: 'Create User',
          method: 'GET',
          url: 'https://api.test/users',
          queryParams: [],
          headers: [],
          body: '',
          auth: { type: 'none' },
        },
      ],
    });

    renderWithRouter(<CollectionsPage />);
    const methodSelect = screen.getByLabelText(/Request 1 method/i) as HTMLSelectElement;
    expect(methodSelect.value).toBe('GET');

    // Switch method to PUT
    await user.selectOptions(methodSelect, 'PUT');
    expect(methodSelect.value).toBe('PUT');
    expect(useAppStore.getState().collections[0].requests[0].method).toBe('PUT');
  });

  it('executes a single request and displays live response status', async () => {
    const user = userEvent.setup();
    vi.spyOn(requestService, 'executeRequest').mockResolvedValueOnce({
      success: true,
      status: 201,
      statusText: 'Created',
      responseTime: 42,
      headers: {},
      body: { id: 'usr_123', status: 'active' },
    });

    useAppStore.getState().createCollection('Order API');
    const colId = useAppStore.getState().collections[0].id;
    useAppStore.getState().updateCollection(colId, {
      requests: [
        {
          id: 'req-order',
          name: 'Create Order',
          method: 'POST',
          url: 'https://api.test/orders',
          queryParams: [],
          headers: [],
          body: '{"item": "laptop"}',
          auth: { type: 'none' },
        },
      ],
    });

    renderWithRouter(<CollectionsPage />);
    const sendBtn = screen.getByRole('button', { name: /Send/i });
    await user.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByText('201')).toBeInTheDocument();
      expect(screen.getByText('(42ms)')).toBeInTheDocument();
    });
  });

  it('clones a request and collection with proper copies', async () => {
    const user = userEvent.setup();
    useAppStore.getState().createCollection('Payments');
    const colId = useAppStore.getState().collections[0].id;
    useAppStore.getState().updateCollection(colId, {
      requests: [
        {
          id: 'req-pay',
          name: 'Charge Card',
          method: 'POST',
          url: 'https://api.test/charge',
          queryParams: [],
          headers: [],
          body: '',
          auth: { type: 'none' },
        },
      ],
    });

    renderWithRouter(<CollectionsPage />);

    // Duplicate Request
    const copyReqBtn = screen.getByTitle('Duplicate request');
    await user.click(copyReqBtn);

    expect(useAppStore.getState().collections[0].requests).toHaveLength(2);
    expect(useAppStore.getState().collections[0].requests[1].name).toBe('Charge Card (Copy)');

    // Duplicate Collection
    const cloneColBtn = screen.getByTitle('Duplicate this collection');
    await user.click(cloneColBtn);

    expect(useAppStore.getState().collections).toHaveLength(2);
    expect(useAppStore.getState().collections[1].name).toBe('Payments (Copy)');
  });
});

