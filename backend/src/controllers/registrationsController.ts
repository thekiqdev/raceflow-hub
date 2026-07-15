import { Response, Request } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import {
  getRegistrations,
  getRegistrationById,
  createRegistration,
  updateRegistration,
  replaceRegistrationProductSelectionsForEdit,
  findUserByCpfOrEmail,
  findUserByEmail,
  transferRegistration,
  performAdminRegistrationSplitTransfer,
  cancelRegistration,
  getRegistrationsWithMissingAttributes,
  completeRegistrationAttributes,
  removeRegistrationAttributes,
  completeInvitationRegistration,
  type ProductSelection,
} from '../services/registrationsService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { hasRole } from '../services/userRolesService.js';
import { getEventById } from '../services/eventsService.js';
import { getGroupLeaderById } from '../services/groupLeadersService.js';
import { getCategoryById } from '../services/categoriesService.js';
import { createCustomer, createPayment, createCreditCardPayment, getPaymentByRegistrationId, getTotalPaidForRegistration, getAmountPaidForOrganizer, getPendingPaymentsForRegistration, getPaymentStatus as getAsaasPaymentStatus, markPaymentAsManualConfirmed, deletePaymentInAsaasOnly, syncRegistrationPaymentStatus, cancelPayment, validateOrRecreateCustomer } from '../services/asaasService.js';
import { getAsaasPaymentStatusWithPollCache } from '../services/asaasPaymentStatusPollCache.js';
import { getProfileByUserId } from '../services/profilesService.js';
import { query, getClient } from '../config/database.js';
import { sendNotificationSafely, getUserEmail, getUserName, getOrganizerEmail } from '../services/notificationService.js';
import { getLeaderEventCommissionById } from '../services/leaderEventCommissionsService.js';
import { getCouponByEventCommission, getCouponByCodeOnly } from '../services/couponsService.js';
import { createCommission, getCommissionByRegistrationId, adminCancelCommission } from '../services/commissionsService.js';
import { recalculateAndRevokeExcessInvitations } from '../services/leaderBonusService.js';
import { executeInvitationBonusDomainCommand } from '../services/invitationBonusDomainOrchestrator.js';
import { z } from 'zod';
import {
  formatTransferDeadlineClosedMessagePtBr,
  isPublicTransferDeadlinePassed,
} from '../utils/eventTransferDeadline.js';
import { EventRegistrationStatus, Event } from '../types/index.js';
import { calculateRegistrationStatus } from '../services/eventsService.js';
import { findRegistrationsMissingKitProductSelections } from '../services/registrationKitSelectionAuditService.js';
import { planRegistrationKitCategorySelectionSync } from '../services/registrationKitCategorySelectionService.js';
import { getRegistrationEditableKitContext } from '../services/registrationEditableKitContextService.js';

/**
 * Obtém o status efetivo de inscrições do evento
 * - Se modo automático está ativado, calcula baseado nas datas
 * - Se modo automático está desativado, usa o status manual
 * - Se ambos são NULL, retorna NULL (usa lógica antiga)
 */
function getEffectiveRegistrationStatus(event: Event): EventRegistrationStatus | null {
  // Se modo automático está ativado, calcular baseado nas datas
  if (event.registration_auto_mode && event.registration_start_date && event.registration_end_date) {
    const calculatedStatus = calculateRegistrationStatus({
      registration_auto_mode: event.registration_auto_mode,
      registration_start_date: event.registration_start_date,
      registration_end_date: event.registration_end_date,
    });
    if (calculatedStatus) {
      return calculatedStatus;
    }
  }
  
  // Caso contrário, usar status manual
  return event.registration_status || null;
}

// Schema for credit card data validation
const creditCardDataSchema = z.object({
  holderName: z.string().min(3, 'Nome do titular é obrigatório'),
  number: z.string().regex(/^\d{13,19}$/, 'Número do cartão inválido (deve ter entre 13 e 19 dígitos)'),
  expiryMonth: z.string().regex(/^(0[1-9]|1[0-2])$/, 'Mês de validade inválido (01-12)'),
  expiryYear: z.string().regex(/^\d{4}$/, 'Ano de validade inválido (YYYY)'),
  ccv: z.string().regex(/^\d{3,4}$/, 'CVV inválido (deve ter 3 ou 4 dígitos)'),
});

// Schema for credit card holder info validation
const creditCardHolderInfoSchema = z.object({
  name: z.string().min(3, 'Nome completo é obrigatório'),
  email: z.string().email('E-mail inválido'),
  cpfCnpj: z.string().regex(/^\d{11,14}$/, 'CPF/CNPJ inválido'),
  postalCode: z.string().regex(/^\d{8}$/, 'CEP inválido (deve ter 8 dígitos)'),
  addressNumber: z.string().min(1, 'Número do endereço é obrigatório'),
  addressComplement: z.string().optional(),
  phone: z.string().min(10, 'Telefone é obrigatório'),
  mobilePhone: z.string().optional(),
});

// Schema for product selection
const productSelectionSchema = z.object({
  product_id: z.string().uuid('ID do produto inválido'),
  variant_id: z.string().uuid('ID da variação inválido').optional(),
  attribute_selections: z.record(z.string(), z.string()).optional(),
});

// Schema for completing registration attributes
const completeAttributesSchema = z.object({
  product_selections: z.array(
    z.object({
      product_id: z.string().uuid(),
      variant_id: z.string().uuid().optional(),
      attribute_selections: z.record(z.string(), z.string()).refine(
        (val) => Object.keys(val).length > 0,
        { message: 'At least one attribute selection is required' }
      ),
    })
  ).min(1, { message: 'At least one product selection is required' }),
});

// Schema for create registration request
const createRegistrationSchema = z.object({
  event_id: z.string().uuid('ID do evento inválido'),
  runner_id: z.string().uuid('ID do corredor inválido').optional(),
  category_id: z.string().uuid('ID da categoria inválido'),
  kit_id: z.string().uuid('ID do kit inválido').optional(),
  modality_id: z.string().uuid('ID da modalidade inválido').optional().nullable(),
  payment_method: z.enum(['pix', 'credit_card', 'boleto']).optional(),
  total_amount: z.number().min(0, 'Valor total deve ser maior ou igual a zero'),
  coupon_code: z.string().optional(),
  product_selections: z.array(productSelectionSchema).optional(),
  credit_card: creditCardDataSchema.optional(),
  credit_card_holder_info: creditCardHolderInfoSchema.optional(),
  /** Valores dos campos personalizados da categoria (category_custom_field_id -> value) */
  custom_field_values: z.record(z.string().uuid(), z.string()).optional(),
}).refine((data) => {
  // If payment_method is 'credit_card', credit_card and credit_card_holder_info are required
  if (data.payment_method === 'credit_card') {
    return data.credit_card !== undefined && data.credit_card_holder_info !== undefined;
  }
  return true;
}, {
  message: 'Dados do cartão de crédito são obrigatórios quando o método de pagamento é cartão de crédito',
  path: ['credit_card'],
}).refine((data) => {
  // If payment_method is not 'credit_card', credit_card and credit_card_holder_info should not be provided
  if (data.payment_method !== 'credit_card') {
    return data.credit_card === undefined && data.credit_card_holder_info === undefined;
  }
  return true;
}, {
  message: 'Dados do cartão de crédito não devem ser fornecidos quando o método de pagamento não é cartão de crédito',
  path: ['credit_card'],
});

/**
 * Helper function to send registration notifications
 */
async function sendRegistrationNotifications(
  registration: any,
  event: any,
  runnerId: string
): Promise<void> {
  try {
    const runnerEmail = await getUserEmail(runnerId);
    const runnerName = await getUserName(runnerId);
    const organizerId = event.organizer_id;
    const organizerEmail = await getOrganizerEmail(organizerId);
    const organizerName = event.organizer_name || 'Organizador';

    // Format event date
    const eventDate = event.event_date ? new Date(event.event_date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }) : 'Data não informada';

    // Format event location
    const eventLocation = event.location || `${event.city || ''}${event.city && event.state ? ' - ' : ''}${event.state || ''}`.trim() || 'Local não informado';

    // Format total amount
    const totalAmount = registration.total_amount > 0 
      ? `R$ ${parseFloat(registration.total_amount).toFixed(2).replace('.', ',')}`
      : 'Gratuito';

    // Send notification to runner
    if (runnerEmail) {
      if (registration.status === 'confirmed' || registration.payment_status === 'paid' || registration.payment_status === 'convidado') {
        // Registration confirmed (free or paid)
        await sendNotificationSafely({
          templateKey: 'registration_confirmed',
          recipient: {
            email: runnerEmail,
            name: runnerName || undefined,
          },
          variables: {
            userName: runnerName || 'Atleta',
            eventTitle: event.title,
            registrationCode: registration.confirmation_code,
            eventDate: eventDate,
            eventLocation: eventLocation,
          },
        });
        console.log('✅ Notificação de inscrição confirmada enviada para runner');
      } else {
        // Registration pending payment
        await sendNotificationSafely({
          templateKey: 'registration_pending',
          recipient: {
            email: runnerEmail,
            name: runnerName || undefined,
          },
          variables: {
            userName: runnerName || 'Atleta',
            eventTitle: event.title,
            totalAmount: totalAmount,
          },
        });
        console.log('✅ Notificação de inscrição pendente enviada para runner');
      }
    } else {
      console.warn(`⚠️ Email do runner ${runnerId} não encontrado, notificação não enviada`);
    }

    // Send notification to organizer
    if (organizerEmail) {
      await sendNotificationSafely({
        templateKey: 'new_registration',
        recipient: {
          email: organizerEmail,
        },
        variables: {
          organizerName: organizerName,
          eventTitle: event.title,
          athleteName: runnerName || 'Atleta',
          registrationCode: registration.confirmation_code,
          totalAmount: totalAmount,
        },
      });
      console.log('✅ Notificação de nova inscrição enviada para organizer');
    } else {
      console.warn(`⚠️ Email do organizador ${organizerId} não encontrado, notificação não enviada`);
    }
  } catch (error: any) {
    // Don't break the flow if notification fails
    console.error('❌ Erro ao enviar notificações de inscrição:', error);
  }
}

// Get registrations
export const getAllRegistrations = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const filters: any = {};

  const isAdmin = await hasRole(req.user.id, 'admin');
  const isOrganizer = await hasRole(req.user.id, 'organizer');

  // Non-admin/organizer users can only see their own registrations
  if (!isAdmin && !isOrganizer) {
    filters.runner_id = req.user.id;
  } else {
    // Organizers can filter by their own events
    if (isOrganizer && !isAdmin) {
      filters.organizer_id = req.user.id;
    }
    
    if (req.query.event_id) {
      filters.event_id = req.query.event_id;
    }
    if (req.query.runner_id) {
      filters.runner_id = req.query.runner_id;
    }
    if (req.query.status) {
      filters.status = req.query.status;
    }
    if (req.query.payment_status) {
      filters.payment_status = req.query.payment_status;
    }
    if (req.query.search) {
      filters.search = req.query.search;
    }
    if (req.query.category_id) {
      filters.category_id = req.query.category_id as string;
    }
    if (req.query.modality_id) {
      filters.modality_id = req.query.modality_id as string;
    }
    if (req.query.kit_id) {
      filters.kit_id = req.query.kit_id as string;
    }
    if (req.query.created_at_from) {
      filters.created_at_from = req.query.created_at_from as string;
    }
    if (req.query.created_at_to) {
      filters.created_at_to = req.query.created_at_to as string;
    }
    if (req.query.registration_kind) {
      filters.registration_kind = req.query.registration_kind as string;
    }
  }

  const pageRaw = req.query.page;
  const pageSizeRaw = req.query.page_size ?? req.query.limit;
  const usePagination =
    (pageRaw !== undefined && pageRaw !== '') ||
    (pageSizeRaw !== undefined && pageSizeRaw !== '');

  if (usePagination) {
    const page = Math.max(1, parseInt(String(pageRaw ?? '1'), 10) || 1);
    let rawSize = parseInt(String(pageSizeRaw ?? '20'), 10);
    if (rawSize < 1 || rawSize > 100) {
      rawSize = 20;
    }
    const page_size = rawSize;
    const paginated = await getRegistrations(filters, { page, page_size });
    res.json({
      success: true,
      data: {
        ...paginated,
        pagination: {
          page: paginated.page,
          limit: paginated.page_size,
          total: paginated.total,
          totalPages: paginated.total_pages,
        },
      },
    });
    return;
  }

  const registrations = await getRegistrations(filters);

  res.json({
    success: true,
    data: registrations,
  });
});

// Get registrations with missing attributes
export const getRegistrationsWithMissingAttributesController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
      message: 'Usuário não autenticado',
    });
    return;
  }

  try {
    // Validate user ID format (UUID)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.user.id)) {
      res.status(400).json({
        success: false,
        error: 'Invalid user ID format',
        message: 'ID de usuário inválido',
      });
      return;
    }

    if (process.env.LOG_MISSING_ATTR_VERBOSE === 'true' || process.env.NODE_ENV !== 'production') {
      console.log(`🔍 getRegistrationsWithMissingAttributesController - userId: ${req.user.id}`);
    }
    const registrations = await getRegistrationsWithMissingAttributes(req.user.id);
    if (process.env.LOG_MISSING_ATTR_VERBOSE === 'true' || process.env.NODE_ENV !== 'production') {
      console.log(
        `🔍 getRegistrationsWithMissingAttributesController - resultado: ${registrations.length} inscrições`
      );
    }

    res.json({
      success: true,
      data: registrations,
    });
  } catch (error: any) {
    console.error('Error getting registrations with missing attributes:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Erro ao buscar inscrições com atributos pendentes',
    });
  }
});

/**
 * GET /api/registrations/audit/missing-kit-product-selections?event_id=&limit=
 * Somente admin. Read-only: inscrições não canceladas com kit que tem produto variável
 * e zero linhas em registration_product_selections.
 */
export const auditMissingKitProductSelectionsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }
  const isAdmin = await hasRole(req.user.id, 'admin');
  if (!isAdmin) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas administradores podem executar esta auditoria.',
    });
    return;
  }

  const eventIdRaw = req.query.event_id;
  const limitRaw = req.query.limit;
  let event_id: string | undefined;
  if (eventIdRaw !== undefined && eventIdRaw !== '') {
    if (
      typeof eventIdRaw !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventIdRaw)
    ) {
      res.status(400).json({ success: false, error: 'event_id inválido' });
      return;
    }
    event_id = eventIdRaw;
  }
  let limit = 2000;
  if (limitRaw !== undefined && limitRaw !== '') {
    const n = parseInt(String(limitRaw), 10);
    if (!Number.isFinite(n) || n < 1) {
      res.status(400).json({ success: false, error: 'limit inválido' });
      return;
    }
    limit = Math.min(n, 5000);
  }

  const items = await findRegistrationsMissingKitProductSelections({ event_id, limit });
  res.json({
    success: true,
    data: {
      items,
      count: items.length,
      criteria:
        'Inscrição não cancelada, com kit_id, kit possui produto variable com variant_attributes preenchido, e não existe linha em registration_product_selections.',
    },
  });
});

// Complete registration attributes
export const completeRegistrationAttributesController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const { id } = req.params;

  // Validate registration ID format (UUID)
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    res.status(400).json({
      success: false,
      error: 'Invalid registration ID format',
      message: 'ID de inscrição inválido',
    });
    return;
  }

  // Validate request body
  const validation = completeAttributesSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: validation.error.errors[0].message,
      details: validation.error.errors,
    });
    return;
  }

  try {
    // Check if user is admin or organizer
    const isAdmin = await hasRole(req.user.id, 'admin');
    const isOrganizer = await hasRole(req.user.id, 'organizer');
    
    // Get registration to check permissions
    const registration = await getRegistrationById(id);
    if (!registration) {
      res.status(404).json({
        success: false,
        error: 'Registration not found',
        message: 'Inscrição não encontrada',
      });
      return;
    }

    // Check permissions
    if (!isAdmin) {
      if (isOrganizer) {
        // Check if organizer edit attributes module is enabled
        const { getSystemSettings } = await import('../services/systemSettingsService.js');
        const settings = await getSystemSettings();
        const organizerEditEnabled = settings.enabled_modules?.organizer_edit_attributes || false;
        
        if (!organizerEditEnabled) {
          res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: 'A edição de atributos pelo organizador está desabilitada',
          });
          return;
        }
        
        // Organizers can only edit attributes from their own events
        const event = await getEventById(registration.event_id);
        if (!event || event.organizer_id !== req.user.id) {
          res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: 'Você não tem permissão para editar atributos desta inscrição',
          });
          return;
        }
      } else {
        // Regular users can only edit their own registrations
        if (registration.runner_id !== req.user.id && registration.registered_by !== req.user.id) {
          res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: 'Você não tem permissão para editar atributos desta inscrição',
          });
          return;
        }
      }
    }
    
    // For admins and organizers, use the registration's runner_id instead of req.user.id
    // This allows them to edit any registration (admin) or registrations from their events (organizer)
    let userId = req.user.id;
    if (isAdmin || isOrganizer) {
      userId = registration.runner_id || req.user.id;
    }

    const result = await completeRegistrationAttributes(
      id,
      userId,
      validation.data.product_selections
    );

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    console.error('Error completing registration attributes:', error);
    
    if (error.message === 'Registration not found') {
      res.status(404).json({
        success: false,
        error: 'Registration not found',
        message: 'Inscrição não encontrada',
      });
      return;
    }

    if (error.message.includes('permission')) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: error.message,
      });
      return;
    }

    if (error.message.includes('cancelled')) {
      res.status(400).json({
        success: false,
        error: 'Invalid operation',
        message: error.message,
      });
      return;
    }

    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: error.message || 'Erro ao salvar seleções de atributos',
    });
  }
});

// Schema for removing registration attributes
const removeAttributesSchema = z.object({
  product_ids: z.array(z.string().uuid()).optional(),
});

/**
 * POST /api/registrations/:id/remove-attributes
 * Remove attribute selections from a registration
 * Allows runner to select attributes again
 */
