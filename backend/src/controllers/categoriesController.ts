import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  createCategory,
  getCategoriesByEvent,
  getCategoriesByModality,
  getCategoryById,
  updateCategory,
  deleteCategory,
  reorderCategories,
} from '../services/categoriesService.js';
import { CreateCategoryData, UpdateCategoryData } from '../types/index.js';
import { getEventById } from '../services/eventsService.js';
import { z } from 'zod';

// Validation schemas
const createCategorySchema = z.object({
  event_id: z.string().uuid('ID do evento inválido'),
  name: z.string().min(1, 'Nome da categoria é obrigatório').max(255, 'Nome deve ter no máximo 255 caracteres'),
  price: z.number().nonnegative('Preço deve ser maior ou igual a zero'),
  category_type: z.enum(['visitante', 'local', 'geral', 'PCD', 'militar', 'civil', 'outro'], {
    errorMap: () => ({ message: 'Tipo deve ser: visitante, local, geral, PCD, militar, civil ou outro' }),
  }),
  gender: z.enum(['ambos', 'masculino', 'feminino'], {
    errorMap: () => ({ message: 'Sexo deve ser: ambos, masculino ou feminino' }),
  }),
  min_age: z.number().int().nonnegative().optional().nullable(),
  max_participants: z.number().int().positive().optional().nullable(),
  is_default: z.boolean().optional(),
  modality_ids: z.array(z.string().uuid('ID da modalidade inválido')).optional(),
});

const updateCategorySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  price: z.number().nonnegative().optional(),
  category_type: z.enum(['visitante', 'local', 'geral', 'PCD', 'militar', 'civil', 'outro']).optional(),
  gender: z.enum(['ambos', 'masculino', 'feminino']).optional(),
  min_age: z.number().int().nonnegative().optional().nullable(),
  max_participants: z.number().int().positive().optional().nullable(),
  is_default: z.boolean().optional(),
  modality_ids: z.array(z.string().uuid('ID da modalidade inválido')).optional(),
});

/**
 * POST /api/categories
 * Create a new category
 */
export const createCategoryController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    const validation = createCategorySchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error.errors[0].message,
        errors: validation.error.errors,
      });
      return;
    }

    // Verify event ownership
    const event = await getEventById(validation.data.event_id);
    if (!event) {
      res.status(404).json({
        success: false,
        error: 'Event not found',
        message: 'Evento não encontrado',
      });
      return;
    }

    // Check ownership
    if (event.organizer_id !== req.user.id) {
      const { hasRole } = await import('../services/userRolesService.js');
      const isAdmin = await hasRole(req.user.id, 'admin');
      if (!isAdmin) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Você só pode criar categorias para seus próprios eventos',
        });
        return;
      }
    }

    try {
      const categoryData: CreateCategoryData = {
        event_id: validation.data.event_id,
        name: validation.data.name,
        price: validation.data.price,
        category_type: validation.data.category_type,
        gender: validation.data.gender,
        min_age: validation.data.min_age || null,
        max_participants: validation.data.max_participants || null,
        is_default: validation.data.is_default,
        modality_ids: validation.data.modality_ids || [],
      };

      const category = await createCategory(categoryData);

      res.status(201).json({
        success: true,
        data: category,
        message: 'Categoria criada com sucesso',
      });
    } catch (error: any) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: error.message,
        });
        return;
      }
      throw error;
    }
  }
);

/**
 * GET /api/categories/event/:eventId
 * Get all categories for an event
 */
export const getCategoriesController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { eventId } = req.params;

    if (!eventId) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Event ID is required',
      });
      return;
    }

    const categories = await getCategoriesByEvent(eventId);

    res.json({
      success: true,
      data: categories,
    });
  }
);

/**
 * GET /api/categories/modality/:modalityId
 * Get all categories for a modality
 */
export const getCategoriesByModalityController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { modalityId } = req.params;

    if (!modalityId) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Modality ID is required',
      });
      return;
    }

    const categories = await getCategoriesByModality(modalityId);

    res.json({
      success: true,
      data: categories,
    });
  }
);

/**
 * GET /api/categories/:id
 * Get a category by ID
 */
export const getCategoryByIdController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Category ID is required',
      });
      return;
    }

    const category = await getCategoryById(id);

    if (!category) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Categoria não encontrada',
      });
      return;
    }

    res.json({
      success: true,
      data: category,
    });
  }
);

/**
 * PUT /api/categories/:id
 * Update a category
 */
