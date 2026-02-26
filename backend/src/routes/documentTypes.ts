import { Router } from 'express';
import { getActiveDocumentTypesController } from '../controllers/documentTypesController.js';

const router = Router();

// Public endpoint - Get active document types (for runners)
router.get('/active', getActiveDocumentTypesController);

export default router;
