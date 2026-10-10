import { Router } from 'express';
import { TestExecutionController } from '../controllers/testExecution.controller.js';

const router = Router();
const controller = new TestExecutionController();

router.post('/execute-single', (req, res) => {
  void controller.executeSingle(req, res);
});

router.post('/execute-batch', (req, res) => {
  void controller.executeBatch(req, res);
});

export default router;
