import { query } from '../config/database.js';
import { Category, CategoryBatch, CreateCategoryData, UpdateCategoryData } from '../types/index.js';

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
     ORDER BY c.display_order ASC`,
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
    max_age: row.max_age ? parseInt(row.max_age) : null,
    max_participants: row.max_participants ? parseInt(row.max_participants) : null,
    is_default: row.is_default === true,
    display_order: row.display_order,
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
     ORDER BY c.display_order ASC`,
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
    max_age: row.max_age ? parseInt(row.max_age) : null,
    max_participants: row.max_participants ? parseInt(row.max_participants) : null,
    is_default: row.is_default === true,
    display_order: row.display_order,
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
    max_age: row.max_age ? parseInt(row.max_age) : null,
    max_participants: row.max_participants ? parseInt(row.max_participants) : null,
    is_default: row.is_default === true,
    display_order: row.display_order,
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
  
  // Se display_order não foi fornecido, calcular como próximo valor
  let displayOrder = data.display_order;
  if (displayOrder === undefined) {
    const maxResult = await query(
      `SELECT COALESCE(MAX(display_order), 0) as max_order 
       FROM categories WHERE event_id = $1`,
      [data.event_id]
    );
    displayOrder = (maxResult.rows[0]?.max_order || 0) + 1;
  }

  // Inserir a categoria
  const result = await query(
    `INSERT INTO categories (event_id, name, price, category_type, gender, min_age, max_age, max_participants, is_default, display_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
     [
       data.event_id,
       data.name,
       data.price,
       data.category_type,
       data.gender,
       data.min_age || null,
       data.max_age || null,
       data.max_participants || null,
       shouldBeDefault,
       displayOrder,
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

  // Always update min_age if provided (including null to clear it)
  if (data.min_age !== undefined) {
    fields.push(`min_age = $${paramIndex}`);
    values.push(data.min_age ?? null);
    paramIndex++;
  }

  // Always update max_age if provided (including null to clear it)
  if (data.max_age !== undefined) {
    fields.push(`max_age = $${paramIndex}`);
    values.push(data.max_age ?? null);
    paramIndex++;
    console.log(`🔧 [updateCategory] Adicionando max_age ao update:`, data.max_age);
  } else {
    console.log(`⚠️ [updateCategory] max_age não está definido no payload`);
  }

  if (data.max_participants !== undefined) {
    fields.push(`max_participants = $${paramIndex}`);
    values.push(data.max_participants);
    paramIndex++;
  }

  if (data.display_order !== undefined) {
    fields.push(`display_order = $${paramIndex}`);
    values.push(data.display_order);
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

/**
 * Reorder categories for an event
 * @param eventId Event ID
 * @param categoryOrders Array of { id, display_order } pairs
 */
export const reorderCategories = async (
  eventId: string,
  categoryOrders: Array<{ id: string; display_order: number }>
): Promise<void> => {
  // Validar que todos os IDs pertencem ao evento
  const ids = categoryOrders.map(c => c.id);
  const checkResult = await query(
    `SELECT id FROM categories WHERE id = ANY($1::UUID[]) AND event_id = $2`,
    [ids, eventId]
  );
  
  if (checkResult.rows.length !== ids.length) {
    throw new Error('One or more categories not found or belong to different event');
  }

  // Atualizar display_order em uma transação
  for (const { id, display_order } of categoryOrders) {
    await query(
      `UPDATE categories SET display_order = $1, updated_at = NOW() WHERE id = $2`,
      [display_order, id]
    );
  }
};

