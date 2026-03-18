import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.js';
import { query } from '../config/database.js';
import { hasRole } from '../services/userRolesService.js';

/**
 * Verifica se uma string é um UUID válido
 * @param str - String a ser verificada
 * @returns true se for UUID, false caso contrário
 */
function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// Check if user owns a resource by checking a specific field
export const requireResourceOwnership = (
  tableName: string,
  userIdField: string = 'user_id',
  resourceIdParam: string = 'id'
) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
        message: 'Authentication required',
      });
      return;
    }

    const resourceId = req.params[resourceIdParam];
    if (!resourceId) {
      res.status(400).json({
        success: false,
        error: 'Resource ID required',
      });
      return;
    }

    // Admins can access any resource
    const isAdmin = await hasRole(req.user.id, 'admin');
    if (isAdmin) {
      return next();
    }

    // Check ownership
    const result = await query(
      `SELECT ${userIdField} FROM ${tableName} WHERE id = $1`,
      [resourceId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Resource not found',
      });
      return;
    }

    const ownerId = result.rows[0][userIdField];
    if (ownerId !== req.user.id) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to access this resource',
      });
      return;
    }

    next();
  };
};

// Check if user is organizer of an event
export const requireEventOwnership = (eventIdParam: string = 'eventId') => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
        message: 'Authentication required',
      });
      return;
    }

    const eventId = req.params[eventIdParam] || req.body.event_id;
    if (!eventId) {
      res.status(400).json({
        success: false,
        error: 'Event ID required',
      });
      return;
    }

    // Admins can access any event
    const isAdmin = await hasRole(req.user.id, 'admin');
    if (isAdmin) {
      return next();
    }

    // Detectar se é UUID ou slug
    const isId = isUUID(eventId);
    const whereClause = isId ? 'id = $1' : 'slug = $1';
    
    // Check if user is organizer
    const result = await query(
      `SELECT organizer_id FROM events WHERE ${whereClause}`,
      [eventId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Event not found',
      });
      return;
    }

    const organizerId = result.rows[0].organizer_id;
    if (organizerId !== req.user.id) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You must be the organizer of this event',
      });
      return;
    }

    next();
  };
};





