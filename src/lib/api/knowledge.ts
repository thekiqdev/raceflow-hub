import { apiClient } from './client.js';

export interface KnowledgeCategory {
  id: string;
  name: string;
  slug: string;
  articles_count?: number;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeArticle {
  id: string;
  category_id?: string;
  category_name?: string;
  title: string;
  slug: string;
  content: string;
  status: string;
  views: number;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface CreateCategoryData {
  name: string;
  slug: string;
}

export interface UpdateCategoryData {
  name?: string;
  slug?: string;
}

export interface CreateArticleData {
  category_id?: string;
  title: string;
  slug: string;
  content: string;
  status: 'rascunho' | 'publicado';
}

export interface UpdateArticleData {
  category_id?: string | null;
  title?: string;
  slug?: string;
  content?: string;
  status?: 'rascunho' | 'publicado';
}

/**
 * Get all categories
 */
export const getCategories = async (): Promise<{
  success: boolean;
  data?: KnowledgeCategory[];
  error?: string;
  message?: string;
}> => {
  return apiClient.get<KnowledgeCategory[]>('/admin/knowledge/categories');
};

/**
 * Get category by ID
 */
export const getCategoryById = async (categoryId: string): Promise<{
  success: boolean;
  data?: KnowledgeCategory;
  error?: string;
  message?: string;
}> => {
  return apiClient.get<KnowledgeCategory>(`/admin/knowledge/categories/${categoryId}`);
};

/**
 * Create category
 */
export const createCategory = async (data: CreateCategoryData): Promise<{
  success: boolean;
  data?: KnowledgeCategory;
  message?: string;
  error?: string;
}> => {
  return apiClient.post<KnowledgeCategory>('/admin/knowledge/categories', data);
};

/**
 * Update category
 */
export const updateCategory = async (categoryId: string, data: UpdateCategoryData): Promise<{
  success: boolean;
  data?: KnowledgeCategory;
  message?: string;
  error?: string;
}> => {
  return apiClient.put<KnowledgeCategory>(`/admin/knowledge/categories/${categoryId}`, data);
};

/**
 * Delete category
 */
export const deleteCategory = async (categoryId: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> => {
  return apiClient.delete(`/admin/knowledge/categories/${categoryId}`);
};

/**
 * Get all articles
 */
export const getArticles = async (filters?: {
  category_id?: string;
  status?: string;
  search?: string;
}): Promise<{
  success: boolean;
  data?: KnowledgeArticle[];
  error?: string;
  message?: string;
}> => {
  const queryParams = new URLSearchParams();
  if (filters?.category_id) queryParams.append('category_id', filters.category_id);
  if (filters?.status) queryParams.append('status', filters.status);
  if (filters?.search) queryParams.append('search', filters.search);

  const queryString = queryParams.toString();
  const endpoint = `/admin/knowledge/articles${queryString ? `?${queryString}` : ''}`;

  return apiClient.get<KnowledgeArticle[]>(endpoint);
};

/**
 * Get article by ID
 */
export const getArticleById = async (articleId: string): Promise<{
  success: boolean;
  data?: KnowledgeArticle;
  error?: string;
  message?: string;
}> => {
  return apiClient.get<KnowledgeArticle>(`/admin/knowledge/articles/${articleId}`);
};

/**
 * Create article
 */
export const createArticle = async (data: CreateArticleData): Promise<{
  success: boolean;
  data?: KnowledgeArticle;
  message?: string;
  error?: string;
}> => {
  return apiClient.post<KnowledgeArticle>('/admin/knowledge/articles', data);
};

/**
 * Update article
 */
export const updateArticle = async (articleId: string, data: UpdateArticleData): Promise<{
  success: boolean;
  data?: KnowledgeArticle;
  message?: string;
  error?: string;
}> => {
  return apiClient.put<KnowledgeArticle>(`/admin/knowledge/articles/${articleId}`, data);
};

/**
 * Delete article
 */
export const deleteArticle = async (articleId: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> => {
  return apiClient.delete(`/admin/knowledge/articles/${articleId}`);
};

/**
 * Toggle article status
 */
export const toggleArticleStatus = async (articleId: string): Promise<{
  success: boolean;
  data?: KnowledgeArticle;
  message?: string;
  error?: string;
}> => {
  return apiClient.post<KnowledgeArticle>(`/admin/knowledge/articles/${articleId}/toggle-status`, {});
};




