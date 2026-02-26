import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
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
import webhooksRouter from './routes/webhooks.js';
import groupLeadersRouter from './routes/groupLeaders.js';
import couponsRouter from './routes/coupons.js';
import modalitiesRouter from './routes/modalities.js';
import categoriesRouter from './routes/categories.js';
import quotesRouter from './routes/quotes.js';
import contactMessagesRouter from './routes/contactMessages.js';
import formConfigurationsRouter from './routes/formConfigurations.js';
import notificationTemplatesRouter from './routes/notificationTemplates.js';
import documentTypesRouter from './routes/documentTypes.js';
import kitCategoriesRouter from './routes/kitCategories.js';
import ogRouter from './routes/og.js';
import { updateRegistrationStatuses } from './services/registrationStatusService.js';
import { cancelExpiredRegistrations } from './services/expiredRegistrationsService.js';

// Load environment variables
// Try to load from backend/.env explicitly
dotenv.config({ path: '.env' });
dotenv.config({ path: '../.env' }); // Fallback to root .env

// Debug: Log if Asaas key is loaded
if (process.env.ASAAS_API_KEY) {
  console.log('✅ ASAAS_API_KEY carregada (tamanho:', process.env.ASAAS_API_KEY.length, ')');
} else {
  console.warn('⚠️ ASAAS_API_KEY não encontrada nas variáveis de ambiente');
}

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
    // Always allow requests with no origin (webhooks, mobile apps, curl requests)
    if (!origin) {
      console.log('🌐 CORS: Request sem origin permitida (webhook ou app mobile)');
      return callback(null, true);
    }
    
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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'asaas-access-token', 'x-asaas-access-token'],
}));

// Force HTTPS in production (trust proxy for Easypanel)
if (isProduction) {
  app.set('trust proxy', 1); // Trust first proxy (Easypanel load balancer)
  
  // Redirect HTTP to HTTPS
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.header('x-forwarded-proto') !== 'https' && req.header('host')?.includes('cronoteam.com.br')) {
      return res.redirect(`https://${req.header('host')}${req.url}`);
    }
    next();
  });
}

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
// Webhooks should NOT have rate limiting (external services need to call them)
// General rate limiting for all other routes - increased limit for normal operations
app.use((req: Request, res: Response, next: NextFunction) => {
  // Skip rate limiting for webhooks
  if (req.path.startsWith('/api/webhooks')) {
    return next();
  }
  return rateLimiter(15 * 60 * 1000, isDevelopment ? 1000 : 1000)(req, res, next);
});

// Body parsing - MUST be before request logging to parse body
app.use(express.json({ limit: '10mb' })); // Limit body size
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Log body parsing for webhooks
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api/webhooks') && req.method === 'POST') {
    console.log('📦 Body parsing middleware executado para webhook');
    console.log('📦 Body após parsing:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// Serve static files (uploads)
// Get __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files with proper headers for PDFs
// Use environment variable if set, otherwise default to /app/uploads for production
const isProductionEnv = process.env.NODE_ENV === 'production';
const defaultUploadsStaticDir = isProductionEnv ? '/app/uploads' : path.join(__dirname, '../uploads');
const uploadsStaticDir = process.env.UPLOADS_DIR || defaultUploadsStaticDir;

console.log('📁 Static files configuration:', {
  UPLOADS_DIR: process.env.UPLOADS_DIR,
  NODE_ENV: process.env.NODE_ENV,
  isProductionEnv,
  defaultUploadsStaticDir,
  uploadsStaticDir,
  __dirname,
});

// Verify uploads directory exists and is accessible
if (!fs.existsSync(uploadsStaticDir)) {
  console.error(`❌ CRITICAL: Uploads directory does not exist: ${uploadsStaticDir}`);
  console.error('❌ This will cause all file uploads to fail!');
  console.error('❌ Please configure UPLOADS_DIR environment variable or ensure the directory exists.');
} else {
  const stats = fs.statSync(uploadsStaticDir);
  console.log(`✅ Uploads directory exists: ${uploadsStaticDir} (isDirectory: ${stats.isDirectory()})`);
  
  // Check if it's writable
  try {
    const testFile = path.join(uploadsStaticDir, '.test-write');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    console.log(`✅ Uploads directory is writable`);
  } catch (error) {
    console.error(`❌ CRITICAL: Uploads directory is NOT writable: ${uploadsStaticDir}`, error);
  }
}

// Serve static files with error handling middleware
app.use('/uploads', (req: Request, _res: Response, next: NextFunction) => {
  // Log requests for debugging
  const filePath = path.join(uploadsStaticDir, req.path);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    console.error('❌ This may indicate the volume is not mounted correctly');
    console.error('❌ Request path:', req.path);
    console.error('❌ Uploads directory:', uploadsStaticDir);
  }
  next();
}, express.static(uploadsStaticDir, {
  setHeaders: (res, filePath) => {
    // Set proper Content-Type for PDFs
    if (filePath.endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="' + path.basename(filePath) + '"');
    }
  }
}));

