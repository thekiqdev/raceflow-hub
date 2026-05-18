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
  hardDeleteUserController,
  updateUserStatusController,
  approveOrganizerController,
  blockUserController,
  unblockUserController,
  resetUserPasswordController,
  createAdminController,
  createManualRunnerController,
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
  testEmailController,
} from '../controllers/systemSettingsController.js';
import {
  getTransferRequestsController,
  getTransferRequestByIdController,
  updateTransferRequestController,
} from '../controllers/transferRequestController.js';
import {
  getRegistrationsByPeriodController,
  getNewUsersByMonthController,
  getRevenueByEventController,
  getTopOrganizersController,
  getAthleteBehaviorController,
  getMonthlyEvolutionController,
  getEventPerformanceController,
  getCpfValidationOverviewController,
  getCpfLookupMetricsController,
} from '../controllers/reportsController.js';
import { getLeadersInvitationsGrantedByEventController } from '../controllers/leadersInvitationsReportController.js';
import { getEventInvitationStatsController } from '../controllers/eventInvitationStatsController.js';
import { getEventGeneralStatsController } from '../controllers/reportsController.js';
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
import {
  createGroupLeaderController,
  getAllGroupLeadersController,
  getGroupLeaderByIdController,
  updateGroupLeaderController,
  deactivateGroupLeaderController,
  deleteGroupLeaderController,
  activateGroupLeaderController,
  getReferralsByLeaderController,
  getCommissionsByLeaderController,
  getLeaderInvitationProgressController,
} from '../controllers/groupLeadersController.js';
import {
  getLeaderEventCommissionsController,
  getEventCommissionsByEventController,
  createLeaderEventCommissionController,
  updateLeaderEventCommissionController,
  deleteLeaderEventCommissionController,
} from '../controllers/leaderEventCommissionsController.js';
import {
  getLeaderCouponsController,
  createLeaderCouponController,
  updateLeaderCouponController,
  deleteLeaderCouponController,
} from '../controllers/leaderCouponsController.js';
import {
  updateAllRegistrationStatusesController,
  updateEventRegistrationStatusController,
} from '../controllers/registrationStatusController.js';
import { adminTransferRegistrationController } from '../controllers/registrationsController.js';
import {
  getAllDocumentsController,
  getPendingDocumentsController,
  updateDocumentStatusController,
} from '../controllers/documentsController.js';
import {
  getAllDocumentTypesController,
  getDocumentTypeByIdController,
  createDocumentTypeController,
  updateDocumentTypeController,
  deleteDocumentTypeController,
} from '../controllers/documentTypesController.js';
import {
  fixOrganizerRegistrationsController,
  disableAsaasNotificationsController,
  backfillPlatformFeeAmountController,
  investigateEventRegistrationsIntegrityController,
  forensicEventRegistrationsInvestigationController,
  restoreRegistrationsFromBackupController,
  deepForensicRegistrationsInvestigationController,
  analyzeBackupRegistrationDependenciesController,
  analyzeNullKitCompatibilityController,
  restoreMissingRegistrationsController,
  auditRestoredRegistrationSemanticsController,
} from '../controllers/adminScriptsController.js';
import { removeCommissionController, getRegistrationCommissionController } from '../controllers/adminCommissionsController.js';
import { getLeaderCouponRegistrationsController } from '../controllers/leaderRegistrationsController.js';
import {
  getAllBannersController,
  getBannerByIdController,
  createBannerController,
  updateBannerController,
  deleteBannerController,
} from '../controllers/homeBannersController.js';
import {
  changeEventOrganizerController,
  getEventMigrationLogsController,
  getMigrationLogByIdController,
  rollbackMigrationController,
} from '../controllers/changeEventOrganizerController.js';
import { runInvitationBonusAuditController } from '../controllers/invitationBonusAuditController.js';
import { getInvitationBonusAuditContextController } from '../controllers/invitationBonusAuditContextController.js';
import { runInvitationBonusReconciliationController } from '../controllers/invitationBonusReconciliationController.js';
import { runMissingInvitationDeliveryController } from '../controllers/missingInvitationDeliveryController.js';
import {
  listAssistedCommandAuditsController,
  getAssistedCommandAuditSummaryController,
  listStuckAssistedCommandAuditsController,
  markStuckAssistedAuditFailedController,
} from '../controllers/invitationBonusAssistedOperationalController.js';
import {
  getSupportSnapshotController,
  getAssistedOperationalSignalsController,
  getAssistedAuditDetailController,
} from '../controllers/invitationBonusAssistedSupportController.js';

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
router.delete('/users/:id/hard-delete', hardDeleteUserController);
router.post('/users/:id/approve', approveOrganizerController);
router.post('/users/:id/block', blockUserController);
router.post('/users/:id/unblock', unblockUserController);
router.post('/users/:id/reset-password', resetUserPasswordController);
router.post('/users/admins', createAdminController);
router.post('/users/runners/manual', createManualRunnerController);

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
router.post('/settings/test-email', testEmailController);

