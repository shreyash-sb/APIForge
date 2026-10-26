import { RequestExecutorService } from './requestExecutor.service.js';
import { VariableInterpolatorService, variableInterpolator, VariableInterpolationError } from './variableInterpolator.service.js';
import { ResponseExtractorService, responseExtractor } from './responseExtractor.service.js';
import { ValidationService } from './validation.service.js';
import type { ApiRequest, Header, QueryParam } from '../types/request.types.js';
import type { SanitizedApiRequest } from '../types/testExecution.types.js';
import type { TestCase } from '../types/testCase.types.js';
import {
  MAX_WORKFLOW_STEPS,
  type EnvironmentProfile,
  type WorkflowExecutionResult,
  type WorkflowExecutionSummary,
  type WorkflowScenario,
  type WorkflowStep,
  type WorkflowStepExecutionResult,
  type WorkflowStepStatus,
} from '../types/workflow.types.js';

export { MAX_WORKFLOW_STEPS } from '../types/workflow.types.js';

export interface WorkflowValidationResult {
  valid: boolean;
  errors: string[];
}

export interface WorkflowExecutionOptions {
  throwOnValidationError?: boolean;
}

export class WorkflowValidationError extends Error {
  readonly errors: string[];

  constructor(message: string, errors: string[] = []) {
    super(message);
    this.name = 'WorkflowValidationError';
    this.errors = errors;
  }
}

export class WorkflowEngineService {
  private readonly requestExecutor: RequestExecutorService;
  private readonly interpolator: VariableInterpolatorService;
  private readonly extractor: ResponseExtractorService;
  private readonly validationService: ValidationService;

  constructor(
    requestExecutor: RequestExecutorService = new RequestExecutorService(),
    interpolator: VariableInterpolatorService = variableInterpolator,
    extractor: ResponseExtractorService = responseExtractor,
    validationService: ValidationService = new ValidationService()
  ) {
    this.requestExecutor = requestExecutor;
    this.interpolator = interpolator;
    this.extractor = extractor;
    this.validationService = validationService;
  }

  /**
   * Pre-execution validation for workflow scenarios
   */
  validateScenario(scenario: WorkflowScenario): WorkflowValidationResult {
    const errors: string[] = [];

    if (!scenario || typeof scenario !== 'object') {
      return { valid: false, errors: ['Scenario definition is missing or null.'] };
    }

    if (!scenario.id || typeof scenario.id !== 'string' || !scenario.id.trim()) {
      errors.push('Scenario is missing a valid id.');
    }

    if (!scenario.name || typeof scenario.name !== 'string' || !scenario.name.trim()) {
      errors.push('Scenario is missing a valid name.');
    }

    if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
      errors.push('Workflow scenario must contain at least one step.');
      return { valid: false, errors };
    }

    if (scenario.steps.length > MAX_WORKFLOW_STEPS) {
      errors.push(
        `Workflow scenario exceeds maximum limit of ${MAX_WORKFLOW_STEPS} steps (found ${scenario.steps.length}).`
      );
      return { valid: false, errors };
    }

