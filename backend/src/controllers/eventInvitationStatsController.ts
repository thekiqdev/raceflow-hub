import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { hasRole } from '../services/userRolesService.js';
import { getEventById } from '../services/eventsService.js';
import { getEventInvitationStats } from '../services/eventInvitationStatsService.js';

/**
 * GET /api/admin/reports/events/:eventId/invitation-stats
 * GET /api/organizer/reports/events/:eventId/invitation-stats
 * Read-only aggregated invitation statistics for an event.
 */
export const getEventInvitationStatsController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  const { eventId } = req.params as { eventId: string };
  const event = await getEventById(eventId);

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
      message: 'Sem permissão para visualizar estatísticas deste evento',
    });
    return;
  }

  const data = await getEventInvitationStats(eventId);

  res.json({
    success: true,
    data,
  });
});
