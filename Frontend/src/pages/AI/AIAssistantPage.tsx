import {
  AlertCircle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  FileCode2,
  Loader2,
  Play,
  Plus,
  Send,
  Sparkles,
  StopCircle,
  Terminal,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/useAppStore';
import { askAssistant } from '@/services/assistantService';
import {
  createAgentPlan,
  executeAgentTask,
  approveAgentStep,
  rejectAgentStep,
  cancelAgentTask,
} from '@/services/agentService';
import type { AgentStepProposal, AgentTask } from '@/types/agent.types';

type Message = { role: 'user' | 'assistant'; content: string; provider?: string };
const starters = [
  'Run full regression test on active endpoints',
  'Synthesize OpenAPI 3.1 specification for User Management',
  'Deploy ephemeral mock server for Order Service',
  'Diagnose failure on /api/users/999',
];

export function AIAssistantPage() {
  const [searchParams] = useSearchParams();
  const initialPrompt = searchParams.get('prompt') || '';

  const {
    generatedTests,
    executionResults,
    validationResults,
    diagnosisResults,
    activeSpecification,
    environments,
    activeEnvironmentId,
    agentTasks,
    setAgentTasks,
    addNotification,
  } = useAppStore();

  // Agent Orchestrator State
  const [agentGoal, setAgentGoal] = useState(initialPrompt);
  const [activeTask, setActiveTask] = useState<AgentTask | null>(null);
  const [planning, setPlanning] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [selectedStep, setSelectedStep] = useState<AgentStepProposal | null>(null);
  const [agentError, setAgentError] = useState('');

  // Assistant State (for advisory consultation)
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [contextId, setContextId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const activeEnv = environments.find((e) => e.id === activeEnvironmentId) || environments[0];

  // Auto-run if query prompt supplied
  useEffect(() => {
    if (initialPrompt && !activeTask && !planning) {
      void handlePlanAgent(initialPrompt);
    }
  }, [initialPrompt]);

  const contexts = useMemo(
    () =>
      generatedTests
        .filter((test) => executionResults[test.id] || validationResults[test.id] || diagnosisResults[test.id])
        .map((test) => ({
          id: test.id,
          label: `${test.endpoint.method} ${test.endpoint.path} — ${test.name}`,
          value: JSON.stringify({
            endpoint: test.endpoint,
            execution: executionResults[test.id]
              ? {
                  status: executionResults[test.id].status,
                  durationMs: executionResults[test.id].durationMs,
                  httpStatus: executionResults[test.id].response?.status,
                  error: executionResults[test.id].error?.message,
                }
              : undefined,
            validation: validationResults[test.id]
              ? {
                  status: validationResults[test.id].status,
                  failedAssertions: validationResults[test.id].summary.failedAssertions,
                }
              : undefined,
            diagnosis: diagnosisResults[test.id]
              ? {
                  provider: diagnosisResults[test.id].provider,
                  summary: diagnosisResults[test.id].summary,
                }
              : undefined,
          }),
        })),
    [generatedTests, executionResults, validationResults, diagnosisResults]
  );

  // ── Agent Handlers ──
  const handlePlanAgent = async (goalToPlan?: string) => {
    const goal = (goalToPlan || agentGoal).trim();
    if (!goal || planning) return;

    setPlanning(true);
    setAgentError('');
    setSelectedStep(null);

    try {
      const task = await createAgentPlan({
        goal,
        context: {
          spec: activeSpecification,
          baseUrl: activeEnv?.baseUrl,
          activeEnvironment: activeEnv?.name,
        },
      });

      setActiveTask(task);
      setAgentTasks([task, ...agentTasks.filter((t) => t.taskId !== task.taskId)]);
      setSelectedStep(task.steps[0] ?? null);

      addNotification({
        type: 'info',
        title: 'Agent Plan Ready',
        message: `Plan formulated with ${task.steps.length} bounded steps.`,
        actionUrl: '/ai-assistant',
        actionLabel: 'Inspect Plan',
      });
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : 'Failed to formulate agent plan.');
    } finally {
      setPlanning(false);
    }
  };

  const handleExecuteAgent = async () => {
    if (!activeTask || executing) return;
    setExecuting(true);
    setAgentError('');

    try {
      const updated = await executeAgentTask({ taskId: activeTask.taskId });
      setActiveTask(updated);
      setAgentTasks(agentTasks.map((t) => (t.taskId === updated.taskId ? updated : t)));

      if (updated.status === 'WAITING_FOR_APPROVAL') {
        addNotification({
          type: 'warning',
          title: 'Human Authorization Needed',
          message: `Step '${updated.steps[updated.currentStepIndex]?.tool}' requires confirmation before network execution.`,
          actionUrl: '/ai-assistant',
          actionLabel: 'Review & Authorize',
        });
      } else if (updated.status === 'COMPLETED') {
        addNotification({
          type: 'success',
          title: 'Agent Task Completed',
          message: `Task '${updated.goal}' completed with ${updated.artifacts.length} artifacts produced.`,
          actionUrl: '/ai-assistant',
          actionLabel: 'View Artifacts',
        });
      }
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : 'Execution failed.');
    } finally {
      setExecuting(false);
    }
  };

  const handleApprove = async (stepId: string) => {
    if (!activeTask) return;
    setExecuting(true);
    try {
      const updated = await approveAgentStep(activeTask.taskId, stepId);
      setActiveTask(updated);
      setAgentTasks(agentTasks.map((t) => (t.taskId === updated.taskId ? updated : t)));
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : 'Failed to approve step.');
    } finally {
      setExecuting(false);
    }
  };

  const handleReject = async (stepId: string) => {
    if (!activeTask) return;
    try {
      const updated = await rejectAgentStep(activeTask.taskId, stepId, 'Rejected by operator');
      setActiveTask(updated);
      setAgentTasks(agentTasks.map((t) => (t.taskId === updated.taskId ? updated : t)));
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : 'Failed to reject step.');
    }
  };

  const handleCancel = async () => {
    if (!activeTask) return;
    try {
      const updated = await cancelAgentTask(activeTask.taskId);
      setActiveTask(updated);
      setAgentTasks(agentTasks.map((t) => (t.taskId === updated.taskId ? updated : t)));
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : 'Cancellation failed.');
    }
  };

  // ── Assistant Handlers ──
  const send = async () => {
    const message = input.trim();
    if (!message || loading) return;
    setMessages((items) => [...items, { role: 'user', content: message }]);
    setInput('');
    setError('');
    setLoading(true);

    try {
      const selected = contexts.find((item) => item.id === contextId);
      const reply = await askAssistant(message, selected?.value);
      setMessages((items) => [
        ...items,
        { role: 'assistant', content: reply.reply, provider: reply.provider },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assistant request failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div className="grid gap-6 xl:grid-cols-12 xl:items-start">
        {/* ── LEFT: Autonomous Agent Workspace (7 cols) ── */}
        <div className="xl:col-span-7 space-y-5">
          {/* Main Agent Workspace Panel */}
          <section className="panel-surface p-5 border border-slate-200/80 bg-white space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-sm">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-slate-900">APIForge Agent Workspace</h1>
                  <p className="text-xs text-slate-500">Autonomous planning and execution with active engineering tools</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  10 Tools Online
                </span>
              </div>
            </div>

            {/* Goal Input & Planner Bar */}
            <div className="space-y-3 pt-1">
              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="text"
                  value={agentGoal}
                  onChange={(e) => setAgentGoal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handlePlanAgent();
                  }}
                  placeholder="Inspect API, generate test suite, or test workflow..."
                  className="flex-1 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-2.5 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                />
                <Button
                  onClick={() => void handlePlanAgent()}
                  disabled={planning || !agentGoal.trim()}
                  className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1.5 shadow-sm"
                >
                  {planning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-white" />}
                  Formulate Plan
                </Button>
              </div>

              {/* Quick Preset Starters */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] font-bold text-slate-400 uppercase mr-1">Presets:</span>
                {starters.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => setAgentGoal(starter)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                  >
                    {starter}
                  </button>
                ))}
              </div>

              {agentError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>{agentError}</span>
                </div>
              )}
            </div>
          </section>

          {/* Active Task Execution Pipeline */}
          {activeTask ? (
            <div className="space-y-4">
              <div className="panel-surface p-5 border border-slate-200/80 bg-white space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
                      Task #{activeTask.taskId.slice(-8)}
                    </span>
                    <h3 className="text-base font-bold text-slate-900 mt-0.5">{activeTask.goal}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{activeTask.advisoryPlan}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${
                        activeTask.status === 'COMPLETED'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : activeTask.status === 'WAITING_FOR_APPROVAL'
                          ? 'bg-amber-50 text-amber-800 border border-amber-300 animate-pulse'
                          : activeTask.status === 'FAILED'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}
                    >
                      {activeTask.status.replace(/_/g, ' ')}
                    </span>

                    {activeTask.status !== 'COMPLETED' && activeTask.status !== 'FAILED' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleCancel()}
                        className="rounded-lg text-rose-600 hover:bg-rose-50 hover:border-rose-200 text-xs"
                      >
                        <StopCircle className="h-3.5 w-3.5 mr-1" />
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>

                {/* Step-by-Step Execution Timeline */}
                <div className="space-y-2.5">
                  {activeTask.steps.map((step, idx) => {
                    const isSelected = selectedStep?.stepId === step.stepId;

                    return (
                      <div
                        key={step.stepId}
                        onClick={() => setSelectedStep(step)}
                        className={`relative flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50/40 shadow-sm'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                            step.status === 'SUCCEEDED'
                              ? 'bg-emerald-500 text-white'
                              : step.status === 'FAILED'
                              ? 'bg-rose-500 text-white'
                              : step.status === 'WAITING_FOR_APPROVAL'
                              ? 'bg-amber-500 text-white'
                              : step.status === 'RUNNING'
                              ? 'bg-blue-500 text-white animate-spin'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {step.status === 'SUCCEEDED' ? (
                            <Check className="h-4 w-4" />
                          ) : step.status === 'FAILED' ? (
                            <XCircle className="h-4 w-4" />
                          ) : (
                            idx + 1
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-slate-900">{step.tool}</span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                step.risk === 'READ_ONLY'
                                  ? 'bg-slate-100 text-slate-600'
                                  : step.risk === 'LOCAL_DRAFT'
                                  ? 'bg-purple-100 text-purple-700'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {step.risk}
                            </span>
                            {step.requiresApproval && (
                              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                                Approval Required
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-slate-600 leading-snug">{step.summary}</p>

                          {/* Human Approval Controls */}
                          {step.status === 'WAITING_FOR_APPROVAL' && (
                            <div className="mt-3 flex items-center gap-2 pt-2 border-t border-amber-200">
                              <Button
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleApprove(step.stepId);
                                }}
                                className="h-8 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold"
                              >
                                <Check className="h-3.5 w-3.5 mr-1" />
                                Approve Step Execution
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleReject(step.stepId);
                                }}
                                className="h-8 text-rose-600 border-rose-200 hover:bg-rose-50 text-xs font-semibold"
                              >
                                Reject
                              </Button>
                            </div>
                          )}
                        </div>

                        <ChevronRight className={`h-4 w-4 shrink-0 text-slate-400 mt-1 ${isSelected ? 'text-blue-600' : ''}`} />
                      </div>
                    );
                  })}
                </div>

                {/* Execution Action Button */}
                {activeTask.status === 'READY' && (
                  <div className="pt-3 border-t border-slate-100 flex justify-end">
                    <Button
                      onClick={() => void handleExecuteAgent()}
                      disabled={executing}
                      className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold gap-2 px-5"
                    >
                      {executing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-white" />}
                      Execute Multi-Step Plan
                    </Button>
                  </div>
                )}
              </div>

              {/* Observation & Artifacts Subpanels */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="panel-surface p-4 border border-slate-200/80 bg-white">
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2 uppercase tracking-wider">
                    <Terminal className="h-3.5 w-3.5 text-blue-600" />
                    Observation &amp; Output
                  </h4>
                  {selectedStep ? (
                    <div className="mt-2.5 space-y-2">
                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
                        <p className="font-mono font-bold text-slate-900">{selectedStep.tool}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{selectedStep.summary}</p>
                      </div>
                      <pre className="max-h-52 overflow-auto rounded-lg bg-slate-950 p-2.5 text-[11px] font-mono text-emerald-400">
                        {selectedStep.output
                          ? JSON.stringify(selectedStep.output, null, 2)
                          : selectedStep.error
                          ? `Error: ${selectedStep.error}`
                          : 'Step pending execution...'}
                      </pre>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 py-6 text-center">Select any step to view output.</p>
                  )}
                </div>

                <div className="panel-surface p-4 border border-slate-200/80 bg-white">
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2 uppercase tracking-wider">
                    <FileCode2 className="h-3.5 w-3.5 text-purple-600" />
                    Artifacts ({activeTask.artifacts.length})
                  </h4>
                  {activeTask.artifacts.length > 0 ? (
                    <div className="mt-2.5 space-y-2 max-h-52 overflow-y-auto">
                      {activeTask.artifacts.map((art) => (
                        <div
                          key={art.id}
                          className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-slate-50/70"
                        >
                          <div className="min-w-0 pr-2">
                            <p className="text-xs font-bold text-slate-900 truncate">{art.name}</p>
                            <span className="text-[10px] uppercase font-mono text-slate-400">{art.type}</span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const blob = new Blob([JSON.stringify(art.content, null, 2)], {
                                type: 'application/json',
                              });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `${art.id}.json`;
                              a.click();
                            }}
                            className="h-6 text-[11px] px-2 font-medium"
                          >
                            <Download className="h-3 w-3 mr-1" /> Save
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 py-6 text-center">No artifacts produced yet.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Well-mannered empty state when no task is yet formulated */
            <div className="panel-surface p-6 border border-slate-200/80 bg-white rounded-xl text-center flex flex-col items-center justify-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 mb-3 shadow-soft">
                <Sparkles className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Autonomous Task Engine Ready</h3>
              <p className="mt-1 text-xs text-slate-500 max-w-sm">
                Pick a preset above or type an objective to formulate a multi-step execution plan with test generation and failure diagnosis.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 border border-slate-200">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Human in the loop
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 border border-slate-200">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Bounded tools
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 border border-slate-200">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Exportable specs
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Advisory Assistant Chat (5 cols) ── */}
        <div className="xl:col-span-5">
          <section className="panel-surface border border-slate-200/80 overflow-hidden flex flex-col bg-white">
            {/* Chat Header & Context */}
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                  <Bot className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">API Advisory Assistant</h2>
                  <p className="text-[11px] text-slate-500">Instant answers &amp; context diagnosis</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Assistant context"
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 bg-white focus:outline-none focus:border-violet-400 max-w-[170px] truncate"
                  value={contextId}
                  onChange={(e) => setContextId(e.target.value)}
                >
                  <option value="">No execution context</option>
                  {contexts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setMessages([]);
                    setError('');
                  }}
                  className="gap-1 text-xs h-7 px-2.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New
                </Button>
              </div>
            </div>

            {/* Conversation Stream */}
            <div className="flex min-h-[420px] max-h-[580px] flex-col p-4 bg-white overflow-hidden">
              <div className="flex-1 space-y-3.5 overflow-y-auto pr-1">
                {messages.length === 0 ? (
                  <div className="py-12 text-center space-y-3">
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-violet-50 text-violet-600">
                      <Bot className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">How can I assist your APIs?</p>
                      <p className="text-xs text-slate-400 mt-0.5">Ask questions about HTTP codes, payloads, or error traces.</p>
                    </div>
                    <div className="pt-2 flex flex-col gap-1.5 max-w-xs mx-auto">
                      <button
                        type="button"
                        onClick={() => setInput('Explain difference between 401 Unauthorized and 403 Forbidden')}
                        className="text-left text-xs bg-slate-50 hover:bg-violet-50 hover:text-violet-700 p-2 rounded-lg border border-slate-200 text-slate-600 transition-colors"
                      >
                        • Explain 401 vs 403 Forbidden
                      </button>
                      <button
                        type="button"
                        onClick={() => setInput('How to design standard REST error response payloads?')}
                        className="text-left text-xs bg-slate-50 hover:bg-violet-50 hover:text-violet-700 p-2 rounded-lg border border-slate-200 text-slate-600 transition-colors"
                      >
                        • How to design REST error response payloads
                      </button>
                    </div>
                  </div>
                ) : (
                  messages.map((message, index) => (
                    <div
                      key={index}
                      className={
                        message.role === 'user'
                          ? 'ml-auto max-w-[85%] rounded-2xl bg-slate-900 px-3.5 py-2.5 text-xs text-white'
                          : 'max-w-[88%] rounded-2xl bg-violet-50/80 px-3.5 py-2.5 text-xs text-slate-700 border border-violet-100'
                      }
                    >
                      <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                      {message.provider && (
                        <p className="mt-1.5 text-[10px] font-semibold text-violet-700">
                          Provider: {message.provider === 'mock' ? 'Mock/demo (not a live LLM)' : 'Gemini'}
                        </p>
                      )}
                    </div>
                  ))
                )}
                {loading && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-600" />
                    Thinking…
                  </div>
                )}
                {error && (
                  <p role="alert" className="text-xs font-semibold text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-200">
                    {error}
                  </p>
                )}
              </div>

              {/* Chat Input Bar */}
              <div className="mt-3 flex gap-2 pt-3 border-t border-slate-100">
                <textarea
                  aria-label="Assistant message"
                  className="min-h-12 max-h-24 flex-1 rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs focus:bg-white focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-all resize-none"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Ask a question..."
                />
                <Button
                  onClick={() => void send()}
                  disabled={loading || !input.trim()}
                  className="rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold px-3.5 self-end h-10 gap-1.5 shadow-sm text-xs"
                >
                  <Send className="h-3.5 w-3.5" />
                  Send
                </Button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
