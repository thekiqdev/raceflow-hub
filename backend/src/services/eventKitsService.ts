import { query } from '../config/database.js';
import { registrationConsumesVariantStockSql } from './variantStockPolicyService.js';
import { getKitCategories, associateKitToCategories } from './kitCategoriesService.js';
import { getEventById } from './eventsService.js';
import { resolveVariantAttributesForKitProductSync } from './kitProductVariantAttributesInference.js';

export interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  variant_group_name?: string | null;
  available_quantity?: number | null;
  sku?: string | null;
  created_at: Date | null;
}

export interface KitProduct {
  id: string;
  kit_id: string;
  name: string;
  description: string | null;
  type: 'variable' | 'unique';
  image_url: string | null;
  variant_attributes?: string[] | null; // Array of attribute names in order
  created_at: Date | null;
  variants?: ProductVariant[];
}

export interface EventKit {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  price: number;
  display_order: number;
  deleted_at?: Date | null;
  created_at: Date | null;
  products?: KitProduct[];
  category_ids?: string[]; // IDs das categorias associadas ao kit (opcional para compatibilidade retroativa)
}

/**
 * Helper function to convert event slug or UUID to UUID
 */
async function getEventIdFromSlugOrId(eventIdOrSlug: string): Promise<string | null> {
  // Check if it's already a UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(eventIdOrSlug)) {
    return eventIdOrSlug;
  }
  
  // If it's a slug, get the event to find the UUID
  const event = await getEventById(eventIdOrSlug);
  return event?.id || null;
}

