import { Router } from 'express';
import { OpenApiController } from '../controllers/openapi.controller.js';

const router = Router();
const openApiController = new OpenApiController();

router.post('/import', (req, res) => openApiController.importSpecification(req, res));

export default router;
