import { describe, expect, it, vi, afterEach } from 'vitest';
import axios from 'axios';
import { checkBackendHealth } from '@/services/healthService';
describe('health service', () => { afterEach(() => vi.restoreAllMocks());
  it('reports healthy on a successful backend health response', async () => { vi.spyOn(axios, 'get').mockResolvedValue({ status: 200 }); expect((await checkBackendHealth()).status).toBe('Healthy'); });
  it('reports unavailable on failure', async () => { vi.spyOn(axios, 'get').mockRejectedValue(new Error('down')); expect((await checkBackendHealth()).status).toBe('Unavailable'); });
  it('reports unavailable on timeout', async () => { vi.spyOn(axios, 'get').mockRejectedValue({ code: 'ECONNABORTED' }); expect((await checkBackendHealth()).status).toBe('Unavailable'); });
});
