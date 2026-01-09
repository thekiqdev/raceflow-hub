import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getFileUrl, deleteFile, getFilePath } from '../middleware/upload.js';
import path from 'path';
import fs from 'fs';

/**
 * POST /api/upload/banner
 * Upload banner image
 */
export const uploadBannerController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  if (!req.file) {
    res.status(400).json({
      success: false,
      error: 'No file uploaded',
      message: 'Nenhum arquivo foi enviado',
    });
    return;
  }

  const fileUrl = getFileUrl(req.file.path);
  
  // Verify file actually exists
  const fileExists = fs.existsSync(req.file.path);
  
  console.log('📤 Banner upload:', {
    path: req.file.path,
    filename: req.file.filename,
    url: fileUrl,
    fileExists,
    fileSize: fileExists ? fs.statSync(req.file.path).size : 0,
    UPLOADS_DIR: process.env.UPLOADS_DIR,
    NODE_ENV: process.env.NODE_ENV,
  });
  
  if (!fileExists) {
    console.error('❌ CRITICAL: File was not saved to disk!', req.file.path);
  }

  res.json({
    success: true,
    data: {
      url: fileUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    },
    message: 'Banner enviado com sucesso',
  });
});

/**
 * POST /api/upload/regulation
 * Upload regulation PDF
 */
export const uploadRegulationController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  if (!req.file) {
    res.status(400).json({
      success: false,
      error: 'No file uploaded',
      message: 'Nenhum arquivo foi enviado',
    });
    return;
  }

  const fileUrl = getFileUrl(req.file.path);

  // Verify file actually exists
  const fileExists = fs.existsSync(req.file.path);
  
  console.log('📤 Regulation upload:', {
    path: req.file.path,
    filename: req.file.filename,
    url: fileUrl,
    fileExists,
    fileSize: fileExists ? fs.statSync(req.file.path).size : 0,
    UPLOADS_DIR: process.env.UPLOADS_DIR,
    NODE_ENV: process.env.NODE_ENV,
  });
  
  if (!fileExists) {
    console.error('❌ CRITICAL: File was not saved to disk!', req.file.path);
  }

  res.json({
    success: true,
    data: {
      url: fileUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    },
    message: 'Regulamento enviado com sucesso',
  });
});

/**
 * DELETE /api/upload/:type/:filename
 * Delete uploaded file
 * type: 'banner' | 'regulation'
 */
export const deleteFileController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const { type, filename } = req.params;

  if (type !== 'banner' && type !== 'regulation') {
    res.status(400).json({
      success: false,
      error: 'Invalid type',
      message: 'Tipo inválido. Use "banner" ou "regulation"',
    });
    return;
  }

  // Get file path from URL in body or filename from params
  let filePath: string | null = null;
  
  // Try to get URL from body first
  if (req.body && req.body.url) {
    filePath = getFilePath(req.body.url);
  }
  
  // If not found, try to construct from filename
  if (!filePath && filename) {
    // Determine subdirectory based on filename prefix
    const subDir = filename.startsWith('banner-') ? 'banners' : 'regulations';
    const uploadsDir = path.join(process.cwd(), 'uploads');
    filePath = path.join(uploadsDir, subDir, filename);
  }

  if (!filePath) {
    res.status(400).json({
      success: false,
      error: 'Invalid file path',
      message: 'Caminho do arquivo inválido',
    });
    return;
  }

  deleteFile(filePath);

  res.json({
    success: true,
    message: 'Arquivo deletado com sucesso',
  });
});

