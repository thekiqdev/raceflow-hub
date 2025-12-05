import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import {
  getRegistrations,
  getRegistrationById,
  createRegistration,
  updateRegistration,
  findUserByCpf,
  transferRegistration,
  cancelRegistration,
} from '../services/registrationsService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { hasRole } from '../services/userRolesService.js';
import { getEventById } from '../services/eventsService.js';
import { getEventCategories } from '../services/eventCategoriesService.js';

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
  const categories = await getEventCategories(event_id);
  const selectedCategory = categories.find(cat => cat.id === category_id);
  
  if (!selectedCategory) {
    res.status(404).json({
      success: false,
      error: 'Category not found',
      message: 'Categoria não encontrada',
    });
    return;
  }

  // Check if category has available spots
  if (selectedCategory.max_participants !== null) {
    const availableSpots = selectedCategory.available_spots ?? 0;
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

  const registration = await createRegistration(registrationData);

  res.status(201).json({
    success: true,
    data: registration,
    message: 'Registration created successfully',
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
export const transferRegistrationController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const { id } = req.params;
  const { cpf } = req.body;

  if (!cpf) {
    res.status(400).json({
      success: false,
      error: 'CPF is required',
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

  // Find user by CPF
  const newRunner = await findUserByCpf(cpf);

  if (!newRunner) {
    res.status(404).json({
      success: false,
      error: 'User not found',
      message: 'Não foi encontrado um usuário com este CPF',
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

  // Transfer registration
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
  res.json({
    success: true,
    data: registration,
    message: 'Receipt data retrieved successfully',
  });
});

