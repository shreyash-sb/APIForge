import { create } from "zustand";
import { persist, type PersistStorage } from "zustand/middleware";
import type { Auth, Header, HttpMethod, ManualRequestExecution, QueryParam, RequestDraft, ApiCollection } from '@/types/request.types';
import { redactEndpoint } from '../lib/requestRedaction';
import type { ApiSpecification } from '@/types/openapi.types';
import type { TestCase } from '@/types/testCase.types';
import type { TestCaseExecutionResult } from '@/types/testExecution.types';
import type { TestCaseValidationResult, TestSuiteValidationSummary } from '@/types/validation.types';
import type { DiagnosisResult } from '@/types/diagnosis.types';
import type { ReportSummary } from '@/types/report.types';
import type { FrontendEnvironmentProfile } from '@/types/environment.types';
import type { SanitizedWorkflowExecutionResult, WorkflowScenario } from '@/types/workflow.types';
import type { MockRequestLog, MockRoute } from '@/types/mockServer.types';
import type { AppNotification } from '@/types/notification.types';
import type { AgentTask } from '@/types/agent.types';

export type { RequestDraft, ApiCollection, AppNotification, AgentTask };

type User = {
  name: string;
  role: string;
};

export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
export const MIN_REQUEST_TIMEOUT_MS = 1_000;
export const MAX_REQUEST_TIMEOUT_MS = 35_000;
export function clampRequestTimeout(value: number) { return Math.min(MAX_REQUEST_TIMEOUT_MS, Math.max(MIN_REQUEST_TIMEOUT_MS, Math.round(value))); }


export const defaultEnvironments: FrontendEnvironmentProfile[] = [
  {
    id: 'env-local',
    name: 'Local',
    description: 'Local development environment on localhost',
    baseUrl: 'http://localhost:3001/api/mock/serve',
    isDefault: true,
    createdAt: new Date().toISOString(),
    variables: [
      { name: 'apiKey', value: 'dev-key-12345', isSecret: true, enabled: true },
      { name: 'apiVersion', value: 'v1', isSecret: false, enabled: true },
    ],
  },
  {
    id: 'env-dev',
    name: 'Development',
    description: 'Remote development cluster for feature testing',
    baseUrl: 'https://dev-api.example.com',
    createdAt: new Date().toISOString(),
    variables: [
      { name: 'authToken', value: 'dev-token-abc', isSecret: true, enabled: true },
    ],
  },
  {
    id: 'env-staging',
    name: 'Staging',
    description: 'Pre-production staging environment',
    baseUrl: 'https://staging-api.example.com',
    createdAt: new Date().toISOString(),
    variables: [
      { name: 'authToken', value: 'stage-token-xyz', isSecret: true, enabled: true },
    ],
  },
  {
    id: 'env-prod',
    name: 'Production',
    description: 'Production cluster',
    baseUrl: 'https://api.example.com',
    createdAt: new Date().toISOString(),
    variables: [
      { name: 'apiKey', value: 'prod-secret', isSecret: true, enabled: true },
    ],
  },
];

