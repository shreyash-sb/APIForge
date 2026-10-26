import { useState } from 'react';
import {
  Boxes,
  Check,
  Copy,
  Eye,
  EyeOff,
  Globe,
  Info,
  Lock,
  Plus,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/store/useAppStore';
import { maskSecretValue, type FrontendEnvironmentVariable } from '@/types/environment.types';

const VALID_VAR_NAME_REGEX = /^[a-zA-Z0-9_.-]+$/;

export function EnvironmentsPage() {
  const {
    environments,
    activeEnvironmentId,
    setActiveEnvironmentId,
    createEnvironment,
    updateEnvironment,
    duplicateEnvironment,
    deleteEnvironment,
  } = useAppStore();

  const activeEnv = environments.find((e) => e.id === activeEnvironmentId) || environments[0];

  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string>('');
  const [urlError, setUrlError] = useState<string>('');
  const [varErrors, setVarErrors] = useState<Record<string, string>>({});

  const toggleRevealSecret = (varName: string) => {
    setRevealedSecrets((prev) => ({
      ...prev,
      [varName]: !prev[varName],
    }));
  };

  const handleCopy = async (varName: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(varName);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Fallback
    }
  };

  const handleBaseUrlChange = (newUrl: string) => {
    if (newUrl.trim() !== '') {
      try {
        const parsed = new URL(newUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          setUrlError('Base URL protocol must be HTTP or HTTPS.');
        } else {
          setUrlError('');
        }
      } catch {
        setUrlError('Please enter a valid URL (e.g. https://api.example.com).');
      }
    } else {
      setUrlError('');
    }
    if (activeEnv) {
      updateEnvironment(activeEnv.id, { baseUrl: newUrl });
    }
  };

  const handleAddVariable = () => {
    if (!activeEnv) return;
    let baseName = 'new_var';
    let counter = 1;
    const existingNames = new Set(activeEnv.variables.map((v) => v.name));
    while (existingNames.has(baseName)) {
      baseName = `new_var_${counter++}`;
    }

    const newVar: FrontendEnvironmentVariable = {
      name: baseName,
      value: '',
      isSecret: false,
      enabled: true,
    };
    updateEnvironment(activeEnv.id, {
      variables: [...activeEnv.variables, newVar],
    });
  };

  const handleUpdateVariable = (index: number, updates: Partial<FrontendEnvironmentVariable>) => {
    if (!activeEnv) return;
    const newVars = [...activeEnv.variables];
    const target = { ...newVars[index], ...updates };

    // Validate variable name if name updated
    if (updates.name !== undefined) {
      const trimmed = updates.name.trim();
      const currentErrors = { ...varErrors };
      if (!trimmed) {
        currentErrors[`var_${index}`] = 'Variable name cannot be empty.';
      } else if (!VALID_VAR_NAME_REGEX.test(trimmed)) {
        currentErrors[`var_${index}`] = 'Alphanumeric with ".", "-", "_" only.';
      } else {
        const duplicate = newVars.some((v, i) => i !== index && v.name === trimmed);
        if (duplicate) {
          currentErrors[`var_${index}`] = 'Variable name must be unique.';
        } else {
          delete currentErrors[`var_${index}`];
        }
      }
      setVarErrors(currentErrors);
    }

    newVars[index] = target;
    updateEnvironment(activeEnv.id, { variables: newVars });
  };

  const handleRemoveVariable = (index: number) => {
    if (!activeEnv) return;
    const newVars = activeEnv.variables.filter((_, i) => i !== index);
    const newVarErrors = { ...varErrors };
    delete newVarErrors[`var_${index}`];
    setVarErrors(newVarErrors);
    updateEnvironment(activeEnv.id, { variables: newVars });
  };

  const handleCreateNewProfile = () => {
    createEnvironment({
      name: `Environment ${environments.length + 1}`,
      description: 'Custom environment configuration',
      baseUrl: 'http://localhost:3000',
      variables: [
        { name: 'apiKey', value: '', isSecret: true, enabled: true },
      ],
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner and Security Notice */}
      <section className="panel-surface p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <Boxes className="h-4.5 w-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight text-slate-900">API Environments</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  {environments.length} Profiles
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Configure base URLs, runtime variables, and scoped secrets
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleCreateNewProfile} className="gap-1.5 shadow-soft text-xs h-9">
              <Plus className="h-3.5 w-3.5" />
              New Environment
            </Button>
          </div>
        </div>
      </section>

      {/* Main Workspace: Profile Tabs / Selector and Editor */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
        {/* Profile Sidebar List */}
        <section className="panel-surface flex flex-col p-3.5 lg:col-span-1">
          <h2 className="px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Profiles</h2>
          <div className="mt-2 space-y-1">
            {environments.map((env) => {
              const isActive = activeEnv?.id === env.id;
              return (
                <button
                  key={env.id}
                  type="button"
                  onClick={() => setActiveEnvironmentId(env.id)}
                  className={`group flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                  }`}
                >
                  <div className="flex flex-col truncate pr-2">
                    <span className="truncate font-semibold">{env.name}</span>
                    <span
                      className={`truncate font-mono text-[10px] ${
                        isActive ? 'text-slate-300' : 'text-slate-400'
                      }`}
                    >
                      {env.baseUrl || 'No base URL'}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {env.isDefault && (
                      <span
                        className={`rounded px-1.5 py-0.2 text-[9px] font-bold ${
                          isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        Default
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Active Environment Editor */}
        {activeEnv ? (
          <section className="panel-surface space-y-5 p-4 sm:p-5 lg:col-span-3">
            {/* Environment Details Header */}
            <div className="flex flex-col gap-3 border-b border-slate-200/80 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <Input
                    value={activeEnv.name}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val.trim()) {
                        setNameError('Environment name is required.');
                      } else {
                        setNameError('');
                      }
                      updateEnvironment(activeEnv.id, { name: val });
                    }}
                    className="max-w-xs h-8.5 font-bold text-sm text-slate-950"
                    placeholder="Environment name"
                  />
                  {activeEnv.isDefault && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      Default Environment
                    </span>
                  )}
                </div>
                {nameError && <p className="text-xs text-rose-600">{nameError}</p>}
                <Input
                  value={activeEnv.description || ''}
                  onChange={(e) => updateEnvironment(activeEnv.id, { description: e.target.value })}
                  placeholder="Profile description (optional)"
                  className="mt-1 h-7.5 text-xs text-slate-500"
                />
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => duplicateEnvironment(activeEnv.id)}
                  title="Duplicate this environment profile"
                  className="h-8 gap-1.5 text-xs font-medium"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Duplicate
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={environments.length <= 1}
                  onClick={() => deleteEnvironment(activeEnv.id)}
                  title={
                    environments.length <= 1
                      ? 'Cannot delete the only environment'
                      : 'Delete environment profile'
                  }
                  className="h-8 gap-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </div>

            {/* Base URL Configuration */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <Globe className="h-3.5 w-3.5 text-slate-400" />
                Base URL
              </label>
              <div className="flex items-center gap-2">
                <Input
                  value={activeEnv.baseUrl || ''}
                  onChange={(e) => handleBaseUrlChange(e.target.value)}
                  placeholder="https://api.example.com"
                  className="h-8.5 font-mono text-xs"
                />
              </div>
              {urlError ? (
                <p className="text-xs font-medium text-rose-600">{urlError}</p>
              ) : (
                <p className="text-[11px] text-slate-400">
                  Target base URL substituted into <code className="text-violet-600">{`{{baseUrl}}`}</code> tokens in requests.
                </p>
              )}
            </div>

            {/* Variable Table */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Environment Variables</h3>
                  <p className="text-[11px] text-slate-400">
                    Accessible as <code className="text-violet-600">{`{{varName}}`}</code> across scenario steps.
                  </p>
                </div>
                <Button size="sm" onClick={handleAddVariable} className="h-8 gap-1.5 text-xs font-medium">
                  <Plus className="h-3.5 w-3.5" />
                  Add Variable
                </Button>
              </div>

              {activeEnv.variables.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-slate-400">
                  <Info className="mx-auto h-5 w-5 text-slate-300" />
                  <p className="mt-1.5 text-xs font-semibold text-slate-700">No variables defined yet</p>
                  <p className="text-[11px] text-slate-400">Click "Add Variable" above to configure keys and tokens.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white shadow-soft">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-semibold text-slate-500">
                      <tr>
                        <th className="w-12 px-3 py-2 text-center">Active</th>
                        <th className="px-3 py-2">Variable Name</th>
                        <th className="px-3 py-2">Value</th>
                        <th className="w-24 px-3 py-2 text-center">Secret</th>
                        <th className="w-20 px-3 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeEnv.variables.map((variable, idx) => {
                        const isSecret = Boolean(variable.isSecret);
                        const isRevealed = Boolean(revealedSecrets[variable.name]);
                        const err = varErrors[`var_${idx}`];

                        return (
                          <tr key={idx} className="hover:bg-slate-50/60">
                            {/* Enabled Checkbox */}
                            <td className="px-3 py-2.5 text-center">
                              <input
                                type="checkbox"
                                checked={variable.enabled !== false}
                                onChange={(e) =>
                                  handleUpdateVariable(idx, { enabled: e.target.checked })
                                }
                                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                                title="Toggle variable enabled/disabled"
                              />
                            </td>

                            {/* Variable Name */}
                            <td className="px-3 py-2.5">
                              <Input
                                value={variable.name}
                                onChange={(e) =>
                                  handleUpdateVariable(idx, { name: e.target.value })
                                }
                                placeholder="variable_name"
                                className="h-8 font-mono text-xs"
                              />
                              {err && <p className="mt-1 text-[10px] text-rose-600">{err}</p>}
                            </td>

                            {/* Variable Value */}
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1.5">
                                <Input
                                  type={isSecret && !isRevealed ? 'password' : 'text'}
                                  value={variable.value}
                                  onChange={(e) =>
                                    handleUpdateVariable(idx, { value: e.target.value })
                                  }
                                  placeholder={isSecret ? maskSecretValue('placeholder') : 'Value'}
                                  className="h-8 font-mono text-xs"
                                />
                                {isSecret && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => toggleRevealSecret(variable.name)}
                                    title={isRevealed ? 'Hide secret value' : 'Reveal secret value'}
                                    className="h-8 w-8 text-slate-400 hover:text-slate-600"
                                  >
                                    {isRevealed ? (
                                      <EyeOff className="h-3.5 w-3.5" />
                                    ) : (
                                      <Eye className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                )}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleCopy(variable.name, variable.value)}
                                  title="Copy raw value"
                                  className="h-8 w-8 text-slate-400 hover:text-slate-600"
                                >
                                  {copiedKey === variable.name ? (
                                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </div>
                            </td>

                            {/* Secret Toggle */}
                            <td className="px-3 py-2.5 text-center">
                              <label
                                className={`inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                                  isSecret
                                    ? 'bg-amber-100 text-amber-900'
                                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                }`}
                                title="Mark variable as sensitive secret"
                              >
                                <Lock className="h-3 w-3" />
                                <input
                                  type="checkbox"
                                  checked={isSecret}
                                  onChange={(e) =>
                                    handleUpdateVariable(idx, { isSecret: e.target.checked })
                                  }
                                  className="sr-only"
                                />
                                <span>{isSecret ? 'Secret' : 'Plain'}</span>
                              </label>
                            </td>

                            {/* Actions */}
                            <td className="px-3 py-2.5 text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveVariable(idx)}
                                title="Delete variable"
                                className="h-8 w-8 text-slate-400 hover:text-rose-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
