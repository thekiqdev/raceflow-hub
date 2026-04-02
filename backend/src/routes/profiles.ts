import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getOwnProfile,
  updateOwnProfile,
  getPublicProfileByCpfController,
  searchRunnerByCpfForOrganizerController,
} from '../controllers/profilesController.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.get('/me', getOwnProfile);
router.put('/me', updateOwnProfile);
router.get('/organizer/search-by-cpf', searchRunnerByCpfForOrganizerController);
router.get('/search-by-cpf', getPublicProfileByCpfController);

export default router;





