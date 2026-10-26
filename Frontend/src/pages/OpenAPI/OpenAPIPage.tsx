import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Download,
  FileCode2,
  FileUp,
  Loader2,
  Send,
  ShieldCheck,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { downloadJsonFile, exportSpecificationToOpenApi } from '@/lib/openApiExporter';
import { openApiService } from '@/services/openapiService';
import { useAppStore } from '@/store/useAppStore';
import type {
  ApiEndpoint,
  ApiMediaContent,
  ApiSchema,
  ApiSecurityScheme,
  ApiSpecification,
  JsonValue,
} from '@/types/openapi.types';
import type { Auth, Header, HttpMethod, QueryParam } from '@/types/request.types';

const ACCEPTED_TYPES = ['.json', '.yaml', '.yml'];
const methodColor: Record<string, string> = {
  GET: 'bg-sky-100 text-sky-700',
  POST: 'bg-emerald-100 text-emerald-700',
  PUT: 'bg-amber-100 text-amber-700',
  PATCH: 'bg-violet-100 text-violet-700',
  DELETE: 'bg-rose-100 text-rose-700',
  HEAD: 'bg-slate-100 text-slate-700',
  OPTIONS: 'bg-cyan-100 text-cyan-700',
  TRACE: 'bg-orange-100 text-orange-700',
};

