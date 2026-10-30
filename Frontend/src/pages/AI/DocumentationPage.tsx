import { BookMarked, Copy, Download, Search, Check, ShoppingBag, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/store/useAppStore';
import { specificationMarkdown } from '@/lib/documentationData';
import { USER_MANAGEMENT_SPEC_JSON } from '@/data/userManagementSpec';
import { ECOMMERCE_SPEC_JSON } from '@/data/ecommerceSpec';
import { openApiService } from '@/services/openapiService';
import type { ApiMediaContent, ApiSchema, JsonValue } from '@/types/openapi.types';

const methodBadges: Record<string, string> = {
  GET: 'bg-sky-50 text-sky-700 border-sky-200',
  POST: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PUT: 'bg-amber-50 text-amber-700 border-amber-200',
  PATCH: 'bg-violet-50 text-violet-700 border-violet-200',
  DELETE: 'bg-rose-50 text-rose-700 border-rose-200',
  HEAD: 'bg-slate-50 text-slate-700 border-slate-200',
  OPTIONS: 'bg-indigo-50 text-indigo-700 border-indigo-200',
};

function schemaLabel(schema?: ApiSchema) {
  return (
    schema?.reference?.split('/').at(-1) ??
    (Array.isArray(schema?.type) ? schema.type.join(' | ') : schema?.type) ??
    'No schema defined'
  );
}

function schemaExample(schema?: ApiSchema, depth = 0): JsonValue | undefined {
  if (!schema || depth > 4) return schema?.example ?? schema?.default;
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum?.length) return schema.enum[0];
  if (schema.properties) {
    return Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [
        key,
        schemaExample(value, depth + 1) ?? '',
      ])
    );
  }
  if (schema.type === 'array') return [schemaExample(schema.items, depth + 1) ?? ''];
  return undefined;
}

function exampleFor(content: ApiMediaContent) {
  return (
    content.example ??
    (content.examples ? Object.values(content.examples)[0] : undefined) ??
    schemaExample(content.schema)
  );
}

