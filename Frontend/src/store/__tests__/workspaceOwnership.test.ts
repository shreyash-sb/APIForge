import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/authService', () => ({
  authService: {
    login: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    getLoginActivity: vi.fn().mockResolvedValue([]),
    deleteAccount: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('@/services/collectionService', () => ({
  collectionService: { list: vi.fn().mockResolvedValue([]), getCollections: vi.fn().mockResolvedValue([]) },
}));

import { authService } from '@/services/authService';
import { useAuthStore } from '../useAuthStore';
import { useAppStore } from '../useAppStore';
import { mockSpecification, mockTestCase } from '@/test/fixtures';

const loginAs = (id: string) => {
  vi.mocked(authService.login).mockResolvedValueOnce({ success: true, token: `tok-${id}`, user: { id, name: id, email: `${id}@example.test`, role: 'engineer' } } as never);
  return useAuthStore.getState().login(`${id}@example.test`, 'irrelevant');
};
const seedWorkspace = () => {
  useAppStore.getState().setActiveSpecification(mockSpecification);
  useAppStore.getState().setGeneratedTests([mockTestCase]);
};

describe('browser workspace is scoped to one account', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.getState().resetWorkspace();
    useAppStore.setState({ workspaceOwnerId: undefined });
    useAuthStore.setState({ user: null, token: null, isAuthenticated: false, loginActivity: [] });
    vi.clearAllMocks();
  });

  it('wipes another account\'s data when a different user signs in', async () => {
    await loginAs('alice');
    seedWorkspace();
    useAuthStore.setState({ user: null, token: null, isAuthenticated: false }); // e.g. session expired, no sign-out
    await loginAs('bob');
    expect(useAppStore.getState().activeSpecification).toBeUndefined();
    expect(useAppStore.getState().generatedTests).toHaveLength(0);
    expect(useAppStore.getState().workspaceOwnerId).toBe('bob');
  });

  it('keeps the same user\'s data when they sign back in', async () => {
    await loginAs('alice');
    seedWorkspace();
    useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
    await loginAs('alice');
    expect(useAppStore.getState().generatedTests).toHaveLength(1);
  });

  it('clears workspace data and activity from the browser on sign-out', async () => {
    await loginAs('alice');
    seedWorkspace();
    useAuthStore.setState({ loginActivity: [{ id: 'a' } as never] });
    await useAuthStore.getState().logout();
    expect(useAppStore.getState().activeSpecification).toBeUndefined();
    expect(useAppStore.getState().workspaceOwnerId).toBeUndefined();
    expect(useAuthStore.getState().loginActivity).toEqual([]);
    const persisted = JSON.parse(localStorage.getItem('apiforge-workspace') || '{}').state ?? {};
    expect(persisted.activeSpecification).toBeUndefined();
    expect(persisted.generatedTests ?? []).toHaveLength(0);
  });

  it('adopts legacy data that has no owner on first sign-in', async () => {
    seedWorkspace();
    await loginAs('carol');
    expect(useAppStore.getState().generatedTests).toHaveLength(1);
    expect(useAppStore.getState().workspaceOwnerId).toBe('carol');
  });
});

describe('store migration v3 (agent workspace removed)', () => {
  it('drops stored agent tasks and agent notifications from older saved state', async () => {
    const options = (useAppStore as unknown as { persist: { getOptions: () => { migrate: (s: unknown, v: number) => Record<string, unknown> } } }).persist.getOptions();
    const migrated = options.migrate(
      {
        agentTasks: [{ taskId: 't1' }],
        activeAgentTaskId: 't1',
        notifications: [
          { id: 'a', title: 'Agent Engine Online', actionLabel: 'Agent Workspace' },
          { id: 'b', title: 'Environment Connected', actionLabel: 'Manage' },
        ],
      },
      2
    );
    expect(migrated.agentTasks).toBeUndefined();
    expect(migrated.activeAgentTaskId).toBeUndefined();
    expect((migrated.notifications as Array<{ id: string }>).map((n) => n.id)).toEqual(['b']);
  });
});
