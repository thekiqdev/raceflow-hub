/**
 * GET /api/admin/audit/invitation-bonus-context/:eventId
 * Somente leitura — dados para UI da auditoria (sem alterar runInvitationBonusAudit).
 */

import { Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AuthRequest } from '../middleware/auth.js';
import { getInvitationBonusAuditContext } from '../services/invitationBonusAuditContextService.js';

const paramSchema = z.object({
  eventId: z.string().uuid('eventId inválido'),
});

export const getInvitationBonusAuditContextController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = paramSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: parsed.error.errors[0]?.message || 'Parâmetro inválido',
    });
    return;
  }

  try {
    const data = await getInvitationBonusAuditContext(parsed.data.eventId);
    res.json({ success: true, data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao carregar contexto';
    if (msg.includes('não encontrado')) {
      res.status(404).json({ success: false, error: 'Not found', message: msg });
      return;
    }
    throw e;
  }
});
