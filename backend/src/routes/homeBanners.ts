import { Router } from 'express';
import { getActiveBannersController } from '../controllers/homeBannersController.js';

const router = Router();

/** GET /api/home-banners – público: lista banners ativos para o slider da home */
router.get('/', getActiveBannersController);

export default router;
