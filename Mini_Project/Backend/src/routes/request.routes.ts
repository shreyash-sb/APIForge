import { Router } from 'express';
import { RequestController } from '../controllers/request.controller.js';

const router = Router();
const requestController = new RequestController();

router.post('/execute', (req, res) => requestController.executeRequest(req, res));

export default router;
