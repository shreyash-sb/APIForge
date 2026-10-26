import { Download, FolderKanban, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadJsonFile, exportCollectionToOpenApi } from "@/lib/openApiExporter";
import { useAppStore } from "@/store/useAppStore";

const blankRequest = () => ({ id: crypto.randomUUID(), name: 'New request', method: 'GET' as const, url: '', queryParams: [], headers: [], body: '', auth: { type: 'none' as const } });

const methodBadgeColor: Record<string, string> = {
  GET: 'bg-sky-50 text-sky-700 border-sky-200',
  POST: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PUT: 'bg-amber-50 text-amber-700 border-amber-200',
  PATCH: 'bg-violet-50 text-violet-700 border-violet-200',
  DELETE: 'bg-rose-50 text-rose-700 border-rose-200',
};

export function CollectionsPage() {
  const { collections, createCollection, updateCollection, deleteCollection } = useAppStore();
  const [name, setName] = useState('');

  return (
    <div className="space-y-5">
      <div className="panel-surface p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">API Collections</h2>
          <p className="text-xs text-slate-500">Save, organize, and export reusable API test suites</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            aria-label="Collection name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Collection name"
            className="h-8.5 w-52 sm:w-60 bg-white text-xs"
          />
          <Button
            size="sm"
            className="h-8.5 shrink-0 gap-1.5 text-xs font-medium"
            onClick={() => {
              createCollection(name);
              setName('');
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Create collection
          </Button>
        </div>
      </div>

      {collections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200/80 bg-white/50 p-10 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <FolderKanban className="h-5 w-5" />
          </div>
          <h3 className="mt-3 text-sm font-bold text-slate-900">No saved collections</h3>
          <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
            Create a collection above to group endpoints into reusable suites.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {collections.map((collection) => (
            <section key={collection.id} className="panel-surface p-4 sm:p-5">
              {/* Collection Header Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
                <div className="flex flex-1 min-w-[240px] items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                    <FolderKanban className="h-4 w-4" />
                  </div>
                  <Input
                    aria-label={`Collection ${collection.name}`}
                    value={collection.name}
                    onChange={(e) => updateCollection(collection.id, { name: e.target.value })}
                    className="h-8.5 max-w-sm text-sm font-bold text-slate-900"
                  />
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                    {collection.requests.length} {collection.requests.length === 1 ? 'request' : 'requests'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const spec = exportCollectionToOpenApi(collection);
                      downloadJsonFile(`${(collection.name || 'collection').toLowerCase().replace(/[^a-z0-9_-]/g, '_')}-openapi-3.1.json`, spec);
                    }}
                    className="h-8 shrink-0 gap-1.5 border-sky-200 text-sky-700 bg-sky-50 hover:bg-sky-100 text-xs font-medium"
                    title="Export collection as OpenAPI 3.1 JSON"
                  >
                    <Download className="h-3.5 w-3.5 text-sky-600" />
                    Export OAS 3.1
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteCollection(collection.id)}
                    className="h-8 shrink-0 border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 text-xs font-medium"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </div>

              {/* Requests List */}
              <div className="mt-3.5 space-y-2.5">
                {collection.requests.length === 0 ? (
                  <p className="py-3 text-center text-xs text-slate-400">No requests in this collection yet.</p>
                ) : (
                  collection.requests.map((request, index) => (
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-2" key={request.id}>
                      <span className={`w-14 shrink-0 rounded py-1 text-center text-[10px] font-bold uppercase tracking-wider border ${methodBadgeColor[request.method] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                        {request.method}
                      </span>
                      <Input
                        aria-label={`Request ${index + 1} name`}
                        value={request.name}
                        placeholder="Request name"
                        className="h-8.5 w-full sm:w-52 shrink-0 text-xs"
                        onChange={(e) =>
                          updateCollection(collection.id, {
                            requests: collection.requests.map((item) =>
                              item.id === request.id ? { ...item, name: e.target.value } : item
                            ),
                          })
                        }
                      />
                      <Input
                        aria-label={`Request ${index + 1} URL`}
                        value={request.url}
                        placeholder="https://api.example.com/resource"
                        className="h-8.5 flex-1 min-w-[200px] font-mono text-xs"
                        onChange={(e) =>
                          updateCollection(collection.id, {
                            requests: collection.requests.map((item) =>
                              item.id === request.id ? { ...item, url: e.target.value } : item
                            ),
                          })
                        }
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8.5 w-8.5 shrink-0 p-0 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        onClick={() =>
                          updateCollection(collection.id, {
                            requests: collection.requests.filter((item) => item.id !== request.id),
                          })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))
                )}
              </div>

              {/* Bottom Actions */}
              <div className="mt-3.5 border-t border-slate-100 pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs font-medium gap-1.5"
                  onClick={() =>
                    updateCollection(collection.id, {
                      requests: [...collection.requests, blankRequest()],
                    })
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add request
                </Button>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
