import type { Request, Response } from 'express';
import { ReportService, ReportValidationError } from '../services/report.service.js';
import type { GenerateReportRequest } from '../types/report.types.js';

export class ReportController {
  constructor(private readonly reportService: ReportService = new ReportService()) {}
  generate(req: Request, res: Response): void {
    try { res.status(200).json(this.reportService.generateReport(req.body as GenerateReportRequest)); }
    catch (error) {
      if (error instanceof ReportValidationError) { res.status(400).json({ error: { message: error.message } }); return; }
      res.status(500).json({ error: { message: 'An unexpected error occurred while generating the report.' } });
    }
  }
}
