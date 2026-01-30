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
  getAllGroupLeadersWithUserInfo,
  getOrganizerLeaders,
  getAvailableLeadersForOrganizer,
  addLeaderToOrganizer,
  removeLeaderFromOrganizer,
  deleteGroupLeader,
} from '../services/groupLeadersService.js';
import { getReferralsByLeader, getReferralStats } from '../services/referralsService.js';
import { getCommissionsByLeader } from '../services/commissionsService.js';
import { getLeaderInvitationProgress } from '../services/leaderBonusService.js';
// Note: Admin role verification is handled by requireRole('admin') middleware in adminRoutes.ts
import { z } from 'zod';

// Validation schemas
const createGroupLeaderSchema = z.object({
  user_id: z.string().uuid('Invalid user ID'),
  // commission_percentage removed - now using event-specific commissions only
});

const updateGroupLeaderSchema = z.object({
  is_active: z.boolean().optional(),
  // commission_percentage removed - now using event-specific commissions only
  referral_code: z.string()
    .regex(/^[A-Z]{3}[0-9]{3}$/, 'Código deve ter formato: 3 letras maiúsculas + 3 números (ex: ABC123)')
    .optional(),
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
 * Get all group leaders (admin only), com nome e email para busca
 * Note: Admin role is already verified by requireRole('admin') middleware in adminRoutes.ts
 */
export const getAllGroupLeadersController = asyncHandler(
  async (_req: AuthRequest, res: Response) => {
    const leaders = await getAllGroupLeadersWithUserInfo();

    res.json({
      success: true,
      data: leaders,
    });
  }
);

/**
 * GET /api/organizer/group-leaders
 * Get leaders added by organizer (organizer only)
 * Returns only leaders that the organizer has added to their list
 * Note: Organizer role is already verified by requireRole('organizer') middleware in organizerRoutes.ts
 */
export const getOrganizerGroupLeadersController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    const leaders = await getOrganizerLeaders(req.user.id);

    res.json({
      success: true,
      data: leaders,
    });
  }
);

/**
 * GET /api/organizer/group-leaders/available
 * Get available leaders (not yet added by organizer)
 * Returns all leaders that the organizer hasn't added yet
 * Note: Organizer role is already verified by requireRole('organizer') middleware in organizerRoutes.ts
 */
export const getAvailableLeadersController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    const leaders = await getAvailableLeadersForOrganizer(req.user.id);

    res.json({
      success: true,
      data: leaders,
    });
  }
);

/**
 * POST /api/organizer/group-leaders/:id/add
 * Add leader to organizer's list
 * Note: Organizer role is already verified by requireRole('organizer') middleware in organizerRoutes.ts
 */
export const addLeaderToOrganizerController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    const { id: leaderId } = req.params;

    try {
      await addLeaderToOrganizer(req.user.id, leaderId);

      res.json({
        success: true,
        message: 'Leader added to organizer list successfully',
      });
    } catch (error: any) {
      if (error.message === 'Leader already added to organizer') {
        res.status(409).json({
          success: false,
          error: 'Conflict',
          message: error.message,
        });
        return;
      }

      if (error.message === 'Leader not found') {
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
 * DELETE /api/organizer/group-leaders/:id/remove
 * Remove leader from organizer's list
 * Note: Organizer role is already verified by requireRole('organizer') middleware in organizerRoutes.ts
 */
export const removeLeaderFromOrganizerController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    const { id: leaderId } = req.params;

    try {
      await removeLeaderFromOrganizer(req.user.id, leaderId);

      res.json({
        success: true,
        message: 'Leader removed from organizer list successfully',
      });
    } catch (error: any) {
      if (error.message === 'Leader not found in organizer list') {
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

      if (
        error.message.includes('Código de referência') ||
        error.message.includes('já está em uso')
      ) {
        res.status(409).json({
          success: false,
          error: 'Validation Error',
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

    // If called from organizer route, filter referrals to only show those related to organizer's events
    const isOrganizerRoute = req.path?.includes('/organizer/') || req.originalUrl?.includes('/organizer/');
    let referrals = await getReferralsByLeader(leader.id);
    
    if (isOrganizerRoute && req.user) {
      const { query } = await import('../config/database.js');
      // Filter referrals to only show users who registered for organizer's events
      const organizerEvents = await query(
        'SELECT id FROM events WHERE organizer_id = $1',
        [req.user.id]
      );
      const eventIds = organizerEvents.rows.map((row: any) => row.id);
      
      if (eventIds.length > 0) {
        const filteredReferrals = await query(
          `SELECT DISTINCT ur.*, u.email, p.full_name, p.cpf
           FROM user_referrals ur
           JOIN users u ON ur.user_id = u.id
           LEFT JOIN profiles p ON u.id = p.id
           JOIN registrations r ON ur.user_id = r.runner_id
           WHERE ur.leader_id = $1 AND r.event_id = ANY($2::uuid[])
           ORDER BY ur.created_at DESC`,
          [leader.id, eventIds]
        );
        referrals = filteredReferrals.rows;
      } else {
        // No events, return empty array
        referrals = [];
      }
    }

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

    // If called from organizer route, filter commissions to only show those from organizer's events
    const isOrganizerRoute = req.path?.includes('/organizer/') || req.originalUrl?.includes('/organizer/');
    
    const { status, start_date, end_date, event_id } = req.query;

    // Filter commissions by organizer if organizer route
    const organizerId = (isOrganizerRoute && req.user) ? req.user.id : undefined;
    
    let commissions = await getCommissionsByLeader(leader.id, {
      status: status as 'pending' | 'paid' | 'cancelled' | undefined,
      start_date: start_date as string | undefined,
      end_date: end_date as string | undefined,
      event_id: event_id as string | undefined,
    }, organizerId);

    res.json({
      success: true,
      data: commissions,
    });
  }
);

/**
 * GET /api/admin/group-leaders/:id/invitation-progress
 * GET /api/organizer/group-leaders/:id/invitation-progress
 * Get invitation bonus progress for a leader (per event commission with invitation/both).
 */
export const getLeaderInvitationProgressController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { id: leaderId } = req.params;
    const leader = await getGroupLeaderById(leaderId);

    if (!leader) {
      res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Group leader not found',
      });
      return;
    }

    const isOrganizerRoute = req.path?.includes('/organizer/') || req.originalUrl?.includes('/organizer/');
    let organizerId: string | undefined;
    if (isOrganizerRoute && req.user) {
      organizerId = req.user.id;
      const leaders = await getOrganizerLeaders(req.user.id);
      const hasLeader = leaders.some((l: any) => l.id === leaderId);
      if (!hasLeader) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Líder não está na sua lista',
        });
        return;
      }
    }

    const progress = await getLeaderInvitationProgress(leaderId, organizerId);

    res.json({
      success: true,
      data: progress,
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

/**
 * DELETE /api/admin/group-leaders/:id/delete
 * Permanently delete group leader (admin only)
 * Note: This will cascade delete all related records (referrals, commissions, event commissions, invitations, coupons)
 * Note: Admin role is already verified by requireRole('admin') middleware in adminRoutes.ts
 */
export const deleteGroupLeaderController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    try {
      await deleteGroupLeader(id);

      res.json({
        success: true,
        message: 'Líder de grupo excluído permanentemente',
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

