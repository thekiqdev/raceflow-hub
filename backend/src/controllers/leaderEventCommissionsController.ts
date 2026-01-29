import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { hasRole } from '../services/userRolesService.js';
import {
  createLeaderEventCommission,
  getLeaderEventCommissions,
  getLeaderEventCommissionById,
  updateLeaderEventCommission,
  deleteLeaderEventCommission,
} from '../services/leaderEventCommissionsService.js';
import { z } from 'zod';
import { getGroupLeaderById } from '../services/groupLeadersService.js';
import { getEventById } from '../services/eventsService.js';
import { createCoupon } from '../services/couponsService.js';

// Validation schemas
const createLeaderEventCommissionSchema = z.object({
  event_id: z.string().uuid('Invalid event ID'),
  commission_percentage: z.number().min(0).max(100, 'Percentual deve estar entre 0 e 100').optional(),
  bonus_type: z.enum(['commission', 'invitation', 'both']).optional().default('commission'),
  required_purchases: z.number().int().positive('Número de compras deve ser maior que 0').optional().nullable(),
  name: z.string().max(255, 'Nome deve ter no máximo 255 caracteres').optional().nullable(),
  coupon_discount: z.number().min(0).max(100, 'Desconto do cupom deve estar entre 0 e 100').optional().default(10),
}).refine((data) => {
  const bonusType = data.bonus_type || 'commission';
  
  // Se for comissão ou both, commission_percentage é obrigatório
  if ((bonusType === 'commission' || bonusType === 'both') && data.commission_percentage === undefined) {
    return false;
  }
  // Se for convite ou both, required_purchases é obrigatório
  if ((bonusType === 'invitation' || bonusType === 'both') && (!data.required_purchases || data.required_purchases <= 0)) {
    return false;
  }
  return true;
}, {
  message: 'Para comissão, percentual é obrigatório. Para convite, número de compras é obrigatório. Para ambos, ambos são obrigatórios.',
});

const updateLeaderEventCommissionSchema = z.object({
  commission_percentage: z.number().min(0).max(100, 'Percentual deve estar entre 0 e 100').optional(),
  bonus_type: z.enum(['commission', 'invitation', 'both']).optional(),
  required_purchases: z.number().int().positive('Número de compras deve ser maior que 0').optional().nullable(),
  name: z.string().max(255, 'Nome deve ter no máximo 255 caracteres').optional().nullable(),
  coupon_discount: z.number().min(0).max(100, 'Desconto do cupom deve estar entre 0 e 100').optional(),
});

/**
 * POST /api/organizer/group-leaders/:id/event-commissions
 * Create a new event commission for a leader
 */
