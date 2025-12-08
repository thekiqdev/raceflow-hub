import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { uploadBannerController, uploadRegulationController, deleteFileController } from '../controllers/uploadController.js';
import path from 'path';

const router = express.Router();

// Upload routes
router.post('/banner', authenticate, uploadBannerController);
router.post('/regulation', authenticate, uploadRegulationController);
router.delete('/file', authenticate, deleteFileController);

// Serve uploaded files
router.get('/banners/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(process.cwd(), 'uploads', 'banners', filename);
  res.sendFile(filePath);
});

router.get('/regulations/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(process.cwd(), 'uploads', 'regulations', filename);
  res.sendFile(filePath);
});

export default router;

