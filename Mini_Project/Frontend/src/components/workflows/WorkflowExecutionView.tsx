import { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Trash2,
  XCircle,
} from 'lucide-react';
import type {
  SanitizedWorkflowExecutionResult,
  SanitizedWorkflowStepExecutionResult,
  WorkflowStepStatus,
} from '@/types/workflow.types';
import { maskSecretValue } from '@/types/environment.types';

const statusBadgeStyles: Record<
  WorkflowStepStatus,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  PASSED_EXECUTION: {
    label: 'Passed',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: CheckCircle2,
  },
  FAILED_EXECUTION: {
    label: 'Failed',
    className: 'bg-rose-50 text-rose-700 border-rose-200',
    icon: XCircle,
  },
  ERROR: {
    label: 'Error',
    className: 'bg-red-50 text-red-700 border-red-200',
    icon: AlertCircle,
  },
  SKIPPED: {
    label: 'Skipped',
    className: 'bg-slate-50 text-slate-600 border-slate-200',
    icon: Clock,
  },
  BLOCKED_BY_DEPENDENCY: {
    label: 'Blocked',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: AlertTriangle,
  },
};

interface WorkflowExecutionViewProps {
  result: SanitizedWorkflowExecutionResult;
}

export function WorkflowExecutionView({ result }: WorkflowExecutionViewProps) {
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});

  const toggleReveal = (key: string) => {
    setRevealedSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleStepExpand = (stepId: string) => {
    setExpandedSteps((prev) => ({ ...prev, [stepId]: !prev[stepId] }));
  };

  // Separate regular step results from teardown step results using explicit metadata
  const isTeardownStep = (step: SanitizedWorkflowStepExecutionResult) => Boolean(step.isTeardown);

  const regularStepResults = result.stepResults.filter((s) => !isTeardownStep(s));
  const teardownStepResults = result.stepResults.filter((s) => isTeardownStep(s));

  return (
    <div className="space-y-6">
      {/* Overall Run Status Banner */}
      <div
        className={`rounded-2xl border p-5 shadow-soft ${
          result.status === 'COMPLETED'
            ? 'border-emerald-200 bg-emerald-50/50'
            : result.status === 'PARTIALLY_COMPLETED'
            ? 'border-amber-200 bg-amber-50/50'
            : 'border-rose-200 bg-rose-50/50'
        }`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                  result.status === 'COMPLETED'
                    ? 'bg-emerald-600 text-white'
                    : result.status === 'PARTIALLY_COMPLETED'
                    ? 'bg-amber-600 text-white'
                    : 'bg-rose-600 text-white'
                }`}
              >
                {result.status}
              </span>
              <h2 className="text-lg font-bold text-slate-950">{result.scenarioName}</h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Run completed at {new Date(result.completedAt).toLocaleTimeString()} ({result.durationMs}ms duration)
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-4 text-center text-xs">
            <div className="rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 shadow-sm">
              <p className="font-bold text-slate-900">{result.summary.totalSteps}</p>
              <p className="text-[10px] text-slate-500 uppercase">Steps</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 shadow-sm">
              <p className="font-bold text-emerald-700">{result.summary.passed}</p>
              <p className="text-[10px] text-emerald-600 uppercase">Passed</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 shadow-sm">
              <p className="font-bold text-rose-700">{result.summary.failed}</p>
              <p className="text-[10px] text-rose-600 uppercase">Failed</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 shadow-sm">
              <p className="font-bold text-amber-700">{result.summary.skipped + result.summary.blocked}</p>
              <p className="text-[10px] text-amber-600 uppercase">Skipped</p>
            </div>
          </div>
        </div>
      </div>

      {/* Extracted Runtime Context Summary */}
      {Object.keys(result.finalContext || {}).length > 0 && (
        <section className="panel-surface p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Final Runtime Context &amp; Extracted Variables
          </h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(result.finalContext).map(([key, entry]) => {
              const isSec = entry.isSecret;
              const isRev = Boolean(revealedSecrets[`ctx_${key}`]);
              const rawStr = String(entry.value ?? '');
              return (
                <div
                  key={key}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-mono shadow-sm ${
                    isSec ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-white'
                  }`}
                >
                  <span className="font-semibold text-slate-700">{key}:</span>
                  <span className="text-slate-900">
                    {isSec
                      ? isRev
                        ? rawStr
                        : maskSecretValue('placeholder')
                      : typeof entry.value === 'object'
                      ? JSON.stringify(entry.value)
                      : String(entry.value)}
                  </span>
                  {isSec && (
                    <button
                      type="button"
                      onClick={() => toggleReveal(`ctx_${key}`)}
                      className="text-amber-700 hover:text-amber-900 ml-1"
                      title={isRev ? 'Hide secret' : 'Reveal secret'}
                    >
                      {isRev ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Regular Steps Results List */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-900">Step Execution Results</h3>
        {regularStepResults.map((stepResult, idx) => {
          const badge = statusBadgeStyles[stepResult.status] || statusBadgeStyles.SKIPPED;
          const Icon = badge.icon;
          const isExpanded = Boolean(expandedSteps[stepResult.stepId]);

          return (
            <div
              key={stepResult.stepId}
              className={`rounded-2xl border p-4 shadow-soft transition-all ${
                stepResult.status === 'PASSED_EXECUTION'
                  ? 'border-slate-200 bg-white'
                  : stepResult.status === 'FAILED_EXECUTION' || stepResult.status === 'ERROR'
                  ? 'border-rose-200 bg-rose-50/20'
                  : 'border-slate-200 bg-slate-50/50'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-700">
                    {idx + 1}
                  </span>
                  <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}>
                    <Icon className="h-3.5 w-3.5" />
                    {badge.label}
                  </span>
                  <h4 className="font-semibold text-slate-900 text-sm">{stepResult.stepName}</h4>
                  <span className="font-mono text-xs text-slate-500">
                    {stepResult.request.method} {stepResult.request.url}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>{stepResult.durationMs}ms</span>
                  <button
                    type="button"
                    onClick={() => toggleStepExpand(stepResult.stepId)}
                    className="font-medium text-slate-700 hover:text-slate-950 underline"
                  >
                    {isExpanded ? 'Hide Details' : 'View Details'}
                  </button>
                </div>
              </div>

              {/* Skip / Block Reason Alert */}
              {stepResult.skipReason && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <div>
                    <span className="font-semibold">Execution Blocked: </span>
                    {stepResult.skipReason}
                  </div>
                </div>
              )}

              {/* Step Error Alert */}
              {stepResult.error && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50/80 p-3 text-xs text-rose-900">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
                  <div>
                    <span className="font-semibold">Error [{stepResult.error.type}]: </span>
                    {stepResult.error.message}
                  </div>
                </div>
              )}

              {/* Extracted Variables for this step */}
              {stepResult.extractedVariables && Object.keys(stepResult.extractedVariables).length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-600">Extracted:</span>
                  {Object.entries(stepResult.extractedVariables).map(([varName, val]) => (
                    <span
                      key={varName}
                      className="inline-flex items-center gap-1 rounded-md bg-violet-50 border border-violet-200 px-2 py-0.5 font-mono text-violet-800"
                    >
                      {varName} = {val.isSecret ? '[REDACTED]' : String(val.value)}
                    </span>
                  ))}
                </div>
              )}

              {/* Expanded Payload & Response inspector */}
              {isExpanded && (
                <div className="mt-4 border-t border-slate-100 pt-3 space-y-3">
                  {stepResult.response && (
                    <div>
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
                        <span>Response Body (Status {stepResult.response.status})</span>
                        <span className="text-slate-400 font-normal">{stepResult.response.responseTime}ms</span>
                      </div>
                      <pre className="max-h-48 overflow-y-auto rounded-xl bg-slate-900 p-3 font-mono text-[11px] text-emerald-400">
                        {typeof stepResult.response.body === 'object'
                          ? JSON.stringify(stepResult.response.body, null, 2)
                          : String(stepResult.response.body || '')}
                      </pre>
                    </div>
                  )}

                  {stepResult.request.body && (
                    <div>
                      <span className="text-xs font-semibold text-slate-700 block mb-1">Sanitized Request Body</span>
                      <pre className="max-h-36 overflow-y-auto rounded-xl bg-slate-100 p-3 font-mono text-[11px] text-slate-800">
                        {stepResult.request.body}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Teardown / Cleanup Outcomes Section */}
      {teardownStepResults.length > 0 && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50/40 p-5 shadow-soft space-y-4">
          <div className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-amber-700" />
            <h3 className="text-base font-bold text-amber-950">Teardown &amp; Cleanup Outcomes</h3>
          </div>
          <p className="text-xs text-amber-800">
            Cleanup steps executed in guaranteed post-scenario hooks. Teardown outcomes are reported separately
            without concealing earlier workflow errors.
          </p>

          <div className="space-y-3">
            {teardownStepResults.map((td) => {
              const badge = statusBadgeStyles[td.status] || statusBadgeStyles.SKIPPED;
              const Icon = badge.icon;
              return (
                <div key={td.stepId} className="rounded-xl border border-amber-200 bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}>
                        <Icon className="h-3 w-3" />
                        {badge.label}
                      </span>
                      <span className="font-semibold text-slate-900 text-sm">{td.stepName}</span>
                    </div>
                    <span className="text-xs text-slate-500">{td.durationMs}ms</span>
                  </div>

                  {td.skipReason && (
                    <p className="mt-2 text-xs text-amber-800 font-medium">
                      Teardown notice: {td.skipReason}
                    </p>
                  )}

                  {td.error && (
                    <p className="mt-2 text-xs text-rose-700 font-semibold">
                      Cleanup failure: {td.error.message}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
