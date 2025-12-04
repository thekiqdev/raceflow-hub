import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import {
  getOrganizerDashboardStats,
  getOrganizerChartData,
  getOrganizerFinancialSummary,
  getOrganizerEventRevenues,
} from '../services/organizerService.js';
import {
  getOrganizerFinancialOverview,
  getOrganizerWithdrawRequests,
  createWithdrawRequest,
} from '../services/financialService.js';
import { query } from '../config/database.js';
import { z } from 'zod';

/**
 * GET /api/organizer/dashboard/stats
 * Get dashboard statistics for the authenticated organizer
 */
export const getDashboardStatsController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const organizerId = req.user!.id;

    const stats = await getOrganizerDashboardStats(organizerId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error('Error fetching organizer dashboard stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch dashboard statistics',
    });
  }
};

/**
 * GET /api/organizer/dashboard/charts
 * Get chart data for organizer dashboard
 */
export const getDashboardChartsController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const organizerId = req.user!.id;
    const periodDays = parseInt(req.query.period as string) || 30;

    const chartData = await getOrganizerChartData(organizerId, periodDays);

    res.json({
      success: true,
      data: chartData,
    });
  } catch (error: any) {
    console.error('Error fetching organizer chart data:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch chart data',
    });
  }
};

/**
 * GET /api/organizer/financial/overview
 * Get financial overview for the authenticated organizer
 */
export const getFinancialOverviewController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const organizerId = req.user!.id;

    const overview = await getOrganizerFinancialOverview(organizerId);

    res.json({
      success: true,
      data: overview,
    });
  } catch (error: any) {
    console.error('Error fetching organizer financial overview:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch financial overview',
    });
  }
};

/**
 * GET /api/organizer/financial/withdrawals
 * Get withdrawal requests for the authenticated organizer
 */
export const getWithdrawalsController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const organizerId = req.user!.id;
    const status = req.query.status as string | undefined;

    const withdrawals = await getOrganizerWithdrawRequests(organizerId, status);

    res.json({
      success: true,
      data: withdrawals,
    });
  } catch (error: any) {
    console.error('Error fetching organizer withdrawals:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch withdrawals',
    });
  }
};

/**
 * POST /api/organizer/financial/withdrawals
 * Create withdrawal request for the authenticated organizer
 */
const createWithdrawalSchema = z.object({
  amount: z.number().min(0.01),
  payment_method: z.enum(['PIX', 'TED', 'BANK_TRANSFER']),
  pix_key: z.string().optional(),
});

export const createWithdrawalController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const organizerId = req.user!.id;
    const validation = createWithdrawalSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error.errors[0].message,
      });
      return;
    }

    const withdrawal = await createWithdrawRequest({
      organizer_id: organizerId,
      ...validation.data,
    });

    res.status(201).json({
      success: true,
      data: withdrawal,
      message: 'Solicitação de saque criada com sucesso',
    });
  } catch (error: any) {
    console.error('Error creating withdrawal request:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to create withdrawal request',
    });
  }
};

/**
 * GET /api/organizer/reports/financial-summary
 * Get financial summary for organizer reports
 */
export const getFinancialSummaryController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const organizerId = req.user!.id;

    const summary = await getOrganizerFinancialSummary(organizerId);

    res.json({
      success: true,
      data: summary,
    });
  } catch (error: any) {
    console.error('Error fetching organizer financial summary:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch financial summary',
    });
  }
};

/**
 * GET /api/organizer/reports/event-revenues
 * Get revenue by event for organizer
 */
export const getEventRevenuesController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const organizerId = req.user!.id;

    const revenues = await getOrganizerEventRevenues(organizerId);

    res.json({
      success: true,
      data: revenues,
    });
  } catch (error: any) {
    console.error('Error fetching organizer event revenues:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch event revenues',
    });
  }
};

/**
 * GET /api/organizer/settings
 * Get organizer settings (profile with organizer-specific fields)
 */
export const getOrganizerSettingsController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const organizerId = req.user!.id;

    const result = await query(
      `SELECT 
        p.id,
        p.full_name,
        p.phone,
        p.email,
        p.logo_url,
        p.organization_name,
        p.contact_email,
        p.contact_phone,
        p.bio,
        p.website_url,
        u.email
      FROM profiles p
      JOIN users u ON p.id = u.id
      WHERE p.id = $1`,
      [organizerId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Profile not found',
      });
      return;
    }

    const profile = result.rows[0];
    res.json({
      success: true,
      data: {
        id: profile.id,
        full_name: profile.full_name,
        phone: profile.phone,
        email: profile.email,
        logo_url: profile.logo_url,
        organization_name: profile.organization_name,
        contact_email: profile.contact_email,
        contact_phone: profile.contact_phone,
        bio: profile.bio,
        website_url: profile.website_url,
      },
    });
  } catch (error: any) {
    console.error('Error fetching organizer settings:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch organizer settings',
    });
  }
};

/**
 * PUT /api/organizer/settings
 * Update organizer settings
 */
const updateOrganizerSettingsSchema = z.object({
  full_name: z.string().min(1).optional(),
  phone: z.string().optional(),
  logo_url: z.string().url().nullable().optional(),
  organization_name: z.string().optional(),
  contact_email: z.string().email().optional(),
  contact_phone: z.string().optional(),
  bio: z.string().optional(),
  website_url: z.string().url().optional(),
});

export const updateOrganizerSettingsController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const organizerId = req.user!.id;
    const validation = updateOrganizerSettingsSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error.errors[0].message,
        errors: validation.error.errors,
      });
      return;
    }

    const { updateProfile } = await import('../services/profilesService.js');
    const updatedProfile = await updateProfile(organizerId, validation.data);

    if (!updatedProfile) {
      res.status(404).json({
        success: false,
        error: 'Profile not found',
      });
      return;
    }

    res.json({
      success: true,
      data: updatedProfile,
      message: 'Configurações atualizadas com sucesso',
    });
  } catch (error: any) {
    console.error('Error updating organizer settings:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to update organizer settings',
    });
  }
};

