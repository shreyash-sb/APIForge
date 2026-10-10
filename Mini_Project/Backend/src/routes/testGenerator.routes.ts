import { Router } from 'express';
import { TestGeneratorController } from '../controllers/testGenerator.controller.js';

const router = Router();
const controller = new TestGeneratorController();

router.post('/generate', (req, res) => controller.generate(req, res));

export default router;
