import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import {
  getEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
} from '../services/eventsService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { hasRole } from '../services/userRolesService.js';
import { deleteFile, getFilePath } from '../middleware/upload.js';
import { z } from 'zod';

// Schema for create event request
const createEventSchema = z.object({
  organizer_id: z.string().uuid('ID do organizador inválido').optional(),
  title: z.string().min(3, 'Título deve ter no mínimo 3 caracteres'),
  description: z.string().optional(),
  event_date: z.string().datetime('Data do evento inválida'),
  location: z.string().min(5, 'Localização é obrigatória'),
  city: z.string().min(2, 'Cidade é obrigatória'),
  state: z.string().length(2, 'Estado deve ter 2 caracteres'),
  banner_url: z.string().optional(),
  regulation_url: z.string().optional(),
  result_url: z.string().optional(),
  status: z.enum(['draft', 'published', 'ongoing', 'finished', 'cancelled']).optional(),
  registration_status: z.enum(['not_open', 'open', 'closed']).nullable().optional(),
  registration_start_date: z.string().datetime('Data de abertura inválida').nullable().optional(),
  registration_end_date: z.string().datetime('Data de encerramento inválida').nullable().optional(),
  registration_auto_mode: z.boolean().optional(),
  pix_enabled: z.boolean().optional(),
  pix_disabled_at: z.string().datetime('Data de desabilitação do PIX inválida').nullable().optional(),
  credit_card_enabled: z.boolean().optional(),
  credit_card_disabled_at: z.string().datetime('Data de desabilitação do cartão de crédito inválida').nullable().optional(),
}).refine((data) => {
  // Se modo automático está ativado, datas são obrigatórias
  if (data.registration_auto_mode === true) {
    return data.registration_start_date !== null && data.registration_start_date !== undefined &&
           data.registration_end_date !== null && data.registration_end_date !== undefined;
  }
  return true;
}, {
  message: 'Data de abertura e encerramento são obrigatórias quando o modo automático está ativado',
  path: ['registration_start_date'],
}).refine((data) => {
  // Validar que data fim >= data início
  if (data.registration_start_date && data.registration_end_date) {
    const startDate = new Date(data.registration_start_date);
    const endDate = new Date(data.registration_end_date);
    return endDate >= startDate;
  }
  return true;
}, {
  message: 'Data de encerramento deve ser maior ou igual à data de abertura',
  path: ['registration_end_date'],
});

// Schema for update event request
const updateEventSchema = z.object({
  organizer_id: z.string().uuid('ID do organizador inválido').optional(),
  title: z.string().min(3, 'Título deve ter no mínimo 3 caracteres').optional(),
  description: z.string().optional(),
  event_date: z.string().datetime('Data do evento inválida').optional(),
  location: z.string().min(5, 'Localização é obrigatória').optional(),
  city: z.string().min(2, 'Cidade é obrigatória').optional(),
  state: z.string().length(2, 'Estado deve ter 2 caracteres').optional(),
  banner_url: z.string().optional(),
  regulation_url: z.string().optional(),
  result_url: z.string().optional(),
  status: z.enum(['draft', 'published', 'ongoing', 'finished', 'cancelled']).optional(),
  registration_status: z.enum(['not_open', 'open', 'closed']).nullable().optional(),
  registration_start_date: z.string().datetime('Data de abertura inválida').nullable().optional(),
  registration_end_date: z.string().datetime('Data de encerramento inválida').nullable().optional(),
  registration_auto_mode: z.boolean().optional(),
  pix_enabled: z.boolean().optional(),
  pix_disabled_at: z.string().datetime('Data de desabilitação do PIX inválida').nullable().optional(),
  credit_card_enabled: z.boolean().optional(),
  credit_card_disabled_at: z.string().datetime('Data de desabilitação do cartão de crédito inválida').nullable().optional(),
}).refine((data) => {
  // Se modo automático está ativado, datas são obrigatórias
  if (data.registration_auto_mode === true) {
    return data.registration_start_date !== null && data.registration_start_date !== undefined &&
           data.registration_end_date !== null && data.registration_end_date !== undefined;
  }
  return true;
}, {
  message: 'Data de abertura e encerramento são obrigatórias quando o modo automático está ativado',
  path: ['registration_start_date'],
}).refine((data) => {
  // Validar que data fim >= data início
  if (data.registration_start_date && data.registration_end_date) {
    const startDate = new Date(data.registration_start_date);
    const endDate = new Date(data.registration_end_date);
    return endDate >= startDate;
  }
  return true;
}, {
  message: 'Data de encerramento deve ser maior ou igual à data de abertura',
  path: ['registration_end_date'],
});

