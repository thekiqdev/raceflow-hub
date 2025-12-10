import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { uploadBannerController, uploadRegulationController, deleteFileController } from '../controllers/uploadController.js';
import { uploadBanner, uploadRegulation } from '../middleware/upload.js';

const router = Router();

// All upload routes require authentication
router.use(authenticate);

// Upload banner image
router.post('/banner', uploadBanner.single('file'), uploadBannerController);

// Upload regulation PDF
router.post('/regulation', uploadRegulation.single('file'), uploadRegulationController);

// Delete uploaded file
router.delete('/:type/:filename', deleteFileController);

export default router;




