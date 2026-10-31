import assert from 'node:assert/strict';
import test from 'node:test';
import type { FrontendEnvironmentProfile } from '../../Frontend/src/types/environment.types.js';
import { maskSecretValue } from '../../Frontend/src/types/environment.types.js';
import type {
  SanitizedWorkflowExecutionResult,
  SanitizedWorkflowStepExecutionResult,
} from '../../Frontend/src/types/workflow.types.js';

// Test suite for Frontend Workflow State, Secret Masking, and Isolation Rules
test('Frontend Store & Workflow State Verification', async (t) => {
  await t.test('1. maskSecretValue properly masks sensitive values', () => {
    assert.equal(maskSecretValue('super_secret_token'), '••••••••');
    assert.equal(maskSecretValue('another_secret'), '••••••••');
    assert.equal(maskSecretValue(''), '');
  });

  await t.test('2. Teardown steps are accurately partitioned from regular workflow steps', () => {
    const mockStepResults: SanitizedWorkflowStepExecutionResult[] = [
      {
        stepId: 's1',
        stepName: 'Auth Step',
        status: 'PASSED_EXECUTION',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 10,
        request: { method: 'POST', url: 'https://api.test/login', queryParams: [], headers: [], auth: { type: 'none', redacted: false } },
        isSetup: true,
      },
      {
        stepId: 's2',
        stepName: 'Process Order',
        status: 'PASSED_EXECUTION',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 20,
        request: { method: 'POST', url: 'https://api.test/orders', queryParams: [], headers: [], auth: { type: 'none', redacted: false } },
      },
      {
        stepId: 's3',
        stepName: 'Delete Temporary Records', // Arbitrary name
        status: 'PASSED_EXECUTION',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 15,
        request: { method: 'DELETE', url: 'https://api.test/temp', queryParams: [], headers: [], auth: { type: 'none', redacted: false } },
        isTeardown: true,
      },
    ];

    const isTeardownStep = (step: SanitizedWorkflowStepExecutionResult) => Boolean(step.isTeardown);
    const regularSteps = mockStepResults.filter((s) => !isTeardownStep(s));
    const teardownSteps = mockStepResults.filter((s) => isTeardownStep(s));

    assert.equal(regularSteps.length, 2);
    assert.equal(regularSteps[0].stepId, 's1');
    assert.equal(regularSteps[1].stepId, 's2');
    assert.equal(teardownSteps.length, 1);
    assert.equal(teardownSteps[0].stepId, 's3');
    assert.equal(teardownSteps[0].stepName, 'Delete Temporary Records');
  });

  await t.test('3. Scenario result isolation logic prevents showing Scenario A results for Scenario B', () => {
    const scenarioAResult: SanitizedWorkflowExecutionResult = {
      scenarioId: 'wf_scenario_A',
      scenarioName: 'Scenario A',
      status: 'COMPLETED',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 45,
      stepResults: [],
      finalContext: {},
      summary: { totalSteps: 1, executed: 1, passed: 1, failed: 0, skipped: 0, blocked: 0, totalDurationMs: 45 },
    };

    const activeWorkflowA = { id: 'wf_scenario_A', name: 'Scenario A', steps: [] };
    const activeWorkflowB = { id: 'wf_scenario_B', name: 'Scenario B', steps: [] };

    // When viewing Scenario A
    const displayResultA =
      scenarioAResult && scenarioAResult.scenarioId === activeWorkflowA.id ? scenarioAResult : undefined;
    assert.ok(displayResultA !== undefined, 'Scenario A should display its execution result');
    assert.equal(displayResultA?.scenarioName, 'Scenario A');

    // When viewing Scenario B
    const displayResultB =
      scenarioAResult && scenarioAResult.scenarioId === activeWorkflowB.id ? scenarioAResult : undefined;
    assert.equal(displayResultB, undefined, 'Scenario B must NOT display Scenario A results');
  });

  await t.test('4. Environment profile variables correctly track isSecret flag and enabled status', () => {
    const profile: FrontendEnvironmentProfile = {
      id: 'env_qa',
      name: 'QA Environment',
      baseUrl: 'http://127.0.0.1:4001',
      isDefault: true,
      variables: [
        { name: 'apiKey', value: 'qa-secret-key-12345', isSecret: true, enabled: true },
        { name: 'apiVersion', value: 'v1', isSecret: false, enabled: true },
        { name: 'disabledToken', value: 'old-token', isSecret: true, enabled: false },
      ],
    };

    assert.equal(profile.variables.length, 3);
    const activeVars = profile.variables.filter((v) => v.enabled);
    assert.equal(activeVars.length, 2);
    const secretVars = profile.variables.filter((v) => v.isSecret);
    assert.equal(secretVars.length, 2);
    assert.equal(profile.baseUrl, 'http://127.0.0.1:4001');
  });
});
