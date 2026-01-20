import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  createCoupon,
  getCouponsByLeader,
  getCouponById,
  updateCoupon,
  deleteCoupon,
  type CreateCouponData,
  type UpdateCouponData,
} from '../services/couponsService.js';
import { getGroupLeaderById } from '../services/groupLeadersService.js';
import { z } from 'zod';

// Validation schemas
const createLeaderCouponSchema = z.object({
  event_ids: z.array(z.string().uuid('ID do evento inválido')).optional().nullable(),
  code: z.string().min(1).max(50, 'Código do cupom deve ter no máximo 50 caracteres'),
  name: z.string().min(1).max(255, 'Nome do cupom deve ter no máximo 255 caracteres'),
  type: z.enum(['percentage', 'fixed'], {
    errorMap: () => ({ message: 'Tipo deve ser "percentage" ou "fixed"' }),
  }),
  discount_value: z.number().positive('Valor do desconto deve ser maior que zero'),
  expiration_date: z.string().datetime().optional().nullable(),
  max_uses: z.number().int().positive().optional().nullable(),
  is_active: z.boolean().optional(),
});

const updateLeaderCouponSchema = z.object({
  event_ids: z.array(z.string().uuid('ID do evento inválido')).optional().nullable(),
  name: z.string().min(1).max(255).optional(),
  type: z.enum(['percentage', 'fixed']).optional(),
  discount_value: z.number().positive().optional(),
  expiration_date: z.string().datetime().optional().nullable(),
  max_uses: z.number().int().positive().optional().nullable(),
  is_active: z.boolean().optional(),
});

/**
 * POST /api/organizer/group-leaders/:id/coupons
 * Create a new coupon for a leader
 */
export const createLeaderCouponController = asyncHandler(
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

    const validation = createLeaderCouponSchema.safeParse(req.body);
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
      const couponData: CreateCouponData = {
        organizer_id: req.user.id,
        leader_id: leaderId,
        event_ids: validation.data.event_ids || null,
        code: validation.data.code,
        name: validation.data.name,
        type: validation.data.type,
        discount_value: validation.data.discount_value,
        expiration_date: validation.data.expiration_date 
          ? new Date(validation.data.expiration_date) 
          : null,
        max_uses: validation.data.max_uses || null,
        is_active: validation.data.is_active !== undefined ? validation.data.is_active : true,
      };

      const coupon = await createCoupon(couponData);

      res.status(201).json({
        success: true,
        data: coupon,
        message: 'Cupom criado com sucesso',
      });
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        res.status(409).json({
          success: false,
          error: 'Conflict',
          message: error.message,
        });
        return;
      }

      if (error.message.includes('must be between')) {
        res.status(400).json({
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
 * GET /api/organizer/group-leaders/:id/coupons
 * Get all coupons for a leader
 */
export const getLeaderCouponsController = asyncHandler(
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

    // Filter coupons by organizer - only show coupons created by this organizer
    const coupons = await getCouponsByLeader(leaderId, req.user.id);

    res.json({
      success: true,
      data: coupons,
    });
  }
);

/**
 * PUT /api/organizer/group-leaders/:id/coupons/:couponId
 * Update a leader coupon
 */
export const updateLeaderCouponController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { id: leaderId, couponId } = req.params;

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

    // Verify coupon exists and belongs to leader
    const coupon = await getCouponById(couponId);
    if (!coupon || coupon.leader_id !== leaderId) {
      res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Cupom não encontrado',
      });
      return;
    }

    // Verify organizer owns the coupon
    if (coupon.organizer_id !== req.user.id) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Você não tem permissão para gerenciar este cupom',
      });
      return;
    }

    const validation = updateLeaderCouponSchema.safeParse(req.body);
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
      const updateData: UpdateCouponData = {
        event_ids: validation.data.event_ids !== undefined ? validation.data.event_ids : undefined,
        name: validation.data.name,
        type: validation.data.type,
        discount_value: validation.data.discount_value,
        expiration_date: validation.data.expiration_date 
          ? new Date(validation.data.expiration_date) 
          : undefined,
        max_uses: validation.data.max_uses !== undefined ? validation.data.max_uses : undefined,
        is_active: validation.data.is_active,
      };

      const updatedCoupon = await updateCoupon(couponId, updateData);

      res.json({
        success: true,
        data: updatedCoupon,
        message: 'Cupom atualizado com sucesso',
      });
    } catch (error: any) {
      if (error.message === 'Coupon not found') {
        res.status(404).json({
          success: false,
          error: 'Not found',
          message: error.message,
        });
        return;
      }

      if (error.message.includes('must be between')) {
        res.status(400).json({
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
 * DELETE /api/organizer/group-leaders/:id/coupons/:couponId
 * Delete a leader coupon
 */
export const deleteLeaderCouponController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { id: leaderId, couponId } = req.params;

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

    // Verify coupon exists and belongs to leader
    const coupon = await getCouponById(couponId);
    if (!coupon || coupon.leader_id !== leaderId) {
      res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Cupom não encontrado',
      });
      return;
    }

    // Verify organizer owns the coupon
    if (coupon.organizer_id !== req.user.id) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Você não tem permissão para gerenciar este cupom',
      });
      return;
    }

    try {
      await deleteCoupon(couponId);

      res.json({
        success: true,
        message: 'Cupom removido com sucesso',
      });
    } catch (error: any) {
      if (error.message === 'Coupon not found') {
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



