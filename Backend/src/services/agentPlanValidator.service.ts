import {
  AGENT_ACTION_NAMES,
  MAX_AGENT_ADVISORY_TEXT_LENGTH,
  MAX_AGENT_ARGUMENT_BYTES,
  MAX_AGENT_PLAN_BYTES,
  MAX_AGENT_PLAN_ID_LENGTH,
  MAX_AGENT_PLAN_STEPS,
  MAX_AGENT_STEP_ID_LENGTH,
  MAX_AGENT_SUMMARY_LENGTH,
  type AgentActionArguments,
  type AgentActionName,
  type AgentActionProposal,
  type AgentActionRisk,
  type AgentHeaderDraft,
  type AgentPlanValidationResult,
  type AgentQueryParamDraft,
  type AgentRequestDraft,
  type AgentValidationError,
} from '../types/agent.types.js';
import type { HttpMethod } from '../types/request.types.js';

const HTTP_METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE'];
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SENSITIVE_FIELD = /(?:authorization|proxy-authorization|cookie|api[-_]?key|x-auth-token|password|secret|token)/i;
const MAX_ID_LENGTH = 128;
const MAX_NAME_LENGTH = 120;
const MAX_URL_LENGTH = 2_048;
const MAX_HEADER_KEY_LENGTH = 128;
const MAX_HEADER_VALUE_LENGTH = 2_048;
const MAX_QUERY_KEY_LENGTH = 128;
const MAX_QUERY_VALUE_LENGTH = 2_048;
const MAX_HEADERS = 30;
const MAX_QUERY_PARAMS = 30;
const MAX_BODY_LENGTH = 20_000;
const MAX_ERRORS = 50;

type UnknownRecord = Record<string, unknown>;

interface TrustedActionPolicy {
  risk: AgentActionRisk;
  requiresApproval: boolean;
}

const ACTION_POLICY: Record<AgentActionName, TrustedActionPolicy> = {
  inspect_workspace: { risk: 'READ_ONLY', requiresApproval: false },
  inspect_openapi_endpoint: { risk: 'READ_ONLY', requiresApproval: false },
  list_collections: { risk: 'READ_ONLY', requiresApproval: false },
  inspect_collection: { risk: 'READ_ONLY', requiresApproval: false },
  // Drafts never mutate state in this phase. Applying one later must be approved.
  draft_collection: { risk: 'LOCAL_DRAFT', requiresApproval: true },
  draft_collection_request: { risk: 'LOCAL_DRAFT', requiresApproval: true },
  draft_request_builder_request: { risk: 'LOCAL_DRAFT', requiresApproval: true },
};

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const byteLength = (value: unknown): number => {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};

class ValidationCollector {
  readonly errors: AgentValidationError[] = [];

  add(error: AgentValidationError): void {
    if (this.errors.length < MAX_ERRORS) this.errors.push(error);
  }

  invalid(path: string, message: string): void {
    this.add({ code: 'INVALID_ARGUMENT', path, message });
  }

  fields(value: UnknownRecord, allowed: readonly string[], path: string): void {
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) {
        // Do not echo unexpected field names: callers could place secrets in them.
        this.add({ code: 'UNKNOWN_FIELD', path, message: 'Unexpected field.' });
      }
    }
  }
}

function nonEmptyString(value: unknown, path: string, maximum: number, errors: ValidationCollector): string | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    errors.invalid(path, 'A non-empty string is required.');
    return undefined;
  }
  if (value.length > maximum) {
    errors.add({ code: 'PLAN_LIMIT_EXCEEDED', path, message: 'String exceeds the permitted length.' });
    return undefined;
  }
  return value;
}

function identifier(value: unknown, path: string, maximum: number, errors: ValidationCollector): string | undefined {
  const result = nonEmptyString(value, path, maximum, errors);
  if (result && !IDENTIFIER.test(result)) {
    errors.invalid(path, 'Identifier contains unsupported characters.');
    return undefined;
  }
  return result;
}

function optionalBoolean(value: unknown, path: string, errors: ValidationCollector): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    errors.invalid(path, 'Boolean value is required.');
    return undefined;
  }
  return value;
}

