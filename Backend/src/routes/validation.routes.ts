import { Router } from 'express';
import { ValidationController } from '../controllers/validation.controller.js';

const router = Router();
const controller = new ValidationController();

router.post('/validate-single', (req, res) => {
  controller.validateSingle(req, res);
});

router.post('/validate-batch', (req, res) => {
  controller.validateBatch(req, res);
});

export default router;