// Transfer Requests
router.get('/transfer-requests', getTransferRequestsController);
router.get('/transfer-requests/:id', getTransferRequestByIdController);
router.put('/transfer-requests/:id', updateTransferRequestController);

// Reports
router.get('/reports/registrations-by-period', getRegistrationsByPeriodController);
router.get('/reports/new-users-by-month', getNewUsersByMonthController);
router.get('/reports/revenue-by-event', getRevenueByEventController);
router.get('/reports/top-organizers', getTopOrganizersController);
router.get('/reports/athlete-behavior', getAthleteBehaviorController);
router.get('/reports/monthly-evolution', getMonthlyEvolutionController);
router.get('/reports/event-performance', getEventPerformanceController);
router.get('/reports/cpf-validation-overview', getCpfValidationOverviewController);
router.get('/reports/cpf-lookup-metrics', getCpfLookupMetricsController);
router.get(
  '/reports/leaders-invitations-granted/:eventId',
  getLeadersInvitationsGrantedByEventController
);
router.get(
  '/reports/events/:eventId/invitation-stats',
  getEventInvitationStatsController
);
router.get(
  '/reports/events/:eventId/general-stats',
  getEventGeneralStatsController
);

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

// Home Banners (admin)
router.get('/home-banners', getAllBannersController);
router.get('/home-banners/:id', getBannerByIdController);
router.post('/home-banners', createBannerController);
router.put('/home-banners/:id', updateBannerController);
router.delete('/home-banners/:id', deleteBannerController);

// Group Leaders endpoints (admin only)
router.post('/group-leaders', createGroupLeaderController);
router.get('/group-leaders', getAllGroupLeadersController);
router.get('/group-leaders/:id', getGroupLeaderByIdController);
router.put('/group-leaders/:id', updateGroupLeaderController);
router.delete('/group-leaders/:id', deactivateGroupLeaderController);
router.delete('/group-leaders/:id/delete', deleteGroupLeaderController);
router.post('/group-leaders/:id/activate', activateGroupLeaderController);
router.get('/group-leaders/:id/referrals', getReferralsByLeaderController);
router.get('/group-leaders/:id/commissions', getCommissionsByLeaderController);
router.get('/group-leaders/:id/invitation-progress', getLeaderInvitationProgressController);
router.get('/group-leaders/:id/coupon-registrations', getLeaderCouponRegistrationsController);
router.delete('/commissions/:commissionId', removeCommissionController);
router.get('/registrations/:registrationId/commission', getRegistrationCommissionController);
router.post('/registrations/:registrationId/transfer', adminTransferRegistrationController);
router.get('/events/:eventId/event-commissions', getEventCommissionsByEventController);

// Leader Event Commissions endpoints (admin)
router.get('/group-leaders/:id/event-commissions', getLeaderEventCommissionsController);
router.post('/group-leaders/:id/event-commissions', createLeaderEventCommissionController);
router.put('/group-leaders/:id/event-commissions/:commissionId', updateLeaderEventCommissionController);
router.delete('/group-leaders/:id/event-commissions/:commissionId', deleteLeaderEventCommissionController);

