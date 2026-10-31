import express, { Router } from 'express';
import { AiSettingsController } from '../controllers/aiSettings.controller.js';
import { aiKeyRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();
const controller = new AiSettingsController();

router.get('/', (req, res) => controller.status(req, res));
router.put('/gemini-key', aiKeyRateLimiter, (req, res) => {
  void controller.saveKey(req, res);
});
router.post('/gemini-key/test', aiKeyRateLimiter, (req, res) => {
  void controller.testKey(req, res);
});
router.delete('/gemini-key', (req, res) => controller.removeKey(req, res));

/** Small, dedicated body limit for credential submission. */
export const aiSettingsBodyParser = express.json({ limit: '4kb' });

export default router;
