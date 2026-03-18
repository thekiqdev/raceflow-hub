import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { query } from '../config/database.js';
import {
  AsaasWebhookPayload,
  AsaasWebhookEventType,
  AsaasPaymentStatus,
} from '../types/asaas.js';
import { getTransferRequestById, updateTransferRequest } from '../services/transferRequestService.js';
import { findUserByCpfOrEmail, transferRegistration, getRegistrationById } from '../services/registrationsService.js';
import { syncRegistrationPaymentStatus } from '../services/asaasService.js';
import { getEventById } from '../services/eventsService.js';
import { sendNotificationSafely, getUserEmail, getUserName } from '../services/notificationService.js';

/**
 * Handle Asaas webhook events
 * POST /api/webhooks/asaas
 */
export const handleWebhook = asyncHandler(async (req: Request, res: Response) => {
  // Log incoming request immediately
  console.log('🔔 ============================================');
  console.log('🔔 WEBHOOK RECEBIDO - INÍCIO DO PROCESSAMENTO');
  console.log('🔔 ============================================');
  console.log('📋 Headers:', JSON.stringify(req.headers, null, 2));
  console.log('📋 Body completo:', JSON.stringify(req.body, null, 2));
  
  const payload = req.body as AsaasWebhookPayload;

  // Validate payload
  if (!payload.event || !payload.payment) {
    console.error('❌ Payload inválido do webhook - event ou payment ausente');
    console.error('📋 Payload recebido:', JSON.stringify(payload, null, 2));
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
    console.error('📋 Payment object:', JSON.stringify(payload.payment, null, 2));
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
  const isCreditCard = payment.billingType === 'CREDIT_CARD';
  console.log('📥 Webhook recebido do Asaas:', {
    event: event,
    paymentId: asaasPaymentId,
    paymentStatus: payment.status,
    externalReference: payment.externalReference,
    value: payment.value,
    billingType: payment.billingType,
    invoiceNumber: payment.invoiceNumber,
    paymentDate: payment.paymentDate,
    isCreditCard: isCreditCard,
  });

  // Log specific information for credit card payments
  if (isCreditCard) {
    console.log('💳 ============================================');
    console.log('💳 WEBHOOK DE PAGAMENTO COM CARTÃO DE CRÉDITO');
    console.log('💳 ============================================');
    console.log('📋 Detalhes do pagamento:', {
      paymentId: asaasPaymentId,
      status: payment.status,
      event: event,
      value: payment.value,
      externalReference: payment.externalReference,
    });
  }

  // Check if this is a transfer request payment
  const isTransferPayment = payment.externalReference?.startsWith('TRANSFER-');
  
  if (isTransferPayment && payment.externalReference) {
    const transferRequestId = payment.externalReference.replace('TRANSFER-', '');
    console.log(`🔄 Processando pagamento de transferência: ${transferRequestId}`);
    console.log(`📋 Detalhes do evento: event=${event}, paymentStatus=${payment.status}`);
    
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
      console.log(`💾 Webhook event salvo: ${webhookEventId}`);
    } catch (error: any) {
      console.error('❌ Erro ao salvar evento do webhook:', error);
    }
    
    // Process transfer payment for CONFIRMED or RECEIVED status
    // Handle both direct status check and event-based confirmation
    const paymentStatus = payment.status as string;
    const isPaymentConfirmed = 
      paymentStatus === 'CONFIRMED' || 
      paymentStatus === 'RECEIVED' ||
      event === 'PAYMENT_CONFIRMED' ||
      event === 'PAYMENT_RECEIVED' ||
      (event === 'PAYMENT_UPDATED' && (paymentStatus === 'CONFIRMED' || paymentStatus === 'RECEIVED'));
    
    if (isPaymentConfirmed) {
      console.log(`✅ Pagamento confirmado - processando transferência: ${transferRequestId}`);
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
    } else {
      console.log(`⏳ Pagamento ainda não confirmado (status: ${paymentStatus}, event: ${event}) - aguardando confirmação`);
      // Update payment status even if not confirmed yet
      if (paymentStatus) {
        const statusMap: Record<string, string> = {
          'PENDING': 'pending',
          'CONFIRMED': 'paid',
          'RECEIVED': 'paid',
          'OVERDUE': 'pending',
          'REFUNDED': 'refunded',
        };
        const mappedStatus = statusMap[paymentStatus] || 'pending';
        
        await query(
          `UPDATE transfer_requests 
           SET payment_status = $1, updated_at = NOW()
           WHERE id = $2`,
          [mappedStatus, transferRequestId]
        );
        console.log(`📝 Status do pagamento atualizado para: ${mappedStatus}`);
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

  // Find registration by asaas_payment_id (payment.id ou payment.invoiceNumber) ou external_reference
  let registrationId: string | null = null;

  console.log('🔍 Buscando inscrição para o pagamento:', {
    asaasPaymentId,
    invoiceNumber: payment.invoiceNumber,
    externalReference: payment.externalReference,
  });

  // 1) Buscar por asaas_payment_id = payment.id
  const paymentResultById = await query(
    'SELECT registration_id FROM asaas_payments WHERE asaas_payment_id = $1',
    [asaasPaymentId]
  );

  if (paymentResultById.rows.length > 0) {
    registrationId = paymentResultById.rows[0].registration_id;
    console.log(`✅ Inscrição encontrada por asaas_payment_id (payment.id): ${registrationId}`);
  }

  // 2) Se não encontrou, tentar por invoiceNumber (Asaas pode enviar esse id no webhook)
  if (!registrationId && payment.invoiceNumber) {
    const paymentResultByInvoice = await query(
      'SELECT registration_id FROM asaas_payments WHERE asaas_payment_id = $1',
      [payment.invoiceNumber]
    );
    if (paymentResultByInvoice.rows.length > 0) {
      registrationId = paymentResultByInvoice.rows[0].registration_id;
      console.log(`✅ Inscrição encontrada por asaas_payment_id (invoiceNumber): ${registrationId}`);
    }
  }

  // 3) Fallback: buscar por external_reference
  if (!registrationId && payment.externalReference) {
    const externalRef = payment.externalReference;
    console.log(`🔍 Tentando buscar por external_reference: ${externalRef}`);

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isUuid = uuidRegex.test(externalRef);

    let regResult;

    if (isUuid) {
      regResult = await query(
        'SELECT id FROM registrations WHERE id = $1 OR confirmation_code = $2',
        [externalRef, externalRef]
      );
    } else {
      regResult = await query(
        'SELECT id FROM registrations WHERE confirmation_code = $1',
        [externalRef]
      );
    }

    console.log('🔍 Resultado da busca por external_reference:', {
      rowsFound: regResult.rows.length,
      registrationId: regResult.rows[0]?.id || null,
      isUuid: isUuid,
    });

    if (regResult.rows.length > 0) {
      registrationId = regResult.rows[0].id;
      console.log(`✅ Inscrição encontrada por external_reference: ${externalRef} -> ${registrationId}`);
    } else {
      console.warn(`⚠️ Inscrição não encontrada por external_reference: ${externalRef}`);
    }
  }

  if (!registrationId) {
    console.warn('⚠️ Inscrição não encontrada por asaas_payment_id nem external_reference');
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

  // Update asaas_payments: por payment.id e/ou invoiceNumber (Asaas pode enviar um ou outro no webhook)
  const paymentIdsToUpdate = [payment.id];
  if (payment.invoiceNumber && payment.invoiceNumber !== payment.id) {
    paymentIdsToUpdate.push(payment.invoiceNumber);
  }
  const paymentStatusNormalized = typeof payment.status === 'string' ? payment.status.toUpperCase() : payment.status;
  try {
    await query(
      `UPDATE asaas_payments 
       SET status = $1, 
           payment_date = $2,
           pix_transaction_id = $3,
           updated_at = NOW()
       WHERE asaas_payment_id = ANY($4::text[])`,
      [
        paymentStatusNormalized,
        payment.paymentDate ? new Date(payment.paymentDate) : null,
        payment.pixTransactionId || null,
        paymentIdsToUpdate,
      ]
    );
    if (isCreditCard) {
      console.log(`✅ Tabela asaas_payments atualizada para pagamento com CARTÃO DE CRÉDITO: ${asaasPaymentId}`);
      console.log(`💳 Status atualizado: ${payment.status}`);
      if (payment.paymentDate) {
        console.log(`💳 Data do pagamento: ${payment.paymentDate}`);
      }
    } else {
      console.log(`✅ Tabela asaas_payments atualizada para payment: ${asaasPaymentId}`);
    }
  } catch (error: any) {
    console.error('❌ Erro ao atualizar asaas_payments:', error);
    if (isCreditCard) {
      console.error('💳 Erro ao atualizar pagamento com cartão de crédito');
    }
  }

  // Process event based on type
  if (registrationId) {
    console.log(`🔄 ============================================`);
    console.log(`🔄 PROCESSANDO WEBHOOK PARA INSCRIÇÃO ${registrationId}`);
    console.log(`🔄 ============================================`);
      console.log(`📋 Detalhes:`, {
      event,
      paymentStatus: payment.status,
      asaasPaymentId,
      externalReference: payment.externalReference,
      invoiceNumber: payment.invoiceNumber,
      billingType: payment.billingType,
    });
    
    try {
      // Get current status before processing
      const beforeResult = await query(
        'SELECT status, payment_status FROM registrations WHERE id = $1',
        [registrationId]
      );
      console.log(`📊 Status ANTES do processamento:`, beforeResult.rows[0]);
      
      await processWebhookEvent(event, payment.status, registrationId, payment.billingType);
      
      // Verify if the update was successful
      const verifyResult = await query(
        'SELECT status, payment_status, runner_id, registered_by FROM registrations WHERE id = $1',
        [registrationId]
      );
      
      if (verifyResult.rows.length > 0) {
        console.log(`✅ ============================================`);
        console.log(`✅ STATUS ATUALIZADO COM SUCESSO`);
        console.log(`✅ ============================================`);
        console.log(`📊 Status DEPOIS do processamento:`, {
          status: verifyResult.rows[0].status,
          payment_status: verifyResult.rows[0].payment_status,
          runner_id: verifyResult.rows[0].runner_id,
          registered_by: verifyResult.rows[0].registered_by,
        });
        console.log(`📊 Comparação:`, {
          antes: {
            status: beforeResult.rows[0]?.status,
            payment_status: beforeResult.rows[0]?.payment_status,
          },
          depois: {
            status: verifyResult.rows[0].status,
            payment_status: verifyResult.rows[0].payment_status,
          },
        });
      }
    } catch (error: any) {
      console.error(`❌ ============================================`);
      console.error(`❌ ERRO AO PROCESSAR WEBHOOK`);
      console.error(`❌ ============================================`);
      console.error(`📋 Detalhes do erro:`, {
        error: error.message,
        stack: error.stack,
        event,
        paymentStatus: payment.status,
        registrationId,
      });
      
      // Mark webhook event as failed
      if (webhookEventId) {
        await query(
          'UPDATE asaas_webhook_events SET processed = false, error_message = $1 WHERE id = $2',
          [error.message, webhookEventId]
        );
      }
    }
  } else {
    console.warn(`⚠️ ============================================`);
    console.warn(`⚠️ INSCRIÇÃO NÃO ENCONTRADA`);
    console.warn(`⚠️ ============================================`);
    console.warn(`📋 Detalhes:`, {
      asaasPaymentId,
      externalReference: payment.externalReference,
      event,
      paymentStatus: payment.status,
      invoiceNumber: payment.invoiceNumber,
    });
    
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
  registrationId: string,
  billingType?: string
): Promise<void> {
    // Get payment billing type and method for logging
    const paymentInfo = await query(
      `SELECT ap.billing_type, r.payment_method 
       FROM asaas_payments ap
       JOIN registrations r ON ap.registration_id = r.id
       WHERE r.id = $1
       LIMIT 1`,
      [registrationId]
    );
    
    const paymentBillingType = billingType || paymentInfo.rows[0]?.billing_type || null;
    const paymentMethod = paymentInfo.rows[0]?.payment_method || null;
    const isCreditCardPayment = paymentBillingType === 'CREDIT_CARD' || paymentMethod === 'credit_card';
    
    console.log(`🔄 Processando evento: ${event} para inscrição: ${registrationId}`, {
      billingType: paymentBillingType,
      paymentMethod: paymentMethod,
      isCreditCard: isCreditCardPayment,
      paymentStatus: paymentStatus,
    });
    
    if (isCreditCardPayment) {
      console.log('💳 ============================================');
      console.log('💳 PROCESSANDO WEBHOOK DE CARTÃO DE CRÉDITO');
      console.log('💳 ============================================');
      console.log(`💳 Status do pagamento: ${paymentStatus}`);
      console.log(`💳 Evento: ${event}`);
    }

  switch (event) {
    case 'PAYMENT_CONFIRMED':
    case 'PAYMENT_RECEIVED':
      // Considerar inscrição paga quando soma dos pagamentos ≥ total_amount (Etapa 6)
      await syncRegistrationPaymentStatus(registrationId);
      
      if (isCreditCardPayment) {
        console.log(`✅ Inscrição ${registrationId} confirmada após pagamento com CARTÃO DE CRÉDITO`);
        console.log(`💳 Status do pagamento: ${paymentStatus}`);
      } else {
        console.log(`✅ Inscrição ${registrationId} confirmada após pagamento`);
      }
      
      // Send payment confirmation notifications
      try {
        const registration = await getRegistrationById(registrationId);
        if (registration) {
          const event = await getEventById(registration.event_id);
          if (event) {
            const runnerId = registration.runner_id;
            const runnerEmail = await getUserEmail(runnerId);
            const runnerName = await getUserName(runnerId);

            // Format event date
            const eventDate = event.event_date ? new Date(event.event_date).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            }) : 'Data não informada';

            // Format event location
            const eventLocation = event.location || `${event.city || ''}${event.city && event.state ? ' - ' : ''}${event.state || ''}`.trim() || 'Local não informado';

            // Format amount
            const amount = registration.total_amount > 0 
              ? `R$ ${parseFloat(registration.total_amount).toFixed(2).replace('.', ',')}`
              : 'Gratuito';

            // Determine payment method from registration or payment billing type
            const registrationPaymentMethod = await query(
              'SELECT payment_method FROM registrations WHERE id = $1',
              [registrationId]
            );
            let paymentMethod = 'PIX'; // Default
            if (registrationPaymentMethod.rows.length > 0) {
              const method = registrationPaymentMethod.rows[0].payment_method;
              if (method === 'credit_card') {
                paymentMethod = 'Cartão de Crédito';
              } else if (method === 'pix') {
                paymentMethod = 'PIX';
              } else if (method === 'boleto') {
                paymentMethod = 'Boleto';
              }
            } else {
              // Fallback: check billing type from payment
              if (paymentBillingType === 'CREDIT_CARD') {
                paymentMethod = 'Cartão de Crédito';
              }
            }
            
            if (isCreditCardPayment) {
              console.log('💳 Método de pagamento identificado: Cartão de Crédito');
            }

            if (runnerEmail) {
              // Send payment_received notification
              await sendNotificationSafely({
                templateKey: 'payment_received',
                recipient: {
                  email: runnerEmail,
                  name: runnerName || undefined,
                },
                variables: {
                  userName: runnerName || 'Atleta',
                  amount: amount,
                  eventTitle: event.title,
                  paymentMethod: paymentMethod,
                  registrationCode: registration.confirmation_code,
                },
              });

              // Send registration_confirmed notification
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

              console.log('✅ Notificações de pagamento e confirmação enviadas para runner');
            } else {
              console.warn(`⚠️ Email do runner ${runnerId} não encontrado, notificações não enviadas`);
            }
          }
        }
      } catch (notificationError: any) {
        // Don't break the flow if notification fails
        console.error('❌ Erro ao enviar notificações de pagamento:', notificationError);
      }
      
      // Check for commission and invitation bonuses after payment confirmation
      try {
        const { getUserReferral } = await import('../services/referralsService.js');
        const { getCouponByCodeOnly } = await import('../services/couponsService.js');
        const { createCommission } = await import('../services/commissionsService.js');
        const { triggerInvitationBonusAfterPaidWithCoupon } = await import('../services/leaderBonusService.js');
        
        const registration = await query(
          'SELECT runner_id, event_id, total_amount, coupon_code FROM registrations WHERE id = $1',
          [registrationId]
        );
        
        if (registration.rows.length > 0) {
          const reg = registration.rows[0];
          const runnerId = reg.runner_id;
          const eventId = reg.event_id;
          const couponCode = reg.coupon_code;
          
          let leaderId: string | null = null;
          
          // Priority: check coupon first (coupon determines commission type)
          if (couponCode) {
            try {
              const coupon = await getCouponByCodeOnly(couponCode);
              if (coupon && coupon.leader_id) {
                leaderId = coupon.leader_id;
                console.log(`✅ Cupom ${couponCode} pertence ao líder ${leaderId}`);
              }
            } catch (couponError: any) {
              console.log(`ℹ️ Erro ao buscar cupom ${couponCode}:`, couponError.message);
            }
          }
          
          // If no coupon leader, check if user has a referral
          if (!leaderId) {
            const userReferral = await getUserReferral(runnerId);
            if (userReferral) {
              leaderId = userReferral.leader_id;
            }
          }
          
          if (leaderId) {
            // Check if commission already exists
            const existingCommission = await query(
              'SELECT id FROM leader_commissions WHERE registration_id = $1 AND leader_id = $2',
              [registrationId, leaderId]
            );
            
            if (existingCommission.rows.length === 0) {
              // Create commission (this will also check for invitation bonuses)
              try {
                await createCommission({
                  leader_id: leaderId,
                  registration_id: registrationId,
                  referred_user_id: runnerId,
                  event_id: eventId,
                  registration_amount: parseFloat(reg.total_amount) || 0,
                });
                console.log(`✅ Comissão criada para líder ${leaderId} na inscrição ${registrationId}`);
              } catch (commissionError: any) {
                // If no commission is configured (invitation type only) or amount is 0, trigger bonus check
                if (commissionError.message.includes('No commission configured') || 
                    commissionError.message.includes('invitation type only')) {
                  console.log(`ℹ️ Tipo de bônus é apenas 'invitation', disparando verificação de convite...`);
                  await triggerInvitationBonusAfterPaidWithCoupon(leaderId, eventId, couponCode);
                } else if (commissionError.message.includes('must be greater than 0')) {
                  console.log(`ℹ️ Valor da comissão é 0, disparando verificação de convite...`);
                  await triggerInvitationBonusAfterPaidWithCoupon(leaderId, eventId, couponCode);
                } else {
                  console.error('❌ Erro ao criar comissão:', commissionError.message);
                }
              }
            } else {
              // Commission already exists, trigger invitation bonus check (comissão do cupom usado)
              const commissionTypeCheck = await query(
                `SELECT bonus_type FROM leader_event_commissions 
                 WHERE leader_id = $1 AND event_id = $2 
                 AND bonus_type IN ('both', 'invitation')
                 LIMIT 1`,
                [leaderId, eventId]
              );
              
              if (commissionTypeCheck.rows.length > 0) {
                await triggerInvitationBonusAfterPaidWithCoupon(leaderId, eventId, couponCode);
                console.log(`✅ Verificação de bônus executada para líder ${leaderId}`);
              } else {
                console.log(`ℹ️ Tipo de comissão é apenas 'commission', não verificando bônus de convite`);
              }
            }
          }
        }
      } catch (bonusError: any) {
        console.error('Erro ao verificar comissão/bônus após confirmação de pagamento:', bonusError.message);
      }
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
      // Automação: ao estornar, revogar convites em excesso do líder
      try {
        const regRow = await query(
          'SELECT event_id, coupon_code FROM registrations WHERE id = $1',
          [registrationId]
        );
        if (regRow.rows.length > 0) {
          const { getCommissionByRegistrationId } = await import('../services/commissionsService.js');
          const { getCouponByCodeOnly } = await import('../services/couponsService.js');
          const { recalculateAndRevokeExcessInvitations } = await import('../services/leaderBonusService.js');
          const reg = regRow.rows[0];
          let leaderId: string | null = null;
          const commission = await getCommissionByRegistrationId(registrationId);
          if (commission) leaderId = commission.leader_id;
          else if (reg.coupon_code) {
            const coupon = await getCouponByCodeOnly(reg.coupon_code);
            if (coupon?.leader_id) leaderId = coupon.leader_id;
          }
          if (leaderId) {
            await recalculateAndRevokeExcessInvitations(leaderId, reg.event_id);
            console.log(`✅ Convites em excesso revogados para líder ${leaderId} (evento ${reg.event_id})`);
          }
        }
      } catch (revokeErr: any) {
        console.error('❌ [PAYMENT_REFUNDED] Erro ao revogar convites em excesso:', revokeErr.message);
      }
      break;

    case 'PAYMENT_UPDATED':
      // Update payment_status and registration status based on current payment status
      let newPaymentStatus: string;
      let newStatus: string | null = null;
      
      if (paymentStatus === 'CONFIRMED' || paymentStatus === 'RECEIVED') {
        // Considerar inscrição paga quando soma dos pagamentos ≥ total_amount (Etapa 6)
        await syncRegistrationPaymentStatus(registrationId);
        if (isCreditCardPayment) {
          console.log(`💳 Pagamento com CARTÃO DE CRÉDITO confirmado - inscrição ${registrationId} sincronizada`);
        }
        // Check for commission and invitation bonuses after payment confirmation
        try {
          const { getUserReferral } = await import('../services/referralsService.js');
          const { getCouponByCodeOnly } = await import('../services/couponsService.js');
          const { createCommission } = await import('../services/commissionsService.js');
          const { triggerInvitationBonusAfterPaidWithCoupon } = await import('../services/leaderBonusService.js');
          
          const registration = await query(
            'SELECT runner_id, event_id, total_amount, coupon_code FROM registrations WHERE id = $1',
            [registrationId]
          );
          
          if (registration.rows.length > 0) {
            const reg = registration.rows[0];
            const runnerId = reg.runner_id;
            const eventId = reg.event_id;
            const couponCode = reg.coupon_code;
            
            let leaderId: string | null = null;
            
            // Priority: check coupon first (coupon determines commission type)
            if (couponCode) {
              try {
                const coupon = await getCouponByCodeOnly(couponCode);
                if (coupon && coupon.leader_id) {
                  leaderId = coupon.leader_id;
                  console.log(`✅ Cupom ${couponCode} pertence ao líder ${leaderId}`);
                }
              } catch (couponError: any) {
                console.log(`ℹ️ Erro ao buscar cupom ${couponCode}:`, couponError.message);
              }
            }
            
            // If no coupon leader, check if user has a referral
            if (!leaderId) {
              const userReferral = await getUserReferral(runnerId);
              if (userReferral) {
                leaderId = userReferral.leader_id;
              }
            }
            
            if (leaderId) {
              // Check if commission already exists
              const existingCommission = await query(
                'SELECT id FROM leader_commissions WHERE registration_id = $1 AND leader_id = $2',
                [registrationId, leaderId]
              );
              
              if (existingCommission.rows.length === 0) {
                // Create commission (this will also check for invitation bonuses)
                try {
                  await createCommission({
                    leader_id: leaderId,
                    registration_id: registrationId,
                    referred_user_id: runnerId,
                    event_id: eventId,
                    registration_amount: parseFloat(reg.total_amount) || 0,
                  });
                  console.log(`✅ Comissão criada para líder ${leaderId} na inscrição ${registrationId}`);
                } catch (commissionError: any) {
                  if (commissionError.message.includes('No commission configured') || 
                      commissionError.message.includes('invitation type only') ||
                      commissionError.message.includes('must be greater than 0')) {
                    await triggerInvitationBonusAfterPaidWithCoupon(leaderId, eventId, couponCode);
                  } else {
                    console.error('❌ Erro ao criar comissão:', commissionError.message);
                  }
                }
              } else {
                const commissionTypeCheck = await query(
                  `SELECT bonus_type FROM leader_event_commissions 
                   WHERE leader_id = $1 AND event_id = $2 
                   AND bonus_type IN ('both', 'invitation')
                   LIMIT 1`,
                  [leaderId, eventId]
                );
                
                if (commissionTypeCheck.rows.length > 0) {
                  await triggerInvitationBonusAfterPaidWithCoupon(leaderId, eventId, couponCode);
                  console.log(`✅ Verificação de bônus executada para líder ${leaderId}`);
                } else {
                  console.log(`ℹ️ Tipo de comissão é apenas 'commission', não verificando bônus de convite`);
                }
              }
            }
          }
        } catch (bonusError: any) {
          console.error('Erro ao verificar comissão/bônus após confirmação de pagamento:', bonusError.message);
        }
        // syncRegistrationPaymentStatus já atualizou a inscrição; não rodar o UPDATE abaixo
      } else {
        if (paymentStatus === 'OVERDUE') {
          newPaymentStatus = 'failed';
        } else if (paymentStatus === 'REFUNDED') {
          newPaymentStatus = 'refunded';
          newStatus = 'cancelled';
        } else {
          newPaymentStatus = 'pending';
        }
        if (newStatus) {
          await query(
            `UPDATE registrations 
             SET payment_status = $1, status = $2, updated_at = NOW()
             WHERE id = $3`,
            [newPaymentStatus, newStatus, registrationId]
          );
          console.log(`🔄 Inscrição ${registrationId} atualizada: payment_status=${newPaymentStatus}, status=${newStatus}`);
        } else {
          await query(
            `UPDATE registrations SET payment_status = $1, updated_at = NOW() WHERE id = $2`,
            [newPaymentStatus, registrationId]
          );
          console.log(`🔄 Inscrição ${registrationId} atualizada: payment_status=${newPaymentStatus}`);
        }
      }
      break;

    default:
      // Mesmo com evento não mapeado, se o status do pagamento for pago, sincronizar inscrição (evita falha de confirmação)
      if (
        paymentStatus === 'CONFIRMED' ||
        paymentStatus === 'RECEIVED' ||
        (paymentStatus as string) === 'RECEIVED_IN_CASH'
      ) {
        console.log(`🔄 Evento ${event} com status pago (${paymentStatus}): sincronizando inscrição ${registrationId}`);
        await syncRegistrationPaymentStatus(registrationId);
      } else {
        console.log(`ℹ️ Evento ${event} não requer ação específica (status: ${paymentStatus})`);
      }
      break;
  }
}


