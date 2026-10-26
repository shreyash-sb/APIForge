import { Router } from 'express';
import { StreamController } from '../controllers/stream.controller.js';
import { apiRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();
const controller = new StreamController();

// POST /api/stream/chat - SSE token streaming endpoint protected by rate limiter
router.post('/chat', apiRateLimiter, (req, res) => controller.streamChat(req, res));

export default router;
