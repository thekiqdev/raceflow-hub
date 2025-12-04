import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.js';
import { hasRole as checkRole, getUserRoles } from '../services/userRolesService.js';
import { isEventOrganizer } from '../services/eventsService.js';
import { AppRole } from '../types/index.js';

// Check if user has specific role
export const requireRole = (role: AppRole) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
        message: 'Authentication required',
      });
      return;
    }

    const userHasRole = await checkRole(req.user.id, role);

    if (!userHasRole) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: `Required role: ${role}`,
      });
      return;
    }

    next();
  };
};

// Check if user has any of the specified roles
export const requireAnyRole = (roles: AppRole[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
        message: 'Authentication required',
      });
      return;
    }

    const userRoles = await getUserRoles(req.user.id);
    const hasAnyRole = roles.some((role) => userRoles.includes(role));

    if (!hasAnyRole) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: `Required one of roles: ${roles.join(', ')}`,
      });
      return;
    }

    next();
  };
};

// Check if user is organizer of event
export const requireEventOrganizer = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Not authenticated',
      message: 'Authentication required',
    });
  }

  const eventId = req.params.eventId || req.body.event_id;
  if (!eventId) {
    res.status(400).json({
      success: false,
      error: 'Event ID required',
    });
    return;
  }

  const isOrganizer = await isEventOrganizer(eventId, req.user.id);
  const isAdmin = await checkRole(req.user.id, 'admin');

  if (!isOrganizer && !isAdmin) {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'You must be the organizer of this event',
    });
    return;
  }

  next();
  return;
};

// Check if user owns resource (by user_id field)
export const requireOwnership = (_userIdField: string = 'user_id') => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
        message: 'Authentication required',
      });
      return;
    }

    const resourceId = req.params.id;
    if (!resourceId) {
    res.status(400).json({
      success: false,
      error: 'Resource ID required',
    });
    return;
  }

    // This will be implemented per resource type
    // For now, we'll check in the controller
    next();
  };
};

