import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { query } from '../config/database.js';
import {
  AsaasWebhookPayload,
  AsaasWebhookEventType,
  AsaasPaymentStatus,
} from '../types/asaas.js';

/**
 * Handle Asaas webhook events
 * POST /api/webhooks/asaas
 */
export const handleWebhook = asyncHandler(async (req: Request, res: Response) => {
  const payload = req.body as AsaasWebhookPayload;

  console.log('📥 Webhook recebido do Asaas:', {
    event: payload.event,
    paymentId: payload.payment?.id,
  });

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

  const { event, payment } = payload;
  const asaasPaymentId = payment.id;

  // Find registration by external_reference or asaas_payment_id
  let registrationId: string | null = null;
  let registration: any = null;

  // Try to find by asaas_payment_id in asaas_payments table
  const paymentResult = await query(
    'SELECT registration_id FROM asaas_payments WHERE asaas_payment_id = $1',
    [asaasPaymentId]
  );

  if (paymentResult.rows.length > 0) {
    registrationId = paymentResult.rows[0].registration_id;
    
    // Get registration
    const regResult = await query(
      'SELECT * FROM registrations WHERE id = $1',
      [registrationId]
    );
    
    if (regResult.rows.length > 0) {
      registration = regResult.rows[0];
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
  res.status(200).json({
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
      // Update payment_status based on current status
      let newPaymentStatus: string;
      if (paymentStatus === 'CONFIRMED' || paymentStatus === 'RECEIVED') {
        newPaymentStatus = 'paid';
      } else if (paymentStatus === 'OVERDUE') {
        newPaymentStatus = 'failed';
      } else if (paymentStatus === 'REFUNDED') {
        newPaymentStatus = 'refunded';
      } else {
        newPaymentStatus = 'pending';
      }

      await query(
        `UPDATE registrations 
         SET payment_status = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [newPaymentStatus, registrationId]
      );
      console.log(`🔄 Inscrição ${registrationId} atualizada para status: ${newPaymentStatus}`);
      break;

    default:
      console.log(`ℹ️ Evento ${event} não requer ação específica`);
      break;
  }
}


