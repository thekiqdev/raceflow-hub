import { apiClient } from './client.js';
import { CategoryBatch } from './categories.js';

export interface CreateCategoryBatchData {
  name?: string | null;
  price: number;
  valid_from?: string | null;
  valid_to?: string | null;
}

export interface UpdateCategoryBatchData {
  name?: string | null;
  price?: number;
  valid_from?: string | null;
  valid_to?: string | null;
}

/**
 * Get all batches for a category
 */
export const getCategoryBatches = async (categoryId: string) => {
  return apiClient.get<CategoryBatch[]>(`/categories/${categoryId}/batches`);
};

/**
 * Get active batches for a category
 * @param categoryId Category ID
 * @param date Optional date to check active batches (ISO string). Defaults to current date.
 */
export const getActiveBatches = async (categoryId: string, date?: string) => {
  const queryParams = date ? `?date=${encodeURIComponent(date)}` : '';
  return apiClient.get<CategoryBatch[]>(`/categories/${categoryId}/batches/active${queryParams}`);
};

/**
 * Create a new batch for a category
 */
export const createCategoryBatch = async (categoryId: string, data: CreateCategoryBatchData) => {
  return apiClient.post<CategoryBatch>(`/categories/${categoryId}/batches`, data);
};

/**
 * Update a batch
 */
export const updateCategoryBatch = async (
  categoryId: string,
  batchId: string,
  data: UpdateCategoryBatchData
) => {
  return apiClient.put<CategoryBatch>(`/categories/${categoryId}/batches/${batchId}`, data);
};

/**
 * Delete a batch
 */
export const deleteCategoryBatch = async (categoryId: string, batchId: string) => {
  return apiClient.delete(`/categories/${categoryId}/batches/${batchId}`);
};
