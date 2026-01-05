import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getFormConfigurationsController,
  getFormFieldConfigurationByIdController,
  createFormFieldConfigurationController,
  updateFormFieldConfigurationController,
  deleteFormFieldConfigurationController,
  reorderFormFieldsController,
  bulkUpdateFormConfigurationsController,
  getPublicFormConfigurationsController,
} from '../controllers/formConfigurationsController.js';

const router = Router();

// Public route - anyone can get form configurations (for rendering forms)
router.get('/public/:formType', getPublicFormConfigurationsController);

// Protected routes - require authentication and admin role (checked in controllers)
router.get('/:formType', authenticate, getFormConfigurationsController);
router.get('/:formType/:id', authenticate, getFormFieldConfigurationByIdController);
router.post('/', authenticate, createFormFieldConfigurationController);
router.put('/:id', authenticate, updateFormFieldConfigurationController);
router.delete('/:id', authenticate, deleteFormFieldConfigurationController);
router.put('/:formType/reorder', authenticate, reorderFormFieldsController);
router.put('/:formType/bulk-update', authenticate, bulkUpdateFormConfigurationsController);

export default router;

