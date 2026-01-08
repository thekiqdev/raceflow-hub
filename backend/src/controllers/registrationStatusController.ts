import { Request, Response } from 'express';
import { updateRegistrationStatuses, updateEventRegistrationStatus } from '../services/registrationStatusService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

/**
 * Endpoint administrativo para atualizar manualmente todos os status de inscrições
 * POST /api/admin/update-registration-statuses
 */
export const updateAllRegistrationStatusesController = asyncHandler(
  async (_req: Request, res: Response) => {
    try {
      const updatedCount = await updateRegistrationStatuses();
      
      return res.json({
        success: true,
        message: `Status de inscrições atualizado com sucesso`,
        data: {
          updatedCount,
        },
      });
    } catch (error: any) {
      console.error('Erro ao atualizar status de inscrições:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao atualizar status de inscrições',
        message: error.message || 'Erro desconhecido',
      });
    }
  }
);

/**
 * Endpoint administrativo para atualizar status de inscrições de um evento específico
 * POST /api/admin/events/:eventId/update-registration-status
 */
export const updateEventRegistrationStatusController = asyncHandler(
  async (req: Request, res: Response) => {
    try {
      const { eventId } = req.params;
      
      if (!eventId) {
        return res.status(400).json({
          success: false,
          error: 'ID do evento é obrigatório',
        });
      }

      const updatedStatus = await updateEventRegistrationStatus(eventId);
      
      if (updatedStatus === null) {
        return res.status(404).json({
          success: false,
          error: 'Evento não encontrado ou modo automático não está ativado',
        });
      }
      
      return res.json({
        success: true,
        message: `Status de inscrições do evento atualizado com sucesso`,
        data: {
          eventId,
          registrationStatus: updatedStatus,
        },
      });
    } catch (error: any) {
      console.error('Erro ao atualizar status de inscrições do evento:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao atualizar status de inscrições do evento',
        message: error.message || 'Erro desconhecido',
      });
    }
  }
);
