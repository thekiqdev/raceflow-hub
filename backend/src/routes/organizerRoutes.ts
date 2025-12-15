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

export default router;

