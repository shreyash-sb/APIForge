import {
  BookMarked,
  Download,
  FolderKanban,
  Network,
  Plus,
  Radar,
  Send,
  ShoppingBag,
  Sparkles,
  Trash2,
  Upload,
  Users,
  Workflow,
} from "lucide-react";
import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parsePostmanCollection } from "@/lib/curlParser";
import { downloadJsonFile, exportCollectionToOpenApi } from "@/lib/openApiExporter";
import { openApiService } from "@/services/openapiService";
import { useAppStore } from "@/store/useAppStore";
import type { ApiCollection, HttpMethod } from "@/types/request.types";

const blankRequest = (method: HttpMethod = 'GET') => ({
  id: crypto.randomUUID(),
  name: `New ${method} request`,
  method,
  url: 'http://localhost:3001/api/mock/serve',
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
  HEAD: 'bg-slate-50 text-slate-700 border-slate-200',
  OPTIONS: 'bg-purple-50 text-purple-700 border-purple-200',
};

export function CollectionsPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  // ── QuickCart E-Commerce Demo Collection (Demo Folder Project) ──
  const loadEcommerceDemoCollection = () => {
    const colId = createCollection('QuickCart E-Commerce Store');
    updateCollection(colId, {
      requests: [
        {
          id: `req-ec-get-prods-${crypto.randomUUID().slice(0, 4)}`,
          name: '1. List All Products (GET)',
          method: 'GET',
          url: 'http://localhost:3001/api/mock/serve/api/products',
          queryParams: [],
          headers: [{ id: 'h-accept-prods', key: 'Accept', value: 'application/json', enabled: true }],
          body: '',
          auth: { type: 'none' },
        },
        {
          id: `req-ec-get-single-${crypto.randomUUID().slice(0, 4)}`,
          name: '2. Get Product Details (GET)',
          method: 'GET',
          url: 'http://localhost:3001/api/mock/serve/api/products/101',
          queryParams: [],
          headers: [{ id: 'h-accept-prod-single', key: 'Accept', value: 'application/json', enabled: true }],
          body: '',
          auth: { type: 'none' },
        },
        {
          id: `req-ec-post-order-${crypto.randomUUID().slice(0, 4)}`,
          name: '3. Create New Order (POST)',
          method: 'POST',
          url: 'http://localhost:3001/api/mock/serve/api/orders',
          queryParams: [],
          headers: [{ id: 'h-ct-order', key: 'Content-Type', value: 'application/json', enabled: true }],
          body: JSON.stringify(
            {
              productId: 'prod-101',
              quantity: 2,
              shippingAddress: '42 Tech Boulevard, Pune, MH',
              paymentMethod: 'UPI',
            },
            null,
            2
          ),
          auth: { type: 'none' },
        },
        {
          id: `req-ec-put-prod-${crypto.randomUUID().slice(0, 4)}`,
          name: '4. Update Product Stock (PUT)',
          method: 'PUT',
          url: 'http://localhost:3001/api/mock/serve/api/products/101',
          queryParams: [],
          headers: [{ id: 'h-ct-put-prod', key: 'Content-Type', value: 'application/json', enabled: true }],
          body: JSON.stringify(
            {
              stock: 45,
              price: 899.99,
            },
            null,
            2
          ),
          auth: { type: 'none' },
        },
        {
          id: `req-ec-del-order-${crypto.randomUUID().slice(0, 4)}`,
          name: '5. Cancel / Delete Order (DELETE)',
          method: 'DELETE',
          url: 'http://localhost:3001/api/mock/serve/api/orders/ord-88392',
          queryParams: [],
          headers: [{ id: 'h-accept-del', key: 'Accept', value: 'application/json', enabled: true }],
          body: '',
          auth: { type: 'none' },
        },
      ],
    });
  };

  // ── User Management Demo Collection (Aarav Patil Record) ──
  const loadUserDemoCollection = () => {
    const colId = createCollection('User Management API Demo Suite');
    updateCollection(colId, {
      requests: [
        {
          id: `req-get-users-${crypto.randomUUID().slice(0, 4)}`,
          name: '1. Retrieve All Users (GET)',
          method: 'GET',
          url: 'http://localhost:3001/api/mock/serve/api/users',
          queryParams: [],
          headers: [{ id: 'h-accept-users', key: 'Accept', value: 'application/json', enabled: true }],
          body: '',
          auth: { type: 'none' },
        },
        {
          id: `req-get-aarav-${crypto.randomUUID().slice(0, 4)}`,
          name: '2. Get Aarav Patil (ID: 101) (GET)',
          method: 'GET',
          url: 'http://localhost:3001/api/mock/serve/api/users/101',
          queryParams: [],
          headers: [{ id: 'h-accept-aarav', key: 'Accept', value: 'application/json', enabled: true }],
          body: '',
          auth: { type: 'none' },
        },
        {
          id: `req-create-aarav-${crypto.randomUUID().slice(0, 4)}`,
          name: '3. Create User (POST)',
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
          id: `req-update-aarav-${crypto.randomUUID().slice(0, 4)}`,
          name: '4. Update User Role (PUT)',
          method: 'PUT',
          url: 'http://localhost:3001/api/mock/serve/api/users/101',
          queryParams: [],
          headers: [{ id: 'h-ct-upd', key: 'Content-Type', value: 'application/json', enabled: true }],
          body: JSON.stringify(
            {
              role: 'senior-student',
              active: true,
            },
            null,
            2
          ),
          auth: { type: 'none' },
        },
        {
          id: `req-delete-aarav-${crypto.randomUUID().slice(0, 4)}`,
          name: '5. Delete User (DELETE)',
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

  // ── Import JSON or Postman Collection from disk ──
  const handleImportCollectionFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        if (!content) return;
        const parsed = JSON.parse(content);

        // 1. Postman Collection v2.1 format
        if (parsed.info && (Array.isArray(parsed.item) || parsed.item)) {
          const items = parsePostmanCollection(content);
          const colName = parsed.info.name || file.name.replace(/\.[^/.]+$/, '');
          const colId = createCollection(colName);
          updateCollection(colId, {
            requests: items.map((it, idx) => ({
              id: `req-postman-${idx}-${crypto.randomUUID().slice(0, 4)}`,
              name: it.name,
              method: it.method,
              url: it.url || 'http://localhost:3001/api/mock/serve',
              headers: it.headers,
              queryParams: [],
              body: it.body,
              auth: { type: 'none' },
            })),
          });
          return;
        }

        // 2. APIForge native collection format
        if (parsed.name && Array.isArray(parsed.requests)) {
          const colId = createCollection(parsed.name);
          updateCollection(colId, {
            requests: parsed.requests.map((r: any, idx: number) => ({
              id: r.id || `req-imported-${idx}-${crypto.randomUUID().slice(0, 4)}`,
              name: r.name || `Request ${idx + 1}`,
              method: r.method || 'GET',
              url: r.url || 'http://localhost:3001/api/mock/serve',
              headers: r.headers || [],
              queryParams: r.queryParams || [],
              body: r.body || '',
              auth: r.auth || { type: 'none' },
            })),
          });
          return;
        }

        // 3. Array of requests fallback
        if (Array.isArray(parsed)) {
          const colId = createCollection(file.name.replace(/\.[^/.]+$/, ''));
          updateCollection(colId, {
            requests: parsed.map((r: any, idx: number) => ({
              id: r.id || `req-item-${idx}`,
              name: r.name || `Request ${idx + 1}`,
              method: r.method || 'GET',
              url: r.url || 'http://localhost:3001/api/mock/serve',
              headers: r.headers || [],
              queryParams: r.queryParams || [],
              body: typeof r.body === 'string' ? r.body : JSON.stringify(r.body || ''),
              auth: { type: 'none' },
            })),
          });
        }
      } catch (err) {
        console.error('Failed to parse collection file:', err);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
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
                  targetVariable: 'id',
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
    <div className="space-y-6">
      {/* Hidden file input for importing collection */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImportCollectionFile}
      />

      {/* Top Banner & Collection Creation Bar */}
      <div className="panel-surface p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">API Collections</h2>
          <p className="text-xs text-slate-500 mt-0.5">
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
            Create
          </Button>

          {/* Quick Demo Suite Loaders */}
          <Button
            variant="outline"
            size="default"
            onClick={loadEcommerceDemoCollection}
            className="h-10 px-3.5 shrink-0 gap-1.5 text-xs font-semibold border-emerald-200 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-xl"
            title="Load the QuickCart E-Commerce Demo Collection"
          >
            <ShoppingBag className="h-3.5 w-3.5 text-emerald-600" />
            + QuickCart Demo
          </Button>

          <Button
            variant="outline"
            size="default"
            onClick={loadUserDemoCollection}
            className="h-10 px-3.5 shrink-0 gap-1.5 text-xs font-semibold border-sky-200 text-sky-800 bg-sky-50 hover:bg-sky-100 rounded-xl"
            title="Load User Management API Demo Suite (Aarav Patil)"
          >
            <Users className="h-3.5 w-3.5 text-sky-600" />
            + User API Demo
          </Button>

          <Button
            variant="outline"
            size="default"
            onClick={() => fileInputRef.current?.click()}
            className="h-10 px-3.5 shrink-0 gap-1.5 text-xs font-medium border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl"
            title="Import collection from JSON or Postman collection file"
          >
            <Upload className="h-3.5 w-3.5 text-indigo-500" />
            Import File
          </Button>
        </div>
      </div>

      {collections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200/90 bg-white/70 p-10 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 shadow-xs">
            <FolderKanban className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-base font-bold text-slate-900">No Saved Collections Yet</h3>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
            Create an empty collection above or load one of our ready-to-test demo suites with complete GET, POST, PUT, and DELETE requests:
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-3.5 max-w-lg mx-auto">
            <Button
              onClick={loadEcommerceDemoCollection}
              className="h-11 px-5 gap-2 text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl shadow-sm"
            >
              <ShoppingBag className="h-4 w-4" />
              Load QuickCart E-Commerce Demo
            </Button>
            <Button
              onClick={loadUserDemoCollection}
              className="h-11 px-5 gap-2 text-xs font-bold bg-sky-600 text-white hover:bg-sky-700 rounded-xl shadow-sm"
            >
              <Users className="h-4 w-4" />
              Load User Management Demo
            </Button>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="h-11 px-5 gap-2 text-xs font-semibold border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl"
            >
              <Upload className="h-4 w-4 text-indigo-600" />
              Import Postman / JSON File
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {collections.map((collection) => (
            <section key={collection.id} className="panel-surface p-5 sm:p-6 space-y-4">
              {/* Collection Header Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex flex-1 min-w-[240px] items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 shadow-xs">
                    <FolderKanban className="h-4.5 w-4.5" />
                  </div>
                  <Input
                    aria-label={`Collection ${collection.name}`}
                    value={collection.name}
                    onChange={(e) => updateCollection(collection.id, { name: e.target.value })}
                    className="h-9 max-w-sm text-sm font-bold text-slate-900 bg-white"
                  />
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                    {collection.requests.length} {collection.requests.length === 1 ? 'request' : 'requests'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRunAsWorkflow(collection)}
                    disabled={collection.requests.length === 0}
                    className="h-8.5 px-3 shrink-0 gap-1.5 border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 text-xs font-semibold rounded-lg"
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
                    className="h-8.5 px-3 shrink-0 gap-1.5 border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold rounded-lg"
                    title="Generate and view interactive API documentation from this collection"
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
                    className="h-8.5 px-3 shrink-0 gap-1.5 border-sky-200 text-sky-700 bg-sky-50 hover:bg-sky-100 text-xs font-semibold rounded-lg"
                    title="Export collection as OpenAPI 3.1 JSON"
                  >
                    <Download className="h-3.5 w-3.5 text-sky-600" />
                    Export OAS 3.1
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      downloadJsonFile(
                        `${(collection.name || 'collection').toLowerCase().replace(/[^a-z0-9_-]/g, '_')}-collection.json`,
                        collection
                      );
                    }}
                    className="h-8.5 px-2.5 shrink-0 gap-1 text-slate-600 hover:bg-slate-50 text-xs font-medium rounded-lg"
                    title="Export collection as APIForge JSON"
                  >
                    <Download className="h-3 w-3" />
                    JSON
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteCollection(collection.id)}
                    className="h-8.5 px-2.5 shrink-0 border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 text-xs font-medium rounded-lg"
                    title="Delete this collection"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Requests List */}
              <div className="space-y-2.5">
                {collection.requests.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-400">No requests in this collection yet. Use the buttons below to add one.</p>
                ) : (
                  collection.requests.map((request, index) => (
                    <div
                      key={request.id}
                      className="flex flex-wrap lg:flex-nowrap items-center gap-2.5 p-2.5 rounded-xl border border-slate-100 hover:border-slate-200 bg-slate-50/60 hover:bg-white transition-all shadow-2xs"
                    >
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
                        className={`w-22 shrink-0 rounded-lg py-1 px-2 text-center text-[11px] font-bold uppercase tracking-wider border cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-xs ${
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
                        className="h-9 w-full sm:w-56 shrink-0 text-xs bg-white font-medium text-slate-800"
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
                        placeholder="http://localhost:3001/api/mock/serve/..."
                        className="h-9 flex-1 min-w-[220px] font-mono text-xs bg-white"
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
                          className="h-8.5 shrink-0 px-3 text-xs font-semibold text-sky-700 border-sky-200 bg-sky-50 hover:bg-sky-100 gap-1.5 rounded-lg"
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
                          className="h-8.5 shrink-0 px-3 text-xs font-semibold text-violet-700 border-violet-200 bg-violet-50 hover:bg-violet-100 gap-1.5 rounded-lg"
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
                          className="h-8.5 shrink-0 px-2.5 text-xs font-medium text-slate-600 border-slate-200 bg-white hover:bg-slate-100 gap-1 rounded-lg"
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
                          className="h-8.5 w-8.5 shrink-0 p-0 text-slate-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg"
                          title="Delete request from collection"
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

              {/* Bottom Quick-Add Actions */}
              <div className="border-t border-slate-100 pt-3.5 flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    className="h-8.5 px-3 text-xs font-semibold gap-1.5 bg-slate-900 text-white hover:bg-slate-800 rounded-lg"
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
                    className="h-8.5 px-2.5 text-[11px] font-bold border-sky-200 text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg"
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
                    className="h-8.5 px-2.5 text-[11px] font-bold border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg"
                    onClick={() =>
                      updateCollection(collection.id, {
                        requests: [
                          ...collection.requests,
                          {
                            ...blankRequest('POST'),
                            headers: [{ id: crypto.randomUUID(), key: 'Content-Type', value: 'application/json', enabled: true }],
                            body: '{\n  \n}',
                          },
                        ],
                      })
                    }
                  >
                    + POST
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8.5 px-2.5 text-[11px] font-bold border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg"
                    onClick={() =>
                      updateCollection(collection.id, {
                        requests: [
                          ...collection.requests,
                          {
                            ...blankRequest('PUT'),
                            headers: [{ id: crypto.randomUUID(), key: 'Content-Type', value: 'application/json', enabled: true }],
                            body: '{\n  \n}',
                          },
                        ],
                      })
                    }
                  >
                    + PUT
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8.5 px-2.5 text-[11px] font-bold border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg"
                    onClick={() =>
                      updateCollection(collection.id, {
                        requests: [...collection.requests, blankRequest('DELETE')],
                      })
                    }
                  >
                    + DELETE
                  </Button>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <Sparkles className="h-3 w-3 text-amber-500" />
                  <span>Click <strong>Request</strong> to execute live or <strong>Run in Workflows</strong> to chain sequence</span>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