export const removeRegistrationAttributesController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const { id } = req.params;

  // Validate registration ID format (UUID)
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    res.status(400).json({
      success: false,
      error: 'Invalid registration ID format',
      message: 'ID de inscrição inválido',
    });
    return;
  }

  // Validate request body
  const validation = removeAttributesSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: validation.error.errors[0].message,
      details: validation.error.errors,
    });
    return;
  }

  try {
    // Check if user is admin or organizer
    const isAdmin = await hasRole(req.user.id, 'admin');
    const isOrganizer = await hasRole(req.user.id, 'organizer');
    
    // Get registration to check permissions
    const registration = await getRegistrationById(id);
    if (!registration) {
      res.status(404).json({
        success: false,
        error: 'Registration not found',
        message: 'Inscrição não encontrada',
      });
      return;
    }

    // Check permissions
    if (!isAdmin) {
      // Organizers can only remove attributes from their own events
      if (isOrganizer) {
        // Check if organizer edit attributes module is enabled
        const { getSystemSettings } = await import('../services/systemSettingsService.js');
        const settings = await getSystemSettings();
        const organizerEditEnabled = settings.enabled_modules?.organizer_edit_attributes || false;
        
        if (!organizerEditEnabled) {
          res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: 'A edição de atributos pelo organizador está desabilitada',
          });
          return;
        }
        
        const event = await getEventById(registration.event_id);
        if (!event || event.organizer_id !== req.user.id) {
          res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: 'Você não tem permissão para remover atributos desta inscrição',
          });
          return;
        }
      } else {
        // Regular users cannot remove attributes
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Você não tem permissão para remover atributos',
        });
        return;
      }
    }

    // Remove attributes
    const result = await removeRegistrationAttributes(id, validation.data.product_ids);

    // Send notification to runner if attributes were removed
    if (registration.runner_id) {
      try {
        const event = await getEventById(registration.event_id);
        const runnerEmail = await getUserEmail(registration.runner_id);
        const runnerName = await getUserName(registration.runner_id);

        if (runnerEmail && event) {
          await sendNotificationSafely({
            templateKey: 'registration_attributes_removed',
            recipient: {
              email: runnerEmail,
              name: runnerName || undefined,
            },
            variables: {
              userName: runnerName || 'Atleta',
              eventTitle: event.title,
              registrationCode: registration.confirmation_code || '',
              dashboardUrl: `${process.env.FRONTEND_URL || 'http://localhost:8080'}/runner/dashboard`,
            },
          });
          console.log(`✅ Notificação enviada ao corredor ${registration.runner_id} sobre remoção de atributos`);
        }
      } catch (notificationError: any) {
        // Don't break the flow if notification fails
        console.error('❌ Erro ao enviar notificação de remoção de atributos:', notificationError);
      }
    }

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    console.error('Error removing registration attributes:', error);
    
    if (error.message === 'Registration not found') {
      res.status(404).json({
        success: false,
        error: 'Registration not found',
        message: 'Inscrição não encontrada',
      });
      return;
    }

    if (error.message.includes('cancelled')) {
      res.status(400).json({
        success: false,
        error: 'Invalid operation',
        message: error.message,
      });
      return;
    }

    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: error.message || 'Erro ao remover seleções de atributos',
    });
  }
});

const completeInvitationBodySchema = z.object({
  category_id: z.string().uuid(),
  modality_id: z.string().uuid().nullable().optional(),
  kit_id: z.string().uuid().nullable().optional(),
  product_selections: z.array(z.object({
    product_id: z.string().uuid(),
    variant_id: z.string().uuid().optional(),
    attribute_selections: z.record(z.string(), z.string()).optional(),
  })).optional(),
  custom_field_values: z.record(z.string().uuid(), z.string()).optional(),
});

export const completeInvitationController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }
  const { id } = req.params;
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    res.status(400).json({ success: false, error: 'Invalid registration ID' });
    return;
  }
  const parse = completeInvitationBodySchema.safeParse(req.body || {});
  if (!parse.success) {
    res.status(400).json({ success: false, error: parse.error.errors[0]?.message || 'Dados inválidos.' });
    return;
  }
  const body = parse.data;
  try {
    const updated = await completeInvitationRegistration(id, req.user.id, {
      category_id: body.category_id,
      modality_id: body.modality_id ?? null,
      kit_id: body.kit_id ?? null,
      product_selections: body.product_selections,
      custom_field_values: body.custom_field_values,
    });
    res.json({ success: true, data: updated, message: 'Convite completado com sucesso.' });
  } catch (error: any) {
    if (error.message?.includes('não encontrada') || error.message?.includes('not found')) {
      res.status(404).json({ success: false, error: error.message });
      return;
    }
    if (error.message?.includes('permissão') || error.message?.includes('convidado') || error.message?.includes('cancelada')) {
      res.status(403).json({ success: false, error: error.message });
      return;
    }
    res.status(400).json({ success: false, error: error.message || 'Erro ao completar convite.' });
  }
});

// Get registration by ID for validation (public endpoint - no authentication required)
export const getRegistrationForValidation = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const registration = await getRegistrationById(id);

  if (!registration) {
    res.status(404).json({
      success: false,
      error: 'Registration not found',
      message: 'Inscrição não encontrada',
    });
    return;
  }

  // Get product selections if available
  let productSelections = null;
  try {
    const { getRegistrationProductSelections } = await import('../services/registrationProductSelectionsService.js');
    productSelections = await getRegistrationProductSelections(id);
  } catch (error: any) {
    // Log error but don't fail the request if product selections can't be loaded
    console.error('⚠️ Erro ao carregar seleções de produtos/variantes:', error.message);
  }

  // Return only public data needed for validation
  res.json({
    success: true,
    data: {
      id: registration.id,
      confirmation_code: registration.confirmation_code,
      status: registration.status,
      payment_status: registration.payment_status,
      event_title: registration.event_title,
      event_date: registration.event_date,
      location: registration.location,
      city: registration.city,
      state: registration.state,
      category_name: registration.category_name,
      category_distance: registration.category_distance,
      modality_name: registration.modality_name,
      kit_name: registration.kit_name,
      total_amount: registration.total_amount,
      runner_name: registration.runner_name,
      runner_cpf: registration.runner_cpf,
      created_at: registration.created_at,
      product_selections: productSelections || [],
    },
  });
});

// Check if user already has an active registration for an event
export const checkExistingRegistrationController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const { event_id } = req.query;

  if (!event_id || typeof event_id !== 'string') {
    res.status(400).json({
      success: false,
      error: 'Missing event_id',
      message: 'event_id é obrigatório',
    });
    return;
  }

  // Check if user already has an active registration for this event
  const existingRegistration = await query(
    `SELECT id, status, payment_status FROM registrations 
     WHERE event_id = $1 AND runner_id = $2 AND status != 'cancelled'`,
    [event_id, req.user.id]
  );

  res.json({
    success: true,
    data: {
      hasExistingRegistration: existingRegistration.rows.length > 0,
      registration: existingRegistration.rows.length > 0 ? existingRegistration.rows[0] : null,
    },
  });
});

// Get registration by ID
export const getRegistration = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const { id } = req.params;
  // Pass viewerId to get correct display status (confirmed for new owner, transferred for old owner)
  const registration = await getRegistrationById(id, req.user.id);

  if (!registration) {
    res.status(404).json({
      success: false,
      error: 'Registration not found',
    });
    return;
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  const isOrganizer = await hasRole(req.user.id, 'organizer');
  const isOwner = registration.runner_id === req.user.id || registration.registered_by === req.user.id;

  // Check if organizer owns the event
  let isEventOrganizer = false;
  if (isOrganizer) {
    const event = await getEventById(registration.event_id);
    isEventOrganizer = event?.organizer_id === req.user.id;
  }

  if (!isAdmin && !isEventOrganizer && !isOwner) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'You do not have permission to view this registration',
    });
    return;
  }

  // Get product selections if available
  let productSelections = null;
  try {
    const { getRegistrationProductSelections } = await import('../services/registrationProductSelectionsService.js');
    productSelections = await getRegistrationProductSelections(id);
  } catch (error: any) {
    // Log error but don't fail the request if product selections can't be loaded
    console.error('⚠️ Erro ao carregar seleções de produtos/variantes:', error.message);
  }

  res.json({
    success: true,
    data: {
      ...registration,
      product_selections: productSelections || [],
    },
  });
});

/** GET /registrations/:id/editable-kit-context — produtos/variantes do kit efetivo da inscrição (edição). */
export const getRegistrationEditableKitContextController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const { id } = req.params;
  const registration = await getRegistrationById(id, req.user.id);

  if (!registration) {
    res.status(404).json({
      success: false,
      error: 'Registration not found',
    });
    return;
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  const isOrganizer = await hasRole(req.user.id, 'organizer');
  const isOwner = registration.runner_id === req.user.id || registration.registered_by === req.user.id;

  let isEventOrganizer = false;
  if (isOrganizer) {
    const event = await getEventById(registration.event_id);
    isEventOrganizer = event?.organizer_id === req.user.id;
  }

  if (!isAdmin && !isEventOrganizer && !isOwner) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'You do not have permission to view this registration',
    });
    return;
  }

  const data = await getRegistrationEditableKitContext(id);
  if (!data) {
    res.status(404).json({
      success: false,
      error: 'Registration not found',
    });
    return;
  }

  res.json({
    success: true,
    data,
  });
});

// Create registration
export const createRegistrationController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  // ETAPA: Validate that user has runner, organizer or admin role
  const isRunner = await hasRole(req.user.id, 'runner');
  const isOrganizer = await hasRole(req.user.id, 'organizer');
  const isAdmin = await hasRole(req.user.id, 'admin');
  
  if (!isRunner && !isOrganizer && !isAdmin) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas corredores, organizadores e administradores podem se inscrever em eventos.',
    });
    return;
  }

  // Validate request body with Zod
  const validation = createRegistrationSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: validation.error.errors[0].message,
      details: validation.error.errors,
    });
    return;
  }

  const { event_id, category_id } = validation.data;

  // ETAPA 7.1: Validate if event is open for registrations
  const event = await getEventById(event_id);
  if (!event) {
    res.status(404).json({
      success: false,
      error: 'Event not found',
      message: 'Evento não encontrado',
    });
    return;
  }

  // Verificar status efetivo de inscrições
  const effectiveRegistrationStatus = getEffectiveRegistrationStatus(event);

  // Se status efetivo está definido, usar nova lógica
  if (effectiveRegistrationStatus !== null) {
    if (effectiveRegistrationStatus === 'not_open') {
      const message = event.registration_auto_mode && event.registration_start_date
        ? `As inscrições abrem em ${new Date(event.registration_start_date).toLocaleString('pt-BR')}.`
        : 'As inscrições ainda não estão abertas. Aguarde o anúncio oficial.';
      
      res.status(400).json({
        success: false,
        error: 'Registrations not open yet',
        message,
      });
      return;
    }

    if (effectiveRegistrationStatus === 'closed') {
      const message = event.registration_auto_mode && event.registration_end_date
        ? `As inscrições foram encerradas em ${new Date(event.registration_end_date).toLocaleString('pt-BR')}.`
        : 'As inscrições para este evento foram encerradas.';
      
      res.status(400).json({
        success: false,
        error: 'Registrations closed',
        message,
      });
      return;
    }

    // Se effectiveRegistrationStatus === 'open', continuar com validações abaixo
  } else {
    // Se effectiveRegistrationStatus é NULL, usar lógica antiga baseada em event.status
  if (event.status === 'draft') {
    res.status(400).json({
      success: false,
      error: 'Event not open for registrations',
      message: 'Este evento ainda não está aberto para inscrições',
    });
    return;
  }

  if (event.status === 'finished' || event.status === 'cancelled') {
    res.status(400).json({
      success: false,
      error: 'Event not accepting registrations',
      message: 'Este evento não está mais aceitando inscrições',
      });
      return;
    }
  }

  // Verificar se evento está publicado (sempre necessário)
  if (event.status !== 'published' && event.status !== 'ongoing') {
    res.status(400).json({
      success: false,
      error: 'Event not published',
      message: 'Este evento não está publicado',
    });
    return;
  }

  // ETAPA 7.2: Validate dates (don't allow registration in past events)
  const eventDate = new Date(event.event_date);
  const now = new Date();
  if (eventDate < now) {
    res.status(400).json({
      success: false,
      error: 'Event date has passed',
      message: 'Não é possível se inscrever em eventos que já aconteceram',
    });
    return;
  }

  // ETAPA 7.3: Validate available spots per category
  const selectedCategory = await getCategoryById(category_id);
  
  if (!selectedCategory) {
    res.status(404).json({
      success: false,
      error: 'Category not found',
      message: 'Categoria não encontrada',
    });
    return;
  }

  // Verify category belongs to the event
  if (selectedCategory.event_id !== event_id) {
    res.status(400).json({
      success: false,
      error: 'Category does not belong to this event',
      message: 'A categoria não pertence a este evento',
    });
    return;
  }

  // Check if category has available spots
  if (selectedCategory.max_participants !== null && selectedCategory.max_participants > 0) {
    // Count current registrations for this category
    const registrationsCount = await query(
      `SELECT COUNT(*) as count 
       FROM registrations 
       WHERE category_id = $1 
       AND status != 'cancelled' 
       AND payment_status IN ('pending', 'paid')`,
      [category_id]
    );
    
    const currentCount = parseInt(registrationsCount.rows[0].count) || 0;
    const availableSpots = selectedCategory.max_participants - currentCount;
    
    if (availableSpots <= 0) {
      res.status(400).json({
        success: false,
        error: 'Category is full',
        message: 'Esta categoria está esgotada. Por favor, escolha outra categoria',
      });
      return;
    }
  }

  // Check modality limits (if category is associated with modalities that have limits)
  const { getModalitiesByEvent } = await import('../services/modalitiesService.js');
  const modalities = await getModalitiesByEvent(event_id);
  
  // Get modality IDs associated with this category
  const categoryModalities = await query(
    `SELECT modality_id FROM category_modalities WHERE category_id = $1`,
    [category_id]
  );
  
  const modalityIds = categoryModalities.rows.map(row => row.modality_id);
  
  // Check each modality limit
  for (const modalityId of modalityIds) {
    const modality = modalities.find(m => m.id === modalityId);
    if (modality && modality.max_participants !== null && modality.max_participants > 0) {
      // Count registrations for this modality (through all categories associated with it)
      const modalityRegistrations = await query(
        `SELECT COUNT(DISTINCT r.id) as count
         FROM registrations r
         INNER JOIN category_modalities cm ON r.category_id = cm.category_id
         WHERE cm.modality_id = $1
         AND r.status != 'cancelled'
         AND r.payment_status IN ('pending', 'paid')`,
        [modalityId]
      );
      
      const currentModalityCount = parseInt(modalityRegistrations.rows[0].count) || 0;
      const availableModalitySpots = modality.max_participants - currentModalityCount;
      
      if (availableModalitySpots <= 0) {
        res.status(400).json({
          success: false,
          error: 'Modality is full',
          message: `A modalidade "${modality.name}" atingiu o limite máximo de ${modality.max_participants} participantes. Por favor, escolha outra modalidade.`,
        });
        return;
      }
    }
  }

  // OK Etapa 1: Calcular platform_fee_amount (taxa da plataforma na inscrição inicial)
  let platformFeeAmount = 0;
  const totalAmount = Number(validation.data.total_amount) || 0;
  if (totalAmount > 0) {
    const { getSystemSettings } = await import('../services/systemSettingsService.js');
    const { calculateValueWithoutFee } = await import('../utils/feeCalculations.js');
    const settings = await getSystemSettings();
    const platformFeesEnabled = settings.enabled_modules?.platform_fees === true;
    const platformFee = Number(settings.platform_fee) || 0;
    const platformFeeType = (settings.platform_fee_type as 'fixed' | 'percentage') || 'fixed';
    const platformFeeMin = Number(settings.platform_fee_min) || 0;
    if (platformFeesEnabled && platformFee > 0) {
      const valueWithoutFee = calculateValueWithoutFee(totalAmount, platformFee, platformFeeType, platformFeeMin);
      platformFeeAmount = Math.round((totalAmount - valueWithoutFee) * 100) / 100;
    }
  }

  const registrationData = {
    ...validation.data,
    registered_by: req.user.id,
    runner_id: validation.data.runner_id || req.user.id,
    platform_fee_amount: platformFeeAmount,
  };

  // Verificar se o corredor já tem uma inscrição ativa neste evento
  const existingRegistration = await query(
    `SELECT id, status, payment_status FROM registrations 
     WHERE event_id = $1 AND runner_id = $2 AND status != 'cancelled'`,
    [event_id, registrationData.runner_id]
  );

  if (existingRegistration.rows.length > 0) {
    res.status(400).json({
      success: false,
      error: 'Already registered',
      message: 'Você já possui uma inscrição ativa neste evento. Cada corredor pode se inscrever apenas uma vez por evento.',
    });
    return;
  }

  console.log('📝 Dados recebidos para criação de inscrição:', {
    event_id: registrationData.event_id,
    category_id: registrationData.category_id,
    kit_id: registrationData.kit_id,
    total_amount: registrationData.total_amount,
    payment_method: registrationData.payment_method,
  });

  if (registrationData.kit_id) {
    try {
      const { validateKitVisibleForPublicRegistration } = await import('../services/eventKitsService.js');
      await validateKitVisibleForPublicRegistration(registrationData.kit_id, event_id);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Kit inválido para inscrição pública.';
      res.status(400).json({
        success: false,
        error: 'Invalid kit',
        message,
      });
      return;
    }
  }

  // Create registration
  const registration = await createRegistration(registrationData);

  console.log('✅ Inscrição criada:', {
    id: registration.id,
    total_amount: registration.total_amount,
    status: registration.status,
    payment_status: registration.payment_status,
  });

  // Create payment in Asaas only if total_amount > 0
  let paymentData: any = null;
  
  console.log(`🔍 Verificando necessidade de pagamento: total_amount = ${registration.total_amount}`);
  
  if (registration.total_amount > 0) {
    console.log('💳 Iniciando criação de pagamento no Asaas...');
    try {
      const runnerId = registrationData.runner_id || req.user.id;
      
      // Get user profile and email for Asaas customer
      const profile = await getProfileByUserId(runnerId);
      if (!profile) {
        throw new Error('Perfil do usuário não encontrado');
      }

      // Get user email from users table
      const userResult = await query(
        'SELECT email FROM users WHERE id = $1',
        [runnerId]
      );
      
      if (userResult.rows.length === 0) {
        throw new Error('Usuário não encontrado');
      }
      
      const userEmail = userResult.rows[0].email;

        // Prepare customer data for Asaas
        const customerData = {
          name: profile.full_name || 'Usuário',
          email: userEmail,
          cpfCnpj: profile.cpf?.replace(/\D/g, '') || '', // Remove formatting
          phone: profile.phone?.replace(/\D/g, '') || '',
          mobilePhone: profile.phone?.replace(/\D/g, '') || '',
        };

      // Validate or recreate Asaas customer (handles migration from sandbox to production)
      const asaasCustomerId = await validateOrRecreateCustomer(runnerId, customerData);

      // Calculate due date (3 days from now)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 3);
      const dueDateString = dueDate.toISOString().split('T')[0]; // YYYY-MM-DD

      // Get payment method from registration data (default to 'pix' if not specified)
      const paymentMethod = registrationData.payment_method || 'pix';

      // Create payment in Asaas
      let paymentResult;
      try {
        if (paymentMethod === 'credit_card') {
          // Credit card payment
          if (!validation.data.credit_card || !validation.data.credit_card_holder_info) {
            throw new Error('Dados do cartão de crédito são obrigatórios');
          }

          console.log('💳 Criando pagamento com cartão de crédito...');
          
          paymentResult = await createCreditCardPayment(
        registration.id,
        asaasCustomerId,
        {
          value: registration.total_amount,
          dueDate: dueDateString,
          description: `Inscrição - ${event.title}`,
              externalReference: registration.confirmation_code || `REG-${registration.id}`,
            },
            validation.data.credit_card,
            validation.data.credit_card_holder_info
          );

          // Handle credit card payment status
          if (paymentResult.status === 'CONFIRMED') {
            // Payment approved immediately - update registration status
            console.log('✅ Pagamento com cartão APROVADO imediatamente');
            await query(
              'UPDATE registrations SET status = $1, payment_status = $2 WHERE id = $3',
              ['confirmed', 'paid', registration.id]
            );
            registration.status = 'confirmed';
            registration.payment_status = 'paid';
          } else if (paymentResult.status === 'PENDING' || paymentResult.status === 'AWAITING_RISK_ANALYSIS') {
            // Payment pending analysis - keep registration as pending
            console.log('⏳ Pagamento com cartão PENDENTE de análise');
            await query(
              'UPDATE registrations SET payment_status = $1 WHERE id = $2',
              ['pending', registration.id]
            );
            registration.payment_status = 'pending';
          } else {
            // Payment declined or other status - keep as pending but log warning
            console.log(`⚠️ Pagamento com cartão com status: ${paymentResult.status}`);
            await query(
              'UPDATE registrations SET payment_status = $1 WHERE id = $2',
              ['pending', registration.id]
            );
            registration.payment_status = 'pending';
          }

          paymentData = {
            asaas_payment_id: paymentResult.asaas_payment_id,
            payment_link: paymentResult.payment_link,
            status: paymentResult.status,
            due_date: paymentResult.due_date,
            payment_method: 'credit_card',
          };
        } else {
          // PIX payment (default)
          console.log('📱 Criando pagamento PIX...');
          
          paymentResult = await createPayment(
            registration.id,
            asaasCustomerId,
            {
              value: registration.total_amount,
              dueDate: dueDateString,
              description: `Inscrição - ${event.title}`,
              billingType: 'PIX',
          externalReference: registration.confirmation_code || `REG-${registration.id}`,
        }
      );

      paymentData = {
        asaas_payment_id: paymentResult.asaas_payment_id,
        pix_qr_code: paymentResult.pix_qr_code,
        pix_qr_code_id: paymentResult.pix_qr_code_id,
        payment_link: paymentResult.payment_link,
        status: paymentResult.status,
        due_date: paymentResult.due_date,
            payment_method: 'pix',
      };
        }

      console.log('✅ Pagamento criado no Asaas:', {
        asaas_payment_id: paymentData.asaas_payment_id,
        status: paymentData.status,
          payment_method: paymentData.payment_method,
        has_qr_code: !!paymentData.pix_qr_code,
        qr_code_id: paymentData.pix_qr_code_id
      });
      } catch (paymentError: any) {
        // If customer is invalid, try to recreate customer and retry payment
        if (paymentError.isInvalidCustomer) {
          console.log('⚠️ Customer inválido detectado, recriando customer e tentando novamente...');
          
          // Remove invalid customer from database
          await query(
            'DELETE FROM asaas_customers WHERE user_id = $1',
            [runnerId]
          );
          
          // Recreate customer
          const customerResult = await createCustomer(runnerId, customerData);
          const newAsaasCustomerId = customerResult.asaas_customer_id;
          
          // Retry payment with new customer (same method as before)
          if (paymentMethod === 'credit_card') {
            if (!validation.data.credit_card || !validation.data.credit_card_holder_info) {
              throw new Error('Dados do cartão de crédito são obrigatórios');
            }

            paymentResult = await createCreditCardPayment(
              registration.id,
              newAsaasCustomerId,
              {
                value: registration.total_amount,
                dueDate: dueDateString,
                description: `Inscrição - ${event.title}`,
                externalReference: registration.confirmation_code || `REG-${registration.id}`,
              },
              validation.data.credit_card,
              validation.data.credit_card_holder_info
            );

            // Handle credit card payment status
            if (paymentResult.status === 'CONFIRMED') {
              await query(
                'UPDATE registrations SET status = $1, payment_status = $2 WHERE id = $3',
                ['confirmed', 'paid', registration.id]
              );
              registration.status = 'confirmed';
              registration.payment_status = 'paid';
            }

            paymentData = {
              asaas_payment_id: paymentResult.asaas_payment_id,
              payment_link: paymentResult.payment_link,
              status: paymentResult.status,
              due_date: paymentResult.due_date,
              payment_method: 'credit_card',
            };
          } else {
            paymentResult = await createPayment(
              registration.id,
              newAsaasCustomerId,
              {
                value: registration.total_amount,
                dueDate: dueDateString,
                description: `Inscrição - ${event.title}`,
                billingType: 'PIX',
                externalReference: registration.confirmation_code || `REG-${registration.id}`,
              }
            );

            paymentData = {
              asaas_payment_id: paymentResult.asaas_payment_id,
              pix_qr_code: paymentResult.pix_qr_code,
              pix_qr_code_id: paymentResult.pix_qr_code_id,
              payment_link: paymentResult.payment_link,
              status: paymentResult.status,
              due_date: paymentResult.due_date,
              payment_method: 'pix',
            };
          }

          console.log('✅ Pagamento criado no Asaas após recriar customer:', {
            asaas_payment_id: paymentData.asaas_payment_id,
            status: paymentData.status,
            payment_method: paymentData.payment_method,
            has_qr_code: !!paymentData.pix_qr_code,
            qr_code_id: paymentData.pix_qr_code_id
          });
        } else {
          // Re-throw other errors
          throw paymentError;
        }
      }
    } catch (error: any) {
      console.error('❌ Erro ao criar pagamento no Asaas:', {
        message: error.message,
        stack: error.stack,
        response: error.response?.data,
        status: error.response?.status
      });
      
      // Check if error is related to invalid CPF
      const errorMessage = error.message || '';
      const errorResponse = error.response?.data;
      const asaasErrors = errorResponse?.errors || [];
      const asaasErrorMessages = asaasErrors.map((e: any) => e.description || '').join(' ').toLowerCase();
      
      const isInvalidCpf = errorMessage.includes('CPF/CNPJ informado é inválido') || 
                          (errorMessage.toLowerCase().includes('cpf') && errorMessage.toLowerCase().includes('inválido')) ||
                          asaasErrorMessages.includes('cpf') && asaasErrorMessages.includes('inválido');
      
      // Registration was created successfully, but payment failed
      // We'll return the registration anyway, but with a warning
      paymentData = {
        error: error.message || 'Erro ao criar pagamento',
        warning: isInvalidCpf 
          ? 'CPF Inválido, entre em contato com o suporte'
          : 'Inscrição criada, mas pagamento não foi processado. Entre em contato com o suporte.',
      };
    }
  } else {
    // Free registration - no payment needed, confirm immediately
    console.log('✅ Inscrição gratuita - sem necessidade de pagamento (total_amount = 0)');
    // Update registration status to confirmed for free registrations
    await query(
      'UPDATE registrations SET status = $1, payment_status = $2 WHERE id = $3',
      ['confirmed', 'paid', registration.id]
    );
    registration.status = 'confirmed';
    registration.payment_status = 'paid';
  }

  // Send notifications
  await sendRegistrationNotifications(registration, event, registration.runner_id);

  res.status(201).json({
    success: true,
    data: {
      ...registration,
      payment: paymentData,
    },
    message: 'Registration created successfully',
  });
});

