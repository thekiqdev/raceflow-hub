import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getEventKits, syncEventKits } from '../services/eventKitsService.js';
import { getEventById } from '../services/eventsService.js';

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

