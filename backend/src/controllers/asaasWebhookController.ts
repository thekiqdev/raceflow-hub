import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { query } from '../config/database.js';
import {
  AsaasWebhookPayload,
  AsaasWebhookEventType,
  AsaasPaymentStatus,
} from '../types/asaas.js';
import { getTransferRequestById, updateTransferRequest } from '../services/transferRequestService.js';
import { findUserByCpfOrEmail, transferRegistration } from '../services/registrationsService.js';

/**
 * Handle Asaas webhook events
 * POST /api/webhooks/asaas
 */
export const handleWebhook = asyncHandler(async (req: Request, res: Response) => {
  const payload = req.body as AsaasWebhookPayload;

  // Validate payload
  if (!payload.event || !payload.payment) {
    console.error('❌ Payload inválido do webhook');
    res.status(400).json({
      success: false,
      error: 'Invalid payload',
      message: 'Event and payment are required',
    });
    return;
  }

  // Validate payment.id
  if (!payload.payment.id) {
    console.error('❌ payment.id não fornecido no webhook');
    res.status(400).json({
      success: false,
      error: 'Invalid payload',
      message: 'Payment ID is required',
    });
    return;
  }

  const { event, payment } = payload;
  const asaasPaymentId = payment.id;

  // Enhanced logging
  console.log('📥 Webhook recebido do Asaas:', {
    event: event,
    paymentId: asaasPaymentId,
    paymentStatus: payment.status,
    externalReference: payment.externalReference,
    value: payment.value,
    billingType: payment.billingType,
  });

  // Check if this is a transfer request payment
  const isTransferPayment = payment.externalReference?.startsWith('TRANSFER-');
  
  if (isTransferPayment && payment.externalReference) {
    const transferRequestId = payment.externalReference.replace('TRANSFER-', '');
    console.log(`🔄 Processando pagamento de transferência: ${transferRequestId}`);
    
    // Save webhook event to database first
    let webhookEventId: string | null = null;
    try {
      const webhookResult = await query(
        `INSERT INTO asaas_webhook_events (
          event_type, asaas_payment_id, registration_id, payload, processed
        ) VALUES ($1, $2, $3, $4, false)
        RETURNING id`,
        [
          event,
          asaasPaymentId,
          null, // No registration_id for transfer payments
          JSON.stringify(payload),
        ]
      );
      webhookEventId = webhookResult.rows[0].id;
    } catch (error: any) {
      console.error('❌ Erro ao salvar evento do webhook:', error);
    }
    
    // Update transfer request payment status
    if (payment.status === 'CONFIRMED' || payment.status === 'RECEIVED') {
      await query(
        `UPDATE transfer_requests 
         SET payment_status = 'paid', updated_at = NOW()
         WHERE id = $1`,
        [transferRequestId]
      );
      console.log(`✅ Pagamento de transferência confirmado: ${transferRequestId}`);
      
      // Automatically transfer the registration
      try {
        // Get fresh transfer request data after payment update
        const transferRequest = await getTransferRequestById(transferRequestId);
        
        if (!transferRequest) {
          console.error(`❌ Transfer request não encontrado: ${transferRequestId}`);
          if (webhookEventId) {
            await query(
              'UPDATE asaas_webhook_events SET processed = true, error_message = $1 WHERE id = $2',
              ['Transfer request not found', webhookEventId]
            );
          }
          return res.status(200).json({
            success: true,
            message: 'Payment confirmed but transfer request not found',
          });
        }

        // Check if already completed to avoid duplicate processing
        if (transferRequest.status === 'completed') {
          console.log(`ℹ️ Transfer request já foi processado: ${transferRequestId}`);
          if (webhookEventId) {
            await query(
              'UPDATE asaas_webhook_events SET processed = true WHERE id = $1',
              [webhookEventId]
            );
          }
          return res.status(200).json({
            success: true,
            message: 'Transfer already completed',
          });
        }

        // Find or get the new runner ID
        let newRunnerId = transferRequest.new_runner_id;
        
        if (!newRunnerId) {
          // Try to find by CPF or email
          if (transferRequest.new_runner_cpf || transferRequest.new_runner_email) {
            const newRunner = await findUserByCpfOrEmail(
              transferRequest.new_runner_cpf || undefined,
              transferRequest.new_runner_email || undefined
            );
            
            if (newRunner) {
              newRunnerId = newRunner.id;
              // Update transfer request with the found runner ID
              await updateTransferRequest(transferRequestId, {
                new_runner_id: newRunnerId,
              });
            } else {
              console.error(`❌ Novo titular não encontrado para transfer request: ${transferRequestId}`);
              // Mark webhook event as processed but don't transfer
              if (webhookEventId) {
                await query(
                  'UPDATE asaas_webhook_events SET processed = true, error_message = $1 WHERE id = $2',
                  ['New runner not found', webhookEventId]
                );
              }
              return res.status(200).json({
                success: true,
                message: 'Payment confirmed but transfer pending - new runner not found',
              });
            }
          } else {
            console.error(`❌ Nenhum identificador do novo titular para transfer request: ${transferRequestId}`);
            if (webhookEventId) {
              await query(
                'UPDATE asaas_webhook_events SET processed = true, error_message = $1 WHERE id = $2',
                ['No new runner identifier', webhookEventId]
              );
            }
            return res.status(200).json({
              success: true,
              message: 'Payment confirmed but transfer pending - no new runner identifier',
            });
          }
        }
        
        // Perform the transfer
        if (newRunnerId) {
          // Get registration and event details for notifications
          const registrationResult = await query(
            `SELECT r.*, e.title as event_title, p_old.full_name as old_runner_name, p_new.full_name as new_runner_name
             FROM registrations r
             LEFT JOIN events e ON r.event_id = e.id
             LEFT JOIN profiles p_old ON r.runner_id = p_old.id
             LEFT JOIN profiles p_new ON $1::uuid = p_new.id
             WHERE r.id = $2`,
            [newRunnerId, transferRequest.registration_id]
          );
          
          const registrationData = registrationResult.rows[0];
          
          // Transfer the registration (this updates status to 'transferred')
          await transferRegistration(transferRequest.registration_id, newRunnerId);
          
          // Mark transfer request as completed (this will also set processed_at)
          await updateTransferRequest(transferRequestId, {
            status: 'completed',
          });
          
          console.log(`✅ Transferência automática concluída: ${transferRequestId} -> Registration ${transferRequest.registration_id} transferida para runner ${newRunnerId}`);
          
          // Create notifications for both runners using announcements
          try {
            // Get event title for notifications
            const eventTitle = registrationData?.event_title || 'Evento';
            const newRunnerName = registrationData?.new_runner_name || 'o novo titular';
            const oldRunnerName = registrationData?.old_runner_name || 'o titular anterior';
            
            // Notification for the requester (old runner) - create announcement
            if (transferRequest.requested_by) {
              const announcementResult = await query(
                `INSERT INTO announcements (title, content, target_audience, status, published_at, created_by)
                 VALUES ($1, $2, 'runners', 'published', NOW(), $3)
                 RETURNING id`,
                [
                  '✅ Transferência Realizada com Sucesso',
                  `Sua inscrição no evento "${eventTitle}" foi transferida com sucesso para ${newRunnerName}. O pagamento da taxa foi confirmado e a transferência está completa.`,
                  transferRequest.requested_by
                ]
              );
              
              // Mark as read for the requester (so they see it as new notification)
              if (announcementResult.rows[0]?.id) {
                await query(
                  `INSERT INTO announcement_reads (announcement_id, user_id, read_at)
                   VALUES ($1, $2, NULL)
                   ON CONFLICT (announcement_id, user_id) DO UPDATE SET read_at = NULL`,
                  [announcementResult.rows[0].id, transferRequest.requested_by]
                );
              }
            }
            
            // Notification for the new runner - create announcement
            if (newRunnerId) {
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
            
            console.log(`✅ Notificações criadas para transferência: ${transferRequestId}`);
          } catch (notificationError: any) {
            // Don't fail the transfer if notification fails
            console.error(`⚠️ Erro ao criar notificações (transferência foi realizada):`, notificationError);
          }
        }
      } catch (transferError: any) {
        console.error(`❌ Erro ao transferir inscrição automaticamente:`, transferError);
        // Mark webhook event with error but don't fail the webhook
        if (webhookEventId) {
          await query(
            'UPDATE asaas_webhook_events SET processed = true, error_message = $1 WHERE id = $2',
            [`Transfer error: ${transferError.message}`, webhookEventId]
          );
        }
        // Continue - payment is confirmed, transfer can be done manually later
      }
    }
    
    // Mark webhook event as processed
    if (webhookEventId) {
      await query(
        'UPDATE asaas_webhook_events SET processed = true WHERE id = $1',
        [webhookEventId]
      );
    }
    
    return res.status(200).json({
      success: true,
      message: 'Transfer payment webhook processed',
    });
  }

  // Find registration by external_reference or asaas_payment_id
  let registrationId: string | null = null;

  // Try to find by asaas_payment_id in asaas_payments table
  const paymentResult = await query(
    'SELECT registration_id FROM asaas_payments WHERE asaas_payment_id = $1',
    [asaasPaymentId]
  );

  if (paymentResult.rows.length > 0) {
    registrationId = paymentResult.rows[0].registration_id;
    console.log(`✅ Inscrição encontrada por asaas_payment_id: ${registrationId}`);
  } else {
    // Fallback: buscar por external_reference
    if (payment.externalReference) {
      const externalRef = payment.externalReference;
    
      // Tentar buscar diretamente pelo ID se external_reference for UUID
      // ou pelo confirmation_code
    const regResult = await query(
        'SELECT id FROM registrations WHERE id = $1 OR confirmation_code = $2',
        [externalRef, externalRef]
    );
    
    if (regResult.rows.length > 0) {
        registrationId = regResult.rows[0].id;
        console.log(`✅ Inscrição encontrada por external_reference: ${externalRef} -> ${registrationId}`);
      } else {
        console.warn(`⚠️ Inscrição não encontrada por external_reference: ${externalRef}`);
      }
    }
  }

  // Save webhook event to database
  let webhookEventId: string | null = null;
  try {
    const webhookResult = await query(
      `INSERT INTO asaas_webhook_events (
        event_type, asaas_payment_id, registration_id, payload, processed
      ) VALUES ($1, $2, $3, $4, false)
      RETURNING id`,
      [
        event,
        asaasPaymentId,
        registrationId,
        JSON.stringify(payload),
      ]
    );
    webhookEventId = webhookResult.rows[0].id;
    console.log(`💾 Evento salvo no banco: ${webhookEventId}`);
  } catch (error: any) {
    console.error('❌ Erro ao salvar evento do webhook:', error);
    // Continue processing even if saving fails
  }

  // Update asaas_payments table
  try {
    await query(
      `UPDATE asaas_payments 
       SET status = $1, 
           payment_date = $2,
           pix_transaction_id = $3,
           updated_at = NOW()
       WHERE asaas_payment_id = $4`,
      [
        payment.status,
        payment.paymentDate ? new Date(payment.paymentDate) : null,
        payment.pixTransactionId || null,
        asaasPaymentId,
      ]
    );
    console.log(`✅ Tabela asaas_payments atualizada para payment: ${asaasPaymentId}`);
  } catch (error: any) {
    console.error('❌ Erro ao atualizar asaas_payments:', error);
  }

  // Process event based on type
  if (registrationId) {
    try {
      await processWebhookEvent(event, payment.status, registrationId);
      
      // Verify if the update was successful
      const verifyResult = await query(
        'SELECT status, payment_status FROM registrations WHERE id = $1',
        [registrationId]
      );
      
      if (verifyResult.rows.length > 0) {
        console.log(`✅ Status verificado - Inscrição ${registrationId}:`, {
          status: verifyResult.rows[0].status,
          payment_status: verifyResult.rows[0].payment_status,
        });
      }
    } catch (error: any) {
      console.error(`❌ Erro ao processar evento ${event}:`, error);
      
      // Mark webhook event as failed
      if (webhookEventId) {
        await query(
          'UPDATE asaas_webhook_events SET processed = false, error_message = $1 WHERE id = $2',
          [error.message, webhookEventId]
        );
      }
    }
  } else {
    console.warn(`⚠️ Inscrição não encontrada para payment: ${asaasPaymentId}`);
    
    // Save event even without registrationId for later analysis
    if (webhookEventId) {
      await query(
        'UPDATE asaas_webhook_events SET processed = false, error_message = $1 WHERE id = $2',
        ['Registration not found', webhookEventId]
      );
    }
  }

  // Mark webhook event as processed
  if (webhookEventId) {
    try {
      await query(
        'UPDATE asaas_webhook_events SET processed = true WHERE id = $1',
        [webhookEventId]
      );
    } catch (error: any) {
      console.error('❌ Erro ao marcar evento como processado:', error);
    }
  }

  // Always return 200 OK to Asaas
  return res.status(200).json({
    success: true,
    message: 'Webhook received and processed',
  });
});

/**
 * Process webhook event and update registration status
 */
async function processWebhookEvent(
  event: AsaasWebhookEventType,
  paymentStatus: AsaasPaymentStatus,
  registrationId: string
): Promise<void> {
  console.log(`🔄 Processando evento: ${event} para inscrição: ${registrationId}`);

  switch (event) {
    case 'PAYMENT_CONFIRMED':
    case 'PAYMENT_RECEIVED':
      // Update payment_status to 'paid' and status to 'confirmed'
      await query(
        `UPDATE registrations 
         SET payment_status = 'paid', 
             status = 'confirmed',
             updated_at = NOW()
         WHERE id = $1`,
        [registrationId]
      );
      console.log(`✅ Inscrição ${registrationId} confirmada após pagamento`);
      break;

    case 'PAYMENT_OVERDUE':
      // Update payment_status to 'overdue'
      await query(
        `UPDATE registrations 
         SET payment_status = 'failed',
             updated_at = NOW()
         WHERE id = $1`,
        [registrationId]
      );
      console.log(`⚠️ Inscrição ${registrationId} marcada como vencida`);
      break;

    case 'PAYMENT_REFUNDED':
      // Update payment_status to 'refunded' and status to 'cancelled'
      await query(
        `UPDATE registrations 
         SET payment_status = 'refunded',
             status = 'cancelled',
             updated_at = NOW()
         WHERE id = $1`,
        [registrationId]
      );
      console.log(`🔄 Inscrição ${registrationId} estornada`);
      break;

    case 'PAYMENT_UPDATED':
      // Update payment_status and registration status based on current payment status
      let newPaymentStatus: string;
      let newStatus: string | null = null;
      
      if (paymentStatus === 'CONFIRMED' || paymentStatus === 'RECEIVED') {
        newPaymentStatus = 'paid';
        newStatus = 'confirmed'; // ✅ Corrigido: atualizar status da inscrição
      } else if (paymentStatus === 'OVERDUE') {
        newPaymentStatus = 'failed';
        // Status permanece como está (não altera para cancelled automaticamente)
      } else if (paymentStatus === 'REFUNDED') {
        newPaymentStatus = 'refunded';
        newStatus = 'cancelled'; // ✅ Corrigido: atualizar status da inscrição
      } else {
        newPaymentStatus = 'pending';
      }

      // Update with registration status if necessary
      if (newStatus) {
        await query(
          `UPDATE registrations 
           SET payment_status = $1,
               status = $2,
               updated_at = NOW()
           WHERE id = $3`,
          [newPaymentStatus, newStatus, registrationId]
        );
        console.log(`🔄 Inscrição ${registrationId} atualizada: payment_status=${newPaymentStatus}, status=${newStatus}`);
      } else {
      await query(
        `UPDATE registrations 
         SET payment_status = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [newPaymentStatus, registrationId]
      );
        console.log(`🔄 Inscrição ${registrationId} atualizada: payment_status=${newPaymentStatus}`);
      }
      break;

    default:
      console.log(`ℹ️ Evento ${event} não requer ação específica`);
      break;
  }
}