    const stepIdSet = new Set<string>();
    const stepIds = new Set(scenario.steps.map((s) => s.id));
    const teardownStepIds = new Set(
      scenario.steps.filter((s) => s.isTeardown).map((s) => s.id)
    );

    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];
      if (!step || typeof step !== 'object') {
        errors.push(`Step at index ${i} is malformed or null.`);
        continue;
      }

      if (!step.id || typeof step.id !== 'string' || !step.id.trim()) {
        errors.push(`Step at index ${i} is missing a valid id.`);
      } else if (stepIdSet.has(step.id)) {
        errors.push(`Duplicate step ID '${step.id}' detected in scenario.`);
      } else {
        stepIdSet.add(step.id);
      }

      if (!step.name || typeof step.name !== 'string' || !step.name.trim()) {
        errors.push(`Step '${step.id || i}' is missing a valid name.`);
      }

      if (!step.request || typeof step.request !== 'object' || !step.request.method || !step.request.url) {
        errors.push(`Step '${step.id || i}' must specify a valid HTTP method and url.`);
      }

      // Check dependencies
      if (step.dependsOn && Array.isArray(step.dependsOn)) {
        for (const depId of step.dependsOn) {
          if (depId === step.id) {
            errors.push(`Step '${step.id}' cannot declare a dependency on itself.`);
          } else if (!stepIds.has(depId)) {
            errors.push(`Step '${step.id}' references non-existent dependency '${depId}'.`);
          } else if (!step.isTeardown && teardownStepIds.has(depId)) {
            errors.push(`Step '${step.id}' cannot declare a dependency on teardown step '${depId}'.`);
          }
        }
      }

      // Check extraction definitions
      if (step.extractors && Array.isArray(step.extractors)) {
        for (const ext of step.extractors) {
          if (!ext.targetVariable || !/^[a-zA-Z0-9_.-]+$/.test(ext.targetVariable)) {
            errors.push(
              `Step '${step.id}' has an extractor with invalid targetVariable '${ext?.targetVariable}'.`
            );
          }
          if (!ext.source || !['BODY_JSONPATH', 'HEADER', 'STATUS_CODE'].includes(ext.source)) {
            errors.push(`Step '${step.id}' has an extractor with invalid or missing source type '${ext?.source}'.`);
          }
          if (ext.source === 'BODY_JSONPATH' && (!ext.path || typeof ext.path !== 'string')) {
            errors.push(`Step '${step.id}' has a BODY_JSONPATH extractor missing a valid path expression.`);
          }
          if (ext.source === 'HEADER' && (!ext.path || typeof ext.path !== 'string')) {
            errors.push(`Step '${step.id}' has a HEADER extractor missing a valid header name.`);
          }
        }
      }
    }

    // Check for dependency cycles using DFS
    const cycleCheck = this.detectDependencyCycle(scenario.steps);
    if (cycleCheck.hasCycle) {
      errors.push(`Dependency cycle detected involving steps: ${cycleCheck.cyclePath?.join(' -> ')}.`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Executes an ordered multi-step scenario with isolated variable context and dependency resolution
   */
  async executeScenario(
    scenario: WorkflowScenario,
    environment?: EnvironmentProfile | Record<string, unknown>,
    options: WorkflowExecutionOptions = {}
  ): Promise<WorkflowExecutionResult> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    // 1. Validate scenario structure prior to making any HTTP requests
    const validation = this.validateScenario(scenario);
    if (!validation.valid) {
      if (options.throwOnValidationError ?? true) {
        throw new WorkflowValidationError(validation.errors.join('; '), validation.errors);
      }

      const completedAt = new Date().toISOString();
      const stepResults: WorkflowStepExecutionResult[] = validation.errors.map((err, idx) => ({
        stepId: `val_err_${idx}`,
        stepName: 'Scenario Pre-Validation',
        status: 'ERROR',
        startedAt,
        completedAt,
        durationMs: 0,
        request: {
          method: 'GET',
          url: '',
          auth: { type: 'none', redacted: false, description: 'None' },
        },
        error: {
          type: 'VALIDATION_ERROR',
          message: err,
        },
      }));

      return {
        scenarioId: scenario?.id || 'unknown',
        scenarioName: scenario?.name || 'unnamed',
        status: 'CANCELLED',
        startedAt,
        completedAt,
        durationMs: 0,
        stepResults,
        finalContext: {},
        summary: {
          totalSteps: scenario?.steps?.length || 0,
          executed: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          blocked: 0,
          totalDurationMs: 0,
        },
      };
    }

    // 2. Deep clone scenario to guarantee caller input immutability
    const clonedScenario: WorkflowScenario = JSON.parse(JSON.stringify(scenario));

    // 3. Initialize fresh, isolated per-run context
    // Precedence rule: Extracted runtime values override initial environment variables with the same name.
    const context = this.interpolator.normalizeContext(environment);

    // 4. Partition and topologically order regular steps and teardown steps
    const regularSteps = this.orderSteps(clonedScenario.steps.filter((s) => !s.isTeardown));
    const teardownSteps = this.orderSteps(clonedScenario.steps.filter((s) => s.isTeardown));

    const stepResults: WorkflowStepExecutionResult[] = [];
    const stepResultsMap = new Map<string, WorkflowStepExecutionResult>();
    const failedOrSkippedStepIds = new Set<string>();
    const validationFailedStepIds = new Set<string>();
    const extractionFailedStepIds = new Set<string>();

    try {
      // 5. Execute regular steps sequentially
      for (const step of regularSteps) {
        const stepResult = await this.executeStep(
          step,
          context,
          stepResultsMap,
          failedOrSkippedStepIds,
          validationFailedStepIds,
          extractionFailedStepIds
        );
        stepResults.push(stepResult);
        stepResultsMap.set(step.id, stepResult);

        if (
          stepResult.status !== 'PASSED_EXECUTION' ||
          stepResult.validationResult?.status === 'VALIDATION_FAILED' ||
          (stepResult.extractionErrors && stepResult.extractionErrors.length > 0)
        ) {
          failedOrSkippedStepIds.add(step.id);
        }
      }
    } finally {
      // 6. Execute teardown / cleanup steps in finally block, ensuring all independent teardowns run
      for (const teardownStep of teardownSteps) {
        const teardownResult = await this.executeTeardownStep(
          teardownStep,
          context,
          stepResultsMap,
          failedOrSkippedStepIds
        );
        stepResults.push(teardownResult);
        stepResultsMap.set(teardownStep.id, teardownResult);

        if (teardownResult.status !== 'PASSED_EXECUTION') {
          failedOrSkippedStepIds.add(teardownStep.id);
        }
      }
    }

    const completedAt = new Date().toISOString();
    const totalDurationMs = Date.now() - startTime;

    // 7. Build summary and determine overall scenario status
    const summary = this.calculateSummary(scenario.steps.length, stepResults, totalDurationMs);

    const isStepFullySuccessful = (r: WorkflowStepExecutionResult) =>
      r.status === 'PASSED_EXECUTION' &&
      r.validationResult?.status !== 'VALIDATION_FAILED' &&
      (!r.extractionErrors || r.extractionErrors.length === 0);

    const fullySuccessfulCount = stepResults.filter(isStepFullySuccessful).length;
    const hasAnyFailure =
      summary.failed > 0 ||
      stepResults.some((r) => r.validationResult?.status === 'VALIDATION_FAILED') ||
      stepResults.some((r) => r.extractionErrors && r.extractionErrors.length > 0) ||
      summary.blocked > 0;

    let overallStatus: 'COMPLETED' | 'FAILED' | 'PARTIALLY_COMPLETED' = 'COMPLETED';
    if (hasAnyFailure) {
      overallStatus = fullySuccessfulCount > 0 ? 'PARTIALLY_COMPLETED' : 'FAILED';
    } else if (summary.skipped > 0) {
      overallStatus = fullySuccessfulCount > 0 ? 'PARTIALLY_COMPLETED' : 'FAILED';
    }

    // Convert Map context to plain record for export
    const finalContext: Record<string, { value: unknown; isSecret: boolean }> = {};
    for (const [key, entry] of context.entries()) {
      finalContext[key] = {
        value: entry.value,
        isSecret: entry.isSecret,
      };
    }

    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      status: overallStatus,
      startedAt,
      completedAt,
      durationMs: totalDurationMs,
      stepResults,
      finalContext,
      summary,
    };
  }

  /**
   * Executes a single regular workflow step with dependency checks, interpolation, validation, and extraction
   */
  private async executeStep(
    step: WorkflowStep,
    context: Map<string, { value: unknown; isSecret: boolean; description?: string }>,
    stepResultsMap: Map<string, WorkflowStepExecutionResult>,
    failedOrSkippedStepIds: Set<string>,
    validationFailedStepIds: Set<string>,
    extractionFailedStepIds: Set<string>
  ): Promise<WorkflowStepExecutionResult> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    const sanitizedInitialRequest = this.sanitizeRequest(step.request);

    // 1. Check if step is explicitly disabled
    if (!step.enabled) {
      return {
        stepId: step.id,
        stepName: step.name,
        status: 'SKIPPED',
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: 0,
        request: sanitizedInitialRequest,
        isSetup: step.isSetup,
        isTeardown: step.isTeardown,
        skipReason: 'Step is disabled.',
      };
    }

    // 2. Check prerequisite step dependencies
    if (step.dependsOn && step.dependsOn.length > 0) {
      for (const depId of step.dependsOn) {
        const depResult = stepResultsMap.get(depId);
        if (!depResult) {
          return {
            stepId: step.id,
            stepName: step.name,
            status: 'SKIPPED',
            startedAt,
            completedAt: new Date().toISOString(),
            durationMs: 0,
            request: sanitizedInitialRequest,
            isSetup: step.isSetup,
            isTeardown: step.isTeardown,
            skipReason: `Blocked by prerequisite step '${depId}' which was not executed.`,
          };
        }

        if (depResult.status === 'SKIPPED') {
          return {
            stepId: step.id,
            stepName: step.name,
            status: 'SKIPPED',
            startedAt,
            completedAt: new Date().toISOString(),
            durationMs: 0,
            request: sanitizedInitialRequest,
            isSetup: step.isSetup,
            isTeardown: step.isTeardown,
            skipReason: `Blocked by prerequisite step '${depId}' which was skipped.`,
          };
        }

        if (depResult.status === 'FAILED_EXECUTION' || depResult.status === 'ERROR') {
          return {
            stepId: step.id,
            stepName: step.name,
            status: 'SKIPPED',
            startedAt,
            completedAt: new Date().toISOString(),
            durationMs: 0,
            request: sanitizedInitialRequest,
            isSetup: step.isSetup,
            isTeardown: step.isTeardown,
            skipReason: `Blocked by prerequisite step '${depId}' execution failure.`,
          };
        }

        if (extractionFailedStepIds.has(depId)) {
          return {
            stepId: step.id,
            stepName: step.name,
            status: 'SKIPPED',
            startedAt,
            completedAt: new Date().toISOString(),
            durationMs: 0,
            request: sanitizedInitialRequest,
            isSetup: step.isSetup,
            isTeardown: step.isTeardown,
            skipReason: `Blocked by prerequisite step '${depId}' response extraction failure.`,
          };
        }

        if (validationFailedStepIds.has(depId) && !step.continueOnValidationFailure) {
          return {
            stepId: step.id,
            stepName: step.name,
            status: 'SKIPPED',
            startedAt,
            completedAt: new Date().toISOString(),
            durationMs: 0,
            request: sanitizedInitialRequest,
            isSetup: step.isSetup,
            isTeardown: step.isTeardown,
            skipReason: `Blocked by prerequisite step '${depId}' contract validation failure.`,
          };
        }
      }
    }

    // 3. Interpolate request variables using current runtime context
    let interpolatedRequest: ApiRequest;
    try {
      const res = this.interpolator.interpolateRequest(step.request, context, { strict: true });
      interpolatedRequest = res.value;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown interpolation error';
      const varName = err instanceof VariableInterpolationError ? err.variableName : undefined;
      return {
        stepId: step.id,
        stepName: step.name,
        status: 'SKIPPED',
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: 0,
        request: sanitizedInitialRequest,
        isSetup: step.isSetup,
        isTeardown: step.isTeardown,
        skipReason: `Step blocked: required variable '${varName || 'unknown'}' is unresolved (${msg}).`,
      };
    }

    const sanitizedRequest = this.sanitizeRequest(interpolatedRequest);

    // 4. Execute HTTP request via existing RequestExecutorService
    let execResult;
    try {
      execResult = await this.requestExecutor.execute(interpolatedRequest);
    } catch (unexpectedErr: unknown) {
      const msg = unexpectedErr instanceof Error ? unexpectedErr.message : 'Internal execution error';
      return {
        stepId: step.id,
        stepName: step.name,
        status: 'ERROR',
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        request: sanitizedRequest,
        isSetup: step.isSetup,
        isTeardown: step.isTeardown,
        error: { type: 'INTERNAL_ERROR', message: msg },
      };
    }

    const durationMs = Date.now() - startTime;
    const completedAt = new Date().toISOString();

    if (!execResult.success) {
      const status: WorkflowStepStatus =
        execResult.error.type === 'UNKNOWN_ERROR' ? 'ERROR' : 'FAILED_EXECUTION';
      return {
        stepId: step.id,
        stepName: step.name,
        status,
        startedAt,
        completedAt,
        durationMs,
        request: sanitizedRequest,
        isSetup: step.isSetup,
        isTeardown: step.isTeardown,
        error: execResult.error,
      };
    }

    const stepResult: WorkflowStepExecutionResult = {
      stepId: step.id,
      stepName: step.name,
      status: 'PASSED_EXECUTION',
      startedAt,
      completedAt,
      durationMs,
      request: sanitizedRequest,
      response: execResult,
      isSetup: step.isSetup,
      isTeardown: step.isTeardown,
    };

    // 5. Apply response validation if expectations are declared
    if (step.expected) {
      try {
        const syntheticTestCase: TestCase = {
          id: step.id,
          name: step.name,
          description: step.description || '',
          type: 'POSITIVE',
          priority: 'HIGH',
          enabled: true,
          endpoint: { method: step.request.method, path: step.request.url },
          request: interpolatedRequest,
          pathParams: {},
          expected: step.expected,
          metadata: { sourceEndpointId: step.id, rule: 'workflow-step-expectation' },
        };

        const valResult = this.validationService.validateSingle(syntheticTestCase, {
          testCaseId: step.id,
          executionId: `exec_${step.id}`,
          status: 'PASSED_EXECUTION',
          startedAt,
          completedAt,
          durationMs,
          request: sanitizedRequest,
          response: execResult,
        });

        stepResult.validationResult = valResult;
        if (valResult.status === 'VALIDATION_FAILED') {
          validationFailedStepIds.add(step.id);
        }
      } catch (valErr: unknown) {
        const msg = valErr instanceof Error ? valErr.message : 'Validation exception';
        stepResult.error = { type: 'VALIDATION_ERROR', message: msg };
      }
    }

    // 6. Run response value extractors
    if (step.extractors && step.extractors.length > 0) {
      const extractionBatch = this.extractor.extractAll(step.extractors, execResult);

      if (extractionBatch.successfulCount > 0) {
        for (const [key, entry] of Object.entries(extractionBatch.context)) {
          context.set(key, entry);
        }
        stepResult.extractedVariables = extractionBatch.context;
      }

      if (extractionBatch.failedCount > 0) {
        extractionFailedStepIds.add(step.id);
        stepResult.extractionErrors = extractionBatch.results
          .filter((r) => !r.success)
          .map((r) => ({
            targetVariable: r.targetVariable,
            message: r.error?.message || 'Extraction failed',
          }));
      }
    }

    return stepResult;
  }

  /**
   * Executes an explicit teardown/cleanup step safely
   */
  private async executeTeardownStep(
    step: WorkflowStep,
    context: Map<string, { value: unknown; isSecret: boolean; description?: string }>,
    stepResultsMap: Map<string, WorkflowStepExecutionResult>,
    failedOrSkippedStepIds: Set<string>
  ): Promise<WorkflowStepExecutionResult> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    const sanitizedInitialRequest = this.sanitizeRequest(step.request);

    if (!step.enabled) {
      return {
        stepId: step.id,
        stepName: step.name,
        status: 'SKIPPED',
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: 0,
        request: sanitizedInitialRequest,
        isSetup: step.isSetup,
        isTeardown: true,
        skipReason: 'Teardown step is disabled.',
      };
    }

    // Check dependencies among teardown steps if specified
    if (step.dependsOn && step.dependsOn.length > 0) {
      for (const depId of step.dependsOn) {
        if (failedOrSkippedStepIds.has(depId) || !stepResultsMap.has(depId)) {
          return {
            stepId: step.id,
            stepName: step.name,
            status: 'SKIPPED',
            startedAt,
            completedAt: new Date().toISOString(),
            durationMs: 0,
            request: sanitizedInitialRequest,
            isSetup: step.isSetup,
            isTeardown: true,
            skipReason: `Teardown blocked: prerequisite step '${depId}' did not succeed.`,
          };
        }
      }
    }

    // Try interpolating cleanup variables
    let interpolatedRequest: ApiRequest;
    try {
      const res = this.interpolator.interpolateRequest(step.request, context, { strict: true });
      interpolatedRequest = res.value;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Missing cleanup variables';
      return {
        stepId: step.id,
        stepName: step.name,
        status: 'SKIPPED',
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: 0,
        request: sanitizedInitialRequest,
        isSetup: step.isSetup,
        isTeardown: true,
        skipReason: `Teardown skipped: required cleanup variable is not available in context (${msg}).`,
      };
    }

    const sanitizedRequest = this.sanitizeRequest(interpolatedRequest);

    // Execute cleanup request via existing RequestExecutorService
    try {
      const execResult = await this.requestExecutor.execute(interpolatedRequest);
      const durationMs = Date.now() - startTime;
      const completedAt = new Date().toISOString();

      if (!execResult.success) {
        return {
          stepId: step.id,
          stepName: step.name,
          status: execResult.error.type === 'UNKNOWN_ERROR' ? 'ERROR' : 'FAILED_EXECUTION',
          startedAt,
          completedAt,
          durationMs,
          request: sanitizedRequest,
          isSetup: step.isSetup,
          isTeardown: true,
          error: execResult.error,
        };
      }

      return {
        stepId: step.id,
        stepName: step.name,
        status: 'PASSED_EXECUTION',
        startedAt,
        completedAt,
        durationMs,
        request: sanitizedRequest,
        response: execResult,
        isSetup: step.isSetup,
        isTeardown: true,
      };
    } catch (cleanupErr: unknown) {
      const msg = cleanupErr instanceof Error ? cleanupErr.message : 'Teardown request failed';
      return {
        stepId: step.id,
        stepName: step.name,
        status: 'ERROR',
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        request: sanitizedRequest,
        isSetup: step.isSetup,
        isTeardown: true,
        error: { type: 'CLEANUP_ERROR', message: msg },
      };
    }
  }

  /**
   * Topologically orders steps using Kahn's algorithm while strictly preserving
   * original declaration index order as tie-breaker for independent steps.
   */
  private orderSteps(steps: WorkflowStep[]): WorkflowStep[] {
    if (steps.length <= 1) return [...steps];

    const stepMap = new Map<string, WorkflowStep>();
    const originalIndex = new Map<string, number>();
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();

    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      stepMap.set(s.id, s);
      originalIndex.set(s.id, i);
      inDegree.set(s.id, 0);
      dependents.set(s.id, []);
    }

    for (const s of steps) {
      const deps = (s.dependsOn || []).filter((depId) => stepMap.has(depId));
      inDegree.set(s.id, deps.length);
      for (const depId of deps) {
        dependents.get(depId)!.push(s.id);
      }
    }

    const ready: string[] = [];
    for (const s of steps) {
      if (inDegree.get(s.id) === 0) {
        ready.push(s.id);
      }
    }

    ready.sort((a, b) => originalIndex.get(a)! - originalIndex.get(b)!);

    const ordered: WorkflowStep[] = [];
    while (ready.length > 0) {
      const currentId = ready.shift()!;
      ordered.push(stepMap.get(currentId)!);

      for (const depChild of dependents.get(currentId) || []) {
        const newDeg = inDegree.get(depChild)! - 1;
        inDegree.set(depChild, newDeg);
        if (newDeg === 0) {
          ready.push(depChild);
          ready.sort((a, b) => originalIndex.get(a)! - originalIndex.get(b)!);
        }
      }
    }

    // If cyclic or disconnected nodes remain, fallback append
    if (ordered.length < steps.length) {
      for (const s of steps) {
        if (!ordered.some((o) => o.id === s.id)) {
          ordered.push(s);
        }
      }
    }

    return ordered;
  }

  /**
   * Cycle detection using DFS graph traversal
   */
  private detectDependencyCycle(steps: WorkflowStep[]): { hasCycle: boolean; cyclePath?: string[] } {
    const adjList = new Map<string, string[]>();
    for (const step of steps) {
      adjList.set(step.id, step.dependsOn || []);
    }

    // 0 = unvisited, 1 = visiting (in active recursion stack), 2 = visited
    const state = new Map<string, number>();
    for (const step of steps) {
      state.set(step.id, 0);
    }

    const stack: string[] = [];

    const dfs = (node: string): boolean => {
      state.set(node, 1);
      stack.push(node);

      const neighbors = adjList.get(node) || [];
      for (const neighbor of neighbors) {
        if (!adjList.has(neighbor)) continue;
        const neighborState = state.get(neighbor);
        if (neighborState === 1) {
          stack.push(neighbor);
          return true;
        }
        if (neighborState === 0) {
          if (dfs(neighbor)) return true;
        }
      }

      stack.pop();
      state.set(node, 2);
      return false;
    };

    for (const step of steps) {
      if (state.get(step.id) === 0) {
        if (dfs(step.id)) {
          return { hasCycle: true, cyclePath: stack };
        }
      }
    }

    return { hasCycle: false };
  }

  /**
   * Calculates execution summary
   */
  private calculateSummary(
    totalSteps: number,
    results: WorkflowStepExecutionResult[],
    totalDurationMs: number
  ): WorkflowExecutionSummary {
    const passed = results.filter((r) => r.status === 'PASSED_EXECUTION').length;
    const failed = results.filter((r) => r.status === 'FAILED_EXECUTION' || r.status === 'ERROR').length;
    
    const isBlocked = (r: WorkflowStepExecutionResult) =>
      r.status === 'SKIPPED' &&
      (r.skipReason?.includes('prerequisite') ||
        r.skipReason?.includes('Blocked') ||
        r.skipReason?.includes('blocked') ||
        r.skipReason?.includes('unresolved') ||
        r.skipReason?.includes('not available'));

    const blocked = results.filter((r) => isBlocked(r) || r.status === 'BLOCKED_BY_DEPENDENCY').length;
    const skipped = results.filter((r) => r.status === 'SKIPPED' && !isBlocked(r)).length;
    const executed = results.filter(
      (r) => r.status === 'PASSED_EXECUTION' || r.status === 'FAILED_EXECUTION' || (r.status === 'ERROR' && r.durationMs > 0)
    ).length;

    return {
      totalSteps,
      executed,
      passed,
      failed,
      skipped,
      blocked,
      totalDurationMs,
    };
  }

  /**
   * Sanitizes request to prevent credential leakage in results
   */
  private sanitizeRequest(request: ApiRequest): SanitizedApiRequest {
    const sanitizedHeaders: Header[] = (request.headers ?? []).map((header) => {
      const lowerKey = header.key.toLowerCase();
      if (
        lowerKey === 'authorization' ||
        lowerKey === 'x-api-key' ||
        (request.auth.type === 'apikey' &&
          request.auth.addTo === 'header' &&
          lowerKey === request.auth.key.toLowerCase())
      ) {
        return {
          ...header,
          value: '[REDACTED]',
        };
      }
      return { ...header };
    });

    const sanitizedQueryParams: QueryParam[] = (request.queryParams ?? []).map((param) => {
      const lowerKey = param.key.toLowerCase();
      if (
        (request.auth.type === 'apikey' &&
          request.auth.addTo === 'query' &&
          lowerKey === request.auth.key.toLowerCase()) ||
        lowerKey.includes('apikey') ||
        lowerKey.includes('api_key') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('token')
      ) {
        return {
          ...param,
          value: '[REDACTED]',
        };
      }
      return { ...param };
    });

    let sanitizedUrl = request.url;
    try {
      const parsedUrl = new URL(request.url);
      let modified = false;

      if (request.auth.type === 'apikey' && request.auth.addTo === 'query' && request.auth.key) {
        if (parsedUrl.searchParams.has(request.auth.key)) {
          parsedUrl.searchParams.set(request.auth.key, '[REDACTED]');
          modified = true;
        }
      }

      for (const [key] of parsedUrl.searchParams.entries()) {
        const lower = key.toLowerCase();
        if (
          lower.includes('apikey') ||
          lower.includes('api_key') ||
          lower.includes('secret') ||
          lower.includes('token')
        ) {
          parsedUrl.searchParams.set(key, '[REDACTED]');
          modified = true;
        }
      }

      if (modified) {
        sanitizedUrl = parsedUrl.toString();
      }
    } catch {
      // Keep original URL if relative or invalid
    }

    return {
      method: request.method,
      url: sanitizedUrl,
      queryParams: sanitizedQueryParams,
      headers: sanitizedHeaders,
      body: request.body,
      auth: {
        type: request.auth.type,
        redacted: request.auth.type !== 'none',
        description:
          request.auth.type === 'none' ? 'None' : `${request.auth.type.toUpperCase()} [REDACTED]`,
      },
    };
  }
}

export const workflowEngine = new WorkflowEngineService();