// Get all events
export const getAllEvents = asyncHandler(async (req: AuthRequest, res: Response) => {
  const filters: any = {};

  // Get all query parameters first
  if (req.query.order_by_date) {
    const orderBy = String(req.query.order_by_date);
    if (orderBy === 'asc' || orderBy === 'desc') {
      filters.order_by_date = orderBy;
    }
  }
  if (req.query.city) {
    filters.city = req.query.city;
  }
  if (req.query.state) {
    filters.state = req.query.state;
  }
  if (req.query.organizer_id) {
    filters.organizer_id = req.query.organizer_id;
  }
  if (req.query.search) {
    filters.search = req.query.search;
  }

  // Status filter logic - check permissions FIRST, then decide on status filter
  // - Admins: see all events (no status filter unless explicitly requested)
  // - Organizers: see all their own events (no status filter unless explicitly requested)
  // - Regular users and unauthenticated: only see published events
  
  const statusExplicitlyRequested = !!req.query.status;
  let shouldApplyStatusFilter = true; // Default: apply filter
  
  if (req.user) {
    const isAdmin = await hasRole(req.user.id, 'admin');
    const isOrganizer = await hasRole(req.user.id, 'organizer');
    
    console.log('👤 User roles - Admin:', isAdmin, 'Organizer:', isOrganizer, 'User ID:', req.user.id);
    console.log('🔍 Filters before status logic:', JSON.stringify(filters, null, 2));
    console.log('🔍 Query status param:', req.query.status);
    console.log('🔍 statusExplicitlyRequested:', statusExplicitlyRequested);
    
    if (isAdmin) {
      // Admins can see all events - only apply status filter if explicitly requested
      shouldApplyStatusFilter = statusExplicitlyRequested;
      console.log('✅ Admin: shouldApplyStatusFilter =', shouldApplyStatusFilter);
    } else if (isOrganizer) {
      // Organizers can see all their own events
      // Convert both to strings for comparison to avoid type mismatch
      const organizerIdStr = filters.organizer_id ? String(filters.organizer_id).trim() : null;
      const userIdStr = String(req.user.id).trim();
      const viewingOwnEvents = organizerIdStr && organizerIdStr === userIdStr;
      const notFilteringByOrganizer = !filters.organizer_id;
      
      console.log('👤 Organizer - User ID (trimmed):', userIdStr);
      console.log('👤 Organizer - Filter organizer_id (trimmed):', organizerIdStr);
      console.log('👤 Organizer - IDs match:', organizerIdStr === userIdStr);
      console.log('👤 Organizer - viewingOwnEvents:', viewingOwnEvents);
      console.log('👤 Organizer - notFilteringByOrganizer:', notFilteringByOrganizer);
      
      if (viewingOwnEvents || notFilteringByOrganizer) {
        // Viewing own events or not filtering - show all statuses unless explicitly requested
        shouldApplyStatusFilter = statusExplicitlyRequested;
        console.log('✅ Organizer viewing own events: shouldApplyStatusFilter =', shouldApplyStatusFilter, '(will show ALL statuses)');
      } else {
        // Viewing other organizer's events - only published
        shouldApplyStatusFilter = true;
        console.log('✅ Organizer viewing other events: shouldApplyStatusFilter = true (published only)');
      }
    } else {
      // Regular users only see published events
      shouldApplyStatusFilter = true;
      console.log('✅ Regular user: shouldApplyStatusFilter = true (published only)');
    }
  } else {
    // Not authenticated - only show published
    shouldApplyStatusFilter = true;
    console.log('✅ Not authenticated: shouldApplyStatusFilter = true (published only)');
  }
  
  // Apply status filter based on decision
  // IMPORTANT: Only set filters.status if we should apply the filter
  if (shouldApplyStatusFilter) {
    if (statusExplicitlyRequested) {
      filters.status = req.query.status;
      console.log('✅ Applying explicit status filter:', req.query.status);
    } else {
      filters.status = 'published';
      console.log('✅ Applying default status filter: published');
    }
  } else {
    // Explicitly remove status filter if it exists
    if ('status' in filters) {
      delete filters.status;
    }
    console.log('✅ No status filter applied - showing all statuses (draft, published, finished, etc)');
  }
  
  console.log('🔍 Final filters after status logic:', JSON.stringify(filters, null, 2));
  console.log('🔍 filters.status value:', filters.status);
  console.log('🔍 filters.status exists?', 'status' in filters);

  const events = await getEvents(filters);

  console.log(`📤 Sending ${events.length} events to client for filters:`, filters);
  console.log('📤 First event sample:', events[0] || 'No events');

  res.json({
    success: true,
    data: events,
  });
});