// Generate payment for registration (creates payment if it doesn't exist)
export const generatePaymentController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const { id } = req.params;

  // Get registration to check ownership
  const registration = await getRegistrationById(id);
  if (!registration) {
    res.status(404).json({
      success: false,
      error: 'Registration not found',
    });
    return;
  }

  // Check if user owns this registration or is admin/organizer
  const isAdmin = await hasRole(req.user.id, 'admin');
  const isOrganizer = await hasRole(req.user.id, 'organizer');
  const isOwner = registration.runner_id === req.user.id || registration.registered_by === req.user.id;
  
  if (!isAdmin && !isOrganizer && !isOwner) {
    res.status(403).json({
      success: false,
      error: 'Forbidden: You can only generate payment for your own registrations',
    });
    return;
  }

  // Check if payment already exists
  const existingPayment = await getPaymentByRegistrationId(id);
  if (existingPayment) {
    // Payment already exists, return it
    res.json({
      success: true,
      data: {
        status: existingPayment.status,
        payment_date: existingPayment.payment_date,
        pix_qr_code: existingPayment.pix_qr_code,
        due_date: existingPayment.due_date,
        asaas_payment_id: existingPayment.asaas_payment_id,
      },
    });
    return;
  }

  // Check if registration requires payment
  if (!registration.total_amount || registration.total_amount <= 0) {
    res.status(400).json({
      success: false,
      error: 'Registration does not require payment',
    });
    return;
  }

  // Get event for description
  const event = await getEventById(registration.event_id);
  if (!event) {
    res.status(404).json({
      success: false,
      error: 'Event not found',
    });
    return;
  }

  try {
    const runnerId = registration.runner_id;
    
    // Get user profile and email for Asaas customer
    const profile = await getProfileByUserId(runnerId);
    if (!profile) {
      res.status(404).json({
        success: false,
        error: 'User profile not found',
      });
      return;
    }

    // Get user email from users table
    const userResult = await query(
      'SELECT email FROM users WHERE id = $1',
      [runnerId]
    );
    
    if (userResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      });
      return;
    }
    
    const userEmail = userResult.rows[0].email;

    // Prepare customer data for Asaas
    const customerData = {
      name: profile.full_name || 'Usuário',
      email: userEmail,
      cpfCnpj: profile.cpf?.replace(/\D/g, '') || '',
      phone: profile.phone?.replace(/\D/g, '') || '',
      mobilePhone: profile.phone?.replace(/\D/g, '') || '',
    };

    // Validate or recreate Asaas customer
    const asaasCustomerId = await validateOrRecreateCustomer(runnerId, customerData);

    // Calculate due date (3 days from now)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3);
    const dueDateString = dueDate.toISOString().split('T')[0];

    // Create payment in Asaas
    let paymentResult;
    try {
      paymentResult = await createPayment(
        registration.id,
        asaasCustomerId,
        {
          value: registration.total_amount,
          dueDate: dueDateString,
          description: `Inscrição - ${event.title}`,
          billingType: 'PIX',
          externalReference: registration.confirmation_code || `REG-${registration.id}`,
        }
      );
    } catch (paymentError: any) {
      // If customer is invalid, try to recreate customer and retry payment
      if (paymentError.isInvalidCustomer) {
        console.log('⚠️ Customer inválido detectado, recriando customer e tentando novamente...');
        
        // Remove invalid customer from database
        await query(
          'DELETE FROM asaas_customers WHERE user_id = $1',
          [runnerId]
        );
        
        // Recreate customer
        const customerResult = await createCustomer(runnerId, customerData);
        const newAsaasCustomerId = customerResult.asaas_customer_id;
        
        // Retry payment with new customer
        paymentResult = await createPayment(
          registration.id,
          newAsaasCustomerId,
          {
            value: registration.total_amount,
            dueDate: dueDateString,
            description: `Inscrição - ${event.title}`,
            billingType: 'PIX',
            externalReference: registration.confirmation_code || `REG-${registration.id}`,
          }
        );
      } else {
        throw paymentError;
      }
    }

    res.json({
      success: true,
      data: {
        status: paymentResult.status,
        payment_date: null,
        pix_qr_code: paymentResult.pix_qr_code,
        due_date: paymentResult.due_date,
        asaas_payment_id: paymentResult.asaas_payment_id,
      },
    });
  } catch (error: any) {
    console.error('❌ Erro ao gerar pagamento:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao gerar pagamento',
    });
  }
});

// Create registration by organizer for an athlete
export const createRegistrationByOrganizerController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const isOrganizer = await hasRole(req.user.id, 'organizer');
  if (!isOrganizer) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message:
        'Apenas organizadores podem usar esta rota. Administradores: use POST /api/registrations/admin/register-athlete.',
    });
    return;
  }

  const { cpf, runner_data, event_id, category_id, kit_id, modality_id, product_selections, custom_field_values } = req.body;

  if (!cpf || !event_id || !category_id) {
    res.status(400).json({
      success: false,
      error: 'Missing required fields',
      message: 'cpf, event_id e category_id são obrigatórios',
    });
    return;
  }

  const { registerAthleteByStaff } = await import('../services/adminAthleteRegistrationService.js');

  try {
    const { registration, event } = await registerAthleteByStaff({
      actorType: 'organizer',
      actorUserId: req.user.id,
      ignoreEventRegistrationWindow: true,
      waivePlatformFee: false,
      cpf: String(cpf),
      runner_data,
      event_id: String(event_id),
      category_id: String(category_id),
      kit_id,
      modality_id: modality_id ?? null,
      product_selections,
      custom_field_values,
    });

    await sendRegistrationNotifications(registration, event, registration.runner_id);

    res.status(201).json({
      success: true,
      data: {
        ...registration,
        payment: null,
      },
      message: 'Atleta inscrito com sucesso',
    });
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg === 'CPF_NOT_REGISTERED') {
      res.status(400).json({
        success: false,
        error: 'CPF not registered',
        message: 'CPF não cadastrado. Informe os dados do atleta para criar o cadastro.',
      });
      return;
    }
    if (msg === 'EVENT_NOT_FOUND') {
      res.status(404).json({ success: false, error: 'Event not found', message: 'Evento não encontrado' });
      return;
    }
    if (msg === 'FORBIDDEN_ORGANIZER_EVENT') {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Você só pode inscrever atletas nos seus próprios eventos',
      });
      return;
    }
    if (msg === 'CATEGORY_NOT_FOUND') {
      res.status(404).json({ success: false, error: 'Category not found', message: 'Categoria não encontrada' });
      return;
    }
    if (msg === 'Category does not belong to this event') {
      res.status(400).json({
        success: false,
        error: 'Category does not belong to this event',
        message: 'A categoria não pertence a este evento',
      });
      return;
    }
    if (msg === 'ALREADY_REGISTERED') {
      res.status(400).json({
        success: false,
        error: 'Already registered',
        message:
          'Este atleta já possui uma inscrição ativa neste evento. Cada corredor pode se inscrever apenas uma vez por evento.',
      });
      return;
    }
    if (msg.includes('CPF deve conter')) {
      res.status(400).json({ success: false, error: 'Invalid CPF', message: msg });
      return;
    }
    console.error('createRegistrationByOrganizerController:', err);
    res.status(400).json({
      success: false,
      error: 'Error creating registration',
      message: msg || 'Erro ao inscrever atleta',
    });
  }
});

/** Super admin: inscrição com valor de categoria/kit, sem taxa da plataforma; ignora janela de inscrições. */
export const createRegistrationBySuperAdminController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const isAdminUser = await hasRole(req.user.id, 'admin');
  if (!isAdminUser) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas administradores podem usar esta rota.',
    });
    return;
  }

  const {
    cpf: cpfSa,
    runner_data: runnerDataSa,
    event_id: eventIdSa,
    category_id: categoryIdSa,
    kit_id: kitIdSa,
    modality_id: modalityIdSa,
    product_selections: productSelectionsSa,
    custom_field_values: customFieldValuesSa,
  } = req.body;

  if (!cpfSa || !eventIdSa || !categoryIdSa) {
    res.status(400).json({
      success: false,
      error: 'Missing required fields',
      message: 'cpf, event_id e category_id são obrigatórios',
    });
    return;
  }

  const { registerAthleteByStaff: registerStaffSa } = await import('../services/adminAthleteRegistrationService.js');

  try {
    const { registration: regSa, event: eventSa } = await registerStaffSa({
      actorType: 'super_admin',
      actorUserId: req.user.id,
      ignoreEventRegistrationWindow: true,
      waivePlatformFee: true,
      cpf: String(cpfSa),
      runner_data: runnerDataSa,
      event_id: String(eventIdSa),
      category_id: String(categoryIdSa),
      kit_id: kitIdSa,
      modality_id: modalityIdSa ?? null,
      product_selections: productSelectionsSa,
      custom_field_values: customFieldValuesSa,
    });

    await sendRegistrationNotifications(regSa, eventSa, regSa.runner_id);

    res.status(201).json({
      success: true,
      data: { ...regSa, payment: null },
      message: 'Atleta inscrito com sucesso (sem taxa da plataforma)',
    });
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg === 'CPF_NOT_REGISTERED') {
      res.status(400).json({
        success: false,
        error: 'CPF not registered',
        message: 'CPF não cadastrado. Informe os dados do atleta para criar o cadastro.',
      });
      return;
    }
    if (msg === 'EVENT_NOT_FOUND') {
      res.status(404).json({ success: false, error: 'Event not found', message: 'Evento não encontrado' });
      return;
    }
    if (msg === 'CATEGORY_NOT_FOUND') {
      res.status(404).json({ success: false, error: 'Category not found', message: 'Categoria não encontrada' });
      return;
    }
    if (msg === 'Category does not belong to this event') {
      res.status(400).json({
        success: false,
        error: 'Category does not belong to this event',
        message: 'A categoria não pertence a este evento',
      });
      return;
    }
    if (msg === 'ALREADY_REGISTERED') {
      res.status(400).json({
        success: false,
        error: 'Already registered',
        message:
          'Este atleta já possui uma inscrição ativa neste evento. Cada corredor pode se inscrever apenas uma vez por evento.',
      });
      return;
    }
    if (msg.includes('CPF deve conter')) {
      res.status(400).json({ success: false, error: 'Invalid CPF', message: msg });
      return;
    }
    console.error('createRegistrationBySuperAdminController:', err);
    res.status(400).json({
      success: false,
      error: 'Error creating registration',
      message: msg || 'Erro ao inscrever atleta',
    });
  }
});

