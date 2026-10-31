import type { Request, Response } from 'express';
import { DiagnosisService } from '../services/diagnosis.service.js';
import type { AiProvider } from '../services/aiProvider.service.js';
import { aiCredentialStore, type AuthSession } from '../services/aiCredentialStore.service.js';
import {
  MAX_DIAGNOSIS_BATCH_SIZE,
  type DiagnoseBatchItem,
  type DiagnoseSingleRequest,
} from '../types/diagnosis.types.js';

type ProviderResolver = (session: AuthSession | undefined) => AiProvider;

export class DiagnosisController {
  private readonly diagnosisService: DiagnosisService;
  private readonly resolveProvider: ProviderResolver;

  constructor(
    diagnosisService: DiagnosisService = new DiagnosisService(),
    resolveProvider: ProviderResolver = (session) => aiCredentialStore.resolveProvider(session)
  ) {
    this.diagnosisService = diagnosisService;
    this.resolveProvider = resolveProvider;
  }

  /** Request-scoped provider: the caller's own session key, or mock/demo when none is configured. */
  private providerFor(res: Response): AiProvider | undefined {
    if (this.diagnosisService.usesFixedProvider) return undefined;
    return this.resolveProvider((res.locals as { authSession?: AuthSession } | undefined)?.authSession);
  }

  async diagnoseSingle(req: Request, res: Response): Promise<void> {
    try {
      const payload = req.body as Partial<DiagnoseSingleRequest> | undefined;

      if (!payload || typeof payload !== 'object') {
        res.status(400).json({ error: { message: 'Invalid request body: JSON payload is required.' } });
        return;
      }

      if (!payload.testCase?.id || !payload.testCase?.expected) {
        res.status(400).json({
          error: { message: "Invalid payload: 'testCase' with 'id' and 'expected' is required." },
        });
        return;
      }

      if (!payload.executionResult?.testCaseId || !payload.executionResult?.status) {
        res.status(400).json({
          error: { message: "Invalid payload: 'executionResult' with 'testCaseId' and 'status' is required." },
        });
        return;
      }

      if (!payload.validationResult?.testCaseId || !payload.validationResult?.status) {
        res.status(400).json({
          error: { message: "Invalid payload: 'validationResult' with 'testCaseId' and 'status' is required." },
        });
        return;
      }

      if (payload.testCase.id !== payload.executionResult.testCaseId) {
        res.status(400).json({
          error: {
            message: `Mismatched testCaseId: testCase has '${payload.testCase.id}', executionResult has '${payload.executionResult.testCaseId}'.`,
          },
        });
        return;
      }

      if (payload.testCase.id !== payload.validationResult.testCaseId) {
        res.status(400).json({
          error: {
            message: `Mismatched testCaseId: testCase has '${payload.testCase.id}', validationResult has '${payload.validationResult.testCaseId}'.`,
          },
        });
        return;
      }

      if (payload.executionResult.executionId !== payload.validationResult.executionId || !Array.isArray(payload.validationResult.assertions)) {
        res.status(400).json({
          error: {
            message: 'Stale or mismatched evidence: validationResult must belong to the same executionId as executionResult.',
          },
        });
        return;
      }

      const result = await this.diagnosisService.diagnoseSingle(
        payload.testCase,
        payload.executionResult,
        payload.validationResult,
        this.providerFor(res)
      );

      res.status(200).json(result);
    } catch {
      res.status(500).json({
        error: {
          message: 'An unexpected error occurred during AI diagnosis.',
        },
      });
    }
  }

  async diagnoseBatch(req: Request, res: Response): Promise<void> {
    try {
      const payload = req.body as { items?: DiagnoseBatchItem[] } | undefined;

      if (!payload || !Array.isArray(payload.items)) {
        res.status(400).json({
          error: { message: "'items' must be an array of testCase / executionResult / validationResult triples." },
        });
        return;
      }

      if (payload.items.length > MAX_DIAGNOSIS_BATCH_SIZE) {
        res.status(400).json({
          error: {
            message: `Batch limit exceeded: maximum is ${MAX_DIAGNOSIS_BATCH_SIZE}, received ${payload.items.length}.`,
          },
        });
        return;
      }

      for (const [i, item] of payload.items.entries()) {
        if (!item?.testCase?.id || !item?.executionResult?.testCaseId || !item?.validationResult?.testCaseId) {
          res.status(400).json({
            error: {
              message: `Invalid item at index ${i}: each item must include testCase, executionResult, and validationResult.`,
            },
          });
          return;
        }

        if (
          item.testCase.id !== item.executionResult.testCaseId ||
          item.testCase.id !== item.validationResult.testCaseId
        ) {
          res.status(400).json({
            error: {
              message: `Mismatched testCaseId at index ${i}: all three objects must share the same testCaseId.`,
            },
          });
          return;
        }

        if (
          !item.executionResult.executionId ||
          item.executionResult.executionId !== item.validationResult.executionId ||
          !Array.isArray(item.validationResult.assertions)
        ) {
          res.status(400).json({
            error: {
              message: `Stale or mismatched evidence at index ${i}: executionResult and validationResult must share the same executionId.`,
            },
          });
          return;
        }
      }

      const result = await this.diagnosisService.diagnoseBatch(payload.items, this.providerFor(res));
      res.status(200).json(result);
    } catch {
      res.status(500).json({
        error: {
          message: 'An unexpected error occurred during batch AI diagnosis.',
        },
      });
    }
  }
}
