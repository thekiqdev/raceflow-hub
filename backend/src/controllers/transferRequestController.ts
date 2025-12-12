import { Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AuthRequest } from '../middleware/auth.js';
import { hasRole } from '../services/userRolesService.js';
import {
  createTransferRequest,
  getTransferRequestById,
  getTransferRequests,
  updateTransferRequest,
} from '../services/transferRequestService.js';
import { getRegistrationById } from '../services/registrationsService.js';
import { findUserByCpfOrEmail } from '../services/registrationsService.js';
import { transferRegistration } from '../services/registrationsService.js';
import { getSystemSettings } from '../services/systemSettingsService.js';
import { getProfileByUserId } from '../services/profilesService.js';
import { createCustomer, getCustomerByUserId, createTransferPayment } from '../services/asaasService.js';
import { query } from '../config/database.js';

/**
 * Create a new transfer request
 */
export const createTransferRequestController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const { registration_id, new_runner_cpf, new_runner_email, reason } = req.body;

  if (!registration_id) {
    res.status(400).json({
      success: false,
      error: 'Registration ID is required',
      message: 'ID da inscrição é obrigatório',
    });
    return;
  }

  if (!new_runner_cpf && !new_runner_email) {
    res.status(400).json({
      success: false,
      error: 'CPF or email is required',
      message: 'Informe o CPF ou email do novo titular',
    });
    return;
  }

  // Get registration
  const registration = await getRegistrationById(registration_id);

  if (!registration) {
    res.status(404).json({
      success: false,
      error: 'Registration not found',
      message: 'Inscrição não encontrada',
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
      message: 'Você só pode solicitar transferência de suas próprias inscrições',
    });
    return;
  }

  // Check if module is enabled
  const settings = await getSystemSettings();
  if (!settings.enabled_modules?.transfers) {
    res.status(403).json({
      success: false,
      error: 'Module disabled',
      message: 'O módulo de transferência está desabilitado',
    });
    return;
  }

  // Get transfer fee from settings
  const transferFee = settings.transfer_fee || 0;

  // Try to find the new runner
  let newRunnerId: string | undefined;
  if (new_runner_cpf || new_runner_email) {
    const newRunner = await findUserByCpfOrEmail(new_runner_cpf, new_runner_email);
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
  }

  // Create transfer request
  const transferRequest = await createTransferRequest({
    registration_id,
    requested_by: req.user.id,
    new_runner_cpf: new_runner_cpf || undefined,
    new_runner_email: new_runner_email || undefined,
    new_runner_id: newRunnerId,
    transfer_fee: transferFee,
    reason: reason || undefined,
  });

  res.status(201).json({
    success: true,
    data: transferRequest,
    message: 'Solicitação de transferência criada com sucesso',
  });
});

/**
 * Get all transfer requests (admin only)
 */
export const getTransferRequestsController = asyncHandler(async (req: AuthRequest, res: Response) => {
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
      message: 'Apenas administradores podem visualizar solicitações de transferência',
    });
    return;
  }

  const { status } = req.query;
  const filters: any = {};
  if (status) {
    filters.status = status as string;
  }

  const transferRequests = await getTransferRequests(filters);

  res.json({
    success: true,
    data: transferRequests,
  });
});

/**
 * Get transfer request by ID
 */
