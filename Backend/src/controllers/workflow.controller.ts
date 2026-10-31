import type { Request, Response } from 'express';
import {
  WorkflowEngineService,
  workflowEngine as defaultWorkflowEngine,
} from '../services/workflowEngine.service.js';
import {
  WorkflowSanitizerService,
  workflowSanitizer as defaultWorkflowSanitizer,
} from '../services/workflowSanitizer.service.js';
import {
  VariableInterpolatorService,
  variableInterpolator as defaultInterpolator,
} from '../services/variableInterpolator.service.js';
import type {
  EnvironmentProfile,
  WorkflowScenario,
} from '../types/workflow.types.js';
import type { ApiRequest } from '../types/request.types.js';

export class WorkflowController {
  private readonly workflowEngine: WorkflowEngineService;
  private readonly sanitizer: WorkflowSanitizerService;
  private readonly interpolator: VariableInterpolatorService;

  constructor(
    workflowEngine: WorkflowEngineService = defaultWorkflowEngine,
    sanitizer: WorkflowSanitizerService = defaultWorkflowSanitizer,
    interpolator: VariableInterpolatorService = defaultInterpolator
  ) {
    this.workflowEngine = workflowEngine;
    this.sanitizer = sanitizer;
    this.interpolator = interpolator;
  }

  /**
   * Pre-execution validation for workflow scenarios
   * POST /api/workflows/validate
   */
  async validate(req: Request, res: Response): Promise<void> {
    try {
      const scenario = (req.body?.scenario ?? req.body) as WorkflowScenario | undefined;

      if (!scenario || typeof scenario !== 'object') {
        res.status(400).json({
          error: {
            type: 'VALIDATION_ERROR',
            message: "Invalid request payload: 'scenario' object with id, name, and steps is required.",
          },
        });
        return;
      }

      const result = this.workflowEngine.validateScenario(scenario);
      res.status(200).json({
        valid: result.valid,
        errors: result.errors,
      });
    } catch {
      res.status(500).json({
        error: {
          type: 'INTERNAL_ERROR',
          message: 'Workflow validation failed due to an unexpected server error.',
        },
      });
    }
  }

  /**
   * Executes a workflow scenario and returns a sanitized execution DTO
   * POST /api/workflows/execute
   */
  async execute(req: Request, res: Response): Promise<void> {
    try {
      const scenario = req.body?.scenario as WorkflowScenario | undefined;
      const environment = req.body?.environment as EnvironmentProfile | undefined;

      if (!scenario || typeof scenario !== 'object') {
        res.status(400).json({
          error: {
            type: 'VALIDATION_ERROR',
            message: "Invalid request payload: 'scenario' object is required.",
          },
        });
        return;
      }

      // Pre-validation to reject structurally invalid workflows before execution
      const validation = this.workflowEngine.validateScenario(scenario);
      if (!validation.valid) {
        res.status(400).json({
          error: {
            type: 'VALIDATION_ERROR',
            message: 'Workflow scenario pre-validation failed.',
            details: validation.errors,
          },
        });
        return;
      }

      // Execute scenario with isolated runtime context
      const rawResult = await this.workflowEngine.executeScenario(scenario, environment, {
        throwOnValidationError: false,
      });

      // Produce separate sanitized public DTO without mutating internal execution result
      const sanitizedDto = this.sanitizer.sanitizeExecutionResult(
        rawResult,
        scenario,
        environment
      );

      res.status(200).json(sanitizedDto);
    } catch {
      res.status(500).json({
        error: {
          type: 'INTERNAL_ERROR',
          message: 'Workflow execution failed due to an unexpected server error.',
        },
      });
    }
  }

  /**
   * Resolves variables for a single request without dispatching HTTP traffic
   * POST /api/workflows/preview-request
   */
  async previewRequest(req: Request, res: Response): Promise<void> {
    try {
      const request = req.body?.request as ApiRequest | undefined;
      const environment = req.body?.environment as EnvironmentProfile | undefined;

      if (!request || typeof request !== 'object' || !request.method || !request.url) {
        res.status(400).json({
          error: {
            type: 'VALIDATION_ERROR',
            message: "Invalid request payload: 'request' object with method and url is required.",
          },
        });
        return;
      }

      // Interpolate with non-strict mode to preserve unresolved tokens for preview
      const interpolationResult = this.interpolator.interpolateRequest(
        request,
        environment,
        { strict: false }
      );

      // Sanitize the resolved preview request
      const sanitizedPreview = this.sanitizer.sanitizePreviewRequest(
        interpolationResult.value,
        environment
      );

      res.status(200).json({
        sanitizedRequest: sanitizedPreview,
        resolvedVariables: interpolationResult.resolvedVariables,
        containsSecret: interpolationResult.containsSecret,
      });
    } catch {
      res.status(500).json({
        error: {
          type: 'INTERNAL_ERROR',
          message: 'Request preview failed due to an unexpected server error.',
        },
      });
    }
  }
}
