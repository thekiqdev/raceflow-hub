import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  pricing?: unknown;
  details?: unknown;
}

function applyCorsOnError(req: Request, res: Response) {
  // Em 4xx/5xx o proxy às vezes omite ACAO; o browser interpreta como CORS e esconde o JSON real.
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  if (!origin) return;
  const allowed = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!allowed.includes(origin)) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error('❌ Error Handler:', {
    message: err.message,
    stack: err.stack,
    statusCode: err.statusCode,
    code: err.code,
    name: err.name,
  });

  applyCorsOnError(req, res);

  // Default error
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  if (err.code === 'REGISTRATION_PRICE_CHANGED' && err.pricing) {
    res.status(409).json({ success: false, error: message, code: err.code, pricing: err.pricing });
    return;
  }
  if (err.code === 'CT001') {
    res.status(409).json({ success: false, error: message });
    return;
  }

  // PostgreSQL errors
  if (err.code === '23505') {
    // Unique violation
    res.status(409).json({
      success: false,
      error: 'Duplicate entry',
      message: 'This record already exists',
    });
    return;
  }

  if (err.code === '23503') {
    // Foreign key violation
    res.status(400).json({
      success: false,
      error: 'Foreign key violation',
      message: 'Referenced record does not exist',
    });
    return;
  }

  if (err.code === '23502') {
    // Not null violation
    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: 'Required field is missing',
    });
    return;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({
      success: false,
      error: 'Invalid token',
      message: 'Authentication token is invalid',
    });
    return;
  }

  if (err.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      error: 'Token expired',
      message: 'Authentication token has expired',
    });
    return;
  }

  // Send error response
  res.status(statusCode).json({
    success: false,
    error: message,
    ...(err.details !== undefined ? { details: err.details } : {}),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

// Async handler wrapper to catch errors in async routes
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
