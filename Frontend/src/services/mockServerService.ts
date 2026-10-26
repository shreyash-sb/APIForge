import axios from 'axios';
import type { ApiSpecification } from '@/types/openapi.types';
import type {
  MockGenerateOptions,
  MockGenerateResult,
  MockRequestLog,
  MockRoute,
} from '@/types/mockServer.types';
import { formatApiErrorMessage } from './apiError';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
  (typeof process !== 'undefined' && process.env?.VITE_API_BASE_URL) ||
  'http://localhost:3001';

export class MockServerApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MockServerApiError';
  }
}

export const mockServerService = {
  /**
   * Retrieves all mock routes configured on the server
   */
  async getRoutes(): Promise<MockRoute[]> {
    try {
      const response = await axios.get<{ routes: MockRoute[]; total: number }>(
        `${API_BASE_URL}/api/mock/routes`,
        { timeout: 10000 }
      );
      return response.data.routes;
    } catch (error) {
      throw new MockServerApiError(
        formatApiErrorMessage(error, 'Failed to fetch mock routes. Check backend connectivity.')
      );
    }
  },

  /**
   * Creates a new mock route
   */
  async createRoute(routeData: Omit<MockRoute, 'id'>): Promise<MockRoute> {
    try {
      const response = await axios.post<MockRoute>(
        `${API_BASE_URL}/api/mock/routes`,
        routeData,
        { timeout: 10000 }
      );
      return response.data;
    } catch (error) {
      throw new MockServerApiError(formatApiErrorMessage(error, 'Failed to create mock route.'));
    }
  },

  /**
   * Updates an existing mock route
   */
  async updateRoute(id: string, updates: Partial<MockRoute>): Promise<MockRoute> {
    try {
      const response = await axios.put<MockRoute>(
        `${API_BASE_URL}/api/mock/routes/${id}`,
        updates,
        { timeout: 10000 }
      );
      return response.data;
    } catch (error) {
      throw new MockServerApiError(
        formatApiErrorMessage(error, `Failed to update mock route ${id}.`)
      );
    }
  },

  /**
   * Deletes a mock route
   */
  async deleteRoute(id: string): Promise<boolean> {
    try {
      await axios.delete(`${API_BASE_URL}/api/mock/routes/${id}`, { timeout: 10000 });
      return true;
    } catch (error) {
      throw new MockServerApiError(
        formatApiErrorMessage(error, `Failed to delete mock route ${id}.`)
      );
    }
  },

  /**
   * Generates mock routes from an OpenAPI Specification
   */
  async generateFromSpec(
    specification: ApiSpecification,
    options?: MockGenerateOptions
  ): Promise<MockGenerateResult> {
    try {
      const response = await axios.post<MockGenerateResult>(
        `${API_BASE_URL}/api/mock/generate-from-spec`,
        { specification, options },
        { timeout: 20000 }
      );
      return response.data;
    } catch (error) {
      throw new MockServerApiError(
        formatApiErrorMessage(
          error,
          'Failed to generate mock routes from OpenAPI specification.'
        )
      );
    }
  },

  /**
   * Fetches mock traffic execution logs
   */
  async getLogs(): Promise<MockRequestLog[]> {
    try {
      const response = await axios.get<{ logs: MockRequestLog[]; total: number }>(
        `${API_BASE_URL}/api/mock/logs`,
        { timeout: 10000 }
      );
      return response.data.logs;
    } catch (error) {
      throw new MockServerApiError(
        formatApiErrorMessage(error, 'Failed to fetch mock execution logs.')
      );
    }
  },

  /**
   * Clears mock execution logs
   */
  async clearLogs(): Promise<boolean> {
    try {
      await axios.delete(`${API_BASE_URL}/api/mock/logs`, { timeout: 10000 });
      return true;
    } catch (error) {
      throw new MockServerApiError(
        formatApiErrorMessage(error, 'Failed to clear mock execution logs.')
      );
    }
  },
};
