import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import {
  getFinancialOverview,
  getWithdrawRequests,
  getRefundRequests,
  approveWithdrawal,
  rejectWithdrawal,
  approveRefund,
  rejectRefund,
  getFinancialSettings,
  updateFinancialSettings,
} from '../services/financialService.js';
import { z } from 'zod';

// Validation schemas
const approveWithdrawalSchema = z.object({
  notes: z.string().optional(),
});

const rejectWithdrawalSchema = z.object({
  notes: z.string().optional(),
});

const approveRefundSchema = z.object({
  notes: z.string().optional(),
});

const rejectRefundSchema = z.object({
  notes: z.string().optional(),
});

const updateSettingsSchema = z.object({
  commission_percentage: z.number().min(0).max(100).optional(),
  min_withdraw_amount: z.number().min(0).optional(),
  payment_gateway: z.string().optional(),
  gateway_public_key: z.string().optional(),
  gateway_private_key: z.string().optional(),
});

/**
 * GET /api/admin/financial/overview
 * Get financial overview statistics
 */
export const getFinancialOverviewController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const overview = await getFinancialOverview();

    res.json({
      success: true,
      data: overview,
    });
  } catch (error: any) {
    console.error('Error fetching financial overview:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch financial overview',
    });
  }
};

/**
 * GET /api/admin/financial/withdrawals
 * Get all withdrawal requests
 */
export const getWithdrawalsController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const status = req.query.status as string | undefined;
    const requests = await getWithdrawRequests(status);

    res.json({
      success: true,
      data: requests,
    });
  } catch (error: any) {
    console.error('Error fetching withdrawals:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch withdrawal requests',
    });
  }
};

/**
 * POST /api/admin/financial/withdrawals/:id/approve
 * Approve withdrawal request
 */
export const approveWithdrawalController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const validation = approveWithdrawalSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error.errors[0].message,
      });
      return;
    }

    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
      return;
    }

    await approveWithdrawal(id, req.user.id, validation.data.notes);

    res.json({
      success: true,
      message: 'Withdrawal request approved successfully',
    });
  } catch (error: any) {
    console.error('Error approving withdrawal:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to approve withdrawal request',
    });
  }
};

/**
 * POST /api/admin/financial/withdrawals/:id/reject
 * Reject withdrawal request
 */
export const rejectWithdrawalController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const validation = rejectWithdrawalSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error.errors[0].message,
      });
      return;
    }

    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
      return;
    }

    await rejectWithdrawal(id, req.user.id, validation.data.notes);

    res.json({
      success: true,
      message: 'Withdrawal request rejected successfully',
    });
  } catch (error: any) {
    console.error('Error rejecting withdrawal:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to reject withdrawal request',
    });
  }
};

/**
 * GET /api/admin/financial/refunds
 * Get all refund requests
 */
export const getRefundsController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const status = req.query.status as string | undefined;
    const requests = await getRefundRequests(status);

    res.json({
      success: true,
      data: requests,
    });
  } catch (error: any) {
    console.error('Error fetching refunds:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch refund requests',
    });
  }
};

/**
 * POST /api/admin/financial/refunds/:id/approve
 * Approve refund request
 */
export const approveRefundController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const validation = approveRefundSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error.errors[0].message,
      });
      return;
    }

    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
      return;
    }

    await approveRefund(id, req.user.id, validation.data.notes);

    res.json({
      success: true,
      message: 'Refund request approved successfully',
    });
  } catch (error: any) {
    console.error('Error approving refund:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to approve refund request',
    });
  }
};

/**
 * POST /api/admin/financial/refunds/:id/reject
 * Reject refund request
 */
export const rejectRefundController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const validation = rejectRefundSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error.errors[0].message,
      });
      return;
    }

    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
      return;
    }

    await rejectRefund(id, req.user.id, validation.data.notes);

    res.json({
      success: true,
      message: 'Refund request rejected successfully',
    });
  } catch (error: any) {
    console.error('Error rejecting refund:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to reject refund request',
    });
  }
};

/**
 * GET /api/admin/financial/settings
 * Get financial settings
 */
export const getFinancialSettingsController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const settings = await getFinancialSettings();

    if (!settings) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Financial settings not found',
      });
      return;
    }

    res.json({
      success: true,
      data: settings,
    });
  } catch (error: any) {
    console.error('Error fetching financial settings:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch financial settings',
    });
  }
};

/**
 * PUT /api/admin/financial/settings
 * Update financial settings
 */
export const updateFinancialSettingsController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const validation = updateSettingsSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error.errors[0].message,
      });
      return;
    }

    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
      return;
    }

    const settings = await updateFinancialSettings(validation.data, req.user.id);

    res.json({
      success: true,
      data: settings,
      message: 'Financial settings updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating financial settings:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to update financial settings',
    });
  }
};




