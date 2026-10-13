import { Router } from 'express';
import { WorkflowController } from '../controllers/workflow.controller.js';

const router = Router();
const controller = new WorkflowController();

router.post('/validate', (req, res) => {
  void controller.validate(req, res);
});

router.post('/execute', (req, res) => {
  void controller.execute(req, res);
});

router.post('/preview-request', (req, res) => {
  void controller.previewRequest(req, res);
});

export default router;
