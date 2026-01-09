import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getCategoryBatches,
  getActiveBatches,
  createCategoryBatch,
  updateCategoryBatch,
  deleteCategoryBatch,
} from '../services/categoriesService.js';
import { getCategoryById } from '../services/categoriesService.js';
import { z } from 'zod';

// Validation schemas
const createBatchSchema = z.object({
  name: z.string().max(255, 'Nome deve ter no máximo 255 caracteres').optional().nullable(),
  price: z.number().nonnegative('Preço deve ser maior ou igual a zero'),
  valid_from: z.string().optional().nullable().or(z.null()),
  valid_to: z.string().optional().nullable().or(z.null()),
}).refine(
  (data) => {
    // Se ambos valid_from e valid_to estão definidos, valid_to deve ser >= valid_from
    if (data.valid_from && data.valid_to) {
      const from = new Date(data.valid_from);
      const to = new Date(data.valid_to);
      if (isNaN(from.getTime()) || isNaN(to.getTime())) {
        return false;
      }
      return to >= from;
    }
    return true;
  },
  {
    message: 'Data de término deve ser maior ou igual à data de início',
    path: ['valid_to'],
  }
);

const updateBatchSchema = z.object({
  name: z.string().max(255, 'Nome deve ter no máximo 255 caracteres').optional().nullable(),
  price: z.number().nonnegative('Preço deve ser maior ou igual a zero').optional(),
  valid_from: z.string().optional().nullable().or(z.null()),
  valid_to: z.string().optional().nullable().or(z.null()),
}).refine(
  (data) => {
    // Se ambos valid_from e valid_to estão definidos, valid_to deve ser >= valid_from
    if (data.valid_from && data.valid_to) {
      const from = new Date(data.valid_from);
      const to = new Date(data.valid_to);
      if (isNaN(from.getTime()) || isNaN(to.getTime())) {
        return false;
      }
      return to >= from;
    }
    return true;
  },
  {
    message: 'Data de término deve ser maior ou igual à data de início',
    path: ['valid_to'],
  }
);

/**
 * GET /api/categories/:categoryId/batches
 * Get all batches for a category
 */
export const getCategoryBatchesController = asyncHandler(
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

    // Verificar se a categoria existe
    const category = await getCategoryById(categoryId);
    if (!category) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Categoria não encontrada',
      });
      return;
    }

    // Verificar se o usuário tem permissão (organizador do evento ou admin)
    if (req.user) {
      const { getEventById } = await import('../services/eventsService.js');
      const event = await getEventById(category.event_id);
      
      if (event && event.organizer_id !== req.user.id) {
        const { hasRole } = await import('../services/userRolesService.js');
        const isAdmin = await hasRole(req.user.id, 'admin');
        if (!isAdmin) {
          res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: 'Você não tem permissão para acessar os lotes desta categoria',
          });
          return;
        }
      }
    }

    const batches = await getCategoryBatches(categoryId);

    res.json({
      success: true,
      data: batches,
    });
  }
);

/**
 * GET /api/categories/:categoryId/batches/active
 * Get active batches for a category
 */
export const getActiveBatchesController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { categoryId } = req.params;
    const { date } = req.query;

    if (!categoryId) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'ID da categoria é obrigatório',
      });
      return;
    }

    // Verificar se a categoria existe
    const category = await getCategoryById(categoryId);
    if (!category) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Categoria não encontrada',
      });
      return;
    }

    // Parse date if provided, otherwise use current date
    const atDate = date ? new Date(date as string) : new Date();

    const batches = await getActiveBatches(categoryId, atDate);

    res.json({
      success: true,
      data: batches,
    });
  }
);

/**
 * POST /api/categories/:categoryId/batches
 * Create a new batch for a category
 */
