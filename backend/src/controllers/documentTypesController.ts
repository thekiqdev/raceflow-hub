import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getAllDocumentTypes,
  getActiveDocumentTypes,
  getDocumentTypeById,
  createDocumentType,
  updateDocumentType,
  deleteDocumentType,
  CreateDocumentTypeData,
  UpdateDocumentTypeData,
} from '../services/documentTypesService.js';
import { hasRole } from '../services/userRolesService.js';
import { z } from 'zod';

// Validation schemas
const createDocumentTypeSchema = z.object({
  code: z.string()
    .min(1, 'Código é obrigatório')
    .max(50, 'Código deve ter no máximo 50 caracteres')
    .regex(/^[a-z0-9_]+$/, 'Código deve conter apenas letras minúsculas, números e underscore'),
  name: z.string()
    .min(1, 'Nome é obrigatório')
    .max(100, 'Nome deve ter no máximo 100 caracteres'),
  description: z.string().max(500, 'Descrição deve ter no máximo 500 caracteres').optional().nullable(),
  requires_expiry_date: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
  display_order: z.number().int().min(0).optional().default(0),
});

const updateDocumentTypeSchema = z.object({
  name: z.string()
    .min(1, 'Nome é obrigatório')
    .max(100, 'Nome deve ter no máximo 100 caracteres')
    .optional(),
  description: z.string().max(500, 'Descrição deve ter no máximo 500 caracteres').optional().nullable(),
  requires_expiry_date: z.boolean().optional(),
  is_active: z.boolean().optional(),
  display_order: z.number().int().min(0).optional(),
});

/**
 * GET /api/admin/document-types
 * Get all document types (admin only)
 */
export const getAllDocumentTypesController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
        message: 'Usuário não autenticado',
      });
      return;
    }

    const isAdmin = await hasRole(req.user.id, 'admin');
    if (!isAdmin) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Apenas administradores podem visualizar tipos de documentos',
      });
      return;
    }

    const documentTypes = await getAllDocumentTypes();

    res.json({
      success: true,
      data: documentTypes,
    });
  }
);

/**
 * GET /api/document-types/active
 * Get active document types (public endpoint for runners)
 */
export const getActiveDocumentTypesController = asyncHandler(
  async (_req: AuthRequest, res: Response) => {
    const documentTypes = await getActiveDocumentTypes();

    res.json({
      success: true,
      data: documentTypes,
    });
  }
);

/**
 * GET /api/admin/document-types/:id
 * Get a specific document type by ID (admin only)
 */
export const getDocumentTypeByIdController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
        message: 'Usuário não autenticado',
      });
      return;
    }

    const isAdmin = await hasRole(req.user.id, 'admin');
    if (!isAdmin) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Apenas administradores podem visualizar tipos de documentos',
      });
      return;
    }

    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'ID do tipo de documento é obrigatório',
      });
      return;
    }

    const documentType = await getDocumentTypeById(id);

    if (!documentType) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Tipo de documento não encontrado',
      });
      return;
    }

    res.json({
      success: true,
      data: documentType,
    });
  }
);

/**
 * POST /api/admin/document-types
 * Create a new document type (admin only)
 */
export const createDocumentTypeController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
        message: 'Usuário não autenticado',
      });
      return;
    }

    const isAdmin = await hasRole(req.user.id, 'admin');
    if (!isAdmin) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Apenas administradores podem criar tipos de documentos',
      });
      return;
    }

    const validation = createDocumentTypeSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        message: validation.error.errors[0].message,
        details: validation.error.errors,
      });
      return;
    }

    try {
      const documentType = await createDocumentType(validation.data);

      res.status(201).json({
        success: true,
        data: documentType,
        message: 'Tipo de documento criado com sucesso',
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: error.message || 'Erro ao criar tipo de documento',
      });
    }
  }
);

/**
 * PUT /api/admin/document-types/:id
 * Update a document type (admin only)
 */
export const updateDocumentTypeController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
        message: 'Usuário não autenticado',
      });
      return;
    }

    const isAdmin = await hasRole(req.user.id, 'admin');
    if (!isAdmin) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Apenas administradores podem atualizar tipos de documentos',
      });
      return;
    }

    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'ID do tipo de documento é obrigatório',
      });
      return;
    }

    const validation = updateDocumentTypeSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        message: validation.error.errors[0].message,
        details: validation.error.errors,
      });
      return;
    }

    const documentType = await updateDocumentType(id, validation.data);

    if (!documentType) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Tipo de documento não encontrado',
      });
      return;
    }

    res.json({
      success: true,
      data: documentType,
      message: 'Tipo de documento atualizado com sucesso',
    });
  }
);

/**
 * DELETE /api/admin/document-types/:id
 * Delete a document type (admin only)
 */
export const deleteDocumentTypeController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
        message: 'Usuário não autenticado',
      });
      return;
    }

    const isAdmin = await hasRole(req.user.id, 'admin');
    if (!isAdmin) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Apenas administradores podem deletar tipos de documentos',
      });
      return;
    }

    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'ID do tipo de documento é obrigatório',
      });
      return;
    }

    // Check if document type exists
    const documentType = await getDocumentTypeById(id);
    if (!documentType) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Tipo de documento não encontrado',
      });
      return;
    }

    try {
      const deleted = await deleteDocumentType(id);

      if (!deleted) {
        res.status(500).json({
          success: false,
          error: 'Server Error',
          message: 'Erro ao deletar tipo de documento',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Tipo de documento deletado com sucesso',
      });
    } catch (error: any) {
      // Check if error is due to foreign key constraint
      if (error.message && error.message.includes('foreign key')) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Não é possível deletar este tipo de documento pois existem documentos associados a ele',
        });
        return;
      }

      throw error;
    }
  }
);
