import { CheckCircle2, KeyRound, Loader2, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { aiSettingsService, AiSettingsApiError, type AiKeyStatus } from '@/services/aiSettingsService';

type PanelState = 'loading' | 'not-configured' | 'validating' | 'configured' | 'validation-failed' | 'unavailable';

function deriveState(status: AiKeyStatus): PanelState {
  return status.configured ? 'configured' : 'not-configured';
}

/**
 * Personal Gemini key settings. The typed key lives only in this component's
 * state until it is submitted, and is cleared immediately afterwards; it is never
 * put in the app store, localStorage, or any persisted state.
 */
export function GeminiKeyPanel() {
  const [status, setStatus] = useState<AiKeyStatus>();
  const [state, setState] = useState<PanelState>('loading');
  const [draftKey, setDraftKey] = useState('');
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    aiSettingsService
      .getStatus()
      .then((result) => {
        if (!active) return;
        setStatus(result);
        setState(deriveState(result));
      })
      .catch(() => {
        if (!active) return;
        setState('unavailable');
        setMessage('AI settings are unavailable. Check that the backend is running and you are signed in.');
      });
    return () => {
      active = false;
    };
  }, []);

  const save = async () => {
    const candidate = draftKey.trim();
    if (!candidate) return;
    // Clear the plaintext from memory/UI as soon as it is handed to the request.
    setDraftKey('');
    setState('validating');
    setMessage('');
    try {
      const result = await aiSettingsService.saveGeminiKey(candidate);
      setStatus(result);
      setEditing(false);
      setState('configured');
      setMessage(result.lastValidation?.message ?? 'Key saved for this session.');
    } catch (error) {
      if (error instanceof AiSettingsApiError && error.status) setStatus(error.status);
      setState('validation-failed');
      setMessage(error instanceof Error ? error.message : 'The key could not be validated.');
    }
  };

  const test = async () => {
    setState('validating');
    setMessage('');
    try {
      const result = await aiSettingsService.testGeminiKey();
      setStatus(result);
      setState(result.lastValidation?.status === 'invalid' ? 'validation-failed' : deriveState(result));
      setMessage(result.lastValidation?.message ?? '');
    } catch (error) {
      if (error instanceof AiSettingsApiError && error.status) setStatus(error.status);
      setState(status?.configured ? 'validation-failed' : 'not-configured');
      setMessage(error instanceof Error ? error.message : 'The key test failed.');
    }
  };

  const remove = async () => {
    setState('validating');
    try {
      const result = await aiSettingsService.removeGeminiKey();
      setStatus(result);
      setEditing(false);
      setState('not-configured');
      setMessage('Gemini key removed. AI features now run in mock/demo mode.');
    } catch (error) {
      setState(status?.configured ? 'configured' : 'not-configured');
      setMessage(error instanceof Error ? error.message : 'Unable to remove the key.');
    }
  };

  const configured = Boolean(status?.configured);
  const showInput = state !== 'loading' && state !== 'unavailable' && (!configured || editing);
  const lastValidation = status?.lastValidation;

  const badge = {
    loading: { text: 'Checking…', className: 'border-slate-200 bg-slate-50 text-slate-600' },
    'not-configured': { text: 'Not configured', className: 'border-slate-200 bg-slate-50 text-slate-600' },
    validating: { text: 'Validating…', className: 'border-sky-200 bg-sky-50 text-sky-700' },
    configured: {
      text: lastValidation?.status === 'unverified' ? 'Configured (unverified)' : 'Configured',
      className: lastValidation?.status === 'unverified' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700',
    },
    'validation-failed': { text: 'Validation failed', className: 'border-rose-200 bg-rose-50 text-rose-700' },
    unavailable: { text: 'Unavailable', className: 'border-slate-200 bg-slate-50 text-slate-600' },
  }[state];

  return (
    <section id="ai-section" className="panel-surface space-y-4 p-4 sm:p-5" aria-labelledby="ai-section-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-violet-600" />
          <h2 id="ai-section-title" className="text-sm font-bold text-slate-900">AI Provider (Gemini)</h2>
        </div>
        <span data-testid="gemini-key-status" className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>
          {badge.text}
        </span>
      </div>

      <div className="space-y-1.5 text-xs leading-5 text-slate-600">
        <p>
          AI is optional. Add your own Gemini API key to get AI diagnosis and assistant answers. Google usage, quota, and billing
          are tied to <span className="font-semibold">your</span> Gemini account.
        </p>
        <p>
          The key is sent once to the APIForge backend, kept in server memory for this sign-in session only, and is never shown
          again. It is cleared when you remove it or sign out, and must be re-entered in a new session. Without a key, AI features
          run in clearly labelled mock/demo mode. Deterministic validation always remains the source of truth.
        </p>
      </div>

      {configured && status && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-xs text-slate-700">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            Key {status.keyHint}
          </span>
          <span>Model: {status.model}</span>
          <span>Storage: session only</span>
          {lastValidation && (
            <span>
              Last check: {lastValidation.status} · {new Date(lastValidation.checkedAt).toLocaleString()}
            </span>
          )}
        </div>
      )}

      {showInput && (
        <form
          className="flex max-w-xl flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Input
            type="password"
            aria-label="Gemini API key"
            autoComplete="off"
            spellCheck={false}
            value={draftKey}
            onChange={(event) => setDraftKey(event.target.value)}
            placeholder={configured ? 'Paste a replacement Gemini API key' : 'Paste your Gemini API key'}
            className="h-8 text-xs"
            disabled={state === 'validating'}
            maxLength={512}
          />
          <Button type="submit" size="sm" className="shrink-0 gap-1.5 font-semibold" disabled={!draftKey.trim() || state === 'validating'}>
            {state === 'validating' ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            Save &amp; test key
          </Button>
          {editing && (
            <Button type="button" variant="outline" size="sm" onClick={() => { setEditing(false); setDraftKey(''); }}>
              Cancel
            </Button>
          )}
        </form>
      )}

      {configured && !editing && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void test()} disabled={state === 'validating'}>
            {state === 'validating' ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            Test key
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)} disabled={state === 'validating'}>
            Replace key
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-50"
            onClick={() => void remove()}
            disabled={state === 'validating'}
          >
            <Trash2 className="h-3 w-3" />
            Remove key
          </Button>
        </div>
      )}

      {message && (
        <p
          role={state === 'validation-failed' ? 'alert' : undefined}
          className={`flex items-start gap-1.5 text-xs font-medium ${state === 'validation-failed' ? 'text-rose-600' : 'text-slate-600'}`}
        >
          {state === 'validation-failed' && <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          {message}
        </p>
      )}
    </section>
  );
}
