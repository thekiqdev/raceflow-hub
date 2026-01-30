import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { adminCancelCommission, getCommissionByRegistrationId } from '../services/commissionsService.js';

/**
 * DELETE /api/admin/commissions/:commissionId
 * Remove (cancela) uma comissão gerada. Somente admin.
 * Funciona para comissão pending ou paid; desconta o valor do total do líder e desatrela o cupom da inscrição.
 */
export const removeCommissionController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { commissionId } = req.params;
  if (!commissionId) {
    res.status(400).json({
      success: false,
      error: 'Validation Error',
      message: 'commissionId é obrigatório',
    });
    return;
  }

  try {
    const cancelled = await adminCancelCommission(commissionId);
    res.status(200).json({
      success: true,
      data: cancelled,
      message: 'Comissão removida com sucesso',
    });
  } catch (err: any) {
    if (err.message === 'Commission not found') {
      res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Comissão não encontrada',
      });
      return;
    }
    throw err;
  }
});

/**
 * GET /api/admin/registrations/:registrationId/commission
 * Get the leader commission linked to this registration (if any). Admin only.
 */
export const getRegistrationCommissionController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { registrationId } = req.params;
  if (!registrationId) {
    res.status(400).json({ success: false, error: 'Validation Error', message: 'registrationId é obrigatório' });
    return;
  }

  const commission = await getCommissionByRegistrationId(registrationId);
  if (!commission) {
    res.status(404).json({ success: false, error: 'Not found', message: 'Nenhuma comissão vinculada a esta inscrição' });
    return;
  }

  res.status(200).json({
    success: true,
    data: commission,
  });
});
