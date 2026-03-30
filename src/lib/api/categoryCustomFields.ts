import { apiClient } from './client.js';

export interface CategoryCustomField {
  id: string;
  category_id: string;
  label: string;
  field_type: 'text' | 'number';
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateCategoryCustomFieldData {
  label: string;
  field_type: 'text' | 'number';
  display_order?: number;
}

export interface UpdateCategoryCustomFieldData {
  label?: string;
  field_type?: 'text' | 'number';
  display_order?: number;
}

export const getCategoryCustomFields = async (categoryId: string) => {
  const res = await apiClient.get<CategoryCustomField[]>(`/categories/${categoryId}/custom-fields`);
  return res;
};

export const createCategoryCustomField = async (
  categoryId: string,
  data: CreateCategoryCustomFieldData
) => {
  return apiClient.post<CategoryCustomField>(`/categories/${categoryId}/custom-fields`, data);
};

export const updateCategoryCustomField = async (
  categoryId: string,
  fieldId: string,
  data: UpdateCategoryCustomFieldData
) => {
  return apiClient.put<CategoryCustomField>(`/categories/${categoryId}/custom-fields/${fieldId}`, data);
};

export const deleteCategoryCustomField = async (categoryId: string, fieldId: string) => {
  return apiClient.delete(`/categories/${categoryId}/custom-fields/${fieldId}`);
};
