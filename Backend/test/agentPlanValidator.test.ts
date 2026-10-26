import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_AGENT_PLAN_STEPS,
  type AgentActionName,
  type AgentActionProposal,
} from '../src/types/agent.types.js';
import { trustedActionPolicy, validateAgentPlan } from '../src/services/agentPlanValidator.service.js';

const actionArguments: Record<AgentActionName, unknown> = {
  inspect_workspace: {},
  inspect_openapi_endpoint: { endpointId: 'get-users' },
  list_collections: {},
  inspect_collection: { collectionId: 'collection-1' },
  draft_collection: { name: 'Regression requests' },
  draft_collection_request: {
    collectionId: 'collection-1',
    request: { name: 'Get users', method: 'GET', url: 'https://api.example.test/users' },
  },
  draft_request_builder_request: { method: 'POST', url: 'https://api.example.test/users', bodyType: 'json', body: '{"name":"Ada"}' },
};

function step(action: AgentActionName, id = 'step-1', overrides: Partial<AgentActionProposal> = {}): unknown {
  const policy = trustedActionPolicy(action);
  return {
    stepId: id,
    action,
    arguments: actionArguments[action],
    dependsOn: [],
    risk: policy.risk,
    requiresApproval: policy.requiresApproval,
    summary: `Propose ${action}`,
    ...overrides,
  };
}

function plan(steps: unknown[] = [step('inspect_workspace')], overrides: Record<string, unknown> = {}): unknown {
  return { planId: 'plan-1', advisoryText: 'A safe proposal.', steps, ...overrides };
}

function expectInvalid(value: unknown, code?: string): void {
  const result = validateAgentPlan(value);
  assert.equal(result.ok, false);
  if (!result.ok && code) assert.ok(result.errors.some((error) => error.code === code), `expected ${code}`);
}

test('accepts every supported action with its trusted risk and approval policy', () => {
  const steps = (Object.keys(actionArguments) as AgentActionName[]).map((action, index) => step(action, `step-${index}`));
  const result = validateAgentPlan(plan(steps));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.plan.steps.length, 7);
    assert.equal(result.plan.steps.filter((item) => item.risk === 'READ_ONLY').length, 4);
    assert.equal(result.plan.steps.filter((item) => item.risk === 'LOCAL_DRAFT' && item.requiresApproval).length, 3);
  }
});

test('rejects unknown action names and unexpected fields without echoing untrusted secrets', () => {
  expectInvalid(plan([{ ...step('inspect_workspace'), action: 'run_shell', arguments: { command: 'token=never-show-this' } }]), 'UNKNOWN_ACTION');
  const result = validateAgentPlan(plan([step('inspect_workspace', 'step-1', { arguments: { extra: 'super-secret-value' } })]));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((error) => error.code === 'UNKNOWN_FIELD'));
    assert.equal(JSON.stringify(result.errors).includes('super-secret-value'), false);
  }
});

test('strictly validates read-only action arguments', () => {
  expectInvalid(plan([step('inspect_openapi_endpoint', 'step-1', { arguments: {} })]), 'INVALID_ARGUMENT');
  expectInvalid(plan([step('inspect_collection', 'step-1', { arguments: { collectionId: '../secret' } })]), 'INVALID_ARGUMENT');
  expectInvalid(plan([step('list_collections', 'step-1', { arguments: { includeSecrets: true } })]), 'UNKNOWN_FIELD');
});

test('validates draft collection and request fields', () => {
  expectInvalid(plan([step('draft_collection', 'step-1', { arguments: { name: ' ' } })]), 'INVALID_ARGUMENT');
  expectInvalid(plan([step('draft_collection_request', 'step-1', { arguments: { collectionId: 'collection-1', request: { name: 'x', method: 'GET', url: 'https://api.example.test', auth: { token: 'secret' } } } })]), 'UNKNOWN_FIELD');
  expectInvalid(plan([step('draft_request_builder_request', 'step-1', { arguments: { method: 'FETCH', url: 'https://api.example.test' } })]), 'INVALID_HTTP_METHOD');
  expectInvalid(plan([step('draft_request_builder_request', 'step-1', { arguments: { method: 'GET', url: 'ftp://api.example.test' } })]), 'INVALID_URL');
  expectInvalid(plan([step('draft_request_builder_request', 'step-1', { arguments: { method: 'GET', url: 'https://user:password@api.example.test' } })]), 'INVALID_URL');
  expectInvalid(plan([step('draft_request_builder_request', 'step-1', { arguments: { method: 'GET', url: 'https://api.example.test?token=secret' } })]), 'INVALID_URL');
});

