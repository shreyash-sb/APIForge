import { Router } from 'express';
import { MockServerController } from '../controllers/mockServer.controller.js';

const router = Router();
const controller = new MockServerController();

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

// Dynamic mock server request dispatcher
router.all('/serve/*', (req, res) => {
  void controller.serveMock(req, res);
});

router.all('/serve', (req, res) => {
  void controller.serveMock(req, res);
});

export default router;
