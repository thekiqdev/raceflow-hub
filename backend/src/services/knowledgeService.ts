import { query, getClient } from '../config/database.js';

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

/**
 * Get all categories with article count
 */
export const getCategories = async (): Promise<KnowledgeCategory[]> => {
  const queryText = `
    SELECT 
      kc.*,
      COUNT(ka.id) as articles_count
    FROM knowledge_categories kc
    LEFT JOIN knowledge_articles ka ON kc.id = ka.category_id
    GROUP BY kc.id, kc.name, kc.slug, kc.created_at, kc.updated_at
    ORDER BY kc.name
  `;

  const result = await query(queryText);
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    articles_count: parseInt(row.articles_count) || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
};

/**
 * Get category by ID
 */
export const getCategoryById = async (categoryId: string): Promise<KnowledgeCategory | null> => {
  const result = await query(
    'SELECT * FROM knowledge_categories WHERE id = $1',
    [categoryId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as KnowledgeCategory;
};

/**
 * Create category
 */
export const createCategory = async (data: {
  name: string;
  slug: string;
}): Promise<KnowledgeCategory> => {
  const result = await query(
    'INSERT INTO knowledge_categories (name, slug) VALUES ($1, $2) RETURNING *',
    [data.name, data.slug]
  );

  return {
    ...result.rows[0],
    articles_count: 0,
  } as KnowledgeCategory;
};

/**
 * Update category
 */
export const updateCategory = async (
  categoryId: string,
  data: { name?: string; slug?: string }
): Promise<KnowledgeCategory | null> => {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${paramIndex}`);
    values.push(data.name);
    paramIndex++;
  }

  if (data.slug !== undefined) {
    fields.push(`slug = $${paramIndex}`);
    values.push(data.slug);
    paramIndex++;
  }

  if (fields.length === 0) {
    throw new Error('No fields to update');
  }

  fields.push(`updated_at = NOW()`);
  values.push(categoryId);

  const result = await query(
    `UPDATE knowledge_categories 
     SET ${fields.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    return null;
  }

  // Get article count
  const countResult = await query(
    'SELECT COUNT(*) as count FROM knowledge_articles WHERE category_id = $1',
    [categoryId]
  );

  return {
    ...result.rows[0],
    articles_count: parseInt(countResult.rows[0].count) || 0,
  } as KnowledgeCategory;
};

/**
 * Delete category
 */
export const deleteCategory = async (categoryId: string): Promise<boolean> => {
  const result = await query(
    'DELETE FROM knowledge_categories WHERE id = $1 RETURNING id',
    [categoryId]
  );

  return result.rows.length > 0;
};

/**
 * Get all articles with category info
 */
export const getArticles = async (filters?: {
  category_id?: string;
  status?: string;
  search?: string;
}): Promise<KnowledgeArticle[]> => {
  let queryText = `
    SELECT 
      ka.*,
      kc.name as category_name
    FROM knowledge_articles ka
    LEFT JOIN knowledge_categories kc ON ka.category_id = kc.id
  `;

  const params: any[] = [];
  const conditions: string[] = [];

  if (filters?.category_id) {
    conditions.push(`ka.category_id = $${params.length + 1}`);
    params.push(filters.category_id);
  }

  if (filters?.status) {
    conditions.push(`ka.status = $${params.length + 1}`);
    params.push(filters.status);
  }

  if (filters?.search) {
    conditions.push(`(
      ka.title ILIKE $${params.length + 1} OR
      ka.content ILIKE $${params.length + 1} OR
      ka.slug ILIKE $${params.length + 1}
    )`);
    const searchTerm = `%${filters.search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  if (conditions.length > 0) {
    queryText += ' WHERE ' + conditions.join(' AND ');
  }

  queryText += ' ORDER BY ka.updated_at DESC';

  const result = await query(queryText, params);
  return result.rows.map((row) => ({
    id: row.id,
    category_id: row.category_id,
    category_name: row.category_name,
    title: row.title,
    slug: row.slug,
    content: row.content,
    status: row.status,
    views: parseInt(row.views) || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
  }));
};

/**
 * Get article by ID
 */
export const getArticleById = async (articleId: string): Promise<KnowledgeArticle | null> => {
  const result = await query(
    `SELECT 
      ka.*,
      kc.name as category_name
    FROM knowledge_articles ka
    LEFT JOIN knowledge_categories kc ON ka.category_id = kc.id
    WHERE ka.id = $1`,
    [articleId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    category_id: row.category_id,
    category_name: row.category_name,
    title: row.title,
    slug: row.slug,
    content: row.content,
    status: row.status,
    views: parseInt(row.views) || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
  };
};

/**
 * Create article
 */
export const createArticle = async (data: {
  category_id?: string;
  title: string;
  slug: string;
  content: string;
  status: string;
  created_by: string;
}): Promise<KnowledgeArticle> => {
  const result = await query(
    `INSERT INTO knowledge_articles (category_id, title, slug, content, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      data.category_id || null,
      data.title,
      data.slug,
      data.content,
      data.status,
      data.created_by,
    ]
  );

  const row = result.rows[0];

  // Get category name if exists
  let categoryName = null;
  if (row.category_id) {
    const catResult = await query(
      'SELECT name FROM knowledge_categories WHERE id = $1',
      [row.category_id]
    );
    if (catResult.rows.length > 0) {
      categoryName = catResult.rows[0].name;
    }
  }

  return {
    ...row,
    category_name: categoryName,
    views: 0,
  } as KnowledgeArticle;
};

/**
 * Update article
 */
export const updateArticle = async (
  articleId: string,
  data: {
    category_id?: string;
    title?: string;
    slug?: string;
    content?: string;
    status?: string;
  }
): Promise<KnowledgeArticle | null> => {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.category_id !== undefined) {
    fields.push(`category_id = $${paramIndex}`);
    values.push(data.category_id || null);
    paramIndex++;
  }

  if (data.title !== undefined) {
    fields.push(`title = $${paramIndex}`);
    values.push(data.title);
    paramIndex++;
  }

  if (data.slug !== undefined) {
    fields.push(`slug = $${paramIndex}`);
    values.push(data.slug);
    paramIndex++;
  }

  if (data.content !== undefined) {
    fields.push(`content = $${paramIndex}`);
    values.push(data.content);
    paramIndex++;
  }

  if (data.status !== undefined) {
    fields.push(`status = $${paramIndex}`);
    values.push(data.status);
    paramIndex++;
  }

  if (fields.length === 0) {
    throw new Error('No fields to update');
  }

  fields.push(`updated_at = NOW()`);
  values.push(articleId);

  const result = await query(
    `UPDATE knowledge_articles 
     SET ${fields.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  // Get category name if exists
  let categoryName = null;
  if (row.category_id) {
    const catResult = await query(
      'SELECT name FROM knowledge_categories WHERE id = $1',
      [row.category_id]
    );
    if (catResult.rows.length > 0) {
      categoryName = catResult.rows[0].name;
    }
  }

  return {
    ...row,
    category_name: categoryName,
    views: parseInt(row.views) || 0,
  } as KnowledgeArticle;
};

/**
 * Delete article
 */
export const deleteArticle = async (articleId: string): Promise<boolean> => {
  const result = await query(
    'DELETE FROM knowledge_articles WHERE id = $1 RETURNING id',
    [articleId]
  );

  return result.rows.length > 0;
};

/**
 * Toggle article status
 */
export const toggleArticleStatus = async (articleId: string): Promise<KnowledgeArticle | null> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get current status
    const currentResult = await client.query(
      'SELECT status FROM knowledge_articles WHERE id = $1',
      [articleId]
    );

    if (currentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const currentStatus = currentResult.rows[0].status;
    const newStatus = currentStatus === 'publicado' ? 'rascunho' : 'publicado';

    // Update status
    const updateResult = await client.query(
      `UPDATE knowledge_articles 
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [newStatus, articleId]
    );

    await client.query('COMMIT');

    const row = updateResult.rows[0];

    // Get category name if exists
    let categoryName = null;
    if (row.category_id) {
      const catResult = await client.query(
        'SELECT name FROM knowledge_categories WHERE id = $1',
        [row.category_id]
      );
      if (catResult.rows.length > 0) {
        categoryName = catResult.rows[0].name;
      }
    }

    return {
      ...row,
      category_name: categoryName,
      views: parseInt(row.views) || 0,
    } as KnowledgeArticle;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};




