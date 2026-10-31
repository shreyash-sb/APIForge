import { create } from "zustand";
import { persist, type PersistStorage } from "zustand/middleware";
import { collectionService } from '../services/collectionService';
import type { ManualRequestExecution, RequestDraft, ApiCollection } from '@/types/request.types';
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

export type { RequestDraft, ApiCollection, AppNotification };

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
    baseUrl: 'http://localhost:3000',
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
    id: 'wf-user-order-flow',
    name: 'User & Order Lifecycle',
    description: 'Authenticates a user, extracts the token, queries user details, and executes cleanup',
    steps: [
      {
        id: 'step-auth',
        name: 'User Authentication',
        description: 'Exchange credentials for session token',
        enabled: true,
        request: {
          method: 'POST',
          url: '{{baseUrl}}/api/v1/auth/login',
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
          url: '{{baseUrl}}/api/v1/users/{{userId}}',
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
          method: 'POST',
          url: '{{baseUrl}}/api/v1/auth/logout',
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
  setCollections: (collections: ApiCollection[]) => void;
  loadCollections: () => Promise<void>;
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


  // Phase 12 Reset Workspace Action
  resetWorkspace: () => void;

  /**
   * Browser-stored workspace data belongs to one account. claimWorkspace() is called on
   * sign-in: if the stored data belongs to a different account it is wiped first.
   * clearUserWorkspace() wipes it on sign-out/account deletion.
   */
  workspaceOwnerId?: string;
  claimWorkspace: (userId: string) => void;
  clearUserWorkspace: () => void;
};

export const defaultNotifications: AppNotification[] = [
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

/** Workspace data cleared on reset or account change (preferences like display name excluded). */
function workspaceDataDefaults(): Partial<AppState> {
  return {
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
    activeWorkflowId: 'wf-user-order-flow',
    workflowExecutionResult: undefined,
    workflowExecutionRunning: false,
    workflowExecutionError: undefined,
    mockRoutes: [],
    activeMockRouteId: undefined,
    mockLogs: [],
  };
}

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
      setCollections: (collections) => set({ collections: Array.isArray(collections) ? collections : [] }),
      loadCollections: async () => {
        try {
          const collections = await collectionService.getCollections();
          if (Array.isArray(collections)) {
            set({ collections });
          }
        } catch {
          // Keep existing state if offline or unauthenticated
        }
      },
      createCollection: (name) => {
        const id = `col_${crypto.randomUUID().slice(0, 8)}`;
        const now = new Date().toISOString();
        const newCollection: ApiCollection = {
          id,
          name: name.trim() || 'Untitled collection',
          requests: [],
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({ collections: [...state.collections, newCollection] }));
        void Promise.resolve(collectionService.createCollection({ id, name: newCollection.name, requests: [] })).catch(() => {});
        return id;
      },
      updateCollection: (id, updates) => {
        set((state) => ({
          collections: state.collections.map((item) =>
            item.id === id ? { ...item, ...updates, updatedAt: new Date().toISOString() } : item
          ),
        }));
        void Promise.resolve(collectionService.updateCollection(id, updates)).catch(() => {});
      },
      deleteCollection: (id) => {
        set((state) => ({
          collections: state.collections.filter((item) => item.id !== id),
        }));
        void Promise.resolve(collectionService.deleteCollection(id)).catch(() => {});
      },

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
      activeWorkflowId: 'wf-user-order-flow',
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

      claimWorkspace: (userId) => {
        const owner = get().workspaceOwnerId;
        // Data saved before ownership tracking existed (no owner) is adopted by the first sign-in.
        if (owner && owner !== userId) get().clearUserWorkspace();
        set({ workspaceOwnerId: userId });
      },
      clearUserWorkspace: () => {
        set({
          ...workspaceDataDefaults(),
          currentUser: { name: 'Developer', role: 'API Engineer' },
          notifications: [],
          workspaceOwnerId: undefined,
        });
      },

      // Phase 12 Reset Workspace Action
      resetWorkspace: () => {
        safePersistStorage.removeItem('apiforge-workspace');
        set({
          ...workspaceDataDefaults(),
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
      version: 3,
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
          };
        }
        // v3: the agent workspace was removed — drop its stored tasks and its notifications.
        const existing = { ...(persistedState as Partial<AppState> & { agentTasks?: unknown; activeAgentTaskId?: unknown }) };
        delete existing.agentTasks;
        delete existing.activeAgentTaskId;
        return {
          ...existing,
          requestTimeoutMs: clampRequestTimeout(existing.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS),
          notifications: (existing.notifications ?? defaultNotifications).filter(
            (notification) => notification.actionLabel !== 'Agent Workspace' && notification.title !== 'Agent Engine Online'
          ),
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
        workspaceOwnerId: state.workspaceOwnerId,
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
