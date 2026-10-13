import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Eye,
  Layers,
  Loader2,
  Play,
  Plus,
  ShieldCheck,
  Trash2,
  Workflow,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WorkflowStepCard } from '@/components/workflows/WorkflowStepCard';
import { WorkflowExecutionView } from '@/components/workflows/WorkflowExecutionView';
import { workflowService, WorkflowApiError } from '@/services/workflowService';
import { useAppStore } from '@/store/useAppStore';
import type { WorkflowStep } from '@/types/workflow.types';

export function WorkflowsPage() {
  const {
    workflows,
    activeWorkflowId,
    setActiveWorkflowId,
    createWorkflow,
    updateWorkflow,
    duplicateWorkflow,
    deleteWorkflow,
    environments,
    activeEnvironmentId,
    setActiveEnvironmentId,
    workflowExecutionResult,
    setWorkflowExecutionResult,
    workflowExecutionRunning,
    setWorkflowExecutionRunning,
    workflowExecutionError,
    setWorkflowExecutionError,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'editor' | 'results'>('editor');
  const [validationResult, setValidationResult] = useState<{ valid: boolean; errors: string[] } | null>(null);
  const [validating, setValidating] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewData, setPreviewData] = useState<{
    url: string;
    auth: string;
    body?: string;
    variables: string[];
  } | null>(null);

  const activeWorkflow = workflows.find((w) => w.id === activeWorkflowId) || workflows[0];
  const activeEnv = environments.find((e) => e.id === activeEnvironmentId) || environments[0];

  const currentExecutionResult =
    workflowExecutionResult && activeWorkflow && workflowExecutionResult.scenarioId === activeWorkflow.id
      ? workflowExecutionResult
      : undefined;

  const handleScenarioChange = (newId: string) => {
    setValidationResult(null);
    setActiveWorkflowId(newId);
  };

  const handleValidate = async () => {
    if (!activeWorkflow) return;
    setValidating(true);
    setValidationResult(null);
    try {
      const res = await workflowService.validateWorkflow(activeWorkflow);
      setValidationResult(res);
    } catch (err) {
      setValidationResult({
        valid: false,
        errors: [err instanceof WorkflowApiError ? err.message : 'Validation failed'],
      });
    } finally {
      setValidating(false);
    }
  };

  const handleRunWorkflow = async () => {
    if (!activeWorkflow || workflowExecutionRunning) return;
    setWorkflowExecutionRunning(true);
    setWorkflowExecutionError(undefined);
    try {
      const result = await workflowService.executeWorkflow(activeWorkflow, activeEnv);
      setWorkflowExecutionResult(result);
      setActiveTab('results');
    } catch (err) {
      const msg = err instanceof WorkflowApiError ? err.message : 'Workflow execution failed';
      setWorkflowExecutionError(msg);
    } finally {
      setWorkflowExecutionRunning(false);
    }
  };

  const handleAddStep = () => {
    if (!activeWorkflow) return;
    const newStepIndex = activeWorkflow.steps.length + 1;
    const newStep: WorkflowStep = {
      id: `step_${crypto.randomUUID().slice(0, 6)}`,
      name: `Step ${newStepIndex}`,
      enabled: true,
      request: {
        method: 'GET',
        url: '{{baseUrl}}/api/v1/resource',
        headers: [{ id: crypto.randomUUID(), key: 'Accept', value: 'application/json', enabled: true }],
        queryParams: [],
        auth: { type: 'none' },
      },
      extractors: [],
    };
    updateWorkflow(activeWorkflow.id, {
      steps: [...activeWorkflow.steps, newStep],
    });
  };

  const handleUpdateStep = (stepId: string, updates: Partial<WorkflowStep>) => {
    if (!activeWorkflow) return;
    const steps = activeWorkflow.steps.map((s) => (s.id === stepId ? { ...s, ...updates } : s));
    updateWorkflow(activeWorkflow.id, { steps });
  };

  const handleRemoveStep = (stepId: string) => {
    if (!activeWorkflow) return;
    const steps = activeWorkflow.steps.filter((s) => s.id !== stepId);
    updateWorkflow(activeWorkflow.id, { steps });
  };

  const handleMoveStep = (fromIndex: number, toIndex: number) => {
    if (!activeWorkflow) return;
    if (toIndex < 0 || toIndex >= activeWorkflow.steps.length) return;
    const steps = [...activeWorkflow.steps];
    const [moved] = steps.splice(fromIndex, 1);
    steps.splice(toIndex, 0, moved);
    updateWorkflow(activeWorkflow.id, { steps });
  };

  const handleCreateNewWorkflow = () => {
    createWorkflow({
      name: `New Workflow ${workflows.length + 1}`,
      description: 'Custom multi-step automated scenario',
      steps: [
        {
          id: `step_${crypto.randomUUID().slice(0, 6)}`,
          name: 'Initial Request',
          enabled: true,
          request: {
            method: 'GET',
            url: '{{baseUrl}}/health',
            headers: [],
            queryParams: [],
            auth: { type: 'none' },
          },
        },
      ],
    });
  };

  const handlePreviewStep = async (step: WorkflowStep) => {
    try {
      const res = await workflowService.previewRequest(step.request, activeEnv);
      setPreviewData({
        url: res.sanitizedRequest.url,
        auth: res.sanitizedRequest.auth.description,
        body: res.sanitizedRequest.body || undefined,
        variables: res.resolvedVariables,
      });
      setPreviewModalOpen(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Preview failed');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Scenario Action Controls */}
      <section className="panel-surface p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
              <Workflow className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-slate-950">Workflows</h1>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                  {workflows.length} Scenarios
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Multi-step API orchestration with variable chaining, conditional execution, and cleanup teardowns.
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={handleValidate}
              disabled={validating || !activeWorkflow}
              className="gap-2"
            >
              {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Validate
            </Button>

            <Button
              onClick={handleRunWorkflow}
              disabled={workflowExecutionRunning || !activeWorkflow || activeWorkflow.steps.length === 0}
              className="gap-2 shadow-soft bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {workflowExecutionRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running Scenario…
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run Workflow
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Validation Error/Success Callout */}
        {validationResult && (
          <div
            className={`mt-4 rounded-xl border p-3 text-xs ${
              validationResult.valid
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              {validationResult.valid ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Workflow scenario definition is structurally valid and ready for execution.
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-rose-600" />
                  Scenario pre-validation detected issues:
                </>
              )}
            </div>
            {!validationResult.valid && (
              <ul className="mt-1.5 list-disc pl-5 space-y-0.5">
                {validationResult.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Execution Error Banner */}
        {workflowExecutionError && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <div>
              <span className="font-semibold">Execution Dispatch Failed: </span>
              {workflowExecutionError}
            </div>
          </div>
        )}
      </section>

      {/* Workflow Controls: Scenario Selector & Environment Selector */}
      <section className="panel-surface p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold uppercase text-slate-400">Scenario:</span>
          <select
            value={activeWorkflow?.id}
            onChange={(e) => handleScenarioChange(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
          >
            {workflows.map((wf) => (
              <option key={wf.id} value={wf.id}>
                {wf.name} ({wf.steps.length} steps)
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={handleCreateNewWorkflow} className="gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" /> New Scenario
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => activeWorkflow && duplicateWorkflow(activeWorkflow.id)}
            className="gap-1 text-xs text-slate-500"
          >
            <Copy className="h-3.5 w-3.5" /> Duplicate
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={workflows.length <= 1}
            onClick={() => activeWorkflow && deleteWorkflow(activeWorkflow.id)}
            className="gap-1 text-xs text-rose-600 hover:bg-rose-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>

        {/* Target Environment Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase text-slate-400">Environment:</span>
          <select
            value={activeEnvironmentId}
            onChange={(e) => setActiveEnvironmentId(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
          >
            {environments.map((env) => (
              <option key={env.id} value={env.id}>
                {env.name} ({env.baseUrl || 'no base URL'})
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Main Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('editor')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'editor'
              ? 'border-slate-900 text-slate-950'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="h-4 w-4" />
          Step Editor ({activeWorkflow?.steps.length || 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('results')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'results'
              ? 'border-slate-900 text-slate-950'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Play className="h-4 w-4" />
          Execution Results {currentExecutionResult ? `(${currentExecutionResult.status})` : ''}
        </button>
      </div>

      {/* Tab 1: Step Editor */}
      {activeTab === 'editor' && activeWorkflow && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Input
                value={activeWorkflow.name}
                onChange={(e) => updateWorkflow(activeWorkflow.id, { name: e.target.value })}
                className="font-bold text-lg text-slate-950 max-w-md"
                placeholder="Workflow Scenario Name"
              />
              <Input
                value={activeWorkflow.description || ''}
                onChange={(e) => updateWorkflow(activeWorkflow.id, { description: e.target.value })}
                placeholder="Scenario description"
                className="text-xs text-slate-500 max-w-xl"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">
                {activeWorkflow.steps.length} / 50 steps
              </span>
              <Button onClick={handleAddStep} size="sm" className="gap-1.5 shadow-soft">
                <Plus className="h-4 w-4" /> Add Step
              </Button>
            </div>
          </div>

          {/* Ordered Step Cards */}
          <div className="space-y-4">
            {activeWorkflow.steps.map((step, idx) => (
              <div key={step.id} className="relative group">
                <WorkflowStepCard
                  step={step}
                  index={idx}
                  totalSteps={activeWorkflow.steps.length}
                  allSteps={activeWorkflow.steps}
                  onUpdate={(updates) => handleUpdateStep(step.id, updates)}
                  onRemove={() => handleRemoveStep(step.id)}
                  onMoveUp={() => handleMoveStep(idx, idx - 1)}
                  onMoveDown={() => handleMoveStep(idx, idx + 1)}
                />
                <div className="mt-1 flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePreviewStep(step)}
                    className="text-[11px] text-slate-500 hover:text-slate-900 gap-1"
                  >
                    <Eye className="h-3 w-3" /> Preview Resolved Request
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Execution Results */}
      {activeTab === 'results' && (
        <div>
          {currentExecutionResult ? (
            <WorkflowExecutionView result={currentExecutionResult} />
          ) : (
            <div className="panel-surface p-12 text-center text-slate-500 space-y-3">
              <Workflow className="h-10 w-10 text-slate-300 mx-auto" />
              <h3 className="text-base font-semibold text-slate-900">No Run Results Yet</h3>
              <p className="text-xs max-w-sm mx-auto">
                Click "Run Workflow" in the top bar to execute this scenario against the active environment.
              </p>
              <Button onClick={handleRunWorkflow} size="sm" className="mt-2 gap-1.5">
                <Play className="h-3.5 w-3.5" /> Run Scenario
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Request Preview Modal Overlay */}
      {previewModalOpen && previewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
            onClick={() => setPreviewModalOpen(false)}
            aria-label="Close preview overlay"
          />
          <div className="relative w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Request Interpolation Preview</h3>
            <p className="text-xs text-slate-500">
              Resolved safely against the current environment without executing network traffic.
            </p>

            <div className="space-y-3 text-xs font-mono">
              <div>
                <span className="text-slate-400 block mb-1">Target URL</span>
                <p className="rounded-lg bg-slate-100 p-2.5 text-slate-900 break-all">{previewData.url}</p>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Auth Scheme</span>
                <p className="rounded-lg bg-slate-100 p-2.5 text-slate-900">{previewData.auth}</p>
              </div>

              {previewData.body && (
                <div>
                  <span className="text-slate-400 block mb-1">Sanitized Body</span>
                  <pre className="rounded-lg bg-slate-100 p-2.5 text-slate-900 overflow-x-auto max-h-40">
                    {previewData.body}
                  </pre>
                </div>
              )}

              <div>
                <span className="text-slate-400 block mb-1">Resolved Variables</span>
                <div className="flex flex-wrap gap-1.5">
                  {previewData.variables.map((v) => (
                    <span key={v} className="rounded bg-violet-100 text-violet-800 px-2 py-0.5">
                      {v}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button size="sm" onClick={() => setPreviewModalOpen(false)}>
                Close Preview
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
