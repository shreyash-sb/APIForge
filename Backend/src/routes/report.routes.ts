import { Router } from 'express';
import { ReportController } from '../controllers/report.controller.js';
const router = Router();
const controller = new ReportController();
router.post('/generate', (req, res) => controller.generate(req, res));
export default router;
