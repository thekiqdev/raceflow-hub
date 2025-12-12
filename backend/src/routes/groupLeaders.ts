import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  createGroupLeaderController,
  getMyGroupLeaderController,
  getAllGroupLeadersController,
  getGroupLeaderByIdController,
  updateGroupLeaderController,
  deactivateGroupLeaderController,
  activateGroupLeaderController,
  getMyReferralsController,
  getReferralsByLeaderController,
  getMyCommissionsController,
  getCommissionsByLeaderController,
  getMyStatsController,
} from '../controllers/groupLeadersController.js';

const router = Router();

// Public routes (none for group leaders)

// Authenticated routes (leader can see their own data)
router.get('/me', authenticate, getMyGroupLeaderController);
router.get('/me/referrals', authenticate, getMyReferralsController);
router.get('/me/commissions', authenticate, getMyCommissionsController);
router.get('/me/stats', authenticate, getMyStatsController);

// Admin routes
router.post('/', authenticate, createGroupLeaderController);
router.get('/', authenticate, getAllGroupLeadersController);
router.get('/:id', authenticate, getGroupLeaderByIdController);
router.put('/:id', authenticate, updateGroupLeaderController);
router.delete('/:id', authenticate, deactivateGroupLeaderController);
router.post('/:id/activate', authenticate, activateGroupLeaderController);
router.get('/:id/referrals', authenticate, getReferralsByLeaderController);
router.get('/:id/commissions', authenticate, getCommissionsByLeaderController);

export default router;

