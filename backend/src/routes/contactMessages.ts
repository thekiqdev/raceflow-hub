import { Router } from 'express';
import { optionalAuth, authenticate } from '../middleware/auth.js';
import {
  createContactMessageController,
  getContactMessagesController,
  getContactMessageByIdController,
  updateContactMessageController,
  getNewContactMessagesCountController,
} from '../controllers/contactMessagesController.js';

const router = Router();

// Public route - anyone can create a contact message
router.post('/', optionalAuth, createContactMessageController);

// Protected routes - require authentication
router.get('/', authenticate, getContactMessagesController);
router.get('/new-count', authenticate, getNewContactMessagesCountController);
router.get('/:id', authenticate, getContactMessageByIdController);
router.put('/:id', authenticate, updateContactMessageController);

export default router;

