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
import { createCustomer, createPayment, getPaymentByRegistrationId, validateOrRecreateCustomer } from '../services/asaasService.js';
import { getProfileByUserId } from '../services/profilesService.js';
import { query } from '../config/database.js';

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

  // ETAPA: Validate that user has runner role
  const isRunner = await hasRole(req.user.id, 'runner');
  if (!isRunner) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Apenas corredores podem se inscrever em eventos. Por favor, acesse com uma conta de corredor.',
    });
    return;
  }

  const { event_id, category_id } = req.body;

  if (!event_id || !category_id) {
    res.status(400).json({
      success: false,
      error: 'Missing required fields',
      message: 'event_id and category_id are required',
    });
    return;
  }

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

  // Check event status - only 'published' and 'ongoing' allow registrations
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

  const registrationData = {
    ...req.body,
    registered_by: req.user.id,
    runner_id: req.body.runner_id || req.user.id,
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
            billingType: 'PIX', // Default to PIX
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
          // Se não temos QR Code mas temos payment_link, podemos usar o link
          // O frontend pode redirecionar ou mostrar o link como alternativa
        };

        console.log('✅ Pagamento criado no Asaas:', {
          asaas_payment_id: paymentData.asaas_payment_id,
          status: paymentData.status,
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

          paymentData = {
            asaas_payment_id: paymentResult.asaas_payment_id,
            pix_qr_code: paymentResult.pix_qr_code,
            pix_qr_code_id: paymentResult.pix_qr_code_id,
            payment_link: paymentResult.payment_link,
            status: paymentResult.status,
            due_date: paymentResult.due_date,
          };

          console.log('✅ Pagamento criado no Asaas após recriar customer:', {
            asaas_payment_id: paymentData.asaas_payment_id,
            status: paymentData.status,
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

  // Check event status
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
  const registrationData = {
    event_id,
    category_id,
    kit_id: kit_id || undefined,
    runner_id: athlete.id,
    registered_by: req.user.id,
    total_amount: totalAmount,
    payment_method: 'pix' as const,
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

  const updatedRegistration = await updateRegistration(id, req.body);

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
  }

  const registrations = await getRegistrations(filters);

  // Generate CSV
  const headers = [
    'ID',
    'Nome do Atleta',
    'CPF',
    'Evento',
    'Categoria',
    'Kit',
    'Valor',
    'Status',
    'Status Pagamento',
    'Método Pagamento',
    'Código Confirmação',
    'Data Inscrição',
  ];

  const rows = registrations.map((reg: any) => [
    reg.id,
    reg.runner_name || '',
    reg.runner_cpf || '',
    reg.event_title || '',
    reg.category_name || '',
    reg.kit_name || 'Sem kit',
    parseFloat(reg.total_amount || 0).toFixed(2),
    reg.status || '',
    reg.payment_status || '',
    reg.payment_method || '',
    reg.confirmation_code || '',
    reg.created_at ? new Date(reg.created_at).toLocaleDateString('pt-BR') : '',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row: any[]) => row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="inscricoes_${new Date().toISOString().split('T')[0]}.csv"`);
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

  const { email, event_id, category_id, kit_id } = req.body;

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

  // Check event status
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
  };

  console.log('📝 Líder criando inscrição para atleta:', {
    leader_id: leader.id,
    athlete_id: athlete.id,
    athlete_email: email,
    event_id,
    category_id,
    kit_id,
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

  res.status(201).json({
    success: true,
    data: {
      ...registration,
      payment: paymentData,
    },
    message: 'Atleta inscrito com sucesso',
  });
  res.json({
    success: true,
    data: registration,
    message: 'Receipt data retrieved successfully',
  });
});

