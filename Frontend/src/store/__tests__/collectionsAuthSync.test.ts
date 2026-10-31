import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { collectionService } from '@/services/collectionService';
import { authService } from '@/services/authService';

vi.mock('@/services/collectionService', () => ({
  collectionService: {
    getCollections: vi.fn().mockResolvedValue([]),
    createCollection: vi.fn().mockResolvedValue({ id: 'mock-id' }),
    updateCollection: vi.fn().mockResolvedValue({ id: 'mock-id' }),
    deleteCollection: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/services/authService', () => ({
  authService: {
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
    deleteAccount: vi.fn(),
    getMe: vi.fn(),
    getActivity: vi.fn().mockResolvedValue([]),
  },
}));

describe('Collections Multi-User Auth Isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.getState().resetWorkspace();
    useAppStore.getState().setCollections([]);
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      loginActivity: [],
    });
    vi.mocked(collectionService.getCollections).mockResolvedValue([]);
  });

  it('loads user-specific collections on login and wipes them on logout', async () => {
    const userACollections = [
      {
        id: 'col_alpha',
        name: 'Alpha Collection',
        requests: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    vi.mocked(authService.login).mockResolvedValueOnce({
      success: true,
      user: { id: 'usr_alpha', name: 'User Alpha', email: 'alpha@test.com', role: 'engineer' },
      token: 'jwt_alpha_token',
    });
    vi.mocked(collectionService.getCollections).mockResolvedValue(userACollections);

    // 1. User Alpha logs in
    await useAuthStore.getState().login('alpha@test.com', 'password123');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    await useAppStore.getState().loadCollections();
    expect(useAppStore.getState().collections).toHaveLength(1);
    expect(useAppStore.getState().collections[0].name).toBe('Alpha Collection');

    // 2. User Alpha logs out
    await useAuthStore.getState().logout();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);

    // Ensure collections are completely wiped from active workspace state
    expect(useAppStore.getState().collections).toHaveLength(0);
  });

  it('prevents User Beta from seeing User Alpha collections after login', async () => {
    // User Beta has zero collections in backend
    vi.mocked(collectionService.getCollections).mockResolvedValue([]);
    vi.mocked(authService.login).mockResolvedValueOnce({
      success: true,
      user: { id: 'usr_beta', name: 'User Beta', email: 'beta@test.com', role: 'engineer' },
      token: 'jwt_beta_token',
    });

    await useAuthStore.getState().login('beta@test.com', 'password123');
    await useAppStore.getState().loadCollections();

    expect(useAppStore.getState().collections).toEqual([]);
  });

  it('wipes collections when user permanently deletes account', async () => {
    useAppStore.getState().createCollection('To Be Deleted');
    expect(useAppStore.getState().collections.length).toBeGreaterThan(0);

    useAuthStore.setState({ token: 'test-token', isAuthenticated: true });
    vi.mocked(authService.deleteAccount).mockResolvedValueOnce({ success: true });

    await useAuthStore.getState().deleteAccount();
    expect(useAppStore.getState().collections).toHaveLength(0);
  });
});
