import { query } from '../config/database.js';
import { Category, CreateCategoryData, UpdateCategoryData } from '../types/index.js';

/**
 * Get all categories for an event
 */
export const getCategoriesByEvent = async (eventId: string): Promise<Category[]> => {
  const result = await query(
    `SELECT 
      c.*,
      COALESCE(
        ARRAY_AGG(DISTINCT cm.modality_id) FILTER (WHERE cm.modality_id IS NOT NULL),
        ARRAY[]::UUID[]
      ) as modality_ids
     FROM categories c
     LEFT JOIN category_modalities cm ON c.id = cm.category_id
     WHERE c.event_id = $1
     GROUP BY c.id
     ORDER BY c.name ASC`,
    [eventId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    event_id: row.event_id,
    name: row.name,
    price: parseFloat(row.price) || 0,
    category_type: row.category_type,
    gender: row.gender,
    min_age: row.min_age ? parseInt(row.min_age) : null,
    max_participants: row.max_participants ? parseInt(row.max_participants) : null,
    is_default: row.is_default === true,
    created_at: row.created_at,
    updated_at: row.updated_at,
    modality_ids: row.modality_ids || [],
  }));
};

/**
 * Get categories by modality
 */
export const getCategoriesByModality = async (modalityId: string): Promise<Category[]> => {
  const result = await query(
    `SELECT 
      c.*,
      ARRAY_AGG(DISTINCT cm2.modality_id) FILTER (WHERE cm2.modality_id IS NOT NULL) as modality_ids
     FROM categories c
     INNER JOIN category_modalities cm ON c.id = cm.category_id
     LEFT JOIN category_modalities cm2 ON c.id = cm2.category_id
     WHERE cm.modality_id = $1
     GROUP BY c.id
     ORDER BY c.name ASC`,
    [modalityId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    event_id: row.event_id,
    name: row.name,
    price: parseFloat(row.price) || 0,
    category_type: row.category_type,
    gender: row.gender,
    min_age: row.min_age ? parseInt(row.min_age) : null,
    max_participants: row.max_participants ? parseInt(row.max_participants) : null,
    is_default: row.is_default === true,
    created_at: row.created_at,
    updated_at: row.updated_at,
    modality_ids: row.modality_ids || [],
  }));
};

/**
 * Get a category by ID
 */
