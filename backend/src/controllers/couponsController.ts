import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  createCoupon,
  getCouponById,
  getCouponsByOrganizer,
  updateCoupon,
  deleteCoupon,
  type CreateCouponData,
  type UpdateCouponData,
} from '../services/couponsService.js';
import { z } from 'zod';

// Validation schemas
const createCouponSchema = z.object({
  event_ids: z.array(z.string().uuid('ID do evento inválido')).optional().nullable(),
  leader_id: z.string().uuid('ID do líder inválido').optional().nullable(),
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

const updateCouponSchema = z.object({
  event_ids: z.array(z.string().uuid('ID do evento inválido')).optional().nullable(),
  leader_id: z.string().uuid('ID do líder inválido').optional().nullable(),
  name: z.string().min(1).max(255).optional(),
  type: z.enum(['percentage', 'fixed']).optional(),
  discount_value: z.number().positive().optional(),
  expiration_date: z.string().datetime().optional().nullable(),
  max_uses: z.number().int().positive().optional().nullable(),
  is_active: z.boolean().optional(),
});

/**
 * POST /api/organizer/coupons
 * Create a new coupon
 */
export const createCouponController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    const validation = createCouponSchema.safeParse(req.body);

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
        event_ids: validation.data.event_ids || null,
        leader_id: validation.data.leader_id || null,
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
 * GET /api/organizer/coupons
 * Get all coupons for the current organizer
 */
export const getCouponsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    const coupons = await getCouponsByOrganizer(req.user.id);

    res.json({
      success: true,
      data: coupons,
    });
  }
);

/**
 * GET /api/organizer/coupons/:id
 * Get coupon by ID
 */
export const getCouponByIdController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    const { id } = req.params;
    const coupon = await getCouponById(id);

    if (!coupon) {
      res.status(404).json({
        success: false,
        error: 'Coupon not found',
      });
      return;
    }

    // Verify that the coupon belongs to the organizer
    if (coupon.organizer_id !== req.user.id) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You can only access your own coupons',
      });
      return;
    }

    res.json({
      success: true,
      data: coupon,
    });
  }
);

/**
 * PUT /api/organizer/coupons/:id
 * Update coupon
 */
export const updateCouponController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    const { id } = req.params;
    const coupon = await getCouponById(id);

    if (!coupon) {
      res.status(404).json({
        success: false,
        error: 'Coupon not found',
      });
      return;
    }

    // Verify that the coupon belongs to the organizer
    if (coupon.organizer_id !== req.user.id) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You can only update your own coupons',
      });
      return;
    }

    const validation = updateCouponSchema.safeParse(req.body);

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
        ...validation.data,
        event_ids: validation.data.event_ids !== undefined ? validation.data.event_ids : undefined,
        expiration_date: validation.data.expiration_date !== undefined
          ? (validation.data.expiration_date ? new Date(validation.data.expiration_date) : null)
          : undefined,
      };

      const updatedCoupon = await updateCoupon(id, updateData);

      res.json({
        success: true,
        data: updatedCoupon,
        message: 'Cupom atualizado com sucesso',
      });
    } catch (error: any) {
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
 * DELETE /api/organizer/coupons/:id
 * Delete coupon
 */
export const deleteCouponController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    const { id } = req.params;
    const coupon = await getCouponById(id);

    if (!coupon) {
      res.status(404).json({
        success: false,
        error: 'Coupon not found',
      });
      return;
    }

    // Verify that the coupon belongs to the organizer
    if (coupon.organizer_id !== req.user.id) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You can only delete your own coupons',
      });
      return;
    }

    await deleteCoupon(id);

    res.json({
      success: true,
      message: 'Cupom deletado com sucesso',
    });
  }
);

/**
 * POST /api/coupons/validate
 * Validate coupon code (public endpoint)
 */
export const validateCouponController = asyncHandler(
  async (req: any, res: Response) => {
    const { code, event_id } = req.body;

    if (!code) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Código do cupom é obrigatório',
      });
      return;
    }

    if (!event_id) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'ID do evento é obrigatório',
      });
      return;
    }

    try {
      // Get event to find organizer_id
      const { getEventById } = await import('../services/eventsService.js');
      const event = await getEventById(event_id);

      if (!event) {
        res.status(404).json({
          success: false,
          error: 'Event not found',
        });
        return;
      }

      // Validate coupon
      const { validateCoupon } = await import('../services/couponsService.js');
      const validation = await validateCoupon(code, event.organizer_id, event_id);

      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: 'Invalid Coupon',
          message: validation.error || 'Cupom inválido',
        });
        return;
      }

      res.json({
        success: true,
        data: validation.coupon,
        message: 'Cupom válido',
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: error.message || 'Erro ao validar cupom',
      });
    }
  }
);

