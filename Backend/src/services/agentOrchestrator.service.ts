import { EventEmitter } from 'node:events';
import { AgentToolRegistryService } from './agentToolRegistry.service.js';
import {
  AGENT_TOOL_POLICIES,
  type AgentArtifact,
  type AgentStepProposal,
  type AgentStepStatus,
  type AgentTask,
  type AgentTaskStatus,
  type AgentToolName,
} from '../types/agentTool.types.js';
import { createAiProvider, type AiProvider } from './aiProvider.service.js';

export interface PlanTaskRequest {
  goal: string;
  context?: {
    spec?: string | object;
    baseUrl?: string;
    activeEnvironment?: string;
  };
}

export class AgentOrchestratorService extends EventEmitter {
  private readonly toolRegistry: AgentToolRegistryService;
  private readonly aiProvider: AiProvider;
  private readonly tasks: Map<string, AgentTask> = new Map();
  private readonly maxStepsLimit = 15;

  constructor(options?: {
    toolRegistry?: AgentToolRegistryService;
    aiProvider?: AiProvider;
  }) {
    super();
    this.toolRegistry = options?.toolRegistry ?? new AgentToolRegistryService();
    this.aiProvider = options?.aiProvider ?? createAiProvider();
  }

  getTask(taskId: string): AgentTask | undefined {
    return this.tasks.get(taskId);
  }

