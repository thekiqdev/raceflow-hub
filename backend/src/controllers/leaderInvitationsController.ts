import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AuthRequest } from '../middleware/auth.js';
import {
  getAvailableInvitations,
  getLeaderInvitations,
  sendInvitationByCpf,
} from '../services/leaderInvitationsService.js';

// Validation schemas
const sendInvitationSchema = z.object({
  invitation_id: z.string().uuid('Invalid invitation ID'),
  runner_cpf: z.string().min(1, 'CPF é obrigatório').refine(
    (cpf) => {
      // Remove non-numeric characters and check if has at least 11 digits
      const cleanCpf = cpf.replace(/\D/g, '');
      return cleanCpf.length >= 11;
    },
    {
      message: 'CPF deve conter pelo menos 11 dígitos numéricos',
    }
  ),
});

/**
 * Get available invitations for the authenticated leader
 */
export const getMyAvailableInvitationsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    // Get leader ID from user
    const { getGroupLeaderByUserId } = await import('../services/groupLeadersService.js');
    const leader = await getGroupLeaderByUserId(req.user.id);

    if (!leader) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Você não é um líder de grupo',
      });
      return;
    }

    const invitations = await getAvailableInvitations(leader.id);

    res.json({
      success: true,
      data: invitations,
    });
  }
);

/**
 * Get all invitations for the authenticated leader
 */
export const getMyInvitationsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    // Get leader ID from user
    const { getGroupLeaderByUserId } = await import('../services/groupLeadersService.js');
    const leader = await getGroupLeaderByUserId(req.user.id);

    if (!leader) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Você não é um líder de grupo',
      });
      return;
    }

    console.log(`🔍 [getMyInvitationsController] Buscando convites:`);
    console.log(`   - User ID: ${req.user.id}`);
    console.log(`   - Leader ID: ${leader.id}`);
    console.log(`   - Leader user_id: ${leader.user_id}`);
    
    // Debug: verificar todos os convites no banco
    const { query } = await import('../config/database.js');
    const allInvitationsDebug = await query(
      `SELECT li.id, li.leader_id, li.status, li.created_at, gl.user_id as leader_user_id
       FROM leader_invitations li
       LEFT JOIN group_leaders gl ON li.leader_id = gl.id
       ORDER BY li.created_at DESC
       LIMIT 10`
    );
    console.log(`📊 [getMyInvitationsController] Últimos 10 convites no banco:`, allInvitationsDebug.rows);
    
    const invitations = await getLeaderInvitations(leader.id);
    console.log(`📊 [getMyInvitationsController] Convites encontrados: ${invitations.length}`);
    if (invitations.length > 0) {
      console.log(`📋 [getMyInvitationsController] Primeiro convite:`, invitations[0]);
    }

    res.json({
      success: true,
      data: invitations,
    });
  }
);

/**
 * Send invitation to runner by CPF
 */
export const sendInvitationController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    console.log('📤 [sendInvitationController] Recebido:', {
      body: req.body,
      user_id: req.user.id,
    });

    const validation = sendInvitationSchema.safeParse(req.body);

    if (!validation.success) {
      console.error('❌ [sendInvitationController] Erro de validação:', validation.error.errors);
      res.status(400).json({
        success: false,
        error: 'Validation error',
        message: validation.error.errors[0].message,
        details: validation.error.errors,
      });
      return;
    }

    console.log('✅ [sendInvitationController] Validação OK:', validation.data);

    // Get leader ID from user
    const { getGroupLeaderByUserId } = await import('../services/groupLeadersService.js');
    const leader = await getGroupLeaderByUserId(req.user.id);

    if (!leader) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Você não é um líder de grupo',
      });
      return;
    }

    try {
      const invitation = await sendInvitationByCpf(
        leader.id,
        validation.data.invitation_id,
        validation.data.runner_cpf
      );

      res.json({
        success: true,
        data: invitation,
        message: 'Convite enviado com sucesso!',
      });
    } catch (error: any) {
      console.error('❌ [sendInvitationController] Erro:', error.message);
      
      // Determine status code based on error type
      let statusCode = 400;
      if (error.message.includes('já possui uma inscrição')) {
        statusCode = 409; // Conflict
      } else if (error.message.includes('não encontrado')) {
        statusCode = 404; // Not Found
      }
      
      res.status(statusCode).json({
        success: false,
        error: 'Error',
        message: error.message,
        code: error.message.includes('já possui uma inscrição') ? 'RUNNER_ALREADY_REGISTERED' : 'INVITATION_ERROR',
      });
    }
  }
);

