import type { Request, Response } from 'express';
import { TestExecutionService } from '../services/testExecution.service.js';
import { MAX_BATCH_SIZE } from '../types/testExecution.types.js';
import type { TestCase } from '../types/testCase.types.js';

export class TestExecutionController {
  private readonly executionService: TestExecutionService;

  constructor(executionService: TestExecutionService = new TestExecutionService()) {
    this.executionService = executionService;
  }

  async executeSingle(req: Request, res: Response): Promise<void> {
    try {
      const testCase = req.body?.testCase as TestCase | undefined;

      if (!testCase || typeof testCase !== 'object' || !testCase.id || !testCase.request?.url || !testCase.request?.method) {
        res.status(400).json({
          error: {
            message: 'Invalid request: testCase with id, request.method, and request.url is required.',
          },
        });
        return;
      }

      const result = await this.executionService.executeSingle(testCase);
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({
        error: {
          message: 'An unexpected internal error occurred during test execution.',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }

  async executeBatch(req: Request, res: Response): Promise<void> {
    try {
      const testCases = req.body?.testCases as TestCase[] | undefined;

      if (!Array.isArray(testCases)) {
        res.status(400).json({
          error: {
            message: 'Invalid request: testCases must be an array of TestCase objects.',
          },
        });
        return;
      }

      if (testCases.length > MAX_BATCH_SIZE) {
        res.status(400).json({
          error: {
            message: `Batch limit exceeded: maximum allowed is ${MAX_BATCH_SIZE} tests, received ${testCases.length}.`,
          },
        });
        return;
      }

      // Check basic validity of each test case
      for (const [index, tc] of testCases.entries()) {
        if (!tc || typeof tc !== 'object' || !tc.id || !tc.request?.url || !tc.request?.method) {
          res.status(400).json({
            error: {
              message: `Invalid testCase at index ${index}: id, request.method, and request.url are required.`,
            },
          });
          return;
        }
      }

      const result = await this.executionService.executeBatch(testCases);
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({
        error: {
          message: 'An unexpected internal error occurred during batch test execution.',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }
}
