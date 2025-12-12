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
// These routes are for leaders to view their own data
router.get('/me', authenticate, getMyGroupLeaderController);
router.get('/me/referrals', authenticate, getMyReferralsController);
router.get('/me/commissions', authenticate, getMyCommissionsController);
router.get('/me/stats', authenticate, getMyStatsController);

// Note: Admin routes for managing group leaders are in adminRoutes.ts
// under /api/admin/group-leaders

export default router;