export const createCategoryBatchController = asyncHandler(
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

    // Verificar se a categoria existe e se o usuário tem permissão
    const category = await getCategoryById(categoryId);
    if (!category) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Categoria não encontrada',
      });
      return;
    }

    // Verificar ownership do evento
    const { getEventById } = await import('../services/eventsService.js');
    const event = await getEventById(category.event_id);
    
    if (!event) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Evento não encontrado',
      });
      return;
    }

    if (event.organizer_id !== req.user.id) {
      const { hasRole } = await import('../services/userRolesService.js');
      const isAdmin = await hasRole(req.user.id, 'admin');
      if (!isAdmin) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Você só pode criar lotes para categorias dos seus próprios eventos',
        });
        return;
      }
    }

    // Validar dados
    const validation = createBatchSchema.safeParse(req.body);

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
      // Converter strings de data para Date ou null
      let validFrom: Date | null = null;
      let validTo: Date | null = null;

      if (validation.data.valid_from && validation.data.valid_from !== 'null' && validation.data.valid_from.trim() !== '') {
        const dateFrom = new Date(validation.data.valid_from);
        if (!isNaN(dateFrom.getTime())) {
          validFrom = dateFrom;
        }
      }

      if (validation.data.valid_to && validation.data.valid_to !== 'null' && validation.data.valid_to.trim() !== '') {
        const dateTo = new Date(validation.data.valid_to);
        if (!isNaN(dateTo.getTime())) {
          validTo = dateTo;
        }
      }

      console.log('📅 Criando batch com datas:', {
        valid_from_input: validation.data.valid_from,
        valid_to_input: validation.data.valid_to,
        valid_from_parsed: validFrom,
        valid_to_parsed: validTo,
      });

      const batch = await createCategoryBatch({
        category_id: categoryId,
        name: validation.data.name || null,
        price: validation.data.price,
        valid_from: validFrom,
        valid_to: validTo,
      });

      res.status(201).json({
        success: true,
        data: batch,
        message: 'Lote criado com sucesso',
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
 * PUT /api/categories/:categoryId/batches/:batchId
 * Update a batch
 */
export const updateCategoryBatchController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
        message: 'Usuário não autenticado',
      });
      return;
    }

    const { categoryId, batchId } = req.params;

    if (!categoryId || !batchId) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'ID da categoria e do lote são obrigatórios',
      });
      return;
    }

    // Verificar se a categoria existe e se o usuário tem permissão
    const category = await getCategoryById(categoryId);
    if (!category) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Categoria não encontrada',
      });
      return;
    }

    // Verificar ownership do evento
    const { getEventById } = await import('../services/eventsService.js');
    const event = await getEventById(category.event_id);
    
    if (!event) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Evento não encontrado',
      });
      return;
    }

    if (event.organizer_id !== req.user.id) {
      const { hasRole } = await import('../services/userRolesService.js');
      const isAdmin = await hasRole(req.user.id, 'admin');
      if (!isAdmin) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Você só pode atualizar lotes de categorias dos seus próprios eventos',
        });
        return;
      }
    }

    // Validar dados
    const validation = updateBatchSchema.safeParse(req.body);

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
      // Converter strings de data para Date ou null (se fornecidas)
      const updateData: {
        name?: string | null;
        price?: number;
        valid_from?: Date | null;
        valid_to?: Date | null;
      } = {};

      if (validation.data.name !== undefined) {
        updateData.name = validation.data.name;
      }
      if (validation.data.price !== undefined) {
        updateData.price = validation.data.price;
      }
      if (validation.data.valid_from !== undefined) {
        if (validation.data.valid_from && validation.data.valid_from !== 'null' && validation.data.valid_from.trim() !== '') {
          const dateFrom = new Date(validation.data.valid_from);
          updateData.valid_from = !isNaN(dateFrom.getTime()) ? dateFrom : null;
        } else {
          updateData.valid_from = null;
        }
      }
      if (validation.data.valid_to !== undefined) {
        if (validation.data.valid_to && validation.data.valid_to !== 'null' && validation.data.valid_to.trim() !== '') {
          const dateTo = new Date(validation.data.valid_to);
          updateData.valid_to = !isNaN(dateTo.getTime()) ? dateTo : null;
        } else {
          updateData.valid_to = null;
        }
      }

      console.log('📅 Atualizando batch com datas:', {
        batch_id: batchId,
        valid_from_input: validation.data.valid_from,
        valid_to_input: validation.data.valid_to,
        valid_from_parsed: updateData.valid_from,
        valid_to_parsed: updateData.valid_to,
      });

      const batch = await updateCategoryBatch(batchId, updateData);

      if (!batch) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Lote não encontrado',
        });
        return;
      }

      res.json({
        success: true,
        data: batch,
        message: 'Lote atualizado com sucesso',
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
 * DELETE /api/categories/:categoryId/batches/:batchId
 * Delete a batch
 */
export const deleteCategoryBatchController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
        message: 'Usuário não autenticado',
      });
      return;
    }

    const { categoryId, batchId } = req.params;

    if (!categoryId || !batchId) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'ID da categoria e do lote são obrigatórios',
      });
      return;
    }

    // Verificar se a categoria existe e se o usuário tem permissão
    const category = await getCategoryById(categoryId);
    if (!category) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Categoria não encontrada',
      });
      return;
    }

    // Verificar ownership do evento
    const { getEventById } = await import('../services/eventsService.js');
    const event = await getEventById(category.event_id);
    
    if (!event) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Evento não encontrado',
      });
      return;
    }

    if (event.organizer_id !== req.user.id) {
      const { hasRole } = await import('../services/userRolesService.js');
      const isAdmin = await hasRole(req.user.id, 'admin');
      if (!isAdmin) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Você só pode deletar lotes de categorias dos seus próprios eventos',
        });
        return;
      }
    }

    const deleted = await deleteCategoryBatch(batchId);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Lote não encontrado',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Lote deletado com sucesso',
    });
  }
);
