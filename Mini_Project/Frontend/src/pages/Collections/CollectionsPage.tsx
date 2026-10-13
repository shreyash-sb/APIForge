import { FolderKanban, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/store/useAppStore";

const blankRequest = () => ({ id: crypto.randomUUID(), name: 'New request', method: 'GET' as const, url: '', queryParams: [], headers: [], body: '', auth: { type: 'none' as const } });

export function CollectionsPage() {
  const { collections, createCollection, updateCollection, deleteCollection } = useAppStore();
  const [name, setName] = useState('');
  return (
    <div className="space-y-6">
      <div className="panel-surface p-6 lg:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Workspace Management</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Collections</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
          Save and organize reusable request definitions in this browser workspace. Credentials are never stored with collection requests.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Input aria-label="Collection name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Collection name" />
          <Button onClick={() => { createCollection(name); setName(''); }}><Plus className="h-4 w-4" />Create collection</Button>
        </div>
      </div>

      {collections.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200/80 p-8 text-center bg-white/50">
        <FolderKanban className="mx-auto h-8 w-8 text-slate-400" />
        <h3 className="mt-3 text-base font-semibold text-slate-900">No saved collections</h3>
        <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
          Create a collection to save request definitions locally.
        </p>
      </div> : collections.map((collection) => <section key={collection.id} className="panel-surface p-5"><div className="flex gap-2"><Input aria-label={`Collection ${collection.name}`} value={collection.name} onChange={(e) => updateCollection(collection.id, { name: e.target.value })}/><Button variant="outline" onClick={() => deleteCollection(collection.id)}><Trash2 className="h-4 w-4" />Delete</Button></div><div className="mt-4 space-y-2">{collection.requests.map((request, index) => <div className="flex gap-2" key={request.id}><Input aria-label={`Request ${index + 1} name`} value={request.name} onChange={(e) => updateCollection(collection.id, { requests: collection.requests.map((item) => item.id === request.id ? { ...item, name: e.target.value } : item) })}/><Input aria-label={`Request ${index + 1} URL`} value={request.url} placeholder="https://api.example.com/resource" onChange={(e) => updateCollection(collection.id, { requests: collection.requests.map((item) => item.id === request.id ? { ...item, url: e.target.value } : item) })}/><Button variant="outline" onClick={() => updateCollection(collection.id, { requests: collection.requests.filter((item) => item.id !== request.id) })}><Trash2 className="h-4 w-4" /></Button></div>)}</div><Button className="mt-4" variant="outline" onClick={() => updateCollection(collection.id, { requests: [...collection.requests, blankRequest()] })}><Plus className="h-4 w-4" />Add request</Button></section>) }
    </div>
  );
}
