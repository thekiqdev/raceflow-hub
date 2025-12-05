import { query } from '../config/database.js';

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
  created_at: Date | null;
  products?: KitProduct[];
}

/**
 * Get all kits for an event with products and variants
 */
export const getEventKits = async (eventId: string): Promise<EventKit[]> => {
  const kitsResult = await query(
    `SELECT * FROM event_kits WHERE event_id = $1 ORDER BY price ASC, name ASC`,
    [eventId]
  );

  const kits: EventKit[] = kitsResult.rows.map((row) => ({
    id: row.id,
    event_id: row.event_id,
    name: row.name,
    description: row.description,
    price: parseFloat(row.price) || 0,
    created_at: row.created_at,
  }));

  // Get products for each kit
  for (const kit of kits) {
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

    // Get variants for variable products
    for (const product of products) {
      if (product.type === 'variable') {
        const variantsResult = await query(
          `SELECT * FROM product_variants WHERE product_id = $1 ORDER BY name ASC`,
          [product.id]
        );

        product.variants = variantsResult.rows.map((row) => ({
          id: row.id,
          product_id: row.product_id,
          name: row.name,
          variant_group_name: row.variant_group_name || null,
          available_quantity: row.available_quantity ? parseInt(row.available_quantity) : null,
          sku: row.sku || null,
          price: row.price ? parseFloat(row.price) : null,
          created_at: row.created_at,
        }));
      }
    }

    kit.products = products;
  }

  return kits;
};

/**
 * Create a new kit for an event
 */
export const createEventKit = async (data: {
  event_id: string;
  name: string;
  description?: string | null;
  price: number;
}): Promise<EventKit> => {
  const result = await query(
    `INSERT INTO event_kits (event_id, name, description, price)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      data.event_id,
      data.name,
      data.description || null,
      data.price,
    ]
  );

  return {
    id: result.rows[0].id,
    event_id: result.rows[0].event_id,
    name: result.rows[0].name,
    description: result.rows[0].description,
    price: parseFloat(result.rows[0].price) || 0,
    created_at: result.rows[0].created_at,
  };
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

  return {
    id: result.rows[0].id,
    event_id: result.rows[0].event_id,
    name: result.rows[0].name,
    description: result.rows[0].description,
    price: parseFloat(result.rows[0].price) || 0,
    created_at: result.rows[0].created_at,
  };
};

/**
 * Delete a kit
 */
export const deleteEventKit = async (kitId: string): Promise<boolean> => {
  const result = await query(
    `DELETE FROM event_kits WHERE id = $1`,
    [kitId]
  );

  return result.rowCount ? result.rowCount > 0 : false;
};

/**
 * Bulk create/update/delete kits for an event
 */
export const syncEventKits = async (
  eventId: string,
  kits: Array<{
    id?: string;
    name: string;
    description?: string | null;
    price: number;
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
  }>
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
        
        if (productData.id && existingProductIds.has(productData.id)) {
          // Update existing product
          const updated = await updateKitProduct(productData.id, {
            name: productData.name,
            description: productData.description,
            type: productData.type,
            image_url: productData.image_url,
            variant_attributes: productData.variant_attributes || null,
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
            variant_attributes: productData.variant_attributes || null,
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

    result.push(kit);
  }

  // Return kits with products and variants loaded
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
      data.variant_attributes ? JSON.stringify(data.variant_attributes) : null,
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
    values.push(data.variant_attributes ? JSON.stringify(data.variant_attributes) : null);
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

