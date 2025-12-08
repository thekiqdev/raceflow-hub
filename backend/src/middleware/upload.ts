import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Create subdirectories
const bannersDir = path.join(uploadsDir, 'banners');
const regulationsDir = path.join(uploadsDir, 'regulations');

if (!fs.existsSync(bannersDir)) {
  fs.mkdirSync(bannersDir, { recursive: true });
}

if (!fs.existsSync(regulationsDir)) {
  fs.mkdirSync(regulationsDir, { recursive: true });
}

// Configure storage for banners (images)
const bannerStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, bannersDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `banner-${uniqueSuffix}${ext}`);
  },
});

// Configure storage for regulations (PDFs)
const regulationStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, regulationsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `regulation-${uniqueSuffix}.pdf`);
  },
});

// File filter for banners (images only)
const bannerFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Apenas imagens são permitidas (JPEG, PNG, WEBP, GIF)'));
  }
};

// File filter for regulations (PDF only)
const regulationFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Apenas arquivos PDF são permitidos'));
  }
};

// Upload middleware for banners
export const uploadBanner = multer({
  storage: bannerStorage,
  fileFilter: bannerFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

// Upload middleware for regulations
export const uploadRegulation = multer({
  storage: regulationStorage,
  fileFilter: regulationFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

// Helper function to delete file
export const deleteFile = (filePath: string): void => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`✅ Arquivo removido: ${filePath}`);
    }
  } catch (error) {
    console.error(`❌ Erro ao remover arquivo ${filePath}:`, error);
  }
};

// Helper function to get file URL from file path
export const getFileUrl = (filePath: string | null | undefined): string | null => {
  if (!filePath) return null;
  
  // If it's already a URL, return it
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return filePath;
  }
  
  // If it's a local file path, convert to URL
  // Extract just the filename and directory name
  const filename = path.basename(filePath);
  const dirname = path.basename(path.dirname(filePath));
  const baseUrl = process.env.API_URL || 'http://localhost:3001';
  return `${baseUrl}/api/upload/${dirname}/${filename}`;
};

// Helper function to extract filename from URL or path
export const extractFilename = (urlOrPath: string | null | undefined): string | null => {
  if (!urlOrPath) return null;
  
  // If it's a URL, extract filename
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
    const url = new URL(urlOrPath);
    return path.basename(url.pathname);
  }
  
  // If it's a path, extract filename
  return path.basename(urlOrPath);
};

