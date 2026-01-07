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

const pickupTimeSlotSchema = z.object({
  start_time: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, 'Formato de horário inválido (HH:MM)'),
  end_time: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, 'Formato de horário inválido (HH:MM)'),
});

const pickupScheduleItemSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de data inválido (YYYY-MM-DD)'),
  time_slots: z.array(pickupTimeSlotSchema).min(1, 'Pelo menos um horário é obrigatório por data'),
});

const createPickupLocationSchema = z.object({
  name: z.string().optional().nullable(),
  address: z.string().min(1, 'Endereço é obrigatório'),
  pickup_date: z.string().optional(), // Kept for backward compatibility
  pickup_schedule: z.array(pickupScheduleItemSchema).min(1, 'Pelo menos uma data com horários é obrigatória').optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
}).refine((data) => {
  // Either pickup_schedule or pickup_date must be provided
  return data.pickup_schedule && data.pickup_schedule.length > 0 || data.pickup_date;
}, {
  message: 'É necessário fornecer pickup_schedule ou pickup_date',
  path: ['pickup_schedule'],
});

const updatePickupLocationSchema = z.object({
  name: z.string().optional().nullable(),
  address: z.string().min(1).optional(),
  pickup_date: z.string().optional(), // Kept for backward compatibility
  pickup_schedule: z.array(pickupScheduleItemSchema).min(1).optional(),
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

  console.log('📦 [createPickupLocationController] Recebendo dados:', req.body);
  
  const validation = createPickupLocationSchema.safeParse(req.body);
  if (!validation.success) {
    console.error('❌ [createPickupLocationController] Erro de validação:', validation.error.errors);
    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: validation.error.errors[0].message,
      details: validation.error.errors,
    });
    return;
  }

  console.log('✅ [createPickupLocationController] Dados validados:', validation.data);
  
  try {
    const location = await createPickupLocation(eventId, validation.data);
    console.log('✅ [createPickupLocationController] Local criado com sucesso:', location.id);

    res.json({
      success: true,
      data: location,
      message: 'Local de retirada criado com sucesso',
    });
  } catch (error: any) {
    console.error('❌ [createPickupLocationController] Erro ao criar local:', error);
    throw error; // Let asyncHandler handle it
  }
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



