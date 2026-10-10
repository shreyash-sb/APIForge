import type { Request, Response } from 'express';
import { OpenApiParserService } from '../services/openapiParser.service.js';
import type { OpenApiImportRequest } from '../types/openapi.types.js';

export class OpenApiController {
  private readonly parserService = new OpenApiParserService();

  async importSpecification(req: Request, res: Response): Promise<void> {
    const payload = req.body as Partial<OpenApiImportRequest>;
    if (typeof payload.content !== 'string' || typeof payload.fileName !== 'string') {
      res.status(400).json({ success: false, error: { message: 'A file name and specification content are required.' } });
      return;
    }

    const result = await this.parserService.importSpecification(payload.content);
    res.status(result.success ? 200 : 400).json(result);
  }
}
