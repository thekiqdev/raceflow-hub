import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getByCategoryId,
  getById,
  create,
  update,
  deleteById,
} from '../services/categoryCustomFieldsService.js';
import { getCategoryById } from '../services/categoriesService.js';
import { z } from 'zod';

/** Helper: ensure user can manage this category (organizer of event or admin) */
async function ensureCategoryOwnership(req: AuthRequest, categoryId: string): Promise<void> {
  if (!req.user) {
    const err = new Error('Not authenticated') as Error & { statusCode?: number };
    err.statusCode = 401;
    throw err;
  }
  const category = await getCategoryById(categoryId);
  if (!category) {
    const err = new Error('Categoria não encontrada') as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }
  const { getEventById } = await import('../services/eventsService.js');
  const event = await getEventById(category.event_id);
  if (!event) {
    const err = new Error('Evento não encontrado') as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }
  if (event.organizer_id !== req.user.id) {
    const { hasRole } = await import('../services/userRolesService.js');
    const isAdmin = await hasRole(req.user.id, 'admin');
    if (!isAdmin) {
      const err = new Error('Você não tem permissão para gerenciar campos desta categoria') as Error & { statusCode?: number };
      err.statusCode = 403;
      throw err;
    }
  }
}

const createSchema = z.object({
  label: z.string().min(1, 'Nome do campo é obrigatório').max(255, 'Nome deve ter no máximo 255 caracteres').transform((s) => s.trim()),
  field_type: z.enum(['text', 'number'], { message: 'Tipo deve ser "text" ou "number"' }),
  display_order: z.number().int().min(0).optional(),
});

const updateSchema = z.object({
  label: z.string().min(1).max(255).transform((s) => s.trim()).optional(),
  field_type: z.enum(['text', 'number']).optional(),
  display_order: z.number().int().min(0).optional(),
});

/**
 * GET /api/categories/:categoryId/custom-fields
 * List custom fields for a category
 */
export const getCategoryCustomFieldsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { categoryId } = req.params;
    if (!categoryId) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'ID da categoria é obrigatório',
      });
      return;
    }
    const category = await getCategoryById(categoryId);
    if (!category) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Categoria não encontrada',
      });
      return;
    }
    // Public read: anyone can list custom fields (needed for registration form)
    const fields = await getByCategoryId(categoryId);
    res.json({
      success: true,
      data: fields,
    });
  }
);

/**
 * POST /api/categories/:categoryId/custom-fields
 * Create a custom field for a category
 */
export const createCategoryCustomFieldController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
        message: 'Usuário não autenticado',
      });
      return;
    }
    const { categoryId } = req.params;
    if (!categoryId) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'ID da categoria é obrigatório',
      });
      return;
    }
    await ensureCategoryOwnership(req, categoryId);

    const validation = createSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error.errors[0]?.message ?? 'Dados inválidos',
        errors: validation.error.errors,
      });
      return;
    }

    const field = await create({
      category_id: categoryId,
      label: validation.data.label,
      field_type: validation.data.field_type,
      display_order: validation.data.display_order,
    });

    res.status(201).json({
      success: true,
      data: field,
      message: 'Campo personalizado criado com sucesso',
    });
  }
);

/**
 * PUT /api/categories/:categoryId/custom-fields/:fieldId
 * Update a custom field
 */
export const updateCategoryCustomFieldController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
        message: 'Usuário não autenticado',
      });
      return;
    }
    const { categoryId, fieldId } = req.params;
    if (!categoryId || !fieldId) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'ID da categoria e do campo são obrigatórios',
      });
      return;
    }
    await ensureCategoryOwnership(req, categoryId);

    const existing = await getById(fieldId);
    if (!existing || existing.category_id !== categoryId) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Campo personalizado não encontrado',
      });
      return;
    }

    const validation = updateSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error.errors[0]?.message ?? 'Dados inválidos',
        errors: validation.error.errors,
      });
      return;
    }

    if (Object.keys(validation.data).length === 0) {
      res.json({ success: true, data: existing, message: 'Nenhuma alteração' });
      return;
    }

    const updated = await update(fieldId, validation.data);
    res.json({
      success: true,
      data: updated,
      message: 'Campo personalizado atualizado com sucesso',
    });
  }
);

/**
 * DELETE /api/categories/:categoryId/custom-fields/:fieldId
 * Delete a custom field
 */
export const deleteCategoryCustomFieldController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
        message: 'Usuário não autenticado',
      });
      return;
    }
    const { categoryId, fieldId } = req.params;
    if (!categoryId || !fieldId) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'ID da categoria e do campo são obrigatórios',
      });
      return;
    }
    await ensureCategoryOwnership(req, categoryId);

    const existing = await getById(fieldId);
    if (!existing || existing.category_id !== categoryId) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Campo personalizado não encontrado',
      });
      return;
    }

    await deleteById(fieldId);
    res.json({
      success: true,
      message: 'Campo personalizado removido com sucesso',
    });
  }
);