// Leader Coupons endpoints (admin)
router.get('/group-leaders/:id/coupons', getLeaderCouponsController);
router.post('/group-leaders/:id/coupons', createLeaderCouponController);
router.put('/group-leaders/:id/coupons/:couponId', updateLeaderCouponController);
router.delete('/group-leaders/:id/coupons/:couponId', deleteLeaderCouponController);

// Registration Status Management endpoints (admin)
router.post('/update-registration-statuses', updateAllRegistrationStatusesController);
router.post('/events/:eventId/update-registration-status', updateEventRegistrationStatusController);

// Documents Management endpoints (admin)
router.get('/documents', getAllDocumentsController);
router.get('/documents/pending', getPendingDocumentsController);
router.put('/documents/:id/status', updateDocumentStatusController);

// Document Types Management endpoints (admin)
router.get('/document-types', getAllDocumentTypesController);
router.get('/document-types/:id', getDocumentTypeByIdController);
router.post('/document-types', createDocumentTypeController);
router.put('/document-types/:id', updateDocumentTypeController);
router.delete('/document-types/:id', deleteDocumentTypeController);

// Fase 1 — Auditoria / simulador bônus de convite (somente leitura)
router.get('/audit/invitation-bonus-context/:eventId', getInvitationBonusAuditContextController);
router.post('/audit/invitation-bonus-simulator', runInvitationBonusAuditController);
// Frente 2 — Correção controlada (integrada ao contexto da Frente 1)
router.post('/reconcile/invitation-bonus-controlled', runInvitationBonusReconciliationController);
router.post('/reconcile/missing-invitation-delivery', runMissingInvitationDeliveryController);

// Etapa 6 — observabilidade e resolução de comandos assistidos presos (auditoria)
router.get('/invitation-bonus/assisted-audits/summary', getAssistedCommandAuditSummaryController);
router.get('/invitation-bonus/assisted-audits/stuck', listStuckAssistedCommandAuditsController);
router.get('/invitation-bonus/assisted-audits/support-snapshot', getSupportSnapshotController);
router.get('/invitation-bonus/assisted-audits/signals', getAssistedOperationalSignalsController);
router.get('/invitation-bonus/assisted-audits', listAssistedCommandAuditsController);
router.post(
  '/invitation-bonus/assisted-audits/:auditId/mark-stuck-failed',
  markStuckAssistedAuditFailedController
);
router.get('/invitation-bonus/assisted-audits/:auditId/detail', getAssistedAuditDetailController);

// Event organizer migration (change event owner)
router.post('/events/:eventId/change-organizer', changeEventOrganizerController);
router.get('/events/:eventId/migration-log', getEventMigrationLogsController);
router.get('/migration-log/:migrationId', getMigrationLogByIdController);
router.post('/migration-rollback', rollbackMigrationController);

// Admin Scripts endpoints
router.post('/scripts/fix-organizer-registrations', fixOrganizerRegistrationsController);
router.post('/scripts/disable-asaas-notifications', disableAsaasNotificationsController);
router.post('/scripts/backfill-platform-fee-amount', backfillPlatformFeeAmountController);
router.post('/scripts/investigate-event-registrations-integrity', investigateEventRegistrationsIntegrityController);
router.post('/scripts/forensic-event-registrations-investigation', forensicEventRegistrationsInvestigationController);
router.post('/scripts/restore-registrations-from-backup', restoreRegistrationsFromBackupController);
router.post('/scripts/deep-forensic-registrations-investigation', deepForensicRegistrationsInvestigationController);
router.post('/scripts/analyze-backup-registration-dependencies', analyzeBackupRegistrationDependenciesController);
router.post('/scripts/analyze-null-kit-compatibility', analyzeNullKitCompatibilityController);
router.post('/scripts/audit-restored-registration-semantics', auditRestoredRegistrationSemanticsController);
router.post('/scripts/restore-missing-registrations', restoreMissingRegistrationsController);

export default router;

