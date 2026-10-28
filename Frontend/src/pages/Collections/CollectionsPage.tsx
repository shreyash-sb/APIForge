import {
  BookMarked,
  Download,
  FolderKanban,
  Network,
  Plus,
  Radar,
  Send,
  Sparkles,
  Trash2,
  Workflow,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadJsonFile, exportCollectionToOpenApi } from "@/lib/openApiExporter";
import { openApiService } from "@/services/openapiService";
import { useAppStore } from "@/store/useAppStore";
import type { ApiCollection, HttpMethod } from "@/types/request.types";

const blankRequest = (method: HttpMethod = 'GET') => ({
  id: crypto.randomUUID(),
  name: `New ${method} request`,
  method,
  url: '',
  queryParams: [],
  headers: [],
  body: method === 'POST' || method === 'PUT' || method === 'PATCH' ? '{\n  \n}' : '',
  auth: { type: 'none' as const },
});

const methodBadgeColor: Record<string, string> = {
  GET: 'bg-sky-50 text-sky-700 border-sky-200',
  POST: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PUT: 'bg-amber-50 text-amber-700 border-amber-200',
  PATCH: 'bg-violet-50 text-violet-700 border-violet-200',
  DELETE: 'bg-rose-50 text-rose-700 border-rose-200',
};

