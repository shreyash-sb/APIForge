import axios from 'axios';
import type { ApiRequest } from '@/types/request.types';
import type { FrontendEnvironmentProfile } from '@/types/environment.types';
import type {
  PreviewRequestWorkflowResponse,
  SanitizedWorkflowExecutionResult,
  ValidateWorkflowResponse,
  WorkflowScenario,
} from '@/types/workflow.types';

import { sanitizeErrorMessage } from './apiError';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
  (typeof process !== 'undefined' && process.env?.VITE_API_BASE_URL) ||
  'http://localhost:3001';

export class WorkflowApiError extends Error {
  readonly details?: string[];
  readonly type?: string;

  constructor(message: string, details?: string[], type?: string) {
    super(sanitizeErrorMessage(message));
    this.name = 'WorkflowApiError';
    this.details = details?.map((d) => sanitizeErrorMessage(d));
    this.type = type;
  }
}

function handleWorkflowError(error: unknown, defaultMessage: string): never {
  if (axios.isAxiosError(error)) {
    if (error.response?.data?.error) {
      const errData = error.response.data.error;
      throw new WorkflowApiError(
        errData.message || defaultMessage,
        errData.details,
        errData.type
      );
    }
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      throw new WorkflowApiError(
        'Request to workflow service timed out. Please verify backend availability and try again.',
        undefined,
        'TIMEOUT_ERROR'
      );
    }
    if (error.code === 'ERR_NETWORK' || !error.response) {
      const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'frontend origin';
      throw new WorkflowApiError(
        `Unable to reach backend service at ${API_BASE_URL}. Ensure the backend is running and CORS permits ${currentOrigin}.`,
        undefined,
        'NETWORK_ERROR'
      );
    }
    if (error.response?.status) {
      throw new WorkflowApiError(
        `Workflow service responded with HTTP status ${error.response.status}.`,
        undefined,
        'HTTP_ERROR'
      );
    }
  }
  throw new WorkflowApiError(defaultMessage);
}

export const workflowService = {
  /**
   * Validates a workflow scenario structure and dependencies without dispatching HTTP traffic
   */
  async validateWorkflow(scenario: WorkflowScenario): Promise<ValidateWorkflowResponse> {
    try {
      const response = await axios.post<ValidateWorkflowResponse>(
        `${API_BASE_URL}/api/workflows/validate`,
        { scenario },
        { timeout: 15000 }
      );
      return response.data;
    } catch (error) {
      handleWorkflowError(error, 'Unable to reach validation service. Check backend connection.');
    }
  },

  /**
   * Executes an end-to-end multi-step workflow scenario against an environment
   */
  async executeWorkflow(
    scenario: WorkflowScenario,
    environment?: FrontendEnvironmentProfile
  ): Promise<SanitizedWorkflowExecutionResult> {
    try {
      const response = await axios.post<SanitizedWorkflowExecutionResult>(
        `${API_BASE_URL}/api/workflows/execute`,
        { scenario, environment },
        { timeout: 120000 } // Extended timeout for multi-step scenario runs
      );
      return response.data;
    } catch (error) {
      handleWorkflowError(error, 'Workflow execution network dispatch failed. Check backend connection.');
    }
  },

  /**
   * Preview request interpolation without dispatching network calls
   */
  async previewRequest(
    request: ApiRequest,
    environment?: FrontendEnvironmentProfile
  ): Promise<PreviewRequestWorkflowResponse> {
    try {
      const response = await axios.post<PreviewRequestWorkflowResponse>(
        `${API_BASE_URL}/api/workflows/preview-request`,
        { request, environment },
        { timeout: 10000 }
      );
      return response.data;
    } catch (error) {
      handleWorkflowError(error, 'Failed to preview request interpolation.');
    }
  },
};
