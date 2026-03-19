/**
 * POST /api/admin/reconcile/invitation-bonus-controlled
 * Frente 2 — dry_run/apply com guardas de contexto.
 */

import { Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AuthRequest } from '../middleware/auth.js';
import { runInvitationBonusReconciliation } from '../services/invitationBonusReconciliationService.js';

const bodySchema = z.object({
  event_id: z.string().uuid('event_id inválido'),
  leader_id: z.string().uuid('leader_id inválido').optional().nullable(),
  mode: z.enum(['dry_run', 'apply']),
  audit_snapshot_hash: z.string().min(10).optional().nullable(),
  dry_run_hash: z.string().min(10).optional().nullable(),
});

export const runInvitationBonusReconciliationController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        message: parsed.error.errors[0]?.message || 'Dados inválidos',
      });
      return;
    }

    const p = parsed.data;
    const result = await runInvitationBonusReconciliation({
      event_id: p.event_id,
      leader_id: p.leader_id ?? undefined,
      mode: p.mode,
      audit_snapshot_hash: p.audit_snapshot_hash ?? undefined,
      dry_run_hash: p.dry_run_hash ?? undefined,
    });

    res.json({
      success: true,
      data: result,
    });
  }
);