export const defaultWorkflows: WorkflowScenario[] = [
  {
    id: 'wf-user-management-demo',
    name: 'User Management Demo Workflow',
    description: 'Creates Aarav Patil (ID: 101), passes user ID to dependent retrieval, updates profile, and cleans up via teardown',
    steps: [
      {
        id: 'step-create-user',
        name: 'Create User (POST)',
        description: 'Creates Aarav Patil on mock server and extracts userId and name',
        enabled: true,
        request: {
          method: 'POST',
          url: 'http://localhost:3001/api/mock/serve/api/users',
          headers: [{ id: 'h-post-1', key: 'Content-Type', value: 'application/json', enabled: true }],
          queryParams: [],
          body: JSON.stringify({ name: 'Aarav Patil', email: 'aarav@example.com', role: 'student', active: true }, null, 2),
          auth: { type: 'none' },
        },
        extractors: [
          {
            targetVariable: 'userId',
            source: 'BODY_JSONPATH',
            path: '$.id',
            defaultValue: '101',
            isSecret: false,
          },
          {
            targetVariable: 'userName',
            source: 'BODY_JSONPATH',
            path: '$.name',
            defaultValue: 'Aarav Patil',
            isSecret: false,
          },
        ],
      },
      {
        id: 'step-get-user',
        name: 'Retrieve User (GET)',
        description: 'Queries user by ID passing {{userId}} extracted from Step 1',
        enabled: true,
        dependsOn: ['step-create-user'],
        request: {
          method: 'GET',
          url: 'http://localhost:3001/api/mock/serve/api/users/{{userId}}',
          headers: [{ id: 'h-get-1', key: 'Accept', value: 'application/json', enabled: true }],
          queryParams: [],
          body: '',
          auth: { type: 'none' },
        },
      },
      {
        id: 'step-update-user',
        name: 'Update User (PUT)',
        description: 'Updates active status and role for {{userId}}',
        enabled: true,
        dependsOn: ['step-get-user'],
        request: {
          method: 'PUT',
          url: 'http://localhost:3001/api/mock/serve/api/users/{{userId}}',
          headers: [{ id: 'h-put-1', key: 'Content-Type', value: 'application/json', enabled: true }],
          queryParams: [],
          body: JSON.stringify({ id: 101, name: 'Aarav Patil', email: 'aarav@example.com', role: 'student', active: true }, null, 2),
          auth: { type: 'none' },
        },
      },
      {
        id: 'step-delete-user',
        name: 'Teardown Cleanup (DELETE)',
        description: 'Teardown step: deletes temporary demo user 101',
        enabled: true,
        isTeardown: true,
        request: {
          method: 'DELETE',
          url: 'http://localhost:3001/api/mock/serve/api/users/{{userId}}',
          headers: [],
          queryParams: [],
          body: '',
          auth: { type: 'none' },
        },
      },
    ],
  },
  {
    id: 'wf-ecommerce-checkout-demo',
    name: 'E-Commerce Order Checkout Workflow',
    description: 'Automated 4-step e-commerce flow: Search products, create a customer order, extract orderId, verify order status, and execute teardown order cancellation.',
    steps: [
      {
        id: 'step-browse-products',
        name: '1. Browse Electronics Catalog (GET)',
        description: 'Fetch catalog of products in the electronics category',
        enabled: true,
        request: {
          method: 'GET',
          url: 'http://localhost:3001/api/mock/serve/api/products',
          headers: [
            { id: 'h-browse-1', key: 'Accept', value: 'application/json', enabled: true },
          ],
          queryParams: [
            { id: 'qp-1', key: 'category', value: 'electronics', enabled: true },
            { id: 'qp-2', key: 'limit', value: '10', enabled: true },
          ],
          body: '',
          auth: { type: 'none' },
        },
        extractors: [
          {
            targetVariable: 'featuredProductId',
            source: 'BODY_JSONPATH',
            path: '$[0].id',
            defaultValue: '201',
            isSecret: false,
          },
        ],
      },
      {
        id: 'step-create-order',
        name: '2. Place Customer Order (POST)',
        description: 'Create an order containing the selected product',
        enabled: true,
        dependsOn: ['step-browse-products'],
        request: {
          method: 'POST',
          url: 'http://localhost:3001/api/mock/serve/api/orders',
          headers: [
            { id: 'h-order-1', key: 'Content-Type', value: 'application/json', enabled: true },
          ],
          queryParams: [],
          body: JSON.stringify(
            {
              customerEmail: 'customer@example.com',
              items: [{ productId: 201, quantity: 1 }],
              shippingAddress: '123 Technology Park, Mumbai',
            },
            null,
            2
          ),
          auth: { type: 'none' },
        },
        extractors: [
          {
            targetVariable: 'activeOrderId',
            source: 'BODY_JSONPATH',
            path: '$.orderId',
            defaultValue: 'ORD-9021',
            isSecret: false,
          },
          {
            targetVariable: 'orderStatus',
            source: 'BODY_JSONPATH',
            path: '$.status',
            defaultValue: 'confirmed',
            isSecret: false,
          },
        ],
      },
      {
        id: 'step-get-order',
        name: '3. Track Order Details (GET)',
        description: 'Fetch status of order {{activeOrderId}} extracted from Step 2',
        enabled: true,
        dependsOn: ['step-create-order'],
        request: {
          method: 'GET',
          url: 'http://localhost:3001/api/mock/serve/api/orders/{{activeOrderId}}',
          headers: [
            { id: 'h-track-1', key: 'Accept', value: 'application/json', enabled: true },
          ],
          queryParams: [],
          body: '',
          auth: { type: 'none' },
        },
      },
      {
        id: 'step-cancel-order',
        name: '4. Order Cancellation Teardown (DELETE)',
        description: 'Guaranteed cleanup step cancelling the temporary demo order',
        enabled: true,
        isTeardown: true,
        request: {
          method: 'DELETE',
          url: 'http://localhost:3001/api/mock/serve/api/orders/{{activeOrderId}}',
          headers: [],
          queryParams: [],
          body: '',
          auth: { type: 'none' },
        },
      },
    ],
  },
  {
    id: 'wf-user-order-flow',
    name: 'Auth & User Lifecycle',
    description: 'Authenticates a user, extracts the token, queries user details, and executes cleanup',
    steps: [
      {
        id: 'step-auth',
        name: 'User Authentication',
        description: 'Exchange credentials for session token',
        enabled: true,
        request: {
          method: 'POST',
          url: 'http://localhost:3001/api/mock/serve/api/v1/auth/login',
          headers: [{ id: 'h1', key: 'Content-Type', value: 'application/json', enabled: true }],
          queryParams: [],
          body: JSON.stringify({ username: 'developer', apiKey: '{{apiKey}}' }, null, 2),
          auth: { type: 'none' },
        },
        extractors: [
          {
            targetVariable: 'sessionToken',
            source: 'BODY_JSONPATH',
            path: '$.token',
            defaultValue: 'jwt_mock_token_secret_12345',
            isSecret: true,
          },
          {
            targetVariable: 'userId',
            source: 'BODY_JSONPATH',
            path: '$.userId',
            defaultValue: '101',
            isSecret: false,
          },
        ],
      },
      {
        id: 'step-profile',
        name: 'Fetch Profile',
        description: 'Fetch profile using extracted session token',
        enabled: true,
        dependsOn: ['step-auth'],
        request: {
          method: 'GET',
          url: 'http://localhost:3001/api/mock/serve/api/v1/users/{{userId}}',
          headers: [{ id: 'h2', key: 'Authorization', value: 'Bearer {{sessionToken}}', enabled: true }],
          queryParams: [],
          body: '',
          auth: { type: 'none' },
        },
      },
      {
        id: 'step-cleanup',
        name: 'Logout & Session Cleanup',
        description: 'Invalidate temporary session token upon scenario completion',
        enabled: true,
        isTeardown: true,
        request: {
          method: 'GET',
          url: 'http://localhost:3001/api/mock/serve/health',
          headers: [{ id: 'h3', key: 'Authorization', value: 'Bearer {{sessionToken}}', enabled: true }],
          queryParams: [],
          body: '',
          auth: { type: 'none' },
        },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Sanitization and Size Retention Boundary Helpers
// ---------------------------------------------------------------------------

const SENSITIVE_HEADER_REGEX = /^(authorization|proxy-authorization|x-api-key|cookie|set-cookie)$/i;

export function sanitizeEnvironments(
  environments: FrontendEnvironmentProfile[]
): FrontendEnvironmentProfile[] {
  return environments.map((env) => ({
    ...env,
    variables: env.variables.map((v) =>
      v.isSecret ? { ...v, value: '' } : v
    ),
  }));
}

export function sanitizeRequestDraft(draft?: RequestDraft): RequestDraft | undefined {
  if (!draft) return undefined;

  let sanitizedAuth = draft.auth;
  if (draft.auth.type === 'bearer') {
    sanitizedAuth = { type: 'bearer', token: '' };
  } else if (draft.auth.type === 'basic') {
    sanitizedAuth = { ...draft.auth, password: '' };
  } else if (draft.auth.type === 'apikey') {
    sanitizedAuth = { ...draft.auth, value: '' };
  }

  const sanitizedHeaders = draft.headers.map((h) =>
    SENSITIVE_HEADER_REGEX.test(h.key.trim()) ? { ...h, value: '' } : h
  );

  return {
    ...draft,
    auth: sanitizedAuth,
    headers: sanitizedHeaders,
  };
}

export function sanitizeWorkflows(workflows: WorkflowScenario[]): WorkflowScenario[] {
  return workflows.map((wf) => ({
    ...wf,
    steps: wf.steps.map((step) => {
      let sanitizedAuth = step.request.auth;
      if (step.request.auth?.type === 'bearer') {
        sanitizedAuth = { type: 'bearer', token: '' };
      } else if (step.request.auth?.type === 'basic') {
        sanitizedAuth = { ...step.request.auth, password: '' };
      } else if (step.request.auth?.type === 'apikey') {
        sanitizedAuth = { ...step.request.auth, value: '' };
      }

      const sanitizedHeaders = step.request.headers?.map((h) =>
        SENSITIVE_HEADER_REGEX.test(h.key.trim()) ? { ...h, value: '' } : h
      );

      const sanitizedExtractors = step.extractors?.map((ext) =>
        ext.isSecret ? { ...ext, defaultValue: '' } : ext
      );

      return {
        ...step,
        request: {
          ...step.request,
          auth: sanitizedAuth,
          headers: sanitizedHeaders,
        },
        extractors: sanitizedExtractors,
      };
    }),
  }));
}

export function sanitizeExecutionResults(
  results: Record<string, TestCaseExecutionResult>
): Record<string, TestCaseExecutionResult> {
  // Size-boundary: keep up to the 100 most recent execution results
  const entries = Object.entries(results).slice(-100);
  const sanitized: Record<string, TestCaseExecutionResult> = {};

  for (const [key, res] of entries) {
    let sanitizedRes = { ...res };
    if (sanitizedRes.request?.headers) {
      const scrubbedHeaders = sanitizedRes.request.headers.map((h) => ({
        ...h,
        value: SENSITIVE_HEADER_REGEX.test(h.key.trim()) ? '[REDACTED]' : h.value,
      }));
      sanitizedRes = {
        ...sanitizedRes,
        request: {
          ...sanitizedRes.request,
          headers: scrubbedHeaders,
        },
      };
    }
    // Storage payload boundary: truncate excessive response bodies (> 25,000 characters)
    if (
      sanitizedRes.response?.body &&
      typeof sanitizedRes.response.body === 'string' &&
      sanitizedRes.response.body.length > 25000
    ) {
      sanitizedRes = {
        ...sanitizedRes,
        response: {
          ...sanitizedRes.response,
          body: sanitizedRes.response.body.slice(0, 1000) + '... [Truncated for local storage boundary]',
        },
      };
    }
    sanitized[key] = sanitizedRes;
  }
  return sanitized;
}

export function sanitizeValidationResults(
  results: Record<string, TestCaseValidationResult>
): Record<string, TestCaseValidationResult> {
  const entries = Object.entries(results).slice(-100);
  return Object.fromEntries(entries);
}

export function sanitizeDiagnosisResults(
  results: Record<string, DiagnosisResult>
): Record<string, DiagnosisResult> {
  const entries = Object.entries(results).slice(-100);
  return Object.fromEntries(entries);
}

export function sanitizeManualRequestExecutions(
  executions: ManualRequestExecution[]
): ManualRequestExecution[] {
  return executions.slice(-100).map((execution) => ({
    ...execution,
    endpoint: redactEndpoint(execution.endpoint),
  }));
}

// ---------------------------------------------------------------------------
// Safe Storage Wrapper
// ---------------------------------------------------------------------------

export const safePersistStorage: PersistStorage<Partial<AppState>> = {
  getItem: (name: string) => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      const raw = window.localStorage.getItem(name);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.warn('[APIForge Store] Corrupted or unavailable localStorage data. Resetting to defaults.', err);
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(name);
        }
      } catch {
        // Ignore removal error
      }
      return null;
    }
  },
  setItem: (name: string, value) => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(name, JSON.stringify(value));
    } catch (err) {
      console.warn('[APIForge Store] Failed to save state to localStorage (quota exceeded or storage blocked):', err);
    }
  },
  removeItem: (name: string) => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.removeItem(name);
    } catch (err) {
      console.warn('[APIForge Store] Failed to remove state from localStorage:', err);
    }
  },
};

