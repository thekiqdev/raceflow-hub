import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { 
  getEventPickupLocations, 
  createPickupLocation, 
  updatePickupLocation, 
  deletePickupLocation 
} from '../services/kitPickupService.js';
import { z } from 'zod';

const createPickupLocationSchema = z.object({
  address: z.string().min(1, 'Endereço é obrigatório'),
  pickup_date: z.string().min(1, 'Data de retirada é obrigatória'),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
});

const updatePickupLocationSchema = z.object({
  address: z.string().min(1).optional(),
  pickup_date: z.string().min(1).optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
});

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

/**
 * POST /api/events/:eventId/pickup-locations
 * Create a new pickup location for an event
 */
export const createPickupLocationController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { eventId } = req.params;

  if (!eventId) {
    res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Event ID is required',
    });
    return;
  }

  const validation = createPickupLocationSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: validation.error.errors[0].message,
      details: validation.error.errors,
    });
    return;
  }

  const location = await createPickupLocation(eventId, validation.data);

  res.json({
    success: true,
    data: location,
    message: 'Local de retirada criado com sucesso',
  });
});

/**
 * PUT /api/events/:eventId/pickup-locations/:locationId
 * Update a pickup location
 */
export const updatePickupLocationController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { locationId } = req.params;

  if (!locationId) {
    res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Location ID is required',
    });
    return;
  }

  const validation = updatePickupLocationSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: validation.error.errors[0].message,
      details: validation.error.errors,
    });
    return;
  }

  const location = await updatePickupLocation(locationId, validation.data);

  res.json({
    success: true,
    data: location,
    message: 'Local de retirada atualizado com sucesso',
  });
});

/**
 * DELETE /api/events/:eventId/pickup-locations/:locationId
 * Delete a pickup location
 */
export const deletePickupLocationController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { locationId } = req.params;

  if (!locationId) {
    res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Location ID is required',
    });
    return;
  }

  const deleted = await deletePickupLocation(locationId);

  if (!deleted) {
    res.status(404).json({
      success: false,
      error: 'Not Found',
      message: 'Local de retirada não encontrado',
    });
    return;
  }

  res.json({
    success: true,
    message: 'Local de retirada excluído com sucesso',
  });
});