export const updateCategoryController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Category ID is required',
      });
      return;
    }

    const validation = updateCategorySchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error.errors[0].message,
        errors: validation.error.errors,
      });
      return;
    }

    // Verify category exists and get event
    const category = await getCategoryById(id);
    if (!category) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Categoria não encontrada',
      });
      return;
    }

    // Verify event ownership
    const event = await getEventById(category.event_id);
    if (!event) {
      res.status(404).json({
        success: false,
        error: 'Event not found',
        message: 'Evento não encontrado',
      });
      return;
    }

    // Check ownership
    if (event.organizer_id !== req.user.id) {
      const { hasRole } = await import('../services/userRolesService.js');
      const isAdmin = await hasRole(req.user.id, 'admin');
      if (!isAdmin) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Você só pode editar categorias dos seus próprios eventos',
        });
        return;
      }
    }

    try {
      const updateData: UpdateCategoryData = {
        name: validation.data.name,
        price: validation.data.price,
        category_type: validation.data.category_type,
        gender: validation.data.gender,
        min_age: validation.data.min_age,
        max_participants: validation.data.max_participants,
        is_default: validation.data.is_default,
        modality_ids: validation.data.modality_ids,
      };

      console.log(`📥 [BACKEND] Recebendo atualização de categoria ${id}:`, {
        name: updateData.name,
        is_default: updateData.is_default,
        is_default_type: typeof updateData.is_default,
        is_default_value: updateData.is_default,
        all_fields: Object.keys(updateData).filter(k => updateData[k as keyof UpdateCategoryData] !== undefined)
      });

      const updatedCategory = await updateCategory(id, updateData);
      
      console.log(`📤 [BACKEND] Categoria atualizada:`, {
        id: updatedCategory?.id,
        name: updatedCategory?.name,
        is_default: updatedCategory?.is_default
      });

      if (!updatedCategory) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Categoria não encontrada',
        });
        return;
      }

      res.json({
        success: true,
        data: updatedCategory,
        message: 'Categoria atualizada com sucesso',
      });
    } catch (error: any) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: error.message,
        });
        return;
      }
      throw error;
    }
  }
);

/**
 * DELETE /api/categories/:id
 * Delete a category
 */
export const deleteCategoryController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Category ID is required',
      });
      return;
    }

    // Verify category exists and get event
    const category = await getCategoryById(id);
    if (!category) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Categoria não encontrada',
      });
      return;
    }

    // Verify event ownership
    const event = await getEventById(category.event_id);
    if (!event) {
      res.status(404).json({
        success: false,
        error: 'Event not found',
        message: 'Evento não encontrado',
      });
      return;
    }

    // Check ownership
    if (event.organizer_id !== req.user.id) {
      const { hasRole } = await import('../services/userRolesService.js');
      const isAdmin = await hasRole(req.user.id, 'admin');
      if (!isAdmin) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Você só pode excluir categorias dos seus próprios eventos',
        });
        return;
      }
    }

    try {
      const deleted = await deleteCategory(id);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Categoria não encontrada',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Categoria excluída com sucesso',
      });
    } catch (error: any) {
      if (error.message.includes('inscrição(ões) associada(s)')) {
        res.status(409).json({
          success: false,
          error: 'Conflict',
          message: error.message,
        });
        return;
      }
      throw error;
    }
  }
);

/**
 * PUT /api/categories/events/:eventId/reorder
 * Reorder categories for an event
 */
export const reorderCategoriesController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    const { eventId } = req.params;

    if (!eventId) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Event ID is required',
      });
      return;
    }

    // Validation schema
    const reorderSchema = z.object({
      categoryOrders: z.array(
        z.object({
          id: z.string().uuid('ID da categoria inválido'),
          display_order: z.number().int().positive('display_order deve ser um número inteiro positivo'),
        })
      ).min(1, 'Deve haver pelo menos uma categoria para reordenar'),
    });

    const validation = reorderSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error.errors[0].message,
        errors: validation.error.errors,
      });
      return;
    }

    // Verify event ownership
    const event = await getEventById(eventId);
    if (!event) {
      res.status(404).json({
        success: false,
        error: 'Event not found',
        message: 'Evento não encontrado',
      });
      return;
    }

    // Check ownership
    if (event.organizer_id !== req.user.id) {
      const { hasRole } = await import('../services/userRolesService.js');
      const isAdmin = await hasRole(req.user.id, 'admin');
      if (!isAdmin) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Você só pode reordenar categorias dos seus próprios eventos',
        });
        return;
      }
    }

    try {
      await reorderCategories(eventId, validation.data.categoryOrders);

      res.json({
        success: true,
        message: 'Categorias reordenadas com sucesso',
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
  }
);