export type AppState = {
  currentUser: User;
  setDisplayName: (name: string) => void;
  requestTimeoutMs: number;
  setRequestTimeoutMs: (timeout: number) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  requestDraft?: RequestDraft;
  setRequestDraft: (draft: RequestDraft | undefined) => void;
  activeSpecification?: ApiSpecification;
  setActiveSpecification: (specification: ApiSpecification | undefined) => void;
  // Phase 4, 5, 6 shared test lifecycle states
  generatedTests: TestCase[];
  setGeneratedTests: (tests: TestCase[]) => void;
  executionResults: Record<string, TestCaseExecutionResult>;
  setExecutionResults: (results: Record<string, TestCaseExecutionResult>) => void;
  updateExecutionResult: (testCaseId: string, result: TestCaseExecutionResult) => void;
  validationResults: Record<string, TestCaseValidationResult>;
  setValidationResults: (results: Record<string, TestCaseValidationResult>) => void;
  updateValidationResult: (testCaseId: string, result: TestCaseValidationResult) => void;
  validationSuiteSummary?: TestSuiteValidationSummary;
  setValidationSuiteSummary: (summary: TestSuiteValidationSummary | undefined) => void;
  // Phase 7 AI diagnosis
  diagnosisResults: Record<string, DiagnosisResult>;
  setDiagnosisResults: (results: Record<string, DiagnosisResult>) => void;
  updateDiagnosisResult: (testCaseId: string, result: DiagnosisResult) => void;
  reportSummary?: ReportSummary;
  setReportSummary: (summary: ReportSummary | undefined) => void;
  /** Manual Request Builder attempts only. Deliberately separate from automated test executions. */
  manualRequestExecutions: ManualRequestExecution[];
  recordManualRequestExecution: (execution: ManualRequestExecution) => void;
  collections: ApiCollection[];
  createCollection: (name: string) => string;
  updateCollection: (id: string, updates: Partial<Pick<ApiCollection, 'name' | 'requests'>>) => void;
  deleteCollection: (id: string) => void;

  // Phase 9 Environment Management
  environments: FrontendEnvironmentProfile[];
  activeEnvironmentId?: string;
  setEnvironments: (environments: FrontendEnvironmentProfile[]) => void;
  setActiveEnvironmentId: (id: string | undefined) => void;
  createEnvironment: (profile: Omit<FrontendEnvironmentProfile, 'id'>) => string;
  updateEnvironment: (id: string, updates: Partial<FrontendEnvironmentProfile>) => void;
  duplicateEnvironment: (id: string) => string | undefined;
  deleteEnvironment: (id: string) => boolean;

  // Phase 9 Workflow Scenarios & Execution
  workflows: WorkflowScenario[];
  activeWorkflowId?: string;
  setWorkflows: (workflows: WorkflowScenario[]) => void;
  setActiveWorkflowId: (id: string | undefined) => void;
  createWorkflow: (workflow: Omit<WorkflowScenario, 'id'>) => string;
  updateWorkflow: (id: string, updates: Partial<WorkflowScenario>) => void;
  duplicateWorkflow: (id: string) => string | undefined;
  deleteWorkflow: (id: string) => boolean;

  workflowExecutionResult?: SanitizedWorkflowExecutionResult;
  setWorkflowExecutionResult: (result: SanitizedWorkflowExecutionResult | undefined) => void;
  workflowExecutionRunning: boolean;
  setWorkflowExecutionRunning: (running: boolean) => void;
  workflowExecutionError?: string;
  setWorkflowExecutionError: (error: string | undefined) => void;

  // Phase 10 Mock Server Engine
  mockRoutes: MockRoute[];
  activeMockRouteId?: string;
  mockLogs: MockRequestLog[];
  setMockRoutes: (routes: MockRoute[]) => void;
  setActiveMockRouteId: (id: string | undefined) => void;
  setMockLogs: (logs: MockRequestLog[]) => void;

  // Notification Management
  notifications: AppNotification[];
  addNotification: (notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;

  // Agent Orchestrator Tasks
  agentTasks: AgentTask[];
  activeAgentTaskId?: string;
  setAgentTasks: (tasks: AgentTask[]) => void;
  setActiveAgentTaskId: (id: string | undefined) => void;
  addAgentTask: (task: AgentTask) => void;
  updateAgentTask: (task: AgentTask) => void;

  // Phase 12 Reset Workspace Action
  resetWorkspace: () => void;
};

export const defaultNotifications: AppNotification[] = [
  {
    id: 'notif-1',
    type: 'success',
    title: 'Agent Engine Online',
    message: 'APIForge Agentic AI Engineering Platform initialized with 10 real execution tools.',
    timestamp: new Date().toISOString(),
    read: false,
    actionUrl: '/ai-assistant',
    actionLabel: 'Agent Workspace',
  },
  {
    id: 'notif-2',
    type: 'info',
    title: 'Environment Connected',
    message: 'Active profile is set to Local (http://localhost:3000).',
    timestamp: new Date().toISOString(),
    read: false,
    actionUrl: '/environments',
    actionLabel: 'Manage',
  },
];

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentUser: {
        name: "Developer",
        role: "API Engineer",
      },
      setDisplayName: (name) => set((state) => ({ currentUser: { ...state.currentUser, name: name.trim() || 'Developer' } })),
      requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
      setRequestTimeoutMs: (requestTimeoutMs) => set({ requestTimeoutMs: clampRequestTimeout(requestTimeoutMs) }),
      sidebarOpen: false,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setRequestDraft: (requestDraft) => set({ requestDraft }),
      setActiveSpecification: (activeSpecification) => set({ activeSpecification }),
      generatedTests: [],
      setGeneratedTests: (generatedTests) => set({ generatedTests }),
      executionResults: {},
      setExecutionResults: (executionResults) => set({ executionResults }),
      updateExecutionResult: (testCaseId, result) =>
        set((state) => ({
          executionResults: { ...state.executionResults, [testCaseId]: result },
        })),
      validationResults: {},
      setValidationResults: (validationResults) => set({ validationResults }),
      updateValidationResult: (testCaseId, result) =>
        set((state) => ({
          validationResults: { ...state.validationResults, [testCaseId]: result },
        })),
      validationSuiteSummary: undefined,
      setValidationSuiteSummary: (validationSuiteSummary) => set({ validationSuiteSummary }),
      diagnosisResults: {},
      setDiagnosisResults: (diagnosisResults) => set({ diagnosisResults }),
      updateDiagnosisResult: (testCaseId, result) =>
        set((state) => ({
          diagnosisResults: { ...state.diagnosisResults, [testCaseId]: result },
        })),
      reportSummary: undefined,
      setReportSummary: (reportSummary) => set({ reportSummary }),
      manualRequestExecutions: [],
      recordManualRequestExecution: (execution) => set((state) => ({
        manualRequestExecutions: sanitizeManualRequestExecutions([...state.manualRequestExecutions, execution]),
      })),
      collections: [],
      createCollection: (name) => { const id = `collection-${crypto.randomUUID().slice(0, 8)}`; const now = new Date().toISOString(); set((state) => ({ collections: [...state.collections, { id, name: name.trim() || 'Untitled collection', requests: [], createdAt: now, updatedAt: now }] })); return id; },
      updateCollection: (id, updates) => set((state) => ({ collections: state.collections.map((item) => item.id === id ? { ...item, ...updates, updatedAt: new Date().toISOString() } : item) })),
      deleteCollection: (id) => set((state) => ({ collections: state.collections.filter((item) => item.id !== id) })),

      // Phase 9 Environment Management
      environments: defaultEnvironments,
      activeEnvironmentId: 'env-local',
      setEnvironments: (environments) => set({ environments }),
      setActiveEnvironmentId: (activeEnvironmentId) => {
        const env = get().environments.find((e) => e.id === activeEnvironmentId);
        if (env) {
          get().addNotification({
            type: 'info',
            title: 'Environment Switched',
            message: `Active environment profile changed to ${env.name} (${env.baseUrl})`,
            actionUrl: '/environments',
            actionLabel: 'View Environment',
          });
        }
        set({ activeEnvironmentId });
      },
      createEnvironment: (profile) => {
        const newId = `env-${crypto.randomUUID().slice(0, 8)}`;
        const now = new Date().toISOString();
        const newProfile: FrontendEnvironmentProfile = {
          ...profile,
          id: newId,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          environments: [...state.environments, newProfile],
          activeEnvironmentId: newId,
        }));
        return newId;
      },
      updateEnvironment: (id, updates) => {
        set((state) => ({
          environments: state.environments.map((env) =>
            env.id === id ? { ...env, ...updates, updatedAt: new Date().toISOString() } : env
          ),
        }));
      },
      duplicateEnvironment: (id) => {
        const existing = get().environments.find((e) => e.id === id);
        if (!existing) return undefined;
        const newId = `env-${crypto.randomUUID().slice(0, 8)}`;
        const now = new Date().toISOString();
        const cloned: FrontendEnvironmentProfile = {
          ...JSON.parse(JSON.stringify(existing)),
          id: newId,
          name: `${existing.name} (Copy)`,
          isDefault: false,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          environments: [...state.environments, cloned],
          activeEnvironmentId: newId,
        }));
        return newId;
      },
      deleteEnvironment: (id) => {
        const { environments, activeEnvironmentId } = get();
        if (environments.length <= 1) {
          return false;
        }
        const filtered = environments.filter((e) => e.id !== id);
        let newActiveId = activeEnvironmentId;
        if (activeEnvironmentId === id) {
          newActiveId = filtered[0]?.id;
        }
        set({
          environments: filtered,
          activeEnvironmentId: newActiveId,
        });
        return true;
      },

      // Phase 9 Workflow Scenarios & Execution
      workflows: defaultWorkflows,
      activeWorkflowId: 'wf-user-management-demo',
      setWorkflows: (workflows) => set({ workflows }),
      setActiveWorkflowId: (activeWorkflowId) =>
        set((state) => ({
          activeWorkflowId,
          ...(state.activeWorkflowId !== activeWorkflowId
            ? { workflowExecutionResult: undefined, workflowExecutionError: undefined }
            : {}),
        })),
      createWorkflow: (workflow) => {
        const newId = `wf-${crypto.randomUUID().slice(0, 8)}`;
        const now = new Date().toISOString();
        const newScenario: WorkflowScenario = {
          ...workflow,
          id: newId,
          metadata: {
            createdAt: now,
            updatedAt: now,
          },
        };
        set((state) => ({
          workflows: [...state.workflows, newScenario],
          activeWorkflowId: newId,
          workflowExecutionResult: undefined,
          workflowExecutionError: undefined,
        }));
        return newId;
      },
      updateWorkflow: (id, updates) => {
        set((state) => ({
          workflows: state.workflows.map((wf) =>
            wf.id === id
              ? {
                  ...wf,
                  ...updates,
                  metadata: {
                    ...wf.metadata,
                    updatedAt: new Date().toISOString(),
                  },
                }
              : wf
          ),
        }));
      },
      duplicateWorkflow: (id) => {
        const existing = get().workflows.find((w) => w.id === id);
        if (!existing) return undefined;
        const newId = `wf-${crypto.randomUUID().slice(0, 8)}`;
        const now = new Date().toISOString();
        const cloned: WorkflowScenario = {
          ...JSON.parse(JSON.stringify(existing)),
          id: newId,
          name: `${existing.name} (Copy)`,
          metadata: {
            createdAt: now,
            updatedAt: now,
          },
        };
        set((state) => ({
          workflows: [...state.workflows, cloned],
          activeWorkflowId: newId,
          workflowExecutionResult: undefined,
          workflowExecutionError: undefined,
        }));
        return newId;
      },
      deleteWorkflow: (id) => {
        const { workflows, activeWorkflowId } = get();
        if (workflows.length <= 1) {
          return false;
        }
        const filtered = workflows.filter((w) => w.id !== id);
        let newActiveId = activeWorkflowId;
        if (activeWorkflowId === id) {
          newActiveId = filtered[0]?.id;
        }
        set((state) => ({
          workflows: filtered,
          activeWorkflowId: newActiveId,
          ...(newActiveId !== state.activeWorkflowId
            ? { workflowExecutionResult: undefined, workflowExecutionError: undefined }
            : {}),
        }));
        return true;
      },

      workflowExecutionResult: undefined,
      setWorkflowExecutionResult: (workflowExecutionResult) => set({ workflowExecutionResult }),
      workflowExecutionRunning: false,
      setWorkflowExecutionRunning: (workflowExecutionRunning) => set({ workflowExecutionRunning }),
      workflowExecutionError: undefined,
      setWorkflowExecutionError: (workflowExecutionError) => set({ workflowExecutionError }),

      // Phase 10 Mock Server Engine
      mockRoutes: [],
      activeMockRouteId: undefined,
      mockLogs: [],
      setMockRoutes: (mockRoutes) => set({ mockRoutes }),
      setActiveMockRouteId: (activeMockRouteId) => set({ activeMockRouteId }),
      setMockLogs: (mockLogs) => set({ mockLogs }),

      // Notification Management
      notifications: defaultNotifications,
      addNotification: (notification) =>
        set((state) => ({
          notifications: [
            {
              ...notification,
              id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              timestamp: new Date().toISOString(),
              read: false,
            },
            ...state.notifications.slice(0, 49),
          ],
        })),
      markNotificationRead: (id) =>
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        })),
      markAllNotificationsRead: () =>
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
        })),
      removeNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),
      clearNotifications: () => set({ notifications: [] }),

      // Agent Orchestrator Tasks
      agentTasks: [],
      activeAgentTaskId: undefined,
      setAgentTasks: (agentTasks) => set({ agentTasks }),
      setActiveAgentTaskId: (activeAgentTaskId) => set({ activeAgentTaskId }),
      addAgentTask: (task) =>
        set((state) => ({
          agentTasks: [task, ...state.agentTasks.filter((t) => t.taskId !== task.taskId)],
          activeAgentTaskId: task.taskId,
        })),
      updateAgentTask: (task) =>
        set((state) => ({
          agentTasks: state.agentTasks.map((t) => (t.taskId === task.taskId ? task : t)),
        })),

      // Phase 12 Reset Workspace Action
      resetWorkspace: () => {
        safePersistStorage.removeItem('apiforge-workspace');
        set({
          requestDraft: undefined,
          requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
          activeSpecification: undefined,
          generatedTests: [],
          executionResults: {},
          validationResults: {},
          validationSuiteSummary: undefined,
          diagnosisResults: {},
          reportSummary: undefined,
          manualRequestExecutions: [],
          collections: [],
          environments: defaultEnvironments,
          activeEnvironmentId: 'env-local',
          workflows: defaultWorkflows,
          activeWorkflowId: 'wf-user-management-demo',
          workflowExecutionResult: undefined,
          workflowExecutionRunning: false,
          workflowExecutionError: undefined,
          mockRoutes: [],
          activeMockRouteId: undefined,
          mockLogs: [],
          agentTasks: [],
          activeAgentTaskId: undefined,
          notifications: [
            {
              id: `notif-${Date.now()}`,
              type: 'info',
              title: 'Workspace Reset Complete',
              message: 'Workspace was cleanly restored to initial default state. All cached data cleared.',
              timestamp: new Date().toISOString(),
              read: false,
            },
          ],
        });
      },
    }),
    {
      name: 'apiforge-workspace',
      storage: safePersistStorage,
      version: 2,
      migrate: (persistedState: unknown, version: number) => {
        if (version < 1 || !persistedState || typeof persistedState !== 'object') {
          return {
            environments: defaultEnvironments,
            workflows: defaultWorkflows,
            generatedTests: [],
            executionResults: {},
            validationResults: {},
            diagnosisResults: {},
            manualRequestExecutions: [],
            collections: [],
            mockRoutes: [],
            mockLogs: [],
            notifications: defaultNotifications,
            agentTasks: [],
          };
        }
        const existing = persistedState as Partial<AppState>;
        return {
          ...existing,
          requestTimeoutMs: clampRequestTimeout(existing.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS),
          notifications: existing.notifications ?? defaultNotifications,
          agentTasks: existing.agentTasks ?? [],
        };
      },
      partialize: (state) => ({
        currentUser: state.currentUser,
        requestTimeoutMs: state.requestTimeoutMs,
        requestDraft: sanitizeRequestDraft(state.requestDraft),
        activeSpecification: state.activeSpecification,
        generatedTests: state.generatedTests,
        executionResults: sanitizeExecutionResults(state.executionResults),
        validationResults: sanitizeValidationResults(state.validationResults),
        validationSuiteSummary: state.validationSuiteSummary,
        diagnosisResults: sanitizeDiagnosisResults(state.diagnosisResults),
        reportSummary: state.reportSummary,
        manualRequestExecutions: sanitizeManualRequestExecutions(state.manualRequestExecutions),
        collections: state.collections,
        environments: sanitizeEnvironments(state.environments),
        activeEnvironmentId: state.activeEnvironmentId,
        workflows: sanitizeWorkflows(state.workflows),
        activeWorkflowId: state.activeWorkflowId,
        workflowExecutionResult: state.workflowExecutionResult,
        mockRoutes: state.mockRoutes,
        activeMockRouteId: state.activeMockRouteId,
        mockLogs: state.mockLogs.slice(-50),
        notifications: state.notifications.slice(0, 30),
        agentTasks: state.agentTasks.slice(0, 20),
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn(
            '[APIForge Store] Storage rehydration encountered an error, falling back to clean workspace state:',
            error
          );
        }
      },
    }
  )
);
