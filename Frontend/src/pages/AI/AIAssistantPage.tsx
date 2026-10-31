import { ArrowRight, Bot, FileBarChart, FlaskConical, Loader2, Plus, Send, Server, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/useAppStore';
import { askAssistant, describeAssistantProvider, type AssistantProviderStatus } from '@/services/assistantService';
import { aiSettingsService, describeAiMode, type AiKeyStatus } from '@/services/aiSettingsService';
import { buildAssistantContext } from '@/lib/assistantContext';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  provider?: 'google-gemini' | 'mock';
  providerStatus?: AssistantProviderStatus;
  fallbackReason?: string;
  evidence?: string[];
  contextTruncated?: boolean;
};

const GENERAL_SUGGESTIONS = [
  'Explain the difference between 401 Unauthorized and 403 Forbidden',
  'How should REST error responses be structured?',
];

/**
 * Session-aware API assistant. Answers are grounded in the imported spec and this
 * session's tests and results; actions live on the dedicated tool pages linked below.
 */
export function AIAssistantPage() {
  const { generatedTests, executionResults, validationResults, diagnosisResults, activeSpecification, requestDraft } = useAppStore();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [contextId, setContextId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [aiStatus, setAiStatus] = useState<AiKeyStatus>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let active = true;
    aiSettingsService
      .getStatus()
      .then((status) => active && setAiStatus(status))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  // Focus options: tests with recorded session activity. Without a focus, the assistant
  // selects only the records relevant to each question.
  const contexts = useMemo(
    () =>
      generatedTests
        .filter((test) => executionResults[test.id] || validationResults[test.id] || diagnosisResults[test.id])
        .map((test) => ({ id: test.id, label: `${test.endpoint.method} ${test.endpoint.path} — ${test.name}` })),
    [generatedTests, executionResults, validationResults, diagnosisResults]
  );

  const failingTests = useMemo(
    () =>
      generatedTests.filter((test) => {
        const execution = executionResults[test.id];
        const validation = validationResults[test.id];
        return execution?.status === 'FAILED_EXECUTION' || execution?.status === 'ERROR' || validation?.status === 'VALIDATION_FAILED';
      }),
    [generatedTests, executionResults, validationResults]
  );

  // Suggestions come from this session first (real failures, real endpoints), then general topics.
  const suggestions = useMemo(() => {
    const items: string[] = [];
    const seen = new Set<string>();
    for (const test of failingTests) {
      const endpoint = `${test.endpoint.method} ${test.endpoint.path}`;
      if (seen.has(endpoint)) continue;
      seen.add(endpoint);
      items.push(`Why did ${endpoint} fail?`);
      if (items.length === 3) break;
    }
    if (activeSpecification && items.length < 3) {
      for (const endpoint of activeSpecification.endpoints.slice(0, 3 - items.length)) {
        items.push(`What does ${endpoint.method} ${endpoint.path} return?`);
      }
    }
    return [...items, ...GENERAL_SUGGESTIONS].slice(0, 4);
  }, [failingTests, activeSpecification]);

  const executedCount = Object.keys(executionResults).length;

  const nextSteps = [
    {
      title: 'Generate tests',
      detail: activeSpecification ? `${generatedTests.length} tests for ${activeSpecification.metadata.title}` : 'Import an OpenAPI spec first',
      path: activeSpecification ? '/test-generator' : '/openapi',
      icon: FlaskConical,
    },
    {
      title: 'Validate responses',
      detail: executedCount ? `${executedCount} executed tests to check` : 'Run tests to capture responses',
      path: '/response-validation',
      icon: ShieldCheck,
    },
    {
      title: 'Diagnose failures',
      detail: failingTests.length ? `${failingTests.length} failing tests in this run` : 'No failures in this run',
      path: '/reports',
      icon: FileBarChart,
    },
    {
      title: 'Mock from spec',
      detail: activeSpecification ? 'Serve example responses from the spec' : 'Needs an imported spec',
      path: '/mock-server',
      icon: Server,
    },
  ];

  const send = async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || loading) return;
    setMessages((items) => [...items, { role: 'user', content: message }]);
    setInput('');
    setError('');
    setLoading(true);

    try {
      const sessionContext = buildAssistantContext({
        question: message,
        specification: activeSpecification,
        tests: generatedTests,
        executionResults,
        validationResults,
        diagnosisResults,
        requestDraft,
        focusTestId: contextId || undefined,
      });
      // Bounded, in-memory history only (never persisted).
      const history = messages.slice(-6).map(({ role, content }) => ({ role, content }));
      const reply = await askAssistant(message, undefined, { sessionContext, history });
      setMessages((items) => [
        ...items,
        {
          role: 'assistant',
          content: reply.reply,
          provider: reply.provider,
          providerStatus: reply.providerStatus,
          fallbackReason: reply.fallbackReason,
          evidence: reply.evidence,
          contextTruncated: reply.contextTruncated,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assistant request failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">AI Assistant</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            Answers grounded in your imported spec, tests, and results. Advice only — validation decides pass or fail.
          </p>
        </div>
        <p className="shrink-0 text-xs text-slate-500">
          {describeAiMode(aiStatus)}
          {aiStatus && !aiStatus.configured && (
            <>
              {' · '}
              <Link to="/settings" className="font-medium text-blue-600 hover:underline">
                Add your Gemini key
              </Link>
            </>
          )}
        </p>
      </div>

      <section className="panel-surface flex flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.06] px-4 py-2.5">
          <label className="flex min-w-0 items-center gap-2 text-xs text-slate-500">
            Focus
            <select
              aria-label="Assistant context"
              className="h-8 max-w-[320px] truncate rounded-lg border border-black/[0.12] bg-white px-2 text-[13px] text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-[3px] focus:ring-blue-500/25"
              value={contextId}
              onChange={(e) => setContextId(e.target.value)}
            >
              <option value="">Auto-select from question</option>
              {contexts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setMessages([]);
              setError('');
              inputRef.current?.focus();
            }}
            disabled={!messages.length && !error}
          >
            <Plus className="h-3.5 w-3.5" />
            New chat
          </Button>
        </div>

        <div ref={scrollRef} className="h-[460px] space-y-3 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <Bot className="h-5 w-5" />
              </div>
              <p className="mt-3 text-[15px] font-semibold text-slate-900">Ask about your API</p>
              <p className="mt-1 max-w-md text-[13px] text-slate-500">
                {failingTests.length
                  ? 'Start with a failure from this run, or ask anything about your spec.'
                  : activeSpecification
                    ? `Ask about ${activeSpecification.metadata.title}, or about HTTP and API design in general.`
                    : 'Import an OpenAPI spec for grounded answers, or ask a general API question.'}
              </p>
              <div className="mt-5 flex max-w-xl flex-wrap justify-center gap-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void send(suggestion)}
                    className="rounded-full border border-black/[0.1] bg-white px-3 py-1.5 text-[13px] text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <div key={index} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={
                    message.role === 'user'
                      ? 'max-w-[80%] rounded-2xl rounded-br-md bg-blue-600 px-3.5 py-2 text-[13px] text-white'
                      : 'max-w-[85%] rounded-2xl rounded-bl-md bg-slate-100 px-3.5 py-2.5 text-[13px] text-slate-800'
                  }
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                  {message.role === 'assistant' && message.evidence && message.evidence.length > 0 && (
                    <p className="mt-2 text-[11px] text-slate-500">Evidence: {message.evidence.join(' · ')}</p>
                  )}
                  {message.contextTruncated && (
                    <p className="mt-1 text-[11px] text-amber-700">Context was truncated to stay within limits; the answer may be incomplete.</p>
                  )}
                  {message.provider && (
                    <p className="mt-1.5 text-[11px] font-medium text-slate-500">
                      Provider: {describeAssistantProvider({ provider: message.provider, providerStatus: message.providerStatus, fallbackReason: message.fallbackReason })}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Thinking…
            </div>
          )}
          {error && (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs font-medium text-rose-700">
              {error}
            </p>
          )}
        </div>

        <form
          className="flex items-end gap-2 border-t border-black/[0.06] p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            ref={inputRef}
            aria-label="Assistant message"
            rows={1}
            className="max-h-32 min-h-9 flex-1 resize-none rounded-lg border border-black/[0.12] bg-white px-3 py-2 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-[3px] focus:ring-blue-500/25"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Ask about an endpoint, a failure, or a response…"
          />
          <Button type="submit" disabled={loading || !input.trim()}>
            <Send className="h-3.5 w-3.5" />
            Send
          </Button>
        </form>
      </section>

      <section aria-labelledby="next-steps-title">
        <h2 id="next-steps-title" className="mb-2 text-[13px] font-semibold text-slate-700">
          Next steps
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {nextSteps.map(({ title, detail, path, icon: Icon }) => (
            <Link
              key={title}
              to={path}
              className="group flex items-start gap-3 rounded-xl border border-black/[0.07] bg-white p-3 transition-colors hover:bg-slate-50"
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-1 text-[13px] font-medium text-slate-900">
                  {title}
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400 transition-colors group-hover:text-slate-600" />
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">{detail}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
