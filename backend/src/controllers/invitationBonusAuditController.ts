/**
 * POST /api/admin/audit/invitation-bonus-simulator
 * Fase 1 — somente leitura (auditoria + simulador).
 */

import { Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AuthRequest } from '../middleware/auth.js';
import { runInvitationBonusAudit } from '../services/invitationBonusAuditService.js';

const bodySchema = z.object({
  event_id: z.string().uuid('event_id inválido'),
  leader_id: z.string().uuid('leader_id inválido').optional().nullable(),
});

export const runInvitationBonusAuditController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: parsed.error.errors[0]?.message || 'Dados inválidos',
    });
    return;
  }

  const { event_id, leader_id } = parsed.data;
  const result = await runInvitationBonusAudit({
    event_id,
    leader_id: leader_id ?? undefined,
  });

  res.json({
    success: true,
    data: result,
  });
});