function formatSize(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function schemaLabel(schema?: ApiSchema) {
  if (!schema) return '—';
  if (schema.reference) return schema.reference.split('/').at(-1) ?? schema.reference;
  return Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type ?? 'schema';
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
  if (schema.type === 'integer' || schema.type === 'number') return 0;
  if (schema.type === 'boolean') return false;
  return schema.type === 'string' ? '' : undefined;
}

function firstExample(content?: ApiMediaContent): JsonValue | undefined {
  return (
    content?.example ??
    (content?.examples ? Object.values(content.examples)[0] : undefined) ??
    schemaExample(content?.schema)
  );
}

function authFromEndpoint(endpoint: ApiEndpoint, schemes: Record<string, ApiSecurityScheme>): Auth {
  const scheme = endpoint.security?.[0] ? schemes[endpoint.security[0].scheme] : undefined;
  if (!scheme) return { type: 'none' };
  if (scheme.type === 'apiKey' && scheme.name) {
    return {
      type: 'apikey',
      key: scheme.name,
      value: '',
      addTo: scheme.location === 'query' ? 'query' : 'header',
    };
  }
  if (scheme.type === 'basic' || (scheme.type === 'http' && scheme.scheme === 'basic')) {
    return { type: 'basic', username: '', password: '' };
  }
  return scheme.type === 'http' && scheme.scheme?.toLowerCase() === 'bearer'
    ? { type: 'bearer', token: '' }
    : { type: 'none' };
}

export function OpenAPIPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const setRequestDraft = useAppStore((state) => state.setRequestDraft);
  const activeSpecification = useAppStore((state) => state.activeSpecification);
  const setActiveSpecification = useAppStore((state) => state.setActiveSpecification);
  const [file, setFile] = useState<File>();
  const [specification, setSpecification] = useState<ApiSpecification | undefined>(
    () => activeSpecification
  );
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | undefined>(
    () => activeSpecification?.endpoints[0]?.id
  );
  const [error, setError] = useState<string>();
  const [errorDetails, setErrorDetails] = useState<string[]>();
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setSpecification(activeSpecification);
    if (!selectedEndpointId && activeSpecification?.endpoints[0]?.id) {
      setSelectedEndpointId(activeSpecification.endpoints[0].id);
    } else if (!activeSpecification) {
      setSelectedEndpointId(undefined);
    }
  }, [activeSpecification, selectedEndpointId]);

  const selectedEndpoint = specification?.endpoints.find(
    (endpoint) => endpoint.id === selectedEndpointId
  );

  const selectFile = (candidate?: File) => {
    setError(undefined);
    setErrorDetails(undefined);
    setSpecification(undefined);
    setSelectedEndpointId(undefined);
    if (!candidate) return;
    const extension = `.${candidate.name.split('.').pop()?.toLowerCase()}`;
    if (!ACCEPTED_TYPES.includes(extension)) {
      setFile(undefined);
      setError('Unsupported file type. Select a .json, .yaml, or .yml specification.');
      return;
    }
    if (candidate.size === 0) {
      setFile(undefined);
      setError('The selected file is empty.');
      return;
    }
    setFile(candidate);
  };

  const importFile = async () => {
    if (!file) return;
    setLoading(true);
    setError(undefined);
    setErrorDetails(undefined);
    try {
      const content = await file.text();
      const result = await openApiService.importSpecification(file.name, content);
      if (result.success) {
        setSpecification(result.specification);
        setActiveSpecification(result.specification);
        setSelectedEndpointId(result.specification.endpoints[0]?.id);
      } else {
        setSpecification(undefined);
        setError(result.error.message);
        setErrorDetails(result.error.details);
      }
    } catch (err: unknown) {
      setSpecification(undefined);
      setError(err instanceof Error ? err.message : 'Failed to import specification.');
    } finally {
      setLoading(false);
    }
  };

  const openInBuilder = (endpoint: ApiEndpoint) => {
    const server = specification?.servers[0]?.url ?? '';
    const queryParams: QueryParam[] = endpoint.parameters
      .filter((parameter) => parameter.location === 'query')
      .map((parameter) => ({
        id: crypto.randomUUID(),
        key: parameter.name,
        value: String(parameter.example ?? parameter.default ?? ''),
        enabled: true,
      }));
    const headers: Header[] = endpoint.parameters
      .filter((parameter) => parameter.location === 'header')
      .map((parameter) => ({
        id: crypto.randomUUID(),
        key: parameter.name,
        value: String(parameter.example ?? parameter.default ?? ''),
        enabled: true,
      }));
    const content =
      endpoint.requestBody?.content.find((item) => item.contentType === 'application/json') ??
      endpoint.requestBody?.content[0];
    if (content?.contentType) {
      headers.unshift({
        id: crypto.randomUUID(),
        key: 'Content-Type',
        value: content.contentType,
        enabled: true,
      });
    }
    const example = firstExample(content);
    setRequestDraft({
      method: endpoint.method as HttpMethod,
      url: `${server.replace(/\/$/, '')}${endpoint.path}`,
      queryParams,
      headers,
      body: example === undefined ? '' : JSON.stringify(example, null, 2),
      auth: authFromEndpoint(endpoint, specification?.securitySchemes ?? {}),
    });
    navigate('/request-builder');
  };

  if (specification) {
    return (
      <Explorer
        specification={specification}
        selectedEndpoint={selectedEndpoint}
        onSelect={setSelectedEndpointId}
        onOpen={openInBuilder}
        onReset={() => {
          setSpecification(undefined);
          setActiveSpecification(undefined);
          setFile(undefined);
          setSelectedEndpointId(undefined);
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <section className="panel-surface p-5 sm:p-6">
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
            <FileCode2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900">
              Import an API specification
            </h2>
            <p className="text-xs text-slate-500">
              Upload an OpenAPI 3.0/3.1 or Swagger 2.0 JSON or YAML file to generate tests and mock endpoints
            </p>
          </div>
        </div>
      </section>

      <section className="panel-surface p-5 sm:p-6">
        <input
          ref={inputRef}
          type="file"
          accept=".json,.yaml,.yml,application/json,application/yaml,text/yaml"
          className="hidden"
          onChange={(event) => selectFile(event.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            selectFile(event.dataTransfer.files[0]);
          }}
          className={`flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
            dragging
              ? 'border-blue-500 bg-sky-50/50'
              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
          }`}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
            <UploadCloud className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-800">
            Drop your specification here, or choose a file
          </p>
          <p className="mt-1 text-xs text-slate-500">
            JSON, YAML, or YML · OpenAPI 3.0/3.1 · Swagger 2.0
          </p>
        </button>

        {file && (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <FileCode2 className="h-5 w-5 shrink-0 text-sky-600" />
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-800">{file.name}</p>
                <p className="text-[11px] text-slate-500">
                  {file.type || file.name.split('.').pop()?.toUpperCase()} · {formatSize(file.size)}
                </p>
              </div>
            </div>
            <Button size="sm" onClick={importFile} disabled={loading} className="gap-1.5 h-8 text-xs font-medium">
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Parsing
                </>
              ) : (
                <>
                  <FileUp className="h-3.5 w-3.5" />
                  Import
                </>
              )}
            </Button>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800">
            <div className="flex items-center gap-2 font-semibold">
              <XCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
            {errorDetails?.length ? (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[11px]">
                {errorDetails.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

function Explorer({
  specification,
  selectedEndpoint,
  onSelect,
  onOpen,
  onReset,
}: {
  specification: ApiSpecification;
  selectedEndpoint?: ApiEndpoint;
  onSelect: (id: string) => void;
  onOpen: (endpoint: ApiEndpoint) => void;
  onReset: () => void;
}) {
  const groups = specification.endpoints.reduce<Record<string, ApiEndpoint[]>>((all, endpoint) => {
    const group = endpoint.tags[0] || 'Endpoints';
    (all[group] ??= []).push(endpoint);
    return all;
  }, {});

  return (
    <div className="space-y-5">
      {/* Specification Header Card */}
      <section className="panel-surface p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Imported {specification.version.replace('-', ' ')}
            </div>
            <h2 className="mt-1.5 text-xl font-bold tracking-tight text-slate-950">
              {specification.metadata.title}
            </h2>
            <p className="text-xs font-medium text-slate-500">
              Version {specification.metadata.version}
              {specification.metadata.description && ` · ${specification.metadata.description}`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const doc = exportSpecificationToOpenApi(specification);
                downloadJsonFile(
                  `${(specification.metadata.title || 'openapi-spec')
                    .toLowerCase()
                    .replace(/[^a-z0-9_-]/g, '_')}-openapi-3.1.json`,
                  doc
                );
              }}
              className="gap-1.5 h-8 text-xs font-medium border-sky-200 text-sky-700 bg-sky-50 hover:bg-sky-100"
              title="Export as OpenAPI 3.1 JSON"
            >
              <Download className="h-3.5 w-3.5 text-sky-600" />
              Export OAS 3.1
            </Button>
            <Button variant="outline" size="sm" onClick={onReset} className="h-8 text-xs font-medium">
              Import another file
            </Button>
          </div>
        </div>

        {/* Compact Servers Row */}
        {specification.servers.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Server:</span>
            {specification.servers.map((server) => (
              <span
                key={server.url}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs text-slate-700"
              >
                {server.url}
                {server.description && (
                  <span className="font-sans text-[10px] text-slate-400">({server.description})</span>
                )}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* 2-Column Explorer: Endpoints & Endpoint Detail */}
      <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.65fr)]">
        {/* Endpoints List Column */}
        <section className="panel-surface p-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 px-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Endpoints</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
              {specification.endpoints.length} ops
            </span>
          </div>
          <div className="mt-3 max-h-[640px] space-y-3.5 overflow-y-auto pr-1">
            {Object.entries(groups).map(([tag, endpoints]) => (
              <div key={tag}>
                <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{tag}</p>
                <div className="mt-1.5 space-y-1">
                  {endpoints.map((endpoint) => {
                    const isSelected = selectedEndpoint?.id === endpoint.id;
                    return (
                      <button
                        key={endpoint.id}
                        type="button"
                        onClick={() => onSelect(endpoint.id)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                          isSelected
                            ? 'bg-slate-900 text-white shadow-xs'
                            : 'hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold shrink-0 ${
                            isSelected ? 'bg-white/20 text-white' : methodColor[endpoint.method]
                          }`}
                        >
                          {endpoint.method}
                        </span>
                        <span className="min-w-0 truncate font-mono text-xs">{endpoint.path}</span>
                        <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 opacity-50" />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Endpoint Detail Column */}
        {selectedEndpoint ? (
          <EndpointDetail
            endpoint={selectedEndpoint}
            schemes={specification.securitySchemes}
            onOpen={() => onOpen(selectedEndpoint)}
          />
        ) : (
          <section className="panel-surface flex min-h-64 items-center justify-center p-6 text-xs text-slate-400">
            Select an endpoint from the left to inspect its definition.
          </section>
        )}
      </div>
    </div>
  );
}

function EndpointDetail({
  endpoint,
  schemes,
  onOpen,
}: {
  endpoint: ApiEndpoint;
  schemes: Record<string, ApiSecurityScheme>;
  onOpen: () => void;
}) {
  return (
    <section className="panel-surface p-5 sm:p-6 space-y-5">
      <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start">
        <div>
          <div className="flex items-center gap-2.5">
            <span className={`rounded px-2 py-0.5 text-xs font-bold ${methodColor[endpoint.method]}`}>
              {endpoint.method}
            </span>
            <code className="text-sm font-bold text-slate-800">{endpoint.path}</code>
            {endpoint.deprecated && (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                Deprecated
              </span>
            )}
          </div>
          <h3 className="mt-2 text-base font-bold text-slate-950">
            {endpoint.summary || endpoint.operationId || 'Untitled operation'}
          </h3>
          {endpoint.description && (
            <p className="mt-1 text-xs leading-relaxed text-slate-600">{endpoint.description}</p>
          )}
        </div>
        <Button onClick={onOpen} size="sm" className="gap-1.5 h-8.5 text-xs font-medium shrink-0">
          <Send className="h-3.5 w-3.5" />
          Open in Request Builder
        </Button>
      </div>

      <DetailSection title="Parameters">
        {endpoint.parameters.length ? (
          <div className="overflow-x-auto rounded-lg border border-slate-200/80">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">In</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Required</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {endpoint.parameters.map((parameter) => (
                  <tr key={`${parameter.location}-${parameter.name}`} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2 font-medium text-slate-800 font-mono">
                      {parameter.name}
                      {parameter.description && (
                        <p className="text-[11px] font-sans font-normal text-slate-500">
                          {parameter.description}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-500">{parameter.location}</td>
                    <td className="px-3 py-2 font-mono text-slate-600">{schemaLabel(parameter.schema)}</td>
                    <td className="px-3 py-2 text-slate-500">{parameter.required ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyDetail text="No parameters defined." />
        )}
      </DetailSection>

      <DetailSection title="Request Body">
        {endpoint.requestBody ? (
          <div className="space-y-2.5">
            <p className="text-xs text-slate-500">
              {endpoint.requestBody.required ? 'Required' : 'Optional'}
              {endpoint.requestBody.description ? ` · ${endpoint.requestBody.description}` : ''}
            </p>
            {endpoint.requestBody.content.map((content) => (
              <ContentCard key={content.contentType} content={content} />
            ))}
          </div>
        ) : (
          <EmptyDetail text="No request body defined." />
        )}
      </DetailSection>

      <DetailSection title="Authentication">
        {endpoint.security?.length ? (
          <div className="space-y-1.5">
            {endpoint.security.map((requirement) => {
              const scheme = schemes[requirement.scheme];
              return (
                <div
                  key={requirement.scheme}
                  className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs border border-slate-100"
                >
                  <ShieldCheck className="h-4 w-4 text-slate-500" />
                  <span className="font-semibold text-slate-800">{requirement.scheme}</span>
                  <span className="text-slate-500">
                    {scheme ? `${scheme.type}${scheme.scheme ? ` · ${scheme.scheme}` : ''}` : 'Referenced scheme'}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyDetail
            text={
              endpoint.security === null
                ? 'No operation-level security requirement is declared.'
                : 'No authentication required.'
            }
          />
        )}
      </DetailSection>

      <DetailSection title="Responses">
        {endpoint.responses.length ? (
          <div className="space-y-2.5">
            {endpoint.responses.map((response) => (
              <div key={response.statusCode} className="rounded-xl border border-slate-200/80 bg-white p-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-800">
                    {response.statusCode}
                  </span>
                  <span className="text-xs font-medium text-slate-600">
                    {response.description || 'No description'}
                  </span>
                </div>
                {response.content.length > 0 && (
                  <div className="mt-2.5 space-y-2">
                    {response.content.map((content) => (
                      <ContentCard key={content.contentType} content={content} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyDetail text="No responses defined." />
        )}
      </DetailSection>
    </section>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pt-2">
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">{title}</h4>
      {children}
    </div>
  );
}

function EmptyDetail({ text }: { text: string }) {
  return <p className="text-xs text-slate-400 italic">{text}</p>;
}

function ContentCard({ content }: { content: ApiMediaContent }) {
  const example = firstExample(content);
  return (
    <div className="rounded-lg bg-slate-50/80 border border-slate-100 p-2.5">
      <p className="font-mono text-xs font-medium text-slate-600">
        {content.contentType} {content.schema ? `· ${schemaLabel(content.schema)}` : ''}
      </p>
      {example !== undefined && (
        <pre className="mt-2 max-h-48 overflow-x-auto rounded bg-slate-900 p-2.5 font-mono text-[11px] text-slate-100">
          {JSON.stringify(example, null, 2)}
        </pre>
      )}
    </div>
  );
}
