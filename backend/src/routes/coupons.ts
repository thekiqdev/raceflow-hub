import { Router } from 'express';
import { validateCouponController } from '../controllers/couponsController.js';

const router = Router();

// Public route for coupon validation (no authentication required)
router.post('/validate', validateCouponController);

export default router;

