import { Copy, Download, Sparkles, Check, Code } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/useAppStore';
import { formatJson, generateJson } from '@/lib/jsonGenerator';

export function JsonGeneratorPage() {
  const specification = useAppStore((state) => state.activeSpecification);
  const [schemaId, setSchemaId] = useState('');
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  const schemas = useMemo(() => Object.entries(specification?.schemas ?? {}), [specification]);
  const selected = schemas.find(([name]) => name === schemaId)?.[1];

  const format = () => {
    const result = formatJson(text);
    if ('error' in result) {
      setMessage(`Invalid JSON: ${result.error}`);
    } else {
      setText(result.value);
      setMessage('JSON formatted.');
    }
  };

  const generate = () => {
    const result = generateJson(selected);
    if (result.value !== undefined) {
      setText(JSON.stringify(result.value, null, 2));
    }
    setMessage(
      result.unsupported.length
        ? `Generated supported fields. Unsupported: ${result.unsupported.join(', ')}`
        : result.value === undefined
        ? 'No JSON could be generated.'
        : 'Generated valid JSON.'
    );
  };

  const copy = async () => {
    const result = formatJson(text);
    if ('error' in result) {
      setMessage(`Invalid JSON: ${result.error}`);
      return;
    }
    await navigator.clipboard?.writeText(result.value);
    setCopied(true);
    setMessage('JSON copied.');
    setTimeout(() => setCopied(false), 2000);
  };

  const download = () => {
    const result = formatJson(text);
    if ('error' in result) {
      setMessage(`Invalid JSON: ${result.error}`);
      return;
    }
    const url = URL.createObjectURL(new Blob([result.value], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'payload.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Schema Selection */}
      <section className="panel-surface p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">JSON Payload Generator</h1>
              <p className="text-xs text-slate-500">
                Deterministic sample generation from OpenAPI schemas; format and validate JSON payloads
              </p>
            </div>
          </div>

          {specification && schemas.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="openapi-schema-select" className="text-xs font-bold text-slate-500">
                OpenAPI Schema:
              </label>
              <select
                id="openapi-schema-select"
                aria-label="OpenAPI schema"
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs"
                value={schemaId}
                onChange={(e) => setSchemaId(e.target.value)}
              >
                <option value="">Select a schema</option>
                {schemas.map(([name]) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {!specification ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-500">
            No specification imported. You can still format and validate JSON, but schema generation is unavailable.
          </div>
        ) : schemas.length === 0 ? (
          <p className="mt-4 text-xs text-slate-400">This specification has no reusable schemas.</p>
        ) : null}
      </section>

      {/* Code Editor & Action Bar */}
      <section className="panel-surface p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Code className="h-4 w-4 text-slate-400" />
            <span className="text-xs font-bold text-slate-600">JSON Payload Editor</span>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={format} className="text-xs font-medium">
              Format JSON
            </Button>
            <Button
              size="sm"
              variant="default"
              onClick={generate}
              disabled={!selected}
              className="text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white"
            >
              Generate JSON
            </Button>
            <Button variant="outline" size="sm" onClick={copy} className="text-xs gap-1.5">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              Copy
            </Button>
            <Button variant="outline" size="sm" onClick={download} className="text-xs gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Download .json
            </Button>
          </div>
        </div>

        <textarea
          aria-label="JSON editor"
          className="min-h-96 w-full rounded-xl border border-slate-200 bg-slate-900 p-4 font-mono text-sm text-slate-100 shadow-inner focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='{"example": true}'
          spellCheck={false}
        />

        {message && (
          <div
            role="status"
            className={`rounded-xl border p-3 text-xs font-medium ${
              message.startsWith('Invalid JSON')
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800'
            }`}
          >
            {message}
          </div>
        )}

        <p className="text-[11px] text-slate-400 leading-normal">
          Supported types: objects, arrays, strings, numbers, integers, booleans, required properties, enums, defaults, examples, and nested schemas. Composition keywords and unspecified types are reported as unsupported.
        </p>
      </section>
    </div>
  );
}
