import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  registerUser,
  loginUser,
  getCurrentUser,
  logoutUser,
  setPasswordInvitationController,
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

// Complete registration (invitation link): set password with JWT token (public)
router.post('/set-password-invitation', setPasswordInvitationController);

// Protected routes
router.get('/me', authenticate, getCurrentUser);
router.post('/logout', authenticate, logoutUser);

export default router;





