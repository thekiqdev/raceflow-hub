import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  createGroupLeader,
  getGroupLeaderByUserId,
  getGroupLeaderById,
  updateGroupLeader,
  deactivateGroupLeader,
  activateGroupLeader,
  getAllGroupLeaders,
} from '../services/groupLeadersService.js';
import { getReferralsByLeader, getReferralStats } from '../services/referralsService.js';
import { getCommissionsByLeader } from '../services/commissionsService.js';
// Note: Admin role verification is handled by requireRole('admin') middleware in adminRoutes.ts
import { z } from 'zod';

// Validation schemas
const createGroupLeaderSchema = z.object({
  user_id: z.string().uuid('Invalid user ID'),
  commission_percentage: z.number().min(0).max(100).optional().nullable(),
});

const updateGroupLeaderSchema = z.object({
  is_active: z.boolean().optional(),
  commission_percentage: z.number().min(0).max(100).optional().nullable(),
});

/**
 * POST /api/admin/group-leaders
 * Create a new group leader (admin only)
 */
export const createGroupLeaderController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    // Note: Admin role is already verified by requireRole('admin') middleware in adminRoutes.ts
    const validation = createGroupLeaderSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error.errors[0].message,
        errors: validation.error.errors,
      });
      return;
    }

    try {
      const leader = await createGroupLeader(validation.data);

      res.status(201).json({
        success: true,
        data: leader,
        message: 'Group leader created successfully',
      });
    } catch (error: any) {
      if (error.message.includes('already has a group leader account')) {
        res.status(409).json({
          success: false,
          error: 'Conflict',
          message: error.message,
        });
        return;
      }

      throw error;
    }
  }
);

/**
 * GET /api/group-leaders/me
 * Get current user's group leader data
 */
export const getMyGroupLeaderController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    const leader = await getGroupLeaderByUserId(req.user.id);

    if (!leader) {
      res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'You are not a group leader',
      });
      return;
    }

    res.json({
      success: true,
      data: leader,
    });
  }
);

/**
 * GET /api/admin/group-leaders
 * Get all group leaders (admin only)
 * Note: Admin role is already verified by requireRole('admin') middleware in adminRoutes.ts
 */
export const getAllGroupLeadersController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const leaders = await getAllGroupLeaders();

    res.json({
      success: true,
      data: leaders,
    });
  }
);

/**
 * GET /api/admin/group-leaders/:id
 * Get group leader by ID (admin only)
 * Note: Admin role is already verified by requireRole('admin') middleware in adminRoutes.ts
 */
export const getGroupLeaderByIdController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    const leader = await getGroupLeaderById(id);

    if (!leader) {
      res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Group leader not found',
      });
      return;
    }

    res.json({
      success: true,
      data: leader,
    });
  }
);

/**
 * PUT /api/admin/group-leaders/:id
 * Update group leader (admin only)
 * Note: Admin role is already verified by requireRole('admin') middleware in adminRoutes.ts
 */
export const updateGroupLeaderController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    const validation = updateGroupLeaderSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error.errors[0].message,
        errors: validation.error.errors,
      });
      return;
    }

    try {
      const leader = await updateGroupLeader(id, validation.data);

      res.json({
        success: true,
        data: leader,
        message: 'Group leader updated successfully',
      });
    } catch (error: any) {
      if (error.message === 'Group leader not found') {
        res.status(404).json({
          success: false,
          error: 'Not found',
          message: error.message,
        });
        return;
      }

      throw error;
    }
  }
);

/**
 * DELETE /api/admin/group-leaders/:id
 * Deactivate group leader (admin only)
 * Note: Admin role is already verified by requireRole('admin') middleware in adminRoutes.ts
 */
export const deactivateGroupLeaderController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    try {
      const leader = await deactivateGroupLeader(id);

      res.json({
        success: true,
        data: leader,
        message: 'Group leader deactivated successfully',
      });
    } catch (error: any) {
      if (error.message === 'Group leader not found') {
        res.status(404).json({
          success: false,
          error: 'Not found',
          message: error.message,
        });
        return;
      }

      throw error;
    }
  }
);

/**
 * POST /api/admin/group-leaders/:id/activate
 * Activate group leader (admin only)
 * Note: Admin role is already verified by requireRole('admin') middleware in adminRoutes.ts
 */
export const activateGroupLeaderController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    try {
      const leader = await activateGroupLeader(id);

      res.json({
        success: true,
        data: leader,
        message: 'Group leader activated successfully',
      });
    } catch (error: any) {
      if (error.message === 'Group leader not found') {
        res.status(404).json({
          success: false,
          error: 'Not found',
          message: error.message,
        });
        return;
      }

      throw error;
    }
  }
);

/**
 * GET /api/group-leaders/me/referrals
 * Get current leader's referrals
 */
export const getMyReferralsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    const leader = await getGroupLeaderByUserId(req.user.id);

    if (!leader) {
      res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'You are not a group leader',
      });
      return;
    }

    const referrals = await getReferralsByLeader(leader.id);

    res.json({
      success: true,
      data: referrals,
    });
  }
);

/**
 * GET /api/admin/group-leaders/:id/referrals
 * Get referrals by leader ID (admin only)
 * Note: Admin role is already verified by requireRole('admin') middleware in adminRoutes.ts
 */
export const getReferralsByLeaderController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const leader = await getGroupLeaderById(req.params.id);

    if (!leader) {
      res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Group leader not found',
      });
      return;
    }

    const referrals = await getReferralsByLeader(leader.id);

    res.json({
      success: true,
      data: referrals,
    });
  }
);

/**
 * GET /api/group-leaders/me/commissions
 * Get current leader's commissions
 */
export const getMyCommissionsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    const leader = await getGroupLeaderByUserId(req.user.id);

    if (!leader) {
      res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'You are not a group leader',
      });
      return;
    }

    const { status, start_date, end_date, event_id } = req.query;

    const commissions = await getCommissionsByLeader(leader.id, {
      status: status as 'pending' | 'paid' | 'cancelled' | undefined,
      start_date: start_date as string | undefined,
      end_date: end_date as string | undefined,
      event_id: event_id as string | undefined,
    });

    res.json({
      success: true,
      data: commissions,
    });
  }
);

/**
 * GET /api/admin/group-leaders/:id/commissions
 * Get commissions by leader ID (admin only)
 * Note: Admin role is already verified by requireRole('admin') middleware in adminRoutes.ts
 */
export const getCommissionsByLeaderController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const leader = await getGroupLeaderById(req.params.id);

    if (!leader) {
      res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Group leader not found',
      });
      return;
    }

    const { status, start_date, end_date, event_id } = req.query;

    const commissions = await getCommissionsByLeader(leader.id, {
      status: status as 'pending' | 'paid' | 'cancelled' | undefined,
      start_date: start_date as string | undefined,
      end_date: end_date as string | undefined,
      event_id: event_id as string | undefined,
    });

    res.json({
      success: true,
      data: commissions,
    });
  }
);

/**
 * GET /api/group-leaders/me/stats
 * Get current leader's statistics
 */
export const getMyStatsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    const leader = await getGroupLeaderByUserId(req.user.id);

    if (!leader) {
      res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'You are not a group leader',
      });
      return;
    }

    const stats = await getReferralStats(leader.id);

    res.json({
      success: true,
      data: {
        ...leader,
        stats,
      },
    });
  }
);

