/**
 * Etapa 7 — visão consolidada, sinais operacionais e detalhe de auditoria assistida.
 */
import { Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AuthRequest } from '../middleware/auth.js';
import { getSupportConsolidatedSnapshot, getAssistedAuditDetail } from '../services/invitationBonusAssistedSupportService.js';
import { buildSignalsReport } from '../services/invitationBonusAssistedSignalsService.js';

function logSupportView(payload: {
  op: 'support_snapshot' | 'signals_report' | 'audit_detail';
  correlation_id?: string;
  detail?: string;
}): void {
  console.log(
    JSON.stringify({
      event: 'invitation_bonus_assisted_support',
      phase: 'emit',
      ...payload,
    })
  );
}

const hoursQuerySchema = z.object({
  hours: z.coerce.number().int().min(1).max(24 * 90).optional(),
});

export const getSupportSnapshotController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = hoursQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: parsed.error.errors[0]?.message });
    return;
  }
  const hours = parsed.data.hours ?? 24;
  logSupportView({
    op: 'support_snapshot',
    correlation_id: req.user?.id,
    detail: `hours=${hours}`,
  });
  const data = await getSupportConsolidatedSnapshot({ hours });
  res.json({ success: true, data });
});

const signalsQuerySchema = z.object({
  hours: z.coerce.number().int().min(1).max(24 * 90).optional(),
  emit_logs: z.enum(['true', 'false']).optional(),
  emit_webhook: z.enum(['true', 'false']).optional(),
});

export const getAssistedOperationalSignalsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = signalsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: parsed.error.errors[0]?.message });
    return;
  }
  const hours = parsed.data.hours ?? 24;
  const emit_logs = parsed.data.emit_logs !== 'false';
  const emit_webhook = parsed.data.emit_webhook === 'true';

  logSupportView({
    op: 'signals_report',
    correlation_id: req.user?.id,
    detail: `hours=${hours},emit_logs=${emit_logs},emit_webhook=${emit_webhook}`,
  });

  const report = await buildSignalsReport({
    hours,
    emit_logs,
    emit_webhook,
  });
  res.json({ success: true, data: report });
});

export const getAssistedAuditDetailController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const auditId = req.params.auditId;
  if (!auditId || !z.string().uuid().safeParse(auditId).success) {
    res.status(400).json({ success: false, error: 'auditId inválido' });
    return;
  }
  logSupportView({
    op: 'audit_detail',
    correlation_id: req.user?.id,
    detail: `audit_id=${auditId}`,
  });
  const detail = await getAssistedAuditDetail(auditId);
  if (!detail) {
    res.status(404).json({ success: false, error: 'not_found' });
    return;
  }
  res.json({ success: true, data: detail });
});
