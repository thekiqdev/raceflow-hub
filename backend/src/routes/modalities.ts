import { Router } from 'express';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { requireAnyRole } from '../middleware/authorization.js';
import {
  createModalityController,
  getModalitiesController,
  getModalityByIdController,
  updateModalityController,
  deleteModalityController,
} from '../controllers/modalitiesController.js';

const router = Router();

// Public routes (GET) - anyone can view modalities
router.get('/event/:eventId', optionalAuth, getModalitiesController);
router.get('/:id', optionalAuth, getModalityByIdController);

// Protected routes - require organizer or admin role
router.post('/', authenticate, requireAnyRole(['organizer', 'admin']), createModalityController);
router.put('/:id', authenticate, requireAnyRole(['organizer', 'admin']), updateModalityController);
router.delete('/:id', authenticate, requireAnyRole(['organizer', 'admin']), deleteModalityController);

export default router;

