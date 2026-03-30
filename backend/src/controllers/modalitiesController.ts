import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  createModality,
  getModalitiesByEvent,
  getModalityById,
  updateModality,
  deleteModality,
  reorderModalities,
} from '../services/modalitiesService.js';
import { CreateModalityData, UpdateModalityData } from '../types/index.js';
import { getEventById } from '../services/eventsService.js';
import { z } from 'zod';

// Validation schemas
const createModalitySchema = z.object({
  event_id: z.string().uuid('ID do evento inválido'),
  name: z.string().min(1, 'Nome da modalidade é obrigatório').max(255, 'Nome deve ter no máximo 255 caracteres'),
  distance: z.string().min(1, 'Distância é obrigatória').max(50, 'Distância deve ter no máximo 50 caracteres'),
  max_participants: z.number().int().positive('Limite de participantes deve ser um número positivo').nullable().optional(),
  route_image_url: z.union([
    z.string().url('URL da imagem inválida'),
    z.literal(''),
    z.null()
  ]).optional(),
});

const updateModalitySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  distance: z.string().min(1).max(50).optional(),
  max_participants: z.number().int().positive('Limite de participantes deve ser um número positivo').nullable().optional(),
  route_image_url: z.union([
    z.string().url('URL da imagem inválida'),
    z.literal(''),
    z.null()
  ]).optional(),
});

/**
 * POST /api/modalities
 * Create a new modality
 */
export const createModalityController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    const validation = createModalitySchema.safeParse(req.body);

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
    const event = await getEventById(validation.data.event_id);
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
          message: 'Você só pode criar modalidades para seus próprios eventos',
        });
        return;
      }
    }

    try {
      const maxParticipants = validation.data.max_participants === undefined || validation.data.max_participants === null
        ? null
        : validation.data.max_participants;
      
      console.log('🔍 createModalityController - received data:', {
        event_id: validation.data.event_id,
        name: validation.data.name,
        distance: validation.data.distance,
        max_participants_raw: validation.data.max_participants,
        max_participants_processed: maxParticipants,
        type: typeof validation.data.max_participants
      });
      
      const routeImageUrl = validation.data.route_image_url && validation.data.route_image_url.trim() !== '' 
        ? validation.data.route_image_url 
        : null;
      
      const modalityData: CreateModalityData = {
        event_id: validation.data.event_id,
        name: validation.data.name,
        distance: validation.data.distance,
        max_participants: maxParticipants,
        route_image_url: routeImageUrl,
      };

      const modality = await createModality(modalityData);
      
      console.log('✅ createModalityController - created modality:', {
        id: modality.id,
        max_participants: modality.max_participants
      });

      res.status(201).json({
        success: true,
        data: modality,
        message: 'Modalidade criada com sucesso',
      });
    } catch (error: any) {
      throw error;
    }
  }
);

/**
 * GET /api/modalities/event/:eventId
 * Get all modalities for an event
 */
export const getModalitiesController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { eventId } = req.params;

    if (!eventId) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Event ID is required',
      });
      return;
    }

    const modalities = await getModalitiesByEvent(eventId);

    res.json({
      success: true,
      data: modalities,
    });
  }
);

/**
 * GET /api/modalities/:id
 * Get a modality by ID
 */
export const getModalityByIdController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Modality ID is required',
      });
      return;
    }

    const modality = await getModalityById(id);

    if (!modality) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Modalidade não encontrada',
      });
      return;
    }

    res.json({
      success: true,
      data: modality,
    });
  }
);

/**
 * PUT /api/modalities/:id
 * Update a modality
 */
export const updateModalityController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Modality ID is required',
      });
      return;
    }

    const validation = updateModalitySchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error.errors[0].message,
        errors: validation.error.errors,
      });
      return;
    }

    // Verify modality exists and get event
    const modality = await getModalityById(id);
    if (!modality) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Modalidade não encontrada',
      });
      return;
    }

    // Verify event ownership
    const event = await getEventById(modality.event_id);
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
          message: 'Você só pode editar modalidades dos seus próprios eventos',
        });
        return;
      }
    }

    try {
      const maxParticipants = validation.data.max_participants === undefined || validation.data.max_participants === null
        ? null
        : validation.data.max_participants;
      
      console.log('🔍 updateModalityController - received data:', {
        id,
        name: validation.data.name,
        distance: validation.data.distance,
        max_participants_raw: validation.data.max_participants,
        max_participants_processed: maxParticipants,
        type: typeof validation.data.max_participants
      });
      
      const routeImageUrl = validation.data.route_image_url && validation.data.route_image_url.trim() !== '' 
        ? validation.data.route_image_url 
        : null;
      
      const updateData: UpdateModalityData = {
        name: validation.data.name,
        distance: validation.data.distance,
        max_participants: maxParticipants,
        route_image_url: routeImageUrl,
      };

      const updatedModality = await updateModality(id, updateData);
      
      console.log('✅ updateModalityController - updated modality:', {
        id: updatedModality?.id,
        max_participants: updatedModality?.max_participants
      });

      if (!updatedModality) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Modalidade não encontrada',
        });
        return;
      }

      res.json({
        success: true,
        data: updatedModality,
        message: 'Modalidade atualizada com sucesso',
      });
    } catch (error: any) {
      throw error;
    }
  }
);

/**
 * DELETE /api/modalities/:id
 * Delete a modality
 */
export const deleteModalityController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Modality ID is required',
      });
      return;
    }

    // Verify modality exists and get event
    const modality = await getModalityById(id);
    if (!modality) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Modalidade não encontrada',
      });
      return;
    }

    // Verify event ownership
    const event = await getEventById(modality.event_id);
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
          message: 'Você só pode excluir modalidades dos seus próprios eventos',
        });
        return;
      }
    }

    try {
      const deleted = await deleteModality(id);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Modalidade não encontrada',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Modalidade excluída com sucesso',
      });
    } catch (error: any) {
      if (error.message.includes('categoria(s) associada(s)')) {
        res.status(409).json({
          success: false,
          error: 'Conflict',
          message: error.message,
        });
        return;
      }
      throw error;
    }
  }
);

/**
 * PUT /api/modalities/events/:eventId/reorder
 * Reorder modalities for an event
 */
export const reorderModalitiesController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
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
      modalityOrders: z.array(
        z.object({
          id: z.string().uuid('ID da modalidade inválido'),
          display_order: z.number().int().positive('display_order deve ser um número inteiro positivo'),
        })
      ).min(1, 'Deve haver pelo menos uma modalidade para reordenar'),
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
          message: 'Você só pode reordenar modalidades dos seus próprios eventos',
        });
        return;
      }
    }

    try {
      await reorderModalities(eventId, validation.data.modalityOrders);

      res.json({
        success: true,
        message: 'Modalidades reordenadas com sucesso',
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
  }
);

