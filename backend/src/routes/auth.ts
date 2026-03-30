import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { cpfLookupRateLimiter } from '../middleware/rateLimiter.js';
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
import {
  lookupCpfController,
  checkCpfRegisteredController,
  cpfBrasilHealthController,
  cpfRegistrationConfigController,
} from '../controllers/cpfLookupController.js';

const router = Router();

// Public routes
router.post('/register', registerUser);
router.post('/login', loginUser);

// CPF já cadastrado na plataforma (cadastro / consulta — sem PII na resposta)
router.post('/check-cpf-registered', cpfLookupRateLimiter, checkCpfRegisteredController);

// Fase 2 — lookup CPF Brasil (chave só no servidor)
router.post('/lookup-cpf', cpfLookupRateLimiter, lookupCpfController);
router.get('/cpf-brasil-health', cpfBrasilHealthController);
// Fase 6 — flags públicas (sem segredos)
router.get('/cpf-registration-config', cpfRegistrationConfigController);

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





