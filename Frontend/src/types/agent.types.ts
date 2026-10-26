export type AgentToolName =
  | 'inspect_api'
  | 'send_api_request'
  | 'generate_test_cases'
  | 'run_api_tests'
  | 'generate_mock_api'
  | 'generate_openapi_spec'
  | 'analyze_failure'
  | 'generate_code_patch'
  | 'verify_code_patch'
  | 'get_execution_report';

export type AgentToolRisk = 'READ_ONLY' | 'LOCAL_DRAFT' | 'NETWORK_EXECUTION' | 'DESTRUCTIVE';

export type AgentTaskStatus =
  | 'PLANNING'
  | 'READY'
  | 'WAITING_FOR_APPROVAL'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type AgentStepStatus =
  | 'PENDING'
  | 'WAITING_FOR_APPROVAL'
  | 'APPROVED'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'SKIPPED';

export interface AgentStepProposal {
  stepId: string;
  tool: AgentToolName;
  arguments: Record<string, unknown>;
  dependsOn: string[];
  risk: AgentToolRisk;
  requiresApproval: boolean;
  summary: string;
  status: AgentStepStatus;
  startedAt?: string;
  completedAt?: string;
  output?: unknown;
  error?: string;
}

export interface AgentArtifact {
  id: string;
  name: string;
  type: 'openapi_spec' | 'test_suite' | 'code_patch' | 'report' | 'mock_server' | 'json';
  content: unknown;
  createdAt: string;
}

export interface AgentTask {
  taskId: string;
  goal: string;
  status: AgentTaskStatus;
  steps: AgentStepProposal[];
  currentStepIndex: number;
  artifacts: AgentArtifact[];
  advisoryPlan: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
}
