import type { Request, Response } from 'express';
import { ValidationService } from '../services/validation.service.js';
import {
  MAX_VALIDATION_BATCH_SIZE,
  type ValidateBatchItem,
  type ValidateSingleRequest,
} from '../types/validation.types.js';

export class ValidationController {
  private readonly validationService: ValidationService;

  constructor(validationService: ValidationService = new ValidationService()) {
    this.validationService = validationService;
  }

  validateSingle(req: Request, res: Response): void {
    try {
      const payload = req.body as Partial<ValidateSingleRequest> | undefined;

      if (!payload || typeof payload !== 'object') {
        res.status(400).json({
          error: {
            message: 'Invalid request body: JSON payload is required.',
          },
        });
        return;
      }

      if (!payload.testCase || typeof payload.testCase !== 'object' || !payload.testCase.id || !payload.testCase.expected) {
        res.status(400).json({
          error: {
            message: "Invalid payload: 'testCase' object with 'id' and 'expected' contract is required.",
          },
        });
        return;
      }

      if (!payload.executionResult || typeof payload.executionResult !== 'object' || !payload.executionResult.testCaseId || !payload.executionResult.status) {
        res.status(400).json({
          error: {
            message: "Invalid payload: 'executionResult' object with 'testCaseId' and 'status' is required.",
          },
        });
        return;
      }

      if (payload.testCase.id !== payload.executionResult.testCaseId) {
        res.status(400).json({
          error: {
            message: `Mismatched testCaseId: testCase has id '${payload.testCase.id}', but executionResult has testCaseId '${payload.executionResult.testCaseId}'.`,
          },
        });
        return;
      }

      const result = this.validationService.validateSingle(
        payload.testCase,
        payload.executionResult,
        payload.schemas
      );

      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({
        error: {
          message: 'An unexpected internal error occurred during response validation.',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }

  validateBatch(req: Request, res: Response): void {
    try {
      const payload = req.body as { items?: ValidateBatchItem[]; schemas?: Record<string, unknown> } | undefined;

      if (!payload || !Array.isArray(payload.items)) {
        res.status(400).json({
          error: {
            message: "Invalid payload: 'items' must be an array of testCase and executionResult pairs.",
          },
        });
        return;
      }

      if (payload.items.length > MAX_VALIDATION_BATCH_SIZE) {
        res.status(400).json({
          error: {
            message: `Batch limit exceeded: maximum allowed is ${MAX_VALIDATION_BATCH_SIZE} items, received ${payload.items.length}.`,
          },
        });
        return;
      }

      for (const [index, item] of payload.items.entries()) {
        if (!item || !item.testCase?.id || !item.executionResult?.testCaseId) {
          res.status(400).json({
            error: {
              message: `Invalid item at index ${index}: each item must contain 'testCase' and 'executionResult'.`,
            },
          });
          return;
        }

        if (item.testCase.id !== item.executionResult.testCaseId) {
          res.status(400).json({
            error: {
              message: `Mismatched testCaseId at index ${index}: testCase has id '${item.testCase.id}', but executionResult has testCaseId '${item.executionResult.testCaseId}'.`,
            },
          });
          return;
        }
      }

      const result = this.validationService.validateBatch(
        payload.items,
        payload.schemas as Record<string, import('../types/openapi.types.js').ApiSchema> | undefined
      );

      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({
        error: {
          message: 'An unexpected internal error occurred during batch response validation.',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }
}
