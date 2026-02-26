import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getAttributeSelectionStats } from '../services/registrationProductSelectionsService.js';

/**
 * Get attribute selection statistics for an event
 * GET /api/events/:eventId/product-selection-stats
 */
export const getAttributeSelectionStatsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { eventId } = req.params;

  if (!eventId) {
    res.status(400).json({
      success: false,
      error: 'Missing event ID',
      message: 'ID do evento é obrigatório',
    });
    return;
  }

  const stats = await getAttributeSelectionStats(eventId);

  res.json({
    success: true,
    data: stats,
  });
});
