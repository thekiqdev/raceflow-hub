import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getLeadersInvitationsGrantedByEvent,
  type LeadersInvitationsGrantedRow,
} from '../services/leadersInvitationsReportService.js';

/**
 * GET /api/admin/reports/leaders-invitations-granted/:eventId
 * Read-only: counts invitations per leader for the event.
 */
export const getLeadersInvitationsGrantedByEventController = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { eventId } = req.params as unknown as { eventId: string };
    const data: LeadersInvitationsGrantedRow[] = await getLeadersInvitationsGrantedByEvent(eventId);

    res.json({
      success: true,
      data,
    });
  }
);

