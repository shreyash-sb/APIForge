/**
 * Provider-neutral contracts for proposed agent actions.
 *
 * These types deliberately describe plans and results only. They do not grant
 * access to the workspace, browser storage, network, shell, or HTTP executor.
 */

import type { HttpMethod } from './request.types.js';

export const AGENT_ACTION_NAMES = [
  'inspect_workspace',
  'inspect_openapi_endpoint',
  'list_collections',
  'inspect_collection',
  'draft_collection',
  'draft_collection_request',
  'draft_request_builder_request',
] as const;

export type AgentActionName = (typeof AGENT_ACTION_NAMES)[number];

export type AgentActionRisk = 'READ_ONLY' | 'LOCAL_DRAFT' | 'NETWORK_EXECUTION' | 'DESTRUCTIVE';

export type AgentStepStatus =
  | 'PROPOSED'
  | 'WAITING_FOR_APPROVAL'
  | 'APPROVED'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'SKIPPED';

export interface AgentHeaderDraft {
  key: string;
  value: string;
  enabled?: boolean;
}

export interface AgentQueryParamDraft {
  key: string;
  value: string;
  enabled?: boolean;
}

/** Credentials and auth configuration are intentionally not representable. */
export interface AgentRequestDraft {
  method: HttpMethod;
  url: string;
  headers?: AgentHeaderDraft[];
  queryParams?: AgentQueryParamDraft[];
  body?: string | null;
  /** JSON bodies are parsed during validation; text bodies are retained as text. */
  bodyType?: 'json' | 'text';
}

export type InspectWorkspaceArguments = Record<never, never>;
export interface InspectOpenApiEndpointArguments { endpointId: string }
export type ListCollectionsArguments = Record<never, never>;
export interface InspectCollectionArguments { collectionId: string }
export interface DraftCollectionArguments { name: string }
export interface DraftCollectionRequestArguments {
  collectionId: string;
  request: AgentRequestDraft & { name: string };
}
export type DraftRequestBuilderRequestArguments = AgentRequestDraft;

export type AgentActionArguments =
  | InspectWorkspaceArguments
  | InspectOpenApiEndpointArguments
  | ListCollectionsArguments
  | InspectCollectionArguments
  | DraftCollectionArguments
  | DraftCollectionRequestArguments
  | DraftRequestBuilderRequestArguments;

export interface AgentActionProposal<TArguments extends AgentActionArguments = AgentActionArguments> {
  stepId: string;
  action: AgentActionName;
  arguments: TArguments;
  dependsOn: string[];
  /** Must match the trusted policy derived by the validator. */
  risk: AgentActionRisk;
  /** Must match the trusted policy derived by the validator. */
  requiresApproval: boolean;
  summary: string;
}

export interface AgentPlan {
  planId: string;
  advisoryText: string;
  steps: AgentActionProposal[];
}

export interface AgentActionResult {
  planId: string;
  stepId: string;
  status: AgentStepStatus;
  startedAt?: string;
  completedAt?: string;
  /** Future action runners may return only allowlisted, sanitized data here. */
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

export interface AgentValidationError {
  code:
    | 'INVALID_PLAN'
    | 'UNKNOWN_FIELD'
    | 'UNKNOWN_ACTION'
    | 'INVALID_ARGUMENT'
    | 'INVALID_URL'
    | 'INVALID_HTTP_METHOD'
    | 'INVALID_DEPENDENCY'
    | 'DEPENDENCY_CYCLE'
    | 'POLICY_MISMATCH'
    | 'PLAN_LIMIT_EXCEEDED';
  path: string;
  /** Never includes an untrusted value, which may contain a secret. */
  message: string;
}

export type AgentPlanValidationResult =
  | { ok: true; plan: AgentPlan }
  | { ok: false; errors: AgentValidationError[] };

export const MAX_AGENT_PLAN_STEPS = 20;
export const MAX_AGENT_PLAN_BYTES = 128 * 1024;
export const MAX_AGENT_ARGUMENT_BYTES = 24 * 1024;
export const MAX_AGENT_STEP_ID_LENGTH = 80;
export const MAX_AGENT_PLAN_ID_LENGTH = 80;
export const MAX_AGENT_ADVISORY_TEXT_LENGTH = 4_000;
export const MAX_AGENT_SUMMARY_LENGTH = 500;
