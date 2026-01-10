import { apiClient } from './client.js';

// Document types
export type DocumentType = 'militar' | 'estudante' | 'pcd' | 'rg' | 'cpf' | 'atestado_medico' | 'comprovante_residencia' | 'outro';
export type DocumentStatus = 'pending' | 'approved' | 'rejected';

// Document interface
export interface RunnerDocument {
  id: string;
  runner_id: string;
  document_type: DocumentType;
  file_name: string;
  file_path: string;
  file_url: string;
  file_size: number;
  mime_type: string;
  expiry_date: string | null;
  status: DocumentStatus;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

// Create document data (for upload)
export interface CreateDocumentData {
  document_type: DocumentType;
  expiry_date?: string | null;
  file: File;
}

// Update document status data (admin)
export interface UpdateDocumentStatusData {
  status: 'approved' | 'rejected';
  rejection_reason?: string;
}

// Document filters (admin)
export interface DocumentFilters {
  runner_id?: string;
  status?: DocumentStatus;
  document_type?: DocumentType;
  search?: string;
}

/**
 * Get all documents for the authenticated runner
 */
export const getRunnerDocuments = async (): Promise<{ success: boolean; data?: RunnerDocument[]; error?: string; message?: string }> => {
  return apiClient.get<RunnerDocument[]>('/runner/documents');
};

/**
 * Get a specific document by ID
 */
export const getDocumentById = async (documentId: string): Promise<{ success: boolean; data?: RunnerDocument; error?: string; message?: string }> => {
  return apiClient.get<RunnerDocument>(`/runner/documents/${documentId}`);
};

/**
 * Upload a new document
 */
export const uploadDocument = async (data: CreateDocumentData): Promise<{ success: boolean; data?: RunnerDocument; error?: string; message?: string }> => {
  const formData = new FormData();
  formData.append('file', data.file);
  formData.append('document_type', data.document_type);
  
  if (data.expiry_date) {
    formData.append('expiry_date', data.expiry_date);
  }

  const token = localStorage.getItem('auth_token');
  if (!token) {
    return {
      success: false,
      error: 'Not authenticated',
      message: 'Usuário não autenticado',
    };
  }

  // Get API URL using the same logic as apiClient
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

  const apiUrl = getApiUrl();
  const response = await fetch(`${apiUrl}/runner/documents`, {
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
      message: errorData.message || errorData.error,
    };
  }

  const result = await response.json();
  return result;
};

/**
 * Delete a document
 */
export const deleteDocument = async (documentId: string): Promise<{ success: boolean; error?: string; message?: string }> => {
  return apiClient.delete(`/runner/documents/${documentId}`);
};

/**
 * Get all documents with filters (admin only)
 */
export const getAllDocuments = async (filters?: DocumentFilters): Promise<{ success: boolean; data?: RunnerDocument[]; error?: string; message?: string }> => {
  const queryParams = new URLSearchParams();
  
  if (filters?.runner_id) {
    queryParams.append('runner_id', filters.runner_id);
  }
  if (filters?.status) {
    queryParams.append('status', filters.status);
  }
  if (filters?.document_type) {
    queryParams.append('document_type', filters.document_type);
  }
  if (filters?.search) {
    queryParams.append('search', filters.search);
  }

  const queryString = queryParams.toString();
  const endpoint = `/admin/documents${queryString ? `?${queryString}` : ''}`;
  
  return apiClient.get<RunnerDocument[]>(endpoint);
};

/**
 * Get all pending documents (admin only)
 */
export const getPendingDocuments = async (): Promise<{ success: boolean; data?: RunnerDocument[]; error?: string; message?: string }> => {
  return apiClient.get<RunnerDocument[]>('/admin/documents/pending');
};

/**
 * Approve a document (admin only)
 */
export const approveDocument = async (documentId: string): Promise<{ success: boolean; data?: RunnerDocument; error?: string; message?: string }> => {
  return apiClient.put<RunnerDocument>(`/admin/documents/${documentId}/status`, {
    status: 'approved',
  });
};

/**
 * Reject a document (admin only)
 */
export const rejectDocument = async (documentId: string, reason: string): Promise<{ success: boolean; data?: RunnerDocument; error?: string; message?: string }> => {
  return apiClient.put<RunnerDocument>(`/admin/documents/${documentId}/status`, {
    status: 'rejected',
    rejection_reason: reason,
  });
};
