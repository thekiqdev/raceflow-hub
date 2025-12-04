import { Request, Response, NextFunction } from 'express';

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
    // In development, allow disabling rate limit completely
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const disableRateLimit = process.env.DISABLE_RATE_LIMIT === 'true';
    
    if (isDevelopment && disableRateLimit) {
      return next(); // Skip rate limiting in development if disabled
    }
    
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
// In production, this should be much lower (5-10 requests per 15 minutes)
const isDevelopment = process.env.NODE_ENV !== 'production';
export const authRateLimiter = rateLimiter(15 * 60 * 1000, isDevelopment ? 100 : 5); // 100 in dev, 5 in prod

// Stricter rate limiter for write operations
export const writeRateLimiter = rateLimiter(15 * 60 * 1000, isDevelopment ? 1000 : 50); // 1000 in dev, 50 in prod

