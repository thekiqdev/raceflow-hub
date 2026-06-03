import { query } from '../config/database.js';
import { registrationConsumesVariantStockSql } from './variantStockPolicyService.js';

export type EventProductStockStatus = 'available' | 'low' | 'exhausted' | 'unlimited';

export interface EventProductStockVariationRow {
  product_id: string;
  product_name: string;
  variation_id: string;
  variation_name: string;
  stock_initial: number | null;
  stock_used: number;
  stock_available: number | null;
  status: EventProductStockStatus;
}

export interface EventProductStockReportSummary {
  products_count: number;
  stock_initial_total: number;
  stock_used_total: number;
  stock_available_total: number;
  exhausted_variations_count: number;
}

export interface EventProductStockReport {
  summary: EventProductStockReportSummary;
  variations: EventProductStockVariationRow[];
  low_stock_alerts: EventProductStockVariationRow[];
}

const LOW_STOCK_THRESHOLD = 10;

function parseNullableInt(value: unknown): number | null {
  if (value == null) return null;
  const parsed = parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function computeStockAvailable(stockInitial: number | null, stockUsed: number): number | null {
  if (stockInitial === null) return null;
  return Math.max(0, stockInitial - stockUsed);
}

function computeStockStatus(stockInitial: number | null, stockAvailable: number | null): EventProductStockStatus {
  if (stockInitial === null || stockAvailable === null) return 'unlimited';
  if (stockAvailable <= 0) return 'exhausted';
  if (stockAvailable <= LOW_STOCK_THRESHOLD) return 'low';
  return 'available';
}

function buildVariationRow(row: {
  product_id: string;
  product_name: string;
  variation_id: string;
  variation_name: string;
  stock_initial: unknown;
  stock_used: unknown;
}): EventProductStockVariationRow {
  const stockInitial = parseNullableInt(row.stock_initial);
  const stockUsed = parseNullableInt(row.stock_used) ?? 0;
  const stockAvailable = computeStockAvailable(stockInitial, stockUsed);
  const status = computeStockStatus(stockInitial, stockAvailable);

  return {
    product_id: row.product_id,
    product_name: row.product_name,
    variation_id: row.variation_id,
    variation_name: row.variation_name,
    stock_initial: stockInitial,
    stock_used: stockUsed,
    stock_available: stockAvailable,
    status,
  };
}

/**
 * Relatório read-only de estoque por variação de produto do evento.
 * Usa a mesma política de consumo de estoque do checkout (variantStockPolicyService).
 */
export async function getEventProductStockReport(eventId: string): Promise<EventProductStockReport> {
  const result = await query(
    `WITH usage AS (
       SELECT rps.variant_id, COUNT(DISTINCT rps.registration_id)::int AS usage_count
       FROM registration_product_selections rps
       INNER JOIN registrations r ON r.id = rps.registration_id AND ${registrationConsumesVariantStockSql('r')}
       WHERE r.event_id = $1 AND rps.variant_id IS NOT NULL
       GROUP BY rps.variant_id
     )
     SELECT
       p.id AS product_id,
       p.name AS product_name,
       pv.id AS variation_id,
       pv.name AS variation_name,
       pv.available_quantity AS stock_initial,
       COALESCE(u.usage_count, 0) AS stock_used
     FROM event_kits k
     INNER JOIN kit_products p ON p.kit_id = k.id
     INNER JOIN product_variants pv ON pv.product_id = p.id
     LEFT JOIN usage u ON u.variant_id = pv.id
     WHERE k.event_id = $1
     ORDER BY p.name ASC, pv.name ASC`,
    [eventId]
  );

  const variations = result.rows.map((row) => buildVariationRow(row));

  const trackedVariations = variations.filter((v) => v.stock_initial !== null);
  const productIds = new Set(variations.map((v) => v.product_id));

  const summary: EventProductStockReportSummary = {
    products_count: productIds.size,
    stock_initial_total: trackedVariations.reduce((sum, v) => sum + (v.stock_initial ?? 0), 0),
    stock_used_total: trackedVariations.reduce((sum, v) => sum + v.stock_used, 0),
    stock_available_total: trackedVariations.reduce((sum, v) => sum + (v.stock_available ?? 0), 0),
    exhausted_variations_count: trackedVariations.filter((v) => v.status === 'exhausted').length,
  };

  const low_stock_alerts = variations.filter(
    (v) => v.stock_available !== null && v.stock_available <= LOW_STOCK_THRESHOLD
  );

  return {
    summary,
    variations,
    low_stock_alerts,
  };
}
