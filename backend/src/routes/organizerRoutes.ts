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

export default router;

