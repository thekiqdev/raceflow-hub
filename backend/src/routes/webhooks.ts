import { Router } from 'express';
import { handleWebhook } from '../controllers/asaasWebhookController.js';
import { validateAsaasWebhookToken } from '../middleware/asaasWebhookAuth.js';

const router = Router();

/**
 * POST /api/webhooks/asaas
 * Webhook endpoint for Asaas payment notifications
 * 
 * This endpoint receives webhook events from Asaas when payment status changes.
 * It validates the webhook token and processes the event.
 */
router.post('/asaas', validateAsaasWebhookToken, handleWebhook);

export default router;


