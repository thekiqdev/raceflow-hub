import { query } from '../config/database.js';

export type MissingKitProductSelectionRow = {
  registration_id: string;
  event_id: string;
  kit_id: string;
  status: string;
  runner_name: string | null;
  confirmation_code: string | null;
  created_at: string;
};

/**
 * Read-only audit: inscrições ativas com kit que possui produto variável configurado,
 * porém sem nenhuma linha em registration_product_selections.
 * Não altera dados. Limite de linhas para uso operacional.
 */
export async function findRegistrationsMissingKitProductSelections(params: {
  event_id?: string;
  limit?: number;
}): Promise<MissingKitProductSelectionRow[]> {
  const limit = Math.min(Math.max(params.limit ?? 2000, 1), 5000);
  const conditions: string[] = [
    `r.kit_id IS NOT NULL`,
    `r.status <> 'cancelled'`,
    `EXISTS (
      SELECT 1 FROM kit_products kp
      WHERE kp.kit_id = ek.id
        AND kp.type = 'variable'
        AND kp.variant_attributes IS NOT NULL
        AND jsonb_typeof(kp.variant_attributes) = 'array'
        AND jsonb_array_length(kp.variant_attributes) > 0
    )`,
    `NOT EXISTS (
      SELECT 1 FROM registration_product_selections rps WHERE rps.registration_id = r.id
    )`,
  ];
  const values: unknown[] = [];
  if (params.event_id) {
    values.push(params.event_id);
    conditions.push(`r.event_id = $${values.length}`);
  }
  values.push(limit);

  const sql = `
    SELECT r.id AS registration_id,
           r.event_id,
           r.kit_id,
           r.status::text AS status,
           p.full_name AS runner_name,
           r.confirmation_code,
           r.created_at::text AS created_at
    FROM registrations r
    INNER JOIN event_kits ek ON ek.id = r.kit_id
    LEFT JOIN profiles p ON p.id = r.runner_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY r.created_at DESC
    LIMIT $${values.length}
  `;

  const result = await query(sql, values);
  return result.rows.map((row: Record<string, unknown>) => ({
    registration_id: String(row.registration_id),
    event_id: String(row.event_id),
    kit_id: String(row.kit_id),
    status: String(row.status),
    runner_name: row.runner_name != null ? String(row.runner_name) : null,
    confirmation_code: row.confirmation_code != null ? String(row.confirmation_code) : null,
    created_at: String(row.created_at),
  }));
}
