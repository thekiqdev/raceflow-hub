import { Response, Request } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import {
  getRegistrations,
  getRegistrationById,
  createRegistration,
  updateRegistration,
  findUserByCpfOrEmail,
  findUserByEmail,
  transferRegistration,
  cancelRegistration,
} from '../services/registrationsService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { hasRole } from '../services/userRolesService.js';
import { getEventById } from '../services/eventsService.js';
import { getCategoryById } from '../services/categoriesService.js';
import { createCustomer, createPayment, createCreditCardPayment, getPaymentByRegistrationId, validateOrRecreateCustomer } from '../services/asaasService.js';
import { getProfileByUserId } from '../services/profilesService.js';
import { query } from '../config/database.js';
import { sendNotificationSafely, getUserEmail, getUserName, getOrganizerEmail } from '../services/notificationService.js';
import { z } from 'zod';
import { EventRegistrationStatus, Event, PaymentStatus } from '../types/index.js';
import { calculateRegistrationStatus } from '../services/eventsService.js';

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

// Schema for create registration request
const createRegistrationSchema = z.object({
  event_id: z.string().uuid('ID do evento inválido'),
  runner_id: z.string().uuid('ID do corredor inválido').optional(),
  category_id: z.string().uuid('ID da categoria inválido'),
  kit_id: z.string().uuid('ID do kit inválido').optional(),
  payment_method: z.enum(['pix', 'credit_card', 'boleto']).optional(),
  total_amount: z.number().min(0, 'Valor total deve ser maior ou igual a zero'),
  coupon_code: z.string().optional(),
  credit_card: creditCardDataSchema.optional(),
  credit_card_holder_info: creditCardHolderInfoSchema.optional(),
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
  }

  const registrations = await getRegistrations(filters);

  res.json({
    success: true,
    data: registrations,
  });
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
      kit_name: registration.kit_name,
      total_amount: registration.total_amount,
      runner_name: registration.runner_name,
      runner_cpf: registration.runner_cpf,
      created_at: registration.created_at,
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

  res.json({
    success: true,
    data: registration,
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

  const registrationData = {
    ...validation.data,
    registered_by: req.user.id,
    runner_id: validation.data.runner_id || req.user.id,
  };

  console.log('📝 Dados recebidos para criação de inscrição:', {
    event_id: registrationData.event_id,
    category_id: registrationData.category_id,
    kit_id: registrationData.kit_id,
    total_amount: registrationData.total_amount,
    payment_method: registrationData.payment_method,
  });

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

  // Check if user is organizer or admin
  const isOrganizer = await hasRole(req.user.id, 'organizer');
  const isAdmin = await hasRole(req.user.id, 'admin');
  
  if (!isOrganizer && !isAdmin) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas organizadores e administradores podem inscrever atletas',
    });
    return;
  }

  const { email, event_id, category_id, kit_id } = req.body;

  if (!email || !event_id || !category_id) {
    res.status(400).json({
      success: false,
      error: 'Missing required fields',
      message: 'email, event_id e category_id são obrigatórios',
    });
    return;
  }

  // Validate email format with stricter rules
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    res.status(400).json({
      success: false,
      error: 'Invalid email format',
      message: 'E-mail inválido: formato incorreto',
    });
    return;
  }

  // Check domain structure
  const emailParts = email.split('@');
  if (emailParts.length !== 2) {
    res.status(400).json({
      success: false,
      error: 'Invalid email format',
      message: 'E-mail inválido: formato incorreto',
    });
    return;
  }

  const domain = emailParts[1];
  const domainParts = domain.split('.');

  // Domain must have at least 2 parts and TLD must have at least 2 characters
  if (domainParts.length < 2 || domainParts[domainParts.length - 1].length < 2) {
    res.status(400).json({
      success: false,
      error: 'Invalid email format',
      message: 'E-mail inválido: domínio deve ter um ponto e TLD válido (ex: .com, .com.br)',
    });
    return;
  }

  // Check if any domain part is empty
  for (const part of domainParts) {
    if (part.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Invalid email format',
        message: 'E-mail inválido: formato incorreto',
      });
      return;
    }
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

  // Check if organizer owns the event (unless admin)
  if (!isAdmin && event.organizer_id !== req.user.id) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Você só pode inscrever atletas nos seus próprios eventos',
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

  // Calculate total amount
  let totalAmount = parseFloat(selectedCategory.price.toString()) || 0;
  
  if (kit_id) {
    const { getEventKits } = await import('../services/eventKitsService.js');
    const kits = await getEventKits(event_id);
    const kit = kits.find(k => k.id === kit_id);
    if (kit) {
      totalAmount += parseFloat(kit.price.toString()) || 0;
    }
  }

  // Create registration data
  // When organizer creates registration, set status as 'confirmed'
  // If total_amount is 0, set payment_status as 'convidado', otherwise 'paid' (organizer handles payment manually)
  const paymentStatusValue: PaymentStatus = totalAmount === 0 ? 'convidado' : 'paid';
  
  const registrationData = {
    event_id,
    category_id,
    kit_id: kit_id || undefined,
    runner_id: athlete.id,
    registered_by: req.user.id,
    total_amount: totalAmount,
    payment_method: 'pix' as const,
    status: 'confirmed' as const, // Inscrições criadas por organizador vêm como confirmadas
    payment_status: paymentStatusValue, // Se grátis = convidado, senão = pago (organizador trata pagamento manualmente)
  };

  console.log('📝 Organizador criando inscrição para atleta:', {
    organizer_id: req.user.id,
    athlete_id: athlete.id,
    athlete_email: email,
    event_id,
    category_id,
    kit_id,
    total_amount: totalAmount,
  });

  // Create registration
  const registration = await createRegistration(registrationData);

  console.log('✅ Inscrição criada pelo organizador:', {
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
      console.log(`🔄 Consultando Asaas diretamente para atualizar status: ${payment.asaas_payment_id}`);
      const { getPaymentStatus } = await import('../services/asaasService.js');
      const asaasStatus = await getPaymentStatus(payment.asaas_payment_id);
      
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
                    const { checkAllInvitationBonuses } = await import('../services/leaderBonusService.js');
                    await checkAllInvitationBonuses(leaderId, reg.event_id);
                  } else if (commissionError.message.includes('must be greater than 0')) {
                    console.log(`ℹ️ Valor da comissão é 0, verificando apenas bônus de convite...`);
                    const { checkAllInvitationBonuses } = await import('../services/leaderBonusService.js');
                    await checkAllInvitationBonuses(leaderId, reg.event_id);
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
                  const { checkAllInvitationBonuses } = await import('../services/leaderBonusService.js');
                  await checkAllInvitationBonuses(leaderId, reg.event_id);
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

  // Check if payment status is being updated to 'paid' or status to 'confirmed'
  const wasPaid = registration.payment_status === 'paid';
  const wasConfirmed = registration.status === 'confirmed';
  const willBePaid = req.body.payment_status === 'paid';
  const willBeConfirmed = req.body.status === 'confirmed';
  const paymentJustConfirmed = !wasPaid && willBePaid;
  const statusJustConfirmed = !wasConfirmed && willBeConfirmed;

  const updatedRegistration = await updateRegistration(id, req.body);

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
          // NOVO: Se a inscrição tem cupom, verificar se a comissão associada é apenas 'invitation'
          // Se for, não criar comissão, apenas verificar bônus
          if (reg.coupon_code) {
            try {
              const { getCouponByCodeOnly } = await import('../services/couponsService.js');
              const coupon = await getCouponByCodeOnly(reg.coupon_code);
              if (coupon && coupon.leader_id === leaderId) {
                // Buscar comissão associada a este cupom específico
                const commissionIdShort = coupon.code.replace(/[^0-9A-Z]/g, '').substring(4, 12); // Extrair ID da comissão do código do cupom
                const commissionResult = await query(
                  `SELECT id, bonus_type FROM leader_event_commissions 
                   WHERE leader_id = $1 AND event_id = $2
                   AND REPLACE(UPPER(id::text), '-', '') LIKE '%' || $3 || '%'`,
                  [leaderId, reg.event_id, commissionIdShort]
                );
                if (commissionResult.rows.length > 0) {
                  const bonusType = commissionResult.rows[0].bonus_type;
                  console.log(`🎯 [updateRegistrationController] Comissão específica encontrada pelo cupom: ${commissionResult.rows[0].id} (tipo: ${bonusType})`);
                  
                  // Se for apenas 'invitation', não criar comissão, apenas verificar bônus
                  if (bonusType === 'invitation') {
                    console.log(`🎁 [updateRegistrationController] Comissão é apenas 'invitation', verificando bônus de convite...`);
                    const { checkAllInvitationBonuses } = await import('../services/leaderBonusService.js');
                    await checkAllInvitationBonuses(leaderId, reg.event_id);
                    // Não criar comissão para tipo 'invitation', mas continuar o fluxo
                    // (não usar return aqui, pois ainda precisa processar outras coisas)
                  } else {
                    // Se não for apenas 'invitation', criar comissão normalmente abaixo
                  }
                }
              }
            } catch (couponError: any) {
              console.log(`ℹ️ [updateRegistrationController] Erro ao buscar comissão específica pelo cupom: ${couponError.message}`);
            }
          }
          
          // Create commission (this will also check for invitation bonuses)
          // Skip if bonus type is 'invitation' only (already handled above)
          let shouldCreateCommission = true;
          if (reg.coupon_code) {
            try {
              const { getCouponByCodeOnly } = await import('../services/couponsService.js');
              const coupon = await getCouponByCodeOnly(reg.coupon_code);
              if (coupon && coupon.leader_id === leaderId) {
                const commissionIdShort = coupon.code.replace(/[^0-9A-Z]/g, '').substring(4, 12);
                const commissionResult = await query(
                  `SELECT id, bonus_type FROM leader_event_commissions 
                   WHERE leader_id = $1 AND event_id = $2
                   AND REPLACE(UPPER(id::text), '-', '') LIKE '%' || $3 || '%'`,
                  [leaderId, reg.event_id, commissionIdShort]
                );
                if (commissionResult.rows.length > 0 && commissionResult.rows[0].bonus_type === 'invitation') {
                  // Already handled above, skip commission creation
                  shouldCreateCommission = false;
                }
              }
            } catch (couponError: any) {
              // Continue with commission creation if coupon check fails
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
            // If no commission is configured (invitation type only) or amount is 0, just check for bonuses
            if (commissionError.message.includes('No commission configured') || 
                commissionError.message.includes('invitation type only')) {
              console.log(`ℹ️ [updateRegistrationController] Tipo de bônus é apenas 'invitation', verificando bônus de convite...`);
              const { checkAllInvitationBonuses } = await import('../services/leaderBonusService.js');
              await checkAllInvitationBonuses(leaderId, reg.event_id);
            } else if (commissionError.message.includes('must be greater than 0')) {
              console.log(`ℹ️ [updateRegistrationController] Valor da comissão é 0, verificando apenas bônus de convite...`);
              const { checkAllInvitationBonuses } = await import('../services/leaderBonusService.js');
              await checkAllInvitationBonuses(leaderId, reg.event_id);
            } else {
              console.error('❌ [updateRegistrationController] Erro ao criar comissão:', commissionError.message);
            }
          }
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

  res.json({
    success: true,
    data: updatedRegistration,
    message: 'Registration updated successfully',
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
  }

  const registrations = await getRegistrations(filters);

  // Generate CSV in the requested format
  const headers = [
    'NUMERO',
    'NOME MINUSCULO',
    'NOME',
    'SEXO',
    'NASCIMENTO',
    'KIT',
    'VARIAÇÃO',
    'MODALIDADE',
    'DATA HORA INSCRIÇÃO',
    'MEIO DE PAGAMENTO',
    'LÍDER',
    'QRCODE',
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

  // Helper function to get modality distance (first available)
  const getModalityDistance = (reg: any): string => {
    if (reg.modality_distances && reg.modality_distances.length > 0) {
      return reg.modality_distances[0] || '';
    }
    return '';
  };

  // Helper function to generate QR code URL
  const getQRCodeUrl = (reg: any, sequentialNumber: number): string => {
    if (!reg.event_title) return '';
    // Extract year from event date or use current year
    const eventDate = reg.event_date ? new Date(reg.event_date) : new Date();
    const year = eventDate.getFullYear();
    
    // Generate event slug from title (lowercase, remove special chars, replace spaces)
    const eventSlug = reg.event_title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9\s]/g, '') // Remove special characters
      .replace(/\s+/g, '') // Remove spaces
      .trim();
    
    // URL pattern: https://resultados.cronoteam.com.br/resultados/g-live.html?f=eventos/YYYY/eventname/eventname.clax&B=NUMERO
    return `https://resultados.cronoteam.com.br/resultados/g-live.html?f=eventos/${year}/${eventSlug}/${eventSlug}.clax&B=${sequentialNumber}`;
  };

  // Helper function to get kit name
  const getKitName = (reg: any): string => {
    return reg.kit_name || '';
  };

  // Helper function to get kit variation (if available, otherwise empty)
  const getKitVariation = (_reg: any): string => {
    // If there's a kit variant stored, return it
    // For now, return empty as it's not stored in the current schema
    // TODO: Add variant storage when implementing variant selection in registration
    return '';
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

  const rows = registrations.map((reg: any, index: number) => {
    const runnerName = reg.runner_name || '';
    const runnerNameLower = runnerName.toLowerCase();
    const runnerNameUpper = runnerName.toUpperCase();
    // Debug: logar o valor do gênero para as primeiras 3 inscrições
    if (index < 3) {
      console.log(`🔍 CSV Export - Inscrição ${index + 1}:`, {
        runner_name: runnerName,
        runner_gender_raw: reg.runner_gender,
        runner_gender_type: typeof reg.runner_gender,
        runner_gender_formatted: formatGender(reg.runner_gender),
      });
    }
    const gender = formatGender(reg.runner_gender);
    const birthDate = formatDate(reg.runner_birth_date);
    const kitName = getKitName(reg);
    const kitVariation = getKitVariation(reg);
    const modality = getModalityDistance(reg);
    const registrationDateTime = formatDateTime(reg.created_at);
    const paymentMethod = formatPaymentMethod(reg.payment_method);
    const leaderName = reg.leader_name || '';
    const qrCode = getQRCodeUrl(reg, index + 1);

    return [
      index + 1, // NUMERO (sequential number)
      runnerNameLower, // NOME MINUSCULO
      runnerNameUpper, // NOME
      gender, // SEXO
      birthDate, // NASCIMENTO
      kitName, // KIT
      kitVariation, // VARIAÇÃO
      modality, // MODALIDADE
      registrationDateTime, // DATA HORA INSCRIÇÃO
      paymentMethod, // MEIO DE PAGAMENTO
      leaderName, // LÍDER
      qrCode, // QRCODE
    ];
  });

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

  const { email, event_id, category_id, kit_id, commission_id } = req.body;

  if (!email || !event_id || !category_id) {
    res.status(400).json({
      success: false,
      error: 'Missing required fields',
      message: 'email, event_id e category_id são obrigatórios',
    });
    return;
  }

  // Validate email format with stricter rules
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    res.status(400).json({
      success: false,
      error: 'Invalid email format',
      message: 'E-mail inválido: formato incorreto',
    });
    return;
  }

  // Check domain structure
  const emailParts = email.split('@');
  if (emailParts.length !== 2) {
    res.status(400).json({
      success: false,
      error: 'Invalid email format',
      message: 'E-mail inválido: formato incorreto',
    });
    return;
  }

  const domain = emailParts[1];
  const domainParts = domain.split('.');

  // Domain must have at least 2 parts and TLD must have at least 2 characters
  if (domainParts.length < 2 || domainParts[domainParts.length - 1].length < 2) {
    res.status(400).json({
      success: false,
      error: 'Invalid email format',
      message: 'E-mail inválido: domínio deve ter um ponto e TLD válido (ex: .com, .com.br)',
    });
    return;
  }

  // Check if any domain part is empty
  for (const part of domainParts) {
    if (part.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Invalid email format',
        message: 'E-mail inválido: formato incorreto',
      });
      return;
    }
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

  // Create registration data
  const registrationData = {
    event_id,
    category_id,
    kit_id: kit_id || undefined,
    runner_id: athlete.id,
    registered_by: req.user.id,
    total_amount: totalAmount,
    payment_method: 'pix' as const,
    coupon_code: couponCode,
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

