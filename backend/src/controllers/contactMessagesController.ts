import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  createContactMessage,
  getContactMessages,
  getContactMessageById,
  updateContactMessage,
  getNewPlatformMessagesCount,
  getNewEventMessagesCount,
} from '../services/contactMessagesService.js';
import { z } from 'zod';
import { hasRole } from '../services/userRolesService.js';
import { getEventById } from '../services/eventsService.js';
import { sendNotificationSafely, getAdminEmail, getOrganizerEmail } from '../services/notificationService.js';

const createContactMessageSchema = z.object({
  type: z.enum(['event', 'platform']),
  name: z.string().min(3, 'Nome é obrigatório'),
  email: z.string().email('E-mail inválido'),
  phone: z.string().optional(),
  subject: z.string().min(3, 'Assunto é obrigatório'),
  message: z.string().min(10, 'Mensagem é obrigatória'),
  event_id: z.string().uuid().optional(),
  organizer_id: z.string().uuid().optional(),
});

const updateContactMessageSchema = z.object({
  status: z.enum(['new', 'viewed', 'replied', 'closed']).optional(),
});

/**
 * POST /api/contact-messages
 * Create a new contact message (public endpoint)
 */
export const createContactMessageController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const validation = createContactMessageSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: validation.error.errors[0].message,
      details: validation.error.errors,
    });
    return;
  }

  const data = validation.data;

  // If type is 'event', validate event_id and get organizer_id
  let event = null;
  if (data.type === 'event' && data.event_id) {
    event = await getEventById(data.event_id);
    if (!event) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Evento não encontrado',
      });
      return;
    }
    data.organizer_id = event.organizer_id;
  }

  const message = await createContactMessage(data);

  // Send notifications based on message type
  try {
    if (data.type === 'platform') {
      // Send notification to admin
      const adminEmail = await getAdminEmail();
      if (adminEmail) {
        await sendNotificationSafely({
          templateKey: 'new_contact_message_platform',
          recipient: {
            email: adminEmail,
          },
          variables: {
            senderName: message.name,
            senderEmail: message.email,
            senderPhone: message.phone || 'Não informado',
            subject: message.subject,
            message: message.message,
          },
        });
        console.log('✅ Notificação de mensagem de contato (plataforma) enviada para admin');
      } else {
        console.warn('⚠️ Email do admin não encontrado, notificação não enviada');
      }
    } else if (data.type === 'event' && message.organizer_id) {
      // Send notification to organizer
      const organizerEmail = await getOrganizerEmail(message.organizer_id);
      if (organizerEmail) {
        await sendNotificationSafely({
          templateKey: 'new_contact_message_event',
          recipient: {
            email: organizerEmail,
          },
          variables: {
            eventTitle: event?.title || 'Evento',
            senderName: message.name,
            senderEmail: message.email,
            senderPhone: message.phone || 'Não informado',
            subject: message.subject,
            message: message.message,
          },
        });
        console.log('✅ Notificação de mensagem de contato (evento) enviada para organizador');
      } else {
        console.warn(`⚠️ Email do organizador ${message.organizer_id} não encontrado, notificação não enviada`);
      }
    }
  } catch (error: any) {
    // Don't break the flow if notification fails
    console.error('❌ Erro ao enviar notificação de mensagem de contato:', error);
  }

  res.json({
    success: true,
    data: message,
    message: 'Mensagem enviada com sucesso! Entraremos em contato em breve.',
  });
});

/**
 * GET /api/contact-messages
 * Get all contact messages (admin for platform, organizer for their events)
 */
export const getContactMessagesController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  const isOrganizer = await hasRole(req.user.id, 'organizer');

  if (!isAdmin && !isOrganizer) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas administradores e organizadores podem visualizar mensagens de contato',
    });
    return;
  }

  const filters: any = {};
  
  if (isAdmin) {
    // Admin can see all platform messages and optionally filter by type
    if (req.query.type) {
      filters.type = req.query.type as string;
    } else {
      // Default to platform for admin
      filters.type = 'platform';
    }
  } else if (isOrganizer) {
    // Organizer can only see event messages for their events
    filters.type = 'event';
    filters.organizer_id = req.user.id;
  }

  if (req.query.status) {
    filters.status = req.query.status as string;
  }
  if (req.query.search) {
    filters.search = req.query.search as string;
  }

  const messages = await getContactMessages(filters);

  res.json({
    success: true,
    data: messages,
  });
});

/**
 * GET /api/contact-messages/new-count
 * Get count of new messages (admin for platform, organizer for their events)
 */
export const getNewContactMessagesCountController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  const isOrganizer = await hasRole(req.user.id, 'organizer');

  if (!isAdmin && !isOrganizer) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas administradores e organizadores podem visualizar contagem de mensagens',
    });
    return;
  }

  let count = 0;
  if (isAdmin) {
    count = await getNewPlatformMessagesCount();
  } else if (isOrganizer) {
    count = await getNewEventMessagesCount(req.user.id);
  }

  res.json({
    success: true,
    data: { count },
  });
});

/**
 * GET /api/contact-messages/:id
 * Get contact message by ID
 */
export const getContactMessageByIdController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  const isOrganizer = await hasRole(req.user.id, 'organizer');

  if (!isAdmin && !isOrganizer) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas administradores e organizadores podem visualizar mensagens de contato',
    });
    return;
  }

  const { id } = req.params;
  const message = await getContactMessageById(id);

  if (!message) {
    res.status(404).json({
      success: false,
      error: 'Not Found',
      message: 'Mensagem não encontrada',
    });
    return;
  }

  // Check permissions
  if (isOrganizer && !isAdmin) {
    // Organizer can only see their own event messages
    if (message.type !== 'event' || message.organizer_id !== req.user.id) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Você não tem permissão para visualizar esta mensagem',
      });
      return;
    }
  } else if (isAdmin) {
    // Admin can only see platform messages (unless explicitly accessing event message)
    if (message.type === 'platform') {
      // Admin can see platform messages
    } else if (message.type === 'event') {
      // Admin can also see event messages if needed
    }
  }

  res.json({
    success: true,
    data: message,
  });
});

/**
 * PUT /api/contact-messages/:id
 * Update contact message
 */
export const updateContactMessageController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  const isOrganizer = await hasRole(req.user.id, 'organizer');

  if (!isAdmin && !isOrganizer) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas administradores e organizadores podem atualizar mensagens de contato',
    });
    return;
  }

  const { id } = req.params;
  
  // Check if user has permission to update this message
  const message = await getContactMessageById(id);
  if (!message) {
    res.status(404).json({
      success: false,
      error: 'Not Found',
      message: 'Mensagem não encontrada',
    });
    return;
  }

  if (isOrganizer && !isAdmin) {
    if (message.type !== 'event' || message.organizer_id !== req.user.id) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Você não tem permissão para atualizar esta mensagem',
      });
      return;
    }
  }

  const validation = updateContactMessageSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: validation.error.errors[0].message,
      details: validation.error.errors,
    });
    return;
  }

  const updatedMessage = await updateContactMessage(id, validation.data);

  res.json({
    success: true,
    data: updatedMessage,
    message: 'Mensagem atualizada com sucesso',
  });
});

