import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getNotificationTemplates,
  getNotificationTemplateById,
  getNotificationTemplateByKey,
  createNotificationTemplate,
  updateNotificationTemplate,
  deleteNotificationTemplate,
  initializeDefaultTemplates,
} from '../services/notificationTemplatesService.js';
import { z } from 'zod';
import { hasRole } from '../services/userRolesService.js';

const createNotificationTemplateSchema = z.object({
  template_key: z.string().min(1, 'Chave do template é obrigatória'),
  template_name: z.string().min(1, 'Nome do template é obrigatório'),
  template_type: z.enum(['email', 'sms', 'push', 'in_app']),
  target_audience: z.enum(['admin', 'organizer', 'runner', 'all']),
  subject: z.string().optional().nullable(),
  body_html: z.string().optional().nullable(),
  body_text: z.string().optional().nullable(),
  variables: z.record(z.any()).optional(),
  is_active: z.boolean().optional(),
  is_system: z.boolean().optional(),
});

const updateNotificationTemplateSchema = z.object({
  template_name: z.string().min(1).optional(),
  template_type: z.enum(['email', 'sms', 'push', 'in_app']).optional(),
  target_audience: z.enum(['admin', 'organizer', 'runner', 'all']).optional(),
  subject: z.string().optional().nullable(),
  body_html: z.string().optional().nullable(),
  body_text: z.string().optional().nullable(),
  variables: z.record(z.any()).optional(),
  is_active: z.boolean().optional(),
});

/**
 * GET /api/notification-templates
 * Get all notification templates (admin only)
 */
export const getNotificationTemplatesController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  if (!isAdmin) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas administradores podem visualizar templates de notificação',
    });
    return;
  }

  const filters: any = {};
  if (req.query.template_type) {
    filters.template_type = req.query.template_type as 'email' | 'sms' | 'push' | 'in_app';
  }
  if (req.query.target_audience) {
    filters.target_audience = req.query.target_audience as 'admin' | 'organizer' | 'runner' | 'all';
  }
  if (req.query.is_active !== undefined) {
    filters.is_active = req.query.is_active === 'true';
  }

  const templates = await getNotificationTemplates(filters);

  res.json({
    success: true,
    data: templates,
  });
});

/**
 * GET /api/notification-templates/:id
 * Get notification template by ID (admin only)
 */
export const getNotificationTemplateByIdController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  if (!isAdmin) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas administradores podem visualizar templates de notificação',
    });
    return;
  }

  const { id } = req.params;
  const template = await getNotificationTemplateById(id);

  if (!template) {
    res.status(404).json({
      success: false,
      error: 'Not Found',
      message: 'Template de notificação não encontrado',
    });
    return;
  }

  res.json({
    success: true,
    data: template,
  });
});

/**
 * GET /api/notification-templates/key/:templateKey
 * Get notification template by key (admin only)
 */
export const getNotificationTemplateByKeyController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  if (!isAdmin) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas administradores podem visualizar templates de notificação',
    });
    return;
  }

  const { templateKey } = req.params;
  const template = await getNotificationTemplateByKey(templateKey);

  if (!template) {
    res.status(404).json({
      success: false,
      error: 'Not Found',
      message: 'Template de notificação não encontrado',
    });
    return;
  }

  res.json({
    success: true,
    data: template,
  });
});

/**
 * POST /api/notification-templates
 * Create a new notification template (admin only)
 */
export const createNotificationTemplateController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  if (!isAdmin) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas administradores podem criar templates de notificação',
    });
    return;
  }

  const validation = createNotificationTemplateSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: validation.error.errors[0].message,
      details: validation.error.errors,
    });
    return;
  }

  // Check if template_key already exists
  const existing = await getNotificationTemplateByKey(validation.data.template_key);
  if (existing) {
    res.status(400).json({
      success: false,
      error: 'Duplicate key',
      message: 'Já existe um template com esta chave',
    });
    return;
  }

  const template = await createNotificationTemplate(validation.data);

  res.status(201).json({
    success: true,
    data: template,
    message: 'Template de notificação criado com sucesso',
  });
});

/**
 * PUT /api/notification-templates/:id
 * Update notification template (admin only)
 */
export const updateNotificationTemplateController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  if (!isAdmin) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas administradores podem atualizar templates de notificação',
    });
    return;
  }

  const { id } = req.params;
  const validation = updateNotificationTemplateSchema.safeParse(req.body);
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
    const template = await updateNotificationTemplate(id, validation.data);

    res.json({
      success: true,
      data: template,
      message: 'Template de notificação atualizado com sucesso',
    });
  } catch (error: any) {
    if (error.message === 'Template not found') {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Template de notificação não encontrado',
      });
      return;
    }
    throw error;
  }
});

/**
 * DELETE /api/notification-templates/:id
 * Delete notification template (admin only)
 */
export const deleteNotificationTemplateController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  if (!isAdmin) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas administradores podem deletar templates de notificação',
    });
    return;
  }

  const { id } = req.params;

  try {
    await deleteNotificationTemplate(id);

    res.json({
      success: true,
      message: 'Template de notificação deletado com sucesso',
    });
  } catch (error: any) {
    if (error.message === 'Template not found') {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Template de notificação não encontrado',
      });
      return;
    }
    if (error.message === 'Cannot delete system templates') {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Não é possível deletar templates do sistema',
      });
      return;
    }
    throw error;
  }
});

/**
 * POST /api/notification-templates/initialize
 * Initialize default templates (admin only)
 */
export const initializeDefaultTemplatesController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  if (!isAdmin) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas administradores podem inicializar templates padrão',
    });
    return;
  }

  await initializeDefaultTemplates();

  res.json({
    success: true,
    message: 'Templates padrão inicializados com sucesso',
  });
});

