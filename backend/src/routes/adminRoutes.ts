import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/authorization.js';
import {
  getDashboardStatsController,
  getDashboardChartsController,
} from '../controllers/adminController.js';
import {
  getOrganizersController,
  getAthletesController,
  getAdminsController,
  getUserByIdController,
  getUserProfileByIdController,
  updateUserProfileController,
  convertAthleteToOrganizerController,
  deleteUserController,
  updateUserStatusController,
  approveOrganizerController,
  blockUserController,
  unblockUserController,
  resetUserPasswordController,
  createAdminController,
} from '../controllers/userManagementController.js';
import {
  getFinancialOverviewController,
  getWithdrawalsController,
  approveWithdrawalController,
  rejectWithdrawalController,
  getRefundsController,
  approveRefundController,
  rejectRefundController,
  getFinancialSettingsController,
  updateFinancialSettingsController,
} from '../controllers/financialController.js';
import {
  getCategoriesController,
  getCategoryByIdController,
  createCategoryController,
  updateCategoryController,
  deleteCategoryController,
  getArticlesController,
  getArticleByIdController,
  createArticleController,
  updateArticleController,
  deleteArticleController,
  toggleArticleStatusController,
} from '../controllers/knowledgeController.js';
import {
  getSystemSettingsController,
  updateSystemSettingsController,
} from '../controllers/systemSettingsController.js';
import {
  getRegistrationsByPeriodController,
  getNewUsersByMonthController,
  getRevenueByEventController,
  getTopOrganizersController,
  getAthleteBehaviorController,
  getMonthlyEvolutionController,
  getEventPerformanceController,
} from '../controllers/reportsController.js';
import {
  getSupportTicketsController,
  getTicketByIdController,
  getTicketMessagesController,
  updateTicketStatusController,
  addTicketMessageController,
  getAnnouncementsController,
  createAnnouncementController,
  updateAnnouncementController,
  deleteAnnouncementController,
} from '../controllers/supportController.js';

const router = Router();

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(requireRole('admin'));

// Dashboard endpoints
router.get('/dashboard/stats', getDashboardStatsController);
router.get('/dashboard/charts', getDashboardChartsController);

// User management endpoints
router.get('/users/organizers', getOrganizersController);
router.get('/users/athletes', getAthletesController);
router.get('/users/admins', getAdminsController);
router.get('/users/:id', getUserByIdController);
router.get('/users/:id/profile', getUserProfileByIdController);
router.put('/users/:id/status', updateUserStatusController);
router.put('/users/:id/profile', updateUserProfileController);
router.post('/users/:id/convert-to-organizer', convertAthleteToOrganizerController);
router.delete('/users/:id', deleteUserController);
router.post('/users/:id/approve', approveOrganizerController);
router.post('/users/:id/block', blockUserController);
router.post('/users/:id/unblock', unblockUserController);
router.post('/users/:id/reset-password', resetUserPasswordController);
router.post('/users/admins', createAdminController);

// Financial management endpoints
router.get('/financial/overview', getFinancialOverviewController);
router.get('/financial/withdrawals', getWithdrawalsController);
router.post('/financial/withdrawals/:id/approve', approveWithdrawalController);
router.post('/financial/withdrawals/:id/reject', rejectWithdrawalController);
router.get('/financial/refunds', getRefundsController);
router.post('/financial/refunds/:id/approve', approveRefundController);
router.post('/financial/refunds/:id/reject', rejectRefundController);
router.get('/financial/settings', getFinancialSettingsController);
router.put('/financial/settings', updateFinancialSettingsController);

// Knowledge base endpoints
router.get('/knowledge/categories', getCategoriesController);
router.get('/knowledge/categories/:id', getCategoryByIdController);
router.post('/knowledge/categories', createCategoryController);
router.put('/knowledge/categories/:id', updateCategoryController);
router.delete('/knowledge/categories/:id', deleteCategoryController);
router.get('/knowledge/articles', getArticlesController);
router.get('/knowledge/articles/:id', getArticleByIdController);
router.post('/knowledge/articles', createArticleController);
router.put('/knowledge/articles/:id', updateArticleController);
router.delete('/knowledge/articles/:id', deleteArticleController);
router.post('/knowledge/articles/:id/toggle-status', toggleArticleStatusController);

// System Settings
router.get('/settings', getSystemSettingsController);
router.put('/settings', updateSystemSettingsController);

// Reports
router.get('/reports/registrations-by-period', getRegistrationsByPeriodController);
router.get('/reports/new-users-by-month', getNewUsersByMonthController);
router.get('/reports/revenue-by-event', getRevenueByEventController);
router.get('/reports/top-organizers', getTopOrganizersController);
router.get('/reports/athlete-behavior', getAthleteBehaviorController);
router.get('/reports/monthly-evolution', getMonthlyEvolutionController);
router.get('/reports/event-performance', getEventPerformanceController);

// Support
router.get('/support/tickets', getSupportTicketsController);
router.get('/support/tickets/:id', getTicketByIdController);
router.get('/support/tickets/:id/messages', getTicketMessagesController);
router.put('/support/tickets/:id/status', updateTicketStatusController);
router.post('/support/tickets/:id/messages', addTicketMessageController);
router.get('/support/announcements', getAnnouncementsController);
router.post('/support/announcements', createAnnouncementController);
router.put('/support/announcements/:id', updateAnnouncementController);
router.delete('/support/announcements/:id', deleteAnnouncementController);

export default router;

