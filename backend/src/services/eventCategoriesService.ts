import { query } from '../config/database.js';

export interface CategoryBatch {
  id: string;
  category_id: string;
  price: number;
  valid_from: Date | null;
  created_at: Date | null;
}

export interface EventCategory {
  id: string;
  event_id: string;
  name: string;
  distance: string;
  price: number;
  max_participants: number | null;
  created_at: Date | null;
  current_registrations?: number;
  available_spots?: number | null;
  batches?: CategoryBatch[];
}

/**
 * Get all categories for an event with registration counts
 */
export const getEventCategories = async (eventId: string): Promise<EventCategory[]> => {
  console.log('🔍 getEventCategories called with eventId:', eventId);
  
  // Primeiro, verificar se existem modalidades básicas (sem JOIN)
  const simpleCheck = await query(
    `SELECT id, event_id, name, distance, price, max_participants, created_at
     FROM event_categories 
     WHERE event_id = $1`,
    [eventId]
  );
  
  console.log('📋 Simple check - Modalidades encontradas (sem JOIN):', simpleCheck.rows.length);
  if (simpleCheck.rows.length > 0) {
    console.log('📋 Primeira modalidade encontrada:', JSON.stringify(simpleCheck.rows[0], null, 2));
  } else {
    console.warn('⚠️ NENHUMA MODALIDADE ENCONTRADA na tabela event_categories para este evento!');
    console.warn('⚠️ Verifique se as modalidades foram cadastradas corretamente.');
  }
  
  const result = await query(
    `SELECT 
      ec.*,
      COALESCE(reg_count.current_registrations, 0) as current_registrations,
      CASE 
        WHEN ec.max_participants IS NOT NULL THEN 
          ec.max_participants - COALESCE(reg_count.current_registrations, 0)
        ELSE NULL
      END as available_spots
    FROM event_categories ec
    LEFT JOIN (
      SELECT 
        category_id,
        COUNT(*) as current_registrations
      FROM registrations
      WHERE event_id = $1 
        AND status IN ('pending', 'confirmed')
        AND payment_status IN ('pending', 'paid')
      GROUP BY category_id
    ) reg_count ON ec.id = reg_count.category_id
    WHERE ec.event_id = $1 
    ORDER BY ec.price ASC, ec.name ASC`,
    [eventId]
  );

  console.log('📋 SQL query returned', result.rows.length, 'rows');
  console.log('📋 Raw rows:', JSON.stringify(result.rows, null, 2));

  const mappedCategories: EventCategory[] = result.rows.map((row) => ({
    id: row.id,
    event_id: row.event_id,
    name: row.name,
    distance: row.distance,
    price: parseFloat(row.price) || 0,
    max_participants: row.max_participants ? parseInt(row.max_participants) : null,
    created_at: row.created_at,
    current_registrations: parseInt(row.current_registrations) || 0,
    available_spots: row.available_spots !== null ? parseInt(row.available_spots) : undefined,
  }));

  // Get batches for each category
  for (const category of mappedCategories) {
    const batchesResult = await query(
      `SELECT * FROM category_batches 
       WHERE category_id = $1 
       ORDER BY valid_from ASC`,
      [category.id]
    );

    category.batches = batchesResult.rows.map((row) => ({
      id: row.id,
      category_id: row.category_id,
      price: parseFloat(row.price) || 0,
      valid_from: row.valid_from ? new Date(row.valid_from) : null,
      created_at: row.created_at,
    }));
  }

  console.log('📋 Mapped categories:', JSON.stringify(mappedCategories, null, 2));

  return mappedCategories;
};

/**
 * Create a new category for an event
 */