export const getTransferRequestByIdController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const { id } = req.params;
  const transferRequest = await getTransferRequestById(id);

  if (!transferRequest) {
    res.status(404).json({
      success: false,
      error: 'Transfer request not found',
      message: 'Solicitação de transferência não encontrada',
    });
    return;
  }

  // Check permissions
  const isAdmin = await hasRole(req.user.id, 'admin');
  const isOwner = transferRequest.requested_by === req.user.id;

  if (!isAdmin && !isOwner) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Você não tem permissão para visualizar esta solicitação',
    });
    return;
  }

  // If payment is still pending, check Asaas directly for real-time status
  // This ensures we get the latest status even if webhook hasn't arrived yet
  if (transferRequest.payment_status === 'pending' && transferRequest.asaas_payment_id) {
    try {
      console.log(`🔄 Consultando Asaas diretamente para transferência ${id}: ${transferRequest.asaas_payment_id}`);
      const { getPaymentStatus } = await import('../services/asaasService.js');
      const asaasStatus = await getPaymentStatus(transferRequest.asaas_payment_id);
      
      // If payment was confirmed in Asaas, update transfer request status
      if (asaasStatus.status === 'CONFIRMED' || asaasStatus.status === 'RECEIVED') {
        console.log(`✅ Pagamento de transferência confirmado no Asaas! Atualizando transfer request ${id}`);
        
        // Update transfer request payment status
        const { updateTransferRequest } = await import('../services/transferRequestService.js');
        await updateTransferRequest(id, {
          payment_status: 'paid',
        });
        
        // Refresh transfer request data
        const updatedRequest = await getTransferRequestById(id);
        
        if (updatedRequest) {
          res.json({
            success: true,
            data: updatedRequest,
          });
          return;
        }
      }
    } catch (error: any) {
      console.error('⚠️ Erro ao consultar Asaas diretamente (continuando com status do banco):', error.message);
      // Continue with database status if Asaas query fails
    }
  }

  res.json({
    success: true,
    data: transferRequest,
  });
});

/**
 * Update transfer request (approve/reject)
 */
export const updateTransferRequestController = asyncHandler(async (req: AuthRequest, res: Response) => {
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
      message: 'Apenas administradores podem processar solicitações de transferência',
    });
    return;
  }

  const { id } = req.params;
  const { status, admin_notes, new_runner_id } = req.body;

  const transferRequest = await getTransferRequestById(id);

  if (!transferRequest) {
    res.status(404).json({
      success: false,
      error: 'Transfer request not found',
      message: 'Solicitação de transferência não encontrada',
    });
    return;
  }

  // If approving, need to find or create the new runner
  let finalNewRunnerId = new_runner_id || transferRequest.new_runner_id;
  
  if (status === 'approved' && !finalNewRunnerId) {
    // Try to find by CPF or email
    if (transferRequest.new_runner_cpf || transferRequest.new_runner_email) {
      const newRunner = await findUserByCpfOrEmail(
        transferRequest.new_runner_cpf || undefined,
        transferRequest.new_runner_email || undefined
      );
      if (newRunner) {
        finalNewRunnerId = newRunner.id;
      } else {
        res.status(400).json({
          success: false,
          error: 'New runner not found',
          message: 'Não foi possível encontrar o novo titular. Verifique o CPF ou email informado.',
        });
        return;
      }
    } else {
      res.status(400).json({
        success: false,
        error: 'New runner required',
        message: 'É necessário informar o novo titular da inscrição',
      });
      return;
    }
  }

  // Update transfer request
  const updateData: any = {
    status,
    admin_notes,
    processed_by: req.user.id,
  };

  if (finalNewRunnerId) {
    updateData.new_runner_id = finalNewRunnerId;
  }

  const updatedRequest = await updateTransferRequest(id, updateData);

  // If approved, actually transfer the registration
  if (status === 'approved' && finalNewRunnerId) {
    try {
      await transferRegistration(transferRequest.registration_id, finalNewRunnerId);
      
      // Mark as completed
      await updateTransferRequest(id, { status: 'completed' });
    } catch (error: any) {
      console.error('Error transferring registration:', error);
      // Revert status
      await updateTransferRequest(id, { status: 'pending' });
      
      res.status(500).json({
        success: false,
        error: 'Transfer failed',
        message: 'Erro ao transferir inscrição: ' + (error.message || 'Erro desconhecido'),
      });
      return;
    }
  }

  res.json({
    success: true,
    data: updatedRequest,
    message: status === 'approved' 
      ? 'Solicitação aprovada e inscrição transferida com sucesso'
      : status === 'rejected'
      ? 'Solicitação rejeitada'
      : 'Solicitação atualizada',
  });
});

