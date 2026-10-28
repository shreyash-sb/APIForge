import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Plus,
  Send,
  Trash2,
  Loader2,
  FileDown,
  Code2,
  Activity,
  Copy,
  Check,
  Radio,
  X,
  RadioTower,
  Play,
  Square,
  FileCode,
  CheckCircle2,
  XCircle,
  FolderKanban,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { requestService } from '@/services/requestService';
import { useAppStore } from '@/store/useAppStore';
import { parseCurlCommand, parsePostmanCollection, type PostmanRequestItem } from '@/lib/curlParser';
import {
  generateCurlSnippet,
  generateFetchSnippet,
  generatePythonSnippet,
  generateGoSnippet,
  generateJavaSnippet,
} from '@/lib/codeGenerators';
import { executeScript, type ScriptAssertionResult } from '@/lib/scriptRunner';
import type {
  HttpMethod,
  QueryParam,
  Header,
  Auth,
  ApiExecutionResult,
} from '@/types/request.types';

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE'];

type TabType = 'params' | 'headers' | 'auth' | 'body' | 'streaming' | 'scripts';
type CodeLang = 'curl' | 'javascript' | 'python' | 'go' | 'java';

interface StreamLog {
  id: string;
  timestamp: string;
  direction: 'IN' | 'OUT' | 'SYS';
  data: string;
}

