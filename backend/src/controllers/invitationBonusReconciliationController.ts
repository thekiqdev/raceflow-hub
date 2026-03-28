/**
 * POST /api/admin/reconcile/invitation-bonus-controlled
 * Frente 2 — dry_run/apply com guardas de contexto.
 */

import { Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AuthRequest } from '../middleware/auth.js';
import { executeInvitationBonusDomainCommand } from '../services/invitationBonusDomainOrchestrator.js';
import { hasRole } from '../services/userRolesService.js';

const bodySchema = z.object({
  event_id: z.string().uuid('event_id inválido'),
  leader_id: z.string().uuid('leader_id inválido').optional().nullable(),
  mode: z.enum(['dry_run', 'apply']),
  /**
   * Safety gate: required only for `mode=apply`.
   * The frontend must ask the user for explicit confirmation.
   */
  apply_confirmed: z.boolean().optional(),
  audit_snapshot_hash: z.string().min(10).optional().nullable(),
  dry_run_hash: z.string().min(10).optional().nullable(),
  reason: z.string().min(8, 'reason deve ter ao menos 8 caracteres'),
  idempotency_key: z.string().min(8, 'idempotency_key deve ter ao menos 8 caracteres'),
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
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }
    const isAdmin = await hasRole(req.user.id, 'admin');
    if (!isAdmin) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Somente administradores podem executar comandos assistidos.',
      });
      return;
    }

    if (p.mode === 'apply' && !p.apply_confirmed) {
      res.status(400).json({
        success: false,
        error: 'apply_confirmed é obrigatório para mode=apply.',
        message: 'Confirme explicitamente a execução do apply antes de prosseguir.',
      });
      return;
    }

    const result = await executeInvitationBonusDomainCommand({
      type: 'reconcile_state',
      mode: 'assistido',
      source: 'domain_assisted',
      correlation_id: req.user?.id,
      event_id: p.event_id,
      leader_id: p.leader_id ?? undefined,
      detail: 'invitation_bonus_reconciliation_controller',
      operational_context: {
        actor_id: req.user.id,
        actor_email: req.user.email,
        reason: p.reason,
        idempotency_key: p.idempotency_key,
      },
      params: {
        event_id: p.event_id,
        leader_id: p.leader_id ?? undefined,
        mode: p.mode,
        apply_confirmed: p.apply_confirmed ?? undefined,
        audit_snapshot_hash: p.audit_snapshot_hash ?? undefined,
        dry_run_hash: p.dry_run_hash ?? undefined,
        executed_by: req.user?.id ?? undefined,
      },
    });

    const { domain_payload = null, ...command_result } = result;
    res.json({
      success: true,
      data: {
        command_result,
        payload: domain_payload,
      },
    });
  }
);

