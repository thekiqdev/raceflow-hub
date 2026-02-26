import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/authorization.js';
import {
  getDashboardStatsController,
  getDashboardChartsController,
  getFinancialOverviewController,
  getWithdrawalsController,
  createWithdrawalController,
  getFinancialSummaryController,
  getEventRevenuesController,
  getOrganizerSettingsController,
  updateOrganizerSettingsController,
} from '../controllers/organizerController.js';
import {
  createCouponController,
  getCouponsController,
  getCouponByIdController,
  updateCouponController,
  deleteCouponController,
} from '../controllers/couponsController.js';
import {
  createLeaderCouponController,
  getLeaderCouponsController,
  updateLeaderCouponController,
  deleteLeaderCouponController,
} from '../controllers/leaderCouponsController.js';
import {
  getOrganizerGroupLeadersController,
  getAvailableLeadersController,
  addLeaderToOrganizerController,
  removeLeaderFromOrganizerController,
  getGroupLeaderByIdController,
  updateGroupLeaderController,
  activateGroupLeaderController,
  deactivateGroupLeaderController,
  getReferralsByLeaderController,
  getCommissionsByLeaderController,
  getLeaderInvitationProgressController,
} from '../controllers/groupLeadersController.js';
import {
  createLeaderEventCommissionController,
  getLeaderEventCommissionsController,
  getEventCommissionsByEventController,
  updateLeaderEventCommissionController,
  deleteLeaderEventCommissionController,
} from '../controllers/leaderEventCommissionsController.js';
import { getLeaderCouponRegistrationsController } from '../controllers/leaderRegistrationsController.js';

const router = Router();

// All routes require authentication and organizer role
router.use(authenticate);
router.use(requireRole('organizer'));

// Dashboard endpoints
router.get('/dashboard/stats', getDashboardStatsController);
router.get('/dashboard/charts', getDashboardChartsController);

// Financial endpoints
router.get('/financial/overview', getFinancialOverviewController);
router.get('/financial/withdrawals', getWithdrawalsController);
router.post('/financial/withdrawals', createWithdrawalController);

// Reports endpoints
router.get('/reports/financial-summary', getFinancialSummaryController);
router.get('/reports/event-revenues', getEventRevenuesController);

// Settings endpoints
router.get('/settings', getOrganizerSettingsController);
router.put('/settings', updateOrganizerSettingsController);

// Coupons endpoints
router.get('/coupons', getCouponsController);
router.post('/coupons', createCouponController);
router.get('/coupons/:id', getCouponByIdController);
router.put('/coupons/:id', updateCouponController);
router.delete('/coupons/:id', deleteCouponController);

// Group Leaders endpoints (organizer can manage leaders created by admin)
// Note: Organizer cannot create leaders, only admin can
router.get('/group-leaders', getOrganizerGroupLeadersController);
router.get('/group-leaders/available', getAvailableLeadersController);
router.post('/group-leaders/:id/add', addLeaderToOrganizerController);
router.delete('/group-leaders/:id/remove', removeLeaderFromOrganizerController);
router.get('/group-leaders/:id', getGroupLeaderByIdController);
router.put('/group-leaders/:id', updateGroupLeaderController);
router.post('/group-leaders/:id/activate', activateGroupLeaderController);
router.delete('/group-leaders/:id', deactivateGroupLeaderController);
router.get('/group-leaders/:id/referrals', getReferralsByLeaderController);
router.get('/group-leaders/:id/commissions', getCommissionsByLeaderController);
router.get('/group-leaders/:id/invitation-progress', getLeaderInvitationProgressController);
router.get('/group-leaders/:id/coupon-registrations', getLeaderCouponRegistrationsController);

// Leader Event Commissions endpoints
router.get('/events/:eventId/event-commissions', getEventCommissionsByEventController);
router.get('/group-leaders/:id/event-commissions', getLeaderEventCommissionsController);
router.post('/group-leaders/:id/event-commissions', createLeaderEventCommissionController);
router.put('/group-leaders/:id/event-commissions/:commissionId', updateLeaderEventCommissionController);
router.delete('/group-leaders/:id/event-commissions/:commissionId', deleteLeaderEventCommissionController);

// Leader Coupons endpoints
router.get('/group-leaders/:id/coupons', getLeaderCouponsController);
router.post('/group-leaders/:id/coupons', createLeaderCouponController);
router.put('/group-leaders/:id/coupons/:couponId', updateLeaderCouponController);
router.delete('/group-leaders/:id/coupons/:couponId', deleteLeaderCouponController);

export default router;

