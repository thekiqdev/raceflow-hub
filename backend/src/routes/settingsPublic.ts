import { Router } from 'express';
import { getPublicBrandingController } from '../controllers/systemSettingsController.js';

const router = Router();

/**
 * Rotas públicas de configuração (sem autenticação).
 * Usado para branding (logo e nome da plataforma) no header, footer e emails.
 */
router.get('/branding', getPublicBrandingController);

export default router;
