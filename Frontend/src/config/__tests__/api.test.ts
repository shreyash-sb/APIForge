import { describe, expect, it } from 'vitest';
import { API_BASE_URL, getMockServeBaseUrl } from '../api';

describe('mock serve URL configuration', () => {
  it('uses the configured backend origin', () => {
    expect(getMockServeBaseUrl('http://127.0.0.1:3032')).toBe(
      'http://127.0.0.1:3032/api/mock/serve'
    );
  });

  it('preserves the default backend configuration', () => {
    expect(API_BASE_URL).toBe('http://localhost:3001');
    expect(getMockServeBaseUrl()).toBe('http://localhost:3001/api/mock/serve');
  });

  it('normalizes trailing slashes before appending the backend route', () => {
    expect(getMockServeBaseUrl('http://127.0.0.1:3032///')).toBe(
      'http://127.0.0.1:3032/api/mock/serve'
    );
  });
});
