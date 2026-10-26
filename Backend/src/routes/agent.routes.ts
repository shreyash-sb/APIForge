import { Router } from 'express';
import { AgentController } from '../controllers/agent.controller.js';

const router = Router();

router.get('/tools', AgentController.listTools);
router.post('/plan', AgentController.createPlan);
router.post('/execute', AgentController.executeTask);
router.get('/tasks', AgentController.listTasks);
router.get('/tasks/:taskId', AgentController.getTask);
router.post('/tasks/:taskId/approve', AgentController.approveStep);
router.post('/tasks/:taskId/reject', AgentController.rejectStep);
router.post('/tasks/:taskId/cancel', AgentController.cancelTask);
router.get('/tasks/:taskId/stream', AgentController.streamTaskEvents);

export default router;
