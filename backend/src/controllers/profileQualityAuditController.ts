import { Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AuthRequest } from '../middleware/auth.js';
import {
  getQualityBySource,
  getQualityDaily,
  getQualityOverview,
  getQualityTopErrors,
  PROFILE_QUALITY_DEFAULT_PERIOD_DAYS,
} from '../services/profileQualityAuditService.js';

function parseDaysParam(raw: unknown, fallback = PROFILE_QUALITY_DEFAULT_PERIOD_DAYS): number {
  const n = parseInt(String(raw ?? fallback), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const getProfileQualityOverviewController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const days = parseDaysParam(req.query.days);
  const data = getQualityOverview(days);
  res.json({ success: true, data });
});

export const getProfileQualityDailyController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const days = parseDaysParam(req.query.days);
  const data = getQualityDaily(days);
  res.json({ success: true, data });
});

export const getProfileQualityTopErrorsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const days = parseDaysParam(req.query.days);
  const data = getQualityTopErrors(days);
  res.json({ success: true, data });
});

export const getProfileQualityBySourceController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const days = parseDaysParam(req.query.days);
  const data = getQualityBySource(days);
  res.json({ success: true, data });
});