export const createEventCategory = async (data: {
  event_id: string;
  name: string;
  distance: string;
  price: number;
  max_participants?: number | null;
}): Promise<EventCategory> => {
  const result = await query(
    `INSERT INTO event_categories (event_id, name, distance, price, max_participants)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      data.event_id,
      data.name,
      data.distance,
      data.price,
      data.max_participants || null,
    ]
  );

  return {
    id: result.rows[0].id,
    event_id: result.rows[0].event_id,
    name: result.rows[0].name,
    distance: result.rows[0].distance,
    price: parseFloat(result.rows[0].price) || 0,
    max_participants: result.rows[0].max_participants ? parseInt(result.rows[0].max_participants) : null,
    created_at: result.rows[0].created_at,
  };
};

/**
 * Update an existing category
 */
export const updateEventCategory = async (
  categoryId: string,
  data: {
    name?: string;
    distance?: string;
    price?: number;
    max_participants?: number | null;
  }
): Promise<EventCategory | null> => {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${paramIndex}`);
    values.push(data.name);
    paramIndex++;
  }
  if (data.distance !== undefined) {
    fields.push(`distance = $${paramIndex}`);
    values.push(data.distance);
    paramIndex++;
  }
  if (data.price !== undefined) {
    fields.push(`price = $${paramIndex}`);
    values.push(data.price);
    paramIndex++;
  }
  if (data.max_participants !== undefined) {
    fields.push(`max_participants = $${paramIndex}`);
    values.push(data.max_participants);
    paramIndex++;
  }

  if (fields.length === 0) {
    throw new Error('No fields to update');
  }

  values.push(categoryId);

  const result = await query(
    `UPDATE event_categories 
     SET ${fields.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    return null;
  }

  return {
    id: result.rows[0].id,
    event_id: result.rows[0].event_id,
    name: result.rows[0].name,
    distance: result.rows[0].distance,
    price: parseFloat(result.rows[0].price) || 0,
    max_participants: result.rows[0].max_participants ? parseInt(result.rows[0].max_participants) : null,
    created_at: result.rows[0].created_at,
  };
};

/**
 * Delete a category
 */
export const deleteEventCategory = async (categoryId: string): Promise<boolean> => {
  const result = await query(
    `DELETE FROM event_categories WHERE id = $1`,
    [categoryId]
  );

  return result.rowCount ? result.rowCount > 0 : false;
};

/**
 * Bulk create/update/delete categories for an event
 */
export const syncEventCategories = async (
  eventId: string,
  categories: Array<{
    id?: string;
    name: string;
    distance: string;
    price: number;
    max_participants?: number | null;
    batches?: Array<{
      id?: string;
      price: number;
      valid_from: string | Date | null;
    }>;
  }>
): Promise<EventCategory[]> => {
  console.log('🔄 syncEventCategories called for event:', eventId);
  console.log('📋 Categories to sync:', JSON.stringify(categories, null, 2));
  
  // Get existing categories
  const existing = await getEventCategories(eventId);
  const existingIds = new Set(existing.map(c => c.id));

  // Delete categories that are not in the new list
  const newIds = new Set(categories.filter(c => c.id).map(c => c.id!));
  const toDelete = existing.filter(c => !newIds.has(c.id));
  
  for (const category of toDelete) {
    await deleteEventCategory(category.id);
  }

  // Create or update categories
  const result: EventCategory[] = [];
  for (let catIndex = 0; catIndex < categories.length; catIndex++) {
    const category = categories[catIndex];
    console.log(`\n🔄 Processing category ${catIndex + 1}/${categories.length}:`, {
      id: category.id,
      name: category.name,
      batchesCount: category.batches?.length || 0,
      batches: category.batches?.map(b => ({
        id: b.id,
        price: b.price,
        valid_from: b.valid_from,
        valid_from_type: typeof b.valid_from,
      })),
    });
    
    let categoryResult: EventCategory;
    
    if (category.id && existingIds.has(category.id)) {
      // Update existing
      console.log(`  ✏️ Updating existing category: ${category.id}`);
      const updated = await updateEventCategory(category.id, {
        name: category.name,
        distance: category.distance,
        price: category.price,
        max_participants: category.max_participants,
      });
      if (updated) {
        categoryResult = updated;
      } else {
        console.warn(`  ⚠️ Failed to update category ${category.id}`);
        continue;
      }
    } else {
      // Create new
      console.log(`  ➕ Creating new category: ${category.name}`);
      const created = await createEventCategory({
        event_id: eventId,
        name: category.name,
        distance: category.distance,
        price: category.price,
        max_participants: category.max_participants,
      });
      categoryResult = created;
    }

    // Sync batches for this category
    // Get existing batches from database
    const batchesResult = await query(
      `SELECT * FROM category_batches 
       WHERE category_id = $1 
       ORDER BY valid_from ASC`,
      [categoryResult.id]
    );
    const existingBatches = batchesResult.rows.map((row) => ({
      id: row.id,
      category_id: row.category_id,
      price: parseFloat(row.price) || 0,
      valid_from: row.valid_from,
      created_at: row.created_at,
    }));
    
    if (category.batches && category.batches.length > 0) {
      const existingBatchIds = new Set(existingBatches.map(b => b.id));
      
      // Delete batches that are not in the new list
      const newBatchIds = new Set(category.batches.filter(b => b.id).map(b => b.id!));
      const batchesToDelete = existingBatches.filter(b => !newBatchIds.has(b.id));
      
      for (const batch of batchesToDelete) {
        await deleteCategoryBatch(batch.id);
      }

      // Create or update batches
      for (let batchIndex = 0; batchIndex < category.batches.length; batchIndex++) {
        const batch = category.batches[batchIndex];
        console.log(`  📦 Processing batch ${batchIndex + 1}/${category.batches.length}:`, {
          id: batch.id,
          price: batch.price,
          valid_from_raw: batch.valid_from,
          valid_from_type: typeof batch.valid_from,
        });
        
        // Convert valid_from to Date or null
        let validFrom: Date | null = null;
        if (batch.valid_from != null && batch.valid_from !== '') {
          if (batch.valid_from instanceof Date) {
            validFrom = batch.valid_from;
            console.log(`    ✅ Using Date object: ${validFrom.toISOString()}`);
          } else if (typeof batch.valid_from === 'string') {
            const validFromStr = batch.valid_from.trim();
            if (validFromStr !== '') {
              // Parse ISO string (should already be in UTC from frontend)
              validFrom = new Date(validFromStr);
              // Check if date is valid
              if (isNaN(validFrom.getTime())) {
                console.warn(`    ⚠️ Invalid date string: "${validFromStr}"`);
                validFrom = null;
              } else {
                console.log(`    ✅ Date parsed: "${validFromStr}" -> ${validFrom.toISOString()}`);
              }
            } else {
              console.log(`    ℹ️ Empty string, setting to null`);
            }
          } else {
            console.warn(`    ⚠️ Unexpected type for valid_from: ${typeof batch.valid_from}`);
          }
        } else {
          console.log(`    ℹ️ valid_from is null/undefined/empty`);
        }
        
        if (batch.id && existingBatchIds.has(batch.id)) {
          // Update existing batch
          console.log(`    🔄 Updating existing batch ${batch.id}`);
          const updated = await updateCategoryBatch(batch.id, {
            price: batch.price,
            valid_from: validFrom,
          });
          if (updated) {
            console.log(`    ✅ Batch updated successfully. valid_from saved:`, updated.valid_from);
          } else {
            console.error(`    ❌ Failed to update batch ${batch.id}`);
          }
        } else {
          // Create new batch
          console.log(`    ➕ Creating new batch`, {
            price: batch.price,
            valid_from: validFrom ? validFrom.toISOString() : null,
          });
          const created = await createCategoryBatch({
            category_id: categoryResult.id,
            price: batch.price,
            valid_from: validFrom,
          });
          console.log(`    ✅ Batch created successfully. ID: ${created.id}, valid_from saved:`, created.valid_from);
        }
      }
    } else {
      // If no batches provided, delete all existing batches for this category
      const existingBatches = categoryResult.batches || [];
      for (const batch of existingBatches) {
        await deleteCategoryBatch(batch.id);
      }
    }

    // Reload category with batches
    const reloaded = await getEventCategories(eventId);
    const reloadedCategory = reloaded.find(c => c.id === categoryResult.id);
    if (reloadedCategory) {
      result.push(reloadedCategory);
    } else {
      result.push(categoryResult);
    }
  }

  return result;
};

/**
 * Create a category batch
 */
export const createCategoryBatch = async (data: {
  category_id: string;
  price: number;
  valid_from: Date | null;
}): Promise<CategoryBatch> => {
  console.log(`    💾 INSERT batch:`, {
    category_id: data.category_id,
    price: data.price,
    valid_from: data.valid_from ? data.valid_from.toISOString() : null,
    valid_from_type: data.valid_from ? typeof data.valid_from : 'null',
  });
  
  const result = await query(
    `INSERT INTO category_batches (category_id, price, valid_from)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [data.category_id, data.price, data.valid_from]
  );
  
  console.log(`    ✅ INSERT result:`, {
    id: result.rows[0].id,
    valid_from: result.rows[0].valid_from,
  });

  return {
    id: result.rows[0].id,
    category_id: result.rows[0].category_id,
    price: parseFloat(result.rows[0].price) || 0,
    valid_from: result.rows[0].valid_from,
    created_at: result.rows[0].created_at,
  };
};

