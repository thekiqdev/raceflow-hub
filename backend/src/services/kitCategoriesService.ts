import { query } from '../config/database.js';

// Local interface to avoid circular dependency
interface EventKit {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  price: number;
  display_order: number;
  created_at: Date | null;
  products?: any[];
  category_ids?: string[];
}

/**
 * Get category IDs associated with a kit
 */
export const getKitCategories = async (kitId: string): Promise<string[]> => {
  const result = await query(
    `SELECT category_id FROM kit_categories WHERE kit_id = $1`,
    [kitId]
  );

  return result.rows.map((row) => row.category_id);
};

/**
 * Get kit IDs associated with a category
 */
export const getCategoryKits = async (categoryId: string): Promise<string[]> => {
  const result = await query(
    `SELECT kit_id FROM kit_categories WHERE category_id = $1`,
    [categoryId]
  );

  return result.rows.map((row) => row.kit_id);
};

/**
 * Associate a kit to categories (replaces existing associations)
 * If categoryIds is empty or null, removes all associations (kit becomes available for all categories)
 * 
 * @param kitId - ID of the kit
 * @param categoryIds - Array of category IDs to associate with the kit
 */
export const associateKitToCategories = async (
  kitId: string,
  categoryIds: string[] | null | undefined
): Promise<void> => {
  // Get kit's event_id to validate categories belong to the same event
  const kitResult = await query(
    `SELECT event_id FROM event_kits WHERE id = $1`,
    [kitId]
  );

  if (kitResult.rows.length === 0) {
    throw new Error('Kit not found');
  }

  const eventId = kitResult.rows[0].event_id;

  // If categoryIds is empty/null, remove all associations
  if (!categoryIds || categoryIds.length === 0) {
    await query(
      `DELETE FROM kit_categories WHERE kit_id = $1`,
      [kitId]
    );
    return;
  }

  // Validate that all categories belong to the same event
  const categoriesResult = await query(
    `SELECT id FROM categories WHERE id = ANY($1::UUID[]) AND event_id = $2`,
    [categoryIds, eventId]
  );

  if (categoriesResult.rows.length !== categoryIds.length) {
    throw new Error('One or more categories not found or belong to different event');
  }

  // Remove existing associations
  await query(
    `DELETE FROM kit_categories WHERE kit_id = $1`,
    [kitId]
  );

  // Insert new associations
  if (categoryIds.length > 0) {
    const values = categoryIds.map((categoryId, index) => 
      `($${index * 2 + 1}, $${index * 2 + 2})`
    ).join(', ');

    const params: string[] = [];
    categoryIds.forEach(categoryId => {
      params.push(kitId, categoryId);
    });

    await query(
      `INSERT INTO kit_categories (kit_id, category_id) VALUES ${values}`,
      params
    );
  }
};

/**
 * Remove a specific kit-category association
 */
export const removeKitCategoryAssociation = async (
  kitId: string,
  categoryId: string
): Promise<void> => {
  await query(
    `DELETE FROM kit_categories WHERE kit_id = $1 AND category_id = $2`,
    [kitId, categoryId]
  );
};

/**
 * Get kits available for a specific category
 * Returns kits that are either:
 * - Associated with the category, OR
 * - Not associated with any category (available for all categories)
 * 
 * @param categoryId - ID of the category
 * @param eventId - ID of the event (for validation)
 */
export const getKitsByCategory = async (
  categoryId: string,
  eventId: string
): Promise<EventKit[]> => {
  // Validate category belongs to event
  const categoryResult = await query(
    `SELECT id FROM categories WHERE id = $1 AND event_id = $2`,
    [categoryId, eventId]
  );

  if (categoryResult.rows.length === 0) {
    throw new Error('Category not found or does not belong to event');
  }

  // Get kits that are:
  // 1. Associated with this category, OR
  // 2. Not associated with any category (available for all)
  const result = await query(
    `SELECT DISTINCT k.*
     FROM event_kits k
     WHERE k.event_id = $1
       AND (
         k.id IN (
           SELECT kit_id FROM kit_categories WHERE category_id = $2
         )
         OR k.id NOT IN (
           SELECT DISTINCT kit_id FROM kit_categories
         )
       )
     ORDER BY k.display_order ASC`,
    [eventId, categoryId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    event_id: row.event_id,
    name: row.name,
    description: row.description,
    price: parseFloat(row.price) || 0,
    display_order: row.display_order,
    created_at: row.created_at,
  }));
};