export function RequestBuilderPage() {
  const {
    requestDraft,
    setRequestDraft,
    recordManualRequestExecution,
    environments,
    activeEnvironmentId,
    collections,
    createCollection,
    updateCollection,
  } = useAppStore();
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [url, setUrl] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('params');
  const [queryParams, setQueryParams] = useState<QueryParam[]>([]);
  const [headers, setHeaders] = useState<Header[]>([]);
  const [auth, setAuth] = useState<Auth>({ type: 'none' });
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ApiExecutionResult | null>(null);
  const [methodDropdownOpen, setMethodDropdownOpen] = useState(false);
  const [responseTab, setResponseTab] = useState<'body' | 'headers' | 'tests'>('body');
  const [bodyError, setBodyError] = useState<string>('');

  // ── Pre-Request & Post-Response Scripts State ──
  const [preRequestScript, setPreRequestScript] = useState('');
  const [postResponseScript, setPostResponseScript] = useState('');
  const [scriptSubTab, setScriptSubTab] = useState<'pre' | 'post'>('post');
  const [scriptAssertions, setScriptAssertions] = useState<ScriptAssertionResult[]>([]);
  const [scriptLogs, setScriptLogs] = useState<string[]>([]);
  const [scriptErrorMessage, setScriptErrorMessage] = useState<string>('');

  // ── Import Modal State ──
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importType, setImportType] = useState<'curl' | 'postman'>('curl');
  const [importRawInput, setImportRawInput] = useState('');
  const [postmanParsedList, setPostmanParsedList] = useState<PostmanRequestItem[]>([]);
  const [importFeedback, setImportFeedback] = useState('');

  // ── Export Code Modal State ──
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [codeLang, setCodeLang] = useState<CodeLang>('curl');
  const [copied, setCopied] = useState(false);

  // ── Save to Collection State ──
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveCollectionId, setSaveCollectionId] = useState('');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [saveRequestName, setSaveRequestName] = useState('');
  const [saveFeedback, setSaveFeedback] = useState('');

  // ── Scheduled Synthetic Ping Monitor State ──
  const [syntheticActive, setSyntheticActive] = useState(false);
  const [syntheticInterval, setSyntheticInterval] = useState<number>(15);
  const [syntheticLogs, setSyntheticLogs] = useState<Array<{ time: string; status: number; duration: number }>>([]);
  const syntheticTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ── WebSocket & SSE Live Streaming State ──
  const [streamType, setStreamType] = useState<'ws' | 'sse'>('ws');
  const [streamConnected, setStreamConnected] = useState(false);
  const [streamConnecting, setStreamConnecting] = useState(false);
  const [streamLogs, setStreamLogs] = useState<StreamLog[]>([]);
  const [streamMessageInput, setStreamMessageInput] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!requestDraft) return;
    setMethod(requestDraft.method);
    setUrl(requestDraft.url);
    setQueryParams(requestDraft.queryParams);
    setHeaders(requestDraft.headers);
    setAuth(requestDraft.auth);
    setBody(requestDraft.body);
    setResponse(null);
    setBodyError('');
    setRequestDraft(undefined);
  }, [requestDraft, setRequestDraft]);

  // Clean up synthetic timer and streams on unmount
  useEffect(() => {
    return () => {
      if (syntheticTimerRef.current) clearInterval(syntheticTimerRef.current);
      if (wsRef.current) wsRef.current.close();
      if (sseRef.current) sseRef.current.close();
    };
  }, []);

  const addQueryParam = () => {
    setQueryParams([...queryParams, { id: crypto.randomUUID(), key: '', value: '', enabled: true }]);
  };

  const updateQueryParam = <K extends keyof QueryParam>(id: string, field: K, value: QueryParam[K]) => {
    setQueryParams(queryParams.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };

  const removeQueryParam = (id: string) => {
    setQueryParams(queryParams.filter((p) => p.id !== id));
  };

  const addHeader = () => {
    setHeaders([...headers, { id: crypto.randomUUID(), key: '', value: '', enabled: true }]);
  };

  const updateHeader = <K extends keyof Header>(id: string, field: K, value: Header[K]) => {
    setHeaders(headers.map((h) => (h.id === id ? { ...h, [field]: value } : h)));
  };

  const removeHeader = (id: string) => {
    setHeaders(headers.filter((h) => h.id !== id));
  };

  const validateJSON = (jsonString: string): boolean => {
    if (!jsonString.trim()) {
      setBodyError('');
      return true;
    }
    try {
      JSON.parse(jsonString);
      setBodyError('');
      return true;
    } catch (error) {
      setBodyError(error instanceof Error ? error.message : 'Invalid JSON');
      return false;
    }
  };

  const handleBodyChange = (value: string) => {
    setBody(value);
    if (value.trim()) {
      validateJSON(value);
    } else {
      setBodyError('');
    }
  };

  const handleSend = async () => {
    if (!url.trim()) {
      setResponse({
        success: false,
        error: {
          type: 'VALIDATION_ERROR',
          message: 'URL is required',
        },
      });
      return;
    }

    try {
      new URL(url);
    } catch {
      setResponse({
        success: false,
        error: {
          type: 'INVALID_URL',
          message: 'Please enter a valid URL (e.g., https://api.example.com)',
        },
      });
      return;
    }

    if (body.trim() && !validateJSON(body)) {
      return;
    }

    setLoading(true);
    setResponse(null);
    setScriptErrorMessage('');
    const startedAt = Date.now();

    // 1. Context & Pre-Request Script execution
    const envVarsRecord: Record<string, string> = {};
    const activeEnvObj = environments.find((e) => e.id === activeEnvironmentId) || environments[0];
    for (const v of activeEnvObj?.variables || []) {
      if (v.enabled) envVarsRecord[v.name] = v.value;
    }

    if (preRequestScript.trim()) {
      const preOut = executeScript(
        preRequestScript,
        {
          request: {
            method,
            url,
            headers: Object.fromEntries(headers.filter((h) => h.enabled).map((h) => [h.key, h.value])),
            queryParams: Object.fromEntries(queryParams.filter((q) => q.enabled).map((q) => [q.key, q.value])),
            body,
          },
          environmentVariables: envVarsRecord,
        },
        'pre-request'
      );
      if (!preOut.success && preOut.errorMessage) {
        setScriptErrorMessage(preOut.errorMessage);
      }
    }

    try {
      const result = await requestService.executeRequest({
        method,
        url,
        queryParams,
        headers,
        body: body.trim() || null,
        auth,
      });
      setResponse(result);

      // 2. Post-Response Tests execution
      if (postResponseScript.trim()) {
        const postOut = executeScript(
          postResponseScript,
          {
            request: {
              method,
              url,
              headers: Object.fromEntries(headers.filter((h) => h.enabled).map((h) => [h.key, h.value])),
              queryParams: Object.fromEntries(queryParams.filter((q) => q.enabled).map((q) => [q.key, q.value])),
              body,
            },
            response: result.success
              ? {
                  status: result.status,
                  statusText: result.statusText,
                  headers: result.headers,
                  body: result.body,
                  timeMs: result.responseTime,
                }
              : undefined,
            environmentVariables: envVarsRecord,
          },
          'post-response'
        );
        setScriptAssertions(postOut.assertions);
        setScriptLogs(postOut.consoleLogs);
        if (postOut.assertions.length > 0) {
          setResponseTab('tests');
        }
      } else {
        setScriptAssertions([]);
        setScriptLogs([]);
      }

      recordManualRequestExecution({
        id: crypto.randomUUID(),
        method,
        endpoint: url,
        completedAt: new Date().toISOString(),
        durationMs: result.success ? result.responseTime : Date.now() - startedAt,
        status: result.success
          ? 'HTTP_RESPONSE'
          : result.error.type === 'VALIDATION_ERROR' || result.error.type === 'INVALID_URL'
            ? 'REQUEST_VALIDATION_FAILURE'
            : 'TRANSPORT_FAILURE',
        httpStatus: result.success ? result.status : undefined,
        errorType: result.success ? undefined : result.error.type,
      });
    } catch {
      recordManualRequestExecution({
        id: crypto.randomUUID(),
        method,
        endpoint: url,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        status: 'TRANSPORT_FAILURE',
        errorType: 'UNKNOWN_ERROR',
      });
      setResponse({
        success: false,
        error: {
          type: 'UNKNOWN_ERROR',
          message: 'Failed to execute request',
        },
      });
    } finally {
      setLoading(false);
    }
  };

  // ── Import Handlers ──
  const handleApplyImport = () => {
    if (importType === 'curl') {
      if (!importRawInput.trim()) return;
      const parsed = parseCurlCommand(importRawInput);
      setMethod(parsed.method);
      setUrl(parsed.url);
      setQueryParams(parsed.queryParams);
      setHeaders(parsed.headers);
      if (parsed.body) {
        setBody(parsed.body);
        validateJSON(parsed.body);
      }
      setImportModalOpen(false);
      setImportRawInput('');
    } else {
      // Postman JSON
      const items = parsePostmanCollection(importRawInput);
      if (items.length > 0) {
        setPostmanParsedList(items);
        setImportFeedback(`Found ${items.length} requests in collection. Select one to load into builder:`);
      } else {
        setImportFeedback('Could not parse any requests from this Postman Collection.');
      }
    }
  };

  const handleSelectPostmanItem = (item: PostmanRequestItem) => {
    setMethod(item.method);
    setUrl(item.url);
    setHeaders(item.headers);
    if (item.body) {
      setBody(item.body);
      validateJSON(item.body);
    }
    setImportModalOpen(false);
    setImportRawInput('');
    setPostmanParsedList([]);
  };

  // ── Export Code Snippet Generation ──
  const getGeneratedCode = (): string => {
    const opts = { method, url, queryParams, headers, auth, body };
    switch (codeLang) {
      case 'curl':
        return generateCurlSnippet(opts);
      case 'javascript':
        return generateFetchSnippet(opts);
      case 'python':
        return generatePythonSnippet(opts);
      case 'go':
        return generateGoSnippet(opts);
      case 'java':
        return generateJavaSnippet(opts);
      default:
        return '';
    }
  };

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(getGeneratedCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Synthetic Monitoring Toggle ──
  const toggleSyntheticMonitoring = () => {
    if (syntheticActive) {
      if (syntheticTimerRef.current) clearInterval(syntheticTimerRef.current);
      syntheticTimerRef.current = null;
      setSyntheticActive(false);
    } else {
      if (!url.trim()) {
        alert('Please specify a valid URL to monitor.');
        return;
      }
      setSyntheticActive(true);
      // Run immediately then on interval
      void runSyntheticPing();
      syntheticTimerRef.current = setInterval(() => {
        void runSyntheticPing();
      }, syntheticInterval * 1000);
    }
  };

  const runSyntheticPing = async () => {
    const start = performance.now();
    try {
      const res = await requestService.executeRequest({
        method: 'GET',
        url,
        queryParams: [],
        headers: [],
        auth: { type: 'none' },
        body: '',
      });
      const duration = Math.round(performance.now() - start);
      const status = res.success ? res.status : 500;
      setSyntheticLogs((prev) => [
        { time: new Date().toLocaleTimeString(), status, duration },
        ...prev.slice(0, 19),
      ]);
    } catch {
      const duration = Math.round(performance.now() - start);
      setSyntheticLogs((prev) => [
        { time: new Date().toLocaleTimeString(), status: 0, duration },
        ...prev.slice(0, 19),
      ]);
    }
  };

  // ── WebSocket & SSE Streaming Handlers ──
  const toggleStreamingConnection = () => {
    if (streamConnected) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      setStreamConnected(false);
      setStreamLogs((prev) => [
        { id: crypto.randomUUID(), timestamp: new Date().toLocaleTimeString(), direction: 'SYS', data: 'Stream disconnected.' },
        ...prev,
      ]);
      return;
    }

    if (!url.trim()) {
      alert('Please enter a target URL (e.g. wss://echo.websocket.org or https://api.example.com/sse)');
      return;
    }

    setStreamConnecting(true);
    if (streamType === 'ws') {
      try {
        const ws = new WebSocket(url.startsWith('ws') ? url : `ws://${url.replace(/^https?:\/\//, '')}`);
        wsRef.current = ws;

        ws.onopen = () => {
          setStreamConnecting(false);
          setStreamConnected(true);
          setStreamLogs((prev) => [
            { id: crypto.randomUUID(), timestamp: new Date().toLocaleTimeString(), direction: 'SYS', data: `WebSocket connected to ${ws.url}` },
            ...prev,
          ]);
        };

        ws.onmessage = (event) => {
          setStreamLogs((prev) => [
            { id: crypto.randomUUID(), timestamp: new Date().toLocaleTimeString(), direction: 'IN', data: String(event.data) },
            ...prev,
          ]);
        };

        ws.onerror = () => {
          setStreamConnecting(false);
          setStreamLogs((prev) => [
            { id: crypto.randomUUID(), timestamp: new Date().toLocaleTimeString(), direction: 'SYS', data: 'WebSocket error encountered.' },
            ...prev,
          ]);
        };

        ws.onclose = () => {
          setStreamConnecting(false);
          setStreamConnected(false);
          setStreamLogs((prev) => [
            { id: crypto.randomUUID(), timestamp: new Date().toLocaleTimeString(), direction: 'SYS', data: 'WebSocket connection closed.' },
            ...prev,
          ]);
        };
      } catch (err) {
        setStreamConnecting(false);
        alert(err instanceof Error ? err.message : 'Invalid WebSocket URL');
      }
    } else {
      // SSE EventSource
      try {
        const sse = new EventSource(url);
        sseRef.current = sse;

        sse.onopen = () => {
          setStreamConnecting(false);
          setStreamConnected(true);
          setStreamLogs((prev) => [
            { id: crypto.randomUUID(), timestamp: new Date().toLocaleTimeString(), direction: 'SYS', data: `SSE stream connected to ${url}` },
            ...prev,
          ]);
        };

        sse.onmessage = (event) => {
          setStreamLogs((prev) => [
            { id: crypto.randomUUID(), timestamp: new Date().toLocaleTimeString(), direction: 'IN', data: String(event.data) },
            ...prev,
          ]);
        };

        sse.onerror = () => {
          setStreamConnecting(false);
          setStreamLogs((prev) => [
            { id: crypto.randomUUID(), timestamp: new Date().toLocaleTimeString(), direction: 'SYS', data: 'SSE error / disconnected.' },
            ...prev,
          ]);
        };
      } catch (err) {
        setStreamConnecting(false);
        alert(err instanceof Error ? err.message : 'Invalid SSE URL');
      }
    }
  };

  const handleSendWsMessage = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !streamMessageInput.trim()) return;
    wsRef.current.send(streamMessageInput);
    setStreamLogs((prev) => [
      { id: crypto.randomUUID(), timestamp: new Date().toLocaleTimeString(), direction: 'OUT', data: streamMessageInput },
      ...prev,
    ]);
    setStreamMessageInput('');
  };

  const formatResponseBody = (body: unknown): string => {
    if (body === null || body === undefined) return '';
    if (typeof body === 'object') {
      try {
        return JSON.stringify(body, null, 2);
      } catch {
        return String(body);
      }
    }
    return String(body);
  };

  const formatSize = (bytes?: number): string => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSaveToCollection = () => {
    let targetId = saveCollectionId;
    if ((!targetId || targetId === '__new__') && newCollectionName.trim()) {
      targetId = createCollection(newCollectionName.trim());
    } else if (!targetId && collections.length > 0) {
      targetId = collections[0].id;
    } else if (!targetId || targetId === '__new__') {
      targetId = createCollection('My API Collection');
    }

    const currentCollection = collections.find((c) => c.id === targetId);
    const existingReqs = currentCollection?.requests || [];
    let reqName = saveRequestName.trim();
    if (!reqName) {
      try {
        reqName = url ? `${method} ${new URL(url).pathname}` : `${method} Request`;
      } catch {
        reqName = `${method} Request`;
      }
    }

    const newReq = {
      id: crypto.randomUUID(),
      name: reqName,
      method,
      url,
      queryParams,
      headers,
      body,
      auth,
    };

    updateCollection(targetId, {
      requests: [...existingReqs, newReq],
    });

    setSaveFeedback('Request saved to collection!');
    setTimeout(() => {
      setSaveFeedback('');
      setSaveModalOpen(false);
    }, 1000);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="panel-surface p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900">Request Builder</h2>
            <p className="text-xs text-slate-500">
              Construct, authenticate, and dispatch HTTP &amp; WebSocket calls
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                let defaultName = `${method} Request`;
                try {
                  if (url) defaultName = `${method} ${new URL(url).pathname}`;
                } catch {
                  defaultName = `${method} ${url || 'Request'}`;
                }
                setSaveRequestName(defaultName);
                if (collections.length > 0 && !saveCollectionId) {
                  setSaveCollectionId(collections[0].id);
                }
                setSaveFeedback('');
                setSaveModalOpen(true);
              }}
              className="h-8.5 text-xs font-medium"
            >
              <FolderKanban className="h-3.5 w-3.5 mr-1 text-emerald-600" />
              Save to Collection
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setImportRawInput('');
                setPostmanParsedList([]);
                setImportFeedback('');
                setImportModalOpen(true);
              }}
              className="h-8.5 text-xs font-medium"
            >
              <FileDown className="h-3.5 w-3.5 mr-1 text-blue-600" />
              Import Request
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExportModalOpen(true)}
              className="h-8.5 text-xs font-medium"
            >
              <Code2 className="h-3.5 w-3.5 mr-1 text-purple-600" />
              Export Code
            </Button>
            <Button
              variant={syntheticActive ? 'default' : 'outline'}
              size="sm"
              onClick={toggleSyntheticMonitoring}
              className={`h-8.5 text-xs font-medium gap-1.5 ${
                syntheticActive ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''
              }`}
            >
              <Activity className={`h-3.5 w-3.5 ${syntheticActive ? 'animate-pulse text-white' : 'text-slate-500'}`} />
              {syntheticActive ? 'Monitoring Active' : 'Synthetic Ping'}
            </Button>
          </div>
        </div>

        {/* Live Synthetic Health Bar (if active) */}
        {syntheticActive && (
          <div className="mt-3.5 p-3 rounded-xl border border-emerald-200 bg-emerald-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping" />
              <span className="font-bold text-emerald-900">Live Synthetic Monitor Active</span>
              <span className="text-emerald-700 font-mono">({syntheticInterval}s interval)</span>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <span className="text-[10px] uppercase font-bold text-emerald-800">Recent Checks:</span>
              {syntheticLogs.slice(0, 5).map((log, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-mono font-bold ${
                    log.status >= 200 && log.status < 400
                      ? 'bg-emerald-200 text-emerald-900'
                      : 'bg-rose-200 text-rose-900'
                  }`}
                >
                  {log.status || 'ERR'} ({log.duration}ms)
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Request Configuration Card */}
      <div className="panel-surface p-4 sm:p-5">
        {/* Method + URL + Send */}
        <div className="flex gap-2.5">
          <div className="relative">
            <button
              type="button"
              onClick={() => setMethodDropdownOpen(!methodDropdownOpen)}
              className="flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-800 hover:bg-slate-50"
            >
              {method}
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </button>
            {methodDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMethodDropdownOpen(false)}
                />
                <div className="absolute left-0 top-full z-20 mt-1 w-32 rounded-lg border border-slate-200 bg-white shadow-lg">
                  {HTTP_METHODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setMethod(m);
                        setMethodDropdownOpen(false);
                      }}
                      className="w-full px-3.5 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 first:rounded-t-lg last:rounded-b-lg"
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <Input
            type="text"
            placeholder="https://api.example.com/users"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 font-mono text-xs h-10"
          />

          <Button onClick={handleSend} disabled={loading} size="default" className="h-10 px-5 text-xs font-medium gap-1.5">
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Sending
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                Send
              </>
            )}
          </Button>
        </div>

        {/* Tabs */}
        <div className="mt-4 border-b border-slate-200">
          <div className="flex gap-5">
            {(['params', 'headers', 'auth', 'body', 'streaming', 'scripts'] as TabType[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`pb-2.5 text-xs font-semibold capitalize transition-colors ${
                  activeTab === tab
                    ? 'border-b-2 border-slate-900 text-slate-900'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab === 'streaming' ? 'Live Stream (WS/SSE)' : tab === 'scripts' ? 'Scripts & Tests' : tab}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {/* Params Tab */}
          {activeTab === 'params' && (
            <div className="space-y-3">
              {queryParams.map((param) => (
                <div key={param.id} className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={param.enabled}
                    onChange={(e) => updateQueryParam(param.id, 'enabled', e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <Input
                    placeholder="Key"
                    value={param.key}
                    onChange={(e) => updateQueryParam(param.id, 'key', e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Value"
                    value={param.value}
                    onChange={(e) => updateQueryParam(param.id, 'value', e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeQueryParam(param.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" onClick={addQueryParam}>
                <Plus className="h-4 w-4" />
                Add Parameter
              </Button>
            </div>
          )}

          {/* Headers Tab */}
          {activeTab === 'headers' && (
            <div className="space-y-3">
              {headers.map((header) => (
                <div key={header.id} className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={header.enabled}
                    onChange={(e) => updateHeader(header.id, 'enabled', e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <Input
                    placeholder="Key"
                    value={header.key}
                    onChange={(e) => updateHeader(header.id, 'key', e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Value"
                    value={header.value}
                    onChange={(e) => updateHeader(header.id, 'value', e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeHeader(header.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" onClick={addHeader}>
                <Plus className="h-4 w-4" />
                Add Header
              </Button>
            </div>
          )}

          {/* Auth Tab */}
          {activeTab === 'auth' && (
            <div className="space-y-4">
              <div className="flex gap-3">
                {(['none', 'bearer', 'apikey', 'basic'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      if (type === 'none') setAuth({ type: 'none' });
                      else if (type === 'bearer') setAuth({ type: 'bearer', token: '' });
                      else if (type === 'apikey')
                        setAuth({ type: 'apikey', key: '', value: '', addTo: 'header' });
                      else if (type === 'basic')
                        setAuth({ type: 'basic', username: '', password: '' });
                    }}
                    className={`rounded-lg px-4 py-2 text-sm font-medium capitalize ${
                      auth.type === type
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {type === 'apikey' ? 'API Key' : type}
                  </button>
                ))}
              </div>

              {auth.type === 'bearer' && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Token</label>
                  <Input
                    type="text"
                    placeholder="Bearer token"
                    value={auth.token}
                    onChange={(e) => setAuth({ ...auth, token: e.target.value })}
                  />
                </div>
              )}

              {auth.type === 'apikey' && (
                <div className="space-y-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Key</label>
                    <Input
                      type="text"
                      placeholder="Header name"
                      value={auth.key}
                      onChange={(e) => setAuth({ ...auth, key: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Value</label>
                    <Input
                      type="text"
                      placeholder="API key"
                      value={auth.value}
                      onChange={(e) => setAuth({ ...auth, value: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Add to</label>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setAuth({ ...auth, addTo: 'header' })}
                        className={`rounded-lg px-4 py-2 text-sm font-medium ${
                          auth.addTo === 'header'
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Header
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuth({ ...auth, addTo: 'query' })}
                        className={`rounded-lg px-4 py-2 text-sm font-medium ${
                          auth.addTo === 'query'
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Query Params
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {auth.type === 'basic' && (
                <div className="space-y-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Username</label>
                    <Input
                      type="text"
                      placeholder="Username"
                      value={auth.username}
                      onChange={(e) => setAuth({ ...auth, username: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Password</label>
                    <Input
                      type="password"
                      placeholder="Password"
                      value={auth.password}
                      onChange={(e) => setAuth({ ...auth, password: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Body Tab */}
          {activeTab === 'body' && (
            <div className="space-y-3">
              <div className="text-sm font-medium text-slate-700">JSON</div>
              <textarea
                value={body}
                onChange={(e) => handleBodyChange(e.target.value)}
                placeholder='{\n  "name": "John",\n  "email": "john@example.com"\n}'
                className="h-64 w-full rounded-lg border border-slate-200 bg-white p-3 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {bodyError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {bodyError}
                </div>
              )}
            </div>
          )}

          {/* Streaming Tab (WebSocket / SSE) */}
          {activeTab === 'streaming' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-700 uppercase">Protocol:</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setStreamType('ws')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold ${
                        streamType === 'ws'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-700'
                      }`}
                    >
                      WebSocket (ws://)
                    </button>
                    <button
                      type="button"
                      onClick={() => setStreamType('sse')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold ${
                        streamType === 'sse'
                          ? 'bg-purple-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-700'
                      }`}
                    >
                      Server-Sent Events (SSE)
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={streamConnected ? 'destructive' : 'default'}
                    onClick={toggleStreamingConnection}
                    disabled={streamConnecting}
                    className="text-xs gap-1.5"
                  >
                    {streamConnecting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : streamConnected ? (
                      <Square className="h-3.5 w-3.5 fill-current" />
                    ) : (
                      <Play className="h-3.5 w-3.5 fill-current" />
                    )}
                    {streamConnected ? 'Disconnect' : 'Connect Stream'}
                  </Button>
                  {streamLogs.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setStreamLogs([])}
                      className="text-xs"
                    >
                      Clear Log
                    </Button>
                  )}
                </div>
              </div>

              {/* WebSocket Message Dispatcher */}
              {streamType === 'ws' && streamConnected && (
                <div className="flex gap-2">
                  <Input
                    placeholder="Type a message..."
                    value={streamMessageInput}
                    onChange={(e) => setStreamMessageInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSendWsMessage();
                    }}
                    className="text-xs sm:text-sm font-mono"
                  />
                  <Button size="sm" onClick={handleSendWsMessage} className="gap-1.5 shrink-0">
                    <Send className="h-3.5 w-3.5" />
                    Send Frame
                  </Button>
                </div>
              )}

              {/* Live Event Stream Log */}
              <div className="rounded-xl border border-slate-200 bg-slate-900 p-4 font-mono text-xs text-slate-200 h-64 overflow-y-auto space-y-2">
                {streamLogs.length === 0 ? (
                  <p className="text-slate-500 text-center py-20">
                    No stream frames received. Connect to a WebSocket or SSE endpoint to monitor live events.
                  </p>
                ) : (
                  streamLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-2.5">
                      <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                          log.direction === 'IN'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : log.direction === 'OUT'
                              ? 'bg-blue-950 text-blue-400 border border-blue-800'
                              : 'bg-amber-950 text-amber-400 border border-amber-800'
                        }`}
                      >
                        {log.direction}
                      </span>
                      <span className="whitespace-pre-wrap break-all text-slate-300">{log.data}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Scripts & Tests Tab */}
          {activeTab === 'scripts' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-3">
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setScriptSubTab('post')}
                    className={`pb-1.5 text-xs sm:text-sm font-semibold transition-colors ${
                      scriptSubTab === 'post'
                        ? 'border-b-2 border-blue-600 text-blue-600'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Post-Response Tests (pm.test)
                  </button>
                  <button
                    type="button"
                    onClick={() => setScriptSubTab('pre')}
                    className={`pb-1.5 text-xs sm:text-sm font-semibold transition-colors ${
                      scriptSubTab === 'pre'
                        ? 'border-b-2 border-blue-600 text-blue-600'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Pre-Request Script
                  </button>
                </div>

                {/* Quick Helper Snippets */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Snippets:</span>
                  {scriptSubTab === 'post' ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setPostResponseScript(
                            (prev) =>
                              prev +
                              (prev ? '\n' : '') +
                              'pm.test("Status code is 200", () => {\n  pm.expect(response.status).toBe(200);\n});\n'
                          )
                        }
                        className="text-[11px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono transition-colors"
                      >
                        + Status 200
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPostResponseScript(
                            (prev) =>
                              prev +
                              (prev ? '\n' : '') +
                              'pm.test("Response time < 500ms", () => {\n  pm.expect(response.timeMs).toBeLessThan(500);\n});\n'
                          )
                        }
                        className="text-[11px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono transition-colors"
                      >
                        + Time &lt; 500ms
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPostResponseScript(
                            (prev) =>
                              prev +
                              (prev ? '\n' : '') +
                              'pm.test("Response is valid JSON", () => {\n  const data = response.json();\n  pm.expect(data).toBeDefined();\n});\n'
                          )
                        }
                        className="text-[11px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono transition-colors"
                      >
                        + JSON Check
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPostResponseScript(
                            (prev) =>
                              prev +
                              (prev ? '\n' : '') +
                              'pm.environment.set("authToken", response.json()?.token || "val");\n'
                          )
                        }
                        className="text-[11px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono transition-colors"
                      >
                        + Set Env Var
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        setPreRequestScript(
                          (prev) =>
                            prev +
                            (prev ? '\n' : '') +
                            'pm.environment.set("timestamp", Date.now());\n'
                        )
                      }
                      className="text-[11px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono transition-colors"
                    >
                      + Set Timestamp
                    </button>
                  )}
                </div>
              </div>

              {scriptErrorMessage && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  {scriptErrorMessage}
                </div>
              )}

              {scriptSubTab === 'post' ? (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500">
                    Write JavaScript tests executed immediately after HTTP response is received. Compatible with both{' '}
                    <code className="bg-slate-100 px-1 py-0.5 rounded text-blue-600">pm.test()</code> and{' '}
                    <code className="bg-slate-100 px-1 py-0.5 rounded text-blue-600">apiforge.test()</code>.
                  </p>
                  <textarea
                    value={postResponseScript}
                    onChange={(e) => setPostResponseScript(e.target.value)}
                    placeholder={`// Post-Response Test Script\npm.test("Status code is 200", () => {\n  pm.expect(response.status).toBe(200);\n});`}
                    className="h-64 w-full rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500">
                    Write JavaScript executed before this request is dispatched. You can set dynamic environment variables or calculate request hashes.
                  </p>
                  <textarea
                    value={preRequestScript}
                    onChange={(e) => setPreRequestScript(e.target.value)}
                    placeholder={`// Pre-Request Script\npm.environment.set("clientTimestamp", Date.now());`}
                    className="h-64 w-full rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Response Viewer */}
      {response && (
        <div className="panel-surface p-6">
          <h2 className="text-lg font-semibold text-slate-950">Response</h2>

          {response.success ? (
            <>
              {/* Status Bar */}
              <div className="mt-4 flex items-center gap-4 rounded-lg bg-slate-50 p-4">
                <div
                  className={`rounded-full px-3 py-1 text-sm font-semibold ${
                    response.status >= 200 && response.status < 300
                      ? 'bg-emerald-100 text-emerald-700'
                      : response.status >= 400 && response.status < 500
                        ? 'bg-amber-100 text-amber-700'
                        : response.status >= 500
                          ? 'bg-red-100 text-red-700'
                          : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {response.status} {response.statusText}
                </div>
                <div className="text-sm text-slate-600">{response.responseTime} ms</div>
                {response.size !== undefined && (
                  <div className="text-sm text-slate-600">{formatSize(response.size)}</div>
                )}
              </div>

              {/* Response Tabs */}
              <div className="mt-6 border-b border-slate-200">
                <div className="flex gap-6">
                  <button
                    type="button"
                    onClick={() => setResponseTab('body')}
                    className={`pb-3 text-sm font-medium ${
                      responseTab === 'body'
                        ? 'border-b-2 border-slate-900 text-slate-900'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Body
                  </button>
                  <button
                    type="button"
                    onClick={() => setResponseTab('headers')}
                    className={`pb-3 text-sm font-medium ${
                      responseTab === 'headers'
                        ? 'border-b-2 border-slate-900 text-slate-900'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Headers
                  </button>
                  <button
                    type="button"
                    onClick={() => setResponseTab('tests')}
                    className={`pb-3 text-sm font-medium flex items-center gap-2 ${
                      responseTab === 'tests'
                        ? 'border-b-2 border-slate-900 text-slate-900'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <span>Test Results</span>
                    {scriptAssertions.length > 0 && (
                      <span
                        className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                          scriptAssertions.every((a) => a.passed)
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {scriptAssertions.filter((a) => a.passed).length}/{scriptAssertions.length}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Response Content */}
              <div className="mt-4">
                {responseTab === 'body' ? (
                  <pre className="overflow-x-auto rounded-lg bg-slate-50 p-4 font-mono text-sm text-slate-900">
                    {formatResponseBody(response.body)}
                  </pre>
                ) : responseTab === 'headers' ? (
                  <div className="space-y-2">
                    {Object.entries(response.headers).map(([key, value]) => (
                      <div key={key} className="flex gap-4 rounded-lg bg-slate-50 p-3 text-sm">
                        <div className="font-medium text-slate-700">{key}:</div>
                        <div className="text-slate-600">{value}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Test Results Tab Content */
                  <div className="space-y-3">
                    {scriptAssertions.length === 0 ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
                        <FileCode className="h-8 w-8 mx-auto text-slate-400 mb-2" />
                        <p className="text-sm font-semibold text-slate-700">No test assertions configured</p>
                        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                          Switch to the <strong>Scripts & Tests</strong> tab above and add <code className="bg-slate-200/60 px-1 py-0.5 rounded text-blue-600">pm.test(...)</code> assertions to validate response status, timing, and payload structures automatically.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50">
                          <span className="text-xs font-bold text-slate-700">
                            {scriptAssertions.filter((a) => a.passed).length} of {scriptAssertions.length} tests passing
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                              scriptAssertions.every((a) => a.passed)
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-rose-100 text-rose-700'
                            }`}
                          >
                            {scriptAssertions.every((a) => a.passed) ? 'ALL PASSED' : 'TESTS FAILED'}
                          </span>
                        </div>

                        <div className="space-y-2">
                          {scriptAssertions.map((ast, i) => (
                            <div
                              key={i}
                              className={`p-3 rounded-xl border flex items-start gap-3 ${
                                ast.passed
                                  ? 'bg-emerald-50/50 border-emerald-200 text-emerald-950'
                                  : 'bg-rose-50/50 border-rose-200 text-rose-950'
                              }`}
                            >
                              {ast.passed ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                              ) : (
                                <XCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold">{ast.name}</p>
                                {ast.error && (
                                  <p className="text-xs text-rose-600 mt-0.5 font-mono">{ast.error}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        {scriptLogs.length > 0 && (
                          <div className="mt-4">
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                              Script Console Output:
                            </p>
                            <div className="rounded-lg bg-slate-900 p-3 font-mono text-xs text-slate-200 space-y-1">
                              {scriptLogs.map((log, idx) => (
                                <div key={idx}>{log}</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="font-semibold text-red-900">{response.error.type}</div>
              <div className="mt-1 text-sm text-red-700">{response.error.message}</div>
              {response.error.details && (
                <div className="mt-2 text-xs text-red-600">{response.error.details}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── IMPORT MODAL (cURL / Postman Collection) ── */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileDown className="h-5 w-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">Import Request</h3>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setImportModalOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Type selector */}
            <div className="mt-4 flex gap-2 border-b border-slate-100 pb-3">
              <button
                type="button"
                onClick={() => {
                  setImportType('curl');
                  setImportFeedback('');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                  importType === 'curl' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                cURL Command
              </button>
              <button
                type="button"
                onClick={() => {
                  setImportType('postman');
                  setImportFeedback('');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                  importType === 'postman' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                Collection File (v2.1)
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block text-xs font-semibold text-slate-700">
                {importType === 'curl'
                  ? 'Paste raw cURL command:'
                  : 'Paste Postman Collection v2.1 JSON:'}
              </label>
              <textarea
                value={importRawInput}
                onChange={(e) => setImportRawInput(e.target.value)}
                placeholder={
                  importType === 'curl'
                    ? `curl -X POST https://api.example.com/v1/orders \\\n  -H "Content-Type: application/json" \\\n  -d '{"item": "book", "qty": 2}'`
                    : `{\n  "info": { "name": "Store API" },\n  "item": [...] \n}`
                }
                className="w-full h-44 rounded-xl border border-slate-200 bg-slate-50/70 p-3 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />

              {importFeedback && (
                <p className="text-xs font-medium text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  {importFeedback}
                </p>
              )}

              {/* Postman items list if parsed */}
              {postmanParsedList.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-1.5 border border-slate-200 rounded-xl p-2 bg-slate-50">
                  {postmanParsedList.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectPostmanItem(item)}
                      className="w-full text-left p-2 rounded-lg bg-white border border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 flex items-center justify-between text-xs transition-colors"
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        <span className="font-bold uppercase text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-800">
                          {item.method}
                        </span>
                        <span className="font-semibold text-slate-900">{item.name}</span>
                        <span className="font-mono text-slate-400 text-[11px] truncate">{item.url}</span>
                      </div>
                      <span className="text-[11px] font-bold text-blue-600 shrink-0">Select →</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setImportModalOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleApplyImport} className="bg-blue-600 hover:bg-blue-700 text-white font-bold">
                {importType === 'curl' ? 'Apply to Builder' : 'Parse Collection'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── EXPORT CODE SNIPPETS MODAL ── */}
      {exportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Code2 className="h-5 w-5 text-purple-600" />
                <h3 className="text-base font-bold text-slate-900">Generate Client Code Snippet</h3>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setExportModalOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Language Tabs */}
            <div className="mt-4 flex flex-wrap gap-2 border-b border-slate-100 pb-3">
              {(
                [
                  { id: 'curl', label: 'cURL' },
                  { id: 'javascript', label: 'JavaScript (fetch)' },
                  { id: 'python', label: 'Python (requests)' },
                  { id: 'go', label: 'Go (net/http)' },
                  { id: 'java', label: 'Java (HttpClient)' },
                ] as const
              ).map((lang) => (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => setCodeLang(lang.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                    codeLang === lang.id
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>

            <div className="relative mt-4">
              <pre className="h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-slate-900 p-4 font-mono text-xs text-slate-200">
                {getGeneratedCode()}
              </pre>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleCopyCode}
                className="absolute top-3 right-3 text-xs gap-1.5 shadow-sm"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied!' : 'Copy Snippet'}
              </Button>
            </div>

            <div className="mt-5 flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setExportModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── SAVE TO COLLECTION MODAL ── */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FolderKanban className="h-5 w-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900">Save Request to Collection</h3>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSaveModalOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Request Name</label>
                <Input
                  className="mt-1 text-xs"
                  placeholder="e.g., Get All Users"
                  value={saveRequestName}
                  onChange={(e) => setSaveRequestName(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Target Collection</label>
                {collections.length > 0 ? (
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2 text-xs font-medium text-slate-800 shadow-xs"
                    value={saveCollectionId}
                    onChange={(e) => {
                      setSaveCollectionId(e.target.value);
                      if (e.target.value !== '__new__') setNewCollectionName('');
                    }}
                  >
                    {collections.map((col) => (
                      <option key={col.id} value={col.id}>
                        {col.name} ({col.requests.length} requests)
                      </option>
                    ))}
                    <option value="__new__">+ Create new collection...</option>
                  </select>
                ) : null}
              </div>

              {(collections.length === 0 || saveCollectionId === '__new__') && (
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600">New Collection Name</label>
                  <Input
                    className="mt-1 text-xs"
                    placeholder="e.g., User Management API"
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                  />
                </div>
              )}

              {saveFeedback && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-medium text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  {saveFeedback}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setSaveModalOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveToCollection} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                Save Request
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
