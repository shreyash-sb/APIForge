import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import { CollectionsPage } from '@/pages/Collections/CollectionsPage';
import { RequestBuilderPage } from '@/pages/RequestBuilder/RequestBuilderPage';
import { renderWithRouter, resetStore } from '@/test/test-utils';
import { useAppStore } from '@/store/useAppStore';
import { requestService } from '@/services/requestService';

// Regressions for defects found during end-to-end QA.
describe('QA regressions', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
    useAppStore.getState().setCollections([]);
    vi.restoreAllMocks();
  });

  it('confirms a successful collection import instead of closing silently, and reports invalid JSON accessibly', async () => {
    const user = userEvent.setup();
    renderWithRouter(<CollectionsPage />);
    await user.click(screen.getByRole('button', { name: /^Import$/i }));
    const textarea = screen.getByLabelText('Collection JSON');

    await user.type(textarea, 'not json');
    await user.click(screen.getByRole('button', { name: /Import Collection/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Invalid JSON syntax/);

    await user.clear(textarea);
    await user.click(textarea);
    await user.paste(JSON.stringify({ name: 'QA Imported', requests: [{ name: 'list', method: 'GET', url: 'https://api.example.test/users' }] }));
    await user.click(screen.getByRole('button', { name: /Import Collection/i }));
    expect(await screen.findByRole('status')).toHaveTextContent('Imported "QA Imported" with 1 request(s).');
    expect(useAppStore.getState().collections.some((c) => c.name === 'QA Imported')).toBe(true);
  });

  it('shows an inline error (not a blocking alert dialog) when saving a request without a URL', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    useAppStore.getState().createCollection('Target');
    const user = userEvent.setup();
    renderWithRouter(<RequestBuilderPage />);
    await user.click(screen.getByTitle('Save request to an API Collection'));
    await user.click(screen.getByRole('button', { name: /^Save Request$/i }));
    expect(await screen.findByText('Please enter a target URL before saving.')).toBeInTheDocument();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('sends the Settings timeout to the backend so it bounds the outbound call', async () => {
    useAppStore.getState().setRequestTimeoutMs(4000);
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { success: true, status: 200 } });
    await requestService.executeRequest({ method: 'GET', url: 'https://api.example.test', auth: { type: 'none' } } as never);
    const [, body, config] = post.mock.calls[0];
    expect(body).toMatchObject({ timeoutMs: 4000 });
    expect(config?.timeout).toBeGreaterThan(4000);
  });
});

describe('in-app confirmation dialogs (no blocking window.confirm)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
    vi.restoreAllMocks();
  });

  it('sign out asks in-app and only logs out on confirm', async () => {
    const { Sidebar } = await import('@/components/layout/Sidebar');
    const { useAuthStore } = await import('@/store/useAuthStore');
    const logout = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ user: { id: 'u', name: 'QA', email: 'qa@example.test', role: 'engineer' } as never, token: 't', isAuthenticated: true, logout });
    const nativeConfirm = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();
    renderWithRouter(<Sidebar />);
    const [signOut] = screen.getAllByRole('button', { name: /sign out/i });
    await user.click(signOut);
    const dialog = screen.getByRole('alertdialog', { name: /sign out of apiforge/i });
    expect(dialog).toHaveTextContent(/Gemini API key/);
    await user.click(within(dialog).getByRole('button', { name: /^cancel$/i }));
    expect(logout).not.toHaveBeenCalled();
    await user.click(signOut);
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /^sign out$/i }));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(nativeConfirm).not.toHaveBeenCalled();
  });
});

describe('Settings shows only real account data', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
    vi.restoreAllMocks();
  });

  it('keeps email/role read-only, never saves them locally, and shows no fabricated activity', async () => {
    const { SettingsPage } = await import('@/pages/Settings/SettingsPage');
    const { useAuthStore } = await import('@/store/useAuthStore');
    const { aiSettingsService } = await import('@/services/aiSettingsService');
    // Never let a unit test reach a real backend that may be running locally.
    vi.spyOn(aiSettingsService, 'getStatus').mockResolvedValue({ provider: 'google-gemini', configured: false, storage: 'session', model: 'm', mode: 'mock-demo' });
    useAuthStore.setState({ user: { id: 'u', name: 'QA', email: 'qa@example.test', role: 'engineer' } as never, token: 't', isAuthenticated: true, loginActivity: [], fetchActivity: vi.fn().mockResolvedValue(undefined) });
    const user = userEvent.setup();
    renderWithRouter(<SettingsPage />);
    expect(screen.getByLabelText('Email address')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Role')).toHaveAttribute('readonly');
    await user.type(screen.getByLabelText('Role'), 'admin');
    await user.click(screen.getByRole('button', { name: /Save settings/i }));
    expect(useAuthStore.getState().user).toMatchObject({ email: 'qa@example.test', role: 'engineer' });
    expect(document.body.innerHTML).not.toContain('shri@gmail.com');
    expect(document.body.innerHTML).not.toContain('Desktop (Windows)');
  });
});
