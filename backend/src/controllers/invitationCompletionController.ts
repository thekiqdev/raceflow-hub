import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateCompletionRegistration } from '../services/leaderInvitationsService.js';

/**
 * GET /api/invitations/complete-registration/validate?token=xxx
 * Valida o token do link de completar cadastro (email do convite sem cadastro).
 * Público. Retorna dados mínimos para a tela: runnerName, eventTitle.
 */
export const validateCompletionTokenController = asyncHandler(async (req: Request, res: Response) => {
  const token = (req.query.token as string)?.trim();
  if (!token) {
    res.status(400).json({
      success: false,
      valid: false,
      error: 'Token é obrigatório.',
    });
    return;
  }

  const result = await validateCompletionRegistration(token);

  if (result.valid) {
    res.json({
      success: true,
      valid: true,
      runnerName: result.runnerName,
      eventTitle: result.eventTitle,
    });
  } else {
    res.status(400).json({
      success: false,
      valid: false,
      error: result.error,
    });
  }
});
