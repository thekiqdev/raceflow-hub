import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getEventPickupLocations } from '../services/kitPickupService.js';

/**
 * GET /api/events/:eventId/pickup-locations
 * Get all pickup locations for an event
 */
export const getEventPickupLocationsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { eventId } = req.params;

  if (!eventId) {
    res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Event ID is required',
    });
    return;
  }

  const locations = await getEventPickupLocations(eventId);

  res.json({
    success: true,
    data: locations,
  });
});



