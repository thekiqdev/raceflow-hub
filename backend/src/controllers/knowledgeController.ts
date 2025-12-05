import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  getArticles,
  getArticleById,
  createArticle,
  updateArticle,
  deleteArticle,
  toggleArticleStatus,
} from '../services/knowledgeService.js';
import { z } from 'zod';

// Validation schemas
const createCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
  slug: z.string().min(1, 'Category slug is required'),
});

const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
});

const createArticleSchema = z.object({
  category_id: z.preprocess(
    (val) => (val === '' || val === null ? undefined : val),
    z.string().uuid().optional()
  ),
  title: z.string().min(1, 'Title is required'),
  slug: z.string().min(1, 'Slug is required'),
  content: z.string().min(1, 'Content is required'),
  status: z.enum(['rascunho', 'publicado']).default('rascunho'),
});

const updateArticleSchema = z.object({
  category_id: z.preprocess(
    (val) => (val === '' ? null : val),
    z.string().uuid().nullable().optional()
  ),
  title: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  status: z.enum(['rascunho', 'publicado']).optional(),
});

/**
 * GET /api/admin/knowledge/categories
 * Get all categories
 */
export const getCategoriesController = async (
  _req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const categories = await getCategories();

    res.json({
      success: true,
      data: categories,
    });
  } catch (error: any) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch categories',
    });
  }
};

/**
 * GET /api/admin/knowledge/categories/:id
 * Get category by ID
 */
export const getCategoryByIdController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const category = await getCategoryById(id);

    if (!category) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Category not found',
      });
      return;
    }

    res.json({
      success: true,
      data: category,
    });
  } catch (error: any) {
    console.error('Error fetching category:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch category',
    });
  }
};

/**
 * POST /api/admin/knowledge/categories
 * Create category
 */
export const createCategoryController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const validation = createCategorySchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error.errors[0].message,
      });
      return;
    }

    const category = await createCategory(validation.data);

    res.status(201).json({
      success: true,
      data: category,
      message: 'Category created successfully',
    });
  } catch (error: any) {
    console.error('Error creating category:', error);
    
    if (error.code === '23505' || error.message.includes('duplicate')) {
      res.status(409).json({
        success: false,
        error: 'Conflict',
        message: 'Category slug already exists',
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to create category',
    });
  }
};

/**
 * PUT /api/admin/knowledge/categories/:id
 * Update category
 */
export const updateCategoryController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const validation = updateCategorySchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error.errors[0].message,
      });
      return;
    }

    const category = await updateCategory(id, validation.data);

    if (!category) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Category not found',
      });
      return;
    }

    res.json({
      success: true,
      data: category,
      message: 'Category updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating category:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to update category',
    });
  }
};

/**
 * DELETE /api/admin/knowledge/categories/:id
 * Delete category
 */
export const deleteCategoryController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const deleted = await deleteCategory(id);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Category not found',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Category deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting category:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to delete category',
    });
  }
};

/**
 * GET /api/admin/knowledge/articles
 * Get all articles
 */
export const getArticlesController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const filters: any = {};

    if (req.query.category_id) {
      filters.category_id = req.query.category_id as string;
    }

    if (req.query.status) {
      filters.status = req.query.status as string;
    }

    if (req.query.search) {
      filters.search = req.query.search as string;
    }

    const articles = await getArticles(filters);

    res.json({
      success: true,
      data: articles,
    });
  } catch (error: any) {
    console.error('Error fetching articles:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch articles',
    });
  }
};

/**
 * GET /api/admin/knowledge/articles/:id
 * Get article by ID
 */
export const getArticleByIdController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const article = await getArticleById(id);

    if (!article) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Article not found',
      });
      return;
    }

    res.json({
      success: true,
      data: article,
    });
  } catch (error: any) {
    console.error('Error fetching article:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch article',
    });
  }
};

/**
 * POST /api/admin/knowledge/articles
 * Create article
 */
export const createArticleController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const validation = createArticleSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error.errors[0].message,
      });
      return;
    }

    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
      return;
    }

    const article = await createArticle({
      ...validation.data,
      created_by: req.user.id,
    });

    res.status(201).json({
      success: true,
      data: article,
      message: 'Article created successfully',
    });
  } catch (error: any) {
    console.error('Error creating article:', error);
    
    if (error.code === '23505' || error.message.includes('duplicate')) {
      res.status(409).json({
        success: false,
        error: 'Conflict',
        message: 'Article slug already exists',
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to create article',
    });
  }
};

/**
 * PUT /api/admin/knowledge/articles/:id
 * Update article
 */
export const updateArticleController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const validation = updateArticleSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error.errors[0].message,
      });
      return;
    }

    const article = await updateArticle(id, {
      ...validation.data,
      category_id: validation.data.category_id ?? undefined,
    });

    if (!article) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Article not found',
      });
      return;
    }

    res.json({
      success: true,
      data: article,
      message: 'Article updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating article:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to update article',
    });
  }
};

/**
 * DELETE /api/admin/knowledge/articles/:id
 * Delete article
 */
export const deleteArticleController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const deleted = await deleteArticle(id);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Article not found',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Article deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting article:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to delete article',
    });
  }
};

/**
 * POST /api/admin/knowledge/articles/:id/toggle-status
 * Toggle article status
 */
export const toggleArticleStatusController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const article = await toggleArticleStatus(id);

    if (!article) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Article not found',
      });
      return;
    }

    res.json({
      success: true,
      data: article,
      message: 'Article status toggled successfully',
    });
  } catch (error: any) {
    console.error('Error toggling article status:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to toggle article status',
    });
  }
};

