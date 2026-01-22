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

  // Check if event allows transfers
  const { getEventById } = await import('../services/eventsService.js');
  const event = await getEventById(registration.event_id);
  
  if (!event) {
    res.status(404).json({
      success: false,
      error: 'Event not found',
      message: 'Evento não encontrado',
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
  console.log(`🔍 Verificando status de pagamento para transferência ${id}:`, {
    payment_status: transferRequest.payment_status,
    asaas_payment_id: transferRequest.asaas_payment_id,
    has_asaas_id: !!transferRequest.asaas_payment_id,
  });
  
  if (transferRequest.payment_status === 'pending' && transferRequest.asaas_payment_id) {
    try {
      console.log(`🔄 Consultando Asaas diretamente para transferência ${id}: ${transferRequest.asaas_payment_id}`);
      const { getPaymentStatus } = await import('../services/asaasService.js');
      const asaasStatus = await getPaymentStatus(transferRequest.asaas_payment_id);
      
      console.log(`📊 Status retornado do Asaas:`, asaasStatus);
      
      // If payment was confirmed in Asaas, update transfer request status and process transfer
      if (asaasStatus.status === 'CONFIRMED' || asaasStatus.status === 'RECEIVED') {
        console.log(`✅ Pagamento de transferência confirmado no Asaas! Processando transferência ${id}`);
        
        // Update transfer request payment status
        const { updateTransferRequest } = await import('../services/transferRequestService.js');
        await updateTransferRequest(id, {
          payment_status: 'paid',
        });
        
        // Get fresh transfer request data after payment update
        const updatedRequest = await getTransferRequestById(id);
        
        if (!updatedRequest) {
          console.error(`❌ Transfer request não encontrado após atualização: ${id}`);
          res.json({
            success: true,
            data: transferRequest,
          });
          return;
        }

        // Check if already completed to avoid duplicate processing
        if (updatedRequest.status === 'completed') {
          console.log(`ℹ️ Transfer request já foi processado: ${id}`);
          res.json({
            success: true,
            data: updatedRequest,
          });
          return;
        }

        // Automatically transfer the registration
        try {
          // Find or get the new runner ID
          let newRunnerId = updatedRequest.new_runner_id;
          
          if (!newRunnerId) {
            // Try to find by CPF or email
            const { findUserByCpfOrEmail } = await import('../services/registrationsService.js');
            if (updatedRequest.new_runner_cpf || updatedRequest.new_runner_email) {
              const newRunner = await findUserByCpfOrEmail(
                updatedRequest.new_runner_cpf || undefined,
                updatedRequest.new_runner_email || undefined
              );
              
              if (newRunner) {
                newRunnerId = newRunner.id;
                // Update transfer request with the found runner ID
                await updateTransferRequest(id, {
                  new_runner_id: newRunnerId,
                });
              } else {
                console.error(`❌ Novo titular não encontrado para transfer request: ${id}`);
                res.json({
                  success: true,
                  data: updatedRequest,
                });
                return;
              }
            } else {
              console.error(`❌ Nenhum identificador do novo titular para transfer request: ${id}`);
              res.json({
                success: true,
                data: updatedRequest,
              });
              return;
            }
          }

          // Perform the transfer
          if (newRunnerId) {
            console.log(`🔄 Realizando transferência da inscrição ${updatedRequest.registration_id} para runner ${newRunnerId}`);
            const { transferRegistration } = await import('../services/registrationsService.js');
            await transferRegistration(updatedRequest.registration_id, newRunnerId);
            
            // Mark transfer request as completed
            await updateTransferRequest(id, {
              status: 'completed',
            });
            
            // Create notifications for both runners
            try {
              const { query } = await import('../config/database.js');
              
              // Get registration and event details for notifications
              const registrationResult = await query(
                `SELECT r.*, e.title as event_title, p_old.full_name as old_runner_name, p_new.full_name as new_runner_name
                 FROM registrations r
                 LEFT JOIN events e ON r.event_id = e.id
                 LEFT JOIN profiles p_old ON r.registered_by = p_old.id
                 LEFT JOIN profiles p_new ON $1::uuid = p_new.id
                 WHERE r.id = $2`,
                [newRunnerId, updatedRequest.registration_id]
              );
              
              const registrationData = registrationResult.rows[0];
              const eventTitle = registrationData?.event_title || 'Evento';
              const newRunnerName = registrationData?.new_runner_name || 'o novo titular';
              const oldRunnerId = updatedRequest.requested_by;
              
              // Notification for the requester (old runner) - create announcement
              if (oldRunnerId) {
                const announcementResult = await query(
                  `INSERT INTO announcements (title, content, target_audience, status, published_at, created_by)
                   VALUES ($1, $2, 'runners', 'published', NOW(), $3)
                   RETURNING id`,
                  [
                    '✅ Transferência Realizada com Sucesso',
                    `Sua inscrição no evento "${eventTitle}" foi transferida com sucesso para ${newRunnerName}. O pagamento da taxa foi confirmado e a transferência está completa.`,
                    oldRunnerId
                  ]
                );
                
                // Mark as unread for the requester (so they see it as new notification)
                if (announcementResult.rows[0]?.id) {
                  await query(
                    `INSERT INTO announcement_reads (announcement_id, user_id, read_at)
                     VALUES ($1, $2, NULL)
                     ON CONFLICT (announcement_id, user_id) DO UPDATE SET read_at = NULL`,
                    [announcementResult.rows[0].id, oldRunnerId]
                  );
                }
              }
              
              // Notification for the new runner - create announcement
              if (newRunnerId) {
                const oldRunnerName = registrationData?.old_runner_name || 'o titular anterior';
                const announcementResult = await query(
                  `INSERT INTO announcements (title, content, target_audience, status, published_at, created_by)
                   VALUES ($1, $2, 'runners', 'published', NOW(), $3)
                   RETURNING id`,
                  [
                    '🎉 Inscrição Recebida por Transferência',
                    `Você recebeu uma inscrição transferida para o evento "${eventTitle}" de ${oldRunnerName}. A inscrição foi confirmada e está ativa em sua conta.`,
                    newRunnerId
                  ]
                );
                
                // Mark as unread for the new runner (so they see it as new notification)
                if (announcementResult.rows[0]?.id) {
                  await query(
                    `INSERT INTO announcement_reads (announcement_id, user_id, read_at)
                     VALUES ($1, $2, NULL)
                     ON CONFLICT (announcement_id, user_id) DO UPDATE SET read_at = NULL`,
                    [announcementResult.rows[0].id, newRunnerId]
                  );
                }
              }
              
              console.log(`✅ Notificações criadas para transferência: ${id}`);
            } catch (notificationError: any) {
              // Don't fail the transfer if notification fails
              console.error(`⚠️ Erro ao criar notificações (transferência foi realizada):`, notificationError);
            }
            
            console.log(`✅ Transferência concluída com sucesso!`);
            
            // Get final updated request
            const finalRequest = await getTransferRequestById(id);
            if (finalRequest) {
              res.json({
                success: true,
                data: finalRequest,
              });
              return;
            }
          }
        } catch (transferError: any) {
          console.error(`❌ Erro ao realizar transferência:`, transferError);
          console.error(`❌ Stack trace:`, transferError.stack);
          // Continue and return updated request even if transfer fails
        }
        
        // Return updated request even if transfer processing had issues
        res.json({
          success: true,
          data: updatedRequest,
        });
        return;
      } else {
        console.log(`⏳ Pagamento ainda pendente no Asaas. Status: ${asaasStatus.status}`);
      }
    } catch (error: any) {
      console.error('⚠️ Erro ao consultar Asaas diretamente (continuando com status do banco):', error.message);
      console.error('⚠️ Stack trace:', error.stack);
      // Continue with database status if Asaas query fails
    }
  } else {
    if (transferRequest.payment_status !== 'pending') {
      console.log(`ℹ️ Pagamento não está pendente. Status atual: ${transferRequest.payment_status}`);
    }
    if (!transferRequest.asaas_payment_id) {
      console.log(`⚠️ Transfer request ${id} não possui asaas_payment_id`);
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

