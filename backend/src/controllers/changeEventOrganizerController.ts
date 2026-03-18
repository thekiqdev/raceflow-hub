/**
 * Controller: alteração de organizador de evento (migração)
 * Etapa 2: estrutura base — apenas admin; chama changeEventOrganizerService.
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  executeChangeEventOrganizer,
  executeRollbackMigration,
  getMigrationLogById,
  getMigrationLogsByEventId,
} from '../services/changeEventOrganizerService.js';

/**
 * POST /api/admin/events/:eventId/change-organizer
 * Body: { new_organizer_id: string, dry_run?: boolean }
 * Requer: autenticação + role admin (via adminRoutes).
 */
export const changeEventOrganizerController = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
        message: 'Authentication required',
      });
      return;
    }

    const eventId = req.params.eventId as string;
    const body = req.body as { new_organizer_id?: string; dry_run?: boolean };
    const newOrganizerId = body?.new_organizer_id;
    const dryRun = Boolean(body?.dry_run);

    if (!eventId) {
      res.status(400).json({
        success: false,
        error: 'eventId is required',
        message: 'ID do evento é obrigatório',
      });
      return;
    }

    if (!newOrganizerId || typeof newOrganizerId !== 'string') {
      res.status(400).json({
        success: false,
        error: 'new_organizer_id is required',
        message: 'new_organizer_id é obrigatório no body',
      });
      return;
    }

    const result = await executeChangeEventOrganizer(eventId, newOrganizerId, {
      dry_run: dryRun,
      executor_id: req.user.id,
    });

    const success = result.status === 'success' || result.status === 'skipped';
    res.status(success ? 200 : 409).json({
      success,
      status: result.status,
      migration_id: result.migration_id,
      event_id: result.event_id,
      organizer_from: result.organizer_from,
      organizer_to: result.organizer_to,
      executed_by: result.executed_by,
      message: result.message,
      idempotent: result.idempotent,
      dry_run: result.dry_run,
      summary: result.summary,
      leaders_resolved: result.leaders_resolved,
      invitations_updated: result.invitations_updated,
      coupons_migrated: result.coupons_migrated,
      contact_messages_updated: result.contact_messages_updated,
      validation_errors: result.validation_errors,
      debug: result.debug,
    });
  }
);

/**
 * GET /api/admin/events/:eventId/migration-log
 * Retorna o histórico de execuções de migração do evento (Etapa 9 — auditoria).
 */
export const getEventMigrationLogsController = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<void> => {
    const eventId = req.params.eventId as string;
    if (!eventId) {
      res.status(400).json({
        success: false,
        error: 'eventId is required',
        message: 'ID do evento é obrigatório',
      });
      return;
    }
    const logs = await getMigrationLogsByEventId(eventId);
    res.status(200).json({ success: true, event_id: eventId, logs });
  }
);

/**
 * GET /api/admin/migration-log/:migrationId
 * Retorna um registro de log de migração pelo id (migration_id) — Etapa 9.
 */
export const getMigrationLogByIdController = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<void> => {
    const migrationId = req.params.migrationId as string;
    if (!migrationId) {
      res.status(400).json({
        success: false,
        error: 'migrationId is required',
        message: 'ID da migração é obrigatório',
      });
      return;
    }
    const log = await getMigrationLogById(migrationId);
    if (!log) {
      res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Registro de migração não encontrado',
      });
      return;
    }
    res.status(200).json({ success: true, log });
  }
);

/**
 * POST /api/admin/migration-rollback
 * Body: { migration_id: string }
 * Reverte uma migração bem-sucedida (Etapa 10). Só permitido se não houver inscrições novas e dentro da janela (48h).
 */
export const rollbackMigrationController = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
        message: 'Authentication required',
      });
      return;
    }

    const body = req.body as { migration_id?: string };
    const migrationId = body?.migration_id;
    if (!migrationId || typeof migrationId !== 'string') {
      res.status(400).json({
        success: false,
        error: 'migration_id is required',
        message: 'migration_id é obrigatório no body',
      });
      return;
    }

    const result = await executeRollbackMigration(migrationId, req.user.id);

    if (result.ok) {
      res.status(200).json({
        success: true,
        rollback_id: result.rollback_id,
        event_id: result.event_id,
        organizer_restored: result.organizer_restored,
        message: result.message,
      });
      return;
    }

    const status =
      result.reason === 'not_found'
        ? 404
        : result.reason === 'has_new_registrations' || result.reason === 'window_expired' || result.reason === 'not_success'
          ? 409
          : 400;
    res.status(status).json({
      success: false,
      reason: result.reason,
      message: result.message,
    });
  }
);