const columnExists = async (tableName: string, columnName: string): Promise<boolean> => {
  const result = await query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1`,
    [tableName, columnName]
  );
  return (result.rowCount ?? 0) > 0;
};

const eventKitsHasDeletedAt = async (): Promise<boolean> => {
  return columnExists('event_kits', 'deleted_at');
};

const activeKitWhereClause = async (alias = ''): Promise<string> => {
  if (!(await eventKitsHasDeletedAt())) return '';
  const prefix = alias ? `${alias}.` : '';
  return ` AND ${prefix}deleted_at IS NULL`;
};

const mapEventKitRow = (row: any): EventKit => ({
  id: row.id,
  event_id: row.event_id,
  name: row.name,
  description: row.description,
  price: parseFloat(row.price) || 0,
  display_order: row.display_order,
  deleted_at: row.deleted_at ?? null,
  created_at: row.created_at,
});

/**
 * Get all kits for an event with products and variants
 * @param eventIdOrSlug - ID or slug of the event
 * @param categoryId - Optional category ID to filter kits (somente kits explicitamente vinculados a essa categoria em kit_categories)
 */
export const getEventKits = async (eventIdOrSlug: string, categoryId?: string): Promise<EventKit[]> => {
  // Convert slug to UUID if necessary
  const eventId = await getEventIdFromSlugOrId(eventIdOrSlug);
  if (!eventId) {
    return [];
  }
  let queryText: string;
  let queryParams: any[];

  if (categoryId) {
    const activeClause = await activeKitWhereClause('k');
    // Somente kits com vínculo explícito à categoria (sem "fallback" para kits sem associação)
    queryText = `
      SELECT DISTINCT k.*
      FROM event_kits k
      INNER JOIN kit_categories kc ON kc.kit_id = k.id AND kc.category_id = $2::uuid
      WHERE k.event_id = $1
      ${activeClause}
      ORDER BY k.display_order ASC
    `;
    queryParams = [eventId, categoryId];
  } else {
    const activeClause = await activeKitWhereClause();
    // Get all kits for the event
    queryText = `SELECT * FROM event_kits WHERE event_id = $1${activeClause} ORDER BY display_order ASC`;
    queryParams = [eventId];
  }

  const kitsResult = await query(queryText, queryParams);

  const kits: EventKit[] = kitsResult.rows.map(mapEventKitRow);

  // Usage count per variant in this event (inscrições não canceladas que escolheram cada variante)
  const usageResult = await query(
    `SELECT rps.variant_id, COUNT(DISTINCT rps.registration_id)::int AS usage_count
     FROM registration_product_selections rps
     INNER JOIN registrations r ON r.id = rps.registration_id AND ${registrationConsumesVariantStockSql('r')}
     WHERE r.event_id = $1 AND rps.variant_id IS NOT NULL
     GROUP BY rps.variant_id`,
    [eventId]
  );
  const usageByVariant = new Map<string, number>(
    usageResult.rows.map((r: any) => [r.variant_id, parseInt(r.usage_count) || 0])
  );

  // Get category_ids and products for each kit
  for (const kit of kits) {
    // Get category_ids for this kit
    const categoryIds = await getKitCategories(kit.id);
    kit.category_ids = categoryIds.length > 0 ? categoryIds : undefined;

    // Get products for this kit
    const productsResult = await query(
      `SELECT * FROM kit_products WHERE kit_id = $1 ORDER BY name ASC`,
      [kit.id]
    );

    const products: KitProduct[] = productsResult.rows.map((row) => ({
      id: row.id,
      kit_id: row.kit_id,
      name: row.name,
      description: row.description,
      type: row.type as 'variable' | 'unique',
      image_url: row.image_url,
      variant_attributes: row.variant_attributes ? JSON.parse(JSON.stringify(row.variant_attributes)) : null,
      created_at: row.created_at,
    }));

    // Get variants for variable products; available_quantity = estoque restante (inclui inscrições anteriores)
    for (const product of products) {
      if (product.type === 'variable') {
        const variantsResult = await query(
          `SELECT * FROM product_variants WHERE product_id = $1 ORDER BY created_at ASC`,
          [product.id]
        );

        product.variants = variantsResult.rows.map((row) => {
          const baseQty = row.available_quantity != null ? parseInt(row.available_quantity) : null;
          const usage = usageByVariant.get(row.id) || 0;
          const remaining =
            baseQty === null ? null : Math.max(0, baseQty - usage);
          return {
            id: row.id,
            product_id: row.product_id,
            name: row.name,
            variant_group_name: row.variant_group_name || null,
            available_quantity: remaining,
            sku: row.sku || null,
            price: row.price ? parseFloat(row.price) : null,
            created_at: row.created_at,
          };
        });
      }
    }

    kit.products = products;
  }

  return kits;
};

/**
 * Carrega produtos e variantes de um kit no contexto do evento (mesma regra de estoque que getEventKits).
 * Valida que o kit pertence ao evento. Não aplica filtro por categoria — base para edição de inscrição.
 */
export const loadKitProductsWithStockForEvent = async (
  kitId: string,
  eventId: string
): Promise<{ kit: EventKit; products: KitProduct[] } | null> => {
  const kitResult = await query(`SELECT * FROM event_kits WHERE id = $1 AND event_id = $2`, [kitId, eventId]);
  if (kitResult.rows.length === 0) {
    return null;
  }

  const row = kitResult.rows[0];
  const kit: EventKit = mapEventKitRow(row);

  const usageResult = await query(
    `SELECT rps.variant_id, COUNT(DISTINCT rps.registration_id)::int AS usage_count
     FROM registration_product_selections rps
     INNER JOIN registrations r ON r.id = rps.registration_id AND ${registrationConsumesVariantStockSql('r')}
     WHERE r.event_id = $1 AND rps.variant_id IS NOT NULL
     GROUP BY rps.variant_id`,
    [eventId]
  );
  const usageByVariant = new Map<string, number>(
    usageResult.rows.map((r: any) => [r.variant_id, parseInt(r.usage_count) || 0])
  );

  const productsResult = await query(`SELECT * FROM kit_products WHERE kit_id = $1 ORDER BY name ASC`, [kitId]);

  const products: KitProduct[] = productsResult.rows.map((r) => ({
    id: r.id,
    kit_id: r.kit_id,
    name: r.name,
    description: r.description,
    type: r.type as 'variable' | 'unique',
    image_url: r.image_url,
    variant_attributes: r.variant_attributes ? JSON.parse(JSON.stringify(r.variant_attributes)) : null,
    created_at: r.created_at,
  }));

  for (const product of products) {
    if (product.type === 'variable') {
      const variantsResult = await query(
        `SELECT * FROM product_variants WHERE product_id = $1 ORDER BY created_at ASC`,
        [product.id]
      );

      product.variants = variantsResult.rows.map((vr) => {
        const baseQty = vr.available_quantity != null ? parseInt(vr.available_quantity) : null;
        const usage = usageByVariant.get(vr.id) || 0;
        const remaining = baseQty === null ? null : Math.max(0, baseQty - usage);
        return {
          id: vr.id,
          product_id: vr.product_id,
          name: vr.name,
          variant_group_name: vr.variant_group_name || null,
          available_quantity: remaining,
          sku: vr.sku || null,
          price: vr.price ? parseFloat(vr.price) : null,
          created_at: vr.created_at,
        };
      });
    }
  }

  kit.products = products;
  return { kit, products };
};

/**
 * Get a kit by ID
 */
export const getEventKitById = async (kitId: string): Promise<EventKit | null> => {
  const result = await query(
    `SELECT * FROM event_kits WHERE id = $1`,
    [kitId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const kit: EventKit = mapEventKitRow(row);

  // Get category_ids
  const categoryIds = await getKitCategories(kit.id);
  kit.category_ids = categoryIds.length > 0 ? categoryIds : undefined;

  return kit;
};

/**
 * Create a new kit for an event
 */
export const createEventKit = async (data: {
  event_id: string;
  name: string;
  description?: string | null;
  price: number;
  display_order?: number;
}): Promise<EventKit> => {
  // Se display_order não foi fornecido, calcular como próximo valor
  let displayOrder = data.display_order;
  if (displayOrder === undefined) {
    const maxResult = await query(
      `SELECT COALESCE(MAX(display_order), 0) as max_order 
       FROM event_kits WHERE event_id = $1`,
      [data.event_id]
    );
    displayOrder = (maxResult.rows[0]?.max_order || 0) + 1;
  }

  const result = await query(
    `INSERT INTO event_kits (event_id, name, description, price, display_order)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      data.event_id,
      data.name,
      data.description || null,
      data.price,
      displayOrder,
    ]
  );

  return mapEventKitRow(result.rows[0]);
};

