import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import axios, { AxiosError } from 'axios';

// Unit tests must never reach a real backend that happens to be running locally (a live
// server answering 401 would, e.g., sign the test user out mid-test). Unmocked requests
// fail like an unreachable network. The opt-in integration suite sets
// APIFORGE_INTEGRATION_API_URL and keeps real network access.
if (!process.env.APIFORGE_INTEGRATION_API_URL) {
  axios.defaults.adapter = async (config) => {
    throw new AxiosError('Network access is disabled in unit tests (mock this request).', 'ERR_NETWORK', config);
  };
}

// Cleanup DOM after each test
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

// Mock ResizeObserver for Recharts and responsive elements
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  class ResizeObserverMock {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
}

// Mock window.matchMedia
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}
