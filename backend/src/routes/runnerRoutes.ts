import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/authorization.js';
import {
  getRunnerResultsController,
  getRunnerResultsStatsController,
  getRunnerResultByEventController,
  getRunnerStatsController,
  getRunnerAchievementsController,
  getRunnerPaymentsController,
} from '../controllers/runnerResultsController.js';

const router = Router();

// All routes require authentication and runner role
router.use(authenticate);
router.use(requireRole('runner'));

// Results endpoints
router.get('/results', getRunnerResultsController);
router.get('/results/stats', getRunnerResultsStatsController);
router.get('/results/:event_id', getRunnerResultByEventController);

// Stats and achievements endpoints
router.get('/stats', getRunnerStatsController);
router.get('/achievements', getRunnerAchievementsController);

// Payments endpoint
router.get('/payments', getRunnerPaymentsController);

export default router;

