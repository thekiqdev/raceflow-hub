import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/authorization.js';
import { getSettings, updateSettings } from '../controllers/homePageSettingsController.js';

const router = Router();

// Public route
router.get('/', getSettings);

// Protected route (admin only)
router.put('/', authenticate, requireRole('admin'), updateSettings);

export default router;

