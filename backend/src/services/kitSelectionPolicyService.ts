import { query } from '../config/database.js';

/** Mesmo contrato de ProductSelection em registrationsService (evita import circular). */
type ProductSelectionInput = {
  product_id: string;
  variant_id?: string;
  attribute_selections?: Record<string, string>;
};

/**
 * Rollout seguro: quando ativo, criação de inscrição falha se o kit exigir seleções
 * canônicas em registration_product_selections e estas não forem persistidas.
 *
 * Variável de ambiente: STRICT_KIT_SELECTIONS=true|1|yes
 */
export function isStrictKitSelectionsEnabled(): boolean {
  const v = process.env.STRICT_KIT_SELECTIONS?.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

export type KitVariableProductRow = { id: string; name: string };

/**
 * Kit exige pelo menos uma linha em registration_product_selections quando existe produto
 * variável com variant_attributes não vazio (mesmo critério da auditoria operacional).
 */
export async function kitRequiresPersistedProductSelections(kitId: string): Promise<boolean> {
  const r = await query(
    `SELECT 1
     FROM kit_products kp
     WHERE kp.kit_id = $1
       AND kp.type = 'variable'
       AND kp.variant_attributes IS NOT NULL
       AND jsonb_typeof(kp.variant_attributes) = 'array'
       AND jsonb_array_length(kp.variant_attributes) > 0
     LIMIT 1`,
    [kitId]
  );
  return r.rows.length > 0;
}

/** Produtos variáveis do kit que exigem escolha (variant_attributes configurado). */
export async function getVariableKitProductsRequiringSelection(
  kitId: string
): Promise<KitVariableProductRow[]> {
  const r = await query(
    `SELECT kp.id, kp.name
     FROM kit_products kp
     WHERE kp.kit_id = $1
       AND kp.type = 'variable'
       AND kp.variant_attributes IS NOT NULL
       AND jsonb_typeof(kp.variant_attributes) = 'array'
       AND jsonb_array_length(kp.variant_attributes) > 0
     ORDER BY kp.name`,
    [kitId]
  );
  return (r.rows as { id: string; name: string }[]).map((row) => ({
    id: String(row.id),
    name: String(row.name),
  }));
}

/**
 * Modo estrito: garante payload mínimo antes de INSERT, espelhando a validação de
 * completeInvitationRegistration para kits com produtos variáveis.
 */
export async function validateCreateRegistrationKitSelectionsStrict(data: {
  kit_id?: string;
  product_selections?: ProductSelectionInput[];
}): Promise<void> {
  if (!isStrictKitSelectionsEnabled()) return;
  if (!data.kit_id) return;

  const required = await getVariableKitProductsRequiringSelection(data.kit_id);
  if (required.length === 0) return;

  const selections = data.product_selections || [];
  for (const p of required) {
    const sel = selections.find((s) => s.product_id === p.id);
    if (!sel) {
      throw new Error(
        `O kit selecionado exige escolha de variante. Selecione o produto "${p.name}".`
      );
    }
    const hasAttr =
      sel.attribute_selections && Object.keys(sel.attribute_selections).length > 0;
    if (!sel.variant_id && !hasAttr) {
      throw new Error(`Informe a variante para o produto "${p.name}".`);
    }
  }
}

export async function countRegistrationProductSelectionRows(registrationId: string): Promise<number> {
  const r = await query(
    `SELECT COUNT(*)::int AS c FROM registration_product_selections WHERE registration_id = $1`,
    [registrationId]
  );
  return parseInt(String(r.rows[0]?.c ?? '0'), 10) || 0;
}