/**
 * Update a category batch
 */
export const updateCategoryBatch = async (
  batchId: string,
  data: {
    price?: number;
    valid_from?: Date | null;
  }
): Promise<CategoryBatch | null> => {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.price !== undefined) {
    fields.push(`price = $${paramIndex}`);
    values.push(data.price);
    paramIndex++;
  }
  if (data.valid_from !== undefined) {
    fields.push(`valid_from = $${paramIndex}`);
    values.push(data.valid_from); // Can be Date or null
    console.log(`    💾 UPDATE batch ${batchId}:`, {
      valid_from: data.valid_from ? data.valid_from.toISOString() : null,
      valid_from_type: data.valid_from ? typeof data.valid_from : 'null',
    });
    paramIndex++;
  }

  if (fields.length === 0) {
    throw new Error('No fields to update');
  }

  values.push(batchId);

  const result = await query(
    `UPDATE category_batches 
     SET ${fields.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );
  
  if (result.rows.length > 0) {
    console.log(`    ✅ UPDATE result:`, {
      id: result.rows[0].id,
      valid_from: result.rows[0].valid_from,
    });
  }

  if (result.rows.length === 0) {
    return null;
  }

  return {
    id: result.rows[0].id,
    category_id: result.rows[0].category_id,
    price: parseFloat(result.rows[0].price) || 0,
    valid_from: result.rows[0].valid_from,
    created_at: result.rows[0].created_at,
  };
};

/**
 * Delete a category batch
 */
export const deleteCategoryBatch = async (batchId: string): Promise<boolean> => {
  const result = await query(
    'DELETE FROM category_batches WHERE id = $1',
    [batchId]
  );

  return result.rowCount ? result.rowCount > 0 : false;
};

