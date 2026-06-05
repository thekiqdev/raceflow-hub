import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getEventKits, syncEventKits, reorderEventKits } from '../services/eventKitsService.js';
import { getEventById } from '../services/eventsService.js';
import { hasRole } from '../services/userRolesService.js';
import { z } from 'zod';

async function shouldFilterVisibleKitsOnly(req: AuthRequest, eventId: string): Promise<boolean> {
  if (!req.user) return true;

  const event = await getEventById(eventId);
  if (!event) return true;

  if (event.organizer_id === req.user.id) return false;

  const isAdmin = await hasRole(req.user.id, 'admin');
  return !isAdmin;
}

type KitsRequestContext = 'public' | 'management';

async function resolveVisibleOnlyFromQuery(
  context: unknown,
  req: AuthRequest,
  eventId: string
): Promise<boolean> {
  if (context === 'public') return true;
  if (context === 'management') return false;
  return shouldFilterVisibleKitsOnly(req, eventId);
}

/**
 * GET /api/events/:eventId/kits
 * Get all kits for an event
 * Query params:
 *   category_id (optional) - Filter kits by category
 *   context (optional) - public | management (default: legacy auth-based behavior)
 */
export const getEventKitsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { eventId } = req.params;
  const { category_id, context } = req.query;

  if (!eventId) {
    res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Event ID is required',
    });
    return;
  }

  // Validate category_id if provided
  if (category_id && typeof category_id === 'string') {
    const uuidSchema = z.string().uuid('ID da categoria inválido');
    const validation = uuidSchema.safeParse(category_id);
    
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error.errors[0].message,
      });
      return;
    }
  }

  if (context !== undefined && context !== 'public' && context !== 'management') {
    res.status(400).json({
      success: false,
      error: 'Validation Error',
      message: 'context deve ser "public" ou "management"',
    });
    return;
  }

  const kits = await getEventKits(eventId, category_id as string | undefined, {
    visibleOnly: await resolveVisibleOnlyFromQuery(context as KitsRequestContext | undefined, req, eventId),
  });

  res.json({
    success: true,
    data: kits,
  });
});

/**
 * POST /api/events/:eventId/kits
 * Sync (create/update/delete) kits for an event
 */
export const syncEventKitsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const { eventId } = req.params;
  const { kits } = req.body;

  if (!eventId) {
    res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Event ID is required',
    });
    return;
  }

  if (!Array.isArray(kits)) {
    res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Kits must be an array',
    });
    return;
  }

  // Validation schema for sync kits
  const syncKitSchema = z.object({
    id: z.string().uuid('ID do kit inválido').optional(),
    name: z.string().min(1, 'Nome do kit é obrigatório'),
    description: z.string().nullable().optional(),
    price: z.number().nonnegative('Preço deve ser maior ou igual a zero'),
    display_order: z.number().int().nonnegative('display_order deve ser um número inteiro não negativo').optional(),
    category_ids: z.array(z.string().uuid('ID da categoria inválido')).optional(),
    is_visible: z.boolean().optional(),
    products: z.array(z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1),
      description: z.string().nullable().optional(),
      type: z.enum(['variable', 'unique']),
      image_url: z.string().nullable().optional(),
      variant_attributes: z.array(z.string()).nullable().optional(),
      variants: z.array(z.object({
        id: z.string().uuid().optional(),
        name: z.string().min(1),
        variant_group_name: z.string().nullable().optional(),
        available_quantity: z.number().int().nonnegative().nullable().optional(),
        sku: z.string().nullable().optional(),
      })).optional(),
    })).optional(),
  });

  // Validate each kit
  for (let i = 0; i < kits.length; i++) {
    const validation = syncKitSchema.safeParse(kits[i]);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: `Erro de validação no kit ${i + 1}: ${validation.error.errors[0].message}`,
        errors: validation.error.errors,
      });
      return;
    }
  }

  // Verify event ownership
  const event = await getEventById(eventId);
  if (!event) {
    res.status(404).json({
      success: false,
      error: 'Event not found',
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
        message: 'You can only modify kits for your own events',
      });
      return;
    }
  }

  let syncedKits;
  try {
    syncedKits = await syncEventKits(eventId, kits);
  } catch (error: any) {
    if (String(error?.message || '').includes('inscrições vinculadas')) {
      res.status(409).json({
        success: false,
        error: 'Kit has linked registrations',
        message: error.message,
      });
      return;
    }
    throw error;
  }

  res.json({
    success: true,
    data: syncedKits,
    message: 'Kits synced successfully',
  });
});

/**
 * PUT /api/events/:eventId/kits/reorder
 * Reorder event kits for an event
 */
export const reorderEventKitsController = asyncHandler(async (req: AuthRequest, res: Response) => {
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
    kitOrders: z.array(
      z.object({
        id: z.string().uuid('ID do kit inválido'),
        display_order: z.number().int().positive('display_order deve ser um número inteiro positivo'),
      })
    ).min(1, 'Deve haver pelo menos um kit para reordenar'),
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
        message: 'Você só pode reordenar kits dos seus próprios eventos',
      });
      return;
    }
  }

  try {
    await reorderEventKits(eventId, validation.data.kitOrders);

    res.json({
      success: true,
      message: 'Kits reordenados com sucesso',
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

