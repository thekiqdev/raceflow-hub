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
  reorderCategoriesController,
} from '../controllers/categoriesController.js';
import {
  getCategoryBatchesController,
  getActiveBatchesController,
  createCategoryBatchController,
  updateCategoryBatchController,
  deleteCategoryBatchController,
} from '../controllers/categoryBatchesController.js';
import {
  getCategoryCustomFieldsController,
  createCategoryCustomFieldController,
  updateCategoryCustomFieldController,
  deleteCategoryCustomFieldController,
} from '../controllers/categoryCustomFieldsController.js';

const router = Router();

// Public routes (GET) - anyone can view categories
router.get('/event/:eventId', optionalAuth, getCategoriesController);
router.get('/modality/:modalityId', optionalAuth, getCategoriesByModalityController);
router.get('/:id', optionalAuth, getCategoryByIdController);

// Protected routes - require organizer or admin role
router.post('/', authenticate, requireAnyRole(['organizer', 'admin']), createCategoryController);
router.put('/:id', authenticate, requireAnyRole(['organizer', 'admin']), updateCategoryController);
router.delete('/:id', authenticate, requireAnyRole(['organizer', 'admin']), deleteCategoryController);
router.put('/events/:eventId/reorder', authenticate, requireAnyRole(['organizer', 'admin']), reorderCategoriesController);

// Category Batches routes
// Public routes (GET) - anyone can view batches
router.get('/:categoryId/batches', optionalAuth, getCategoryBatchesController);
router.get('/:categoryId/batches/active', optionalAuth, getActiveBatchesController);

// Protected routes - require organizer or admin role
router.post('/:categoryId/batches', authenticate, requireAnyRole(['organizer', 'admin']), createCategoryBatchController);
router.put('/:categoryId/batches/:batchId', authenticate, requireAnyRole(['organizer', 'admin']), updateCategoryBatchController);
router.delete('/:categoryId/batches/:batchId', authenticate, requireAnyRole(['organizer', 'admin']), deleteCategoryBatchController);

// Category custom fields (campos personalizados por categoria)
router.get('/:categoryId/custom-fields', optionalAuth, getCategoryCustomFieldsController);
router.post('/:categoryId/custom-fields', authenticate, requireAnyRole(['organizer', 'admin']), createCategoryCustomFieldController);
router.put('/:categoryId/custom-fields/:fieldId', authenticate, requireAnyRole(['organizer', 'admin']), updateCategoryCustomFieldController);
router.delete('/:categoryId/custom-fields/:fieldId', authenticate, requireAnyRole(['organizer', 'admin']), deleteCategoryCustomFieldController);

export default router;

