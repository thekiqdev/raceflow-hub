import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  registerUser,
  loginUser,
  getCurrentUser,
  logoutUser,
} from '../controllers/authController.js';

const router = Router();

// Public routes
router.post('/register', registerUser);
router.post('/login', loginUser);

// Protected routes
router.get('/me', authenticate, getCurrentUser);
router.post('/logout', authenticate, logoutUser);

export default router;