// Request logging middleware - AFTER body parsing to see parsed body
app.use((req: Request, _res: Response, next) => {
  // Special logging for webhooks
  if (req.path.startsWith('/api/webhooks')) {
    console.log('🔔 ============================================');
    console.log('🔔 WEBHOOK REQUEST DETECTED');
    console.log('🔔 ============================================');
    console.log('📋 Timestamp:', new Date().toISOString());
    console.log('📋 Method:', req.method);
    console.log('📋 Path:', req.path);
    console.log('📋 URL:', req.url);
    console.log('📋 IP:', req.ip);
    console.log('📋 User-Agent:', req.headers['user-agent']);
    console.log('📋 Headers:', JSON.stringify(req.headers, null, 2));
    console.log('📋 Body (parsed):', JSON.stringify(req.body, null, 2));
    console.log('📋 Body type:', typeof req.body);
    console.log('📋 Body keys:', req.body ? Object.keys(req.body) : 'null');
  }
  
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`, {
    ip: req.ip,
    body: req.method === 'POST' ? req.body : undefined,
  });
  next();
});

// Routes
// Webhooks must be registered before authenticated routes (they use their own auth)
app.use('/api/webhooks', webhooksRouter);
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/quotes', quotesRouter);
app.use('/api/contact-messages', contactMessagesRouter);
app.use('/api/form-configurations', formConfigurationsRouter);
app.use('/api/notification-templates', notificationTemplatesRouter);
app.use('/api/document-types', documentTypesRouter);
app.use('/api/group-leaders', groupLeadersRouter);
app.use('/api/events', eventsRouter);
app.use('/api/profiles', profilesRouter);
app.use('/api/registrations', registrationsRouter);
app.use('/api/home-page-settings', homePageSettingsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/organizer', organizerRouter);
app.use('/api/runner', runnerRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/coupons', couponsRouter);
app.use('/api/modalities', modalitiesRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/og', ogRouter);
app.use('/api', kitCategoriesRouter);

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
  
  // Schedule automatic registration status updates
  // Run every 5 minutes (300000 ms)
  const UPDATE_INTERVAL_MS = parseInt(process.env.REGISTRATION_STATUS_UPDATE_INTERVAL_MS || '300000', 10);
  
  console.log(`⏰ Configurando atualização automática de status de inscrições a cada ${UPDATE_INTERVAL_MS / 1000} segundos...`);
  
  // Run immediately on startup
  updateRegistrationStatuses().catch((error) => {
    console.error('❌ Erro na atualização inicial de status de inscrições:', error);
  });
  
  // Schedule periodic updates
  setInterval(() => {
    console.log('🔄 Executando atualização automática de status de inscrições...');
    updateRegistrationStatuses().catch((error) => {
      console.error('❌ Erro na atualização automática de status de inscrições:', error);
    });
  }, UPDATE_INTERVAL_MS);
  
  console.log(`✅ Atualização automática de status de inscrições configurada`);

  // Schedule automatic cancellation of expired unpaid registrations
  // Run every 5 minutes (300000 ms) - same interval as registration status updates
  const EXPIRED_REGISTRATIONS_CHECK_INTERVAL_MS = parseInt(process.env.EXPIRED_REGISTRATIONS_CHECK_INTERVAL_MS || '300000', 10);
  const EXPIRATION_MINUTES = parseInt(process.env.REGISTRATION_EXPIRATION_MINUTES || '20', 10);
  
  console.log(`⏰ Configurando cancelamento automático de inscrições não pagas após ${EXPIRATION_MINUTES} minutos...`);
  console.log(`🔄 Verificação a cada ${EXPIRED_REGISTRATIONS_CHECK_INTERVAL_MS / 1000} segundos...`);
  
  // Run immediately on startup
  cancelExpiredRegistrations(EXPIRATION_MINUTES).catch((error) => {
    console.error('❌ Erro no cancelamento inicial de inscrições expiradas:', error);
  });
  
  // Schedule periodic checks
  setInterval(() => {
    console.log('🔄 Executando verificação de inscrições expiradas...');
    cancelExpiredRegistrations(EXPIRATION_MINUTES).catch((error) => {
      console.error('❌ Erro no cancelamento automático de inscrições expiradas:', error);
    });
  }, EXPIRED_REGISTRATIONS_CHECK_INTERVAL_MS);
  
  console.log(`✅ Cancelamento automático de inscrições expiradas configurado`);
});

export default app;

