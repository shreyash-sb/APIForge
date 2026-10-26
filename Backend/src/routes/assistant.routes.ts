import { Router } from 'express'; import { AssistantController } from '../controllers/assistant.controller.js';
const router = Router(); const controller = new AssistantController(); router.post('/chat', (req, res) => { void controller.ask(req, res); }); export default router;