function validatePairs(
  value: unknown,
  path: string,
  keyLimit: number,
  valueLimit: number,
  itemLimit: number,
  errors: ValidationCollector,
  rejectSensitiveKeys: boolean,
): AgentHeaderDraft[] | AgentQueryParamDraft[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > itemLimit) {
    errors.invalid(path, 'A bounded array is required.');
    return undefined;
  }
  const result: Array<AgentHeaderDraft | AgentQueryParamDraft> = [];
  for (const [index, item] of value.entries()) {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      errors.invalid(itemPath, 'Object entry is required.');
      continue;
    }
    errors.fields(item, ['key', 'value', 'enabled'], itemPath);
    const key = nonEmptyString(item.key, `${itemPath}.key`, keyLimit, errors);
    const pairValue = nonEmptyString(item.value, `${itemPath}.value`, valueLimit, errors);
    const enabled = optionalBoolean(item.enabled, `${itemPath}.enabled`, errors);
    if (rejectSensitiveKeys && key && SENSITIVE_FIELD.test(key)) {
      errors.invalid(`${itemPath}.key`, 'Credential-bearing fields are not supported in agent drafts.');
    }
    if (key && pairValue) result.push({ key, value: pairValue, ...(enabled === undefined ? {} : { enabled }) });
  }
  return result as AgentHeaderDraft[] | AgentQueryParamDraft[];
}

function validateRequestDraft(value: unknown, path: string, errors: ValidationCollector, requiresName: boolean): AgentRequestDraft | undefined {
  if (!isRecord(value)) {
    errors.invalid(path, 'Request draft object is required.');
    return undefined;
  }
  errors.fields(value, requiresName ? ['name', 'method', 'url', 'headers', 'queryParams', 'body', 'bodyType'] : ['method', 'url', 'headers', 'queryParams', 'body', 'bodyType'], path);
  const name = requiresName ? nonEmptyString(value.name, `${path}.name`, MAX_NAME_LENGTH, errors) : undefined;
  let method: HttpMethod | undefined;
  if (typeof value.method !== 'string' || !HTTP_METHODS.includes(value.method as HttpMethod)) {
    errors.add({ code: 'INVALID_HTTP_METHOD', path: `${path}.method`, message: 'Unsupported HTTP method.' });
  } else method = value.method as HttpMethod;

  const url = nonEmptyString(value.url, `${path}.url`, MAX_URL_LENGTH, errors);
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        errors.add({ code: 'INVALID_URL', path: `${path}.url`, message: 'Only HTTP and HTTPS URLs are supported.' });
      }
      if (parsed.username || parsed.password || [...parsed.searchParams.keys()].some((key) => SENSITIVE_FIELD.test(key))) {
        errors.add({ code: 'INVALID_URL', path: `${path}.url`, message: 'Credential-bearing URLs are not supported in agent drafts.' });
      }
    } catch {
      errors.add({ code: 'INVALID_URL', path: `${path}.url`, message: 'A valid absolute HTTP(S) URL is required.' });
    }
  }
  const headers = validatePairs(value.headers, `${path}.headers`, MAX_HEADER_KEY_LENGTH, MAX_HEADER_VALUE_LENGTH, MAX_HEADERS, errors, true) as AgentHeaderDraft[] | undefined;
  const queryParams = validatePairs(value.queryParams, `${path}.queryParams`, MAX_QUERY_KEY_LENGTH, MAX_QUERY_VALUE_LENGTH, MAX_QUERY_PARAMS, errors, true) as AgentQueryParamDraft[] | undefined;
  let body: string | null | undefined;
  if (value.body !== undefined && value.body !== null && typeof value.body !== 'string') errors.invalid(`${path}.body`, 'Body must be a string or null.');
  else if (typeof value.body === 'string') {
    if (value.body.length > MAX_BODY_LENGTH) errors.add({ code: 'PLAN_LIMIT_EXCEEDED', path: `${path}.body`, message: 'Body exceeds the permitted length.' });
    else body = value.body;
  } else body = value.body as null | undefined;
  let bodyType: 'json' | 'text' | undefined;
  if (value.bodyType !== undefined) {
    if (value.bodyType !== 'json' && value.bodyType !== 'text') errors.invalid(`${path}.bodyType`, 'Body type must be json or text.');
    else bodyType = value.bodyType;
  }
  if (bodyType === 'json' && typeof body === 'string' && body.trim()) {
    try { JSON.parse(body); } catch { errors.invalid(`${path}.body`, 'Body declared as JSON must contain valid JSON.'); }
  }
  if (!method || !url || (requiresName && !name)) return undefined;
  const base: AgentRequestDraft = { method, url, ...(headers ? { headers } : {}), ...(queryParams ? { queryParams } : {}), ...(body !== undefined ? { body } : {}), ...(bodyType ? { bodyType } : {}) };
  return requiresName ? { ...base, name } as AgentRequestDraft : base;
}

