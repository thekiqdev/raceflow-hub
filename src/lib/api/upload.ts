import { apiClient } from './client';

export interface UploadResponse {
  success: boolean;
  data?: {
    url: string;
    filename: string;
    originalName: string;
    size: number;
    mimetype: string;
  };
  error?: string;
  message?: string;
}

/**
 * Upload banner image
 */
export const uploadBanner = async (file: File): Promise<UploadResponse> => {
  const formData = new FormData();
  formData.append('file', file);

  const token = localStorage.getItem('auth_token');
  if (!token) {
    return {
      success: false,
      error: 'Not authenticated',
    };
  }

  const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/upload/banner`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    return {
      success: false,
      error: errorData.error || `Erro HTTP: ${response.status}`,
    };
  }

  const data = await response.json();
  console.log('📥 Banner upload response:', data);
  return data;
};

/**
 * Upload regulation PDF
 */
export const uploadRegulation = async (file: File): Promise<UploadResponse> => {
  const formData = new FormData();
  formData.append('file', file);

  const token = localStorage.getItem('auth_token');
  if (!token) {
    return {
      success: false,
      error: 'Not authenticated',
    };
  }

  const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/upload/regulation`, {
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
 * Delete uploaded file
 */
export const deleteUploadedFile = async (type: 'banner' | 'regulation', url: string): Promise<{ success: boolean; error?: string; message?: string }> => {
  const filename = url.split('/').pop() || '';
  const token = localStorage.getItem('auth_token');
  if (!token) {
    return {
      success: false,
      error: 'Not authenticated',
    };
  }

  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/upload/${type}/${filename}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      // Se a resposta não for OK, não lançar erro, apenas retornar
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error || 'Erro ao deletar arquivo',
      };
    }

    const data = await response.json();
    return data;
  } catch (error) {
    // Não lançar erro, apenas retornar falha
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao deletar arquivo',
    };
  }
};