  listTasks(): AgentTask[] {
    return Array.from(this.tasks.values()).sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Natural-Language Task Interpretation & Bounded Planning
  // ───────────────────────────────────────────────────────────────────────────
  async createPlan(request: PlanTaskRequest): Promise<AgentTask> {
    if (!request.goal || !request.goal.trim()) {
      throw new Error('A natural-language goal is required to plan an agent task.');
    }

    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const goalLower = request.goal.toLowerCase();

    // Determine plan steps deterministically and enrich with AI insights
    const steps: AgentStepProposal[] = [];
    let advisoryPlan = '';

    if (goalLower.includes('test') || goalLower.includes('regression') || goalLower.includes('validate')) {
      // Workflow A: Automatic API testing
      steps.push(
        this.buildStep('step-1', 'inspect_api', {
          spec: request.context?.spec,
          targetUrl: request.context?.baseUrl,
        }, 'Inspect authorized API specification and endpoints.'),
        this.buildStep('step-2', 'generate_test_cases', {
          spec: request.context?.spec,
          categories: ['POSITIVE', 'NEGATIVE', 'BOUNDARY', 'SECURITY'],
          maxTestsPerEndpoint: 5,
        }, 'Generate positive, negative, and boundary test cases.', ['step-1']),
        this.buildStep('step-3', 'run_api_tests', {
          baseUrl: request.context?.baseUrl,
          stopOnFailure: false,
        }, 'Execute test suite against target API endpoint.', ['step-2']),
        this.buildStep('step-4', 'get_execution_report', {
          taskId,
          format: 'markdown',
        }, 'Generate comprehensive execution report with pass/fail metrics.', ['step-3'])
      );
      advisoryPlan = 'Automatic API Testing Workflow: Inspect contract, generate test definitions, execute tests, and produce compliance report.';
    } else if (goalLower.includes('create') || goalLower.includes('spec') || goalLower.includes('openapi') || goalLower.includes('mock')) {
      // Workflow B: API Creation & Mock Generation
      steps.push(
        this.buildStep('step-1', 'generate_openapi_spec', {
          description: request.goal,
          title: 'APIForge Managed Service',
          version: '1.0.0',
        }, 'Synthesize validated OpenAPI 3.1 specification from requirements.'),
        this.buildStep('step-2', 'generate_mock_api', {}, 'Deploy ephemeral mock API routes for the generated specification.', ['step-1']),
        this.buildStep('step-3', 'generate_test_cases', {
          categories: ['POSITIVE', 'NEGATIVE', 'SCHEMA'],
        }, 'Generate automated test cases for the synthesized specification.', ['step-1'])
      );
      advisoryPlan = 'API Creation Workflow: Synthesize validated OpenAPI 3.1 contract, mount ephemeral mock endpoints, and generate regression tests.';
    } else if (goalLower.includes('diagnose') || goalLower.includes('failure') || goalLower.includes('why') || goalLower.includes('bug')) {
      // Workflow C: Failure Diagnosis
      steps.push(
        this.buildStep('step-1', 'analyze_failure', {
          failureMessage: request.goal,
        }, 'Analyze failure evidence, identify root cause, and determine severity.')
      );
      advisoryPlan = 'Failure Diagnosis Workflow: Analyze execution trace, evaluate contract discrepancies, and formulate diagnostic findings.';
    } else if (goalLower.includes('fix') || goalLower.includes('patch') || goalLower.includes('auto-fix')) {
      // Workflow D: Controlled Auto-fixing
      steps.push(
        this.buildStep('step-1', 'analyze_failure', {
          failureMessage: request.goal,
        }, 'Identify root cause of failure requiring code patch.'),
        this.buildStep('step-2', 'generate_code_patch', {
          failureSummary: request.goal,
          currentCode: 'function handler(req, res) { res.status(404).send(); }',
        }, 'Generate targeted code patch and unified diff.', ['step-1']),
        this.buildStep('step-3', 'verify_code_patch', {
          modifiedCode: '',
          tests: [],
        }, 'Verify code patch in isolated sandbox by re-running target tests.', ['step-2'])
      );
      advisoryPlan = 'Controlled Auto-Fixing Workflow: Diagnose defect, draft minimal code patch, and verify in isolated sandbox.';
    } else {
      // General multi-step default: Inspect & Report
      steps.push(
        this.buildStep('step-1', 'inspect_api', {
          spec: request.context?.spec,
          targetUrl: request.context?.baseUrl,
        }, 'Inspect workspace API context and active endpoints.'),
        this.buildStep('step-2', 'get_execution_report', {
          taskId,
          format: 'markdown',
        }, 'Compile current workspace analytics report.', ['step-1'])
      );
      advisoryPlan = 'General API Task: Inspect context and produce operational status report.';
    }

    const task: AgentTask = {
      taskId,
      goal: request.goal,
      status: 'READY',
      steps,
      currentStepIndex: 0,
      artifacts: [],
      advisoryPlan,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.tasks.set(taskId, task);
    this.emitEvent(taskId, 'task_planned', task);
    return task;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Plan Execution Loop with Bounded Tool Execution & Approvals
  // ───────────────────────────────────────────────────────────────────────────
  async executeTask(taskId: string): Promise<AgentTask> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Agent task ${taskId} not found.`);
    }

    if (task.status === 'RUNNING') {
      return task;
    }

    task.status = 'RUNNING';
    task.updatedAt = new Date().toISOString();
    this.emitEvent(taskId, 'task_started', task);

    try {
      while (task.currentStepIndex < task.steps.length) {
        if ((task.status as AgentTaskStatus) === 'CANCELLED') {
          break;
        }

        const step = task.steps[task.currentStepIndex];

        // Check if step requires approval and has not been approved yet
        if (step.requiresApproval && step.status !== 'APPROVED') {
          step.status = 'WAITING_FOR_APPROVAL';
          task.status = 'WAITING_FOR_APPROVAL';
          task.updatedAt = new Date().toISOString();
          this.emitEvent(taskId, 'approval_required', { taskId, step });
          return task; // Pause execution until user explicitly calls approve
        }

        // Execute step
        await this.runStep(task, step);

        if (step.status === 'FAILED') {
          task.status = 'FAILED';
          task.error = `Step '${step.stepId}' (${step.tool}) failed: ${step.error}`;
          task.updatedAt = new Date().toISOString();
          this.emitEvent(taskId, 'task_failed', task);
          return task;
        }

        task.currentStepIndex++;
      }

      if ((task.status as AgentTaskStatus) !== 'CANCELLED') {
        task.status = 'COMPLETED';
        task.updatedAt = new Date().toISOString();
        this.emitEvent(taskId, 'task_completed', task);
      }
    } catch (err) {
      task.status = 'FAILED';
      task.error = (err as Error).message;
      task.updatedAt = new Date().toISOString();
      this.emitEvent(taskId, 'task_failed', task);
    }

    return task;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Human Approval & Rejection Handling
  // ───────────────────────────────────────────────────────────────────────────
  async approveStep(taskId: string, stepId: string): Promise<AgentTask> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found.`);

    const step = task.steps.find((s) => s.stepId === stepId);
    if (!step) throw new Error(`Step ${stepId} not found in task ${taskId}.`);

    if (step.status !== 'WAITING_FOR_APPROVAL') {
      throw new Error(`Step ${stepId} is in status '${step.status}', not waiting for approval.`);
    }

    step.status = 'APPROVED';
    this.emitEvent(taskId, 'step_approved', { taskId, stepId });

    // Resume execution
    return this.executeTask(taskId);
  }

  async rejectStep(taskId: string, stepId: string, reason?: string): Promise<AgentTask> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found.`);

    const step = task.steps.find((s) => s.stepId === stepId);
    if (!step) throw new Error(`Step ${stepId} not found in task ${taskId}.`);

    step.status = 'REJECTED';
    step.error = reason ?? 'Operation was rejected by user approval policy.';
    task.status = 'FAILED';
    task.error = `Task aborted: Step '${stepId}' was rejected by user.`;
    task.updatedAt = new Date().toISOString();

    this.emitEvent(taskId, 'step_rejected', { taskId, stepId, reason });
    return task;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Cancellation & Timeouts
  // ───────────────────────────────────────────────────────────────────────────
  async cancelTask(taskId: string): Promise<AgentTask> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found.`);

    task.status = 'CANCELLED';
    task.updatedAt = new Date().toISOString();

    for (const step of task.steps) {
      if (step.status === 'PENDING' || step.status === 'WAITING_FOR_APPROVAL' || step.status === 'RUNNING') {
        step.status = 'CANCELLED';
      }
    }