// Get payment status by registration ID
export const getPaymentStatusController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const { id } = req.params;

  // Get registration to check ownership
  const registration = await getRegistrationById(id);
  if (!registration) {
    res.status(404).json({
      success: false,
      error: 'Registration not found',
    });
    return;
  }

  // Check if user owns this registration or is admin/organizer
  // User can access if:
  // 1. They are the runner (runner_id)
  // 2. They registered for someone else (registered_by)
  // 3. They are admin or organizer
  const isAdmin = await hasRole(req.user.id, 'admin');
  const isOrganizer = await hasRole(req.user.id, 'organizer');
  const isOwner = registration.runner_id === req.user.id || registration.registered_by === req.user.id;
  
  if (!isAdmin && !isOrganizer && !isOwner) {
    res.status(403).json({
      success: false,
      error: 'Forbidden: You can only check payment status of your own registrations',
    });
    return;
  }

  // Get payment data
  const payment = await getPaymentByRegistrationId(id);
  
  if (!payment) {
    res.json({
      success: true,
      data: {
        status: registration.payment_status || 'pending',
        payment_date: null,
      },
    });
    return;
  }

  // If payment is still pending, check Asaas directly for real-time status
  // This ensures we get the latest status even if webhook hasn't arrived yet
  if (payment.status === 'PENDING' && payment.asaas_payment_id) {
    try {
      const asaasStatus = await getAsaasPaymentStatusWithPollCache(
        payment.asaas_payment_id,
        () => getAsaasPaymentStatus(payment.asaas_payment_id)
      );
      
      // If payment was confirmed in Asaas, update registration status
      if (asaasStatus.status === 'CONFIRMED' || asaasStatus.status === 'RECEIVED') {
        console.log(`✅ Pagamento confirmado no Asaas! Atualizando inscrição ${id}`);
        
        // Get registration data before updating
        const registrationData = await query(
          'SELECT runner_id, event_id, total_amount, payment_status FROM registrations WHERE id = $1',
          [id]
        );
        
        const wasAlreadyPaid = registrationData.rows[0]?.payment_status === 'paid';
        
        // Update registration status
        await query(
          `UPDATE registrations 
           SET payment_status = 'paid', 
               status = 'confirmed',
               updated_at = NOW()
           WHERE id = $1`,
          [id]
        );
        
        // Only process commission and bonus if payment was just confirmed (not already paid)
        if (!wasAlreadyPaid && registrationData.rows.length > 0) {
          const reg = registrationData.rows[0];
          
          // Get coupon_code from registration
          const registrationWithCoupon = await query(
            'SELECT coupon_code FROM registrations WHERE id = $1',
            [id]
          );
          const couponCode = registrationWithCoupon.rows[0]?.coupon_code;
          
          // Create commission if user has a referral OR if coupon belongs to a leader
          try {
            const { getUserReferral } = await import('../services/referralsService.js');
            const { createCommission } = await import('../services/commissionsService.js');
            
            let leaderId: string | null = null;
            
            // First, check if coupon belongs to a leader (priority - coupon determines commission type)
            if (couponCode) {
              try {
                const { getCouponByCodeOnly } = await import('../services/couponsService.js');
                const coupon = await getCouponByCodeOnly(couponCode);
                if (coupon && coupon.leader_id) {
                  leaderId = coupon.leader_id; // Use coupon leader as priority
                  console.log(`✅ Cupom ${couponCode} pertence ao líder ${leaderId}`);
                } else {
                  console.log(`ℹ️ Cupom ${couponCode} não pertence a nenhum líder`);
                }
              } catch (couponError: any) {
                console.log(`ℹ️ Erro ao buscar cupom ${couponCode}:`, couponError.message);
              }
            }
            
            // If no coupon leader, check if user has a referral
            if (!leaderId) {
              const userReferral = await getUserReferral(reg.runner_id);
              if (userReferral) {
                leaderId = userReferral.leader_id;
                console.log(`✅ Runner tem referência para líder ${leaderId}`);
              }
            }
            
            if (leaderId) {
              // Check if commission already exists for this registration
              const existingCommission = await query(
                'SELECT id FROM leader_commissions WHERE registration_id = $1 AND leader_id = $2',
                [id, leaderId]
              );
              
              if (existingCommission.rows.length === 0) {
                // Create commission (this will also check for invitation bonuses)
                try {
                  await createCommission({
                    leader_id: leaderId,
                    registration_id: id,
                    referred_user_id: reg.runner_id,
                    event_id: reg.event_id,
                    registration_amount: parseFloat(reg.total_amount) || 0,
                  });
                  console.log(`✅ Comissão criada para líder ${leaderId} na inscrição ${id}`);
                } catch (commissionError: any) {
                  // If no commission is configured (invitation type only) or amount is 0, just check for bonuses
                  if (commissionError.message.includes('No commission configured') || 
                      commissionError.message.includes('invitation type only')) {
                    console.log(`ℹ️ Tipo de bônus é apenas 'invitation', verificando bônus de convite...`);
                    await executeInvitationBonusDomainCommand({
                      type: 'recheck_leader_event',
                      mode: 'operacional',
                      source: 'registrations_controller',
                      correlation_id: id,
                      leader_id: leaderId,
                      event_id: reg.event_id,
                      detail: 'manual_confirm_invitation_only',
                    });
                  } else if (commissionError.message.includes('must be greater than 0')) {
                    console.log(`ℹ️ Valor da comissão é 0, verificando apenas bônus de convite...`);
                    await executeInvitationBonusDomainCommand({
                      type: 'recheck_leader_event',
                      mode: 'operacional',
                      source: 'registrations_controller',
                      correlation_id: id,
                      leader_id: leaderId,
                      event_id: reg.event_id,
                      detail: 'manual_confirm_zero_amount',
                    });
                  } else {
                    console.error('❌ Erro ao criar comissão:', commissionError.message);
                  }
                }
              } else {
                // Commission already exists, check for bonuses only if commission type includes invitations
                // First, check what commission type is configured for this event
                const commissionTypeCheck = await query(
                  `SELECT bonus_type FROM leader_event_commissions 
                   WHERE leader_id = $1 AND event_id = $2 
                   AND bonus_type IN ('both', 'invitation')
                   LIMIT 1`,
                  [leaderId, reg.event_id]
                );
                
                if (commissionTypeCheck.rows.length > 0) {
                  await executeInvitationBonusDomainCommand({
                    type: 'recheck_leader_event',
                    mode: 'operacional',
                    source: 'registrations_controller',
                    correlation_id: id,
                    leader_id: leaderId,
                    event_id: reg.event_id,
                    detail: 'manual_confirm_existing_commission',
                  });
                  console.log(`✅ Verificação de bônus executada para líder ${leaderId}`);
                } else {
                  console.log(`ℹ️ Tipo de comissão é apenas 'commission', não verificando bônus de convite`);
                }
              }
            } else {
              console.log(`ℹ️ Nenhum líder associado (sem referência e cupom não pertence a líder)`);
            }
          } catch (commissionError: any) {
            // Log error but don't fail payment confirmation
            console.error('❌ Erro ao criar comissão após confirmação de pagamento:', commissionError.message);
          }
        }
        
        // Refresh payment data
        const updatedPayment = await getPaymentByRegistrationId(id);
        
        res.json({
          success: true,
          data: {
            status: 'confirmed',
            payment_date: updatedPayment?.payment_date || asaasStatus.payment_date || null,
            pix_qr_code: updatedPayment?.pix_qr_code || null,
            due_date: updatedPayment?.due_date || null,
          },
        });
        return;
      }
    } catch (error: any) {
      console.error('⚠️ Erro ao consultar Asaas diretamente (continuando com status do banco):', error.message);
      // Continue with database status if Asaas query fails
    }
  }

  // Return registration status (which is updated by webhook or direct Asaas query)
  const regResult = await query(
    'SELECT status, payment_status FROM registrations WHERE id = $1',
    [id]
  );

  const currentStatus = regResult.rows[0]?.status || registration.status;
  const paymentStatus = regResult.rows[0]?.payment_status || registration.payment_status;

  res.json({
    success: true,
    data: {
      status: paymentStatus === 'paid' ? 'paid' : currentStatus === 'confirmed' ? 'confirmed' : 'pending',
      payment_date: payment.payment_date || null,
      pix_qr_code: payment.pix_qr_code || null,
      due_date: payment.due_date || null,
    },
  });
});

/**
 * GET /api/registrations/:id/pending-difference-payment
 * Retorna PIX da cobrança pendente da diferença (após edição). Apenas o corredor dono da inscrição.
 * Antes de retornar o PIX, verifica no Asaas se o pagamento já foi confirmado (além do webhook).
 */
export const getPendingDifferencePaymentController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }
  const { id } = req.params;
  const registration = await getRegistrationById(id);
  if (!registration) {
    res.status(404).json({ success: false, error: 'Registration not found' });
    return;
  }
  const isOwner = registration.runner_id === req.user.id || registration.registered_by === req.user.id;
  if (!isOwner) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas o corredor dono da inscrição pode acessar o pagamento da diferença.',
    });
    return;
  }
  const { getLatestPendingPaymentWithIdForRegistration } = await import('../services/asaasService.js');
  const pending = await getLatestPendingPaymentWithIdForRegistration(id);
  if (!pending) {
    res.status(404).json({
      success: false,
      error: 'No pending payment',
      message: 'Não há cobrança pendente para esta inscrição.',
    });
    return;
  }
  // Verificar no Asaas se o pagamento já foi confirmado (além do webhook)
  try {
    const asaasStatus = await getAsaasPaymentStatus(pending.asaas_payment_id);
    const status = asaasStatus.status as string;
    if (status === 'CONFIRMED' || status === 'RECEIVED' || status === 'RECEIVED_IN_CASH') {
      console.log(`✅ Pagamento da diferença já confirmado no Asaas (${pending.asaas_payment_id}). Sincronizando inscrição ${id}.`);
      await syncRegistrationPaymentStatus(id);
      return res.json({
        success: true,
        data: { already_paid: true },
        message: 'Pagamento já foi confirmado.',
      });
    }
  } catch (err: any) {
    console.warn('⚠️ Erro ao consultar Asaas no pending-difference-payment (continuando com PIX):', err.message);
  }
  return res.json({
    success: true,
    data: {
      pix_qr_code: pending.pix_qr_code,
      value: pending.value,
      due_date: pending.due_date,
    },
  });
});

/**
 * POST /api/registrations/:id/verify-payment
 * Corredor solicita verificação manual no Asaas se o pagamento foi realizado (PIX inicial ou diferença).
 * Consulta o Asaas e, se pago, sincroniza a inscrição.
 */
export const verifyPaymentController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }
  const { id } = req.params;
  const registration = await getRegistrationById(id);
  if (!registration) {
    res.status(404).json({ success: false, error: 'Registration not found' });
    return;
  }
  const isOwner = registration.runner_id === req.user.id || registration.registered_by === req.user.id;
  if (!isOwner) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas o corredor dono da inscrição pode verificar o pagamento.',
    });
    return;
  }
  const { getLatestPendingPaymentWithIdForRegistration } = await import('../services/asaasService.js');
  const pending = await getLatestPendingPaymentWithIdForRegistration(id);
  if (pending) {
    try {
      const asaasStatus = await getAsaasPaymentStatus(pending.asaas_payment_id);
      const status = asaasStatus.status as string;
      if (status === 'CONFIRMED' || status === 'RECEIVED' || status === 'RECEIVED_IN_CASH') {
        await syncRegistrationPaymentStatus(id);
        return res.json({
          success: true,
          payment_verified: true,
          message: 'Pagamento confirmado no Asaas. Inscrição atualizada.',
        });
      }
    } catch (err: any) {
      console.warn('⚠️ Erro ao consultar Asaas em verify-payment (cobrança pendente):', err.message);
    }
  } else {
    const payment = await getPaymentByRegistrationId(id);
    if (payment?.asaas_payment_id && (payment.status === 'PENDING' || payment.status === 'OVERDUE')) {
      try {
        const asaasStatus = await getAsaasPaymentStatus(payment.asaas_payment_id);
        const status = asaasStatus.status as string;
        if (status === 'CONFIRMED' || status === 'RECEIVED' || status === 'RECEIVED_IN_CASH') {
          await syncRegistrationPaymentStatus(id);
          return res.json({
            success: true,
            payment_verified: true,
            message: 'Pagamento confirmado no Asaas. Inscrição atualizada.',
          });
        }
      } catch (err: any) {
        console.warn('⚠️ Erro ao consultar Asaas em verify-payment (pagamento inicial):', err.message);
      }
    }
  }
  return res.json({
    success: true,
    payment_verified: false,
    message: 'Pagamento ainda não identificado no Asaas. Tente novamente em instantes ou aguarde a confirmação automática.',
  });
});

/**
 * POST /api/registrations/:id/confirm-difference-payment
 * Admin confirma que recebeu o pagamento da diferença manualmente (ex.: dinheiro). Apenas admin.
 * Marca cobrança pendente como MANUAL_CONFIRMED, invalida PIX no Asaas e sincroniza payment_status.
 */
export const confirmDifferencePaymentController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }
  const isAdmin = await hasRole(req.user.id, 'admin');
  if (!isAdmin) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas administradores podem confirmar pagamento da diferença manualmente.',
    });
    return;
  }
  const { id } = req.params;
  const registration = await getRegistrationById(id);
  if (!registration) {
    res.status(404).json({ success: false, error: 'Registration not found' });
    return;
  }
  const pendingList = await getPendingPaymentsForRegistration(id);
  if (pendingList.length === 0) {
    res.json({ success: true, message: 'Nenhuma cobrança pendente; já confirmado ou inexistente.' });
    return;
  }
  for (const p of pendingList) {
    try {
      const asaasStatus = await getAsaasPaymentStatus(p.asaas_payment_id);
      const status = asaasStatus?.status as string | undefined;
      if (status === 'CONFIRMED' || status === 'RECEIVED' || status === 'RECEIVED_IN_CASH') {
        continue;
      }
      await markPaymentAsManualConfirmed(p.asaas_payment_id);
      await deletePaymentInAsaasOnly(p.asaas_payment_id);
    } catch (err: any) {
      await markPaymentAsManualConfirmed(p.asaas_payment_id).catch(() => {});
      await deletePaymentInAsaasOnly(p.asaas_payment_id).catch(() => {});
    }
  }
  await syncRegistrationPaymentStatus(id);
  res.json({ success: true, message: 'Pagamento da diferença confirmado.' });
});

