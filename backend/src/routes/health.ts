import { Router, Request, Response } from 'express';
import { query } from '../config/database.js';
import { isEnvironmentFlagEnabled } from '../config/environment.js';

const router = Router();
// Somente flags públicas de disponibilidade, sem credenciais ou conteúdo do ambiente.
router.get('/checkout',(_req:Request,res:Response)=>{
  res.setHeader('Cache-Control','no-store');
  res.json({success:true,data:{
    checkout_enabled:isEnvironmentFlagEnabled('MULTI_REGISTRATION_CHECKOUT_ENABLED'),
    delivery_enabled:isEnvironmentFlagEnabled('CHECKOUT_DELIVERY_ENABLED'),
  }});
});

// Health check endpoint
router.get('/', async (_req: Request, res: Response) => {
  try {
    // Test database connection
    await query('SELECT 1');
    
    res.json({
      success: true,
      message: 'API is healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'API is unhealthy',
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
