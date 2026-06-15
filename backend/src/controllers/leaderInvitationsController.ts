import { Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AuthRequest } from '../middleware/auth.js';
import {
  getAvailableInvitations,
  getLeaderInvitations,
  sendInvitationByCpf,
  resendInvitationEmail,
  getInvitationRegistrationForLeader,
} from '../services/leaderInvitationsService.js';
import { isValidCpfDigits } from '../utils/cpf.js';

// Runner data for pre-registration when CPF not found (same shape as createRunnerByOrganizer)
const runnerDataSchema = z.object({
  full_name: z.string().min(1, 'Nome completo é obrigatório'),
  birth_date: z.string().min(1, 'Data de nascimento é obrigatória'),
  city: z.string().min(1, 'Cidade é obrigatória'),
  gender: z.string().min(1, 'Sexo é obrigatório'),
  team: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
});

// Product selection (same shape as createRegistration) – opcional no envio do convite
const productSelectionSchema = z.object({
  product_id: z.string().uuid('ID do produto inválido'),
  variant_id: z.string().uuid('ID da variação inválido').optional(),
  attribute_selections: z.record(z.string(), z.string()).optional(),
});

// Validation schemas
const sendInvitationSchema = z.object({
  invitation_id: z.string().uuid('Invalid invitation ID'),
  runner_cpf: z.string().min(1, 'CPF é obrigatório').refine(
    (cpf) => isValidCpfDigits(cpf.replace(/\D/g, '')),
    { message: 'CPF inválido. Verifique os dígitos informados.' }
  ),
  runner_data: runnerDataSchema.optional(),
  // Etapa 1: líder pode pré-definir categoria, modalidade e kit (e variante) do convite
  category_id: z.string().uuid('ID da categoria inválido').optional(),
  modality_id: z.string().uuid('ID da modalidade inválido').optional().nullable(),
  kit_id: z.string().uuid('ID do kit inválido').optional().nullable(),
  product_selections: z.array(productSelectionSchema).optional(),
  // Etapa 2: true = corredor escolhe categoria/modalidade/kit; false = líder definiu (envia category_id, etc.)
  runner_chooses_category_modality_kit: z.boolean().optional(),
});

/**
 * Get available invitations for the authenticated leader
 */
export const getMyAvailableInvitationsController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    // Get leader ID from user
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Usuário não autenticado',
      });
      return;
    }
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
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Usuário não autenticado',
      });
      return;
    }
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

    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Usuário não autenticado',
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
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Usuário não autenticado',
      });
      return;
    }
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
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Usuário não autenticado',
      });
      return;
    }
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
        validation.data.runner_cpf,
        validation.data.runner_data,
        {
          category_id: validation.data.category_id,
          modality_id: validation.data.modality_id ?? undefined,
          kit_id: validation.data.kit_id ?? undefined,
          product_selections: validation.data.product_selections,
          runner_chooses_category_modality_kit: validation.data.runner_chooses_category_modality_kit,
        }
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

/**
 * Resend invitation email (convite must be sent and belong to the leader).
 * POST /group-leaders/me/invitations/:id/resend-email
 */
export const resendInvitationEmailController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Usuário não autenticado',
      });
      return;
    }
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
    const invitationId = req.params.id;
    if (!invitationId) {
      res.status(400).json({
        success: false,
        error: 'ID do convite é obrigatório',
        message: 'ID do convite é obrigatório',
      });
      return;
    }
    try {
      await resendInvitationEmail(leader.id, invitationId);
      res.json({
        success: true,
        message: 'Email reenviado com sucesso.',
      });
    } catch (error: any) {
      const statusCode =
        error.message?.includes('não encontrado') || error.message?.includes('não está disponível')
          ? 404
          : error.message?.includes('sem email')
            ? 400
            : 400;
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Erro ao reenviar email',
        message: error.message || 'Erro ao reenviar email',
      });
    }
  }
);

/**
 * Get registration (ingresso) for a sent invitation. Leader only.
 * GET /group-leaders/me/invitations/:id/registration
 */
export const getInvitationRegistrationController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Usuário não autenticado',
      });
      return;
    }
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
    const invitationId = req.params.id;
    if (!invitationId) {
      res.status(400).json({
        success: false,
        error: 'ID do convite é obrigatório',
        message: 'ID do convite é obrigatório',
      });
      return;
    }
    const data = await getInvitationRegistrationForLeader(leader.id, invitationId);
    if (!data) {
      res.status(404).json({
        success: false,
        error: 'Convite ou inscrição não encontrados',
        message: 'Convite ou inscrição não encontrados',
      });
      return;
    }
    res.json({
      success: true,
      data,
    });
  }
);

