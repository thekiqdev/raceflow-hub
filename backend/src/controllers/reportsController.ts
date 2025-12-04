import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import {
  getRegistrationsByPeriod,
  getNewUsersByMonth,
  getRevenueByEvent,
  getTopOrganizers,
  getAthleteBehavior,
  getMonthlyEvolution,
  getEventPerformance,
} from '../services/reportsService.js';

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