function validateArguments(action: AgentActionName, value: unknown, path: string, errors: ValidationCollector): AgentActionArguments | undefined {
  if (!isRecord(value)) {
    errors.invalid(path, 'Action arguments must be an object.');
    return undefined;
  }
  if (byteLength(value) > MAX_AGENT_ARGUMENT_BYTES) {
    errors.add({ code: 'PLAN_LIMIT_EXCEEDED', path, message: 'Arguments exceed the permitted size.' });
    return undefined;
  }
  switch (action) {
    case 'inspect_workspace':
    case 'list_collections':
      errors.fields(value, [], path);
      return {};
    case 'inspect_openapi_endpoint': {
      errors.fields(value, ['endpointId'], path);
      const endpointId = identifier(value.endpointId, `${path}.endpointId`, MAX_ID_LENGTH, errors);
      return endpointId ? { endpointId } : undefined;
    }
    case 'inspect_collection': {
      errors.fields(value, ['collectionId'], path);
      const collectionId = identifier(value.collectionId, `${path}.collectionId`, MAX_ID_LENGTH, errors);
      return collectionId ? { collectionId } : undefined;
    }
    case 'draft_collection': {
      errors.fields(value, ['name'], path);
      const name = nonEmptyString(value.name, `${path}.name`, MAX_NAME_LENGTH, errors);
      return name ? { name } : undefined;
    }
    case 'draft_collection_request': {
      errors.fields(value, ['collectionId', 'request'], path);
      const collectionId = identifier(value.collectionId, `${path}.collectionId`, MAX_ID_LENGTH, errors);
      const request = validateRequestDraft(value.request, `${path}.request`, errors, true);
      return collectionId && request ? { collectionId, request: request as AgentRequestDraft & { name: string } } : undefined;
    }
    case 'draft_request_builder_request':
      return validateRequestDraft(value, path, errors, false);
  }
}

function hasAction(value: unknown): value is AgentActionName {
  return typeof value === 'string' && (AGENT_ACTION_NAMES as readonly string[]).includes(value);
}

function hasCycle(steps: AgentActionProposal[], errors: ValidationCollector): void {
  const state = new Map<string, 'VISITING' | 'DONE'>();
  const byId = new Map(steps.map((step) => [step.stepId, step]));
  const visit = (id: string): void => {
    if (state.get(id) === 'VISITING') {
      errors.add({ code: 'DEPENDENCY_CYCLE', path: 'steps', message: 'Dependencies must not contain a cycle.' });
      return;
    }
    if (state.get(id) === 'DONE') return;
    state.set(id, 'VISITING');
    for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency);
    state.set(id, 'DONE');
  };
  for (const step of steps) visit(step.stepId);
}

/**
 * Strictly validates an untrusted proposal. This function is pure: it does not
 * execute actions, call providers, dispatch HTTP, or access workspace state.
 */
