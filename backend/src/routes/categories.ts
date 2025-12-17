import { Router } from 'express';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { requireAnyRole } from '../middleware/authorization.js';
import {
  createCategoryController,
  getCategoriesController,
  getCategoriesByModalityController,
  getCategoryByIdController,
  updateCategoryController,
  deleteCategoryController,
} from '../controllers/categoriesController.js';

const router = Router();

// Public routes (GET) - anyone can view categories
router.get('/event/:eventId', optionalAuth, getCategoriesController);
router.get('/modality/:modalityId', optionalAuth, getCategoriesByModalityController);
router.get('/:id', optionalAuth, getCategoryByIdController);

// Protected routes - require organizer or admin role
router.post('/', authenticate, requireAnyRole(['organizer', 'admin']), createCategoryController);
router.put('/:id', authenticate, requireAnyRole(['organizer', 'admin']), updateCategoryController);
router.delete('/:id', authenticate, requireAnyRole(['organizer', 'admin']), deleteCategoryController);

export default router;

