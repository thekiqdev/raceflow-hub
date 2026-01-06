import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  registerUser,
  loginUser,
  getCurrentUser,
  logoutUser,
} from '../controllers/authController.js';
import {
  requestPasswordResetController,
  resetPasswordController,
  validateTokenController,
} from '../controllers/passwordResetController.js';

const router = Router();

// Public routes
router.post('/register', registerUser);
router.post('/login', loginUser);

// Password reset routes (public)
router.post('/password-reset/request', requestPasswordResetController);
router.post('/password-reset/reset', resetPasswordController);
router.get('/password-reset/validate-token', validateTokenController);

// Protected routes
router.get('/me', authenticate, getCurrentUser);
router.post('/logout', authenticate, logoutUser);

export default router;





