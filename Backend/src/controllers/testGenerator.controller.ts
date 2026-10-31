import type { Request, Response } from 'express';
import { TestGeneratorService } from '../services/testGenerator.service.js';
import type { TestGenerationRequest } from '../types/testCase.types.js';

export class TestGeneratorController {
  private readonly generator = new TestGeneratorService();

  generate(req: Request, res: Response): void {
    const payload = req.body as Partial<TestGenerationRequest>;
    if (!payload.specification || !payload.settings) {
      res.status(400).json({ error: { message: 'A normalized API specification and generation settings are required.' } });
      return;
    }
    res.json(this.generator.generate(payload.specification, payload.settings));
  }
}
