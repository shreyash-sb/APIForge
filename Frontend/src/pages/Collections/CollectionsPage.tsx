import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  FileJson,
  FolderKanban,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sliders,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { checkBackendHealth } from "@/services/healthService";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parsePostmanCollection } from "@/lib/curlParser";
import { downloadJsonFile, exportCollectionToOpenApi } from "@/lib/openApiExporter";
import { requestService } from "@/services/requestService";
import { useAppStore } from "@/store/useAppStore";
import type {
  ApiCollection,
  ApiExecutionResult,
  Auth,
  Header,
  HttpMethod,
  QueryParam,
} from "@/types/request.types";

const HTTP_METHODS: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

const methodStyles: Record<string, { bg: string; text: string; border: string }> = {
  GET: { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200" },
  POST: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  PUT: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  PATCH: { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200" },
  DELETE: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
  HEAD: { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-300" },
  OPTIONS: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
};

const blankRequest = (method: HttpMethod = "GET") => ({
  id: crypto.randomUUID(),
  name: "New request",
  method,
  url: "",
  queryParams: [] as QueryParam[],
  headers: (method !== "GET" && method !== "HEAD"
    ? [{ id: crypto.randomUUID(), key: "Content-Type", value: "application/json", enabled: true }]
    : []) as Header[],
  body: method !== "GET" && method !== "HEAD" ? "{\n  \n}" : "",
  auth: { type: "none" as const } as Auth,
});

export function CollectionsPage() {
  const navigate = useNavigate();
  const {
    collections,
    createCollection,
    updateCollection,
    deleteCollection,
    loadCollections,
    setRequestDraft,
  } = useAppStore();

  const [name, setName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Record<string, "body" | "headers" | "params" | "auth">>({});
  const [requestExecutions, setRequestExecutions] = useState<
    Record<string, { loading: boolean; result?: ApiExecutionResult; error?: string }>
  >({});
  const [activeResponseId, setActiveResponseId] = useState<string | null>(null);
  const [runningCollectionId, setRunningCollectionId] = useState<string | null>(null);
  const [suiteStats, setSuiteStats] = useState<Record<string, { total: number; passed: number; failed: number; durationMs: number }>>({});

  // Import Modal State
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [pendingDeleteCollection, setPendingDeleteCollection] = useState<{ id: string; name: string; count: number } | null>(null);
  // Storage label must reflect the backend's real persistence mode.
  const [storageMode, setStorageMode] = useState<"connected" | "in-memory" | undefined>();
  useEffect(() => {
    let active = true;
    void checkBackendHealth().then((health) => {
      if (active) setStorageMode(health.database);
    });
    return () => {
      active = false;
    };
  }, []);
  const [importJsonText, setImportJsonText] = useState("");
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    void loadCollections();
  }, [loadCollections]);

  // Filtered collections
  const filteredCollections = useMemo(() => {
    if (!searchQuery.trim()) return collections;
    const q = searchQuery.toLowerCase();
    return collections.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.requests.some(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.url.toLowerCase().includes(q) ||
            r.method.toLowerCase().includes(q)
        )
    );
  }, [collections, searchQuery]);

  // Execute a single request
  const executeSingle = async (request: ApiCollection["requests"][number]) => {
    if (!request.url.trim()) {
      setRequestExecutions((prev) => ({
        ...prev,
        [request.id]: { loading: false, error: "Please enter a valid URL." },
      }));
      return;
    }

    setRequestExecutions((prev) => ({
      ...prev,
      [request.id]: { loading: true, error: undefined },
    }));

    try {
      const res = await requestService.executeRequest({
        method: request.method,
        url: request.url,
        queryParams: request.queryParams || [],
        headers: request.headers || [],
        body: request.body || "",
        auth: request.auth || { type: "none" },
      });

      setRequestExecutions((prev) => ({
        ...prev,
        [request.id]: { loading: false, result: res },
      }));
    } catch (err: unknown) {
      setRequestExecutions((prev) => ({
        ...prev,
        [request.id]: {
          loading: false,
          error: (err as Error).message || "Request execution failed",
        },
      }));
    }
  };

  // Run Collection Suite (Sequential Runner)
  const runSuite = async (collection: ApiCollection) => {
    if (collection.requests.length === 0) return;
    setRunningCollectionId(collection.id);

    let passed = 0;
    let failed = 0;
    let totalDuration = 0;

    for (const req of collection.requests) {
      if (!req.url.trim()) {
        failed++;
        continue;
      }
      setRequestExecutions((prev) => ({
        ...prev,
        [req.id]: { loading: true },
      }));

      try {
        const res = await requestService.executeRequest({
          method: req.method,
          url: req.url,
          queryParams: req.queryParams || [],
          headers: req.headers || [],
          body: req.body || "",
          auth: req.auth || { type: "none" },
        });

        const isSuccess = res.success && res.status >= 200 && res.status < 400;
        if (isSuccess) passed++;
        else failed++;

        if (res.success && res.responseTime) {
          totalDuration += res.responseTime;
        }

        setRequestExecutions((prev) => ({
          ...prev,
          [req.id]: { loading: false, result: res },
        }));
      } catch {
        failed++;
        setRequestExecutions((prev) => ({
          ...prev,
          [req.id]: { loading: false, error: "Failed to dispatch request." },
        }));
      }
    }

    setSuiteStats((prev) => ({
      ...prev,
      [collection.id]: {
        total: collection.requests.length,
        passed,
        failed,
        durationMs: totalDuration,
      },
    }));
    setRunningCollectionId(null);
  };

  // Open in Request Builder
  const openInBuilder = (req: ApiCollection["requests"][number]) => {
    setRequestDraft({
      method: req.method,
      url: req.url,
      queryParams: req.queryParams || [],
      headers: req.headers || [],
      body: req.body || "",
      auth: req.auth || { type: "none" },
    });
    navigate("/request-builder");
  };

  // Duplicate Request
  const duplicateRequest = (collectionId: string, req: ApiCollection["requests"][number]) => {
    const col = collections.find((c) => c.id === collectionId);
    if (!col) return;
    const clone = {
      ...req,
      id: crypto.randomUUID(),
      name: `${req.name} (Copy)`,
      queryParams: req.queryParams ? [...req.queryParams] : [],
      headers: req.headers ? [...req.headers] : [],
    };
    updateCollection(collectionId, {
      requests: [...col.requests, clone],
    });
  };

  // Duplicate Collection
  const duplicateCollection = (col: ApiCollection) => {
    const newName = `${col.name} (Copy)`;
    const newId = createCollection(newName);
    const clonedRequests = col.requests.map((r) => ({
      ...r,
      id: crypto.randomUUID(),
    }));
    updateCollection(newId, {
      requests: clonedRequests,
    });
  };

  // Export Full Collection JSON
  const exportCollectionJson = (col: ApiCollection) => {
    const filename = `${(col.name || "collection")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_")}-collection.json`;
    downloadJsonFile(filename, col);
  };

  // Handle Import JSON (Postman or APIForge)
  const handleImport = () => {
    setImportError(null);
    setImportFeedback(null);

    if (!importJsonText.trim()) {
      setImportError("Please paste collection JSON to import.");
      return;
    }

    try {
      const parsed = JSON.parse(importJsonText);

      // Check if Postman Collection v2.1
      if (parsed.info?._postman_id || parsed.info?.schema?.includes("postman")) {
        const postmanItems = parsePostmanCollection(importJsonText);
        if (postmanItems.length === 0) {
          setImportError("Could not extract any requests from this Postman collection.");
          return;
        }

        const colName = parsed.info?.name || "Imported Postman Collection";
        const newColId = createCollection(colName);
        const requests = postmanItems.map((p) => ({
          id: crypto.randomUUID(),
          name: p.name,
          method: p.method,
          url: p.url,
          queryParams: [] as QueryParam[],
          headers: (p.headers || []).map((h) => ({
            id: h.id || crypto.randomUUID(),
            key: h.key,
            value: h.value,
            enabled: h.enabled ?? true,
          })),
          body: p.body || "",
          auth: { type: "none" as const } as Auth,
        }));

        updateCollection(newColId, { requests });
        setIsImportOpen(false);
        setImportJsonText("");
        setImportFeedback(`Imported "${colName}" with ${requests.length} request(s) from Postman.`);
        return;
      }

      // Check if APIForge Collection format
      if (parsed.name && Array.isArray(parsed.requests)) {
        const newColId = createCollection(parsed.name || "Imported Collection");
        const requests = parsed.requests.map((r: any) => ({
          ...blankRequest(),
          ...r,
          id: crypto.randomUUID(),
        }));
        updateCollection(newColId, { requests });
        setIsImportOpen(false);
        setImportJsonText("");
        setImportFeedback(`Imported "${parsed.name}" with ${requests.length} request(s).`);
        return;
      }

      setImportError("Unrecognized collection format. Please provide Postman v2.1 or APIForge JSON.");
    } catch {
      setImportError("Invalid JSON syntax. Please verify the JSON string.");
    }
  };

  return (
    <div className="space-y-5">
      <ConfirmDialog
        open={Boolean(pendingDeleteCollection)}
        title="Delete collection?"
        message={<>
          <strong className="text-slate-900">{pendingDeleteCollection?.name}</strong> and its {pendingDeleteCollection?.count ?? 0} saved request(s) will be permanently deleted.
        </>}
        confirmLabel="Delete collection"
        destructive
        onCancel={() => setPendingDeleteCollection(null)}
        onConfirm={() => {
          if (pendingDeleteCollection) deleteCollection(pendingDeleteCollection.id);
          setPendingDeleteCollection(null);
        }}
      />
      {importFeedback && (
        <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-700">
          <span>{importFeedback}</span>
          <button type="button" className="shrink-0 font-semibold hover:underline" onClick={() => setImportFeedback(null)}>
            Dismiss
          </button>
        </div>
      )}
      {/* ── Top Header & Actions ── */}
      <div className="panel-surface p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold tracking-tight text-slate-900">API Collections</h2>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
              {collections.length} {collections.length === 1 ? "collection" : "collections"}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Organize, run, and export full REST API test suites with custom methods, headers, and payloads
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              aria-label="Filter collections"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter collections..."
              className="h-8 w-44 sm:w-52 pl-8 bg-white text-xs"
            />
          </div>

          {/* Import Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsImportOpen(true)}
            className="gap-1.5 font-medium border-slate-200 hover:bg-slate-50"
          >
            <Upload className="h-3.5 w-3.5 text-slate-600" />
            Import
          </Button>

          {/* New Collection Input & Button */}
          <div className="flex items-center gap-1.5">
            <Input
              aria-label="Collection name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New collection name"
              className="h-8 w-44 sm:w-52 bg-white text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  createCollection(name);
                  setName("");
                }
              }}
            />
            <Button
              size="sm"
              className="shrink-0 gap-1.5 font-medium"
              onClick={() => {
                if (name.trim()) {
                  createCollection(name);
                  setName("");
                }
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Create
            </Button>
          </div>
        </div>
      </div>

      {/* ── Empty State ── */}
      {filteredCollections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200/80 bg-white/50 p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <FolderKanban className="h-6 w-6" />
          </div>
          <h3 className="mt-3 text-sm font-bold text-slate-900">
            {searchQuery ? "No matching collections" : "No saved collections yet"}
          </h3>
          <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
            {searchQuery
              ? "Try adjusting your search query or clear the filter."
              : "Create a collection above or import an existing Postman collection to start testing."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCollections.map((collection) => {
            const isSuiteRunning = runningCollectionId === collection.id;
            const stats = suiteStats[collection.id];

            return (
              <section
                key={collection.id}
                className="panel-surface p-4 sm:p-5 border border-slate-200/80 rounded-xl bg-white shadow-sm transition-all"
              >
                {/* ── Collection Header Bar ── */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
                  <div className="flex flex-1 min-w-[240px] items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                      <FolderKanban className="h-4 w-4" />
                    </div>
                    <Input
                      aria-label={`Collection ${collection.name}`}
                      value={collection.name}
                      onChange={(e) => updateCollection(collection.id, { name: e.target.value })}
                      className="h-8 max-w-sm text-sm font-bold text-slate-900 border-transparent hover:border-slate-200 focus:border-slate-300"
                    />
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                      {collection.requests.length} {collection.requests.length === 1 ? "endpoint" : "endpoints"}
                    </span>

                    {/* Suite Results Pill */}
                    {stats && (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold flex items-center gap-1 ${
                          stats.failed === 0
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}
                      >
                        {stats.failed === 0 ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <AlertCircle className="h-3 w-3" />
                        )}
                        {stats.passed}/{stats.total} Passed ({stats.durationMs}ms)
                      </span>
                    )}
                  </div>

                  {/* Actions Right */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Run Suite Button */}
                    <Button
                      size="sm"
                      disabled={isSuiteRunning || collection.requests.length === 0}
                      onClick={() => runSuite(collection)}
                      title="Run all endpoints in this collection sequentially"
                    >
                      {isSuiteRunning ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                      {isSuiteRunning ? "Running Suite..." : "Run Collection"}
                    </Button>

                    {/* Duplicate Collection */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => duplicateCollection(collection)}
                      className="gap-1 font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                      title="Duplicate this collection"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Clone
                    </Button>

                    {/* Export OAS 3.1 */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const spec = exportCollectionToOpenApi(collection);
                        downloadJsonFile(
                          `${(collection.name || "collection")
                            .toLowerCase()
                            .replace(/[^a-z0-9_-]/g, "_")}-openapi-3.1.json`,
                          spec
                        );
                      }}
                      className="gap-1"
                      title="Export collection as OpenAPI 3.1 JSON"
                    >
                      <Download className="h-3.5 w-3.5" />
                      OAS 3.1
                    </Button>

                    {/* Export JSON */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => exportCollectionJson(collection)}
                      className="gap-1 font-medium border-slate-200 text-slate-700 hover:bg-slate-50"
                      title="Export full collection in APIForge JSON format"
                    >
                      <FileJson className="h-3.5 w-3.5 text-slate-600" />
                      JSON
                    </Button>

                    {/* Delete Collection */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPendingDeleteCollection({ id: collection.id, name: collection.name, count: collection.requests.length })}
                      className="gap-1 font-medium text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      title="Delete this collection"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* ── Requests List ── */}
                <div className="mt-3.5 space-y-3">
                  {collection.requests.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400 bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
                      No endpoints in this collection yet. Click "Add Request" below to begin.
                    </div>
                  ) : (
                    collection.requests.map((request, index) => {
                      const isExpanded = expandedRequestId === request.id;
                      const exec = requestExecutions[request.id];
                      const currentTab = activeTab[request.id] || "body";

                      return (
                        <div
                          key={request.id}
                          className="rounded-lg border border-slate-200/90 bg-white p-2.5 transition-all shadow-sm hover:border-slate-300"
                        >
                          {/* Row: Method Selector + Name + URL + Actions */}
                          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                            {/* HTTP Method Dropdown */}
                            <select
                              aria-label={`Request ${index + 1} method`}
                              value={request.method}
                              onChange={(e) => {
                                const newMethod = e.target.value as HttpMethod;
                                updateCollection(collection.id, {
                                  requests: collection.requests.map((item) =>
                                    item.id === request.id
                                      ? {
                                          ...item,
                                          method: newMethod,
                                          headers:
                                            newMethod !== "GET" &&
                                            newMethod !== "HEAD" &&
                                            (!item.headers || item.headers.length === 0)
                                              ? [
                                                  {
                                                    id: crypto.randomUUID(),
                                                    key: "Content-Type",
                                                    value: "application/json",
                                                    enabled: true,
                                                  },
                                                ]
                                              : item.headers,
                                          body:
                                            newMethod !== "GET" &&
                                            newMethod !== "HEAD" &&
                                            !item.body
                                              ? "{\n  \n}"
                                              : item.body,
                                        }
                                      : item
                                  ),
                                });
                              }}
                              className={`h-8 w-24 shrink-0 rounded-md px-2 text-xs font-bold uppercase tracking-wider border cursor-pointer outline-none transition-colors ${
                                methodStyles[request.method]?.bg || "bg-slate-50"
                              } ${methodStyles[request.method]?.text || "text-slate-700"} ${
                                methodStyles[request.method]?.border || "border-slate-200"
                              }`}
                            >
                              {HTTP_METHODS.map((m) => (
                                <option key={m} value={m} className="bg-white text-slate-800 font-medium">
                                  {m}
                                </option>
                              ))}
                            </select>

                            {/* Request Name */}
                            <Input
                              aria-label={`Request ${index + 1} name`}
                              value={request.name}
                              placeholder="Request Name"
                              className="h-8 w-full sm:w-44 shrink-0 text-xs font-medium"
                              onChange={(e) =>
                                updateCollection(collection.id, {
                                  requests: collection.requests.map((item) =>
                                    item.id === request.id ? { ...item, name: e.target.value } : item
                                  ),
                                })
                              }
                            />

                            {/* Request URL */}
                            <Input
                              aria-label={`Request ${index + 1} URL`}
                              value={request.url}
                              placeholder="https://api.example.com/v1/resource"
                              className="h-8 flex-1 min-w-[200px] font-mono text-xs"
                              onChange={(e) =>
                                updateCollection(collection.id, {
                                  requests: collection.requests.map((item) =>
                                    item.id === request.id ? { ...item, url: e.target.value } : item
                                  ),
                                })
                              }
                            />

                            {/* Result Indicator Badge */}
                            {exec?.loading && (
                              <span className="shrink-0 flex items-center gap-1 text-[11px] font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded">
                                <RefreshCw className="h-3 w-3 animate-spin" />
                                Sending...
                              </span>
                            )}

                            {!exec?.loading && exec?.result && (
                              <button
                                type="button"
                                onClick={() =>
                                  setActiveResponseId(
                                    activeResponseId === request.id ? null : request.id
                                  )
                                }
                                className={`shrink-0 flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded border transition-all ${
                                  exec.result.success &&
                                  exec.result.status >= 200 &&
                                  exec.result.status < 400
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                    : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                                }`}
                                title="Click to inspect response preview"
                              >
                                {exec.result.success ? (
                                  <>
                                    <span>{exec.result.status}</span>
                                    <span className="font-normal">
                                      ({exec.result.responseTime}ms)
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <AlertCircle className="h-3 w-3" />
                                    <span>Failed</span>
                                  </>
                                )}
                              </button>
                            )}

                            {!exec?.loading && exec?.error && (
                              <span className="shrink-0 text-[11px] font-medium text-rose-600 bg-rose-50 px-2 py-1 rounded border border-rose-200">
                                {exec.error}
                              </span>
                            )}

                            {/* Row Action Buttons */}
                            <div className="flex items-center gap-1 shrink-0">
                              {/* Quick Send Button */}
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={exec?.loading}
                                onClick={() => executeSingle(request)}
                                className="px-2.5 gap-1 font-semibold bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 disabled:opacity-50"
                                title="Send request immediately"
                              >
                                <Send className="h-3 w-3 text-emerald-600" />
                                Send
                              </Button>

                              {/* Open in Builder */}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openInBuilder(request)}
                                className="px-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                                title="Open in Request Builder"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>

                              {/* Duplicate Request */}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => duplicateRequest(collection.id, request)}
                                className="px-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                                title="Duplicate request"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>

                              {/* Toggle Configuration Drawer */}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setExpandedRequestId(isExpanded ? null : request.id)
                                }
                                className={`h-8 px-2 ${
                                  isExpanded
                                    ? "bg-slate-100 text-slate-900"
                                    : "text-slate-500 hover:bg-slate-100"
                                }`}
                                title="Configure Headers, Body, Params, and Auth"
                              >
                                <Sliders className="h-3.5 w-3.5" />
                                {isExpanded ? (
                                  <ChevronUp className="h-3 w-3 ml-0.5" />
                                ) : (
                                  <ChevronDown className="h-3 w-3 ml-0.5" />
                                )}
                              </Button>

                              {/* Delete Request */}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-[34px] p-0 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                onClick={() =>
                                  updateCollection(collection.id, {
                                    requests: collection.requests.filter(
                                      (item) => item.id !== request.id
                                    ),
                                  })
                                }
                                title="Delete request"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>

                          {/* ── Expandable Config Drawer (Body / Headers / Params / Auth) ── */}
                          {isExpanded && (
                            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs">
                              {/* Drawer Tabs */}
                              <div className="flex items-center gap-2 border-b border-slate-200 pb-2 mb-3">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setActiveTab((prev) => ({ ...prev, [request.id]: "body" }))
                                  }
                                  className={`px-2.5 py-1 rounded font-medium transition-all ${
                                    currentTab === "body"
                                      ? "bg-white text-blue-600 shadow-sm border border-slate-200"
                                      : "text-slate-600 hover:text-slate-900"
                                  }`}
                                >
                                  Request Body{" "}
                                  {request.body && request.body.trim() && (
                                    <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />
                                  )}
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setActiveTab((prev) => ({ ...prev, [request.id]: "headers" }))
                                  }
                                  className={`px-2.5 py-1 rounded font-medium transition-all ${
                                    currentTab === "headers"
                                      ? "bg-white text-blue-600 shadow-sm border border-slate-200"
                                      : "text-slate-600 hover:text-slate-900"
                                  }`}
                                >
                                  Headers ({(request.headers || []).length})
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setActiveTab((prev) => ({ ...prev, [request.id]: "params" }))
                                  }
                                  className={`px-2.5 py-1 rounded font-medium transition-all ${
                                    currentTab === "params"
                                      ? "bg-white text-blue-600 shadow-sm border border-slate-200"
                                      : "text-slate-600 hover:text-slate-900"
                                  }`}
                                >
                                  Params ({(request.queryParams || []).length})
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setActiveTab((prev) => ({ ...prev, [request.id]: "auth" }))
                                  }
                                  className={`px-2.5 py-1 rounded font-medium transition-all ${
                                    currentTab === "auth"
                                      ? "bg-white text-blue-600 shadow-sm border border-slate-200"
                                      : "text-slate-600 hover:text-slate-900"
                                  }`}
                                >
                                  Auth ({request.auth?.type || "none"})
                                </button>
                              </div>

                              {/* TAB 1: Body Tab */}
                              {currentTab === "body" && (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                                    <span>Raw JSON Payload:</span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        try {
                                          const beautified = JSON.stringify(
                                            JSON.parse(request.body || "{}"),
                                            null,
                                            2
                                          );
                                          updateCollection(collection.id, {
                                            requests: collection.requests.map((item) =>
                                              item.id === request.id
                                                ? { ...item, body: beautified }
                                                : item
                                            ),
                                          });
                                        } catch {
                                          // Keep raw text if invalid JSON
                                        }
                                      }}
                                      className="h-6 px-2 text-[11px] text-slate-600 hover:bg-slate-200"
                                    >
                                      Format JSON
                                    </Button>
                                  </div>
                                  <textarea
                                    value={request.body || ""}
                                    onChange={(e) =>
                                      updateCollection(collection.id, {
                                        requests: collection.requests.map((item) =>
                                          item.id === request.id
                                            ? { ...item, body: e.target.value }
                                            : item
                                        ),
                                      })
                                    }
                                    placeholder='{\n  "key": "value"\n}'
                                    rows={5}
                                    className="w-full rounded-md border border-slate-300 bg-white p-2.5 font-mono text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  />
                                </div>
                              )}

                              {/* TAB 2: Headers Tab */}
                              {currentTab === "headers" && (
                                <div className="space-y-2">
                                  {(request.headers || []).map((header, hIdx) => (
                                    <div key={header.id || hIdx} className="flex items-center gap-2">
                                      <Input
                                        placeholder="Header key (e.g. Authorization)"
                                        value={header.key}
                                        onChange={(e) => {
                                          const updated = [...(request.headers || [])];
                                          updated[hIdx] = { ...header, key: e.target.value };
                                          updateCollection(collection.id, {
                                            requests: collection.requests.map((item) =>
                                              item.id === request.id
                                                ? { ...item, headers: updated }
                                                : item
                                            ),
                                          });
                                        }}
                                        className="h-7 text-xs bg-white flex-1"
                                      />
                                      <Input
                                        placeholder="Header value"
                                        value={header.value}
                                        onChange={(e) => {
                                          const updated = [...(request.headers || [])];
                                          updated[hIdx] = { ...header, value: e.target.value };
                                          updateCollection(collection.id, {
                                            requests: collection.requests.map((item) =>
                                              item.id === request.id
                                                ? { ...item, headers: updated }
                                                : item
                                            ),
                                          });
                                        }}
                                        className="h-7 text-xs bg-white flex-1 font-mono"
                                      />
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                          const updated = (request.headers || []).filter(
                                            (_, idx) => idx !== hIdx
                                          );
                                          updateCollection(collection.id, {
                                            requests: collection.requests.map((item) =>
                                              item.id === request.id
                                                ? { ...item, headers: updated }
                                                : item
                                            ),
                                          });
                                        }}
                                        className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  ))}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      const newHeader = {
                                        id: crypto.randomUUID(),
                                        key: "",
                                        value: "",
                                        enabled: true,
                                      };
                                      updateCollection(collection.id, {
                                        requests: collection.requests.map((item) =>
                                          item.id === request.id
                                            ? {
                                                ...item,
                                                headers: [...(item.headers || []), newHeader],
                                              }
                                            : item
                                        ),
                                      });
                                    }}
                                    className="h-6 text-[11px] font-medium"
                                  >
                                    <Plus className="h-3 w-3 mr-1" />
                                    Add Header
                                  </Button>
                                </div>
                              )}

                              {/* TAB 3: Query Params Tab */}
                              {currentTab === "params" && (
                                <div className="space-y-2">
                                  {(request.queryParams || []).map((param, pIdx) => (
                                    <div key={param.key || pIdx} className="flex items-center gap-2">
                                      <Input
                                        placeholder="Param key (e.g. page)"
                                        value={param.key}
                                        onChange={(e) => {
                                          const updated = [...(request.queryParams || [])];
                                          updated[pIdx] = { ...param, key: e.target.value };
                                          updateCollection(collection.id, {
                                            requests: collection.requests.map((item) =>
                                              item.id === request.id
                                                ? { ...item, queryParams: updated }
                                                : item
                                            ),
                                          });
                                        }}
                                        className="h-7 text-xs bg-white flex-1"
                                      />
                                      <Input
                                        placeholder="Param value (e.g. 1)"
                                        value={param.value}
                                        onChange={(e) => {
                                          const updated = [...(request.queryParams || [])];
                                          updated[pIdx] = { ...param, value: e.target.value };
                                          updateCollection(collection.id, {
                                            requests: collection.requests.map((item) =>
                                              item.id === request.id
                                                ? { ...item, queryParams: updated }
                                                : item
                                            ),
                                          });
                                        }}
                                        className="h-7 text-xs bg-white flex-1 font-mono"
                                      />
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                          const updated = (request.queryParams || []).filter(
                                            (_, idx) => idx !== pIdx
                                          );
                                          updateCollection(collection.id, {
                                            requests: collection.requests.map((item) =>
                                              item.id === request.id
                                                ? { ...item, queryParams: updated }
                                                : item
                                            ),
                                          });
                                        }}
                                        className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  ))}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      const newParam: QueryParam = {
                                        id: crypto.randomUUID(),
                                        key: "",
                                        value: "",
                                        enabled: true,
                                      };
                                      updateCollection(collection.id, {
                                        requests: collection.requests.map((item) =>
                                          item.id === request.id
                                            ? {
                                                ...item,
                                                queryParams: [
                                                  ...(item.queryParams || []),
                                                  newParam,
                                                ],
                                              }
                                            : item
                                        ),
                                      });
                                    }}
                                    className="h-6 text-[11px] font-medium"
                                  >
                                    <Plus className="h-3 w-3 mr-1" />
                                    Add Parameter
                                  </Button>
                                </div>
                              )}

                              {/* TAB 4: Auth Tab */}
                              {currentTab === "auth" && (
                                <div className="space-y-3">
                                  <div className="flex items-center gap-3">
                                    <label className="text-[11px] font-medium text-slate-600">
                                      Auth Type:
                                    </label>
                                    <select
                                      value={request.auth?.type || "none"}
                                      onChange={(e) => {
                                        const t = e.target.value;
                                        let newAuth: Auth = { type: "none" };
                                        if (t === "bearer") newAuth = { type: "bearer", token: "" };
                                        else if (t === "apikey")
                                          newAuth = {
                                            type: "apikey",
                                            key: "x-api-key",
                                            value: "",
                                            addTo: "header",
                                          };
                                        updateCollection(collection.id, {
                                          requests: collection.requests.map((item) =>
                                            item.id === request.id
                                              ? { ...item, auth: newAuth }
                                              : item
                                          ),
                                        });
                                      }}
                                      className="h-7 rounded border border-slate-300 bg-white px-2 text-xs"
                                    >
                                      <option value="none">No Auth</option>
                                      <option value="bearer">Bearer Token</option>
                                      <option value="apikey">API Key</option>
                                    </select>
                                  </div>

                                  {request.auth?.type === "bearer" && (
                                    <div>
                                      <label className="text-[11px] text-slate-500 mb-1 block">
                                        Bearer Token:
                                      </label>
                                      <Input
                                        placeholder="Paste JWT / Token"
                                        value={request.auth.token}
                                        onChange={(e) => {
                                          updateCollection(collection.id, {
                                            requests: collection.requests.map((item) =>
                                              item.id === request.id
                                                ? {
                                                    ...item,
                                                    auth: { type: "bearer", token: e.target.value },
                                                  }
                                                : item
                                            ),
                                          });
                                        }}
                                        className="h-7 text-xs bg-white font-mono"
                                      />
                                    </div>
                                  )}

                                  {request.auth?.type === "apikey" && (
                                    <div className="flex gap-2">
                                      <Input
                                        placeholder="Key (e.g. x-api-key)"
                                        value={request.auth.key}
                                        onChange={(e) => {
                                          const prevAuth = request.auth as any;
                                          updateCollection(collection.id, {
                                            requests: collection.requests.map((item) =>
                                              item.id === request.id
                                                ? {
                                                    ...item,
                                                    auth: { ...prevAuth, key: e.target.value },
                                                  }
                                                : item
                                            ),
                                          });
                                        }}
                                        className="h-7 text-xs bg-white flex-1"
                                      />
                                      <Input
                                        placeholder="Value"
                                        value={request.auth.value}
                                        onChange={(e) => {
                                          const prevAuth = request.auth as any;
                                          updateCollection(collection.id, {
                                            requests: collection.requests.map((item) =>
                                              item.id === request.id
                                                ? { ...item, auth: { ...prevAuth, value: e.target.value } }
                                                : item
                                            ),
                                          });
                                        }}
                                        className="h-7 text-xs bg-white flex-1 font-mono"
                                      />
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* ── Response Preview Drawer ── */}
                          {activeResponseId === request.id && exec?.result && (
                            <div className="mt-2.5 rounded-lg border border-slate-200 bg-slate-900 text-slate-100 p-3 text-xs">
                              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-emerald-400">
                                    {exec.result.success
                                      ? `${exec.result.status} ${exec.result.statusText}`
                                      : "Execution Error"}
                                  </span>
                                  {exec.result.success && (
                                    <span className="text-[11px] text-slate-400">
                                      {exec.result.responseTime}ms
                                    </span>
                                  )}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setActiveResponseId(null)}
                                  className="h-6 w-6 p-0 text-slate-400 hover:text-white hover:bg-slate-800"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                              <pre className="max-h-48 overflow-auto font-mono text-[11px] text-slate-300 whitespace-pre-wrap">
                                {exec.result.success
                                  ? typeof exec.result.body === "object"
                                    ? JSON.stringify(exec.result.body, null, 2)
                                    : String(exec.result.body)
                                  : JSON.stringify(exec.result.error, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* ── Bottom Actions ── */}
                <div className="mt-3.5 border-t border-slate-100 pt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="font-medium gap-1.5 hover:bg-slate-50"
                      onClick={() =>
                        updateCollection(collection.id, {
                          requests: [...collection.requests, blankRequest("GET")],
                        })
                      }
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add GET
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="font-medium gap-1.5 hover:bg-slate-50"
                      onClick={() =>
                        updateCollection(collection.id, {
                          requests: [...collection.requests, blankRequest("POST")],
                        })
                      }
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add POST
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="font-medium gap-1.5 hover:bg-slate-50"
                      onClick={() =>
                        updateCollection(collection.id, {
                          requests: [...collection.requests, blankRequest("PUT")],
                        })
                      }
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add PUT
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="font-medium gap-1.5 hover:bg-slate-50"
                      onClick={() =>
                        updateCollection(collection.id, {
                          requests: [...collection.requests, blankRequest("DELETE")],
                        })
                      }
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add DELETE
                    </Button>
                  </div>

                  <span className="text-[11px] text-slate-400">
                    {storageMode === "connected"
                      ? "Auto-saved to MongoDB"
                      : storageMode === "in-memory"
                        ? "Saved in server memory (resets on backend restart)"
                        : "Auto-saved"}
                  </span>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* ── IMPORT MODAL (Postman / APIForge JSON) ── */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sheet">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Upload className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Import Collection</h3>
                  <p className="text-[11px] text-slate-500">
                    Paste Postman Collection v2.1 or APIForge JSON export
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsImportOpen(false);
                  setImportError(null);
                  setImportJsonText("");
                }}
                className="h-7 w-7 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Collection JSON Data:
                </label>
                <textarea
                  aria-label="Collection JSON"
                  value={importJsonText}
                  onChange={(e) => {
                    setImportJsonText(e.target.value);
                    setImportError(null);
                  }}
                  placeholder='Paste JSON here, e.g. {"info": { "name": "My API" }, "item": [...] }'
                  rows={8}
                  className="w-full rounded-lg border border-slate-300 p-3 font-mono text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {importError && (
                <div role="alert" className="flex items-center gap-1.5 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                  <span>{importError}</span>
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsImportOpen(false);
                  setImportError(null);
                  setImportJsonText("");
                }}
               
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleImport}
                className="font-medium"
              >
                Import Collection
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
