import { apiClient } from './client.js';

export interface DocumentType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  requires_expiry_date: boolean;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateDocumentTypeData {
  code: string;
  name: string;
  description?: string | null;
  requires_expiry_date?: boolean;
  is_active?: boolean;
  display_order?: number;
}

export interface UpdateDocumentTypeData {
  name?: string;
  description?: string | null;
  requires_expiry_date?: boolean;
  is_active?: boolean;
  display_order?: number;
}

/**
 * Get all document types (admin only)
 */
export const getAllDocumentTypes = async (): Promise<{ success: boolean; data?: DocumentType[]; error?: string; message?: string }> => {
  return apiClient.get<DocumentType[]>('/admin/document-types');
};

/**
 * Get active document types (public endpoint for runners)
 */
export const getActiveDocumentTypes = async (): Promise<{ success: boolean; data?: DocumentType[]; error?: string; message?: string }> => {
  return apiClient.get<DocumentType[]>('/document-types/active');
};

/**
 * Get a document type by ID (admin only)
 */
export const getDocumentTypeById = async (id: string): Promise<{ success: boolean; data?: DocumentType; error?: string; message?: string }> => {
  return apiClient.get<DocumentType>(`/admin/document-types/${id}`);
};

/**
 * Create a new document type (admin only)
 */
export const createDocumentType = async (data: CreateDocumentTypeData): Promise<{ success: boolean; data?: DocumentType; error?: string; message?: string }> => {
  return apiClient.post<DocumentType>('/admin/document-types', data);
};

/**
 * Update a document type (admin only)
 */
export const updateDocumentType = async (id: string, data: UpdateDocumentTypeData): Promise<{ success: boolean; data?: DocumentType; error?: string; message?: string }> => {
  return apiClient.put<DocumentType>(`/admin/document-types/${id}`, data);
};

/**
 * Delete a document type (admin only)
 */
export const deleteDocumentType = async (id: string): Promise<{ success: boolean; error?: string; message?: string }> => {
  return apiClient.delete(`/admin/document-types/${id}`);
};
