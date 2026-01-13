import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getKitCategories,
  getCategoryKits,
  associateKitToCategories,
  removeKitCategoryAssociation,
} from '../services/kitCategoriesService.js';
import { getEventKitById } from '../services/eventKitsService.js';
import { getCategoryById } from '../services/categoriesService.js';
import { getEventById } from '../services/eventsService.js';
import { hasRole } from '../services/userRolesService.js';
import { z } from 'zod';

/**
 * GET /api/kits/:kitId/categories
 * Get categories associated with a kit
 */
export const getKitCategoriesController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { kitId } = req.params;

  if (!kitId) {
    res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Kit ID is required',
    });
    return;
  }

  // Validate kit exists
  const kit = await getEventKitById(kitId);
  if (!kit) {
    res.status(404).json({
      success: false,
      error: 'Not Found',
      message: 'Kit not found',
    });
    return;
  }

  // Check permissions: user must be organizer of the event or admin
  if (req.user) {
    const event = await getEventById(kit.event_id);
    if (event && event.organizer_id !== req.user.id) {
      const isAdmin = await hasRole(req.user.id, 'admin');
      if (!isAdmin) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'You can only view categories for kits in your own events',
        });
        return;
      }
    }
  }

  const categoryIds = await getKitCategories(kitId);

  res.json({
    success: true,
    data: categoryIds,
  });
});

/**
 * PUT /api/kits/:kitId/categories
 * Update categories associated with a kit
 */
export const updateKitCategoriesController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const { kitId } = req.params;
  const { category_ids } = req.body;

  if (!kitId) {
    res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Kit ID is required',
    });
    return;
  }

  // Validate kit exists
  const kit = await getEventKitById(kitId);
  if (!kit) {
    res.status(404).json({
      success: false,
      error: 'Not Found',
      message: 'Kit not found',
    });
    return;
  }

  // Check permissions: user must be organizer of the event or admin
  const event = await getEventById(kit.event_id);
  if (!event) {
    res.status(404).json({
      success: false,
      error: 'Not Found',
      message: 'Event not found',
    });
    return;
  }

  if (event.organizer_id !== req.user.id) {
    const isAdmin = await hasRole(req.user.id, 'admin');
    if (!isAdmin) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You can only modify categories for kits in your own events',
      });
      return;
    }
  }

  // Validation schema
  const updateSchema = z.object({
    category_ids: z.array(z.string().uuid('ID da categoria inválido')).optional().nullable(),
  });

  const validation = updateSchema.safeParse({ category_ids });
  if (!validation.success) {
    res.status(400).json({
      success: false,
      error: 'Validation Error',
      message: validation.error.errors[0].message,
      errors: validation.error.errors,
    });
    return;
  }

  try {
    await associateKitToCategories(kitId, validation.data.category_ids || undefined);

    const updatedCategoryIds = await getKitCategories(kitId);

    res.json({
      success: true,
      data: updatedCategoryIds,
      message: 'Categorias do kit atualizadas com sucesso',
    });
  } catch (error: any) {
    if (error.message.includes('not found') || error.message.includes('different event')) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: error.message,
      });
      return;
    }
    throw error;
  }
});

/**
 * GET /api/categories/:categoryId/kits
 * Get kits associated with a category
 */
export const getCategoryKitsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { categoryId } = req.params;

  if (!categoryId) {
    res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Category ID is required',
    });
    return;
  }

  // Validate category exists
  const category = await getCategoryById(categoryId);
  if (!category) {
    res.status(404).json({
      success: false,
      error: 'Not Found',
      message: 'Category not found',
    });
    return;
  }

  // Check permissions: user must be organizer of the event or admin
  if (req.user) {
    const event = await getEventById(category.event_id);
    if (event && event.organizer_id !== req.user.id) {
      const isAdmin = await hasRole(req.user.id, 'admin');
      if (!isAdmin) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'You can only view kits for categories in your own events',
        });
        return;
      }
    }
  }

  const kitIds = await getCategoryKits(categoryId);

  res.json({
    success: true,
    data: kitIds,
  });
});
