import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.js';

// Log security events
export const securityLogger = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const originalSend = res.send;

  res.send = function (body: any) {
    // Log unauthorized access attempts
    if (res.statusCode === 401 || res.statusCode === 403) {
      const logData = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        ip: req.ip || req.socket.remoteAddress,
        userAgent: req.get('user-agent'),
        userId: req.user?.id || 'anonymous',
        email: req.user?.email || 'anonymous',
      };

      console.warn('[SECURITY] Unauthorized access attempt:', JSON.stringify(logData));
    }

    // Log admin actions
    if (req.user && (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE')) {
      const logData = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        userId: req.user.id,
        email: req.user.email,
        ip: req.ip || req.socket.remoteAddress,
      };

      console.info('[SECURITY] Admin action:', JSON.stringify(logData));
    }

    return originalSend.call(this, body);
  };

  next();
};

