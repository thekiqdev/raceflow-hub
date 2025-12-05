import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getEventCategories, syncEventCategories } from '../services/eventCategoriesService.js';
import { getEventById } from '../services/eventsService.js';

/**
 * GET /api/events/:eventId/categories
 * Get all categories for an event
 */
export const getEventCategoriesController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { eventId } = req.params;

  console.log('🔍 getEventCategoriesController called');
  console.log('📋 Request params:', req.params);
  console.log('📋 Request query:', req.query);
  console.log('📋 Request path:', req.path);
  console.log('📋 Request url:', req.url);
  console.log('📋 eventId from params:', eventId);

  if (!eventId) {
    res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Event ID is required',
    });
    return;
  }

  const categories = await getEventCategories(eventId);
  
  console.log('📋 Categories found:', categories.length, 'categories');
  console.log('📋 Categories data:', JSON.stringify(categories, null, 2));

  res.json({
    success: true,
    data: categories,
  });
});

/**
 * POST /api/events/:eventId/categories
 * Sync (create/update/delete) categories for an event
 */
export const syncEventCategoriesController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const { eventId } = req.params;
  const { categories } = req.body;

  console.log('📥 syncEventCategoriesController called');
  console.log('📥 Event ID:', eventId);
  console.log('📥 Categories received:', JSON.stringify(categories, null, 2));

  if (!eventId) {
    res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Event ID is required',
    });
    return;
  }

  if (!Array.isArray(categories)) {
    res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Categories must be an array',
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

  // Check ownership (requireEventOwnership logic)
  if (event.organizer_id !== req.user.id) {
    const { hasRole } = await import('../services/userRolesService.js');
    const isAdmin = await hasRole(req.user.id, 'admin');
    if (!isAdmin) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You can only modify categories for your own events',
      });
      return;
    }
  }

  const syncedCategories = await syncEventCategories(eventId, categories);

  res.json({
    success: true,
    data: syncedCategories,
    message: 'Categories synced successfully',
  });
});

