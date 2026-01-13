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
import { getEventKitsController, syncEventKitsController, reorderEventKitsController } from '../controllers/eventKitsController.js';
import { 
  getEventPickupLocationsController,
  createPickupLocationController,
  updatePickupLocationController,
  deletePickupLocationController,
} from '../controllers/kitPickupController.js';
import { getAttributeSelectionStatsController } from '../controllers/registrationProductSelectionsController.js';

const router = Router();

// Public routes with optional authentication (to identify user for filtering)
router.get('/', optionalAuth, getAllEvents);
router.get('/:eventId/categories', optionalAuth, getEventCategoriesController);
router.get('/:eventId/kits', optionalAuth, getEventKitsController);
router.get('/:eventId/pickup-locations', optionalAuth, getEventPickupLocationsController);
router.get('/:eventId/product-selection-stats', authenticate, getAttributeSelectionStatsController);
router.post('/:eventId/pickup-locations', authenticate, requireEventOwnership('eventId'), createPickupLocationController);
router.put('/:eventId/pickup-locations/:locationId', authenticate, requireEventOwnership('eventId'), updatePickupLocationController);
router.delete('/:eventId/pickup-locations/:locationId', authenticate, requireEventOwnership('eventId'), deletePickupLocationController);
router.get('/:id', optionalAuth, getEvent);

// Protected routes - require organizer or admin role
router.post('/', authenticate, requireAnyRole(['organizer', 'admin']), createEventController);
router.put('/:id', authenticate, requireEventOwnership('id'), updateEventController);
router.delete('/:id', authenticate, requireEventOwnership('id'), deleteEventController);

// Categories and kits management
router.post('/:eventId/categories', authenticate, requireEventOwnership('eventId'), syncEventCategoriesController);
router.post('/:eventId/kits', authenticate, requireEventOwnership('eventId'), syncEventKitsController);
router.put('/:eventId/kits/reorder', authenticate, requireEventOwnership('eventId'), reorderEventKitsController);

export default router;

