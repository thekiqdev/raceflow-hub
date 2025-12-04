import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export const errorHandler = (
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error('Error:', err);

  // Default error
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

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
  }

  // Send error response
  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

// Async handler wrapper to catch errors in async routes
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

