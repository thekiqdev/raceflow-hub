import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  createQuote,
  getQuotes,
  getQuoteById,
  updateQuote,
  getNewQuotesCount,
} from '../services/quotesService.js';
import { z } from 'zod';
import { hasRole } from '../services/userRolesService.js';
import { sendNotificationSafely, getAdminEmail } from '../services/notificationService.js';

const createQuoteSchema = z.object({
  full_name: z.string().min(3, 'Nome completo é obrigatório'),
  phone: z.string().min(10, 'Telefone é obrigatório'),
  email: z.string().email('E-mail inválido'),
  event_location: z.string().min(3, 'Local da prova é obrigatório'),
  athletes_count: z.string().min(1, 'Quantidade de atletas é obrigatória'),
  same_start_finish: z.string().min(1, 'Campo obrigatório'),
  electric_power: z.string().min(1, 'Campo obrigatório'),
  additional_points: z.string().optional(),
  chest_numbers: z.string().min(1, 'Campo obrigatório'),
  distances: z.string().min(1, 'Distâncias são obrigatórias'),
  timing_gate: z.string().min(1, 'Campo obrigatório'),
  cronoteam_registration: z.string().min(1, 'Campo obrigatório'),
  event_date: z.string().min(1, 'Data da prova é obrigatória'),
  description: z.string().min(10, 'A descrição deve ter pelo menos 10 caracteres'),
}).passthrough(); // Permite campos extras que não estão no schema

const updateQuoteSchema = z.object({
  status: z.enum(['new', 'viewed', 'contacted', 'closed']).optional(),
});

/**
 * POST /api/quotes
 * Create a new quote (public endpoint)
 */
export const createQuoteController = asyncHandler(async (req: AuthRequest, res: Response) => {
  console.log('📥 Quote submission received:', JSON.stringify(req.body, null, 2));
  
  const validation = createQuoteSchema.safeParse(req.body);
  if (!validation.success) {
    console.error('❌ Quote validation failed:', validation.error.errors);
    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: validation.error.errors[0].message,
      details: validation.error.errors,
    });
    return;
  }

  console.log('✅ Validation passed. Data:', JSON.stringify(validation.data, null, 2));
  const quote = await createQuote(validation.data);
  console.log('💾 Quote saved. Additional fields:', quote.additional_fields);

  // Send notification to admin
  try {
    const adminEmail = await getAdminEmail();
    if (adminEmail) {
      await sendNotificationSafely({
        templateKey: 'new_quote_received',
        recipient: {
          email: adminEmail,
        },
        variables: {
          quoteName: quote.full_name,
          quoteEmail: quote.email,
          quoteLocation: quote.event_location,
          quoteDate: quote.event_date,
          quoteDescription: quote.description,
        },
      });
      console.log('✅ Notificação de novo orçamento enviada para admin');
    } else {
      console.warn('⚠️ Email do admin não encontrado, notificação não enviada');
    }
  } catch (error: any) {
    // Don't break the flow if notification fails
    console.error('❌ Erro ao enviar notificação de novo orçamento:', error);
  }

  res.json({
    success: true,
    data: quote,
    message: 'Orçamento enviado com sucesso! Entraremos em contato em breve.',
  });
});

/**
 * GET /api/quotes
 * Get all quotes (admin only)
 */
export const getQuotesController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  if (!isAdmin) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas administradores podem visualizar orçamentos',
    });
    return;
  }

  const filters: any = {};
  if (req.query.status) {
    filters.status = req.query.status as string;
  }
  if (req.query.search) {
    filters.search = req.query.search as string;
  }

  const quotes = await getQuotes(filters);

  res.json({
    success: true,
    data: quotes,
  });
});

/**
 * GET /api/quotes/new-count
 * Get count of new quotes (admin only)
 */
export const getNewQuotesCountController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  if (!isAdmin) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas administradores podem visualizar contagem de orçamentos',
    });
    return;
  }

  const count = await getNewQuotesCount();

  res.json({
    success: true,
    data: { count },
  });
});

/**
 * GET /api/quotes/:id
 * Get quote by ID (admin only)
 */
export const getQuoteByIdController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  if (!isAdmin) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas administradores podem visualizar orçamentos',
    });
    return;
  }

  const { id } = req.params;
  const quote = await getQuoteById(id);

  if (!quote) {
    res.status(404).json({
      success: false,
      error: 'Not Found',
      message: 'Orçamento não encontrado',
    });
    return;
  }

  res.json({
    success: true,
    data: quote,
  });
});

/**
 * PUT /api/quotes/:id
 * Update quote (admin only)
 */
export const updateQuoteController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  if (!isAdmin) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas administradores podem atualizar orçamentos',
    });
    return;
  }

  const { id } = req.params;
  const validation = updateQuoteSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: validation.error.errors[0].message,
      details: validation.error.errors,
    });
    return;
  }

  const quote = await updateQuote(id, validation.data);

  res.json({
    success: true,
    data: quote,
    message: 'Orçamento atualizado com sucesso',
  });
});

