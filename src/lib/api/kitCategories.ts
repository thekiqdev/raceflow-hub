import { apiClient } from './client.js';

/**
 * Get categories associated with a kit
 * @param kitId - ID of the kit
 * @returns Array of category IDs
 */
export const getKitCategories = async (kitId: string) => {
  const response = await apiClient.get<string[]>(`/kits/${kitId}/categories`);
  return response.data || [];
};

/**
 * Update categories associated with a kit
 * @param kitId - ID of the kit
 * @param categoryIds - Array of category IDs to associate with the kit (empty array removes all associations)
 * @returns Array of updated category IDs
 */
export const updateKitCategories = async (kitId: string, categoryIds: string[]) => {
  const response = await apiClient.put<string[]>(`/kits/${kitId}/categories`, {
    category_ids: categoryIds,
  });
  return response.data || [];
};

/**
 * Get kits associated with a category
 * @param categoryId - ID of the category
 * @returns Array of kit IDs
 */
export const getCategoryKits = async (categoryId: string) => {
  const response = await apiClient.get<string[]>(`/categories/${categoryId}/kits`);
  return response.data || [];
};
