import { useEffect, useState } from 'react';
import { ChevronDown, Plus, Send, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { requestService } from '@/services/requestService';
import { useAppStore } from '@/store/useAppStore';
import type {
  HttpMethod,
  QueryParam,
  Header,
  Auth,
  ApiExecutionResult,
} from '@/types/request.types';

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE'];

type TabType = 'params' | 'headers' | 'auth' | 'body';

export function RequestBuilderPage() {
  const { requestDraft, setRequestDraft } = useAppStore();
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
  const [responseTab, setResponseTab] = useState<'body' | 'headers'>('body');
  const [bodyError, setBodyError] = useState<string>('');

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
    // Validate URL
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

    // Validate JSON body
    if (body.trim() && !validateJSON(body)) {
      return;
    }

    setLoading(true);
    setResponse(null);

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
    } catch {
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

  const formatResponseBody = (data: unknown): string => {
    if (typeof data === 'string') {
      try {
        return JSON.stringify(JSON.parse(data), null, 2);
      } catch {
        return data;
      }
    }

    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  const formatSize = (bytes: number | undefined): string => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="panel-surface p-6">
        <h1 className="text-2xl font-semibold text-slate-950">Request Builder</h1>
        <p className="mt-2 text-sm text-slate-500">
          Build and test API requests with full control over headers, authentication, and payloads.
        </p>
      </div>

      {/* Request Configuration */}
      <div className="panel-surface p-6">
        {/* Method + URL + Send */}
        <div className="flex gap-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => setMethodDropdownOpen(!methodDropdownOpen)}
              className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {method}
              <ChevronDown className="h-4 w-4" />
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
                      className="w-full px-4 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 first:rounded-t-lg last:rounded-b-lg"
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
            className="flex-1"
          />

          <Button onClick={handleSend} disabled={loading} size="lg">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send
              </>
            )}
          </Button>
        </div>

        {/* Tabs */}
        <div className="mt-6 border-b border-slate-200">
          <div className="flex gap-6">
            {(['params', 'headers', 'auth', 'body'] as TabType[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`pb-3 text-sm font-medium capitalize transition-colors ${
                  activeTab === tab
                    ? 'border-b-2 border-slate-900 text-slate-900'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab}
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
                    placeholder="Enter bearer token"
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
                      placeholder="e.g., X-API-Key"
                      value={auth.key}
                      onChange={(e) => setAuth({ ...auth, key: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Value</label>
                    <Input
                      type="text"
                      placeholder="Enter API key"
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
                      placeholder="Enter username"
                      value={auth.username}
                      onChange={(e) => setAuth({ ...auth, username: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Password</label>
                    <Input
                      type="password"
                      placeholder="Enter password"
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
                </div>
              </div>

              {/* Response Content */}
              <div className="mt-4">
                {responseTab === 'body' ? (
                  <pre className="overflow-x-auto rounded-lg bg-slate-50 p-4 font-mono text-sm text-slate-900">
                    {formatResponseBody(response.body)}
                  </pre>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(response.headers).map(([key, value]) => (
                      <div key={key} className="flex gap-4 rounded-lg bg-slate-50 p-3 text-sm">
                        <div className="font-medium text-slate-700">{key}:</div>
                        <div className="text-slate-600">{value}</div>
                      </div>
                    ))}
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
    </div>
  );
}
