import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getEventKits, syncEventKits, reorderEventKits } from '../services/eventKitsService.js';
import { getEventById } from '../services/eventsService.js';
import { z } from 'zod';

/**
 * GET /api/events/:eventId/kits
 * Get all kits for an event
 */
export const getEventKitsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { eventId } = req.params;

  if (!eventId) {
    res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Event ID is required',
    });
    return;
  }

  const kits = await getEventKits(eventId);

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

  const syncedKits = await syncEventKits(eventId, kits);

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

