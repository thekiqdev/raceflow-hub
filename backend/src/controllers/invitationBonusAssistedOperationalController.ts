/**
 * Etapa 6 — API admin para observabilidade e resolução controlada de comandos assistidos presos.
 * Rotas montadas em adminRoutes (já exige authenticate + admin).
 */
import { Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AuthRequest } from '../middleware/auth.js';
import {
  getAssistedCommandAuditSummary,
  getStuckThresholdMinutes,
  listAssistedCommandAudits,
  listPotentiallyStuckAssistedAudits,
  markStuckAssistedAuditAsFailed,
} from '../services/invitationBonusAssistedOperationalService.js';
import { listStuckAssistedAuditsEnriched } from '../services/invitationBonusAssistedSupportService.js';

export type InvitationBonusAssistedOperationalLog = {
  event: 'invitation_bonus_assisted_operational';
  phase: 'start' | 'end' | 'error';
  op: 'list_audits' | 'audit_summary' | 'list_stuck' | 'mark_stuck_failed';
  correlation_id?: string;
  audit_id?: string;
  performed_by_user_id?: string;
  detail?: string;
  message?: string;
};

function logOperational(payload: InvitationBonusAssistedOperationalLog): void {
  console.log(JSON.stringify(payload));
}

const listQuerySchema = z.object({
  command_type: z.string().optional(),
  status: z.enum(['started', 'succeeded', 'failed']).optional(),
  actor_email: z.string().optional(),
  event_id: z.string().uuid().optional(),
  leader_id: z.string().uuid().optional(),
  created_from: z.string().optional(),
  created_to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const listAssistedCommandAuditsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: parsed.error.errors[0]?.message || 'Parâmetros inválidos',
    });
    return;
  }
  try {
    logOperational({
      event: 'invitation_bonus_assisted_operational',
      phase: 'start',
      op: 'list_audits',
      correlation_id: req.user?.id,
      performed_by_user_id: req.user?.id,
    });
    const { rows, total } = await listAssistedCommandAudits(parsed.data);
    logOperational({
      event: 'invitation_bonus_assisted_operational',
      phase: 'end',
      op: 'list_audits',
      correlation_id: req.user?.id,
      detail: `rows=${rows.length}`,
    });
    res.json({ success: true, data: { rows, total, limit: parsed.data.limit ?? 50, offset: parsed.data.offset ?? 0 } });
  } catch (e: any) {
    logOperational({
      event: 'invitation_bonus_assisted_operational',
      phase: 'error',
      op: 'list_audits',
      correlation_id: req.user?.id,
      message: e?.message,
    });
    throw e;
  }
});

export const getAssistedCommandAuditSummaryController = asyncHandler(async (req: AuthRequest, res: Response) => {
  try {
    logOperational({
      event: 'invitation_bonus_assisted_operational',
      phase: 'start',
      op: 'audit_summary',
      correlation_id: req.user?.id,
    });
    const summary = await getAssistedCommandAuditSummary();
    logOperational({
      event: 'invitation_bonus_assisted_operational',
      phase: 'end',
      op: 'audit_summary',
      correlation_id: req.user?.id,
      detail: JSON.stringify(summary),
    });
    res.json({ success: true, data: summary });
  } catch (e: any) {
    logOperational({
      event: 'invitation_bonus_assisted_operational',
      phase: 'error',
      op: 'audit_summary',
      correlation_id: req.user?.id,
      message: e?.message,
    });
    throw e;
  }
});

const stuckQuerySchema = z.object({
  minutes: z.coerce.number().int().min(1).max(24 * 60).optional(),
  enriched: z.enum(['true', 'false']).optional(),
});

export const listStuckAssistedCommandAuditsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = stuckQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: parsed.error.errors[0]?.message || 'Parâmetros inválidos',
    });
    return;
  }
  const defaultMinutes = getStuckThresholdMinutes();
  const minutes = parsed.data.minutes ?? defaultMinutes;
  try {
    logOperational({
      event: 'invitation_bonus_assisted_operational',
      phase: 'start',
      op: 'list_stuck',
      correlation_id: req.user?.id,
      detail: `minutes=${minutes}`,
    });
    const enriched = parsed.data.enriched === 'true';
    const rows = enriched
      ? await listStuckAssistedAuditsEnriched(minutes)
      : await listPotentiallyStuckAssistedAudits(minutes);
    logOperational({
      event: 'invitation_bonus_assisted_operational',
      phase: 'end',
      op: 'list_stuck',
      correlation_id: req.user?.id,
      detail: `count=${rows.length},enriched=${enriched}`,
    });
    res.json({
      success: true,
      data: {
        rows,
        default_stuck_threshold_minutes: defaultMinutes,
        filter_minutes_applied: minutes,
        enriched,
      },
    });
  } catch (e: any) {
    logOperational({
      event: 'invitation_bonus_assisted_operational',
      phase: 'error',
      op: 'list_stuck',
      correlation_id: req.user?.id,
      message: e?.message,
    });
    throw e;
  }
});

const markStuckBodySchema = z.object({
  reason: z.string().min(8, 'reason deve ter ao menos 8 caracteres'),
});

export const markStuckAssistedAuditFailedController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const auditId = req.params.auditId;
  if (!auditId || !z.string().uuid().safeParse(auditId).success) {
    res.status(400).json({ success: false, error: 'auditId inválido' });
    return;
  }
  const parsed = markStuckBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: parsed.error.errors[0]?.message || 'Dados inválidos',
    });
    return;
  }
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  try {
    logOperational({
      event: 'invitation_bonus_assisted_operational',
      phase: 'start',
      op: 'mark_stuck_failed',
      audit_id: auditId,
      correlation_id: req.user.id,
      performed_by_user_id: req.user.id,
    });
    const result = await markStuckAssistedAuditAsFailed({
      auditId,
      reason: parsed.data.reason,
      performedByUserId: req.user.id,
      performedByEmail: req.user.email,
    });

    if (!result.ok) {
      logOperational({
        event: 'invitation_bonus_assisted_operational',
        phase: 'end',
        op: 'mark_stuck_failed',
        audit_id: auditId,
        correlation_id: req.user.id,
        detail: `code=${result.code}`,
      });
      const status = result.code === 'not_found' ? 404 : 409;
      res.status(status).json({
        success: false,
        error: result.code,
        message:
          result.code === 'not_found'
            ? 'Auditoria não encontrada.'
            : 'Comando não está em estado started sem finished_at (já finalizado ou não é preso).',
      });
      return;
    }

    logOperational({
      event: 'invitation_bonus_assisted_operational',
      phase: 'end',
      op: 'mark_stuck_failed',
      audit_id: auditId,
      correlation_id: req.user.id,
      detail: `resolution_id=${result.resolution_id}`,
    });
    res.json({
      success: true,
      data: {
        audit_id: result.audit_id,
        resolution_id: result.resolution_id,
      },
    });
  } catch (e: any) {
    logOperational({
      event: 'invitation_bonus_assisted_operational',
      phase: 'error',
      op: 'mark_stuck_failed',
      audit_id: auditId,
      correlation_id: req.user?.id,
      message: e?.message,
    });
    throw e;
  }
});