export function DocumentationPage() {
  const specification = useAppStore((state) => state.activeSpecification);
  const setActiveSpecification = useAppStore((state) => state.setActiveSpecification);
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('All');
  const [copied, setCopied] = useState(false);

  const markdown = useMemo(
    () => (specification ? specificationMarkdown(specification) : ''),
    [specification]
  );

  if (!specification) {
    return (
      <div className="panel-surface mx-auto max-w-2xl p-8 text-center">
        <BookMarked className="mx-auto h-10 w-10 text-slate-400" />
        <h1 className="mt-4 text-xl font-semibold text-slate-900">No API specification imported</h1>
        <p className="mt-2 text-sm text-slate-500">
          Import an OpenAPI specification to generate documentation. No API requests are made.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Link to="/openapi">
            <Button variant="outline">Go to OpenAPI Import</Button>
          </Link>
          <Button
            onClick={async () => {
              const res = await openApiService.importSpecification(
                'user-management-api.json',
                USER_MANAGEMENT_SPEC_JSON
              );
              if (res.success && res.specification) {
                setActiveSpecification(res.specification);
              }
            }}
            className="bg-sky-600 hover:bg-sky-700 text-white gap-1.5"
          >
            <Users className="h-4 w-4" />
            + User API Spec
          </Button>
          <Button
            onClick={async () => {
              const res = await openApiService.importSpecification(
                'ecommerce-store-api.json',
                ECOMMERCE_SPEC_JSON
              );
              if (res.success && res.specification) {
                setActiveSpecification(res.specification);
              }
            }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
          >
            <ShoppingBag className="h-4 w-4" />
            + QuickCart Spec
          </Button>
        </div>
      </div>
    );
  }

  const endpoints = specification.endpoints.filter(
    (endpoint) =>
      (method === 'All' || endpoint.method === method) &&
      `${endpoint.path} ${endpoint.summary ?? ''}`.toLowerCase().includes(search.toLowerCase())
  );

  const copy = async () => {
    await navigator.clipboard?.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${
      specification.metadata.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'api'
    }-documentation.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Overview & Metadata Card */}
      <section className="panel-surface p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {specification.metadata.title}
              </h1>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                v{specification.metadata.version}
              </span>
            </div>
            {specification.metadata.description ? (
              <p className="mt-2 text-sm text-slate-600 leading-relaxed max-w-3xl">
                {specification.metadata.description}
              </p>
            ) : (
              <p className="mt-2 text-sm text-slate-400">No description provided.</p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={copy} className="gap-1.5 text-xs">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy Markdown'}
            </Button>
            <Button variant="outline" size="sm" onClick={download} className="gap-1.5 text-xs">
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
          </div>
        </div>

        {/* Servers Bar */}
        <div className="mt-5 border-t border-slate-100 pt-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Target Servers</h2>
          {specification.servers.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {specification.servers.map((server) => (
                <div
                  key={server.url}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-mono text-slate-700"
                >
                  <strong className="text-slate-900">{server.url}</strong>
                  {server.description ? ` — ${server.description}` : ''}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-xs text-slate-500">No servers defined.</p>
          )}
        </div>
      </section>

      {/* Endpoints Documentation Explorer */}
      <section className="panel-surface p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-2 max-w-md">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <Input
              aria-label="Search endpoints"
              placeholder="Search path or summary..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-xs h-9 bg-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Method:</span>
            <select
              aria-label="Method filter"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs"
            >
              <option>All</option>
              {[...new Set(specification.endpoints.map((endpoint) => endpoint.method))].map(
                (value) => (
                  <option key={value}>{value}</option>
                )
              )}
            </select>
          </div>
        </div>

        {/* Endpoints List */}
        <div className="mt-6 space-y-4">
          {endpoints.length ? (
            endpoints.map((endpoint) => (
              <article
                key={endpoint.id}
                className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs transition-all hover:border-slate-300"
              >
                <div className="flex flex-wrap items-center gap-2.5">
                  <span
                    className={`rounded-md px-2.5 py-1 text-xs font-bold border ${
                      methodBadges[endpoint.method] || 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    {endpoint.method}
                  </span>
                  <code className="font-mono text-sm font-bold text-slate-900 break-all">
                    {endpoint.path}
                  </code>
                </div>

                <p className="mt-2 text-sm text-slate-600">
                  {endpoint.summary ?? endpoint.description ?? 'No endpoint description provided.'}
                </p>

                {/* Parameters */}
                <div className="mt-4 rounded-lg bg-slate-50/70 p-3 text-xs text-slate-600 border border-slate-100">
                  <span className="font-semibold text-slate-700">Parameters: </span>
                  {endpoint.parameters.length
                    ? endpoint.parameters
                        .map((p) => `${p.name} (${p.location}, ${schemaLabel(p.schema)})`)
                        .join(', ')
                    : 'None'}
                </div>

                {/* Request Body */}
                <div className="mt-2 rounded-lg bg-slate-50/70 p-3 text-xs text-slate-600 border border-slate-100">
                  <span className="font-semibold text-slate-700">Request Body: </span>
                  {endpoint.requestBody
                    ? endpoint.requestBody.content
                        .map((c) => `${c.contentType} (${schemaLabel(c.schema)})`)
                        .join(', ')
                    : 'None defined'}
                </div>

                {endpoint.requestBody?.content.map((content) => {
                  const example = exampleFor(content);
                  return (
                    <div key={content.contentType} className="mt-2">
                      {example === undefined ? (
                        <p className="text-xs text-slate-400">
                          No request example provided for {content.contentType}.
                        </p>
                      ) : (
                        <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-900 p-3 text-xs text-slate-100 font-mono">
                          {JSON.stringify(example, null, 2)}
                        </pre>
                      )}
                    </div>
                  );
                })}

                {/* Responses */}
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Responses ({endpoint.responses.length})
                  </div>
                  <div className="space-y-2">
                    {endpoint.responses.map((response) => (
                      <div
                        key={response.statusCode}
                        className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-xs text-slate-700"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded px-1.5 py-0.5 font-bold font-mono ${
                              Number(response.statusCode) >= 200 && Number(response.statusCode) < 300
                                ? 'bg-emerald-100 text-emerald-800'
                                : Number(response.statusCode) >= 400
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {response.statusCode}
                          </span>
                          <span className="font-medium">
                            {response.description ?? 'No response description provided.'}
                          </span>
                        </div>

                        {response.content.length ? (
                          response.content.map((content) => {
                            const example = exampleFor(content);
                            return (
                              <div key={content.contentType} className="mt-2">
                                <div className="text-[11px] text-slate-500 font-mono">
                                  {content.contentType} · {schemaLabel(content.schema)}
                                  {example === undefined && (
                                    <span className="text-slate-400"> · No response example provided.</span>
                                  )}
                                </div>
                                {example !== undefined && (
                                  <pre className="mt-1 overflow-x-auto rounded border border-slate-200 bg-white p-2.5 text-xs text-slate-800 font-mono">
                                    {JSON.stringify(example, null, 2)}
                                  </pre>
                                )}
                              </div>
                            );
                          })
                        ) : (
                          <div className="mt-1 text-slate-400 text-[11px]">No response schema provided.</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            ))
          ) : (
            <p className="py-12 text-center text-sm text-slate-500">No endpoints match this filter.</p>
          )}
        </div>
      </section>
    </div>
  );
}
