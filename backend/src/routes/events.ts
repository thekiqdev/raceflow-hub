import { Router } from 'express';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { requireAnyRole } from '../middleware/authorization.js';
import { requireEventOwnership } from '../middleware/ownershipValidator.js';
import {
  getAllEvents,
  getEvent,
  createEventController,
  updateEventController,
  deleteEventController,
} from '../controllers/eventsController.js';
import { getEventCategoriesController, syncEventCategoriesController } from '../controllers/eventCategoriesController.js';
import { getEventKitsController, syncEventKitsController } from '../controllers/eventKitsController.js';
import { getEventPickupLocationsController } from '../controllers/kitPickupController.js';

const router = Router();

// Public routes with optional authentication (to identify user for filtering)
router.get('/', optionalAuth, getAllEvents);
router.get('/:eventId/categories', optionalAuth, getEventCategoriesController);
router.get('/:eventId/kits', optionalAuth, getEventKitsController);
router.get('/:eventId/pickup-locations', optionalAuth, getEventPickupLocationsController);
router.get('/:id', optionalAuth, getEvent);

// Protected routes - require organizer or admin role
router.post('/', authenticate, requireAnyRole(['organizer', 'admin']), createEventController);
router.put('/:id', authenticate, requireEventOwnership('id'), updateEventController);
router.delete('/:id', authenticate, requireEventOwnership('id'), deleteEventController);

// Categories and kits management
router.post('/:eventId/categories', authenticate, requireEventOwnership('eventId'), syncEventCategoriesController);
router.post('/:eventId/kits', authenticate, requireEventOwnership('eventId'), syncEventKitsController);

export default router;