// Update registration
export const updateRegistrationController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const { id } = req.params;
  const registration = await getRegistrationById(id);

  if (!registration) {
    res.status(404).json({
      success: false,
      error: 'Registration not found',
    });
    return;
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  const isOrganizer = await hasRole(req.user.id, 'organizer');
  const isOwner = registration.runner_id === req.user.id || registration.registered_by === req.user.id;

  // Check if organizer owns the event
  let isEventOrganizer = false;
  if (isOrganizer) {
    const event = await getEventById(registration.event_id);
    isEventOrganizer = event?.organizer_id === req.user.id;
  }

  if (!isAdmin && !isEventOrganizer && !isOwner) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'You can only update your own registrations',
    });
    return;
  }

  const wasPaid = registration.payment_status === 'paid';
  const wasConfirmed = registration.status === 'confirmed';

  // Allowlist: only these fields can be updated via this endpoint
  const allowedKeys = ['status', 'payment_status', 'payment_method', 'coupon_code', 'category_id', 'kit_id', 'modality_id', 'category_batch_id', 'custom_field_values'] as const;
  const updatePayload: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (req.body[key] !== undefined) {
      updatePayload[key] = req.body[key];
    }
  }
  // API pode enviar batch_id como alias de category_batch_id
  if (req.body.batch_id !== undefined) {
    updatePayload.category_batch_id = req.body.batch_id;
  }

  // Apenas admin pode alterar status, status de pagamento e método de pagamento
  if (!isAdmin) {
    delete updatePayload.payment_method;
    delete updatePayload.status;
    delete updatePayload.payment_status;
  }

  const willBePaid = updatePayload.payment_status === 'paid';
  const willBeConfirmed = updatePayload.status === 'confirmed';
  const paymentJustConfirmed = !wasPaid && willBePaid;
  const statusJustConfirmed = !wasConfirmed && willBeConfirmed;

  // Etapa 3 + Etapa 4: quando status for ou permanecer convite, zerar valores e taxa da plataforma.
  // Inclui o caso em que o frontend não envia payment_status (edição só de categoria/kit): inscrição convite continua convite com totais zerados.
  const willBeConvite =
    updatePayload.payment_status === 'convidado' ||
    (registration.payment_status === 'convidado' && updatePayload.payment_status === undefined);
  if (willBeConvite) {
    updatePayload.total_amount = 0;
    updatePayload.platform_fee_amount = 0;
    updatePayload.registration_edit_fee_amount = null;
    updatePayload.payment_method = 'free_bonus';
  }

  /** Admin alterando inscrição de convite para fluxo pago/pendente (recalcular valores). */
  const leavingConviteForPaidFlow =
    registration.payment_status === 'convidado' &&
    updatePayload.payment_status !== undefined &&
    String(updatePayload.payment_status) !== 'convidado';

  if (leavingConviteForPaidFlow && !isAdmin) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message:
        'Apenas administradores podem alterar o status de pagamento de convite para pago, pendente ou outro estado cobrável.',
    });
    return;
  }

  // Validate category_id belongs to the registration's event (admin/organizer only)
  if (updatePayload.category_id !== undefined) {
    const categoryId = updatePayload.category_id as string;
    const catCheck = await query(
      'SELECT id FROM categories WHERE id = $1 AND event_id = $2',
      [categoryId, registration.event_id]
    );
    if (catCheck.rows.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Categoria inválida ou não pertence ao evento desta inscrição.',
      });
      return;
    }
  }

  // Validate kit_id belongs to the registration's event (null = sem kit)
  if (updatePayload.kit_id !== undefined) {
    const kitId = updatePayload.kit_id as string | null;
    if (kitId !== null) {
      const kitCheck = await query(
        'SELECT id FROM event_kits WHERE id = $1 AND event_id = $2',
        [kitId, registration.event_id]
      );
      if (kitCheck.rows.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Kit inválido ou não pertence ao evento desta inscrição.',
        });
        return;
      }
    }
  }

  // Validate modality_id: must belong to event and be linked to (new or current) category
  if (updatePayload.modality_id !== undefined) {
    const modalityId = updatePayload.modality_id as string | null;
    if (modalityId !== null) {
      const categoryIdForModality = (updatePayload.category_id as string) || registration.category_id;
      const modCheck = await query(
        `SELECT m.id FROM modalities m
         INNER JOIN category_modalities cm ON cm.modality_id = m.id AND cm.category_id = $2
         WHERE m.id = $1 AND m.event_id = $3`,
        [modalityId, categoryIdForModality, registration.event_id]
      );
      if (modCheck.rows.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Modalidade inválida ou não pertence à categoria/evento desta inscrição.',
        });
        return;
      }
    }
  }

  // Validate category_batch_id: must exist and belong to (new or current) category
  const effectiveCategoryId = (updatePayload.category_id as string) || registration.category_id;
  if (updatePayload.category_batch_id !== undefined) {
    const batchId = updatePayload.category_batch_id as string | null;
    if (batchId !== null) {
      const batchCheck = await query(
        'SELECT id, category_id FROM category_batches WHERE id = $1 AND category_id = $2',
        [batchId, effectiveCategoryId]
      );
      if (batchCheck.rows.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Lote inválido ou não pertence à categoria desta inscrição.',
        });
        return;
      }
    }
  }

  // Recalcular total quando categoria/kit/lote mudam OU quando admin sai de convite (valores estavam zerados).
  const priceRelatedKeys = ['category_id', 'kit_id', 'modality_id', 'category_batch_id'];
  const anyPriceChange = priceRelatedKeys.some((k) => updatePayload[k] !== undefined);
  const needsPriceRecalculation = !willBeConvite && (anyPriceChange || leavingConviteForPaidFlow);
  let newTotalForOrganizer: number | undefined; // usado no bloco de pagamento para diferença a cobrar (sem taxa de inscrição de novo)
  if (needsPriceRecalculation) {
    const { calculateRegistrationTotal } = await import('../services/registrationTotalService.js');
    const { getSystemSettings } = await import('../services/systemSettingsService.js');
    const categoryId = (updatePayload.category_id as string) ?? registration.category_id;
    const kitId = updatePayload.kit_id !== undefined ? (updatePayload.kit_id as string | null) : (registration.kit_id ?? null);
    const modalityId = updatePayload.modality_id !== undefined ? (updatePayload.modality_id as string | null) : (registration.modality_id ?? null);
    const batchId = updatePayload.category_batch_id !== undefined ? (updatePayload.category_batch_id as string | null) : (registration.category_batch_id ?? null) ?? null;
    const calculation = await calculateRegistrationTotal({
      eventId: registration.event_id,
      categoryId,
      kitId,
      modalityId,
      batchId: batchId || undefined,
      couponCode: registration.coupon_code || undefined,
      runnerId: registration.runner_id,
    });
    const oldTotal = parseFloat(String(registration.total_amount)) || 0;
    const oldPlatformFee = parseFloat(String(registration.platform_fee_amount)) || 0;
    const settings = await getSystemSettings();
    const updateFee = settings.registration_edit_fee ?? 0;
    // Novo total para organizador (sem taxa de inscrição) + taxa de atualização; não cobrar taxa de inscrição de novo na diferença
    const newSubtotalForOrganizer = calculation.amountAfterDiscounts;
    const oldOrganizerPortion = Math.max(0, oldTotal - oldPlatformFee);
    const subtotalChanged = Math.abs(newSubtotalForOrganizer - oldOrganizerPortion) >= 0.01;
    // Conversão convite → pago: recalcula preço sem taxa de edição de inscrição
    const appliedUpdateFee = leavingConviteForPaidFlow ? 0 : subtotalChanged ? updateFee : 0;
    newTotalForOrganizer = Math.round((newSubtotalForOrganizer + appliedUpdateFee) * 100) / 100;
    // Ao sair de convite, recalcular taxa da plataforma; em edição comum, manter taxa já gravada
    const platformFeeAmount = leavingConviteForPaidFlow ? calculation.platformFee : oldPlatformFee;
    const newTotalAmount = Math.round((platformFeeAmount + newSubtotalForOrganizer + appliedUpdateFee) * 100) / 100;
    updatePayload.total_amount = newTotalAmount;
    updatePayload.platform_fee_amount = platformFeeAmount;
    updatePayload.category_batch_id = batchId ?? null;
    // OK Etapa 1: Persistir taxa de atualização quando aplicada
    if (appliedUpdateFee > 0) {
      updatePayload.registration_edit_fee_amount = appliedUpdateFee;
    } else if (leavingConviteForPaidFlow) {
      updatePayload.registration_edit_fee_amount = null;
    }
  }

  // Método cobrável ao sair de convite: admin escolhe PIX/cartão/boleto (padrão PIX)
  if (isAdmin && !willBeConvite && leavingConviteForPaidFlow) {
    const validPaid = ['pix', 'credit_card', 'boleto'] as const;
    const pm = updatePayload.payment_method as string | undefined;
    if (!pm || pm === 'free_bonus' || !validPaid.includes(pm as (typeof validPaid)[number])) {
      updatePayload.payment_method = 'pix';
    }
  }

  const categoryChanging =
    updatePayload.category_id !== undefined && updatePayload.category_id !== registration.category_id;
  const kitChanging = updatePayload.kit_id !== undefined && updatePayload.kit_id !== registration.kit_id;
  const explicitKitRemoval =
    Object.prototype.hasOwnProperty.call(req.body, 'kit_id') && req.body.kit_id === null;

  let selectionPlan: Awaited<ReturnType<typeof planRegistrationKitCategorySelectionSync>> | null = null;

  if (categoryChanging || kitChanging) {
    let incomingSelections:
      | { product_id: string; variant_id?: string; attribute_selections?: Record<string, string> }[]
      | undefined;
    if (Object.prototype.hasOwnProperty.call(req.body, 'product_selections')) {
      const parsed = z.array(productSelectionSchema).safeParse(req.body.product_selections);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: 'product_selections inválido',
          message: parsed.error.issues.map((i) => i.message).join('; ') || 'Payload inválido',
        });
        return;
      }
      incomingSelections = parsed.data;
    }

    const effectiveNewCategoryIdForPlan =
      (updatePayload.category_id as string | undefined) ?? registration.category_id;
    const effectiveNewKitIdForPlan =
      updatePayload.kit_id !== undefined ? (updatePayload.kit_id as string | null) : registration.kit_id;

    selectionPlan = await planRegistrationKitCategorySelectionSync({
      registrationId: id,
      eventId: registration.event_id,
      oldCategoryId: registration.category_id,
      newCategoryId: effectiveNewCategoryIdForPlan,
      oldKitId: registration.kit_id ?? null,
      newKitId: effectiveNewKitIdForPlan,
      explicitKitRemoval,
      incomingProductSelections: incomingSelections,
    });

    if (selectionPlan.kind === 'reject') {
      res.status(409).json({
        success: false,
        error: 'PRODUCT_RESELECTION_REQUIRED',
        requires_product_reselection: true,
        reasons: selectionPlan.reasons,
        message: selectionPlan.reasons.join(' '),
      });
      return;
    }
  }

  /** Produto/variação sem mudar categoria nem kit: planRegistrationKitCategorySelectionSync retorna noop; substituir seleções aqui. */
  let selectionsOnlyReplace: ProductSelection[] | null = null;
  if (!categoryChanging && !kitChanging && Object.prototype.hasOwnProperty.call(req.body, 'product_selections')) {
    const parsedOnly = z.array(productSelectionSchema).safeParse(req.body.product_selections);
    if (!parsedOnly.success) {
      res.status(400).json({
        success: false,
        error: 'product_selections inválido',
        message: parsedOnly.error.issues.map((i) => i.message).join('; ') || 'Payload inválido',
      });
      return;
    }
    if (parsedOnly.data.length === 0) {
      res.status(400).json({
        success: false,
        error: 'product_selections não pode ser vazio quando enviado.',
      });
      return;
    }
    if (!registration.kit_id) {
      res.status(400).json({
        success: false,
        error: 'Inscrição sem kit; não é possível atualizar seleções de produto.',
      });
      return;
    }
    const kitProductsCheck = await query(`SELECT id FROM kit_products WHERE kit_id = $1`, [registration.kit_id]);
    const allowedProductIds = new Set(kitProductsCheck.rows.map((r: { id: string }) => String(r.id)));
    for (const s of parsedOnly.data) {
      if (!allowedProductIds.has(s.product_id)) {
        res.status(400).json({
          success: false,
          error: 'Uma ou mais seleções não pertencem ao kit desta inscrição.',
        });
        return;
      }
    }
    selectionsOnlyReplace = parsedOnly.data;
  }

  const hasSelectionReplace =
    selectionPlan?.kind === 'replace' || selectionsOnlyReplace !== null;
  if (Object.keys(updatePayload).length === 0 && !hasSelectionReplace) {
    res.status(400).json({
      success: false,
      error: 'Nenhum campo válido para atualização.',
    });
    return;
  }

  let updatedRegistration;
  if (selectionPlan?.kind === 'replace') {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      updatedRegistration = await updateRegistration(id, updatePayload as any, client);
      await replaceRegistrationProductSelectionsForEdit(
        client,
        id,
        registration.event_id,
        selectionPlan.selections
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else if (selectionsOnlyReplace) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      updatedRegistration = await updateRegistration(id, updatePayload as any, client);
      await replaceRegistrationProductSelectionsForEdit(
        client,
        id,
        registration.event_id,
        selectionsOnlyReplace
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else {
    updatedRegistration = await updateRegistration(id, updatePayload as any);
  }

  // Ao confirmar pagamento manualmente (admin marca como pago), marcar cobranças pendentes como MANUAL_CONFIRMED
  // para que pending_difference_amount fique 0 e não apareça "Pagamento da diferença pendente" indevidamente
  if (paymentJustConfirmed) {
    try {
      const pendingList = await getPendingPaymentsForRegistration(id);
      for (const p of pendingList) {
        try {
          await markPaymentAsManualConfirmed(p.asaas_payment_id);
          await deletePaymentInAsaasOnly(p.asaas_payment_id);
        } catch (err: any) {
          await markPaymentAsManualConfirmed(p.asaas_payment_id).catch(() => {});
        }
      }
    } catch (err: any) {
      console.error('[updateRegistrationController] Erro ao marcar cobranças como confirmadas:', err?.message);
    }
  }

  // Etapa 5 + OK Etapa 2: regras de pagamento quando o valor foi alterado na edição (usa valor já pago para organizador, sem taxa inicial)
  if (
    (anyPriceChange || leavingConviteForPaidFlow) &&
    typeof updatePayload.total_amount === 'number' &&
    newTotalForOrganizer !== undefined
  ) {
    let amountPaid = await getTotalPaidForRegistration(id);
    let amountPaidForOrganizer = await getAmountPaidForOrganizer(id);
    const oldTotal = parseFloat(String(registration.total_amount)) || 0;
    if (amountPaid === 0 && registration.payment_status === 'paid' && oldTotal > 0) {
      amountPaid = oldTotal;
      const pf = parseFloat(String(registration.platform_fee_amount)) || 0;
      amountPaidForOrganizer = Math.round((oldTotal - pf) * 100) / 100;
    }
    try {
      if (newTotalForOrganizer > amountPaidForOrganizer) {
        const pendingPayments = await getPendingPaymentsForRegistration(id);
        for (const row of pendingPayments) {
          try {
            await cancelPayment(row.asaas_payment_id);
          } catch (cancelErr: any) {
            console.error(`[updateRegistrationController] Erro ao cancelar cobrança ${row.asaas_payment_id}:`, cancelErr.message);
          }
        }
        const differenceToCharge = Math.round((newTotalForOrganizer - amountPaidForOrganizer) * 100) / 100;
        if (differenceToCharge >= 0.01) {
          const customerRow = await query(
            'SELECT asaas_customer_id FROM asaas_customers WHERE user_id = $1',
            [registration.runner_id]
          );
          if (customerRow.rows.length > 0) {
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 7);
            const dueDateStr = dueDate.toISOString().slice(0, 10);
            const regMethod = String(updatedRegistration.payment_method || 'pix');
            const billingType =
              regMethod === 'boleto'
                ? 'BOLETO'
                : regMethod === 'credit_card'
                  ? 'CREDIT_CARD'
                  : 'PIX';
            await createPayment(
              id,
              customerRow.rows[0].asaas_customer_id,
              {
                value: differenceToCharge,
                dueDate: dueDateStr,
                description: amountPaidForOrganizer > 0 ? 'Complemento - Alteração da inscrição' : 'Inscrição - Alteração',
                billingType,
                externalReference: updatedRegistration.confirmation_code || undefined,
              },
              { setAsRegistrationPaymentId: amountPaid === 0 }
            );
          } else {
            console.warn(`[updateRegistrationController] Runner ${registration.runner_id} sem asaas_customer_id; não foi criada cobrança da diferença.`);
          }
          // Sempre marcar como "pago parcialmente" quando há diferença a cobrar (inscrição confirmada manualmente ou não), para exibir "Pagamento da diferença pendente" e "Pagar diferença"
          await query(
            `UPDATE registrations SET payment_status = 'partially_paid', updated_at = NOW() WHERE id = $1`,
            [id]
          );
        }
      } else if (newTotalForOrganizer < amountPaidForOrganizer) {
        const oldTotalReg = parseFloat(String(registration.total_amount)) || 0;
        await query(
          `INSERT INTO registration_amount_adjustments (registration_id, old_total, new_total, adjustment_type, notes, created_by)
           VALUES ($1, $2, $3, 'refund_pending', $4, $5)`,
          [id, oldTotalReg, newTotalForOrganizer, 'Reembolso manual pendente (edição reduziu o valor).', req.user?.id ?? null]
        );
      }
    } catch (paymentRuleError: any) {
      console.error('[updateRegistrationController] Erro ao aplicar regras de pagamento:', paymentRuleError.message);
      // Não falha a edição; apenas loga
    }
  }

  // Send notifications if registration was just confirmed (by payment or status)
  if (paymentJustConfirmed || statusJustConfirmed) {
    try {
      const event = await getEventById(registration.event_id);
      if (event) {
        await sendRegistrationNotifications(updatedRegistration, event, updatedRegistration.runner_id);
        console.log('✅ Notificações de confirmação enviadas após atualização manual');
      }
    } catch (notificationError: any) {
      // Don't break the flow if notification fails
      console.error('❌ Erro ao enviar notificações após atualização manual:', notificationError);
    }
  }

  // If payment was just confirmed, process commissions and bonuses
  if (paymentJustConfirmed) {
    try {
      console.log(`💰 [updateRegistrationController] Pagamento confirmado manualmente para inscrição ${id}, processando comissões e bônus...`);
      
      // Get registration data with coupon code
      const regData = await query(
        'SELECT runner_id, event_id, total_amount, coupon_code FROM registrations WHERE id = $1',
        [id]
      );
      
      if (regData.rows.length > 0) {
        const reg = regData.rows[0];
        
        // Find leader associated with this registration (by coupon or referral)
        let leaderId: string | null = null;
        
        // Check if registration has a coupon code
        if (reg.coupon_code) {
          const couponResult = await query(
            'SELECT leader_id FROM coupons WHERE code = $1',
            [reg.coupon_code]
          );
          if (couponResult.rows.length > 0) {
            leaderId = couponResult.rows[0].leader_id;
            console.log(`🎫 [updateRegistrationController] Líder encontrado pelo cupom: ${leaderId}`);
          }
        }
        
        // If no leader found by coupon, check referrals
        if (!leaderId) {
          const referralResult = await query(
            'SELECT leader_id FROM user_referrals WHERE user_id = $1',
            [reg.runner_id]
          );
          if (referralResult.rows.length > 0) {
            leaderId = referralResult.rows[0].leader_id;
            console.log(`👥 [updateRegistrationController] Líder encontrado por referência: ${leaderId}`);
          }
        }
        
        if (leaderId) {
          // Buscar comissão pelo cupom: cupom contém REFERRAL_CODE + primeiros 8 chars do UUID da comissão
          let shouldCreateCommission = true;
          if (reg.coupon_code) {
            try {
              const { getCouponByCodeOnly } = await import('../services/couponsService.js');
              const coupon = await getCouponByCodeOnly(reg.coupon_code);
              if (coupon && coupon.leader_id === leaderId) {
                const couponCodeUpper = (coupon.code || '').replace(/-/g, '').toUpperCase();
                const commissionsForLeader = await query(
                  `SELECT id, bonus_type FROM leader_event_commissions 
                   WHERE leader_id = $1 AND event_id = $2`,
                  [leaderId, reg.event_id]
                );
                for (const row of commissionsForLeader.rows) {
                  const commissionIdShort = (row.id || '').replace(/-/g, '').substring(0, 8).toUpperCase();
                  if (commissionIdShort && couponCodeUpper.includes(commissionIdShort)) {
                    if (row.bonus_type === 'invitation') {
                      shouldCreateCommission = false;
                      console.log(`🎯 [updateRegistrationController] Comissão apenas 'invitation' - verificando bônus de convite`);
                    }
                    break;
                  }
                }
              }
            } catch (couponError: any) {
              console.log(`ℹ️ [updateRegistrationController] Erro ao buscar comissão pelo cupom: ${couponError.message}`);
            }
          }

          if (shouldCreateCommission) {
            try {
              const { createCommission } = await import('../services/commissionsService.js');
              await createCommission({
                leader_id: leaderId,
                registration_id: id,
                referred_user_id: reg.runner_id,
                event_id: reg.event_id,
                registration_amount: parseFloat(reg.total_amount) || 0,
              });
              console.log(`✅ [updateRegistrationController] Comissão criada para líder ${leaderId} na inscrição ${id}`);
            } catch (commissionError: any) {
              if (commissionError.message.includes('No commission configured') ||
                  commissionError.message.includes('invitation type only')) {
                console.log(`ℹ️ [updateRegistrationController] Tipo 'invitation' only - verificando bônus de convite`);
                await executeInvitationBonusDomainCommand({
                  type: 'recheck_leader_event',
                  mode: 'operacional',
                  source: 'registrations_controller',
                  correlation_id: id,
                  leader_id: leaderId,
                  event_id: reg.event_id,
                  detail: 'update_registration_invitation_only',
                });
              } else if (commissionError.message.includes('must be greater than 0')) {
                console.log(`ℹ️ [updateRegistrationController] Valor 0 - verificando bônus de convite`);
                await executeInvitationBonusDomainCommand({
                  type: 'recheck_leader_event',
                  mode: 'operacional',
                  source: 'registrations_controller',
                  correlation_id: id,
                  leader_id: leaderId,
                  event_id: reg.event_id,
                  detail: 'update_registration_zero_amount',
                });
              } else {
                console.error('❌ [updateRegistrationController] Erro ao criar comissão:', commissionError.message);
              }
            }
          }

          // Sempre rechecar bônus de convite quando pagamento é confirmado e há líder (meta pode ter sido batida)
          try {
            await executeInvitationBonusDomainCommand({
              type: 'recheck_leader_event',
              mode: 'operacional',
              source: 'registrations_controller',
              correlation_id: id,
              leader_id: leaderId,
              event_id: reg.event_id,
              detail: 'update_registration_always_recheck',
            });
            console.log(`🎁 [updateRegistrationController] Verificação de convites executada para líder ${leaderId}`);
          } catch (bonusErr: any) {
            console.error('❌ [updateRegistrationController] Erro ao verificar convites:', bonusErr.message);
          }
        } else {
          console.log(`ℹ️ [updateRegistrationController] Nenhum líder associado (sem referência e cupom não pertence a líder)`);
        }
      }
    } catch (error: any) {
      // Log error but don't fail registration update
      console.error('❌ [updateRegistrationController] Erro ao processar comissões/bônus após confirmação manual:', error.message);
    }
  }

  const selectionSyncPayload =
    categoryChanging || kitChanging
      ? {
          kept_existing: selectionPlan?.kind === 'noop',
          selections_replaced: selectionPlan?.kind === 'replace',
          remapped_from_kit_change:
            selectionPlan?.kind === 'replace' ? selectionPlan.remapped : false,
        }
      : undefined;

  res.json({
    success: true,
    data: updatedRegistration,
    message: 'Registration updated successfully',
    ...(selectionSyncPayload ? { selection_sync: selectionSyncPayload } : {}),
  });
});

/**
 * POST /api/registrations/:id/preview-edit
 * Pré-visualização da edição: retorna novos valores (total, diferença a cobrar/reembolsar).
 * Apenas admin ou organizador do evento.
 */
export const previewRegistrationEditController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id } = req.params;
  const registration = await getRegistrationById(id);
  if (!registration) {
    res.status(404).json({ success: false, error: 'Registration not found' });
    return;
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  const isOrganizer = await hasRole(req.user.id, 'organizer');
  let isEventOrganizer = false;
  if (isOrganizer) {
    const event = await getEventById(registration.event_id);
    isEventOrganizer = event?.organizer_id === req.user.id;
  }
  if (!isAdmin && !isEventOrganizer) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas admin ou organizador do evento podem visualizar a pré-visualização',
    });
    return;
  }

  const body = req.body as {
    category_id?: string;
    kit_id?: string | null;
    modality_id?: string | null;
    batch_id?: string | null;
  };
  const categoryId = body.category_id ?? registration.category_id;
  const kitId = body.kit_id !== undefined ? body.kit_id : (registration.kit_id ?? null);
  const modalityId = body.modality_id !== undefined ? body.modality_id : (registration.modality_id ?? null);
  const batchId = body.batch_id !== undefined ? body.batch_id : null;

  const { calculateRegistrationTotal } = await import('../services/registrationTotalService.js');
  const { getSystemSettings } = await import('../services/systemSettingsService.js');

  const calculation = await calculateRegistrationTotal({
    eventId: registration.event_id,
    categoryId,
    kitId,
    modalityId,
    batchId: batchId || undefined,
    couponCode: registration.coupon_code || undefined,
    runnerId: registration.runner_id,
  });

  const oldTotal = parseFloat(String(registration.total_amount)) || 0;
  const settings = await getSystemSettings();
  const updateFee = settings.registration_edit_fee ?? 0;
  // Valor para organizador da nova seleção (sem taxa de inscrição); não cobrar taxa de inscrição de novo na edição
  const newSubtotalForOrganizer = calculation.amountAfterDiscounts;
  const valueChanged = Math.abs(newSubtotalForOrganizer - (oldTotal - (parseFloat(String(registration.platform_fee_amount)) || 0))) >= 0.01;
  const appliedUpdateFee = valueChanged ? updateFee : 0;
  const newTotalForOrganizer = Math.round((newSubtotalForOrganizer + appliedUpdateFee) * 100) / 100;
  const platformFeeAmount = parseFloat(String(registration.platform_fee_amount)) || 0;
  const newTotalAmount = Math.round((platformFeeAmount + newSubtotalForOrganizer + appliedUpdateFee) * 100) / 100;

  // OK Etapa 2: diferença com base no valor já pago para organizador (total pago − taxa inicial)
  let amountPaid = await getTotalPaidForRegistration(id);
  let amountPaidForOrganizer = await getAmountPaidForOrganizer(id);
  // Fallback: inscrição marcada como paga (ex.: confirmação manual) sem lançamento em asaas_payments
  if (amountPaid === 0 && registration.payment_status === 'paid' && oldTotal > 0) {
    amountPaid = oldTotal;
    const pf = parseFloat(String(registration.platform_fee_amount)) || 0;
    amountPaidForOrganizer = Math.round((oldTotal - pf) * 100) / 100;
  }

  const differenceToPay = Math.max(0, Math.round((newTotalForOrganizer - amountPaidForOrganizer) * 100) / 100);
  const differenceToRefund = Math.max(0, Math.round((amountPaidForOrganizer - newTotalForOrganizer) * 100) / 100);

  res.json({
    success: true,
    data: {
      old_total: oldTotal,
      new_subtotal: newSubtotalForOrganizer,
      update_fee: appliedUpdateFee,
      new_total: newTotalAmount,
      amount_paid: amountPaid,
      amount_paid_for_organizer: amountPaidForOrganizer,
      difference_to_pay: differenceToPay,
      difference_to_refund: differenceToRefund,
    },
  });
});

