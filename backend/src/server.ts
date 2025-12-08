import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/errorHandler.js';
import { securityLogger } from './middleware/securityLogger.js';
import { rateLimiter, writeRateLimiter } from './middleware/rateLimiter.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import eventsRouter from './routes/events.js';
import profilesRouter from './routes/profiles.js';
import registrationsRouter from './routes/registrations.js';
import homePageSettingsRouter from './routes/homePageSettings.js';
import adminRouter from './routes/adminRoutes.js';
import organizerRouter from './routes/organizerRoutes.js';
import runnerRouter from './routes/runnerRoutes.js';
import uploadRouter from './routes/upload.js';

// Load environment variables
dotenv.config();

const app: Express = express();
const PORT = process.env.API_PORT || 3001;

// CORS - Must be before other middleware to handle preflight requests
// Allow multiple origins for development
const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
  : ['http://localhost:5173', 'http://localhost:8080', 'http://localhost:3000'];

const isProduction = process.env.NODE_ENV === 'production';

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      if (isProduction) {
        // Em produção, realmente bloquear origens não permitidas
        console.warn(`CORS: Blocked origin ${origin} in production`);
        callback(new Error('Not allowed by CORS'), false);
      } else {
        // Em desenvolvimento, permitir tudo para facilitar testes
        console.warn(`CORS: Allowing origin ${origin} in development`);
        callback(null, true);
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Security middleware
app.use(securityLogger);

// Rate limiting
// NOTE: Auth endpoints have NO rate limiting to ensure login is always available
// app.use('/api/auth', authRateLimiter); // DISABLED - Login must always be available

// For events and registrations, use different limits for read vs write operations
// Increased limits to allow normal user operations without blocking
const isDevelopment = process.env.NODE_ENV !== 'production';
const readRateLimiter = rateLimiter(15 * 60 * 1000, isDevelopment ? 1000 : 1000); // 1000 in dev, 1000 in prod

// Middleware that applies different rate limits for GET vs write operations
const smartRateLimiter = (req: Request, res: Response, next: NextFunction) => {
  // Only apply strict rate limiting to write operations
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    return writeRateLimiter(req, res, next);
  }
  // Use lenient rate limiting for GET requests
  return readRateLimiter(req, res, next);
};

app.use('/api/events', smartRateLimiter);
app.use('/api/registrations', smartRateLimiter);
// General rate limiting for all other routes - increased limit for normal operations
app.use(rateLimiter(15 * 60 * 1000, isDevelopment ? 1000 : 1000)); // 1000 in dev, 1000 in prod

// Body parsing
app.use(express.json({ limit: '10mb' })); // Limit body size
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req: Request, _res: Response, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`, {
    ip: req.ip,
    body: req.method === 'POST' ? req.body : undefined,
  });
  next();
});

// Routes
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/events', eventsRouter);
app.use('/api/profiles', profilesRouter);
app.use('/api/registrations', registrationsRouter);
app.use('/api/home-page-settings', homePageSettingsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/organizer', organizerRouter);
app.use('/api/runner', runnerRouter);
app.use('/api/upload', uploadRouter);

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'RaceFlow Hub API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      auth: {
        register: '/api/auth/register',
        login: '/api/auth/login',
        me: '/api/auth/me',
        logout: '/api/auth/logout',
      },
      events: '/api/events',
      profiles: '/api/profiles',
      registrations: '/api/registrations',
      homePageSettings: '/api/home-page-settings',
    },
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;

