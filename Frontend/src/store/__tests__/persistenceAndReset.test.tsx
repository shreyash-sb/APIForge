import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from '@/components/layout/Header';
import { SettingsPage } from '@/pages/Settings/SettingsPage';
import { TestGeneratorPage } from '@/pages/AI/TestGeneratorPage';
import { renderWithRouter, resetStore } from '@/test/test-utils';
import { mockSpecification, mockTestCase, mockExecutionResult } from '@/test/fixtures';
import { useAppStore } from '@/store/useAppStore';

describe('Frontend Persistence & Reset Workspace Integration Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
    vi.restoreAllMocks();
  });

  it('renders Settings Reset Workspace button and prompts for confirmation before resetting', async () => {
    const user = userEvent.setup();
    // Seed state with active specification and tests
    useAppStore.getState().setActiveSpecification(mockSpecification);
    useAppStore.getState().setGeneratedTests([mockTestCase]);
    useAppStore.getState().setExecutionResults({
      [mockTestCase.id]: mockExecutionResult,
    });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderWithRouter(<SettingsPage />, { route: '/settings' });

    const resetBtn = screen.getAllByRole('button', { name: /reset workspace/i })[0];
    expect(resetBtn).toBeInTheDocument();

    await user.click(resetBtn);

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining('Are you sure you want to reset the workspace?')
    );

    // Verify workspace state reset to initial defaults
    const state = useAppStore.getState();
    expect(state.activeSpecification).toBeUndefined();
    expect(state.generatedTests).toHaveLength(0);
    expect(state.executionResults).toEqual({});
  });

  it('preserves workspace state when user dismisses or cancels the reset confirmation dialog', async () => {
    const user = userEvent.setup();
    useAppStore.getState().setActiveSpecification(mockSpecification);
    useAppStore.getState().setGeneratedTests([mockTestCase]);

    vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderWithRouter(<SettingsPage />, { route: '/settings' });

    const resetBtn = screen.getAllByRole('button', { name: /reset workspace/i })[0];
    await user.click(resetBtn);

    // State must remain intact
    const state = useAppStore.getState();
    expect(state.activeSpecification).toBeDefined();
    expect(state.generatedTests).toHaveLength(1);
  });

  it('renders page components correctly from pre-populated store state', () => {
    // Populate store directly as would occur after localStorage rehydration
    useAppStore.getState().setActiveSpecification(mockSpecification);
    useAppStore.getState().setGeneratedTests([mockTestCase]);
    useAppStore.getState().setExecutionResults({
      [mockTestCase.id]: mockExecutionResult,
    });

    renderWithRouter(<TestGeneratorPage />, { route: '/test-generator' });

    expect(screen.getByRole('heading', { name: 'User Management API' })).toBeInTheDocument();
    expect(screen.getByText('GET /users/{id} - Valid Request')).toBeInTheDocument();
    expect(screen.getByText(/HTTP 200/i)).toBeInTheDocument();
  });

  it('excludes secret environment variables and runtime tokens from persisted localStorage JSON', () => {
    const secretValue = 'live_secret_token_xyz987654';

    useAppStore.getState().createEnvironment({
      name: 'Staging Environment',
      baseUrl: 'https://staging.example.com',
      variables: [
        {
          name: 'API_SECRET_KEY',
          value: secretValue,
          isSecret: true,
          enabled: true,
        },
        {
          name: 'PUBLIC_CLIENT_ID',
          value: 'client-pub-456',
          isSecret: false,
          enabled: true,
        },
      ],
    });

    const storedRaw = localStorage.getItem('apiforge-workspace');
    expect(storedRaw).not.toBeNull();

    // Verify secret string is absent from persisted storage
    expect(storedRaw).not.toContain(secretValue);
    // Non-secret variable is stored
    expect(storedRaw).toContain('client-pub-456');
  });

  it('persists only redacted, bounded Request Builder execution metadata', () => {
    useAppStore.getState().recordManualRequestExecution({
      id: 'manual-1', method: 'GET', endpoint: 'https://api.example.test/users?token=live_secret_token_xyz987654',
      completedAt: new Date().toISOString(), durationMs: 10, status: 'HTTP_RESPONSE', httpStatus: 200,
    });
    const storedRaw = localStorage.getItem('apiforge-workspace');
    expect(storedRaw).toContain('/users?token=[REDACTED]');
    expect(storedRaw).not.toContain('live_secret_token_xyz987654');
    expect(storedRaw).not.toContain('api.example.test');
  });

  it('handles corrupted localStorage payload gracefully without crashing application', () => {
    localStorage.setItem('apiforge-workspace', '<<<CORRUPTED-MALFORMED-STORAGE>>>');

    // Rendering does not crash
    expect(() => {
      renderWithRouter(<Header />, { route: '/dashboard' });
    }).not.toThrow();

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });
});
