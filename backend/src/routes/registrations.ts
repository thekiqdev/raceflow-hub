import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getAllRegistrations,
  getRegistration,
  getRegistrationForValidation,
  createRegistrationController,
  updateRegistrationController,
  attachRegistrationToCommissionController,
  getRegistrationCommissionController,
  detachRegistrationCommissionController,
  changeRegistrationCommissionController,
  exportRegistrationsController,
  transferRegistrationController,
  cancelRegistrationController,
  deleteRegistrationController,
  getRegistrationReceiptController,
  getPaymentStatusController,
  getPendingDifferencePaymentController,
  verifyPaymentController,
  confirmDifferencePaymentController,
  generatePaymentController,
  createRegistrationByOrganizerController,
  createRegistrationBySuperAdminController,
  createRegistrationByLeaderController,
  checkExistingRegistrationController,
  getRegistrationsWithMissingAttributesController,
  completeRegistrationAttributesController,
  removeRegistrationAttributesController,
  completeInvitationController,
  previewRegistrationEditController,
} from '../controllers/registrationsController.js';
import { createTransferRequestController, generateTransferPaymentController, getTransferRequestByIdController } from '../controllers/transferRequestController.js';
import { getEnabledModulesController } from '../controllers/systemSettingsController.js';

const router = Router();

// Public route for validation (no authentication required)
router.get('/:id/validate', getRegistrationForValidation);

// All other routes require authentication
router.use(authenticate);

// Public endpoint for enabled modules (accessible to authenticated users)
router.get('/settings/modules', getEnabledModulesController);

router.get('/export', exportRegistrationsController);
router.get('/check-existing', checkExistingRegistrationController);
router.get('/missing-attributes', getRegistrationsWithMissingAttributesController);
router.get('/', getAllRegistrations);
router.post('/:id/complete-attributes', completeRegistrationAttributesController);
router.post('/:id/remove-attributes', removeRegistrationAttributesController);
router.post('/:id/complete-invitation', completeInvitationController);
router.get('/:id/payment-status', getPaymentStatusController);
router.get('/:id/pending-difference-payment', getPendingDifferencePaymentController);
router.post('/:id/verify-payment', verifyPaymentController);
router.post('/:id/confirm-difference-payment', confirmDifferencePaymentController);
router.post('/:id/generate-payment', generatePaymentController);
router.get('/:id/receipt', getRegistrationReceiptController);
router.get('/:id', getRegistration);
router.post('/:id/preview-edit', previewRegistrationEditController);
router.post('/', createRegistrationController);
router.post('/organizer/register-athlete', createRegistrationByOrganizerController);
router.post('/admin/register-athlete', createRegistrationBySuperAdminController);
router.post('/leader/register-athlete', createRegistrationByLeaderController);
router.put('/:id', updateRegistrationController);
router.post('/:id/attach-commission', attachRegistrationToCommissionController);
router.get('/:id/commission', getRegistrationCommissionController);
router.post('/:id/detach-commission', detachRegistrationCommissionController);
router.post('/:id/change-commission', changeRegistrationCommissionController);
router.put('/:id/transfer', transferRegistrationController);
router.put('/:id/cancel', cancelRegistrationController);
router.delete('/:id', deleteRegistrationController);

// Transfer requests routes
router.post('/transfer-requests', createTransferRequestController);
router.get('/transfer-requests/:id', getTransferRequestByIdController);
router.post('/transfer-requests/:id/payment', generateTransferPaymentController);

export default router;


