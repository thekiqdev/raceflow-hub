import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { uploadBanner, uploadRegulation, deleteFile, getFileUrl, extractFilename } from '../middleware/upload.js';
import path from 'path';
import fs from 'fs';

// Upload banner
export const uploadBannerController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  uploadBanner.single('banner')(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        error: err.message || 'Erro ao fazer upload do banner',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Nenhum arquivo foi enviado',
      });
    }

    // Generate URL for the uploaded file
    const fileUrl = getFileUrl(req.file.path);

    res.json({
      success: true,
      data: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        path: req.file.path,
        url: fileUrl,
        size: req.file.size,
        mimetype: req.file.mimetype,
      },
      message: 'Banner enviado com sucesso',
    });
  });
});

// Upload regulation
export const uploadRegulationController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  uploadRegulation.single('regulation')(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        error: err.message || 'Erro ao fazer upload do regulamento',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Nenhum arquivo foi enviado',
      });
    }

    // Generate URL for the uploaded file
    const fileUrl = getFileUrl(req.file.path);

    res.json({
      success: true,
      data: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        path: req.file.path,
        url: fileUrl,
        size: req.file.size,
        mimetype: req.file.mimetype,
      },
      message: 'Regulamento enviado com sucesso',
    });
  });
});

// Delete file
export const deleteFileController = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Not authenticated',
    });
    return;
  }

  const { fileUrl } = req.body;

  if (!fileUrl) {
    return res.status(400).json({
      success: false,
      error: 'URL do arquivo é obrigatória',
    });
  }

  // Extract filename and determine file path
  const filename = extractFilename(fileUrl);
  if (!filename) {
    return res.status(400).json({
      success: false,
      error: 'URL do arquivo inválida',
    });
  }

  // Determine which directory the file is in
  let filePath: string;
  if (filename.startsWith('banner-')) {
    filePath = path.join(process.cwd(), 'uploads', 'banners', filename);
  } else if (filename.startsWith('regulation-')) {
    filePath = path.join(process.cwd(), 'uploads', 'regulations', filename);
  } else {
    // Try to find the file in both directories
    const bannerPath = path.join(process.cwd(), 'uploads', 'banners', filename);
    const regulationPath = path.join(process.cwd(), 'uploads', 'regulations', filename);
    
    if (fs.existsSync(bannerPath)) {
      filePath = bannerPath;
    } else if (fs.existsSync(regulationPath)) {
      filePath = regulationPath;
    } else {
      return res.status(404).json({
        success: false,
        error: 'Arquivo não encontrado',
      });
    }
  }

  // Delete the file
  deleteFile(filePath);

  res.json({
    success: true,
    message: 'Arquivo removido com sucesso',
  });
});

