import { Router } from 'express';
import { MockServerController } from '../controllers/mockServer.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { mockServerService } from '../services/mockServer.service.js';
import type { MockServerService } from '../services/mockServer.service.js';

export function createMockServerRouter(service: MockServerService = mockServerService): Router {
const router = Router();
const controller = new MockServerController(service);

// Serving configured mocks is intentionally public so they can model public APIs.
router.all('/serve/*', (req, res) => {
  void controller.serveMock(req, res);
});

router.all('/serve', (req, res) => {
  void controller.serveMock(req, res);
});

// Configuration and logs can expose or alter workspace data; protect them.
router.use(requireAuth);

// Management endpoints
router.get('/routes', (req, res) => {
  void controller.getRoutes(req, res);
});

router.get('/routes/:id', (req, res) => {
  void controller.getRouteById(req, res);
});

router.post('/routes', (req, res) => {
  void controller.createRoute(req, res);
});

router.put('/routes/:id', (req, res) => {
  void controller.updateRoute(req, res);
});

router.delete('/routes/:id', (req, res) => {
  void controller.deleteRoute(req, res);
});

router.post('/generate-from-spec', (req, res) => {
  void controller.generateFromSpec(req, res);
});

router.get('/logs', (req, res) => {
  void controller.getLogs(req, res);
});

router.delete('/logs', (req, res) => {
  void controller.clearLogs(req, res);
});

  return router;
}

export default createMockServerRouter();
