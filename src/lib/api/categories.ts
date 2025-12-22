import { apiClient } from './client.js';

export type CategoryType = 'visitante' | 'local' | 'geral' | 'PCD' | 'militar' | 'civil' | 'outro';
export type CategoryGender = 'ambos' | 'masculino' | 'feminino';

export interface Category {
  id: string;
  event_id: string;
  name: string;
  price: number;
  category_type: CategoryType;
  gender: CategoryGender;
  min_age: number | null;
  max_participants: number | null;
  is_default: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
  modality_ids?: string[]; // IDs das modalidades associadas
}

export interface CreateCategoryData {
  event_id: string;
  name: string;
  price: number;
  category_type: CategoryType;
  gender: CategoryGender;
  min_age?: number | null;
  max_participants?: number | null;
  is_default?: boolean;
  display_order?: number; // Opcional na criação - será calculado automaticamente se não fornecido
  modality_ids?: string[];
}

export interface UpdateCategoryData {
  name?: string;
  price?: number;
  category_type?: CategoryType;
  gender?: CategoryGender;
  min_age?: number | null;
  max_participants?: number | null;
  is_default?: boolean;
  display_order?: number; // Permite atualizar a ordem de exibição
  modality_ids?: string[];
}

// Get all categories for an event
export const getCategories = async (eventId: string) => {
  return apiClient.get<Category[]>(`/categories/event/${eventId}`);
};

// Get categories by modality
export const getCategoriesByModality = async (modalityId: string) => {
  return apiClient.get<Category[]>(`/categories/modality/${modalityId}`);
};

// Get category by ID
export const getCategoryById = async (id: string) => {
  return apiClient.get<Category>(`/categories/${id}`);
};

// Create a new category
export const createCategory = async (data: CreateCategoryData) => {
  return apiClient.post<Category>('/categories', data);
};

// Update a category
export const updateCategory = async (id: string, data: UpdateCategoryData) => {
  return apiClient.put<Category>(`/categories/${id}`, data);
};

// Delete a category
export const deleteCategory = async (id: string) => {
  return apiClient.delete(`/categories/${id}`);
};

// Reorder categories for an event
export interface ReorderCategoriesData {
  categoryOrders: Array<{ id: string; display_order: number }>;
}

export const reorderCategories = async (eventId: string, data: ReorderCategoriesData) => {
  return apiClient.put<void>(`/categories/events/${eventId}/reorder`, data);
};

