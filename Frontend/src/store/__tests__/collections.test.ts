import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
describe('collections store', () => { beforeEach(() => useAppStore.getState().resetWorkspace());
  it('creates, updates, persists metadata, and deletes collections', () => { const id = useAppStore.getState().createCollection('Users'); useAppStore.getState().updateCollection(id, { requests: [{ id: 'r1', name: 'List', method: 'GET', url: 'https://example.test/users', queryParams: [], headers: [], body: '', auth: { type: 'none' } }] }); expect(useAppStore.getState().collections[0]).toMatchObject({ name: 'Users', requests: [{ name: 'List' }] }); expect(localStorage.getItem('apiforge-workspace')).toContain('Users'); useAppStore.getState().deleteCollection(id); expect(useAppStore.getState().collections).toEqual([]); });
  it('clears collections on workspace reset', () => { useAppStore.getState().createCollection('Users'); useAppStore.getState().resetWorkspace(); expect(useAppStore.getState().collections).toEqual([]); });
});
