import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GeminiKeyPanel } from '@/components/settings/GeminiKeyPanel';
import { renderWithRouter, resetStore } from '@/test/test-utils';
import { aiSettingsService, AiSettingsApiError, type AiKeyStatus } from '@/services/aiSettingsService';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';

const KEY = 'AIza' + 'SyFRONTENDtestKEYxxxxxxxxxxxxxxxxxxx1234' /* synthetic test value, not a real key */;
const notConfigured: AiKeyStatus = { provider: 'google-gemini', configured: false, storage: 'session', model: 'gemini-test', mode: 'mock-demo' };
const configured: AiKeyStatus = {
  ...notConfigured,
  configured: true,
  mode: 'gemini',
  keyHint: '••••1234',
  configuredAt: '2026-10-30T10:00:00Z',
  lastValidation: { status: 'valid', checkedAt: '2026-10-30T10:00:00Z', message: 'Gemini accepted this key for model gemini-test.' },
};

describe('GeminiKeyPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    resetStore();
    vi.restoreAllMocks();
  });

  it('explains optional, user-billed AI and shows not-configured status', async () => {
    vi.spyOn(aiSettingsService, 'getStatus').mockResolvedValue(notConfigured);
    renderWithRouter(<GeminiKeyPanel />);
    expect(await screen.findByText('Not configured')).toBeInTheDocument();
    expect(screen.getByText(/AI is optional/i)).toBeInTheDocument();
    expect(screen.getByText(/quota, and billing/i)).toBeInTheDocument();
    expect(screen.getByText(/must be re-entered in a new session/i)).toBeInTheDocument();
  });

  it('validates a key server-side, clears the input, shows only a masked hint, and never persists the key', async () => {
    vi.spyOn(aiSettingsService, 'getStatus').mockResolvedValue(notConfigured);
    let resolveSave!: (value: AiKeyStatus) => void;
    const save = vi.spyOn(aiSettingsService, 'saveGeminiKey').mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));
    const user = userEvent.setup();
    renderWithRouter(<GeminiKeyPanel />);
    const input = await screen.findByLabelText('Gemini API key');
    expect(input).toHaveAttribute('type', 'password');
    await user.type(input, KEY);
    await user.click(screen.getByRole('button', { name: /Save & test key/i }));
    expect(save).toHaveBeenCalledWith(KEY);
    expect(screen.getByText('Validating…')).toBeInTheDocument();
    resolveSave(configured);

    expect(await screen.findByText('Configured')).toBeInTheDocument();
    expect(screen.getByText(/Key ••••1234/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Gemini API key')).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(KEY);
    expect(JSON.stringify(localStorage)).not.toContain(KEY);
    expect(JSON.stringify(sessionStorage)).not.toContain(KEY);
    expect(JSON.stringify(useAppStore.getState())).not.toContain(KEY);
    expect(JSON.stringify(useAuthStore.getState())).not.toContain(KEY);
  });

  it('shows validation failure without echoing the key', async () => {
    vi.spyOn(aiSettingsService, 'getStatus').mockResolvedValue(notConfigured);
    vi.spyOn(aiSettingsService, 'saveGeminiKey').mockRejectedValue(new AiSettingsApiError('Gemini rejected this key (HTTP 400).', notConfigured));
    const user = userEvent.setup();
    renderWithRouter(<GeminiKeyPanel />);
    await user.type(await screen.findByLabelText('Gemini API key'), KEY);
    await user.click(screen.getByRole('button', { name: /Save & test key/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Gemini rejected this key');
    expect(screen.getByText('Validation failed')).toBeInTheDocument();
    expect(screen.getByLabelText('Gemini API key')).toHaveValue('');
    expect(document.body.innerHTML).not.toContain(KEY);
  });

  it('tests, replaces, and removes a configured key', async () => {
    vi.spyOn(aiSettingsService, 'getStatus').mockResolvedValue(configured);
    const test = vi.spyOn(aiSettingsService, 'testGeminiKey').mockResolvedValue({
      ...configured,
      lastValidation: { status: 'unverified', checkedAt: '2026-10-30T11:00:00Z', message: 'Gemini rate limit or quota exhausted (HTTP 429); the key could not be verified right now.' },
    });
    const remove = vi.spyOn(aiSettingsService, 'removeGeminiKey').mockResolvedValue(notConfigured);
    const user = userEvent.setup();
    renderWithRouter(<GeminiKeyPanel />);

    await user.click(await screen.findByRole('button', { name: /^Test key$/i }));
    expect(test).toHaveBeenCalled();
    expect(await screen.findByText('Configured (unverified)')).toBeInTheDocument();
    expect(screen.getByText(/quota exhausted/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Replace key/i }));
    expect(screen.getByPlaceholderText(/replacement Gemini API key/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Cancel/i }));

    await user.click(screen.getByRole('button', { name: /Remove key/i }));
    expect(remove).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('Not configured')).toBeInTheDocument());
    expect(screen.getByText(/Gemini key removed/i)).toBeInTheDocument();
  });
});
