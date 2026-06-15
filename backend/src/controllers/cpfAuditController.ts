import { Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AuthRequest } from '../middleware/auth.js';
import {
  getCpfAuditDaily,
  getCpfAuditOverview,
  getCpfRecentErrors,
  CPF_AUDIT_DEFAULT_PERIOD_DAYS,
} from '../services/cpfAuditService.js';

function parseDaysParam(raw: unknown, fallback = CPF_AUDIT_DEFAULT_PERIOD_DAYS): number {
  const n = parseInt(String(raw ?? fallback), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const getCpfAuditOverviewController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const days = parseDaysParam(req.query.days);
  const data = await getCpfAuditOverview(days);
  res.json({ success: true, data });
});

export const getCpfAuditDailyController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const days = parseDaysParam(req.query.days);
  const data = await getCpfAuditDaily(days);
  res.json({ success: true, data });
});

export const getCpfRecentErrorsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const limit = parseInt(String(req.query.limit ?? '50'), 10);
  const data = await getCpfRecentErrors(limit);
  res.json({ success: true, data });
});