/**
 * Update an existing kit
 */
export const updateEventKit = async (
  kitId: string,
  data: {
    name?: string;
    description?: string | null;
    price?: number;
    display_order?: number;
  }
): Promise<EventKit | null> => {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${paramIndex}`);
    values.push(data.name);
    paramIndex++;
  }
  if (data.description !== undefined) {
    fields.push(`description = $${paramIndex}`);
    values.push(data.description);
    paramIndex++;
  }
  if (data.price !== undefined) {
    fields.push(`price = $${paramIndex}`);
    values.push(data.price);
    paramIndex++;
  }
  if (data.display_order !== undefined) {
    fields.push(`display_order = $${paramIndex}`);
    values.push(data.display_order);
    paramIndex++;
  }

  if (fields.length === 0) {
    throw new Error('No fields to update');
  }

  values.push(kitId);

  const result = await query(
    `UPDATE event_kits 
     SET ${fields.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapEventKitRow(result.rows[0]);
};

/**
 * Delete a kit
 */
export const deleteEventKit = async (kitId: string): Promise<boolean> => {
  const usageResult = await query(
    `SELECT COUNT(*)::int AS count
       FROM registrations
      WHERE kit_id = $1`,
    [kitId]
  );
  const linkedRegistrations = Number(usageResult.rows[0]?.count ?? 0) || 0;

  if (linkedRegistrations > 0) {
    if (await eventKitsHasDeletedAt()) {
      const result = await query(
        `UPDATE event_kits
            SET deleted_at = COALESCE(deleted_at, NOW())
          WHERE id = $1
          RETURNING id`,
        [kitId]
      );
      return (result.rowCount ?? 0) > 0;
    }

    throw new Error('Este kit possui inscrições vinculadas e não pode ser removido.');
  }

  const result = await query(
    `DELETE FROM event_kits WHERE id = $1`,
    [kitId]
  );

  return result.rowCount ? result.rowCount > 0 : false;
};

/**
 * Bulk create/update/delete kits for an event
 */
export interface SyncKitData {
  id?: string;
  name: string;
  description?: string | null;
  price: number;
  display_order?: number;
  category_ids?: string[]; // IDs das categorias associadas ao kit (opcional)
  products?: Array<{
    id?: string;
    name: string;
    description?: string | null;
    type: 'variable' | 'unique';
    image_url?: string | null;
    variant_attributes?: string[] | null;
    variants?: Array<{
      id?: string;
      name: string;
      variant_group_name?: string | null;
      available_quantity?: number | null;
      sku?: string | null;
    }>;
  }>;
}

export const syncEventKits = async (
  eventId: string,
  kits: SyncKitData[]
): Promise<EventKit[]> => {
  // Get existing kits
  const existing = await getEventKits(eventId);
  const existingIds = new Set(existing.map(k => k.id));

  // Delete kits that are not in the new list
  const newIds = new Set(kits.filter(k => k.id).map(k => k.id!));
  const toDelete = existing.filter(k => !newIds.has(k.id));
  
  for (const kit of toDelete) {
    await deleteEventKit(kit.id);
  }

  // Create or update kits
  const result: EventKit[] = [];
  for (const kitData of kits) {
    let kit: EventKit;
    
    if (kitData.id && existingIds.has(kitData.id)) {
      // Update existing
      const updated = await updateEventKit(kitData.id, {
        name: kitData.name,
        description: kitData.description,
        price: kitData.price,
        display_order: kitData.display_order,
      });
      if (!updated) continue;
      kit = updated;
    } else {
      // Create new
      kit = await createEventKit({
        event_id: eventId,
        name: kitData.name,
        description: kitData.description,
        price: kitData.price,
        display_order: kitData.display_order,
      });
    }

    // Sync products for this kit
    if (kitData.products && kitData.products.length > 0) {
      // Get existing products
      const existingProductsResult = await query(
        `SELECT id FROM kit_products WHERE kit_id = $1`,
        [kit.id]
      );
      const existingProductIds = new Set(existingProductsResult.rows.map(r => r.id));

      // Delete products that are not in the new list
      const newProductIds = new Set(kitData.products.filter(p => p.id).map(p => p.id!));
      const productsToDelete = existingProductsResult.rows
        .filter(r => !newProductIds.has(r.id))
        .map(r => r.id);
      
      for (const productId of productsToDelete) {
        await deleteKitProduct(productId);
      }

      // Create or update products
      for (const productData of kitData.products) {
        let product: KitProduct;
        
        const resolvedVariantAttributes = resolveVariantAttributesForKitProductSync(productData);

        if (productData.id && existingProductIds.has(productData.id)) {
          // Update existing product
          const updated = await updateKitProduct(productData.id, {
            name: productData.name,
            description: productData.description,
            type: productData.type,
            image_url: productData.image_url,
            variant_attributes: resolvedVariantAttributes,
          });
          if (!updated) continue;
          product = updated;
        } else {
          // Create new product
          product = await createKitProduct({
            kit_id: kit.id,
            name: productData.name,
            description: productData.description,
            type: productData.type,
            image_url: productData.image_url,
            variant_attributes: resolvedVariantAttributes,
          });
        }

        // Sync variants for variable products
        if (productData.type === 'variable') {
          // Get existing variants
          const existingVariantsResult = await query(
            `SELECT id FROM product_variants WHERE product_id = $1`,
            [product.id]
          );
          const existingVariantIds = new Set(existingVariantsResult.rows.map(r => r.id));

          if (productData.variants && productData.variants.length > 0) {
            // Delete variants that are not in the new list
            const newVariantIds = new Set(productData.variants.filter(v => v.id).map(v => v.id!));
            const variantsToDelete = existingVariantsResult.rows
              .filter(r => !newVariantIds.has(r.id))
              .map(r => r.id);
            
            for (const variantId of variantsToDelete) {
              await deleteProductVariant(variantId);
            }

            // Create or update variants
            for (const variantData of productData.variants) {
              if (variantData.id && existingVariantIds.has(variantData.id)) {
                // Update existing variant
                await updateProductVariant(variantData.id, {
                  name: variantData.name,
                  variant_group_name: variantData.variant_group_name || null,
                  available_quantity: variantData.available_quantity || null,
                  sku: variantData.sku || null,
                });
              } else {
                // Create new variant
                await createProductVariant({
                  product_id: product.id,
                  name: variantData.name,
                  variant_group_name: variantData.variant_group_name || null,
                  available_quantity: variantData.available_quantity || null,
                  sku: variantData.sku || null,
                });
              }
            }
          } else {
            // If product is variable but has no variants in payload, delete all existing variants
            // This allows clearing variants by sending an empty array
            for (const row of existingVariantsResult.rows) {
              await deleteProductVariant(row.id);
            }
          }
        }
      }
    } else {
      // If no products provided, delete all existing products for this kit
      const existingProductsResult = await query(
        `SELECT id FROM kit_products WHERE kit_id = $1`,
        [kit.id]
      );
      for (const row of existingProductsResult.rows) {
        await deleteKitProduct(row.id);
      }
    }

    // Process category associations for this kit
    if (kitData.category_ids !== undefined) {
      await associateKitToCategories(kit.id, kitData.category_ids);
    }

    result.push(kit);
  }

  // Return kits with products, variants, and category_ids loaded
  return await getEventKits(eventId);
};

/**
 * Create a new kit product
 */
export const createKitProduct = async (data: {
  kit_id: string;
  name: string;
  description?: string | null;
  type: 'variable' | 'unique';
  image_url?: string | null;
  variant_attributes?: string[] | null;
}): Promise<KitProduct> => {
  const result = await query(
    `INSERT INTO kit_products (kit_id, name, description, type, image_url, variant_attributes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      data.kit_id,
      data.name,
      data.description || null,
      data.type,
      data.image_url || null,
      data.variant_attributes && data.variant_attributes.length > 0
        ? JSON.stringify(data.variant_attributes)
        : null,
    ]
  );

  return {
    id: result.rows[0].id,
    kit_id: result.rows[0].kit_id,
    name: result.rows[0].name,
    description: result.rows[0].description,
    type: result.rows[0].type as 'variable' | 'unique',
    image_url: result.rows[0].image_url,
    variant_attributes: result.rows[0].variant_attributes ? JSON.parse(JSON.stringify(result.rows[0].variant_attributes)) : null,
    created_at: result.rows[0].created_at,
  };
};

/**
 * Update an existing kit product
 */
export const updateKitProduct = async (
  productId: string,
  data: {
    name?: string;
    description?: string | null;
    type?: 'variable' | 'unique';
    image_url?: string | null;
    variant_attributes?: string[] | null;
  }
): Promise<KitProduct | null> => {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${paramIndex}`);
    values.push(data.name);
    paramIndex++;
  }
  if (data.description !== undefined) {
    fields.push(`description = $${paramIndex}`);
    values.push(data.description);
    paramIndex++;
  }
  if (data.type !== undefined) {
    fields.push(`type = $${paramIndex}`);
    values.push(data.type);
    paramIndex++;
  }
  if (data.image_url !== undefined) {
    fields.push(`image_url = $${paramIndex}`);
    values.push(data.image_url);
    paramIndex++;
  }
  if (data.variant_attributes !== undefined) {
    fields.push(`variant_attributes = $${paramIndex}`);
    values.push(
      data.variant_attributes && data.variant_attributes.length > 0
        ? JSON.stringify(data.variant_attributes)
        : null
    );
    paramIndex++;
  }

  if (fields.length === 0) {
    throw new Error('No fields to update');
  }

  values.push(productId);

  const result = await query(
    `UPDATE kit_products 
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
    kit_id: result.rows[0].kit_id,
    name: result.rows[0].name,
    description: result.rows[0].description,
    type: result.rows[0].type as 'variable' | 'unique',
    image_url: result.rows[0].image_url,
    variant_attributes: result.rows[0].variant_attributes ? JSON.parse(JSON.stringify(result.rows[0].variant_attributes)) : null,
    created_at: result.rows[0].created_at,
  };
};

/**
 * Delete a kit product
 */
export const deleteKitProduct = async (productId: string): Promise<boolean> => {
  const result = await query(
    `DELETE FROM kit_products WHERE id = $1`,
    [productId]
  );

  return result.rowCount ? result.rowCount > 0 : false;
};

/**
 * Create a new product variant
 */
export const createProductVariant = async (data: {
  product_id: string;
  name: string;
  variant_group_name?: string | null;
  available_quantity?: number | null;
  sku?: string | null;
}): Promise<ProductVariant> => {
  const result = await query(
    `INSERT INTO product_variants (product_id, name, variant_group_name, available_quantity, sku)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      data.product_id,
      data.name,
      data.variant_group_name || null,
      data.available_quantity || null,
      data.sku || null,
    ]
  );

  return {
    id: result.rows[0].id,
    product_id: result.rows[0].product_id,
    name: result.rows[0].name,
    variant_group_name: result.rows[0].variant_group_name || null,
    available_quantity: result.rows[0].available_quantity ? parseInt(result.rows[0].available_quantity) : null,
    sku: result.rows[0].sku || null,
    created_at: result.rows[0].created_at,
  };
};

