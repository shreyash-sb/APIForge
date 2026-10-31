import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AIAssistantPage } from '@/pages/AI/AIAssistantPage';
import { renderWithRouter, resetStore } from '@/test/test-utils';
import * as assistant from '@/services/assistantService';
import { aiSettingsService } from '@/services/aiSettingsService';
import { useAppStore } from '@/store/useAppStore';
import { mockExecutionResult, mockSpecification, mockTestCase, mockValidationResult } from '@/test/fixtures';

describe('AIAssistantPage grounding', () => {
  beforeEach(() => {
    resetStore();
    vi.restoreAllMocks();
    vi.spyOn(aiSettingsService, 'getStatus').mockResolvedValue({ provider: 'google-gemini', configured: true, keyHint: '••••abcd', storage: 'session', model: 'm', mode: 'gemini' });
    const store = useAppStore.getState();
    store.setActiveSpecification(mockSpecification);
    store.setGeneratedTests([mockTestCase]);
    store.setExecutionResults({ [mockTestCase.id]: mockExecutionResult });
    store.setValidationResults({ [mockTestCase.id]: mockValidationResult });
  });

  it('sends a compact question-relevant session snapshot and bounded history', async () => {
    const ask = vi.spyOn(assistant, 'askAssistant').mockResolvedValue({
      provider: 'google-gemini', providerStatus: 'live', reply: 'From your session: GET /users/{id} returned 200.', contextUsed: true, evidence: ['GET /users/{id} · Get user'],
    });
    const user = userEvent.setup();
    renderWithRouter(<AIAssistantPage />);
    expect(await screen.findByText(/Gemini \(your key ••••abcd\)/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Assistant message'), 'What does GET /users/usr_1 return?');
    await user.click(screen.getByRole('button', { name: /^Send$/ }));
    expect(await screen.findByText(/returned 200/)).toBeInTheDocument();
    expect(screen.getByText(/Provider: Gemini \(your key\) · advisory/)).toBeInTheDocument();
    expect(screen.getByText(/Evidence: GET \/users\/\{id\}/)).toBeInTheDocument();

    const [message, legacyContext, options] = ask.mock.calls[0];
    expect(message).toBe('What does GET /users/usr_1 return?');
    expect(legacyContext).toBeUndefined();
    expect(options?.sessionContext?.endpoints?.map((e) => e.path)).toEqual(['/users/{id}']);
    expect(options?.sessionContext?.tests?.[0].testCaseId).toBe(mockTestCase.id);
    expect(options?.history).toEqual([]);
  });

  it('labels Gemini failure fallback and clarification replies honestly', async () => {
    vi.spyOn(assistant, 'askAssistant')
      .mockResolvedValueOnce({ provider: 'mock', providerStatus: 'fallback', fallbackReason: 'Gemini request timed out', reply: 'Fallback text', contextUsed: true, contextTruncated: true })
      .mockResolvedValueOnce({ provider: 'mock', providerStatus: 'clarification', reply: 'Which endpoint or test do you mean?', contextUsed: false, needsClarification: true });
    const user = userEvent.setup();
    renderWithRouter(<AIAssistantPage />);
    await user.type(screen.getByLabelText('Assistant message'), 'Explain the failure on GET /users/usr_1');
    await user.click(screen.getByRole('button', { name: /^Send$/ }));
    expect(await screen.findByText(/Gemini could not answer \(Gemini request timed out\) · mock\/deterministic fallback/)).toBeInTheDocument();
    expect(screen.getByText(/Context was truncated/)).toBeInTheDocument();
    expect(screen.queryByText(/Provider: Gemini \(your key\)/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Assistant message'), 'Why did this test fail?');
    await user.click(screen.getByRole('button', { name: /^Send$/ }));
    expect(await screen.findByText(/APIForge follow-up question \(no AI call\)/)).toBeInTheDocument();
  });
});

describe('AIAssistantPage layout (agent workspace removed)', () => {
  beforeEach(() => {
    resetStore();
    vi.restoreAllMocks();
    vi.spyOn(aiSettingsService, 'getStatus').mockResolvedValue({ provider: 'google-gemini', configured: false, storage: 'session', model: 'm', mode: 'mock-demo' });
  });

  it('suggests questions from real failures and sends a suggestion when clicked', async () => {
    const store = useAppStore.getState();
    store.setActiveSpecification(mockSpecification);
    store.setGeneratedTests([mockTestCase]);
    store.setExecutionResults({ [mockTestCase.id]: { ...mockExecutionResult, status: 'FAILED_EXECUTION' } });
    const ask = vi.spyOn(assistant, 'askAssistant').mockResolvedValue({ provider: 'mock', providerStatus: 'mock', reply: 'Mock/demo response', contextUsed: true });
    const user = userEvent.setup();
    renderWithRouter(<AIAssistantPage />);

    const suggestion = screen.getByRole('button', { name: 'Why did GET /users/{id} fail?' });
    await user.click(suggestion);
    expect(ask).toHaveBeenCalledWith('Why did GET /users/{id} fail?', undefined, expect.anything());
    expect(await screen.findByText('Mock/demo response')).toBeInTheDocument();
  });

  it('links next steps to the real tools and no longer shows the agent workspace', () => {
    renderWithRouter(<AIAssistantPage />);
    expect(screen.getByRole('link', { name: /Generate tests/ })).toHaveAttribute('href', '/openapi');
    expect(screen.getByRole('link', { name: /Diagnose failures/ })).toHaveAttribute('href', '/reports');
    expect(screen.getByRole('link', { name: /Mock from spec/ })).toHaveAttribute('href', '/mock-server');
    expect(screen.queryByText(/Agent Workspace/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Formulate Plan/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Explain the difference between 401/ })).toBeInTheDocument();
  });
});
