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
import { getMyEventCommissionsController } from '../controllers/leaderEventCommissionsController.js';
import { getMyCouponRegistrationsController } from '../controllers/leaderRegistrationsController.js';
import {
  getMyInvitationsController,
  getMyAvailableInvitationsController,
  sendInvitationController,
} from '../controllers/leaderInvitationsController.js';

const router = Router();

// Public routes (none for group leaders)

// Authenticated routes (leader can see their own data)
router.get('/me', authenticate, getMyGroupLeaderController);
router.get('/me/referrals', authenticate, getMyReferralsController);
router.get('/me/commissions', authenticate, getMyCommissionsController);
router.get('/me/event-commissions', authenticate, getMyEventCommissionsController);
router.get('/me/coupon-registrations', authenticate, getMyCouponRegistrationsController);
router.get('/me/stats', authenticate, getMyStatsController);
router.get('/me/invitations', authenticate, getMyInvitationsController);
router.get('/me/invitations/available', authenticate, getMyAvailableInvitationsController);
router.post('/me/invitations/send', authenticate, sendInvitationController);

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

