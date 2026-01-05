import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getFormConfigurations,
  getFormFieldConfigurationById,
  createFormFieldConfiguration,
  updateFormFieldConfiguration,
  deleteFormFieldConfiguration,
  reorderFormFields,
  bulkUpdateFormConfigurations,
} from '../services/formConfigurationsService.js';
import { z } from 'zod';
import { hasRole } from '../services/userRolesService.js';
import { query } from '../config/database.js';

const createFormFieldSchema = z.object({
  form_type: z.enum(['quote', 'contact']),
  field_key: z.string().min(1, 'Chave do campo é obrigatória'),
  field_label: z.string().min(1, 'Label do campo é obrigatório'),
  field_type: z.enum(['text', 'email', 'tel', 'textarea', 'select', 'date', 'number']),
  field_placeholder: z.string().optional(),
  field_required: z.boolean().optional(),
  field_order: z.number().optional(),
  field_width: z.enum(['100%', '50%', '33%']).optional(),
  field_options: z.any().optional(),
  field_validation: z.any().optional(),
  field_enabled: z.boolean().optional(),
});

const updateFormFieldSchema = z.object({
  field_label: z.string().min(1).optional(),
  field_type: z.enum(['text', 'email', 'tel', 'textarea', 'select', 'date', 'number']).optional(),
  field_placeholder: z.string().optional(),
  field_required: z.boolean().optional(),
  field_order: z.number().optional(),
  field_width: z.enum(['100%', '50%', '33%']).optional(),
  field_options: z.any().optional(),
  field_validation: z.any().optional(),
  field_enabled: z.boolean().optional(),
});

const reorderFieldsSchema = z.object({
  fields: z.array(z.object({
    id: z.string().uuid(),
    order: z.number(),
  })),
});

const bulkUpdateSchema = z.object({
  configurations: z.array(z.object({
    field_key: z.string().min(1, 'Chave do campo é obrigatória'),
    field_label: z.string().min(1, 'Label do campo é obrigatório'),
    field_type: z.enum(['text', 'email', 'tel', 'textarea', 'select', 'date', 'number']),
    field_placeholder: z.string().optional().nullable(),
    field_required: z.boolean(),
    field_order: z.number().int().min(0),
    field_width: z.enum(['100%', '50%', '33%']).optional().nullable(),
    field_options: z.any().optional().nullable(),
    field_validation: z.any().optional().nullable(),
    field_enabled: z.boolean(),
  })),
});

/**
 * GET /api/form-configurations/public/:formType
 * Get all enabled form field configurations for a specific form type (public endpoint)
 */
export const getPublicFormConfigurationsController = asyncHandler(async (req: any, res: Response) => {
  const { formType } = req.params;
  if (formType !== 'quote' && formType !== 'contact') {
    res.status(400).json({
      success: false,
      error: 'Invalid form type',
      message: 'Tipo de formulário deve ser "quote" ou "contact"',
    });
    return;
  }

  // Get only enabled configurations, ordered by field_order
  const result = await query(
    `SELECT 
      field_key,
      field_label,
      field_type,
      field_placeholder,
      field_required,
      field_order,
      field_width,
      field_options
    FROM form_configurations 
    WHERE form_type = $1 AND field_enabled = true
    ORDER BY field_order ASC, field_key ASC`,
    [formType]
  );

  const configurations = result.rows.map((row) => ({
    field_key: row.field_key,
    field_label: row.field_label,
    field_type: row.field_type,
    field_placeholder: row.field_placeholder,
    field_required: row.field_required,
    field_order: row.field_order,
    field_width: row.field_width || '100%',
    field_options: row.field_options,
  }));

  res.json({
    success: true,
    data: configurations,
  });
});

/**
 * GET /api/form-configurations/:formType
 * Get all form field configurations for a specific form type (admin only)
 */
export const getFormConfigurationsController = asyncHandler(async (req: AuthRequest, res: Response) => {
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
      message: 'Apenas administradores podem visualizar configurações de formulários',
    });
    return;
  }

  const { formType } = req.params;
  if (formType !== 'quote' && formType !== 'contact') {
    res.status(400).json({
      success: false,
      error: 'Invalid form type',
      message: 'Tipo de formulário deve ser "quote" ou "contact"',
    });
    return;
  }

  const configurations = await getFormConfigurations(formType);

  res.json({
    success: true,
    data: configurations,
  });
});