export function validateAgentPlan(input: unknown): AgentPlanValidationResult {
  const errors = new ValidationCollector();
  if (!isRecord(input)) return { ok: false, errors: [{ code: 'INVALID_PLAN', path: '', message: 'Plan must be an object.' }] };
  if (byteLength(input) > MAX_AGENT_PLAN_BYTES) return { ok: false, errors: [{ code: 'PLAN_LIMIT_EXCEEDED', path: '', message: 'Plan exceeds the permitted size.' }] };
  errors.fields(input, ['planId', 'advisoryText', 'steps'], '');
  const planId = identifier(input.planId, 'planId', MAX_AGENT_PLAN_ID_LENGTH, errors);
  const advisoryText = nonEmptyString(input.advisoryText, 'advisoryText', MAX_AGENT_ADVISORY_TEXT_LENGTH, errors);
  if (!Array.isArray(input.steps) || input.steps.length > MAX_AGENT_PLAN_STEPS) {
    errors.add({ code: 'PLAN_LIMIT_EXCEEDED', path: 'steps', message: 'Plan must contain a bounded array of steps.' });
    return { ok: false, errors: errors.errors };
  }
  const steps: AgentActionProposal[] = [];
  const stepIds = new Set<string>();
  for (const [index, rawStep] of input.steps.entries()) {
    const path = `steps[${index}]`;
    if (!isRecord(rawStep)) { errors.invalid(path, 'Step must be an object.'); continue; }
    errors.fields(rawStep, ['stepId', 'action', 'arguments', 'dependsOn', 'risk', 'requiresApproval', 'summary'], path);
    const stepId = identifier(rawStep.stepId, `${path}.stepId`, MAX_AGENT_STEP_ID_LENGTH, errors);
    if (stepId && stepIds.has(stepId)) errors.add({ code: 'INVALID_PLAN', path: `${path}.stepId`, message: 'Step IDs must be unique.' });
    if (stepId) stepIds.add(stepId);
    if (!hasAction(rawStep.action)) {
      errors.add({ code: 'UNKNOWN_ACTION', path: `${path}.action`, message: 'Unsupported agent action.' });
      continue;
    }
    const action = rawStep.action;
    const args = validateArguments(action, rawStep.arguments, `${path}.arguments`, errors);
    const summary = nonEmptyString(rawStep.summary, `${path}.summary`, MAX_AGENT_SUMMARY_LENGTH, errors);
    const dependencies: string[] = [];
    if (!Array.isArray(rawStep.dependsOn)) errors.invalid(`${path}.dependsOn`, 'Dependencies must be an array.');
    else for (const [dependencyIndex, dependency] of rawStep.dependsOn.entries()) {
      const parsed = identifier(dependency, `${path}.dependsOn[${dependencyIndex}]`, MAX_AGENT_STEP_ID_LENGTH, errors);
      if (parsed) dependencies.push(parsed);
    }
    const policy = ACTION_POLICY[action];
    if (rawStep.risk !== policy.risk) errors.add({ code: 'POLICY_MISMATCH', path: `${path}.risk`, message: 'Risk must match the trusted action policy.' });
    if (rawStep.requiresApproval !== policy.requiresApproval) errors.add({ code: 'POLICY_MISMATCH', path: `${path}.requiresApproval`, message: 'Approval requirement must match the trusted action policy.' });
    if (stepId && args && summary && Array.isArray(rawStep.dependsOn) && rawStep.risk === policy.risk && rawStep.requiresApproval === policy.requiresApproval) {
      steps.push({ stepId, action, arguments: args, dependsOn: dependencies, risk: policy.risk, requiresApproval: policy.requiresApproval, summary });
    }
  }
  const knownStepIds = new Set(steps.map((step) => step.stepId));
  for (const step of steps) for (const dependency of step.dependsOn) {
    if (dependency === step.stepId) errors.add({ code: 'INVALID_DEPENDENCY', path: `steps.${step.stepId}.dependsOn`, message: 'A step cannot depend on itself.' });
    else if (!knownStepIds.has(dependency)) errors.add({ code: 'INVALID_DEPENDENCY', path: `steps.${step.stepId}.dependsOn`, message: 'Dependency does not reference a valid step.' });
  }
  if (errors.errors.length === 0) hasCycle(steps, errors);
  if (errors.errors.length || !planId || !advisoryText) return { ok: false, errors: errors.errors };
  return { ok: true, plan: { planId, advisoryText, steps } };
}

export function trustedActionPolicy(action: AgentActionName): Readonly<TrustedActionPolicy> {
  return ACTION_POLICY[action];
}
