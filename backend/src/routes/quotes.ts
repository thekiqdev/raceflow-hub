import { Router } from 'express';
import { optionalAuth, authenticate } from '../middleware/auth.js';
import {
  createQuoteController,
  getQuotesController,
  getQuoteByIdController,
  updateQuoteController,
  getNewQuotesCountController,
} from '../controllers/quotesController.js';

const router = Router();

// Public route - anyone can create a quote
router.post('/', optionalAuth, createQuoteController);

// Admin routes - require authentication and admin role
router.get('/', authenticate, getQuotesController);
router.get('/new-count', authenticate, getNewQuotesCountController);
router.get('/:id', authenticate, getQuoteByIdController);
router.put('/:id', authenticate, updateQuoteController);

export default router;

