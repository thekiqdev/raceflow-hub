import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import {
  getRunnerResults,
  getRunnerResultsStats,
  getRunnerResultByEvent,
} from '../services/runnerResultsService.js';
import {
  getRunnerStats,
  getRunnerAchievements,
} from '../services/runnerStatsService.js';
import {
  getRunnerPayments,
} from '../services/runnerPaymentsService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

/**
 * GET /api/runner/results
 * Get all results for the authenticated runner
 */
export const getRunnerResultsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const results = await getRunnerResults(req.user.id);

  res.json({
    success: true,
    data: results,
  });
});

/**
 * GET /api/runner/results/stats
 * Get statistics for runner results
 */
export const getRunnerResultsStatsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const stats = await getRunnerResultsStats(req.user.id);

  res.json({
    success: true,
    data: stats,
  });
});

/**
 * GET /api/runner/results/:event_id
 * Get result for a specific event
 */
export const getRunnerResultByEventController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const { event_id } = req.params;
  const result = await getRunnerResultByEvent(req.user.id, event_id);

  if (!result) {
    res.status(404).json({
      success: false,
      error: 'Result not found',
      message: 'Resultado não encontrado para este evento',
    });
    return;
  }

  res.json({
    success: true,
    data: result,
  });
});

/**
 * GET /api/runner/stats
 * Get statistics for the authenticated runner
 */
export const getRunnerStatsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const stats = await getRunnerStats(req.user.id);

  res.json({
    success: true,
    data: stats,
  });
});

/**
 * GET /api/runner/achievements
 * Get achievements for the authenticated runner
 */
export const getRunnerAchievementsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const achievements = await getRunnerAchievements(req.user.id);

  res.json({
    success: true,
    data: achievements,
  });
});

/**
 * GET /api/runner/payments
 * Get payment history for the authenticated runner
 */
export const getRunnerPaymentsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const payments = await getRunnerPayments(req.user.id);

  res.json({
    success: true,
    data: payments,
  });
});

