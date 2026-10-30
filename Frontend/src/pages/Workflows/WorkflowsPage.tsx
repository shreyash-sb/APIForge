import { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FileUp,
  Layers,
  Loader2,
  Play,
  Plus,
  ShieldCheck,
  Trash2,
  Workflow,
  Users,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WorkflowStepCard } from '@/components/workflows/WorkflowStepCard';
import { WorkflowExecutionView } from '@/components/workflows/WorkflowExecutionView';
import { workflowService, WorkflowApiError } from '@/services/workflowService';
import { useAppStore, defaultWorkflows } from '@/store/useAppStore';
import type { WorkflowStep } from '@/types/workflow.types';

export function WorkflowsPage() {
  const {
    workflows,
    setWorkflows,
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

  const loadUserManagementDemo = () => {
    setValidationResult(null);
    const existing = workflows.find((w) => w.id === 'wf-user-management-demo');
    if (existing) {
      setActiveWorkflowId(existing.id);
    } else {
      const demo = defaultWorkflows.find((w) => w.id === 'wf-user-management-demo');
      if (demo) {
        setWorkflows([...workflows, demo]);
        setActiveWorkflowId(demo.id);
      }
    }
  };

  const loadEcommerceDemo = () => {
    setValidationResult(null);
    const existing = workflows.find((w) => w.id === 'wf-ecommerce-checkout-demo');
    if (existing) {
      setActiveWorkflowId(existing.id);
    } else {
      const demo = defaultWorkflows.find((w) => w.id === 'wf-ecommerce-checkout-demo');
      if (demo) {
        setWorkflows([...workflows, demo]);
        setActiveWorkflowId(demo.id);
      }
    }
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

  const workflowInputRef = useRef<HTMLInputElement>(null);

  const handleImportWorkflowFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed && Array.isArray(parsed.steps)) {
        const newId = createWorkflow({
          name: parsed.name || file.name.replace(/\.json$/i, ''),
          description: parsed.description || 'Imported workflow scenario',
          steps: parsed.steps,
        });
        setActiveWorkflowId(newId);
      } else {
        alert('Invalid workflow file. Expected a JSON object with a "steps" array.');
      }
    } catch (err) {
      alert('Failed to parse workflow JSON: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      if (workflowInputRef.current) workflowInputRef.current.value = '';
    }
  };

  const handleExportWorkflow = () => {
    if (!activeWorkflow) return;
    const blob = new Blob([JSON.stringify(activeWorkflow, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeWorkflow.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}-workflow.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <input
        ref={workflowInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImportWorkflowFile}
      />
      {/* Unified Workflow Header & Scenario Controls */}
      <section className="panel-surface p-5 sm:p-6 border border-slate-200/80 bg-white space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100/70 text-violet-700 shadow-sm">
              <Workflow className="h-5.5 w-5.5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold tracking-tight text-slate-900">API Workflows</h1>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                  {workflows.length} Scenarios
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Multi-step API orchestration with automated variable chaining, data extractors, and assertions
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={handleValidate}
              disabled={validating || !activeWorkflow}
              className="gap-1.5 text-xs sm:text-sm font-semibold h-9 px-3.5"
            >
              {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Validate
            </Button>

            <Button
              size="sm"
              onClick={handleRunWorkflow}
              disabled={workflowExecutionRunning || !activeWorkflow || activeWorkflow.steps.length === 0}
              className="gap-2 shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold h-9 px-4"
            >
              {workflowExecutionRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running…
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

        {/* Scenario & Target Environment Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3.5 pt-4 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Scenario:</span>
            <select
              value={activeWorkflow?.id}
              onChange={(e) => handleScenarioChange(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-800 shadow-xs focus:border-violet-500 focus:outline-none"
            >
              {workflows.map((wf) => (
                <option key={wf.id} value={wf.id}>
                  {wf.name} ({wf.steps.length} steps)
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={loadUserManagementDemo}
              className="gap-1.5 text-xs font-semibold h-8.5 px-3 border-sky-200 text-sky-800 bg-sky-50 hover:bg-sky-100 rounded-xl"
              title="Load User Management Lifecycle Workflow (Aarav Patil)"
            >
              <Users className="h-3.5 w-3.5 text-sky-600" />
              User Lifecycle
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={loadEcommerceDemo}
              className="gap-1.5 text-xs font-semibold h-8.5 px-3 border-emerald-200 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-xl"
              title="Load QuickCart E-Commerce Order Checkout Workflow"
            >
              <ShoppingBag className="h-3.5 w-3.5 text-emerald-600" />
              QuickCart Checkout
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreateNewWorkflow}
              className="gap-1.5 text-xs font-semibold h-8.5 px-3"
            >
              <Plus className="h-3.5 w-3.5" /> New Scenario
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => workflowInputRef.current?.click()}
              className="gap-1.5 text-xs font-semibold h-8.5 px-3 border-violet-200 text-violet-700 bg-violet-50 hover:bg-violet-100"
              title="Import a workflow scenario from a JSON file (e.g. from demo folder)"
            >
              <FileUp className="h-3.5 w-3.5" /> Import JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportWorkflow}
              className="gap-1.5 text-xs font-semibold text-slate-600 h-8.5 px-3"
              title="Export current workflow scenario as JSON"
            >
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => activeWorkflow && duplicateWorkflow(activeWorkflow.id)}
              className="gap-1.5 text-xs font-semibold text-slate-600 h-8.5 px-3"
            >
              <Copy className="h-3.5 w-3.5" /> Duplicate
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={workflows.length <= 1}
              onClick={() => activeWorkflow && deleteWorkflow(activeWorkflow.id)}
              className="gap-1.5 text-xs font-semibold text-rose-600 border-rose-200 hover:bg-rose-50 h-8.5 px-3"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Target Environment:</span>
            <select
              value={activeEnvironmentId}
              onChange={(e) => setActiveEnvironmentId(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-800 shadow-xs focus:border-violet-500 focus:outline-none"
            >
              {environments.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.name} ({env.variables.length} vars)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Validation Error/Success Callout */}
        {validationResult && (
          <div
            className={`mt-2 rounded-xl border p-3 text-xs ${
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
          <div className="mt-2 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <div>
              <span className="font-semibold">Execution Dispatch Failed: </span>
              {workflowExecutionError}
            </div>
          </div>
        )}
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
        <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1.5 flex-1">
              <Input
                value={activeWorkflow.name}
                onChange={(e) => updateWorkflow(activeWorkflow.id, { name: e.target.value })}
                className="font-bold text-base sm:text-lg text-slate-950 max-w-md h-10 bg-white"
                placeholder="Workflow name"
              />
              <Input
                value={activeWorkflow.description || ''}
                onChange={(e) => updateWorkflow(activeWorkflow.id, { description: e.target.value })}
                placeholder="Description of this multi-step test scenario"
                className="text-xs sm:text-sm text-slate-600 max-w-xl h-8.5 bg-white"
              />
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs font-semibold text-slate-500 bg-slate-100 rounded-full px-2.5 py-1">
                {activeWorkflow.steps.length} / 50 steps
              </span>
              <Button onClick={handleAddStep} size="sm" className="gap-1.5 shadow-sm h-9 px-3.5 text-xs sm:text-sm font-semibold">
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
