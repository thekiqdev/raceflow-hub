import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getAllRegistrations,
  getRegistration,
  getRegistrationForValidation,
  createRegistrationController,
  updateRegistrationController,
  exportRegistrationsController,
  transferRegistrationController,
  cancelRegistrationController,
  getRegistrationReceiptController,
  getPaymentStatusController,
} from '../controllers/registrationsController.js';
import { createTransferRequestController, generateTransferPaymentController } from '../controllers/transferRequestController.js';
import { getEnabledModulesController } from '../controllers/systemSettingsController.js';

const router = Router();

// Public route for validation (no authentication required)
router.get('/:id/validate', getRegistrationForValidation);

// All other routes require authentication
router.use(authenticate);

// Public endpoint for enabled modules (accessible to authenticated users)
router.get('/settings/modules', getEnabledModulesController);

router.get('/export', exportRegistrationsController);
router.get('/', getAllRegistrations);
router.get('/:id/payment-status', getPaymentStatusController);
router.get('/:id/receipt', getRegistrationReceiptController);
router.get('/:id', getRegistration);
router.post('/', createRegistrationController);
router.put('/:id', updateRegistrationController);
router.put('/:id/transfer', transferRegistrationController);
router.put('/:id/cancel', cancelRegistrationController);

// Transfer requests routes
router.post('/transfer-requests', createTransferRequestController);
router.post('/transfer-requests/:id/payment', generateTransferPaymentController);

export default router;