export const getCategoryById = async (categoryId: string): Promise<Category | null> => {
  const result = await query(
    `SELECT 
      c.*,
      COALESCE(
        ARRAY_AGG(DISTINCT cm.modality_id) FILTER (WHERE cm.modality_id IS NOT NULL),
        ARRAY[]::UUID[]
      ) as modality_ids
     FROM categories c
     LEFT JOIN category_modalities cm ON c.id = cm.category_id
     WHERE c.id = $1
     GROUP BY c.id`,
    [categoryId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    event_id: row.event_id,
    name: row.name,
    price: parseFloat(row.price) || 0,
    category_type: row.category_type,
    gender: row.gender,
    min_age: row.min_age ? parseInt(row.min_age) : null,
    max_participants: row.max_participants ? parseInt(row.max_participants) : null,
    is_default: row.is_default === true,
    created_at: row.created_at,
    updated_at: row.updated_at,
    modality_ids: row.modality_ids || [],
  };
};

/**
 * Create a new category
 */
export const createCategory = async (
  data: CreateCategoryData
): Promise<Category> => {
  // Verificar se é a primeira categoria do evento
  const existingCategories = await getCategoriesByEvent(data.event_id);
  const isFirstCategory = existingCategories.length === 0;
  
  // Se for a primeira categoria, sempre marcar como padrão
  // Se não for, usar o valor fornecido ou false
  const shouldBeDefault = isFirstCategory || (data.is_default === true);
  
  // Se esta categoria deve ser padrão, desmarcar outras categorias do mesmo evento
  if (shouldBeDefault) {
    await query(
      `UPDATE categories SET is_default = false WHERE event_id = $1`,
      [data.event_id]
    );
  }
  
  // Inserir a categoria
  const result = await query(
    `INSERT INTO categories (event_id, name, price, category_type, gender, min_age, max_participants, is_default)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      data.event_id,
      data.name,
      data.price,
      data.category_type,
      data.gender,
      data.min_age || null,
      data.max_participants || null,
      shouldBeDefault,
    ]
  );

  if (result.rows.length === 0) {
    throw new Error('Failed to create category');
  }

  const categoryId = result.rows[0].id;

  // Associar modalidades se fornecidas
  if (data.modality_ids && data.modality_ids.length > 0) {
    await setCategoryModalities(categoryId, data.modality_ids);
  }

  // Retornar a categoria completa com modalidades
  const category = await getCategoryById(categoryId);
  if (!category) {
    throw new Error('Failed to retrieve created category');
  }

  return category;
};

/**
 * Update a category
 */
export const updateCategory = async (
  categoryId: string,
  data: UpdateCategoryData
): Promise<Category | null> => {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${paramIndex}`);
    values.push(data.name);
    paramIndex++;
  }

  if (data.price !== undefined) {
    fields.push(`price = $${paramIndex}`);
    values.push(data.price);
    paramIndex++;
  }

  if (data.category_type !== undefined) {
    fields.push(`category_type = $${paramIndex}`);
    values.push(data.category_type);
    paramIndex++;
  }

  if (data.gender !== undefined) {
    fields.push(`gender = $${paramIndex}`);
    values.push(data.gender);
    paramIndex++;
  }

  if (data.min_age !== undefined) {
    fields.push(`min_age = $${paramIndex}`);
    values.push(data.min_age);
    paramIndex++;
  }

  if (data.max_participants !== undefined) {
    fields.push(`max_participants = $${paramIndex}`);
    values.push(data.max_participants);
    paramIndex++;
  }

  // Se is_default está sendo atualizado para true, desmarcar outras categorias do mesmo evento
  console.log(`🔍 [SERVICE] updateCategory - is_default recebido:`, {
    is_default: data.is_default,
    is_default_type: typeof data.is_default,
    is_default_undefined: data.is_default === undefined,
    is_default_true: data.is_default === true,
    is_default_false: data.is_default === false
  });
  
  if (data.is_default === true) {
    console.log(`✅ [SERVICE] Marcando categoria ${categoryId} como padrão`);
    // Primeiro, obter o event_id da categoria atual
    const currentCategory = await getCategoryById(categoryId);
    if (currentCategory) {
      // Desmarcar todas as outras categorias do mesmo evento
      await query(
        `UPDATE categories SET is_default = false WHERE event_id = $1 AND id != $2`,
        [currentCategory.event_id, categoryId]
      );
      console.log(`✅ [SERVICE] Outras categorias do evento ${currentCategory.event_id} desmarcadas`);
    }
    fields.push(`is_default = $${paramIndex}`);
    values.push(true);
    paramIndex++;
  } else if (data.is_default === false) {
    console.log(`❌ [SERVICE] Desmarcando categoria ${categoryId} como padrão`);
    fields.push(`is_default = $${paramIndex}`);
    values.push(false);
    paramIndex++;
  } else if (data.is_default !== undefined) {
    console.log(`⚠️ [SERVICE] is_default tem valor inesperado:`, data.is_default);
  }

  if (fields.length === 0 && data.modality_ids === undefined) {
    throw new Error('No fields to update');
  }

  // Atualizar campos da categoria se houver
  if (fields.length > 0) {
    values.push(categoryId);
    const result = await query(
      `UPDATE categories 
       SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return null;
    }
  }

  // Atualizar modalidades se fornecidas
  if (data.modality_ids !== undefined) {
    await setCategoryModalities(categoryId, data.modality_ids);
  }

  // Retornar a categoria completa
  return await getCategoryById(categoryId);
};

/**
 * Delete a category
 */
export const deleteCategory = async (categoryId: string): Promise<boolean> => {
  // Verificar se há registrations associadas
  const registrationsCheck = await query(
    `SELECT COUNT(*) as count FROM registrations WHERE category_id = $1`,
    [categoryId]
  );

  const registrationCount = parseInt(registrationsCheck.rows[0].count);
  if (registrationCount > 0) {
    throw new Error(
      `Não é possível excluir a categoria pois existem ${registrationCount} inscrição(ões) associada(s).`
    );
  }

  // As associações com modalidades serão deletadas em cascata
  const result = await query(
    `DELETE FROM categories WHERE id = $1`,
    [categoryId]
  );

  return result.rowCount !== null && result.rowCount > 0;
};

/**
 * Set category modalities (replace all associations)
 */
export const setCategoryModalities = async (
  categoryId: string,
  modalityIds: string[]
): Promise<void> => {
  // Verificar se a categoria existe
  const categoryCheck = await query(
    `SELECT id FROM categories WHERE id = $1`,
    [categoryId]
  );

  if (categoryCheck.rows.length === 0) {
    throw new Error('Category not found');
  }

  // Verificar se todas as modalidades existem
  if (modalityIds.length > 0) {
    const modalitiesCheck = await query(
      `SELECT id FROM modalities WHERE id = ANY($1::UUID[])`,
      [modalityIds]
    );

    if (modalitiesCheck.rows.length !== modalityIds.length) {
      throw new Error('One or more modalities not found');
    }
  }

  // Remover todas as associações existentes
  await query(
    `DELETE FROM category_modalities WHERE category_id = $1`,
    [categoryId]
  );

  // Inserir novas associações
  if (modalityIds.length > 0) {
    for (const modalityId of modalityIds) {
      await query(
        `INSERT INTO category_modalities (category_id, modality_id) 
         VALUES ($1, $2) 
         ON CONFLICT (category_id, modality_id) DO NOTHING`,
        [categoryId, modalityId]
      );
    }
  }
};

/**
 * Get modality IDs for a category
 */
export const getCategoryModalityIds = async (categoryId: string): Promise<string[]> => {
  const result = await query(
    `SELECT modality_id FROM category_modalities WHERE category_id = $1`,
    [categoryId]
  );

  return result.rows.map((row) => row.modality_id);
};

