import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getNotificationTemplatesController,
  getNotificationTemplateByIdController,
  getNotificationTemplateByKeyController,
  createNotificationTemplateController,
  updateNotificationTemplateController,
  deleteNotificationTemplateController,
  initializeDefaultTemplatesController,
} from '../controllers/notificationTemplatesController.js';

const router = Router();

// All routes require authentication and admin role (checked in controllers)
router.get('/', authenticate, getNotificationTemplatesController);
router.get('/key/:templateKey', authenticate, getNotificationTemplateByKeyController);
router.get('/:id', authenticate, getNotificationTemplateByIdController);
router.post('/', authenticate, createNotificationTemplateController);
router.post('/initialize', authenticate, initializeDefaultTemplatesController);
router.put('/:id', authenticate, updateNotificationTemplateController);
router.delete('/:id', authenticate, deleteNotificationTemplateController);

export default router;

