import { query } from '../config/database.js';

export interface CategoryCustomField {
  id: string;
  category_id: string;
  label: string;
  field_type: 'text' | 'number';
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateCategoryCustomFieldData {
  category_id: string;
  label: string;
  field_type: 'text' | 'number';
  display_order?: number;
}

export interface UpdateCategoryCustomFieldData {
  label?: string;
  field_type?: 'text' | 'number';
  display_order?: number;
}

/**
 * Get all custom fields for a category
 */
export const getByCategoryId = async (categoryId: string): Promise<CategoryCustomField[]> => {
  const result = await query(
    `SELECT * FROM category_custom_fields
     WHERE category_id = $1
     ORDER BY display_order ASC, created_at ASC`,
    [categoryId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    category_id: row.category_id,
    label: row.label,
    field_type: row.field_type,
    display_order: row.display_order ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
};

/**
 * Get a custom field by ID
 */
export const getById = async (id: string): Promise<CategoryCustomField | null> => {
  const result = await query(
    `SELECT * FROM category_custom_fields WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    category_id: row.category_id,
    label: row.label,
    field_type: row.field_type,
    display_order: row.display_order ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

/**
 * Create a custom field for a category
 */
export const create = async (data: CreateCategoryCustomFieldData): Promise<CategoryCustomField> => {
  const categoryCheck = await query(
    `SELECT id FROM categories WHERE id = $1`,
    [data.category_id]
  );

  if (categoryCheck.rows.length === 0) {
    throw new Error('Category not found');
  }

  let displayOrder = data.display_order;
  if (displayOrder === undefined) {
    const maxResult = await query(
      `SELECT COALESCE(MAX(display_order), 0)::int AS max_order
       FROM category_custom_fields WHERE category_id = $1`,
      [data.category_id]
    );
    displayOrder = (maxResult.rows[0]?.max_order ?? 0) + 1;
  }

  const result = await query(
    `INSERT INTO category_custom_fields (category_id, label, field_type, display_order)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [data.category_id, data.label.trim(), data.field_type, displayOrder]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    category_id: row.category_id,
    label: row.label,
    field_type: row.field_type,
    display_order: row.display_order ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

/**
 * Update a custom field
 */
export const update = async (
  id: string,
  data: UpdateCategoryCustomFieldData
): Promise<CategoryCustomField> => {
  const existing = await getById(id);
  if (!existing) {
    throw new Error('Custom field not found');
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.label !== undefined) {
    updates.push(`label = $${paramIndex++}`);
    values.push(data.label.trim());
  }
  if (data.field_type !== undefined) {
    updates.push(`field_type = $${paramIndex++}`);
    values.push(data.field_type);
  }
  if (data.display_order !== undefined) {
    updates.push(`display_order = $${paramIndex++}`);
    values.push(data.display_order);
  }

  if (updates.length === 0) {
    return existing;
  }

  values.push(id);
  const result = await query(
    `UPDATE category_custom_fields
     SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );

  const row = result.rows[0];
  return {
    id: row.id,
    category_id: row.category_id,
    label: row.label,
    field_type: row.field_type,
    display_order: row.display_order ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

/**
 * Delete a custom field
 */
export const deleteById = async (id: string): Promise<void> => {
  const result = await query(
    `DELETE FROM category_custom_fields WHERE id = $1 RETURNING id`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new Error('Custom field not found');
  }
};
