import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';

const router = Router();
const authController = new AuthController();

router.post('/signup', (req, res) => authController.signUp(req, res));
router.post('/login', (req, res) => authController.login(req, res));
router.get('/me', (req, res) => authController.me(req, res));
router.post('/logout', (req, res) => authController.logout(req, res));
router.get('/activity', (req, res) => authController.getActivity(req, res));
router.post('/change-password', (req, res) => authController.changePassword(req, res));
router.delete('/account', (req, res) => authController.deleteAccount(req, res));
router.delete('/me', (req, res) => authController.deleteAccount(req, res));

export default router;
