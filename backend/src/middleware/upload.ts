import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'uploads');
const bannersDir = path.join(uploadsDir, 'banners');
const regulationsDir = path.join(uploadsDir, 'regulations');

[uploadsDir, bannersDir, regulationsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Storage configuration for banners (images)
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

// Storage configuration for regulations (PDFs)
const regulationStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, regulationsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `regulation-${uniqueSuffix}${ext}`);
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

// Multer instances
export const uploadBanner = multer({
  storage: bannerStorage,
  fileFilter: bannerFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

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
      console.log(`✅ Arquivo deletado: ${filePath}`);
    }
  } catch (error) {
    console.error(`❌ Erro ao deletar arquivo ${filePath}:`, error);
  }
};

// Helper function to get file URL from path
export const getFileUrl = (filePath: string | null | undefined): string | null => {
  if (!filePath) return null;
  
  // If it's already a URL (starts with http), return as is
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return filePath;
  }
  
  // If it's a local file path, convert to URL
  // The path should be something like: /app/uploads/banners/banner-123.jpg
  // or: uploads/banners/banner-123.jpg
  let relativePath = filePath.replace(/\\/g, '/');
  
  // Extract path after 'uploads/'
  const uploadsIndex = relativePath.indexOf('uploads/');
  if (uploadsIndex !== -1) {
    relativePath = relativePath.substring(uploadsIndex + 'uploads/'.length);
  } else {
    // If 'uploads/' not found, try to extract just the filename and subdirectory
    // Path might be: /app/uploads/banners/banner-123.jpg
    const parts = relativePath.split('/');
    const bannersIndex = parts.indexOf('banners');
    const regulationsIndex = parts.indexOf('regulations');
    
    if (bannersIndex !== -1) {
      relativePath = 'banners/' + parts.slice(bannersIndex + 1).join('/');
    } else if (regulationsIndex !== -1) {
      relativePath = 'regulations/' + parts.slice(regulationsIndex + 1).join('/');
    } else {
      // Fallback: just use the filename
      relativePath = path.basename(filePath);
      // Try to determine subdirectory from filename
      if (relativePath.startsWith('banner-')) {
        relativePath = 'banners/' + relativePath;
      } else if (relativePath.startsWith('regulation-')) {
        relativePath = 'regulations/' + relativePath;
      }
    }
  }
  
  // Get base URL - always construct it properly, never use template strings
  const port = process.env.API_PORT || 3001;
  let baseUrl = process.env.API_URL;
  
  // Always check for template strings and replace them
  if (baseUrl && baseUrl.includes('${')) {
    // Replace any template strings with actual values
    baseUrl = baseUrl.replace(/\$\{API_PORT\}/g, String(port));
  }
  
  // If API_URL is not set or still contains template strings after replacement, use default
  if (!baseUrl || baseUrl.includes('${')) {
    baseUrl = `http://localhost:${port}`;
  }
  
  // Final validation: ensure no template strings remain
  if (baseUrl.includes('${')) {
    console.warn('⚠️ API_URL ainda contém template strings, usando URL padrão');
    baseUrl = `http://localhost:${port}`;
  }
  
  // Remove trailing slash from baseUrl if present
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  const url = `${cleanBaseUrl}/uploads/${relativePath}`;
  
  console.log('🔗 Generated URL:', { filePath, relativePath, baseUrl, cleanBaseUrl, url, apiUrl: process.env.API_URL, port });
  
  return url;
};

// Helper function to extract filename from URL or path
export const extractFilename = (urlOrPath: string): string | null => {
  if (!urlOrPath) return null;
  
  // If it's a URL, extract filename
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
    const url = new URL(urlOrPath);
    const pathname = url.pathname;
    return pathname.split('/').pop() || null;
  }
  
  // If it's a path, extract filename
  return path.basename(urlOrPath);
};

// Helper function to get full file path from URL or relative path
export const getFilePath = (urlOrPath: string | null | undefined): string | null => {
  if (!urlOrPath) return null;
  
  // If it's already a full path, return as is
  if (path.isAbsolute(urlOrPath)) {
    return urlOrPath;
  }
  
  // If it's a URL, extract the path
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
    try {
      const url = new URL(urlOrPath);
      const pathname = url.pathname;
      // Extract path after /uploads/
      const match = pathname.match(/\/uploads\/(.+)$/);
      if (match) {
        const relativePath = match[1];
        // Determine subdirectory based on filename
        const filename = path.basename(relativePath);
        const subDir = filename.startsWith('banner-') ? 'banners' : 'regulations';
        return path.join(uploadsDir, subDir, filename);
      }
      return null;
    } catch {
      return null;
    }
  }
  
  // If it's a relative path, join with uploads directory
  // Check if it already includes the subdirectory
  if (urlOrPath.includes('banners/') || urlOrPath.includes('regulations/')) {
    return path.join(uploadsDir, urlOrPath.replace(/^uploads[\\/]/, ''));
  }
  
  // Try to determine subdirectory from filename
  const filename = path.basename(urlOrPath);
  const subDir = filename.startsWith('banner-') ? 'banners' : 'regulations';
  return path.join(uploadsDir, subDir, filename);
};

