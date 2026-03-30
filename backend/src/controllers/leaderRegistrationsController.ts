import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getRegistrationsByLeaderCoupons,
  getRegistrationCountByLeaderCoupons,
} from '../services/leaderRegistrationsService.js';
import { getGroupLeaderByUserId, getGroupLeaderById } from '../services/groupLeadersService.js';

/**
 * GET /api/group-leaders/me/coupon-registrations
 * Get current leader's registrations by their coupons
 */
export const getMyCouponRegistrationsController = asyncHandler(
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

    const { event_id, coupon_code, payment_status } = req.query;

    const registrations = await getRegistrationsByLeaderCoupons(leader.id, {
      event_id: event_id as string | undefined,
      coupon_code: coupon_code as string | undefined,
      payment_status: payment_status as 'pending' | 'paid' | 'cancelled' | undefined,
    });

    const count = await getRegistrationCountByLeaderCoupons(leader.id, {
      event_id: event_id as string | undefined,
      coupon_code: coupon_code as string | undefined,
    });

    res.json({
      success: true,
      data: {
        data: registrations,
        count,
      },
    });
  }
);

/**
 * GET /api/organizer/group-leaders/:id/coupon-registrations
 * Get leader's registrations by their coupons (organizer/admin view)
 */
export const getLeaderCouponRegistrationsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { id: leaderId } = req.params;

    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    // Verify leader exists
    const leader = await getGroupLeaderById(leaderId);
    if (!leader) {
      res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Líder não encontrado',
      });
      return;
    }

    // If called from organizer route, verify leader is associated with organizer's events
    const isOrganizerRoute = req.path?.includes('/organizer/') || req.originalUrl?.includes('/organizer/');
    if (isOrganizerRoute && req.user) {
      const { query } = await import('../config/database.js');
      // Check if leader has coupons for organizer's events
      const result = await query(
        `SELECT 1 FROM coupons c
         JOIN coupon_events ce ON c.id = ce.coupon_id
         JOIN events e ON ce.event_id = e.id
         WHERE c.leader_id = $1 AND e.organizer_id = $2
         LIMIT 1`,
        [leaderId, req.user.id]
      );
      
      if (result.rows.length === 0) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Você não tem permissão para acessar este líder',
        });
        return;
      }
    }

    const { event_id, coupon_code, payment_status } = req.query;

    const registrations = await getRegistrationsByLeaderCoupons(leaderId, {
      event_id: event_id as string | undefined,
      coupon_code: coupon_code as string | undefined,
      payment_status: payment_status as 'pending' | 'paid' | 'cancelled' | undefined,
    });

    const count = await getRegistrationCountByLeaderCoupons(leaderId, {
      event_id: event_id as string | undefined,
      coupon_code: coupon_code as string | undefined,
    });

    res.json({
      success: true,
      data: registrations,
      count,
    });
  }
);