// Get event by ID
export const getEvent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const event = await getEventById(id);

  if (!event) {
    return res.status(404).json({
      success: false,
      error: 'Event not found',
    });
  }

  // Check permissions
  // Allow public access to published and finished events
  // Finished events should be accessible because they appear on the results page
  if (event.status !== 'published' && event.status !== 'finished') {
    if (!req.user) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Event is not published',
      });
      return;
    }

    const isAdmin = await hasRole(req.user.id, 'admin');
    const isOrganizer = await hasRole(req.user.id, 'organizer') && event.organizer_id === req.user.id;

    if (!isAdmin && !isOrganizer) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to view this event',
      });
      return;
    }
  }

  res.json({
    success: true,
    data: event,
  });
  return;
});

// Create event
export const createEventController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  const isOrganizer = await hasRole(req.user.id, 'organizer');

  if (!isAdmin && !isOrganizer) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Only organizers and admins can create events',
    });
    return;
  }

  // Validate request body with Zod
  const validation = createEventSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: validation.error.errors[0].message,
      details: validation.error.errors,
    });
    return;
  }

  const eventData = {
    ...validation.data,
    organizer_id: validation.data.organizer_id || req.user.id,
  };

  console.log('📝 Creating event with data:', eventData);

  try {
    const event = await createEvent(eventData);
    
    console.log('✅ Event created successfully:', event?.id);

    res.status(201).json({
      success: true,
      data: event,
      message: 'Event created successfully',
    });
    return;
  } catch (error: any) {
    console.error('❌ Error creating event:', error);
    throw error; // Let asyncHandler handle it
  }
});

// Update event
export const updateEventController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
  }

  const { id } = req.params;
  const event = await getEventById(id);

  if (!event) {
    res.status(404).json({
      success: false,
      error: 'Event not found',
    });
    return;
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  const isOrganizer = await hasRole(req.user.id, 'organizer') && event.organizer_id === req.user.id;

  if (!isAdmin && !isOrganizer) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'You can only update your own events',
    });
    return;
  }

  // Validate request body with Zod
  const validation = updateEventSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: validation.error.errors[0].message,
      details: validation.error.errors,
    });
    return;
  }

  // Delete old files if new ones are being uploaded
  if (validation.data.banner_url && event.banner_url && validation.data.banner_url !== event.banner_url) {
    // New banner URL is different, delete old file if it's a local file
    const oldFilePath = getFilePath(event.banner_url);
    if (oldFilePath) {
      deleteFile(oldFilePath);
    }
  }

  if (validation.data.regulation_url && event.regulation_url && validation.data.regulation_url !== event.regulation_url) {
    // New regulation URL is different, delete old file if it's a local file
    const oldFilePath = getFilePath(event.regulation_url);
    if (oldFilePath) {
      deleteFile(oldFilePath);
    }
  }

  const updatedEvent = await updateEvent(id, validation.data);

  res.json({
    success: true,
    data: updatedEvent,
    message: 'Event updated successfully',
  });
  return;
});

// Delete event
export const deleteEventController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
  }

  const { id } = req.params;
  const event = await getEventById(id);

  if (!event) {
    res.status(404).json({
      success: false,
      error: 'Event not found',
    });
    return;
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  const isOrganizer = await hasRole(req.user.id, 'organizer') && event.organizer_id === req.user.id;

  if (!isAdmin && !isOrganizer) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'You can only delete your own events',
    });
    return;
  }

  const deleted = await deleteEvent(id);

  if (!deleted) {
    return res.status(404).json({
      success: false,
      error: 'Event not found',
    });
  }

  res.json({
    success: true,
    message: 'Event deleted successfully',
  });
  return;
});

