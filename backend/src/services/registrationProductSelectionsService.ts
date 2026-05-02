import { query } from '../config/database.js';
import { registrationConsumesVariantStockSql } from './variantStockPolicyService.js';

export interface AttributeSelectionStats {
  kit_id: string;
  kit_name: string;
  product_id: string;
  product_name: string;
  attribute_name: string;
  attribute_value: string;
  selection_count: number;
  variant_price?: number | null;
}

export interface RegistrationProductSelection {
  product_id: string;
  product_name: string;
  variant_id: string | null;
  variant_name: string | null;
  attribute_name: string;
  attribute_value: string;
}

/**
 * Get statistics about attribute selections for an event
 * Returns count of how many times each attribute value was selected
 */
export const getAttributeSelectionStats = async (eventId: string): Promise<AttributeSelectionStats[]> => {
  const result = await query(
    `SELECT 
      k.id as kit_id,
      k.name as kit_name,
      p.id as product_id,
      p.name as product_name,
      rps.attribute_name,
      rps.attribute_value,
      COUNT(*) as selection_count,
      MAX(pv.price) as variant_price
    FROM registration_product_selections rps
    INNER JOIN registrations r ON rps.registration_id = r.id
    INNER JOIN kit_products p ON rps.product_id = p.id
    INNER JOIN event_kits k ON p.kit_id = k.id
    LEFT JOIN product_variants pv ON rps.variant_id = pv.id
    WHERE r.event_id = $1
      AND ${registrationConsumesVariantStockSql('r')}
    GROUP BY k.id, k.name, p.id, p.name, rps.attribute_name, rps.attribute_value
    ORDER BY k.name, p.name, rps.attribute_name, rps.attribute_value`,
    [eventId]
  );

  return result.rows.map((row) => ({
    kit_id: row.kit_id,
    kit_name: row.kit_name,
    product_id: row.product_id,
    product_name: row.product_name,
    attribute_name: row.attribute_name,
    attribute_value: row.attribute_value,
    selection_count: parseInt(row.selection_count) || 0,
    variant_price: row.variant_price ? parseFloat(row.variant_price) : null,
  }));
};

/**
 * Get product selections for a specific registration
 * Returns all product and variant selections made during registration
 */
export const getRegistrationProductSelections = async (registrationId: string): Promise<RegistrationProductSelection[]> => {
  const result = await query(
    `SELECT 
      rps.product_id,
      p.name as product_name,
      rps.variant_id,
      pv.name as variant_name,
      rps.attribute_name,
      rps.attribute_value
    FROM registration_product_selections rps
    INNER JOIN kit_products p ON rps.product_id = p.id
    LEFT JOIN product_variants pv ON rps.variant_id = pv.id
    WHERE rps.registration_id = $1
    ORDER BY p.name, rps.attribute_name, rps.attribute_value`,
    [registrationId]
  );

  return result.rows.map((row) => ({
    product_id: row.product_id,
    product_name: row.product_name,
    variant_id: row.variant_id,
    variant_name: row.variant_name,
    attribute_name: row.attribute_name,
    attribute_value: row.attribute_value,
  }));
};
