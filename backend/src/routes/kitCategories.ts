import { Router } from 'express';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import {
  getKitCategoriesController,
  updateKitCategoriesController,
  getCategoryKitsController,
} from '../controllers/kitCategoriesController.js';

const router = Router();

// Get categories associated with a kit
router.get('/kits/:kitId/categories', optionalAuth, getKitCategoriesController);

// Update categories associated with a kit
router.put('/kits/:kitId/categories', authenticate, updateKitCategoriesController);

// Get kits associated with a category
router.get('/categories/:categoryId/kits', optionalAuth, getCategoryKitsController);

export default router;
