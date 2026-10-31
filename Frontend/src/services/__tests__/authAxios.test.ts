import axios from 'axios';
import { beforeEach, describe, expect, it } from 'vitest';
import { installAuthInterceptor } from '../authAxios';

describe('API session authorization interceptor', () => {
  beforeEach(() => localStorage.clear());

  it('attaches the persisted bearer token to API requests', async () => {
    localStorage.setItem('apiforge-auth-session', JSON.stringify({ state: { token: 'synthetic-session-token' }, version: 0 }));
    const client = axios.create({ adapter: async (config) => ({
      data: config.headers.get('Authorization'), status: 200, statusText: 'OK', headers: {}, config,
    }) });
    installAuthInterceptor(client);
    const response = await client.get('/protected');
    expect(response.data).toBe('Bearer synthetic-session-token');
  });

  it('does not invent credentials when the session is absent or corrupt', async () => {
    localStorage.setItem('apiforge-auth-session', '{bad json');
    const client = axios.create({ adapter: async (config) => ({
      data: config.headers.get('Authorization'), status: 200, statusText: 'OK', headers: {}, config,
    }) });
    installAuthInterceptor(client);
    const response = await client.get('/protected');
    expect(response.data).toBeUndefined();
  });
});