/**
 * POST /api/registrations/:id/attach-commission
 * Atrela uma inscrição (já paga) a uma comissão por evento. Aplica a comissão correspondente.
 * Organizador do evento ou admin.
 */
export const attachRegistrationToCommissionController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id: registrationId } = req.params;
  const body = req.body as { leader_event_commission_id?: string };

  const leaderEventCommissionId = body?.leader_event_commission_id;
  if (!leaderEventCommissionId || typeof leaderEventCommissionId !== 'string') {
    res.status(400).json({
      success: false,
      error: 'Validation Error',
      message: 'leader_event_commission_id é obrigatório',
    });
    return;
  }

  const registration = await getRegistrationById(registrationId);
  if (!registration) {
    res.status(404).json({ success: false, error: 'Not found', message: 'Inscrição não encontrada' });
    return;
  }

  if (registration.payment_status !== 'paid') {
    res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Só é possível atrelar comissão em inscrições já pagas',
    });
    return;
  }

  const event = await getEventById(registration.event_id);
  if (!event) {
    res.status(404).json({ success: false, error: 'Not found', message: 'Evento não encontrado' });
    return;
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  const isEventOrganizer = event.organizer_id === req.user.id;
  if (!isAdmin && !isEventOrganizer) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas o organizador do evento ou um administrador podem atrelar comissão',
    });
    return;
  }

  const commission = await getLeaderEventCommissionById(leaderEventCommissionId);
  if (!commission) {
    res.status(404).json({ success: false, error: 'Not found', message: 'Comissão por evento não encontrada' });
    return;
  }

  if (commission.event_id !== registration.event_id) {
    res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'A comissão não é do mesmo evento da inscrição',
    });
    return;
  }

  const coupon = await getCouponByEventCommission(commission.leader_id, commission.event_id, commission.id);
  if (!coupon) {
    res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Esta comissão não possui cupom associado',
    });
    return;
  }

  const existingMoneyCommission = await getCommissionByRegistrationId(registrationId);
  const currentCouponCode = (registration.coupon_code || '').trim().toUpperCase();
  const newCouponCode = (coupon.code || '').trim().toUpperCase();

  if (currentCouponCode && currentCouponCode === newCouponCode) {
    if (commission.bonus_type === 'invitation' || commission.bonus_type === 'both') {
      await executeInvitationBonusDomainCommand({
        type: 'recheck_leader_event',
        mode: 'operacional',
        source: 'registrations_controller',
        correlation_id: registrationId,
        leader_id: commission.leader_id,
        event_id: registration.event_id,
        detail: 'attach_commission_same_coupon',
      });
    }
    const updatedRegistration = await getRegistrationById(registrationId);
    res.status(200).json({
      success: true,
      data: {
        registration: updatedRegistration,
        commission: existingMoneyCommission ?? null,
      },
      message: 'Inscrição já estava atrelada a esta comissão',
    });
    return;
  }

  if (currentCouponCode !== newCouponCode) {
    if (existingMoneyCommission) {
      const oldLeaderId = existingMoneyCommission.leader_id;
      await adminCancelCommission(existingMoneyCommission.id);
      // Limpar cupom antes de recalcular para que a contagem do líder antigo não inclua esta inscrição
      await updateRegistration(registrationId, { coupon_code: null });
      await recalculateAndRevokeExcessInvitations(oldLeaderId, registration.event_id);
    } else if (currentCouponCode) {
      const oldCoupon = await getCouponByCodeOnly(registration.coupon_code!);
      const oldLeaderId = oldCoupon?.leader_id;
      await updateRegistration(registrationId, { coupon_code: null });
      if (oldLeaderId) {
        await recalculateAndRevokeExcessInvitations(oldLeaderId, registration.event_id);
      }
    }
  }

  await updateRegistration(registrationId, { coupon_code: coupon.code });

  // Verificação explícita da comissão específica: gera ou revoga convites conforme a meta
  if (commission.bonus_type === 'invitation' || commission.bonus_type === 'both') {
    try {
      await executeInvitationBonusDomainCommand({
        type: 'recheck_commission',
        mode: 'operacional',
        source: 'registrations_controller',
        correlation_id: registrationId,
        leader_id: commission.leader_id,
        event_id: registration.event_id,
        commission_id: commission.id,
        detail: 'attach_commission',
      });
    } catch (bonusErr: any) {
      console.error('❌ [attach-commission] Erro ao verificar bônus de convite:', bonusErr.message);
    }
  }

  if (commission.bonus_type === 'invitation') {
    const updatedRegistration = await getRegistrationById(registrationId);
    res.status(200).json({
      success: true,
      data: {
        registration: updatedRegistration,
        commission: null,
      },
      message: 'Inscrição atrelada ao bônus de convite com sucesso',
    });
    return;
  }

  let createdCommission: any = null;
  try {
    createdCommission = await createCommission({
      leader_id: commission.leader_id,
      registration_id: registrationId,
      referred_user_id: registration.runner_id,
      event_id: registration.event_id,
      registration_amount: parseFloat(String(registration.total_amount || 0)) || 0,
    });
  } catch (err: any) {
    if (err.message?.includes('already exists')) {
      res.status(400).json({
        success: false,
        error: 'Conflict',
        message: 'Esta inscrição já está atrelada a uma comissão',
      });
      return;
    }
    // Inscrição com valor 0 (convite/organizador): não cria comissão em dinheiro, bônus de convite já verificado acima
    if (commission.bonus_type === 'both' && (err.message?.includes('greater than 0') || err.message?.includes('amount must be'))) {
      const updatedRegistration = await getRegistrationById(registrationId);
      res.status(200).json({
        success: true,
        data: {
          registration: updatedRegistration,
          commission: null,
        },
        message: 'Inscrição atrelada. Comissão em dinheiro não aplicável (valor 0). Bônus de convite verificado.',
      });
      return;
    }
    throw err;
  }

  // Garantir que bônus de convite seja verificado quando a comissão é "both" (comissão em dinheiro criada)
  if (commission.bonus_type === 'both') {
    try {
      await executeInvitationBonusDomainCommand({
        type: 'recheck_commission',
        mode: 'operacional',
        source: 'registrations_controller',
        correlation_id: registrationId,
        leader_id: commission.leader_id,
        event_id: registration.event_id,
        commission_id: commission.id,
        detail: 'attach_commission_both',
      });
    } catch (bonusErr: any) {
      console.error('❌ [attach] Erro ao verificar bônus de convite após atrelar:', bonusErr.message);
    }
  }

  const updatedRegistration = await getRegistrationById(registrationId);

  res.status(200).json({
    success: true,
    data: {
      registration: updatedRegistration,
      commission: createdCommission,
    },
    message: 'Inscrição atrelada à comissão com sucesso',
  });
});

/**
 * GET /api/registrations/:id/commission
 * Retorna a comissão vinculada a esta inscrição (se houver). Organizador do evento ou admin.
 */
export const getRegistrationCommissionController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id: registrationId } = req.params;
  const registration = await getRegistrationById(registrationId);
  if (!registration) {
    res.status(404).json({ success: false, error: 'Not found', message: 'Inscrição não encontrada' });
    return;
  }

  const event = await getEventById(registration.event_id);
  if (!event) {
    res.status(404).json({ success: false, error: 'Not found', message: 'Evento não encontrado' });
    return;
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  const isEventOrganizer = event.organizer_id === req.user.id;
  if (!isAdmin && !isEventOrganizer) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Sem permissão para ver comissão desta inscrição',
    });
    return;
  }

  let commission = await getCommissionByRegistrationId(registrationId);
  let leaderId: string;
  let leaderName: string | null = null;
  let leaderReferralCode: string | null = null;
  let bonusType = 'commission';

  if (commission) {
    leaderId = commission.leader_id;
    const leader = await getGroupLeaderById(commission.leader_id);
    const profile = leader ? await getProfileByUserId(leader.user_id) : null;
    leaderName = profile?.full_name || leader?.referral_code || null;
    leaderReferralCode = leader?.referral_code ?? null;
  } else if (registration.coupon_code) {
    const coupon = await getCouponByCodeOnly(registration.coupon_code);
    if (!coupon?.leader_id) {
      res.status(404).json({ success: false, error: 'Not found', message: 'Nenhuma comissão vinculada a esta inscrição' });
      return;
    }
    const eventIds = coupon.event_ids || (coupon.event_id ? [coupon.event_id] : []);
    const belongsToEvent = eventIds.includes(registration.event_id);
    if (!belongsToEvent) {
      res.status(404).json({ success: false, error: 'Not found', message: 'Nenhuma comissão vinculada a esta inscrição' });
      return;
    }
    leaderId = coupon.leader_id;
    const leader = await getGroupLeaderById(coupon.leader_id);
    const profile = leader ? await getProfileByUserId(leader.user_id) : null;
    leaderName = profile?.full_name || leader?.referral_code || null;
    leaderReferralCode = leader?.referral_code ?? null;
    bonusType = 'invitation';
    commission = {
      id: null,
      leader_id: leaderId,
      registration_id: registrationId,
      event_id: registration.event_id,
      commission_amount: null,
      commission_percentage: 0,
      status: null,
      created_at: null,
      updated_at: null,
      referred_user_id: null,
    } as any;
  } else {
    res.status(404).json({ success: false, error: 'Not found', message: 'Nenhuma comissão vinculada a esta inscrição' });
    return;
  }

  res.status(200).json({
    success: true,
    data: {
      ...commission,
      leader_name: leaderName,
      leader_referral_code: leaderReferralCode,
      bonus_type: bonusType,
    },
  });
});

/**
 * POST /api/registrations/:id/detach-commission
 * Remove o atrelamento da comissão desta inscrição (organizador do evento ou admin). Permite atrelar a outra.
 */
export const detachRegistrationCommissionController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id: registrationId } = req.params;
  const registration = await getRegistrationById(registrationId);
  if (!registration) {
    res.status(404).json({ success: false, error: 'Not found', message: 'Inscrição não encontrada' });
    return;
  }

  const event = await getEventById(registration.event_id);
  if (!event) {
    res.status(404).json({ success: false, error: 'Not found', message: 'Evento não encontrado' });
    return;
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  const isEventOrganizer = event.organizer_id === req.user.id;
  if (!isAdmin && !isEventOrganizer) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas o organizador do evento ou um administrador podem remover o atrelamento',
    });
    return;
  }

  const commission = await getCommissionByRegistrationId(registrationId);
  let result: { cancelled?: any; coupon_cleared?: boolean } = {};

  if (commission) {
    const oldLeaderId = commission.leader_id;
    const eventId = commission.event_id;
    const cancelled = await adminCancelCommission(commission.id);
    result.cancelled = cancelled;
    // Limpar cupom antes de recalcular para que a contagem do líder antigo não inclua esta inscrição
    await updateRegistration(registrationId, { coupon_code: null });
    result.coupon_cleared = true;
    await recalculateAndRevokeExcessInvitations(oldLeaderId, eventId);
  } else if (registration.coupon_code) {
    const oldCoupon = await getCouponByCodeOnly(registration.coupon_code);
    const oldLeaderId = oldCoupon?.leader_id;
    await updateRegistration(registrationId, { coupon_code: null });
    result.coupon_cleared = true;
    if (oldLeaderId) {
      await recalculateAndRevokeExcessInvitations(oldLeaderId, registration.event_id);
    }
  } else {
    res.status(404).json({ success: false, error: 'Not found', message: 'Nenhuma comissão vinculada a esta inscrição' });
    return;
  }

  res.status(200).json({
    success: true,
    data: result,
    message: 'Atrelamento removido. Você pode selecionar outra comissão.',
  });
});

/**
 * POST /api/registrations/:id/change-commission
 * Troca o cupom/comissão atrelada a uma inscrição (já paga). Subtrai bônus do cupom antigo e aplica o novo.
 * Organizador do evento ou admin.
 */
export const changeRegistrationCommissionController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { id: registrationId } = req.params;
  const body = req.body as { leader_event_commission_id?: string };

  const leaderEventCommissionId = body?.leader_event_commission_id;
  if (!leaderEventCommissionId || typeof leaderEventCommissionId !== 'string') {
    res.status(400).json({
      success: false,
      error: 'Validation Error',
      message: 'leader_event_commission_id é obrigatório',
    });
    return;
  }

  const registration = await getRegistrationById(registrationId);
  if (!registration) {
    res.status(404).json({ success: false, error: 'Not found', message: 'Inscrição não encontrada' });
    return;
  }

  if (registration.payment_status !== 'paid') {
    res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Só é possível trocar cupom em inscrições já pagas',
    });
    return;
  }

  const event = await getEventById(registration.event_id);
  if (!event) {
    res.status(404).json({ success: false, error: 'Not found', message: 'Evento não encontrado' });
    return;
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  const isEventOrganizer = event.organizer_id === req.user.id;
  if (!isAdmin && !isEventOrganizer) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas o organizador do evento ou um administrador podem trocar o cupom',
    });
    return;
  }

  const commission = await getLeaderEventCommissionById(leaderEventCommissionId);
  if (!commission) {
    res.status(404).json({ success: false, error: 'Not found', message: 'Comissão por evento não encontrada' });
    return;
  }

  if (commission.event_id !== registration.event_id) {
    res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'A comissão não é do mesmo evento da inscrição',
    });
    return;
  }

  const coupon = await getCouponByEventCommission(commission.leader_id, commission.event_id, commission.id);
  if (!coupon) {
    res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Esta comissão não possui cupom associado',
    });
    return;
  }

  const currentCouponCode = (registration.coupon_code || '').trim().toUpperCase();
  const newCouponCode = (coupon.code || '').trim().toUpperCase();

  if (currentCouponCode === newCouponCode) {
    const updatedRegistration = await getRegistrationById(registrationId);
    res.status(200).json({
      success: true,
      data: { registration: updatedRegistration, commission: null },
      message: 'Inscrição já está com este cupom',
    });
    return;
  }

  const existingMoneyCommission = await getCommissionByRegistrationId(registrationId);
  if (existingMoneyCommission) {
    const oldLeaderId = existingMoneyCommission.leader_id;
    await adminCancelCommission(existingMoneyCommission.id);
    // Limpar cupom antes de recalcular para que a contagem do líder antigo não inclua esta inscrição
    await updateRegistration(registrationId, { coupon_code: null });
    await recalculateAndRevokeExcessInvitations(oldLeaderId, registration.event_id);
  } else if (currentCouponCode) {
    const oldCoupon = await getCouponByCodeOnly(registration.coupon_code!);
    const oldLeaderId = oldCoupon?.leader_id;
    await updateRegistration(registrationId, { coupon_code: null });
    if (oldLeaderId) {
      await recalculateAndRevokeExcessInvitations(oldLeaderId, registration.event_id);
    }
  }

  await updateRegistration(registrationId, { coupon_code: coupon.code });

  // Verificação explícita da comissão específica após troca: gera ou revoga convites conforme a meta
  if (commission.bonus_type === 'invitation' || commission.bonus_type === 'both') {
    try {
      await executeInvitationBonusDomainCommand({
        type: 'recheck_commission',
        mode: 'operacional',
        source: 'registrations_controller',
        correlation_id: registrationId,
        leader_id: commission.leader_id,
        event_id: registration.event_id,
        commission_id: commission.id,
        detail: 'change_commission',
      });
    } catch (bonusErr: any) {
      console.error('❌ [change-commission] Erro ao verificar bônus de convite:', bonusErr.message);
    }
  }

  if (commission.bonus_type === 'invitation') {
    const updatedRegistration = await getRegistrationById(registrationId);
    res.status(200).json({
      success: true,
      data: {
        registration: updatedRegistration,
        commission: null,
      },
      message: 'Cupom trocado. Bônus de convite aplicado conforme a nova comissão.',
    });
    return;
  }

  let createdCommission: any = null;
  try {
    createdCommission = await createCommission({
      leader_id: commission.leader_id,
      registration_id: registrationId,
      referred_user_id: registration.runner_id,
      event_id: registration.event_id,
      registration_amount: parseFloat(String(registration.total_amount || 0)) || 0,
    });
  } catch (err: any) {
    if (err.message?.includes('already exists')) {
      res.status(400).json({
        success: false,
        error: 'Conflict',
        message: 'Esta inscrição já está atrelada a esta comissão',
      });
      return;
    }
    // Inscrição com valor 0 (convite/organizador): não cria comissão em dinheiro, bônus de convite já verificado acima
    if (commission.bonus_type === 'both' && (err.message?.includes('greater than 0') || err.message?.includes('amount must be'))) {
      const updatedRegistration = await getRegistrationById(registrationId);
      res.status(200).json({
        success: true,
        data: {
          registration: updatedRegistration,
          commission: null,
        },
        message: 'Cupom trocado. Comissão em dinheiro não aplicável (valor 0). Bônus de convite verificado.',
      });
      return;
    }
    throw err;
  }

  // Garantir que bônus de convite seja verificado quando a comissão é "both" (comissão em dinheiro criada)
  if (commission.bonus_type === 'both') {
    try {
      await executeInvitationBonusDomainCommand({
        type: 'recheck_commission',
        mode: 'operacional',
        source: 'registrations_controller',
        correlation_id: registrationId,
        leader_id: commission.leader_id,
        event_id: registration.event_id,
        commission_id: commission.id,
        detail: 'change_commission_both',
      });
    } catch (bonusErr: any) {
      console.error('❌ [change-commission] Erro ao verificar bônus de convite após trocar cupom:', bonusErr.message);
    }
  }

  const updatedRegistration = await getRegistrationById(registrationId);
  res.status(200).json({
    success: true,
    data: {
      registration: updatedRegistration,
      commission: createdCommission,
    },
    message: 'Cupom trocado com sucesso',
  });
});