export const createLeaderEventCommissionController = asyncHandler(
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

    // Verify event exists and belongs to organizer
    const validation = createLeaderEventCommissionSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error.errors[0].message,
        errors: validation.error.errors,
      });
      return;
    }

    const event = await getEventById(validation.data.event_id);
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
        message: 'Você não tem permissão para gerenciar este evento',
      });
      return;
    }

    const effectiveOrganizerId = isAdmin ? event.organizer_id : req.user.id;

    try {
      const commission = await createLeaderEventCommission({
        leader_id: leaderId,
        event_id: validation.data.event_id,
        commission_percentage: validation.data.commission_percentage || 0,
        bonus_type: validation.data.bonus_type,
        required_purchases: validation.data.required_purchases,
        name: validation.data.name,
      });

      // Create automatic coupon for this leader and event
      // Each commission gets its own unique coupon to track which bonus it's associated with
      let coupon = null;
      try {
        const couponDiscount = validation.data.coupon_discount ?? 10;
        console.log(`🎫 [createLeaderEventCommission] Criando cupom com desconto: ${couponDiscount}% (valor recebido: ${validation.data.coupon_discount})`);
        
        // Generate unique coupon code based on leader referral code + commission ID + timestamp
        // This ensures each commission gets a unique coupon
        // Use commission ID (first 8 chars) + timestamp (last 6 digits) + random (4 digits)
        const commissionIdShort = commission.id.replace(/-/g, '').substring(0, 8).toUpperCase();
        const timestamp = Date.now();
        const randomSuffix = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        const baseCode = `${leader.referral_code}${commissionIdShort}${timestamp.toString().slice(-6)}${randomSuffix}`.toUpperCase();
        let couponCode = baseCode;
        let attempts = 0;
        
        // Ensure code is unique
        const { getCouponByCode } = await import('../services/couponsService.js');
        while (attempts < 10) {
          const existing = await getCouponByCode(couponCode, effectiveOrganizerId);
          if (!existing) {
            break;
          }
          // If code exists, regenerate with new timestamp and random
          const newTimestamp = Date.now();
          const newRandom = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
          couponCode = `${leader.referral_code}${commissionIdShort}${newTimestamp.toString().slice(-6)}${newRandom}`.toUpperCase();
          attempts++;
        }
        
        // Create new coupon for this specific commission
        // Use commission name or a descriptive name
        const couponName = validation.data.name 
          ? `Cupom ${leader.referral_code} - ${validation.data.name}`
          : `Cupom ${leader.referral_code} - ${event.title}`;
        
        coupon = await createCoupon({
          organizer_id: effectiveOrganizerId,
          leader_id: leaderId,
          event_ids: [validation.data.event_id],
          code: couponCode,
          name: couponName,
          type: 'percentage',
          discount_value: couponDiscount,
          is_active: true,
        });
        
        console.log(`✅ Cupom único criado para comissão ${commission.id}: ${couponCode} (ID: ${coupon.id})`);
      } catch (couponError: any) {
        // Log error but don't fail commission creation if coupon creation fails
        console.error('Erro ao criar cupom automático:', couponError.message);
      }

      res.status(201).json({
        success: true,
        data: {
          ...commission,
          coupon: coupon ? {
            id: coupon.id,
            code: coupon.code,
            link: (() => {
              // Get base URL - prefer port 8080, fallback to first CORS_ORIGIN or API_URL
              let baseUrl = 'http://localhost:8080';
              
              if (process.env.CORS_ORIGIN) {
                const origins = process.env.CORS_ORIGIN.split(',').map(o => o.trim());
                // Prefer origin with port 8080
                const origin8080 = origins.find(o => o.includes(':8080'));
                baseUrl = origin8080 || origins[0];
              } else if (process.env.API_URL) {
                baseUrl = process.env.API_URL.replace('/api', '');
              }
              
              return `${baseUrl}/events/${validation.data.event_id}?ref=${leader.referral_code}&cupom=${coupon.code}`;
            })(),
          } : null,
        },
        message: 'Comissão criada com sucesso',
      });
    } catch (error: any) {
      if (error.message.includes('já existe')) {
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
 * GET /api/group-leaders/me/event-commissions
 * Get current leader's event commissions
 */
export const getMyEventCommissionsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    const { getGroupLeaderByUserId } = await import('../services/groupLeadersService.js');
    const leader = await getGroupLeaderByUserId(req.user.id);

    if (!leader) {
      res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'You are not a group leader',
      });
      return;
    }

    const commissions = await getLeaderEventCommissions(leader.id);

    res.json({
      success: true,
      data: commissions,
    });
  }
);

/**
 * GET /api/organizer/group-leaders/:id/event-commissions
 * Get all event commissions for a leader
 */
export const getLeaderEventCommissionsController = asyncHandler(
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

    const isAdmin = await hasRole(req.user.id, 'admin');
    const commissions = await getLeaderEventCommissions(
      leaderId,
      isAdmin ? undefined : req.user.id
    );

    res.json({
      success: true,
      data: commissions,
    });
  }
);

/**
 * PUT /api/organizer/group-leaders/:id/event-commissions/:commissionId
 * Update an event commission
 */
export const updateLeaderEventCommissionController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { id: leaderId, commissionId } = req.params;

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

    // Verify commission exists and belongs to leader
    const commission = await getLeaderEventCommissionById(commissionId);
    if (!commission || commission.leader_id !== leaderId) {
      res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Comissão não encontrada',
      });
      return;
    }

    const event = await getEventById(commission.event_id);
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
        message: 'Você não tem permissão para gerenciar este evento',
      });
      return;
    }

    const validation = updateLeaderEventCommissionSchema.safeParse(req.body);
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
      const updatedCommission = await updateLeaderEventCommission(
        commissionId,
        validation.data
      );

      res.json({
        success: true,
        data: updatedCommission,
        message: 'Comissão atualizada com sucesso',
      });
    } catch (error: any) {
      if (error.message === 'Comissão não encontrada') {
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
 * DELETE /api/organizer/group-leaders/:id/event-commissions/:commissionId
 * Delete an event commission
 */
export const deleteLeaderEventCommissionController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { id: leaderId, commissionId } = req.params;

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

    const commission = await getLeaderEventCommissionById(commissionId);
    if (!commission || commission.leader_id !== leaderId) {
      res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Comissão não encontrada',
      });
      return;
    }

    const event = await getEventById(commission.event_id);
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
        message: 'Você não tem permissão para gerenciar este evento',
      });
      return;
    }

    try {
      await deleteLeaderEventCommission(commissionId);

      res.json({
        success: true,
        message: 'Comissão removida com sucesso',
      });
    } catch (error: any) {
      if (error.message === 'Comissão não encontrada') {
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