/**
 * Update an existing product variant
 */
export const updateProductVariant = async (
  variantId: string,
  data: {
    name?: string;
    variant_group_name?: string | null;
    available_quantity?: number | null;
    sku?: string | null;
  }
): Promise<ProductVariant | null> => {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${paramIndex}`);
    values.push(data.name);
    paramIndex++;
  }
  if (data.variant_group_name !== undefined) {
    fields.push(`variant_group_name = $${paramIndex}`);
    values.push(data.variant_group_name);
    paramIndex++;
  }
  if (data.available_quantity !== undefined) {
    fields.push(`available_quantity = $${paramIndex}`);
    values.push(data.available_quantity);
    paramIndex++;
  }
  if (data.sku !== undefined) {
    fields.push(`sku = $${paramIndex}`);
    values.push(data.sku);
    paramIndex++;
  }

  if (fields.length === 0) {
    throw new Error('No fields to update');
  }

  values.push(variantId);

  const result = await query(
    `UPDATE product_variants 
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
    product_id: result.rows[0].product_id,
    name: result.rows[0].name,
    variant_group_name: result.rows[0].variant_group_name || null,
    available_quantity: result.rows[0].available_quantity ? parseInt(result.rows[0].available_quantity) : null,
    sku: result.rows[0].sku || null,
    created_at: result.rows[0].created_at,
  };
};

/**
 * Delete a product variant
 */
export const deleteProductVariant = async (variantId: string): Promise<boolean> => {
  const result = await query(
    `DELETE FROM product_variants WHERE id = $1`,
    [variantId]
  );

  return result.rowCount ? result.rowCount > 0 : false;
};

/**
 * Reorder event kits for an event
 * @param eventId Event ID
 * @param kitOrders Array of { id, display_order } pairs
 */
export const reorderEventKits = async (
  eventId: string,
  kitOrders: Array<{ id: string; display_order: number }>
): Promise<void> => {
  // Validar que todos os IDs pertencem ao evento
  const ids = kitOrders.map(k => k.id);
  const checkResult = await query(
    `SELECT id FROM event_kits WHERE id = ANY($1::UUID[]) AND event_id = $2`,
    [ids, eventId]
  );
  
  if (checkResult.rows.length !== ids.length) {
    throw new Error('One or more kits not found or belong to different event');
  }

  // Atualizar display_order em uma transação
  for (const { id, display_order } of kitOrders) {
    await query(
      `UPDATE event_kits SET display_order = $1 WHERE id = $2`,
      [display_order, id]
    );
  }
};