// Export registrations to CSV
export const exportRegistrationsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const filters: any = {};

  const isAdmin = await hasRole(req.user.id, 'admin');
  const isOrganizer = await hasRole(req.user.id, 'organizer');

  // Non-admin/organizer users can only export their own registrations
  if (!isAdmin && !isOrganizer) {
    filters.runner_id = req.user.id;
  } else {
    // Organizers can filter by their own events
    if (isOrganizer && !isAdmin) {
      filters.organizer_id = req.user.id;
    }
    
    if (req.query.event_id) {
      filters.event_id = req.query.event_id;
    }
    if (req.query.status) {
      filters.status = req.query.status;
    }
    if (req.query.payment_status) {
      filters.payment_status = req.query.payment_status;
    }
    if (req.query.search) {
      filters.search = req.query.search;
    }
    if (req.query.category_id) {
      filters.category_id = req.query.category_id as string;
    }
    if (req.query.modality_id) {
      filters.modality_id = req.query.modality_id as string;
    }
    if (req.query.kit_id) {
      filters.kit_id = req.query.kit_id as string;
    }
    if (req.query.created_at_from) {
      filters.created_at_from = req.query.created_at_from as string;
    }
    if (req.query.created_at_to) {
      filters.created_at_to = req.query.created_at_to as string;
    }
    if (req.query.registration_kind) {
      filters.registration_kind = req.query.registration_kind as string;
    }
  }

  const registrations = await getRegistrations(filters);

  // Import service to get product selections
  const { getRegistrationProductSelections } = await import('../services/registrationProductSelectionsService.js');
  const { getByCategoryId } = await import('../services/categoryCustomFieldsService.js');

  // Etapa 4: collect all custom fields from categories present in this export (ordered for stable columns)
  const categoryIds = [...new Set((registrations as any[]).map((r: any) => r.category_id).filter(Boolean))];
  const customFieldsOrdered: { id: string; label: string }[] = [];
  for (const cid of categoryIds) {
    const fields = await getByCategoryId(cid);
    for (const f of fields) {
      customFieldsOrdered.push({ id: f.id, label: f.label });
    }
  }
  const sanitizeHeader = (s: string) => String(s ?? '').replace(/[;\r\n]/g, ' ').trim() || 'Campo';

  // Mesma regra do relatório financeiro (PDF): getLiquidRegistrationValue
  const { getSystemSettings } = await import('../services/systemSettingsService.js');
  const { getLiquidRegistrationValue } = await import('../services/financialReportingService.js');
  const systemSettings = await getSystemSettings();
  const liquidFallback = {
    platformFee: systemSettings.platform_fee || 0,
    platformFeeType: (systemSettings.platform_fee_type || 'fixed') as 'fixed' | 'percentage',
    platformFeeMin: systemSettings.platform_fee_min ?? 0,
  };

  // Generate CSV in the requested format (fixed headers + custom field columns)
  const headers = [
    'NUMERO',
    'NOME MINUSCULO',
    'NOME',
    'APELIDO',
    'CPF',
    'E-MAIL',
    'TELEFONE',
    'EQUIPE',
    'SEXO',
    'NASCIMENTO',
    'CIDADE',
    'ESTADO',
    'CATEGORIA',
    'KIT',
    'VARIAÇÃO',
    'ATRIBUTO',
    'MODALIDADE',
    'DATA HORA INSCRIÇÃO',
    'MEIO DE PAGAMENTO',
    'VALOR',
    'LÍDER',
    ...customFieldsOrdered.map((f) => sanitizeHeader(f.label)),
  ];

  // Helper function to format date as DD/MM/YYYY
  const formatDate = (date: string | Date | null): string => {
    if (!date) return '';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Helper function to format date and time as DD/MM/YYYY HH:MM:SS
  const formatDateTime = (date: string | Date | null): string => {
    if (!date) return '';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
  };

  // Helper function to format payment method
  const formatPaymentMethod = (paymentMethod: string | null | undefined): string => {
    if (!paymentMethod) return '';
    const methodMap: { [key: string]: string } = {
      'pix': 'PIX',
      'credit_card': 'Cartão de Crédito',
      'boleto': 'Boleto',
      'free_bonus': 'Convite Grátis',
    };
    return methodMap[paymentMethod] || paymentMethod;
  };

  // Helper function to get modality name (first available)
  const getModalityName = (reg: any): string => {
    if (reg.modality_names && reg.modality_names.length > 0) {
      return reg.modality_names[0] || '';
    }
    return '';
  };

  // Helper function to get product attributes as formatted string
  const getProductAttributes = async (registrationId: string): Promise<string> => {
    try {
      const selections = await getRegistrationProductSelections(registrationId);
      
      if (!selections || selections.length === 0) {
        return '';
      }
      
      // Group by product
      const productGroups = new Map<string, {
        product_name: string;
        attributes: Array<{ attribute_name: string; attribute_value: string }>;
      }>();
      
      selections.forEach((sel) => {
        const productKey = sel.product_id;
        if (!productGroups.has(productKey)) {
          productGroups.set(productKey, {
            product_name: sel.product_name || 'Produto',
            attributes: [],
          });
        }
        productGroups.get(productKey)!.attributes.push({
          attribute_name: sel.attribute_name,
          attribute_value: sel.attribute_value,
        });
      });
      
      // Format as "Produto: Atributo1: Valor1; Atributo2: Valor2 | Produto2: ..."
      const productStrings = Array.from(productGroups.entries()).map(([, productData]) => {
        const attributeStrings = productData.attributes.map(attr => {
          return `${attr.attribute_name}: ${attr.attribute_value}`;
        });
        return `${productData.product_name} (${attributeStrings.join('; ')})`;
      });
      
      return productStrings.join(' | ');
    } catch (error: any) {
      console.error(`❌ Error fetching product selections for registration ${registrationId}:`, error.message || error);
      return '';
    }
  };

  // Helper function to get kit name
  const getKitName = (reg: any): string => {
    return reg.kit_name || '';
  };

  /**
   * Coluna VARIAÇÃO: resumo por produto a partir de registration_product_selections
   * (variant_name canônico ou fallback linha attribute_name = "Variante").
   * Complementa a coluna ATRIBUTO (detalhe por atributo).
   */
  const getProductVariationsSummary = async (registrationId: string): Promise<string> => {
    try {
      const selections = await getRegistrationProductSelections(registrationId);
      if (!selections || selections.length === 0) {
        return '';
      }
      const byProduct = new Map<
        string,
        { product_name: string; variant_labels: Set<string> }
      >();
      for (const sel of selections) {
        if (!byProduct.has(sel.product_id)) {
          byProduct.set(sel.product_id, {
            product_name: sel.product_name || 'Produto',
            variant_labels: new Set<string>(),
          });
        }
        const g = byProduct.get(sel.product_id)!;
        const vn = sel.variant_name?.trim();
        if (vn) {
          g.variant_labels.add(vn);
        } else if (sel.attribute_name === 'Variante' && sel.attribute_value?.trim()) {
          g.variant_labels.add(sel.attribute_value.trim());
        }
      }
      const parts: string[] = [];
      for (const [, v] of byProduct) {
        if (v.variant_labels.size === 0) continue;
        const label = [...v.variant_labels].join(' / ');
        parts.push(`${v.product_name}: ${label}`);
      }
      return parts.join(' | ');
    } catch (error: any) {
      console.error(
        `❌ Error building variations summary for registration ${registrationId}:`,
        error?.message || error
      );
      return '';
    }
  };

  // Helper function to format gender
  const formatGender = (gender: string | null | undefined): string => {
    // Se não houver valor, retornar string vazia
    if (!gender || gender === null || gender === undefined) {
      return '';
    }
    
    // Converter para string e normalizar
    const genderStr = String(gender).trim();
    if (!genderStr) {
      return '';
    }
    
    const genderLower = genderStr.toLowerCase();
    
    // Verificar diferentes variações de "masculino"
    if (genderLower === 'masculino' || genderLower === 'm' || genderLower === 'masculine' || genderLower.startsWith('mascul')) {
      return 'M';
    }
    
    // Verificar diferentes variações de "feminino"
    if (genderLower === 'feminino' || genderLower === 'f' || genderLower === 'feminine' || genderLower.startsWith('femin')) {
      return 'F';
    }
    
    // Se não encontrar correspondência, retornar string vazia
    return '';
  };

  // Helper function to format CPF
  const formatCPF = (cpf: string | null | undefined): string => {
    if (!cpf) return '';
    // Remove all non-numeric characters
    const cleanCpf = cpf.replace(/[^0-9]/g, '');
    // Format as XXX.XXX.XXX-XX
    if (cleanCpf.length === 11) {
      return cleanCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    return cleanCpf;
  };

  // Process registrations and fetch attributes for each
  const rows = await Promise.all(registrations.map(async (reg: any, index: number) => {
    const runnerName = reg.runner_name || '';
    const runnerNameLower = runnerName.toLowerCase();
    const runnerNameUpper = runnerName.toUpperCase();
    const runnerPreferredName = String(reg.runner_preferred_name ?? '').trim();
    const runnerCpf = formatCPF(reg.runner_cpf);
    const runnerEmail = reg.runner_email || '';
    const runnerPhone = reg.runner_phone ?? '';
    const runnerTeam = reg.runner_team || '';
    const gender = formatGender(reg.runner_gender);
    const birthDate = formatDate(reg.runner_birth_date);
    const runnerCity = String(reg.runner_city ?? '').trim();
    const runnerState = String(reg.runner_state ?? '').trim().toUpperCase();
    const categoryName = reg.category_name || '';
    const kitName = getKitName(reg);
    const kitVariation = await getProductVariationsSummary(reg.id);
    const attributes = await getProductAttributes(reg.id);
    
    const modality = getModalityName(reg);
    const registrationDateTime = formatDateTime(reg.created_at);
    const paymentMethod = formatPaymentMethod(reg.payment_method);
    // Valor líquido canônico (igual ao PDF / eventFinancialReportService)
    const liquidValue = getLiquidRegistrationValue(reg, liquidFallback);
    const totalAmount = liquidValue.toFixed(2).replace('.', ',');
    const leaderName = reg.leader_name || '';
    const customValues = (reg.custom_field_values as Record<string, string> | undefined) ?? {};
    const sanitizeCell = (v: string) => String(v ?? '').replace(/[;\r\n]/g, ' ').trim();
    const customCells = customFieldsOrdered.map((f) => sanitizeCell(customValues[f.id] ?? ''));

    return [
      index + 1, // NUMERO (sequential number)
      runnerNameLower, // NOME MINUSCULO
      runnerNameUpper, // NOME
      runnerPreferredName, // APELIDO
      runnerCpf, // CPF
      runnerEmail, // E-MAIL
      runnerPhone, // TELEFONE
      runnerTeam, // EQUIPE
      gender, // SEXO
      birthDate, // NASCIMENTO
      runnerCity, // CIDADE
      runnerState, // ESTADO
      categoryName, // CATEGORIA
      kitName, // KIT
      kitVariation, // VARIAÇÃO
      attributes, // ATRIBUTO
      modality, // MODALIDADE
      registrationDateTime, // DATA HORA INSCRIÇÃO
      paymentMethod, // MEIO DE PAGAMENTO
      totalAmount, // VALOR
      leaderName, // LÍDER
      ...customCells,
    ];
  }));

  // Use semicolon as separator
  const csvContent = [
    headers.join(';'),
    ...rows.map((row: any[]) => row.map((cell: any) => String(cell || '')).join(';'))
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="PLANILHA_DE_INSCRITOS_${new Date().toISOString().split('T')[0].replace(/-/g, '')}.csv"`);
  res.send('\ufeff' + csvContent); // BOM for Excel UTF-8 support
});

// Transfer registration to another runner by CPF
// If transfer module is enabled, creates a request instead of transferring directly
export const transferRegistrationController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const { id } = req.params;
  const { cpf, email } = req.body;

  if (!cpf && !email) {
    res.status(400).json({
      success: false,
      error: 'CPF or email is required',
      message: 'Informe o CPF ou email do novo titular',
    });
    return;
  }

  // Get registration
  const registration = await getRegistrationById(id);

  if (!registration) {
    res.status(404).json({
      success: false,
      error: 'Registration not found',
    });
    return;
  }

  // Check if user owns the registration
  const isOwner = registration.runner_id === req.user.id || registration.registered_by === req.user.id;
  const isAdmin = await hasRole(req.user.id, 'admin');

  if (!isAdmin && !isOwner) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'You can only transfer your own registrations',
    });
    return;
  }

  // Check if event allows transfers
  const { getEventById } = await import('../services/eventsService.js');
  const event = await getEventById(registration.event_id);
  
  if (!event) {
    res.status(404).json({
      success: false,
      error: 'Event not found',
    });
    return;
  }

  // Check if transfers are enabled for this event
  if (event.transfers_enabled === false) {
    res.status(403).json({
      success: false,
      error: 'Transfers disabled',
      message: 'As transferências de inscrições estão desabilitadas para este evento',
    });
    return;
  }

  if (!isAdmin && isPublicTransferDeadlinePassed(event.transfer_until)) {
    res.status(403).json({
      success: false,
      error: 'Transfer deadline passed',
      message: formatTransferDeadlineClosedMessagePtBr(event.transfer_until),
    });
    return;
  }

  // Check if transfer module is enabled
  const { getSystemSettings } = await import('../services/systemSettingsService.js');
  const settings = await getSystemSettings();
  
  if (settings.enabled_modules?.transfers) {
    // Module enabled: create transfer request instead
    const { createTransferRequest } = await import('../services/transferRequestService.js');
    const transferFee = settings.transfer_fee || 0;
    
    // Try to find the new runner
    let newRunnerId: string | undefined;
    const newRunner = await findUserByCpfOrEmail(cpf, email);
    if (newRunner) {
      newRunnerId = newRunner.id;
      
      // Check if trying to transfer to the same user
      if (newRunner.id === registration.runner_id) {
        res.status(400).json({
          success: false,
          error: 'Invalid transfer',
          message: 'A inscrição já pertence a este usuário',
        });
        return;
      }
    }

    // Create transfer request
    const transferRequest = await createTransferRequest({
      registration_id: id,
      requested_by: req.user.id,
      new_runner_cpf: cpf || undefined,
      new_runner_email: email || undefined,
      new_runner_id: newRunnerId,
      transfer_fee: transferFee,
    });

    res.status(201).json({
      success: true,
      data: transferRequest,
      message: 'Solicitação de transferência criada com sucesso. Aguarde a aprovação do administrador.',
    });
    return;
  }

  // Module disabled: direct transfer (legacy behavior for admins)
  if (!isAdmin) {
    res.status(403).json({
      success: false,
      error: 'Module disabled',
      message: 'O módulo de transferência está desabilitado',
    });
    return;
  }

  // Find user by CPF or email
  const newRunner = await findUserByCpfOrEmail(cpf, email);

  if (!newRunner) {
    res.status(404).json({
      success: false,
      error: 'User not found',
      message: 'Não foi encontrado um usuário com o CPF ou email informado',
    });
    return;
  }

  // Check if trying to transfer to the same user
  if (newRunner.id === registration.runner_id) {
    res.status(400).json({
      success: false,
      error: 'Invalid transfer',
      message: 'A inscrição já pertence a este usuário',
    });
    return;
  }

  // Transfer registration directly (admin only when module is disabled)
  const transferredRegistration = await transferRegistration(id, newRunner.id);

  if (!transferredRegistration) {
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to transfer registration',
    });
    return;
  }

  res.json({
    success: true,
    data: transferredRegistration,
    message: `Inscrição transferida para ${newRunner.full_name}`,
  });
});

/**
 * POST /api/admin/registrations/:registrationId/transfer
 * Super admin: split — nova inscrição para o recebedor; original permanece como casca transferida (paid + vínculo).
 */
const adminTransferRegistrationBodySchema = z
  .object({
    cpf: z.string().optional(),
    email: z.union([z.string().email('E-mail inválido'), z.literal('')]).optional(),
    confirm: z.boolean().refine((v) => v === true, {
      message: 'É necessário confirmar a transferência',
    }),
    reason: z.string().max(2000).optional().nullable(),
  })
  .refine(
    (d) => {
      const digits = (d.cpf || '').replace(/\D/g, '');
      const hasCpf = digits.length === 11;
      const hasEmail = Boolean(d.email && d.email.trim().length > 0);
      return hasCpf || hasEmail;
    },
    { message: 'Informe CPF (11 dígitos) ou e-mail do novo titular' }
  );

export const adminTransferRegistrationController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const { registrationId } = req.params;
  if (!registrationId) {
    res.status(400).json({
      success: false,
      error: 'Missing registration id',
      message: 'ID da inscrição é obrigatório',
    });
    return;
  }

  const parsed = adminTransferRegistrationBodySchema.safeParse(req.body);
  if (!parsed.success) {
    const msg = parsed.error.errors[0]?.message || 'Dados inválidos';
    res.status(400).json({
      success: false,
      error: 'Validation Error',
      message: msg,
    });
    return;
  }

  const { cpf, email, reason } = parsed.data;
  const digits = (cpf || '').replace(/\D/g, '');
  const cpfArg = digits.length === 11 ? digits : undefined;
  const emailArg = email && email.trim() ? email.trim().toLowerCase() : undefined;

  const rowResult = await query(
    `SELECT id, status, payment_status, runner_id, registered_by, event_id, confirmation_code
     FROM registrations WHERE id = $1`,
    [registrationId]
  );

  if (rowResult.rows.length === 0) {
    res.status(404).json({
      success: false,
      error: 'Registration not found',
      message: 'Inscrição não encontrada',
    });
    return;
  }

  const reg = rowResult.rows[0] as {
    id: string;
    status: string;
    payment_status: string | null;
    runner_id: string;
    registered_by: string;
    event_id: string;
    confirmation_code: string | null;
  };

  if (reg.status === 'cancelled' || reg.status === 'refunded') {
    res.status(400).json({
      success: false,
      error: 'Invalid status',
      message: 'Esta inscrição não pode ser transferida (cancelada ou reembolsada).',
    });
    return;
  }

  if (reg.status === 'transferred') {
    res.status(400).json({
      success: false,
      error: 'Invalid status',
      message: 'Esta inscrição já está marcada como transferida.',
    });
    return;
  }

  if (reg.payment_status !== 'paid') {
    res.status(400).json({
      success: false,
      error: 'Invalid payment status',
      message: 'Somente inscrições com pagamento confirmado (paid) podem ser transferidas neste fluxo.',
    });
    return;
  }

  const newRunner = await findUserByCpfOrEmail(cpfArg, emailArg);
  if (!newRunner) {
    res.status(404).json({
      success: false,
      error: 'User not found',
      message: 'Não foi encontrado atleta com o CPF ou e-mail informado.',
    });
    return;
  }

  if (newRunner.id === reg.runner_id) {
    res.status(400).json({
      success: false,
      error: 'Invalid transfer',
      message: 'A inscrição já está neste atleta.',
    });
    return;
  }

  let split: { previousRegistrationId: string; newRegistrationId: string };
  try {
    split = await performAdminRegistrationSplitTransfer(registrationId, newRunner.id, {
      adminUserId: req.user.id,
      reason: reason?.trim() || null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Falha na transferência';
    res.status(400).json({
      success: false,
      error: 'Transfer failed',
      message: msg,
    });
    return;
  }

  const data = await getRegistrationById(split.newRegistrationId, req.user.id);

  res.json({
    success: true,
    data,
    meta: {
      previous_registration_id: split.previousRegistrationId,
      new_registration_id: split.newRegistrationId,
    },
    message: `Nova inscrição criada para ${newRunner.full_name} (titular anterior preservado na inscrição original).`,
  });
});

// Cancel registration
export const cancelRegistrationController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const { id } = req.params;

  // Get registration
  const registration = await getRegistrationById(id);

  if (!registration) {
    res.status(404).json({
      success: false,
      error: 'Registration not found',
    });
    return;
  }

  // Check if user owns the registration
  const isOwner = registration.runner_id === req.user.id || registration.registered_by === req.user.id;
  const isAdmin = await hasRole(req.user.id, 'admin');
  const isOrganizer = await hasRole(req.user.id, 'organizer');

  // Check if organizer owns the event
  let isEventOrganizer = false;
  if (isOrganizer) {
    const event = await getEventById(registration.event_id);
    isEventOrganizer = event?.organizer_id === req.user.id;
  }

  if (!isAdmin && !isEventOrganizer && !isOwner) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'You can only cancel your own registrations',
    });
    return;
  }

  // Cancel registration
  try {
    const cancelledRegistration = await cancelRegistration(id);

    if (!cancelledRegistration) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'Failed to cancel registration',
      });
      return;
    }

    // Automação: ao excluir inscrição, revogar convites em excesso do líder (se a inscrição era do cupom dele)
    let leaderIdForRevoke: string | null = null;
    const commission = await getCommissionByRegistrationId(id);
    if (commission) {
      leaderIdForRevoke = commission.leader_id;
    } else if (registration.coupon_code) {
      const coupon = await getCouponByCodeOnly(registration.coupon_code);
      if (coupon?.leader_id) leaderIdForRevoke = coupon.leader_id;
    }
    if (leaderIdForRevoke) {
      try {
        await recalculateAndRevokeExcessInvitations(leaderIdForRevoke, registration.event_id);
      } catch (revokeErr: any) {
        console.error('❌ [cancelRegistration] Erro ao revogar convites em excesso:', revokeErr.message);
      }
    }

    res.json({
      success: true,
      data: cancelledRegistration,
      message: 'Inscrição cancelada com sucesso',
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: error.message || 'Failed to cancel registration',
    });
  }
});

// Delete registration (hard delete - only for admin)
export const deleteRegistrationController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const { id } = req.params;

  // Only admin can delete registrations
  const isAdmin = await hasRole(req.user.id, 'admin');
  if (!isAdmin) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Only administrators can delete registrations',
    });
    return;
  }

  // Get registration to verify it exists
  let registration;
  try {
    registration = await getRegistrationById(id);
  } catch (error: any) {
    console.error('[deleteRegistrationController] Erro ao buscar inscrição:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Erro ao verificar inscrição',
    });
    return;
  }

  if (!registration) {
    res.status(404).json({
      success: false,
      error: 'Registration not found',
      message: 'Inscrição não encontrada',
    });
    return;
  }

  // Antes de excluir: obter líder para revogar convites em excesso depois
  let leaderIdForRevoke: string | null = null;
  const commission = await getCommissionByRegistrationId(id);
  if (commission) leaderIdForRevoke = commission.leader_id;
  else if (registration.coupon_code) {
    const coupon = await getCouponByCodeOnly(registration.coupon_code);
    if (coupon?.leader_id) leaderIdForRevoke = coupon.leader_id;
  }
  const eventIdForRevoke = registration.event_id;

  // Delete registration
  try {
    const { deleteRegistration } = await import('../services/registrationsService.js');
    const deletedRegistration = await deleteRegistration(id);

    if (!deletedRegistration) {
      res.status(404).json({
        success: false,
        error: 'Registration not found',
        message: 'A inscrição não foi encontrada ou já foi excluída',
      });
      return;
    }

    // Automação: ao excluir inscrição, revogar convites em excesso do líder
    if (leaderIdForRevoke) {
      try {
        await recalculateAndRevokeExcessInvitations(leaderIdForRevoke, eventIdForRevoke);
      } catch (revokeErr: any) {
        console.error('❌ [deleteRegistration] Erro ao revogar convites em excesso:', revokeErr.message);
      }
    }

    res.json({
      success: true,
      data: deletedRegistration,
      message: 'Inscrição excluída com sucesso',
    });
  } catch (error: any) {
    console.error('[deleteRegistrationController] Erro ao excluir inscrição:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Erro ao excluir inscrição',
    });
  }
});

// Get registration receipt (for download)
export const getRegistrationReceiptController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const { id } = req.params;
  const registration = await getRegistrationById(id);

  if (!registration) {
    res.status(404).json({
      success: false,
      error: 'Registration not found',
    });
    return;
  }

  // Check if user owns the registration
  const isOwner = registration.runner_id === req.user.id || registration.registered_by === req.user.id;
  const isAdmin = await hasRole(req.user.id, 'admin');
  const isOrganizer = await hasRole(req.user.id, 'organizer');

  // Check if organizer owns the event
  let isEventOrganizer = false;
  if (isOrganizer) {
    const event = await getEventById(registration.event_id);
    isEventOrganizer = event?.organizer_id === req.user.id;
  }

  if (!isAdmin && !isEventOrganizer && !isOwner) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'You do not have permission to view this receipt',
    });
    return;
  }

  // For now, return JSON data. In the future, can generate PDF
});

// Create registration by group leader
export const createRegistrationByLeaderController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  // Check if user is a group leader
  const { getGroupLeaderByUserId } = await import('../services/groupLeadersService.js');
  const leader = await getGroupLeaderByUserId(req.user.id);
  
  if (!leader || !leader.is_active) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas líderes de grupo ativos podem inscrever atletas',
    });
    return;
  }

  const { email, event_id, category_id, kit_id, commission_id, product_selections, custom_field_values } = req.body;

  if (!email || !event_id || !category_id) {
    res.status(400).json({
      success: false,
      error: 'Missing required fields',
      message: 'email, event_id e category_id são obrigatórios',
    });
    return;
  }

  // Verify leader has commission configured for this event
  const eventCommissionCheck = await query(
    'SELECT id FROM leader_event_commissions WHERE leader_id = $1 AND event_id = $2',
    [leader.id, event_id]
  );

  if (eventCommissionCheck.rows.length === 0) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Você não tem comissão configurada para este evento',
    });
    return;
  }

  // Find user by email
  const athlete = await findUserByEmail(email);
  
  if (!athlete) {
    res.status(404).json({
      success: false,
      error: 'User not found',
      message: 'Não foi encontrado um usuário com o email informado',
    });
    return;
  }

  // Validate event
  const event = await getEventById(event_id);
  if (!event) {
    res.status(404).json({
      success: false,
      error: 'Event not found',
      message: 'Evento não encontrado',
    });
    return;
  }

  // Verificar status efetivo de inscrições
  const effectiveRegistrationStatus = getEffectiveRegistrationStatus(event);

  // Se status efetivo está definido, usar nova lógica
  if (effectiveRegistrationStatus !== null) {
    if (effectiveRegistrationStatus === 'not_open') {
      const message = event.registration_auto_mode && event.registration_start_date
        ? `As inscrições abrem em ${new Date(event.registration_start_date).toLocaleString('pt-BR')}.`
        : 'As inscrições ainda não estão abertas. Aguarde o anúncio oficial.';
      
      res.status(400).json({
        success: false,
        error: 'Registrations not open yet',
        message,
      });
      return;
    }

    if (effectiveRegistrationStatus === 'closed') {
      const message = event.registration_auto_mode && event.registration_end_date
        ? `As inscrições foram encerradas em ${new Date(event.registration_end_date).toLocaleString('pt-BR')}.`
        : 'As inscrições para este evento foram encerradas.';
      
      res.status(400).json({
        success: false,
        error: 'Registrations closed',
        message,
      });
      return;
    }

    // Se effectiveRegistrationStatus === 'open', continuar com validações abaixo
  } else {
    // Se effectiveRegistrationStatus é NULL, usar lógica antiga baseada em event.status
    if (event.status === 'draft') {
      res.status(400).json({
        success: false,
        error: 'Event not open for registrations',
        message: 'Este evento ainda não está aberto para inscrições',
      });
      return;
    }

    if (event.status === 'finished' || event.status === 'cancelled') {
      res.status(400).json({
        success: false,
        error: 'Event not accepting registrations',
        message: 'Este evento não está mais aceitando inscrições',
      });
      return;
    }
  }

  // Verificar se evento está publicado (sempre necessário)
  if (event.status !== 'published' && event.status !== 'ongoing') {
    res.status(400).json({
      success: false,
      error: 'Event not published',
      message: 'Este evento não está publicado',
    });
    return;
  }

  // Validate category
  const selectedCategory = await getCategoryById(category_id);
  
  if (!selectedCategory) {
    res.status(404).json({
      success: false,
      error: 'Category not found',
      message: 'Categoria não encontrada',
    });
    return;
  }

  // Verify category belongs to the event
  if (selectedCategory.event_id !== event_id) {
    res.status(400).json({
      success: false,
      error: 'Category does not belong to this event',
      message: 'A categoria não pertence a este evento',
    });
    return;
  }

  // Check available spots
  if (selectedCategory.max_participants !== null && selectedCategory.max_participants > 0) {
    const registrationsCount = await query(
      `SELECT COUNT(*) as count 
       FROM registrations 
       WHERE category_id = $1 
       AND status != 'cancelled' 
       AND payment_status IN ('pending', 'paid')`,
      [category_id]
    );
    
    const currentCount = parseInt(registrationsCount.rows[0].count) || 0;
    const availableSpots = selectedCategory.max_participants - currentCount;
    
    if (availableSpots <= 0) {
      res.status(400).json({
        success: false,
        error: 'Category is full',
        message: 'Esta categoria está esgotada',
      });
      return;
    }
  }

  // Check modality limits (if category is associated with modalities that have limits)
  const { getModalitiesByEvent } = await import('../services/modalitiesService.js');
  const modalities = await getModalitiesByEvent(event_id);
  
  // Get modality IDs associated with this category
  const categoryModalities = await query(
    `SELECT modality_id FROM category_modalities WHERE category_id = $1`,
    [category_id]
  );
  
  const modalityIds = categoryModalities.rows.map(row => row.modality_id);
  
  // Check each modality limit
  for (const modalityId of modalityIds) {
    const modality = modalities.find(m => m.id === modalityId);
    if (modality && modality.max_participants !== null && modality.max_participants > 0) {
      // Count registrations for this modality (through all categories associated with it)
      const modalityRegistrations = await query(
        `SELECT COUNT(DISTINCT r.id) as count
         FROM registrations r
         INNER JOIN category_modalities cm ON r.category_id = cm.category_id
         WHERE cm.modality_id = $1
         AND r.status != 'cancelled'
         AND r.payment_status IN ('pending', 'paid')`,
        [modalityId]
      );
      
      const currentModalityCount = parseInt(modalityRegistrations.rows[0].count) || 0;
      const availableModalitySpots = modality.max_participants - currentModalityCount;
      
      if (availableModalitySpots <= 0) {
        res.status(400).json({
          success: false,
          error: 'Modality is full',
          message: `A modalidade "${modality.name}" atingiu o limite máximo de ${modality.max_participants} participantes. Por favor, escolha outra modalidade.`,
        });
        return;
      }
    }
  }

  // Calculate total amount (before coupon discount)
  let totalAmount = parseFloat(selectedCategory.price.toString()) || 0;
  
  if (kit_id) {
    const { getEventKits } = await import('../services/eventKitsService.js');
    const kits = await getEventKits(event_id);
    const kit = kits.find(k => k.id === kit_id);
    if (kit) {
      totalAmount += parseFloat(kit.price.toString()) || 0;
    }
  }

  // Get coupon associated with the commission for this event
  let couponCode: string | undefined = undefined;
  try {
    const { getCouponByEventCommission, validateCoupon } = await import('../services/couponsService.js');
    const coupon = await getCouponByEventCommission(leader.id, event_id, commission_id || undefined); // Pass commission_id if provided
    
    if (coupon) {
      // Validate coupon before using it
      const validation = await validateCoupon(coupon.code, event.organizer_id, event_id);
      
      if (validation.valid && validation.coupon) {
        couponCode = coupon.code;
        console.log(`✅ [createRegistrationByLeader] Cupom encontrado e válido: ${coupon.code} para comissão do evento ${event_id}`);
        
        // Apply coupon discount to total amount
        if (coupon.type === 'percentage') {
          const discountAmount = totalAmount * (coupon.discount_value / 100);
          totalAmount = totalAmount - discountAmount;
          console.log(`💰 [createRegistrationByLeader] Desconto de ${coupon.discount_value}% aplicado: R$ ${discountAmount.toFixed(2)}`);
        } else if (coupon.type === 'fixed') {
          totalAmount = Math.max(0, totalAmount - coupon.discount_value);
          console.log(`💰 [createRegistrationByLeader] Desconto fixo de R$ ${coupon.discount_value.toFixed(2)} aplicado`);
        }
        
        // Ensure total amount is not negative
        totalAmount = Math.max(0, totalAmount);
        console.log(`💰 [createRegistrationByLeader] Valor total após desconto: R$ ${totalAmount.toFixed(2)}`);
      } else {
        console.log(`⚠️ [createRegistrationByLeader] Cupom encontrado mas inválido: ${validation.error || 'Cupom inválido'} - continuando sem cupom`);
      }
    } else {
      console.log(`ℹ️ [createRegistrationByLeader] Nenhum cupom encontrado para comissão do evento ${event_id} - continuando sem cupom`);
    }
  } catch (couponError: any) {
    // Log error but don't fail registration if coupon search fails
    console.error('⚠️ [createRegistrationByLeader] Erro ao buscar/validar cupom (continuando sem cupom):', couponError.message);
  }

  // Create or ensure user referral exists (so commission will be generated)
  const { createUserReferral, getUserReferral } = await import('../services/referralsService.js');
  let userReferral = await getUserReferral(athlete.id);
  
  if (!userReferral) {
    // Create referral for the athlete
    try {
      userReferral = await createUserReferral({
        user_id: athlete.id,
        referral_code: leader.referral_code,
        referral_type: 'code',
      });
      console.log('✅ Referência criada para atleta:', {
        athlete_id: athlete.id,
        leader_id: leader.id,
        referral_code: leader.referral_code,
      });
    } catch (referralError: any) {
      // If referral already exists or other error, log but continue
      console.log('ℹ️ Não foi possível criar referência (pode já existir):', referralError.message);
    }
  } else if (userReferral.leader_id !== leader.id) {
    // Athlete already has a referral from another leader
    console.log('ℹ️ Atleta já possui referência de outro líder:', {
      athlete_id: athlete.id,
      current_leader_id: userReferral.leader_id,
      attempting_leader_id: leader.id,
    });
    // Continue anyway - the existing referral will be used for commission
  }

  // Verificar se o atleta já tem uma inscrição ativa neste evento
  // Líderes também devem respeitar a regra de uma inscrição por corredor por evento
  const existingRegistration = await query(
    `SELECT id, status, payment_status FROM registrations 
     WHERE event_id = $1 AND runner_id = $2 AND status != 'cancelled'`,
    [event_id, athlete.id]
  );

  if (existingRegistration.rows.length > 0) {
    res.status(400).json({
      success: false,
      error: 'Already registered',
      message: 'Este atleta já possui uma inscrição ativa neste evento. Cada corredor pode se inscrever apenas uma vez por evento.',
    });
    return;
  }

  // OK Etapa 1: Calcular platform_fee_amount para inscrição criada por líder
  let leaderPlatformFeeAmount = 0;
  if (totalAmount > 0) {
    const { getSystemSettings } = await import('../services/systemSettingsService.js');
    const { calculateValueWithoutFee } = await import('../utils/feeCalculations.js');
    const settings = await getSystemSettings();
    const platformFeesEnabled = settings.enabled_modules?.platform_fees === true;
    const platformFee = Number(settings.platform_fee) || 0;
    const platformFeeType = (settings.platform_fee_type as 'fixed' | 'percentage') || 'fixed';
    const platformFeeMin = Number(settings.platform_fee_min) || 0;
    if (platformFeesEnabled && platformFee > 0) {
      const valueWithoutFee = calculateValueWithoutFee(totalAmount, platformFee, platformFeeType, platformFeeMin);
      leaderPlatformFeeAmount = Math.round((totalAmount - valueWithoutFee) * 100) / 100;
    }
  }

  // Create registration data
  const registrationData = {
    event_id,
    category_id,
    kit_id: kit_id || undefined,
    runner_id: athlete.id,
    registered_by: req.user.id,
    total_amount: totalAmount,
    platform_fee_amount: leaderPlatformFeeAmount,
    payment_method: 'pix' as const,
    coupon_code: couponCode,
    product_selections: product_selections || undefined,
    custom_field_values: custom_field_values || undefined,
  };

  console.log('📝 [createRegistrationByLeader] Líder criando inscrição para atleta:', {
    leader_id: leader.id,
    athlete_id: athlete.id,
    athlete_email: email,
    event_id,
    category_id,
    kit_id,
    coupon_code: couponCode,
    total_amount: totalAmount,
  });

  // Create registration
  const registration = await createRegistration(registrationData);

  console.log('✅ Inscrição criada pelo líder:', {
    id: registration.id,
    total_amount: registration.total_amount,
  });

  // Create payment if needed
  let paymentData: any = null;
  
  if (registration.total_amount > 0) {
    try {
      const runnerId = athlete.id;
      
      // Get user profile and email for Asaas customer
      const profile = await getProfileByUserId(runnerId);
      if (!profile) {
        throw new Error('Perfil do usuário não encontrado');
      }

      // Get user email from users table
      const userResult = await query(
        'SELECT email FROM users WHERE id = $1',
        [runnerId]
      );
      
      if (userResult.rows.length === 0) {
        throw new Error('Usuário não encontrado');
      }
      
      const userEmail = userResult.rows[0].email;

      // Prepare customer data for Asaas
      const customerData = {
        name: profile.full_name || 'Usuário',
        email: userEmail,
        cpfCnpj: profile.cpf?.replace(/\D/g, '') || '',
        phone: profile.phone?.replace(/\D/g, '') || '',
        mobilePhone: profile.phone?.replace(/\D/g, '') || '',
      };

      // Validate or recreate Asaas customer
      const asaasCustomerId = await validateOrRecreateCustomer(runnerId, customerData);

      // Calculate due date (3 days from now)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 3);
      const dueDateString = dueDate.toISOString().split('T')[0];

      // Create payment in Asaas
      let paymentResult;
      try {
        paymentResult = await createPayment(
          registration.id,
          asaasCustomerId,
          {
            value: registration.total_amount,
            dueDate: dueDateString,
            description: `Inscrição - ${event.title}`,
            billingType: 'PIX',
            externalReference: registration.confirmation_code || `REG-${registration.id}`,
          }
        );
      } catch (paymentError: any) {
        if (paymentError.isInvalidCustomer) {
          console.log('⚠️ Customer inválido detectado, recriando customer e tentando novamente...');
          
          await query(
            'DELETE FROM asaas_customers WHERE user_id = $1',
            [runnerId]
          );
          
          const customerResult = await createCustomer(runnerId, customerData);
          const newAsaasCustomerId = customerResult.asaas_customer_id;
          
          paymentResult = await createPayment(
            registration.id,
            newAsaasCustomerId,
            {
              value: registration.total_amount,
              dueDate: dueDateString,
              description: `Inscrição - ${event.title}`,
              billingType: 'PIX',
              externalReference: registration.confirmation_code || `REG-${registration.id}`,
            }
          );
        } else {
          throw paymentError;
        }
      }

      paymentData = {
        asaas_payment_id: paymentResult.asaas_payment_id,
        pix_qr_code: paymentResult.pix_qr_code,
        pix_qr_code_id: paymentResult.pix_qr_code_id,
        payment_link: paymentResult.payment_link,
        status: paymentResult.status,
        due_date: paymentResult.due_date,
      };
    } catch (error: any) {
      console.error('❌ Erro ao criar pagamento:', error);
      // Don't fail registration if payment fails
      paymentData = {
        error: error.message || 'Erro ao criar pagamento',
        warning: 'Inscrição criada, mas pagamento não foi processado. Entre em contato com o suporte.',
      };
    }
  }

  // Send notifications
  await sendRegistrationNotifications(registration, event, registration.runner_id);

  res.status(201).json({
    success: true,
    data: {
      ...registration,
      payment: paymentData,
    },
    message: 'Atleta inscrito com sucesso',
  });
});