/**
 * GET /api/form-configurations/:formType/:id
 * Get a single form field configuration (admin only)
 */
export const getFormFieldConfigurationByIdController = asyncHandler(async (req: AuthRequest, res: Response) => {
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
      message: 'Apenas administradores podem visualizar configurações de formulários',
    });
    return;
  }

  const { id } = req.params;
  const configuration = await getFormFieldConfigurationById(id);

  if (!configuration) {
    res.status(404).json({
      success: false,
      error: 'Not Found',
      message: 'Configuração não encontrada',
    });
    return;
  }

  res.json({
    success: true,
    data: configuration,
  });
});

/**
 * POST /api/form-configurations
 * Create a new form field configuration (admin only)
 */
export const createFormFieldConfigurationController = asyncHandler(async (req: AuthRequest, res: Response) => {
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
      message: 'Apenas administradores podem criar configurações de formulários',
    });
    return;
  }

  const validation = createFormFieldSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: validation.error.errors[0].message,
      details: validation.error.errors,
    });
    return;
  }

  const configuration = await createFormFieldConfiguration(validation.data);

  res.json({
    success: true,
    data: configuration,
    message: 'Configuração criada com sucesso',
  });
});

/**
 * PUT /api/form-configurations/:id
 * Update a form field configuration (admin only)
 */
export const updateFormFieldConfigurationController = asyncHandler(async (req: AuthRequest, res: Response) => {
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
      message: 'Apenas administradores podem atualizar configurações de formulários',
    });
    return;
  }

  const { id } = req.params;
  const validation = updateFormFieldSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: validation.error.errors[0].message,
      details: validation.error.errors,
    });
    return;
  }

  const configuration = await updateFormFieldConfiguration(id, validation.data);

  res.json({
    success: true,
    data: configuration,
    message: 'Configuração atualizada com sucesso',
  });
});

/**
 * DELETE /api/form-configurations/:id
 * Delete a form field configuration (admin only)
 */
export const deleteFormFieldConfigurationController = asyncHandler(async (req: AuthRequest, res: Response) => {
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
      message: 'Apenas administradores podem excluir configurações de formulários',
    });
    return;
  }

  const { id } = req.params;
  await deleteFormFieldConfiguration(id);

  res.json({
    success: true,
    message: 'Configuração excluída com sucesso',
  });
});

/**
 * PUT /api/form-configurations/:formType/reorder
 * Reorder form field configurations (admin only)
 */
export const reorderFormFieldsController = asyncHandler(async (req: AuthRequest, res: Response) => {
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
      message: 'Apenas administradores podem reordenar campos de formulários',
    });
    return;
  }

  const { formType } = req.params;
  if (formType !== 'quote' && formType !== 'contact') {
    res.status(400).json({
      success: false,
      error: 'Invalid form type',
      message: 'Tipo de formulário deve ser "quote" ou "contact"',
    });
    return;
  }

  const validation = reorderFieldsSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: validation.error.errors[0].message,
      details: validation.error.errors,
    });
    return;
  }

  await reorderFormFields(formType, validation.data.fields);

  res.json({
    success: true,
    message: 'Ordem dos campos atualizada com sucesso',
  });
});

/**
 * PUT /api/form-configurations/:formType/bulk-update
 * Bulk update form field configurations (admin only)
 */
export const bulkUpdateFormConfigurationsController = asyncHandler(async (req: AuthRequest, res: Response) => {
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
      message: 'Apenas administradores podem atualizar configurações de formulários',
    });
    return;
  }

  const { formType } = req.params;
  if (formType !== 'quote' && formType !== 'contact') {
    res.status(400).json({
      success: false,
      error: 'Invalid form type',
      message: 'Tipo de formulário deve ser "quote" ou "contact"',
    });
    return;
  }

  console.log('Bulk update request body:', JSON.stringify(req.body, null, 2));
  
  const validation = bulkUpdateSchema.safeParse(req.body);
  if (!validation.success) {
    console.error('Bulk update validation error:', JSON.stringify(validation.error.errors, null, 2));
    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: validation.error.errors[0]?.message || 'Erro de validação',
      details: validation.error.errors,
    });
    return;
  }

  const configurations = await bulkUpdateFormConfigurations(formType, validation.data.configurations);

  res.json({
    success: true,
    data: configurations,
    message: 'Configurações atualizadas com sucesso',
  });
});

