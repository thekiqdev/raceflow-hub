/**
 * POST /api/admin/reconcile/missing-invitation-delivery
 * Fluxo separado: gerar apenas convites faltantes conforme auditoria canônica.
 */

import { Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AuthRequest } from '../middleware/auth.js';
import { runMissingInvitationDelivery } from '../services/missingInvitationDeliveryService.js';

const bodySchema = z.object({
  event_id: z.string().uuid('event_id inválido'),
  leader_id: z.string().uuid('leader_id inválido').optional().nullable(),
  mode: z.enum(['dry_run', 'apply']),
  apply_confirmed: z.boolean().optional(),
  audit_snapshot_hash: z.string().min(10).optional().nullable(),
  dry_run_hash: z.string().min(10).optional().nullable(),
});

export const runMissingInvitationDeliveryController = asyncHandler(
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

    if (p.mode === 'apply' && !p.apply_confirmed) {
      res.status(400).json({
        success: false,
        error: 'apply_confirmed é obrigatório para mode=apply.',
        message: 'Confirme explicitamente a execução do apply antes de prosseguir.',
      });
      return;
    }

    const result = await runMissingInvitationDelivery({
      event_id: p.event_id,
      leader_id: p.leader_id ?? undefined,
      mode: p.mode,
      apply_confirmed: p.apply_confirmed ?? undefined,
      audit_snapshot_hash: p.audit_snapshot_hash ?? undefined,
      dry_run_hash: p.dry_run_hash ?? undefined,
      executed_by: req.user?.id ?? undefined,
    });

    res.json({
      success: true,
      data: result,
    });
  }
);
