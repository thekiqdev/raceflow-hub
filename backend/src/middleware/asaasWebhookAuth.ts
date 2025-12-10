import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to validate Asaas webhook token
 * Asaas sends the token in the header 'asaas-access-token'
 */
export const validateAsaasWebhookToken = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const webhookToken = req.headers['asaas-access-token'] as string;
  const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;

  // If webhook token is not configured, allow request (for development)
  if (!expectedToken || expectedToken.trim() === '') {
    console.warn('⚠️ ASAAS_WEBHOOK_TOKEN não configurado. Permitindo requisição (apenas para desenvolvimento)');
    next();
    return;
  }

  if (!webhookToken) {
    console.error('❌ Webhook token não fornecido');
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Webhook token is required',
    });
    return;
  }

  if (webhookToken !== expectedToken) {
    console.error('❌ Webhook token inválido');
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Invalid webhook token',
    });
    return;
  }

  next();
};


