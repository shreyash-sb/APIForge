import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { MockServerPage } from '../MockServerPage';
import { renderWithRouter, resetStore } from '@/test/test-utils';
import { useAppStore } from '@/store/useAppStore';

describe('MockServerPage Component Tests', () => {
  beforeEach(() => {
    resetStore();
    vi.restoreAllMocks();
  });

  it('renders the mock server page without crashing', async () => {
    renderWithRouter(<MockServerPage />);
    expect(screen.getByText(/Mock Server Engine/i)).toBeInTheDocument();
  });

  it('renders when mockRoutes or mockLogs is undefined in store', async () => {
    useAppStore.setState({ mockRoutes: undefined as any, mockLogs: undefined as any });
    renderWithRouter(<MockServerPage />);
    expect(screen.getByText(/Mock Server Engine/i)).toBeInTheDocument();
  });
});