test('validates header, query, and JSON body shapes without retaining credentials', () => {
  const invalidHeader = step('draft_request_builder_request', 'step-1', {
    arguments: { method: 'GET', url: 'https://api.example.test', headers: [{ key: 'Authorization', value: 'Bearer secret' }] },
  });
  expectInvalid(plan([invalidHeader]), 'INVALID_ARGUMENT');
  const invalidQuery = step('draft_request_builder_request', 'step-1', {
    arguments: { method: 'GET', url: 'https://api.example.test', queryParams: [{ key: 'api_key', value: 'secret' }] },
  });
  expectInvalid(plan([invalidQuery]), 'INVALID_ARGUMENT');
  const malformedJson = step('draft_request_builder_request', 'step-1', {
    arguments: { method: 'POST', url: 'https://api.example.test', bodyType: 'json', body: '{bad-json}' },
  });
  expectInvalid(plan([malformedJson]), 'INVALID_ARGUMENT');
  const valid = validateAgentPlan(plan([step('draft_request_builder_request', 'step-1', {
    arguments: { method: 'POST', url: 'https://api.example.test', headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }], bodyType: 'json', body: '{"ok":true}' },
  })]));
  assert.equal(valid.ok, true);
});

test('rejects duplicate IDs, missing dependencies, self dependencies, and dependency cycles', () => {
  expectInvalid(plan([step('inspect_workspace', 'one'), step('list_collections', 'one')]), 'INVALID_PLAN');
  expectInvalid(plan([step('inspect_workspace', 'one', { dependsOn: ['missing'] })]), 'INVALID_DEPENDENCY');
  expectInvalid(plan([step('inspect_workspace', 'one', { dependsOn: ['one'] })]), 'INVALID_DEPENDENCY');
  expectInvalid(plan([
    step('inspect_workspace', 'one', { dependsOn: ['two'] }),
    step('list_collections', 'two', { dependsOn: ['one'] }),
  ]), 'DEPENDENCY_CYCLE');
});

test('rejects forged trusted policy metadata', () => {
  expectInvalid(plan([step('inspect_workspace', 'step-1', { risk: 'LOCAL_DRAFT' })]), 'POLICY_MISMATCH');
  expectInvalid(plan([step('draft_collection', 'step-1', { requiresApproval: false })]), 'POLICY_MISMATCH');
});

test('enforces step and string size limits and handles malformed values safely', () => {
  const manySteps = Array.from({ length: MAX_AGENT_PLAN_STEPS + 1 }, (_, index) => step('inspect_workspace', `s-${index}`));
  expectInvalid(plan(manySteps), 'PLAN_LIMIT_EXCEEDED');
  expectInvalid(plan([step('draft_collection', 'step-1', { arguments: { name: 'x'.repeat(121) } })]), 'PLAN_LIMIT_EXCEEDED');
  const oversizedArguments = {
    method: 'POST',
    url: 'https://api.example.test',
    headers: Array.from({ length: 30 }, (_, index) => ({ key: `X-Field-${index}`, value: 'x'.repeat(1_000) })),
  };
  expectInvalid(plan([step('draft_request_builder_request', 'step-1', { arguments: oversizedArguments })]), 'PLAN_LIMIT_EXCEEDED');
  expectInvalid(plan([step('inspect_workspace')], { padding: 'x'.repeat(128 * 1024) }), 'PLAN_LIMIT_EXCEEDED');
  expectInvalid(null, 'INVALID_PLAN');
  expectInvalid({ planId: 'plan-1', advisoryText: 'test', steps: 'not-an-array' }, 'PLAN_LIMIT_EXCEEDED');
  const circular: { self?: unknown } = {};
  circular.self = circular;
  expectInvalid(circular, 'PLAN_LIMIT_EXCEEDED');
});

test('validation is pure and does not execute or mutate proposal input', () => {
  const raw = plan([step('draft_request_builder_request')]) as { steps: Array<{ arguments: { method: string } }> };
  const before = structuredClone(raw);
  const result = validateAgentPlan(raw);
  assert.equal(result.ok, true);
  assert.deepEqual(raw, before);
});
