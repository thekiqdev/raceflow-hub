import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import {
  getSupportTickets,
  getTicketById,
  getTicketMessages,
  updateTicketStatus,
  addTicketMessage,
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from '../services/supportService.js';
import { z } from 'zod';

// Validation schemas
const updateTicketStatusSchema = z.object({
  status: z.enum(['aberto', 'em_analise', 'respondido', 'resolvido', 'fechado']),
  assigned_to: z.string().uuid().optional().nullable(),
});

const addTicketMessageSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  is_internal: z.boolean().optional(),
});

const createAnnouncementSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  content: z.string().min(1, 'Content is required'),
  target_audience: z.enum(['all', 'runners', 'organizers', 'admins']),
  status: z.enum(['draft', 'scheduled', 'published', 'archived']),
  scheduled_at: z.string().optional().nullable(),
});

const updateAnnouncementSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  target_audience: z.enum(['all', 'runners', 'organizers', 'admins']).optional(),
  status: z.enum(['draft', 'scheduled', 'published', 'archived']).optional(),
  scheduled_at: z.string().optional().nullable(),
});

/**
 * GET /api/admin/support/tickets
 * Get all support tickets
 */
export const getSupportTicketsController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const filters: any = {};

    if (req.query.status) {
      filters.status = req.query.status;
    }
    if (req.query.priority) {
      filters.priority = req.query.priority;
    }
    if (req.query.search) {
      filters.search = req.query.search;
    }
    if (req.query.assigned_to) {
      filters.assigned_to = req.query.assigned_to;
    }

    const tickets = await getSupportTickets(filters);

    res.json({
      success: true,
      data: tickets,
    });
  } catch (error: any) {
    console.error('Error fetching support tickets:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch support tickets',
    });
  }
};

/**
 * GET /api/admin/support/tickets/:id
 * Get ticket by ID
 */
export const getTicketByIdController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const ticket = await getTicketById(id);

    if (!ticket) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Ticket not found',
      });
      return;
    }

    res.json({
      success: true,
      data: ticket,
    });
  } catch (error: any) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch ticket',
    });
  }
};

/**
 * GET /api/admin/support/tickets/:id/messages
 * Get ticket messages
 */
export const getTicketMessagesController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const messages = await getTicketMessages(id);

    res.json({
      success: true,
      data: messages,
    });
  } catch (error: any) {
    console.error('Error fetching ticket messages:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch ticket messages',
    });
  }
};

/**
 * PUT /api/admin/support/tickets/:id/status
 * Update ticket status
 */
export const updateTicketStatusController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const validation = updateTicketStatusSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error.errors[0].message,
      });
      return;
    }

    const ticket = await updateTicketStatus(id, validation.data.status, validation.data.assigned_to ?? undefined);

    if (!ticket) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Ticket not found',
      });
      return;
    }

    res.json({
      success: true,
      data: ticket,
      message: 'Ticket status updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating ticket status:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to update ticket status',
    });
  }
};

/**
 * POST /api/admin/support/tickets/:id/messages
 * Add message to ticket
 */
export const addTicketMessageController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const validation = addTicketMessageSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error.errors[0].message,
      });
      return;
    }

    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
      return;
    }

    const message = await addTicketMessage({
      ticket_id: id,
      user_id: req.user.id,
      message: validation.data.message,
      is_internal: validation.data.is_internal || false,
    });

    res.status(201).json({
      success: true,
      data: message,
      message: 'Message added successfully',
    });
  } catch (error: any) {
    console.error('Error adding ticket message:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to add ticket message',
    });
  }
};

/**
 * GET /api/admin/support/announcements
 * Get all announcements
 */
export const getAnnouncementsController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const filters: any = {};

    if (req.query.status) {
      filters.status = req.query.status;
    }
    if (req.query.target_audience) {
      filters.target_audience = req.query.target_audience;
    }

    const announcements = await getAnnouncements(filters);

    res.json({
      success: true,
      data: announcements,
    });
  } catch (error: any) {
    console.error('Error fetching announcements:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch announcements',
    });
  }
};

/**
 * POST /api/admin/support/announcements
 * Create announcement
 */
export const createAnnouncementController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const validation = createAnnouncementSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error.errors[0].message,
      });
      return;
    }

    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
      return;
    }

    const announcement = await createAnnouncement({
      ...validation.data,
      scheduled_at: validation.data.scheduled_at ?? undefined,
      created_by: req.user.id,
    });

    res.status(201).json({
      success: true,
      data: announcement,
      message: 'Announcement created successfully',
    });
  } catch (error: any) {
    console.error('Error creating announcement:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to create announcement',
    });
  }
};

/**
 * PUT /api/admin/support/announcements/:id
 * Update announcement
 */
export const updateAnnouncementController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const validation = updateAnnouncementSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error.errors[0].message,
      });
      return;
    }

    const announcement = await updateAnnouncement(id, {
      ...validation.data,
      scheduled_at: validation.data.scheduled_at ?? undefined,
    });

    if (!announcement) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Announcement not found',
      });
      return;
    }

    res.json({
      success: true,
      data: announcement,
      message: 'Announcement updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating announcement:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to update announcement',
    });
  }
};

/**
 * DELETE /api/admin/support/announcements/:id
 * Delete announcement
 */
export const deleteAnnouncementController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const deleted = await deleteAnnouncement(id);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Announcement not found',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Announcement deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting announcement:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to delete announcement',
    });
  }
};