/**
 * Generate payment for transfer fee
 */
export const generateTransferPaymentController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const { id } = req.params;
  const transferRequest = await getTransferRequestById(id);

  if (!transferRequest) {
    res.status(404).json({
      success: false,
      error: 'Transfer request not found',
      message: 'Solicitação de transferência não encontrada',
    });
    return;
  }

  // Check if user owns the request
  const isOwner = transferRequest.requested_by === req.user.id;
  const isAdmin = await hasRole(req.user.id, 'admin');

  if (!isAdmin && !isOwner) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Você não tem permissão para gerar pagamento desta solicitação',
    });
    return;
  }

  // Check if payment already exists
  if (transferRequest.asaas_payment_id) {
    res.status(400).json({
      success: false,
      error: 'Payment already exists',
      message: 'Pagamento já foi gerado para esta solicitação',
    });
    return;
  }

  // Check if fee is greater than 0
  if (transferRequest.transfer_fee <= 0) {
    res.status(400).json({
      success: false,
      error: 'No fee required',
      message: 'Esta transferência não requer pagamento de taxa',
    });
    return;
  }

  try {
    // Get user profile and email
    const profile = await getProfileByUserId(req.user.id);
    if (!profile) {
      throw new Error('Perfil do usuário não encontrado');
    }

    const userResult = await query(
      'SELECT email FROM users WHERE id = $1',
      [req.user.id]
    );
    
    if (userResult.rows.length === 0) {
      throw new Error('Usuário não encontrado');
    }
    
    const userEmail = userResult.rows[0].email;

    // Get or create Asaas customer
    let asaasCustomerId = await getCustomerByUserId(req.user.id);
    
    if (!asaasCustomerId) {
      const customerData = {
        name: profile.full_name || 'Usuário',
        email: userEmail,
        cpfCnpj: profile.cpf?.replace(/\D/g, '') || '',
        phone: profile.phone?.replace(/\D/g, '') || '',
        mobilePhone: profile.phone?.replace(/\D/g, '') || '',
      };

      const customerResult = await createCustomer(req.user.id, customerData);
      asaasCustomerId = customerResult.asaas_customer_id;
    }

    // Calculate due date (3 days from now)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3);
    const dueDateString = dueDate.toISOString().split('T')[0];

    // Get registration for description
    const registration = await getRegistrationById(transferRequest.registration_id);

    // Create payment in Asaas (using transfer request ID as reference)
    const paymentResult = await createTransferPayment(
      transferRequest.id,
      asaasCustomerId,
      {
        value: transferRequest.transfer_fee,
        dueDate: dueDateString,
        description: `Taxa de Transferência - ${registration?.event_title || 'Evento'}`,
        billingType: 'PIX',
        externalReference: `TRANSFER-${transferRequest.id}`,
      }
    );

    // Update transfer request with payment info
    await updateTransferRequest(id, {
      asaas_payment_id: paymentResult.asaas_payment_id,
      payment_status: 'pending',
    });

    // Note: The payment is saved in asaas_payments table with registration_id = transferRequest.id
    // This is a workaround - ideally we'd have a separate table or nullable registration_id

    res.json({
      success: true,
      data: {
        pix_qr_code: paymentResult.pix_qr_code,
        pix_qr_code_id: paymentResult.pix_qr_code_id,
        due_date: paymentResult.due_date,
        value: paymentResult.value,
        asaas_payment_id: paymentResult.asaas_payment_id,
      },
      message: 'Pagamento gerado com sucesso',
    });
  } catch (error: any) {
    console.error('❌ Error generating transfer payment:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
      status: error.response?.status,
    });
    res.status(500).json({
      success: false,
      error: 'Payment generation failed',
      message: error.message || 'Erro ao gerar pagamento',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

