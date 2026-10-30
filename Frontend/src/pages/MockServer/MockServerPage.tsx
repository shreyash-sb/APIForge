import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Layers,
  Loader2,
  Network,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Sliders,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { downloadJsonFile, exportMockRoutesToOpenApi } from '@/lib/openApiExporter';
import { mockServerService } from '@/services/mockServerService';
import { useAppStore } from '@/store/useAppStore';
import { loadDemoProject } from '@/services/demoProjectService';
import type { HttpMethod } from '@/types/request.types';
import type { MockRequestLog, MockRoute } from '@/types/mockServer.types';

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const methodColors: Record<string, string> = {
  GET: 'bg-sky-50 text-sky-700 border-sky-200',
  POST: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PUT: 'bg-amber-50 text-amber-700 border-amber-200',
  PATCH: 'bg-violet-50 text-violet-700 border-violet-200',
  DELETE: 'bg-rose-50 text-rose-700 border-rose-200',
  HEAD: 'bg-slate-50 text-slate-700 border-slate-200',
  OPTIONS: 'bg-cyan-50 text-cyan-700 border-cyan-200',
};

export function MockServerPage() {
  const navigate = useNavigate();
  const {
    mockRoutes,
    setMockRoutes,
    mockLogs,
    setMockLogs,
    activeSpecification,
    setRequestDraft,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'routes' | 'logs'>('routes');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedBaseUrl, setCopiedBaseUrl] = useState(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('ALL');

  // Edit / Create Route Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formMethod, setFormMethod] = useState<HttpMethod>('GET');
  const [formPath, setFormPath] = useState('');
  const [formStatusCode, setFormStatusCode] = useState(200);
  const [formDelayMs, setFormDelayMs] = useState(0);
  const [formBody, setFormBody] = useState('{\n  "message": "success"\n}');
  const [formDescription, setFormDescription] = useState('');
  const [bodyParseError, setBodyParseError] = useState<string | null>(null);

  // Log Inspection Modal
  const [selectedLog, setSelectedLog] = useState<MockRequestLog | null>(null);

  const apiBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || 'http://localhost:3001';
  const mockBaseUrl = `${apiBase}/api/mock/serve`;

  const loadRoutesAndLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fetchedRoutes, fetchedLogs] = await Promise.all([
        mockServerService.getRoutes(),
        mockServerService.getLogs(),
      ]);
      setMockRoutes(fetchedRoutes);
      setMockLogs(fetchedLogs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to Mock Server');
    } finally {
      setLoading(false);
    }
  }, [setMockRoutes, setMockLogs]);

  useEffect(() => {
    void loadRoutesAndLogs();
  }, [loadRoutesAndLogs]);

  const openCreateModal = () => {
    setEditingRouteId(null);
    setFormName('New Mock Route');
    setFormMethod('GET');
    setFormPath('/api/v1/resource');
    setFormStatusCode(200);
    setFormDelayMs(0);
    setFormBody('{\n  "status": "success",\n  "data": []\n}');
    setFormDescription('Simulated mock endpoint');
    setBodyParseError(null);
    setModalOpen(true);
  };

  const openEditModal = (route: MockRoute) => {
    setEditingRouteId(route.id);
    setFormName(route.name);
    setFormMethod(route.method);
    setFormPath(route.path);
    setFormStatusCode(route.statusCode);
    setFormDelayMs(route.delayMs || 0);
    setFormBody(
      typeof route.body === 'object'
        ? JSON.stringify(route.body, null, 2)
        : String(route.body || '')
    );
    setFormDescription(route.description || '');
    setBodyParseError(null);
    setModalOpen(true);
  };

  const handleSaveRoute = async () => {
    setBodyParseError(null);
    let parsedBody: unknown = formBody;
    try {
      if (formBody.trim().startsWith('{') || formBody.trim().startsWith('[')) {
        parsedBody = JSON.parse(formBody);
      }
    } catch {
      setBodyParseError('Invalid JSON format in response body.');
      return;
    }

    setActionLoading(true);
    try {
      if (editingRouteId) {
        await mockServerService.updateRoute(editingRouteId, {
          name: formName,
          method: formMethod,
          path: formPath,
          statusCode: Number(formStatusCode),
          delayMs: Number(formDelayMs),
          body: parsedBody,
          description: formDescription,
        });
        setSuccessMsg(`Mock route '${formPath}' updated successfully.`);
      } else {
        await mockServerService.createRoute({
          name: formName,
          method: formMethod,
          path: formPath,
          statusCode: Number(formStatusCode),
          delayMs: Number(formDelayMs),
          body: parsedBody,
          description: formDescription,
          enabled: true,
        });
        setSuccessMsg(`Mock route '${formPath}' created successfully.`);
      }
      setModalOpen(false);
      await loadRoutesAndLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save mock route');
    } finally {
      setActionLoading(false);
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  };

  const handleToggleRoute = async (route: MockRoute) => {
    try {
      await mockServerService.updateRoute(route.id, { enabled: !route.enabled });
      setMockRoutes(
        mockRoutes.map((r) => (r.id === route.id ? { ...r, enabled: !r.enabled } : r))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle route status');
    }
  };

  const handleDeleteRoute = async (id: string, path: string) => {
    if (!confirm(`Are you sure you want to delete mock route '${path}'?`)) return;
    try {
      await mockServerService.deleteRoute(id);
      setMockRoutes(mockRoutes.filter((r) => r.id !== id));
      setSuccessMsg(`Mock route '${path}' deleted.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete route');
    }
  };

  const handleGenerateFromSpec = async () => {
    if (!activeSpecification) {
      setError('No OpenAPI specification loaded. Please import a specification first.');
      return;
    }

    setActionLoading(true);
    setError(null);
    try {
      const res = await mockServerService.generateFromSpec(activeSpecification, {
        defaultDelayMs: 20,
        overwriteExisting: false,
      });
      setSuccessMsg(`Generated ${res.generatedCount} mock routes from OpenAPI specification.`);
      await loadRoutesAndLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate mock routes from specification.');
    } finally {
      setActionLoading(false);
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  };

  const handleTestInBuilder = (route: MockRoute) => {
    const resolvedPath = route.path.replace(/:[a-zA-Z0-9_]+/g, '101').replace(/\{[a-zA-Z0-9_]+\}/g, '101');
    setRequestDraft({
      method: route.method,
      url: `${mockBaseUrl}${resolvedPath.startsWith('/') ? '' : '/'}${resolvedPath}`,
      queryParams: [],
      headers: [{ id: crypto.randomUUID(), key: 'Accept', value: 'application/json', enabled: true }],
      body: route.method !== 'GET' && route.method !== 'HEAD' ? '{\n  "test": true\n}' : '',
      auth: { type: 'none' },
    });
    navigate('/request-builder');
  };

  const handleClearLogs = async () => {
    try {
      await mockServerService.clearLogs();
      setMockLogs([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear logs');
    }
  };

  const handleExportOpenApi = () => {
    if (mockRoutes.length === 0) {
      setError('No mock routes available to export. Create or generate mock routes first.');
      return;
    }
    const spec = exportMockRoutesToOpenApi(mockRoutes, {
      title: 'APIForge Mock Server API',
      version: '1.0.0',
      description: 'OpenAPI 3.1 specification generated from active APIForge mock routes',
      serverUrl: mockBaseUrl,
    });
    downloadJsonFile('apiforge-mock-routes-openapi-3.1.json', spec);
    setSuccessMsg('Exported mock routes to OpenAPI 3.1 JSON successfully!');
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const filteredRoutes = mockRoutes.filter((r) => {
    const matchesMethod = methodFilter === 'ALL' || r.method.toUpperCase() === methodFilter;
    const matchesQuery =
      r.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesMethod && matchesQuery;
  });

  return (
    <div className="space-y-5">
      {/* Top Banner & Control Panel */}
      <section className="panel-surface p-4 sm:p-5 border border-slate-200/80 bg-white">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 shadow-sm">
              <Network className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-slate-900">Mock Server Engine</h1>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 border border-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold text-slate-600">Base URL:</span>
                <code className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 select-all">
                  {mockBaseUrl}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(mockBaseUrl);
                    setCopiedBaseUrl(true);
                    setTimeout(() => setCopiedBaseUrl(false), 2000);
                  }}
                  className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold transition-colors"
                >
                  {copiedBaseUrl ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                setActionLoading(true);
                try {
                  const spec = await loadDemoProject('user');
                  const res = await mockServerService.generateFromSpec(spec, { defaultDelayMs: 15, overwriteExisting: false });
                  setSuccessMsg(`Mounted ${res.generatedCount} User Management mock routes.`);
                  await loadRoutesAndLogs();
                } finally {
                  setActionLoading(false);
                  setTimeout(() => setSuccessMsg(null), 4000);
                }
              }}
              disabled={actionLoading}
              className="gap-1.5 bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 text-xs h-8"
              title="1-Click mount User Management mock routes"
            >
              <Users className="h-3.5 w-3.5 text-sky-600" />
              + User Routes
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                setActionLoading(true);
                try {
                  const spec = await loadDemoProject('ecommerce');
                  const res = await mockServerService.generateFromSpec(spec, { defaultDelayMs: 15, overwriteExisting: false });
                  setSuccessMsg(`Mounted ${res.generatedCount} QuickCart E-Commerce mock routes.`);
                  await loadRoutesAndLogs();
                } finally {
                  setActionLoading(false);
                  setTimeout(() => setSuccessMsg(null), 4000);
                }
              }}
              disabled={actionLoading}
              className="gap-1.5 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 text-xs h-8"
              title="1-Click mount QuickCart E-Commerce mock routes"
            >
              <ShoppingBag className="h-3.5 w-3.5 text-emerald-600" />
              + QuickCart Routes
            </Button>
            <Button variant="outline" size="sm" onClick={loadRoutesAndLogs} disabled={loading} className="gap-1.5 text-xs h-8">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportOpenApi}
              disabled={mockRoutes.length === 0}
              className="gap-1.5 bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 text-xs h-8"
              title="Export all mock routes to OpenAPI 3.1 JSON"
            >
              <Download className="h-3.5 w-3.5 text-sky-600" />
              Export OAS 3.1
            </Button>
            {activeSpecification && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateFromSpec}
                disabled={actionLoading}
                className="gap-1.5 bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100 text-xs h-8"
              >
                <Sparkles className="h-3.5 w-3.5 text-violet-600" />
                Generate from OpenAPI Spec
              </Button>
            )}
            <Button onClick={openCreateModal} size="sm" className="gap-1.5 shadow-sm text-xs h-8">
              <Plus className="h-3.5 w-3.5" />
              New Mock Route
            </Button>
          </div>
        </div>

        {/* Status Callouts */}
        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
      </section>

      {/* Tabs Navigation & Compact Inline Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('routes')}
            className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold border-b-2 transition-colors -mb-2 ${
              activeTab === 'routes'
                ? 'border-slate-900 text-slate-950'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="h-4 w-4" />
            Mock Routes ({mockRoutes.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold border-b-2 transition-colors -mb-2 ${
              activeTab === 'logs'
                ? 'border-slate-900 text-slate-950'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className="h-4 w-4" />
            Traffic Logs ({mockLogs.length})
          </button>
        </div>

        {activeTab === 'routes' ? (
          <div className="flex items-center gap-2">
            <div className="relative w-48 sm:w-60">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search routes..."
                className="h-8 pl-8 text-xs bg-white border-slate-200"
              />
            </div>
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-sm focus:outline-none"
            >
              <option value="ALL">All Methods</option>
              {HTTP_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        ) : (
          mockLogs.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleClearLogs} className="text-xs text-rose-600 gap-1 hover:bg-rose-50 h-8">
              <Trash2 className="h-3.5 w-3.5" /> Clear Logs
            </Button>
          )
        )}
      </div>

      {/* Tab 1: Mock Routes */}
      {activeTab === 'routes' && (
        <div className="space-y-3">

          {/* Routes Cards List */}
          {filteredRoutes.length > 0 ? (
            <div className="grid gap-3">
              {filteredRoutes.map((route) => (
                <div
                  key={route.id}
                  className={`panel-surface p-4 transition-all flex flex-col md:flex-row md:items-center md:justify-between gap-3 border ${
                    route.enabled ? 'border-slate-200' : 'border-slate-200/60 bg-slate-50/50 opacity-60'
                  }`}
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-bold border ${
                          methodColors[route.method] || 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {route.method}
                      </span>
                      <code className="font-mono text-sm font-semibold text-slate-900 break-all">
                        {route.path}
                      </code>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          route.statusCode >= 200 && route.statusCode < 300
                            ? 'bg-emerald-100 text-emerald-800'
                            : route.statusCode >= 400
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {route.statusCode}
                      </span>
                      {route.delayMs ? (
                        <span className="flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 font-mono">
                          <Clock className="h-3 w-3" /> {route.delayMs}ms
                        </span>
                      ) : null}
                      {route.source === 'OPENAPI' && (
                        <span className="rounded bg-violet-100 text-violet-800 px-1.5 py-0.5 text-[10px] font-semibold">
                          OpenAPI
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-medium truncate">
                      {route.name} {route.description ? `— ${route.description}` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleRoute(route)}
                      className={`text-xs px-2.5 py-1 rounded font-semibold border transition-colors ${
                        route.enabled
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      {route.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                    <Button variant="outline" size="sm" onClick={() => openEditModal(route)} className="text-xs h-7 gap-1">
                      <Sliders className="h-3 w-3" /> Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTestInBuilder(route)}
                      className="text-xs h-7 text-indigo-600 hover:bg-indigo-50 gap-1"
                      title="Open in Request Builder"
                    >
                      <ExternalLink className="h-3 w-3" /> Test
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteRoute(route.id, route.path)}
                      className="text-xs h-7 text-rose-600 hover:bg-rose-50"
                      title="Delete Route"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="panel-surface p-12 text-center text-slate-500 space-y-3 border border-slate-200/80 bg-white">
              <Network className="h-10 w-10 text-slate-300 mx-auto" />
              <h3 className="text-base font-semibold text-slate-900">No Mock Routes Found</h3>
              <p className="text-xs max-w-sm mx-auto">
                {searchQuery
                  ? 'No routes match your current search criteria.'
                  : 'Create a custom mock endpoint or generate routes directly from an OpenAPI spec.'}
              </p>
              <Button onClick={openCreateModal} size="sm" className="mt-2 gap-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" /> Create Route
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Traffic Logs */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          {mockLogs.length > 0 ? (
            <div className="panel-surface overflow-hidden border border-slate-200/80 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-3">Time</th>
                      <th className="p-3">Method</th>
                      <th className="p-3">Path</th>
                      <th className="p-3">Matched Route</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Duration</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {mockLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3 font-mono text-slate-500">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="p-3">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold border ${
                              methodColors[log.method] || 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            {log.method}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-slate-900 font-semibold break-all">
                          {log.path}
                        </td>
                        <td className="p-3 text-slate-600">
                          {log.matchedRouteName ? (
                            <span className="text-indigo-600 font-medium">{log.matchedRouteName}</span>
                          ) : (
                            <span className="text-rose-500 font-medium">No Match (404)</span>
                          )}
                        </td>
                        <td className="p-3">
                          <span
                            className={`rounded px-1.5 py-0.5 font-bold ${
                              log.responseStatus >= 200 && log.responseStatus < 300
                                ? 'bg-emerald-100 text-emerald-800'
                                : log.responseStatus >= 400
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {log.responseStatus}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-slate-500">
                          {log.durationMs}ms
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedLog(log)}
                            className="text-[11px] h-6 px-2 text-indigo-600 hover:bg-indigo-50"
                          >
                            Inspect
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="panel-surface p-12 text-center text-slate-500 space-y-3 border border-slate-200/80 bg-white">
              <Clock className="h-10 w-10 text-slate-300 mx-auto" />
              <h3 className="text-base font-semibold text-slate-900">No Traffic Recorded</h3>
              <p className="text-xs max-w-sm mx-auto">
                Send requests to your mock server endpoints to inspect incoming query params, headers, and payloads here.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Route Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
            aria-label="Close modal overlay"
          />
          <div className="relative w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-950">
              {editingRouteId ? 'Edit Mock Route' : 'Configure New Mock Route'}
            </h3>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Route Name</label>
                  <Input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Route name"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">HTTP Method</label>
                  <select
                    value={formMethod}
                    onChange={(e) => setFormMethod(e.target.value as HttpMethod)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
                  >
                    {HTTP_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Path Pattern</label>
                <Input
                  value={formPath}
                  onChange={(e) => setFormPath(e.target.value)}
                  placeholder="/api/users/:id"
                  className="font-mono text-xs"
                />
                <span className="text-[10px] text-slate-400">
                  Supports dynamic path parameters like <code>:id</code> or <code>&#123;id&#125;</code> and wildcards <code>*</code>.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">HTTP Status Code</label>
                  <Input
                    type="number"
                    value={formStatusCode}
                    onChange={(e) => setFormStatusCode(Number(e.target.value))}
                    placeholder="200"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Simulated Latency (ms)</label>
                  <Input
                    type="number"
                    value={formDelayMs}
                    onChange={(e) => setFormDelayMs(Number(e.target.value))}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-700">Mock Response Body (JSON or Text)</label>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        setFormBody(JSON.stringify(JSON.parse(formBody), null, 2));
                        setBodyParseError(null);
                      } catch {
                        setBodyParseError('Cannot format invalid JSON.');
                      }
                    }}
                    className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    Format JSON
                  </button>
                </div>
                <textarea
                  value={formBody}
                  onChange={(e) => {
                    setFormBody(e.target.value);
                    setBodyParseError(null);
                  }}
                  rows={8}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  placeholder='{\n  "data": "value"\n}'
                />
                {bodyParseError && (
                  <p className="text-[11px] text-rose-600 font-semibold">{bodyParseError}</p>
                )}
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Description (Optional)</label>
                <Input
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Description (optional)"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveRoute} disabled={actionLoading} className="shadow-soft">
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Mock Route'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Log Inspection Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
            onClick={() => setSelectedLog(null)}
            aria-label="Close modal overlay"
          />
          <div className="relative w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-bold border ${
                    methodColors[selectedLog.method] || 'bg-slate-100 text-slate-800'
                  }`}
                >
                  {selectedLog.method}
                </span>
                <span className="font-mono text-sm font-bold text-slate-900">{selectedLog.path}</span>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {new Date(selectedLog.timestamp).toLocaleString()}
              </span>
            </div>

            <div className="space-y-3 text-xs font-mono max-h-[60vh] overflow-y-auto">
              <div>
                <span className="text-slate-400 block mb-1">Matched Route</span>
                <p className="rounded bg-slate-100 p-2 text-slate-800">
                  {selectedLog.matchedRouteName || 'None (404 Fallback)'}
                </p>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Response Status & Latency</span>
                <p className="rounded bg-slate-100 p-2 text-slate-800">
                  Status: <strong>{selectedLog.responseStatus}</strong> · Duration: <strong>{selectedLog.durationMs}ms</strong>
                </p>
              </div>

              {selectedLog.queryParams && Object.keys(selectedLog.queryParams).length > 0 && (
                <div>
                  <span className="text-slate-400 block mb-1">Query Parameters</span>
                  <pre className="rounded bg-slate-100 p-2 text-slate-800 overflow-x-auto">
                    {JSON.stringify(selectedLog.queryParams, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.headers && (
                <div>
                  <span className="text-slate-400 block mb-1">Request Headers</span>
                  <pre className="rounded bg-slate-100 p-2 text-slate-800 overflow-x-auto max-h-32">
                    {JSON.stringify(selectedLog.headers, null, 2)}
                  </pre>
                </div>
              )}

              {Boolean(selectedLog.body) && (
                <div>
                  <span className="text-slate-400 block mb-1">Request Payload</span>
                  <pre className="rounded bg-slate-100 p-2 text-slate-800 overflow-x-auto max-h-40">
                    {typeof selectedLog.body === 'object'
                      ? JSON.stringify(selectedLog.body, null, 2)
                      : String(selectedLog.body)}
                  </pre>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t">
              <Button size="sm" onClick={() => setSelectedLog(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
