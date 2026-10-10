import { create } from "zustand";
import type { Auth, Header, HttpMethod, QueryParam } from '@/types/request.types';
import type { ApiSpecification } from '@/types/openapi.types';
import type { TestCase } from '@/types/testCase.types';
import type { TestCaseExecutionResult } from '@/types/testExecution.types';
import type { TestCaseValidationResult, TestSuiteValidationSummary } from '@/types/validation.types';
import type { DiagnosisResult } from '@/types/diagnosis.types';
import type { ReportSummary } from '@/types/report.types';

type User = {
  name: string;
  role: string;
};

export type RequestDraft = {
  method: HttpMethod;
  url: string;
  queryParams: QueryParam[];
  headers: Header[];
  body: string;
  auth: Auth;
};

type AppState = {
  currentUser: User;
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
};

export const useAppStore = create<AppState>((set) => ({
  currentUser: {
    name: "Developer",
    role: "API Engineer",
  },
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
}));
