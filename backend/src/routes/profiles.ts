import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getOwnProfile, updateOwnProfile, getPublicProfileByCpfController } from '../controllers/profilesController.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.get('/me', getOwnProfile);
router.put('/me', updateOwnProfile);
router.get('/search-by-cpf', getPublicProfileByCpfController);

export default router;





