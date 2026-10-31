import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPage } from '@/pages/Settings/SettingsPage';
import { renderWithRouter, resetStore } from '@/test/test-utils';
import { DEFAULT_REQUEST_TIMEOUT_MS, useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';

describe('SettingsPage', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });

  it('updates and persists display name and bounded timeout', async () => {
    const user = userEvent.setup();
    renderWithRouter(<SettingsPage />);
    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Ada');
    await user.clear(screen.getByLabelText('Request timeout'));
    await user.type(screen.getByLabelText('Request timeout'), '12000');
    await user.click(screen.getByRole('button', { name: /Save settings/i }));
    expect(useAppStore.getState().currentUser.name).toBe('Ada');
    expect(useAppStore.getState().requestTimeoutMs).toBe(12000);
    expect(localStorage.getItem('apiforge-workspace')).toContain('12000');
  });

  it('rejects a timeout beyond the safe client bound and resets settings', async () => {
    const user = userEvent.setup();
    renderWithRouter(<SettingsPage />);
    await user.clear(screen.getByLabelText('Request timeout'));
    await user.type(screen.getByLabelText('Request timeout'), '999999');
    await user.click(screen.getByRole('button', { name: /Save settings/i }));
    expect(screen.getByRole('status')).toHaveTextContent('Timeout must be');
    await user.click(screen.getByRole('button', { name: /Reset settings/i }));
    expect(useAppStore.getState().requestTimeoutMs).toBe(DEFAULT_REQUEST_TIMEOUT_MS);
  });

  it('keeps display name but resets timeout on workspace reset', () => {
    useAppStore.getState().setDisplayName('Ada');
    useAppStore.getState().setRequestTimeoutMs(12000);
    useAppStore.getState().resetWorkspace();
    expect(useAppStore.getState().currentUser.name).toBe('Ada');
    expect(useAppStore.getState().requestTimeoutMs).toBe(DEFAULT_REQUEST_TIMEOUT_MS);
  });

  it('opens delete account modal and triggers permanent deletion upon typing DELETE', async () => {
    const user = userEvent.setup();
    const deleteSpy = vi.fn().mockResolvedValue({ success: true });
    useAuthStore.setState({
      user: { id: 'usr-1', name: 'Ada', email: 'ada@example.com', role: 'engineer' },
      token: 'valid-token',
      isAuthenticated: true,
      deleteAccount: deleteSpy,
    });

    renderWithRouter(<SettingsPage />);

    // Switch to Security tab
    await user.click(screen.getByRole('button', { name: /Security & Activity/i }));

    // Click Danger Zone Delete Account button
    const deleteBtn = screen.getByRole('button', { name: /^Delete Account$/i });
    expect(deleteBtn).toBeInTheDocument();
    await user.click(deleteBtn);

    // Modal appears
    expect(screen.getByText('Delete Account Permanently')).toBeInTheDocument();
    const confirmInput = screen.getByLabelText('Type DELETE to confirm');
    const submitDeleteBtn = screen.getByRole('button', { name: /Permanently Delete/i });

    // Disabled until "DELETE" is entered
    expect(submitDeleteBtn).toBeDisabled();

    await user.type(confirmInput, 'DELETE');
    expect(submitDeleteBtn).not.toBeDisabled();

    await user.click(submitDeleteBtn);
    expect(deleteSpy).toHaveBeenCalled();
  });

  it('renders Recent Activity table and allows refreshing and clearing', async () => {
    const user = userEvent.setup();
    const fetchActivitySpy = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({
      fetchActivity: fetchActivitySpy,
      loginActivity: [
        {
          id: 'test-act-1',
          userEmail: 'shri@gmail.com',
          timestamp: '2026-10-25T22:06:37.000Z',
          ip: '::1',
          userAgent: 'Mozilla/5.0',
          status: 'SUCCESS',
          deviceType: 'Desktop (Windows)',
        },
      ],
    });

    renderWithRouter(<SettingsPage />);

    expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText('Desktop (Windows)')).toBeInTheDocument();
    expect(screen.queryByText('::1')).not.toBeInTheDocument();

    // Click Refresh
    const refreshBtn = screen.getByRole('button', { name: /Refresh activity/i });
    await user.click(refreshBtn);
    expect(fetchActivitySpy).toHaveBeenCalled();

    // Click Clear
    const clearBtn = screen.getByRole('button', { name: /Clear activity/i });
    await user.click(clearBtn);
    expect(screen.getByText('No recent activity records')).toBeInTheDocument();
  });
});