export function CollectionsPage() {
  const navigate = useNavigate();
  const {
    collections,
    createCollection,
    updateCollection,
    deleteCollection,
    setRequestDraft,
    createWorkflow,
    setActiveWorkflowId,
    setActiveSpecification,
  } = useAppStore();
  const [name, setName] = useState('');

  const loadDemoCollection = () => {
    const colId = createCollection('User Management API Demo Suite');
    updateCollection(colId, {
      requests: [
        {
          id: `req-get-users-${crypto.randomUUID().slice(0, 4)}`,
          name: '1. Retrieve All Users',
          method: 'GET',
          url: 'http://localhost:3001/api/mock/serve/api/users',
          queryParams: [],
          headers: [{ id: 'h-accept-users', key: 'Accept', value: 'application/json', enabled: true }],
          body: '',
          auth: { type: 'none' },
        },
        {
          id: `req-get-aarav-${crypto.randomUUID().slice(0, 4)}`,
          name: '2. Get Aarav Patil (ID: 101)',
          method: 'GET',
          url: 'http://localhost:3001/api/mock/serve/api/users/101',
          queryParams: [],
          headers: [{ id: 'h-accept-aarav', key: 'Accept', value: 'application/json', enabled: true }],
          body: '',
          auth: { type: 'none' },
        },
        {
          id: `req-create-aarav-${crypto.randomUUID().slice(0, 4)}`,
          name: '3. Create User (Aarav Patil)',
          method: 'POST',
          url: 'http://localhost:3001/api/mock/serve/api/users',
          queryParams: [],
          headers: [{ id: 'h-ct-aarav', key: 'Content-Type', value: 'application/json', enabled: true }],
          body: JSON.stringify(
            {
              name: 'Aarav Patil',
              email: 'aarav@example.com',
              role: 'student',
              active: true,
            },
            null,
            2
          ),
          auth: { type: 'none' },
        },
        {
          id: `req-delete-aarav-${crypto.randomUUID().slice(0, 4)}`,
          name: '4. Delete User (ID: 101)',
          method: 'DELETE',
          url: 'http://localhost:3001/api/mock/serve/api/users/101',
          queryParams: [],
          headers: [],
          body: '',
          auth: { type: 'none' },
        },
      ],
    });
  };

  const handleRunAsWorkflow = (collection: ApiCollection) => {
    const workflowId = createWorkflow({
      name: `${collection.name || 'Collection'} Workflow`,
      description: `Automated execution sequence generated from collection "${collection.name}"`,
      steps: collection.requests.map((req, idx) => ({
        id: `step-${idx + 1}-${crypto.randomUUID().slice(0, 4)}`,
        name: req.name || `Step ${idx + 1}`,
        enabled: true,
        request: {
          method: req.method,
          url: req.url || 'http://localhost:3001/api/mock/serve/api/users',
          headers: req.headers || [],
          queryParams: req.queryParams || [],
          body: req.body || '',
          auth: req.auth || { type: 'none' },
        },
        dependsOn: idx > 0 ? [`step-${idx}`] : [],
        extractors:
          idx === 0
            ? [
                {
                  targetVariable: 'userId',
                  source: 'BODY_JSONPATH',
                  path: '$.id',
                  defaultValue: '101',
                  isSecret: false,
                },
              ]
            : [],
      })),
    });
    setActiveWorkflowId(workflowId);
    navigate('/workflows');
  };

  const handleViewDocumentation = async (collection: ApiCollection) => {
    const spec = exportCollectionToOpenApi(collection);
    const result = await openApiService.importSpecification(
      `${(collection.name || 'collection').toLowerCase().replace(/[^a-z0-9_-]/g, '_')}-spec.json`,
      JSON.stringify(spec, null, 2)
    );
    if (result.success && result.specification) {
      setActiveSpecification(result.specification);
      navigate('/documentation');
    } else {
      navigate('/documentation');
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Banner & Collection Creation Bar */}
      <div className="panel-surface p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">API Collections</h2>
          <p className="text-xs text-slate-500">
            Save, organize, and export reusable API suites; launch into Request Builder, Workflows, or Documentation
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Input
            aria-label="Collection name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New collection name..."
            className="h-10 w-56 sm:w-64 bg-white text-xs rounded-xl shadow-xs"
          />
          <Button
            size="default"
            className="h-10 px-4 shrink-0 gap-2 text-xs font-semibold bg-primary text-white hover:bg-primary/90 shadow-sm rounded-xl"
            onClick={() => {
              createCollection(name);
              setName('');
            }}
          >
            <Plus className="h-4 w-4" />
            Create Collection
          </Button>
          <Button
            variant="outline"
            size="default"
            onClick={loadDemoCollection}
            className="h-10 px-3.5 shrink-0 gap-1.5 text-xs font-medium border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl"
            title="Load standard User Management demonstration collection"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            Load Demo Suite
          </Button>
        </div>
      </div>

      {collections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200/80 bg-white/50 p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
            <FolderKanban className="h-6 w-6" />
          </div>
          <h3 className="mt-3 text-sm font-bold text-slate-900">No saved collections</h3>
          <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
            Create a collection above or load the pre-configured User Management suite.
          </p>
          <Button
            onClick={loadDemoCollection}
            className="mt-4 h-9 px-4 gap-1.5 text-xs font-semibold bg-primary text-white hover:bg-primary/90 rounded-xl"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-300" />
            Load Demo Collection
          </Button>
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
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRunAsWorkflow(collection)}
                    disabled={collection.requests.length === 0}
                    className="h-8 shrink-0 gap-1.5 border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 text-xs font-medium"
                    title="Execute this entire collection as an automated sequence in Workflows"
                  >
                    <Workflow className="h-3.5 w-3.5 text-indigo-600" />
                    Run in Workflows
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewDocumentation(collection)}
                    disabled={collection.requests.length === 0}
                    className="h-8 shrink-0 gap-1.5 border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 text-xs font-medium"
                    title="Generate and view API documentation from this collection"
                  >
                    <BookMarked className="h-3.5 w-3.5 text-emerald-600" />
                    Documentation
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const spec = exportCollectionToOpenApi(collection);
                      downloadJsonFile(
                        `${(collection.name || 'collection').toLowerCase().replace(/[^a-z0-9_-]/g, '_')}-openapi-3.1.json`,
                        spec
                      );
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
                    <div className="flex flex-wrap lg:flex-nowrap items-center gap-2 p-2 rounded-xl border border-slate-100 hover:border-slate-200 bg-slate-50/50 hover:bg-white transition-all" key={request.id}>
                      <select
                        aria-label={`Request ${index + 1} method`}
                        value={request.method}
                        onChange={(e) =>
                          updateCollection(collection.id, {
                            requests: collection.requests.map((item) =>
                              item.id === request.id ? { ...item, method: e.target.value as any } : item
                            ),
                          })
                        }
                        className={`w-20 shrink-0 rounded-lg py-1 px-1.5 text-center text-[11px] font-bold uppercase tracking-wider border cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-xs ${
                          methodBadgeColor[request.method] || 'bg-slate-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                        <option value="PATCH">PATCH</option>
                        <option value="DELETE">DELETE</option>
                        <option value="HEAD">HEAD</option>
                        <option value="OPTIONS">OPTIONS</option>
                      </select>
                      <Input
                        aria-label={`Request ${index + 1} name`}
                        value={request.name}
                        placeholder="Request name"
                        className="h-8.5 w-full sm:w-48 shrink-0 text-xs bg-white"
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
                        className="h-8.5 flex-1 min-w-[200px] font-mono text-xs bg-white"
                        onChange={(e) =>
                          updateCollection(collection.id, {
                            requests: collection.requests.map((item) =>
                              item.id === request.id ? { ...item, url: e.target.value } : item
                            ),
                          })
                        }
                      />

                      {/* Necessary Page Actions for this Request */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          title="Open and execute in Request Builder"
                          className="h-8 shrink-0 px-2.5 text-xs font-medium text-sky-700 border-sky-200 bg-sky-50 hover:bg-sky-100 gap-1 rounded-lg"
                          onClick={() => {
                            setRequestDraft({
                              method: request.method,
                              url: request.url,
                              queryParams: request.queryParams || [],
                              headers: request.headers || [],
                              body: request.body || '',
                              auth: request.auth || { type: 'none' },
                            });
                            navigate('/request-builder');
                          }}
                        >
                          <Send className="h-3 w-3" />
                          <span>Request</span>
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          title="Validate this request against contract rules in Response Validation"
                          className="h-8 shrink-0 px-2.5 text-xs font-medium text-violet-700 border-violet-200 bg-violet-50 hover:bg-violet-100 gap-1 rounded-lg"
                          onClick={() => {
                            setRequestDraft({
                              method: request.method,
                              url: request.url,
                              queryParams: request.queryParams || [],
                              headers: request.headers || [],
                              body: request.body || '',
                              auth: request.auth || { type: 'none' },
                            });
                            navigate('/response-validation');
                          }}
                        >
                          <Radar className="h-3 w-3" />
                          <span>Validate</span>
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          title="View and configure in Mock Server"
                          className="h-8 shrink-0 px-2.5 text-xs font-medium text-slate-600 border-slate-200 bg-white hover:bg-slate-100 gap-1 rounded-lg"
                          onClick={() => {
                            navigate('/mock-server');
                          }}
                        >
                          <Network className="h-3 w-3" />
                          <span>Mock</span>
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 shrink-0 p-0 text-slate-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg"
                          onClick={() =>
                            updateCollection(collection.id, {
                              requests: collection.requests.filter((item) => item.id !== request.id),
                            })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Bottom Actions */}
              <div className="mt-3.5 border-t border-slate-100 pt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs font-semibold gap-1.5 bg-slate-900 text-white hover:bg-slate-800"
                    onClick={() =>
                      updateCollection(collection.id, {
                        requests: [...collection.requests, blankRequest('GET')],
                      })
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Request
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[11px] font-bold border-sky-200 text-sky-700 bg-sky-50 hover:bg-sky-100"
                    onClick={() =>
                      updateCollection(collection.id, {
                        requests: [...collection.requests, blankRequest('GET')],
                      })
                    }
                  >
                    + GET
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[11px] font-bold border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                    onClick={() =>
                      updateCollection(collection.id, {
                        requests: [...collection.requests, blankRequest('POST')],
                      })
                    }
                  >
                    + POST
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[11px] font-bold border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100"
                    onClick={() =>
                      updateCollection(collection.id, {
                        requests: [...collection.requests, blankRequest('PUT')],
                      })
                    }
                  >
                    + PUT
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[11px] font-bold border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100"
                    onClick={() =>
                      updateCollection(collection.id, {
                        requests: [...collection.requests, blankRequest('DELETE')],
                      })
                    }
                  >
                    + DELETE
                  </Button>
                </div>
                <span className="text-[11px] text-slate-400">
                  Click 'Request' to configure headers & body in Request Builder
                </span>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
