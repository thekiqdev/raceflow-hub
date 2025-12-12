import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getMyGroupLeaderController,
  getMyReferralsController,
  getMyCommissionsController,
  getMyStatsController,
} from '../controllers/groupLeadersController.js';

const router = Router();

// Public routes (none for group leaders)

// Authenticated routes (leader can see their own data)
// NOTE: Admin routes are in adminRoutes.ts to ensure proper authorization
router.get('/me', authenticate, getMyGroupLeaderController);
router.get('/me/referrals', authenticate, getMyReferralsController);
router.get('/me/commissions', authenticate, getMyCommissionsController);
router.get('/me/stats', authenticate, getMyStatsController);

export default router;

