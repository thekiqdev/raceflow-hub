import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { hasRole } from '../services/userRolesService.js';
import { getEventById } from '../services/eventsService.js';
import { getEventGeneralStats } from '../services/eventGeneralStatsService.js';
import { getEventProductStockReport } from '../services/eventProductStockReportService.js';
import {
  getRegistrationsByPeriod,
  getNewUsersByMonth,
  getRevenueByEvent,
  getTopOrganizers,
  getAthleteBehavior,
  getMonthlyEvolution,
  getEventPerformance,
  getCpfValidationOverview,
} from '../services/reportsService.js';
import { getCpfLookupMetricsSummary } from '../services/cpfLookupMetricsService.js';

/**
 * GET /api/admin/reports/registrations-by-period
 * Get registrations by period
 */
export const getRegistrationsByPeriodController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const startDate = req.query.start_date as string | undefined;
    const endDate = req.query.end_date as string | undefined;

    const data = await getRegistrationsByPeriod(startDate, endDate);

    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('Error fetching registrations by period:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch registrations by period',
    });
  }
};

/**
 * GET /api/admin/reports/new-users-by-month
 * Get new users by month
 */
export const getNewUsersByMonthController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const months = req.query.months ? parseInt(req.query.months as string) : 12;

    const data = await getNewUsersByMonth(months);

    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('Error fetching new users by month:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch new users by month',
    });
  }
};

/**
 * GET /api/admin/reports/revenue-by-event
 * Get revenue by event
 */
export const getRevenueByEventController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const startDate = req.query.start_date as string | undefined;
    const endDate = req.query.end_date as string | undefined;

    const data = await getRevenueByEvent(startDate, endDate);

    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('Error fetching revenue by event:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch revenue by event',
    });
  }
};

/**
 * GET /api/admin/reports/top-organizers
 * Get top organizers
 */
export const getTopOrganizersController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

    const data = await getTopOrganizers(limit);

    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('Error fetching top organizers:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch top organizers',
    });
  }
};

/**
 * GET /api/admin/reports/athlete-behavior
 * Get athlete behavior
 */
export const getAthleteBehaviorController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;

    const data = await getAthleteBehavior(limit);

    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('Error fetching athlete behavior:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch athlete behavior',
    });
  }
};

/**
 * GET /api/admin/reports/monthly-evolution
 * Get monthly registration evolution
 */
export const getMonthlyEvolutionController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const months = req.query.months ? parseInt(req.query.months as string) : 12;

    const data = await getMonthlyEvolution(months);

    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('Error fetching monthly evolution:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch monthly evolution',
    });
  }
};

/**
 * GET /api/admin/reports/event-performance
 * Get event performance
 */
export const getEventPerformanceController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const startDate = req.query.start_date as string | undefined;
    const endDate = req.query.end_date as string | undefined;

    const data = await getEventPerformance(startDate, endDate);

    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('Error fetching event performance:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch event performance',
    });
  }
};

/**
 * GET /api/admin/reports/cpf-validation-overview
 * Fase 5: contagem de perfis legados (sem validação na fonte oficial).
 */
export const getCpfValidationOverviewController = async (
  _req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const data = await getCpfValidationOverview();
    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('Error fetching CPF validation overview:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch CPF validation overview',
    });
  }
};

/**
 * GET /api/admin/reports/cpf-lookup-metrics?days=30
 * Série diária de sucesso/falha em POST /auth/lookup-cpf (Fase 6).
 */
export const getCpfLookupMetricsController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const raw = req.query.days ? parseInt(req.query.days as string, 10) : 30;
    const days = Number.isFinite(raw) && raw > 0 ? raw : 30;
    const data = await getCpfLookupMetricsSummary(days);
    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('Error fetching CPF lookup metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch CPF lookup metrics',
    });
  }
};

/**
 * GET /api/admin/reports/events/:eventId/general-stats
 * GET /api/organizer/reports/events/:eventId/general-stats
 * Read-only general event summary (registrations aggregates).
 */
export const getEventGeneralStatsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { eventId } = req.params as { eventId: string };
  const event = await getEventById(eventId);

  if (!event) {
    res.status(404).json({
      success: false,
      error: 'Not found',
      message: 'Evento não encontrado',
    });
    return;
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  if (!isAdmin && event.organizer_id !== req.user.id) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Sem permissão para visualizar estatísticas deste evento',
    });
    return;
  }

  const data = await getEventGeneralStats(eventId);

  res.json({
    success: true,
    data,
  });
});

/**
 * GET /api/admin/reports/events/:eventId/product-stock
 * GET /api/organizer/reports/events/:eventId/product-stock
 * Read-only product stock report by variation for an event.
 */
export const getEventProductStockReportController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { eventId } = req.params as { eventId: string };
  const event = await getEventById(eventId);

  if (!event) {
    res.status(404).json({
      success: false,
      error: 'Not found',
      message: 'Evento não encontrado',
    });
    return;
  }

  const isAdmin = await hasRole(req.user.id, 'admin');
  if (!isAdmin && event.organizer_id !== req.user.id) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Sem permissão para visualizar estoque deste evento',
    });
    return;
  }

  const data = await getEventProductStockReport(eventId);

  res.json({
    success: true,
    data,
  });
});

