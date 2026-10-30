import {
  BookMarked,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Download,
  FolderKanban,
  Network,
  Plus,
  Radar,
  Search,
  Send,
  ShoppingBag,
  Sparkles,
  Trash2,
  Upload,
  Users,
  Workflow,
  X,
} from "lucide-react";
import React, { useRef, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parsePostmanCollection } from "@/lib/curlParser";
import { downloadJsonFile, exportCollectionToOpenApi } from "@/lib/openApiExporter";
import { openApiService } from "@/services/openapiService";
import { useAppStore } from "@/store/useAppStore";
import { DemoGuideModal } from "@/components/demo/DemoGuideModal";
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
  const [guideOpen, setGuideOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedCollections, setCollapsedCollections] = useState<Record<string, boolean>>({});

  const toggleCollapse = (id: string) => {
    setCollapsedCollections((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // ── QuickCart E-Commerce Collection ──
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
          url: 'http://localhost:3001/api/mock/serve/api/products/201',
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
              productId: 'prod-201',
              quantity: 1,
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
          url: 'http://localhost:3001/api/mock/serve/api/products/201',
          queryParams: [],
          headers: [{ id: 'h-ct-put-prod', key: 'Content-Type', value: 'application/json', enabled: true }],
          body: JSON.stringify(
            {
              stock: 45,
              price: 1299.99,
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
          url: 'http://localhost:3001/api/mock/serve/api/orders/ORD-9021',
          queryParams: [],
          headers: [{ id: 'h-accept-del', key: 'Accept', value: 'application/json', enabled: true }],
          body: '',
          auth: { type: 'none' },
        },
      ],
    });
  };

  // ── User Management Suite (Aarav Patil Record) ──
  const loadUserDemoCollection = () => {
    const colId = createCollection('User Management API Suite');
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

  // Compute total endpoint count
  const totalRequests = useMemo(() => {
    return collections.reduce((acc, col) => acc + (col.requests?.length || 0), 0);
  }, [collections]);

  // Filter collections and their requests based on search query
  const filteredCollections = useMemo(() => {
    if (!searchQuery.trim()) return collections;
    const q = searchQuery.toLowerCase().trim();
    return collections
      .map((col) => {
        const matchesColName = col.name.toLowerCase().includes(q);
        const matchedRequests = (col.requests || []).filter(
          (req) =>
            req.name.toLowerCase().includes(q) ||
            req.url.toLowerCase().includes(q) ||
            req.method.toLowerCase().includes(q)
        );
        if (matchesColName) {
          return col; // show full collection if name matches
        }
        if (matchedRequests.length > 0) {
          return {
            ...col,
            requests: matchedRequests,
          };
        }
        return null;
      })
      .filter((col): col is ApiCollection => col !== null);
  }, [collections, searchQuery]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Hidden file input for importing collection */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImportCollectionFile}
      />

      {/* ── Top Header & Global Actions Bar ── */}
      <section className="panel-surface p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/20">
              <FolderKanban className="h-5.5 w-5.5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl font-bold tracking-tight text-slate-900">API Collections</h2>
                <span className="rounded-full bg-blue-50 border border-blue-200/80 px-2.5 py-0.5 text-xs font-bold text-blue-700">
                  {collections.length} {collections.length === 1 ? 'Collection' : 'Collections'}
                </span>
                <span className="rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-600 font-mono">
                  {totalRequests} Endpoints
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Organize, test, and export reusable API suites; launch into Request Builder, Workflows, or Documentation
              </p>
            </div>
          </div>

          {/* Quick Create + Search + Import Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Filter */}
            <div className="relative flex-1 sm:flex-initial sm:w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter endpoints..."
                className="h-9.5 pl-8.5 pr-8 text-xs bg-slate-50/70 border-slate-200 rounded-xl focus:bg-white transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Quick New Collection Form */}
            <div className="flex items-center gap-1.5 flex-1 sm:flex-initial">
              <Input
                aria-label="Collection name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && name.trim()) {
                    createCollection(name);
                    setName('');
                  }
                }}
                placeholder="New collection title..."
                className="h-9.5 w-44 sm:w-48 bg-white text-xs rounded-xl border-slate-200 shadow-2xs"
              />
              <Button
                size="default"
                disabled={!name.trim()}
                className="h-9.5 px-3.5 shrink-0 gap-1.5 text-xs font-semibold bg-primary text-white hover:bg-primary/90 shadow-sm rounded-xl"
                onClick={() => {
                  if (name.trim()) {
                    createCollection(name);
                    setName('');
                  }
                }}
              >
                <Plus className="h-4 w-4" />
                Create
              </Button>
            </div>

            {/* Import Button */}
            <Button
              variant="outline"
              size="default"
              onClick={() => fileInputRef.current?.click()}
              className="h-9.5 px-3.5 shrink-0 gap-1.5 text-xs font-semibold border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl shadow-2xs"
              title="Import collection from JSON or Postman v2.1 file"
            >
              <Upload className="h-3.5 w-3.5 text-indigo-500" />
              Import
            </Button>
          </div>
        </div>

        {/* ── Reference Service Suites Bar (3 Balanced Space-Efficient Cards) ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 border-t border-slate-100">
          {/* Service 1: User Management */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-sky-100 bg-sky-50/40 hover:bg-sky-50/70 transition-colors">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                <Users className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-slate-900 truncate">User Management API</h4>
                <p className="text-[11px] text-slate-500 truncate">5 Endpoints • Identity & RBAC</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={loadUserDemoCollection}
              className="h-7.5 px-2.5 text-[11px] font-semibold text-sky-700 border-sky-200 bg-white hover:bg-sky-50 rounded-lg shrink-0"
            >
              + Load Suite
            </Button>
          </div>

          {/* Service 2: QuickCart Store */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-emerald-100 bg-emerald-50/40 hover:bg-emerald-50/70 transition-colors">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <ShoppingBag className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-slate-900 truncate">QuickCart Store API</h4>
                <p className="text-[11px] text-slate-500 truncate">5 Endpoints • Cart & Orders</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={loadEcommerceDemoCollection}
              className="h-7.5 px-2.5 text-[11px] font-semibold text-emerald-700 border-emerald-200 bg-white hover:bg-emerald-50 rounded-lg shrink-0"
            >
              + Load Suite
            </Button>
          </div>

          {/* Service 3: Verification Guide */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-indigo-100 bg-indigo-50/40 hover:bg-indigo-50/70 transition-colors">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                <BookOpen className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-slate-900 truncate">Verification Guide</h4>
                <p className="text-[11px] text-slate-500 truncate">10-Feature validation flow</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setGuideOpen(true)}
              className="h-7.5 px-2.5 text-[11px] font-semibold text-indigo-700 border-indigo-200 bg-white hover:bg-indigo-50 rounded-lg shrink-0"
            >
              Open Guide
            </Button>
          </div>
        </div>
      </section>

      {/* ── Empty State ── */}
      {collections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200/90 bg-white/70 p-10 text-center shadow-xs">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 shadow-xs">
            <FolderKanban className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-base font-bold text-slate-900">No Saved Collections Yet</h3>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
            Create an empty collection above or load one of our pre-configured project suites with complete GET, POST, PUT, and DELETE requests:
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-3 max-w-2xl mx-auto">
            <Button
              onClick={loadUserDemoCollection}
              className="h-10 px-4 gap-2 text-xs font-bold bg-sky-600 text-white hover:bg-sky-700 rounded-xl shadow-xs"
            >
              <Users className="h-4 w-4" />
              Load User Management Suite
            </Button>
            <Button
              onClick={loadEcommerceDemoCollection}
              className="h-10 px-4 gap-2 text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl shadow-xs"
            >
              <ShoppingBag className="h-4 w-4" />
              Load QuickCart Store Suite
            </Button>
            <Button
              variant="outline"
              onClick={() => setGuideOpen(true)}
              className="h-10 px-4 gap-2 text-xs font-semibold border-indigo-200 text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded-xl shadow-xs"
            >
              <BookOpen className="h-4 w-4 text-indigo-600" />
              Verification Guide
            </Button>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="h-10 px-4 gap-2 text-xs font-semibold border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl"
            >
              <Upload className="h-4 w-4 text-indigo-600" />
              Import Postman / JSON File
            </Button>
          </div>
        </div>
      ) : filteredCollections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200/90 bg-white/70 p-10 text-center">
          <p className="text-sm font-semibold text-slate-700">No collections match "{searchQuery}"</p>
          <p className="text-xs text-slate-500 mt-1">Try searching for a different keyword or clear your filter.</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSearchQuery('')}
            className="mt-4 text-xs font-semibold"
          >
            Clear Filter
          </Button>
        </div>
      ) : (
        /* ── Collections Cards ── */
        <div className="space-y-4">
          {filteredCollections.map((collection) => {
            const isCollapsed = !!collapsedCollections[collection.id];
            return (
              <section
                key={collection.id}
                className="panel-surface p-4 sm:p-5 border border-slate-200/90 shadow-xs space-y-3.5 transition-all"
              >
                {/* ── Collection Header Bar ── */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
                  <div className="flex flex-1 min-w-[260px] items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => toggleCollapse(collection.id)}
                      className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                      title={isCollapsed ? 'Expand collection' : 'Collapse collection'}
                      aria-label={isCollapsed ? 'Expand collection' : 'Collapse collection'}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>

                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 shadow-2xs">
                      <FolderKanban className="h-4 w-4" />
                    </div>

                    <Input
                      aria-label={`Collection ${collection.name}`}
                      value={collection.name}
                      onChange={(e) => updateCollection(collection.id, { name: e.target.value })}
                      className="h-8.5 max-w-xs sm:max-w-sm text-sm font-bold text-slate-900 bg-white border-transparent hover:border-slate-200 focus:border-blue-500 rounded-lg transition-colors px-2"
                    />

                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 font-mono">
                      {collection.requests.length} {collection.requests.length === 1 ? 'req' : 'reqs'}
                    </span>
                  </div>

                  {/* Actions Group */}
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRunAsWorkflow(collection)}
                      disabled={collection.requests.length === 0}
                      className="h-8 px-2.5 shrink-0 gap-1.5 border-indigo-200 text-indigo-700 bg-indigo-50/80 hover:bg-indigo-100 text-xs font-semibold rounded-lg"
                      title="Execute this collection as an automated sequence in Workflows"
                    >
                      <Workflow className="h-3.5 w-3.5 text-indigo-600" />
                      <span className="hidden sm:inline">Run Workflow</span>
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewDocumentation(collection)}
                      disabled={collection.requests.length === 0}
                      className="h-8 px-2.5 shrink-0 gap-1.5 border-emerald-200 text-emerald-700 bg-emerald-50/80 hover:bg-emerald-100 text-xs font-semibold rounded-lg"
                      title="Generate and view interactive API documentation from this collection"
                    >
                      <BookMarked className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="hidden sm:inline">Docs</span>
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
                      className="h-8 px-2.5 shrink-0 gap-1.5 border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-medium rounded-lg"
                      title="Export collection as OpenAPI 3.1 JSON"
                    >
                      <Download className="h-3 w-3 text-slate-500" />
                      <span>OAS 3.1</span>
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
                      className="h-8 px-2 shrink-0 gap-1 text-slate-600 hover:bg-slate-50 text-xs font-medium rounded-lg"
                      title="Export collection as APIForge JSON"
                    >
                      <Download className="h-3 w-3 text-slate-500" />
                      <span>JSON</span>
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (window.confirm(`Delete collection "${collection.name}"?`)) {
                          deleteCollection(collection.id);
                        }
                      }}
                      className="h-8 w-8 shrink-0 p-0 text-slate-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg"
                      title="Delete this collection"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* ── Requests List (Collapsible) ── */}
                {!isCollapsed && (
                  <div className="space-y-2">
                    {collection.requests.length === 0 ? (
                      <p className="py-4 text-center text-xs text-slate-400">
                        No requests in this collection yet. Use the buttons below to add one.
                      </p>
                    ) : (
                      collection.requests.map((request, index) => (
                        <div
                          key={request.id}
                          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2 rounded-xl border border-slate-100 hover:border-slate-200 bg-slate-50/50 hover:bg-white transition-all shadow-2xs"
                        >
                          {/* Method Selector */}
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
                            className={`w-20 shrink-0 rounded-lg py-1 px-1.5 text-center text-[11px] font-bold uppercase tracking-wider border cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs ${
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

                          {/* Request Name */}
                          <Input
                            aria-label={`Request ${index + 1} name`}
                            value={request.name}
                            placeholder="Request name"
                            className="h-8 w-full sm:w-48 lg:w-56 shrink-0 text-xs bg-white font-medium text-slate-800 rounded-lg"
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
                            placeholder="http://localhost:3001/api/mock/serve/..."
                            className="h-8 flex-1 min-w-[200px] font-mono text-xs bg-white text-slate-700 rounded-lg"
                            onChange={(e) =>
                              updateCollection(collection.id, {
                                requests: collection.requests.map((item) =>
                                  item.id === request.id ? { ...item, url: e.target.value } : item
                                ),
                              })
                            }
                          />

                          {/* Request Actions */}
                          <div className="flex items-center justify-end gap-1.5 shrink-0 pt-1 sm:pt-0">
                            <Button
                              variant="outline"
                              size="sm"
                              title="Open and execute in Request Builder"
                              className="h-8 px-2.5 text-xs font-semibold text-sky-700 border-sky-200 bg-sky-50 hover:bg-sky-100 gap-1 rounded-lg"
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
                              className="h-8 px-2.5 text-xs font-semibold text-violet-700 border-violet-200 bg-violet-50 hover:bg-violet-100 gap-1 rounded-lg"
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
                              className="h-8 px-2 text-xs font-medium text-slate-600 border-slate-200 bg-white hover:bg-slate-100 gap-1 rounded-lg"
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

                    {/* Bottom Quick-Add Actions */}
                    <div className="border-t border-slate-100 pt-3 flex flex-wrap items-center justify-between gap-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          variant="default"
                          size="sm"
                          className="h-8 px-3 text-xs font-semibold gap-1.5 bg-slate-900 text-white hover:bg-slate-800 rounded-lg"
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
                          className="h-8 px-2 text-[11px] font-bold border-sky-200 text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg"
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
                          className="h-8 px-2 text-[11px] font-bold border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg"
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
                          className="h-8 px-2 text-[11px] font-bold border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg"
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
                          className="h-8 px-2 text-[11px] font-bold border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg"
                          onClick={() =>
                            updateCollection(collection.id, {
                              requests: [...collection.requests, blankRequest('DELETE')],
                            })
                          }
                        >
                          + DELETE
                        </Button>
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <Sparkles className="h-3 w-3 text-amber-500" />
                        <span>Click <strong>Request</strong> to test live or <strong>Run Workflow</strong> to chain sequence</span>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Guide Modal */}
      <DemoGuideModal
        isOpen={guideOpen}
        onClose={() => setGuideOpen(false)}
      />
    </div>
  );
}
