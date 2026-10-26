import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Lock,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { HttpMethod } from '@/types/request.types';
import type { ResponseExtractor, WorkflowStep } from '@/types/workflow.types';

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const methodColors: Record<string, string> = {
  GET: 'bg-sky-100 text-sky-800 border-sky-200',
  POST: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  PUT: 'bg-amber-100 text-amber-800 border-amber-200',
  PATCH: 'bg-violet-100 text-violet-800 border-violet-200',
  DELETE: 'bg-rose-100 text-rose-800 border-rose-200',
  HEAD: 'bg-slate-100 text-slate-800 border-slate-200',
  OPTIONS: 'bg-indigo-100 text-indigo-800 border-indigo-200',
};

interface WorkflowStepCardProps {
  step: WorkflowStep;
  index: number;
  totalSteps: number;
  allSteps: WorkflowStep[];
  onUpdate: (updates: Partial<WorkflowStep>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export function WorkflowStepCard({
  step,
  index,
  totalSteps,
  allSteps,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: WorkflowStepCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<'params' | 'headers' | 'body' | 'extractors' | 'dependencies'>('params');

  // Candidate prerequisite steps (excluding self)
  const candidatePrerequisites = allSteps.filter((s) => s.id !== step.id && !s.isTeardown);

  const handleAddExtractor = () => {
    const newExt: ResponseExtractor = {
      targetVariable: `extracted_${(step.extractors?.length || 0) + 1}`,
      source: 'BODY_JSONPATH',
      path: '$.data.id',
      isSecret: false,
    };
    onUpdate({ extractors: [...(step.extractors || []), newExt] });
  };

  const handleUpdateExtractor = (extIndex: number, updates: Partial<ResponseExtractor>) => {
    const list = [...(step.extractors || [])];
    list[extIndex] = { ...list[extIndex], ...updates };
    onUpdate({ extractors: list });
  };

  const handleRemoveExtractor = (extIndex: number) => {
    const list = (step.extractors || []).filter((_, i) => i !== extIndex);
    onUpdate({ extractors: list });
  };

  const toggleDependency = (depId: string) => {
    const current = step.dependsOn || [];
    if (current.includes(depId)) {
      onUpdate({ dependsOn: current.filter((id) => id !== depId) });
    } else {
      onUpdate({ dependsOn: [...current, depId] });
    }
  };

  return (
    <div
      className={`rounded-2xl border transition-all ${
        step.isTeardown
          ? 'border-amber-300 bg-amber-50/20 shadow-sm'
          : step.enabled
          ? 'border-slate-200/90 bg-white shadow-soft'
          : 'border-slate-200 bg-slate-50/60 opacity-75'
      }`}
    >
      {/* Step Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-700">
            {index + 1}
          </span>

          <input
            type="checkbox"
            checked={step.enabled}
            onChange={(e) => onUpdate({ enabled: e.target.checked })}
            className="h-4.5 w-4.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
            title="Toggle step enabled/disabled"
          />

          <div className="flex items-center gap-2">
            <select
              value={step.request.method}
              onChange={(e) =>
                onUpdate({
                  request: { ...step.request, method: e.target.value as HttpMethod },
                })
              }
              className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${
                methodColors[step.request.method] || 'bg-slate-100 text-slate-800'
              }`}
            >
              {HTTP_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <Input
              value={step.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              className="h-9 w-52 sm:w-64 font-semibold text-slate-900 text-sm"
              placeholder="Step Name"
            />
          </div>

          {step.isTeardown && (
            <span className="rounded-full bg-amber-100 border border-amber-300 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-amber-800">
              Teardown / Cleanup
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            disabled={index === 0}
            onClick={onMoveUp}
            title="Move step up"
            className="h-8 w-8 text-slate-400 hover:text-slate-700"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={index === totalSteps - 1}
            onClick={onMoveDown}
            title="Move step down"
            className="h-8 w-8 text-slate-400 hover:text-slate-700"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            title="Delete step"
            className="h-8 w-8 text-slate-400 hover:text-rose-600"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setExpanded(!expanded)}
            title={expanded ? 'Collapse step' : 'Expand step'}
            className="h-8 w-8 text-slate-400"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="p-4 sm:p-5 space-y-4">
          {/* Target URL */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 w-12">URL</span>
            <Input
              value={step.request.url}
              onChange={(e) =>
                onUpdate({
                  request: { ...step.request, url: e.target.value },
                })
              }
              placeholder="{{baseUrl}}/api/v1/resource/{{id}}"
              className="font-mono text-xs sm:text-sm h-9 flex-1"
            />
          </div>

          {/* Subtabs Header */}
          <div className="flex items-center gap-1 border-b border-slate-100 text-xs sm:text-sm">
            <button
              type="button"
              onClick={() => setActiveTab('params')}
              className={`px-3.5 py-2 font-medium border-b-2 transition-colors ${
                activeTab === 'params'
                  ? 'border-slate-900 text-slate-900 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              Query Params ({step.request.queryParams?.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('headers')}
              className={`px-3.5 py-2 font-medium border-b-2 transition-colors ${
                activeTab === 'headers'
                  ? 'border-slate-900 text-slate-900 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              Headers ({step.request.headers?.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('body')}
              className={`px-3 py-1.5 font-medium border-b-2 transition-colors ${
                activeTab === 'body'
                  ? 'border-slate-900 text-slate-900 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              Body
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('extractors')}
              className={`px-3 py-1.5 font-medium border-b-2 transition-colors ${
                activeTab === 'extractors'
                  ? 'border-slate-900 text-slate-900 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              Extractors ({step.extractors?.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('dependencies')}
              className={`px-3 py-1.5 font-medium border-b-2 transition-colors ${
                activeTab === 'dependencies'
                  ? 'border-slate-900 text-slate-900 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              Dependencies &amp; Flags ({step.dependsOn?.length || 0})
            </button>
          </div>

          {/* Subtab Contents */}
          {activeTab === 'params' && (
            <div className="space-y-2">
              {(step.request.queryParams || []).map((param, pIdx) => (
                <div key={pIdx} className="flex items-center gap-2">
                  <Input
                    value={param.key}
                    onChange={(e) => {
                      const qp = [...(step.request.queryParams || [])];
                      qp[pIdx] = { ...qp[pIdx], key: e.target.value };
                      onUpdate({ request: { ...step.request, queryParams: qp } });
                    }}
                    placeholder="Key"
                    className="h-8 text-xs font-mono w-1/3"
                  />
                  <Input
                    value={param.value}
                    onChange={(e) => {
                      const qp = [...(step.request.queryParams || [])];
                      qp[pIdx] = { ...qp[pIdx], value: e.target.value };
                      onUpdate({ request: { ...step.request, queryParams: qp } });
                    }}
                    placeholder="Value or {{id}}"
                    className="h-8 text-xs font-mono flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const qp = (step.request.queryParams || []).filter((_, i) => i !== pIdx);
                      onUpdate({ request: { ...step.request, queryParams: qp } });
                    }}
                    className="h-8 w-8 text-slate-400 hover:text-rose-600"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const qp = [...(step.request.queryParams || []), { id: crypto.randomUUID(), key: '', value: '', enabled: true }];
                  onUpdate({ request: { ...step.request, queryParams: qp } });
                }}
                className="gap-1.5 text-xs"
              >
                <Plus className="h-3.5 w-3.5" /> Add Param
              </Button>
            </div>
          )}

          {activeTab === 'headers' && (
            <div className="space-y-2">
              {(step.request.headers || []).map((header, hIdx) => (
                <div key={hIdx} className="flex items-center gap-2">
                  <Input
                    value={header.key}
                    onChange={(e) => {
                      const hdrs = [...(step.request.headers || [])];
                      hdrs[hIdx] = { ...hdrs[hIdx], key: e.target.value };
                      onUpdate({ request: { ...step.request, headers: hdrs } });
                    }}
                    placeholder="Header"
                    className="h-8 text-xs font-mono w-1/3"
                  />
                  <Input
                    value={header.value}
                    onChange={(e) => {
                      const hdrs = [...(step.request.headers || [])];
                      hdrs[hIdx] = { ...hdrs[hIdx], value: e.target.value };
                      onUpdate({ request: { ...step.request, headers: hdrs } });
                    }}
                    placeholder="Value or {{token}}"
                    className="h-8 text-xs font-mono flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const hdrs = (step.request.headers || []).filter((_, i) => i !== hIdx);
                      onUpdate({ request: { ...step.request, headers: hdrs } });
                    }}
                    className="h-8 w-8 text-slate-400 hover:text-rose-600"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const hdrs = [...(step.request.headers || []), { id: crypto.randomUUID(), key: '', value: '', enabled: true }];
                  onUpdate({ request: { ...step.request, headers: hdrs } });
                }}
                className="gap-1.5 text-xs"
              >
                <Plus className="h-3.5 w-3.5" /> Add Header
              </Button>
            </div>
          )}

          {activeTab === 'body' && (
            <div className="space-y-2">
              <textarea
                value={step.request.body || ''}
                onChange={(e) =>
                  onUpdate({
                    request: { ...step.request, body: e.target.value },
                  })
                }
                rows={5}
                placeholder='{\n  "name": "Jane",\n  "token": "{{sessionToken}}"\n}'
                className="w-full rounded-xl border border-slate-200 p-3 font-mono text-xs focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
              <p className="text-[11px] text-slate-400">
                JSON bodies support native variable interpolation for strings, numbers, and booleans.
              </p>
            </div>
          )}

          {activeTab === 'extractors' && (
            <div className="space-y-3">
              {(step.extractors || []).map((ext, eIdx) => (
                <div
                  key={eIdx}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/50 p-2.5 text-xs"
                >
                  <Input
                    value={ext.targetVariable}
                    onChange={(e) => handleUpdateExtractor(eIdx, { targetVariable: e.target.value })}
                    placeholder="targetVariable"
                    className="h-8 text-xs font-mono w-36"
                  />
                  <select
                    value={ext.source}
                    onChange={(e) =>
                      handleUpdateExtractor(eIdx, { source: e.target.value as ResponseExtractor['source'] })
                    }
                    className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
                  >
                    <option value="BODY_JSONPATH">JSONPath Body</option>
                    <option value="HEADER">Header</option>
                    <option value="STATUS_CODE">Status Code</option>
                  </select>
                  {ext.source !== 'STATUS_CODE' && (
                    <Input
                      value={ext.path || ''}
                      onChange={(e) => handleUpdateExtractor(eIdx, { path: e.target.value })}
                      placeholder={ext.source === 'BODY_JSONPATH' ? '$.data.id' : 'Header-Name'}
                      className="h-8 text-xs font-mono flex-1 min-w-[120px]"
                    />
                  )}
                  <label
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs cursor-pointer font-medium ${
                      ext.isSecret ? 'bg-amber-100 text-amber-900' : 'bg-slate-200/70 text-slate-600'
                    }`}
                    title="Mark extracted value as secret"
                  >
                    <Lock className="h-3 w-3" />
                    <input
                      type="checkbox"
                      checked={Boolean(ext.isSecret)}
                      onChange={(e) => handleUpdateExtractor(eIdx, { isSecret: e.target.checked })}
                      className="sr-only"
                    />
                    <span>Secret</span>
                  </label>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveExtractor(eIdx)}
                    className="h-8 w-8 text-slate-400 hover:text-rose-600"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={handleAddExtractor} className="gap-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" /> Add Response Extractor
              </Button>
            </div>
          )}

          {activeTab === 'dependencies' && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-slate-700 mb-2">Prerequisite Steps (dependsOn):</p>
                {candidatePrerequisites.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No prior eligible steps to depend on.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {candidatePrerequisites.map((p) => {
                      const isDep = (step.dependsOn || []).includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => toggleDependency(p.id)}
                          className={`rounded-lg px-2.5 py-1 text-xs font-medium border transition-colors ${
                            isDep
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {p.name || p.id}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-slate-100 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(step.isTeardown)}
                    onChange={(e) => onUpdate({ isTeardown: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="font-semibold text-slate-800">Execute as Teardown/Cleanup step</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(step.continueOnValidationFailure)}
                    onChange={(e) => onUpdate({ continueOnValidationFailure: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <span className="text-slate-700">Continue dependent steps even if contract validation fails</span>
                </label>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
