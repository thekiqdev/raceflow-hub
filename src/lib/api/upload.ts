import { apiClient } from './client';

export interface UploadResponse {
  success: boolean;
  data?: {
    filename: string;
    originalName: string;
    path: string;
    url: string;
    size: number;
    mimetype: string;
  };
  error?: string;
  message?: string;
}

// Get API URL
const getApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && !envUrl.includes('localhost')) {
    return envUrl;
  }
  if (import.meta.env.PROD) {
    return 'https://cronoteam-crono-back.e758qe.easypanel.host/api';
  }
  return 'http://localhost:3001/api';
};

const API_URL = getApiUrl();

/**
 * Upload banner image
 */
export const uploadBanner = async (file: File): Promise<UploadResponse> => {
  const formData = new FormData();
  formData.append('banner', file);

  const token = localStorage.getItem('auth_token');
  const response = await fetch(`${API_URL}/upload/banner`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await response.json();
  return data;
};

/**
 * Upload regulation PDF
 */
export const uploadRegulation = async (file: File): Promise<UploadResponse> => {
  const formData = new FormData();
  formData.append('regulation', file);

  const token = localStorage.getItem('auth_token');
  const response = await fetch(`${API_URL}/upload/regulation`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await response.json();
  return data;
};

/**
 * Delete file
 */
export const deleteFile = async (fileUrl: string): Promise<UploadResponse> => {
  return apiClient.delete<UploadResponse>('/upload/file', {
    fileUrl,
  });
};

