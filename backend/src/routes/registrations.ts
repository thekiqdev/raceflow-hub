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

const router = Router();

// Public route for validation (no authentication required)
router.get('/:id/validate', getRegistrationForValidation);

// All other routes require authentication
router.use(authenticate);

router.get('/export', exportRegistrationsController);
router.get('/', getAllRegistrations);
router.get('/:id/payment-status', getPaymentStatusController);
router.get('/:id/receipt', getRegistrationReceiptController);
router.get('/:id', getRegistration);
router.post('/', createRegistrationController);
router.put('/:id', updateRegistrationController);
router.put('/:id/transfer', transferRegistrationController);
router.put('/:id/cancel', cancelRegistrationController);

export default router;