    this.emitEvent(taskId, 'task_cancelled', task);
    return task;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Internal Step Runner & Observation Collector
  // ───────────────────────────────────────────────────────────────────────────
  private async runStep(task: AgentTask, step: AgentStepProposal): Promise<void> {
    step.status = 'RUNNING';
    step.startedAt = new Date().toISOString();
    this.emitEvent(task.taskId, 'step_started', { taskId: task.taskId, step });

    try {
      // Inherit artifacts or previous step outputs if needed
      this.resolveStepArguments(task, step);

      // Execute tool with timeout
      const output = await Promise.race([
        this.toolRegistry.executeTool(step.tool, step.arguments),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Tool ${step.tool} timed out after 45s.`)), 45_000)
        ),
      ]);

      step.status = 'SUCCEEDED';
      step.completedAt = new Date().toISOString();
      step.output = output;

      // Extract artifacts based on tool output
      this.collectArtifacts(task, step, output);

      this.emitEvent(task.taskId, 'step_completed', { taskId: task.taskId, step });
    } catch (err) {
      step.status = 'FAILED';
      step.completedAt = new Date().toISOString();
      step.error = (err as Error).message;
      this.emitEvent(task.taskId, 'step_failed', { taskId: task.taskId, step });
    }
  }

  private resolveStepArguments(task: AgentTask, step: AgentStepProposal): void {
    // If a step needs tests generated by previous step:
    if (step.tool === 'run_api_tests' && !step.arguments.tests) {
      const genStep = task.steps.find((s) => s.tool === 'generate_test_cases' && s.output);
      if (genStep && (genStep.output as any)?.tests) {
        step.arguments.tests = (genStep.output as any).tests;
      }
    }

    // If step needs OpenAPI spec generated by previous step:
    if ((step.tool === 'generate_mock_api' || step.tool === 'generate_test_cases') && !step.arguments.spec) {
      const specStep = task.steps.find((s) => s.tool === 'generate_openapi_spec' && s.output);
      if (specStep && (specStep.output as any)?.specJson) {
        step.arguments.spec = (specStep.output as any).specJson;
      }
    }

    // If step needs failure evidence from run_api_tests:
    if (step.tool === 'analyze_failure' && !step.arguments.failureMessage) {
      const testStep = task.steps.find((s) => s.tool === 'run_api_tests' && s.output);
      if (testStep && (testStep.output as any)?.results) {
        const failedResult = (testStep.output as any).results.find((r: any) => r.status !== 'PASSED_EXECUTION');
        if (failedResult) {
          step.arguments.failureMessage = `Test execution error: ${failedResult.error?.message || 'Contract validation failed'}`;
        }
      }
    }

    // If step needs code patch from generate_code_patch:
    if (step.tool === 'verify_code_patch' && !step.arguments.modifiedCode) {
      const patchStep = task.steps.find((s) => s.tool === 'generate_code_patch' && s.output);
      if (patchStep && (patchStep.output as any)?.modifiedCode) {
        step.arguments.modifiedCode = (patchStep.output as any).modifiedCode;
      }
    }
  }

  private collectArtifacts(task: AgentTask, step: AgentStepProposal, output: unknown): void {
    const now = new Date().toISOString();

    if (step.tool === 'generate_openapi_spec' && (output as any)?.specJson) {
      task.artifacts.push({
        id: `art_${Date.now()}_spec`,
        name: 'OpenAPI Specification (OAS 3.1)',
        type: 'openapi_spec',
        content: (output as any).specJson,
        createdAt: now,
      });
    }

    if (step.tool === 'generate_test_cases' && (output as any)?.tests) {
      task.artifacts.push({
        id: `art_${Date.now()}_tests`,
        name: `Test Suite (${(output as any).totalTests} tests)`,
        type: 'test_suite',
        content: (output as any).tests,
        createdAt: now,
      });
    }

    if (step.tool === 'generate_code_patch' && (output as any)?.diff) {
      task.artifacts.push({
        id: `art_${Date.now()}_patch`,
        name: 'Targeted Code Patch Diff',
        type: 'code_patch',
        content: output,
        createdAt: now,
      });
    }

    if (step.tool === 'get_execution_report' && (output as any)?.markdownReport) {
      task.artifacts.push({
        id: `art_${Date.now()}_report`,
        name: 'Execution & Compliance Report',
        type: 'report',
        content: output,
        createdAt: now,
      });
    }
  }

  private buildStep(
    stepId: string,
    tool: AgentToolName,
    args: Record<string, unknown>,
    summary: string,
    dependsOn: string[] = []
  ): AgentStepProposal {
    const policy = AGENT_TOOL_POLICIES[tool];
    return {
      stepId,
      tool,
      arguments: args,
      dependsOn,
      risk: policy.risk,
      requiresApproval: policy.requiresApproval,
      summary,
      status: 'PENDING',
    };
  }

  private emitEvent(taskId: string, eventName: string, data: unknown): void {
    this.emit(eventName, { taskId, eventName, data, timestamp: new Date().toISOString() });
    this.emit(`task:${taskId}`, { taskId, eventName, data, timestamp: new Date().toISOString() });
  }
}
