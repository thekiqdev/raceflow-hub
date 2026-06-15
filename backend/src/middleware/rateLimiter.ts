import { Request, Response, NextFunction } from 'express';
import { recordCpfLookupMetric } from '../services/cpfAuditService.js';

// Simple in-memory rate limiter
// For production, use Redis-based rate limiter
interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  Object.keys(store).forEach((key) => {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  });
}, 5 * 60 * 1000);

export const rateLimiter = (
  windowMs: number = 15 * 60 * 1000, // 15 minutes
  maxRequests: number = 100
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Rate limiting is DISABLED - system supports many users without limits
    // To re-enable, set ENABLE_RATE_LIMIT=true in environment variables
    const enableRateLimit = process.env.ENABLE_RATE_LIMIT === 'true';
    
    if (!enableRateLimit) {
      return next(); // Skip rate limiting - no limits
    }
    
    // Rate limiting logic (only active if ENABLE_RATE_LIMIT=true)
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    if (!store[key] || store[key].resetTime < now) {
      store[key] = {
        count: 1,
        resetTime: now + windowMs,
      };
      return next();
    }

    if (store[key].count >= maxRequests) {
      const secondsRemaining = Math.ceil((store[key].resetTime - now) / 1000);
      console.warn(`Rate limit exceeded for ${key}: ${store[key].count}/${maxRequests} requests`);
      
      res.status(429).json({
        success: false,
        error: 'Too many requests',
        message: `Rate limit exceeded. Please try again after ${secondsRemaining} seconds.`,
        retryAfter: secondsRemaining,
      });
      return;
    }

    store[key].count++;
    next();
  };
};

// Stricter rate limiter for authentication endpoints
// Increased limit for development (was 5, now 100)
// In production, increased to 100 to allow for testing and multiple users (was 5)
// Note: For production with many users, consider using Redis-based rate limiter
const isDevelopment = process.env.NODE_ENV !== 'production';
export const authRateLimiter = rateLimiter(15 * 60 * 1000, isDevelopment ? 100 : 100); // 100 in dev, 100 in prod

// Rate limiter for write operations (POST, PUT, DELETE, PATCH)
// Increased limits to allow normal user operations (create events, registrations, etc.)
export const writeRateLimiter = rateLimiter(15 * 60 * 1000, isDevelopment ? 1000 : 500); // 1000 in dev, 500 in prod

/** Store separado para POST /api/auth/lookup-cpf — sempre ativo (não depende de ENABLE_RATE_LIMIT). */
const cpfLookupStore: RateLimitStore = {};

setInterval(() => {
  const now = Date.now();
  Object.keys(cpfLookupStore).forEach((key) => {
    if (cpfLookupStore[key].resetTime < now) {
      delete cpfLookupStore[key];
    }
  });
}, 5 * 60 * 1000);

/**
 * Limite defensivo por IP na consulta de CPF (abuso / scraping).
 * `CPF_LOOKUP_MAX_PER_IP` (default 60 por janela), `CPF_LOOKUP_WINDOW_MS` (default 15 min).
 * Se `CPF_LOOKUP_MAX_PER_IP=0`, desliga o limite deste endpoint.
 */
export const cpfLookupRateLimiter = (req: Request, res: Response, next: NextFunction) => {
  const maxRequests = parseInt(process.env.CPF_LOOKUP_MAX_PER_IP || '60', 10);
  const windowMs = parseInt(process.env.CPF_LOOKUP_WINDOW_MS || '900000', 10);
  if (!Number.isFinite(maxRequests) || maxRequests <= 0) {
    return next();
  }
  const safeWindow = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 900000;

  const key = `cpf_lookup:${req.ip || req.socket.remoteAddress || 'unknown'}`;
  const now = Date.now();

  if (!cpfLookupStore[key] || cpfLookupStore[key].resetTime < now) {
    cpfLookupStore[key] = {
      count: 1,
      resetTime: now + safeWindow,
    };
    return next();
  }

  if (cpfLookupStore[key].count >= maxRequests) {
    const secondsRemaining = Math.ceil((cpfLookupStore[key].resetTime - now) / 1000);
    console.warn(`[cpf-lookup] rate limit exceeded: ${key}`);
    const rawCpf = typeof (req.body as { cpf?: string })?.cpf === 'string' ? (req.body as { cpf: string }).cpf : undefined;
    void recordCpfLookupMetric({
      cpf: rawCpf,
      resultCode: 'RATE_LIMITED',
      source: 'lookup-cpf',
      metadata: { retry_after_seconds: secondsRemaining },
    });
    res.status(429).json({
      success: false,
      message: 'CPF inválido',
      code: 'RATE_LIMITED',
      meta: { retry_after_seconds: secondsRemaining },
    });
    return;
  }

  cpfLookupStore[key].count++;
  next();
};

