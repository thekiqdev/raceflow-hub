import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { hasRole } from '../services/userRolesService.js';
import {
  createExternalEvent,
  updateExternalEvent,
} from '../services/externalEventsService.js';
import { getEventById } from '../services/eventsService.js';

const createExternalEventSchema = z.object({
  organizer_id: z.string().uuid('ID do organizador inválido'),
  title: z.string().min(3, 'Nome do evento deve ter no mínimo 3 caracteres'),
  event_date: z.string().datetime('Data do evento inválida'),
  banner_url: z.string().min(1, 'Banner é obrigatório'),
  external_url: z.string().url('Link externo inválido'),
  status: z.enum(['draft', 'published', 'ongoing', 'finished', 'cancelled']).optional(),
});

const updateExternalEventSchema = z.object({
  organizer_id: z.string().uuid('ID do organizador inválido').optional(),
  title: z.string().min(3, 'Nome do evento deve ter no mínimo 3 caracteres').optional(),
  event_date: z.string().datetime('Data do evento inválida').optional(),
  banner_url: z.string().min(1, 'Banner é obrigatório').optional(),
  external_url: z.string().url('Link externo inválido').optional(),
  status: z.enum(['draft', 'published', 'ongoing', 'finished', 'cancelled']).optional(),
});

async function requireAdmin(req: AuthRequest, res: Response): Promise<boolean> {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return false;
  }
  const isAdmin = await hasRole(req.user.id, 'admin');
  if (!isAdmin) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Somente administradores podem gerenciar eventos externos',
    });
    return false;
  }
  return true;
}

export const createExternalEventController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!(await requireAdmin(req, res))) return;

  const validation = createExternalEventSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({
      success: false,
      error: 'Validation Error',
      message: validation.error.errors[0].message,
      errors: validation.error.errors,
    });
    return;
  }

  try {
    const event = await createExternalEvent(validation.data);
    const { getFileUrl } = await import('../middleware/upload.js');
    res.status(201).json({
      success: true,
      data: {
        ...event,
        banner_url: event.banner_url ? getFileUrl(event.banner_url) : null,
      },
      message: 'Evento externo criado com sucesso',
    });
  } catch (error: any) {
    if (error.message === 'ORGANIZER_NOT_FOUND') {
      res.status(400).json({
        success: false,
        error: 'ORGANIZER_NOT_FOUND',
        message: 'Organizador não encontrado',
      });
      return;
    }
    throw error;
  }
});

export const updateExternalEventController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!(await requireAdmin(req, res))) return;

  const validation = updateExternalEventSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({
      success: false,
      error: 'Validation Error',
      message: validation.error.errors[0].message,
      errors: validation.error.errors,
    });
    return;
  }

  try {
    const event = await updateExternalEvent(req.params.id, validation.data);
    const { getFileUrl } = await import('../middleware/upload.js');
    res.json({
      success: true,
      data: {
        ...event,
        banner_url: event.banner_url ? getFileUrl(event.banner_url) : null,
      },
      message: 'Evento externo atualizado com sucesso',
    });
  } catch (error: any) {
    if (error.message === 'EVENT_NOT_FOUND') {
      res.status(404).json({ success: false, error: 'Not Found', message: 'Evento não encontrado' });
      return;
    }
    if (error.message === 'NOT_EXTERNAL_EVENT') {
      res.status(400).json({
        success: false,
        error: 'NOT_EXTERNAL_EVENT',
        message: 'Este endpoint é exclusivo para eventos externos',
      });
      return;
    }
    if (error.message === 'ORGANIZER_NOT_FOUND') {
      res.status(400).json({
        success: false,
        error: 'ORGANIZER_NOT_FOUND',
        message: 'Organizador não encontrado',
      });
      return;
    }
    throw error;
  }
});

export const getExternalEventController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  const isOrganizer = await hasRole(req.user.id, 'organizer');
  if (!isAdmin && !isOrganizer) {
    res.status(403).json({ success: false, error: 'Forbidden' });
    return;
  }

  const event = await getEventById(req.params.id);
  if (!event) {
    res.status(404).json({ success: false, error: 'Not Found', message: 'Evento não encontrado' });
    return;
  }

  if (event.event_type !== 'EXTERNAL') {
    res.status(400).json({
      success: false,
      error: 'NOT_EXTERNAL_EVENT',
      message: 'Evento não é do tipo externo',
    });
    return;
  }

  if (!isAdmin && event.organizer_id !== req.user.id) {
    res.status(403).json({ success: false, error: 'Forbidden' });
    return;
  }

  res.json({ success: true, data: event });
});
