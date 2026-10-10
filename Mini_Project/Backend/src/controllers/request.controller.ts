import { Request, Response } from 'express';
import { RequestExecutorService } from '../services/requestExecutor.service.js';
import type { ApiRequest } from '../types/request.types.js';

export class RequestController {
  private executorService: RequestExecutorService;

  constructor() {
    const timeout = parseInt(process.env.REQUEST_TIMEOUT || '30000', 10);
    this.executorService = new RequestExecutorService(timeout);
  }

  async executeRequest(req: Request, res: Response): Promise<void> {
    try {
      const apiRequest: ApiRequest = req.body;

      // Basic validation
      if (!apiRequest.method || !apiRequest.url) {
        res.status(400).json({
          success: false,
          error: {
            type: 'VALIDATION_ERROR',
            message: 'Missing required fields: method and url are required',
          },
        });
        return;
      }

      // Execute the request
      const result = await this.executorService.execute(apiRequest);

      // Return result (status 200 even for failed requests, as the execution itself succeeded)
      res.status(200).json(result);
    } catch (error) {
      console.error('Request execution error:', error);
      res.status(500).json({
        success: false,
        error: {
          type: 'UNKNOWN_ERROR',
          message: 'Internal server error',
        },
      });
    }
  }
}
