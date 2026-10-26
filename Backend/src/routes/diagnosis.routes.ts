import { Router } from 'express';
import { DiagnosisController } from '../controllers/diagnosis.controller.js';

const router = Router();
const controller = new DiagnosisController();

router.post('/diagnose-single', (req, res) => {
  void controller.diagnoseSingle(req, res);
});

router.post('/diagnose-batch', (req, res) => {
  void controller.diagnoseBatch(req, res);
});

export default router;
