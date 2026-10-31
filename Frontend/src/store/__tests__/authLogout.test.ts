import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/authService', () => ({
  authService: { logout: vi.fn().mockResolvedValue(undefined) },
}));

import { authService } from '@/services/authService';
import { useAuthStore } from '../useAuthStore';

describe('auth logout session cleanup', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      user: { id: 'synthetic-user', name: 'Synthetic', email: 'synthetic@example.test' } as never,
      token: 'synthetic-token',
      isAuthenticated: true,
      isLoading: false,
      error: null,
      loginActivity: [],
    });
    vi.clearAllMocks();
  });

  it('invalidates remotely then clears the persisted client session', async () => {
    await useAuthStore.getState().logout();

    expect(authService.logout).toHaveBeenCalledWith('synthetic-token');
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      token: null,
      isAuthenticated: false,
    });
    expect(JSON.parse(localStorage.getItem('apiforge-auth-session') || '{}').state).toMatchObject({
      user: null,
      token: null,
      isAuthenticated: false,
    });
  });
});
