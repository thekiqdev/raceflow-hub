import { query } from '../config/database.js';
import { registrationConsumesVariantStockSql } from './variantStockPolicyService.js';
import { parseVariantAttributesFromDb, inferAttributeNamesFromVariantNames } from './kitProductVariantAttributesInference.js';

export interface SelectionInput {
  product_id: string;
  variant_id?: string;
  attribute_selections?: Record<string, string>;
}
export interface CanonicalSelection {
  product_id: string;
  variant_id: string;
  attributes: Record<string, string>;
}

const invalid = (message: string) => Object.assign(new Error(message), { statusCode: 400 });

/** Deve ser executado na transação de gravação; resolve combinações, não valores isolados. */
export async function resolveRegistrationSelections(
  kitId: string | null | undefined,
  eventId: string,
  selections: SelectionInput[] = [],
  requireComplete = true,
): Promise<CanonicalSelection[]> {
  if (!kitId) {
    if (selections.length) throw invalid('Informe o kit das seleções.');
    return [];
  }
  const kit = await query('SELECT id FROM event_kits WHERE id = $1 AND event_id = $2 FOR SHARE', [kitId, eventId]);
  if (!kit.rows.length) throw invalid('Kit não pertence ao evento.');
  const products = await query('SELECT id, name, type, variant_attributes FROM kit_products WHERE kit_id = $1 ORDER BY id FOR SHARE', [kitId]);
  const seen = new Set<string>();
  const canonical: CanonicalSelection[] = [];
  for (const selection of [...selections].sort((a, b) => a.product_id.localeCompare(b.product_id))) {
    const product = products.rows.find(p => p.id === selection.product_id);
    if (!product) throw invalid('Produto da seleção não pertence ao kit.');
    if (seen.has(product.id)) throw invalid('Um produto não pode ter duas escolhas na mesma inscrição.');
    seen.add(product.id);
    const variants = await query('SELECT id, name FROM product_variants WHERE product_id = $1 ORDER BY id FOR UPDATE', [product.id]);
    const attributes = parseVariantAttributesFromDb(product.variant_attributes)
      ?? inferAttributeNamesFromVariantNames(variants.rows) ?? [];
    const supplied = selection.attribute_selections ?? {};
    let variant = selection.variant_id ? variants.rows.find(v => v.id === selection.variant_id) : undefined;
    if (selection.variant_id && !variant) throw invalid('Variante não pertence ao produto selecionado.');
    if (!variant && attributes.length) {
      const matches = variants.rows.filter(v => {
        const values = String(v.name).split(' - ').map(s => s.trim());
        return values.length === attributes.length && attributes.every((a, i) => supplied[a]?.trim() === values[i]);
      });
      if (matches.length === 1) variant = matches[0];
    }
    if (!variant) {
      if (product.type === 'unique' && !Object.keys(supplied).length) continue;
      throw invalid(`Selecione uma combinação válida para o produto "${product.name}".`);
    }
    const values = String(variant.name).split(' - ').map(s => s.trim());
    const resolved = attributes.length && values.length === attributes.length
      ? Object.fromEntries(attributes.map((a, i) => [a, values[i]]))
      : { Variante: String(variant.name) };
    for (const [attribute, value] of Object.entries(supplied)) {
      if (resolved[attribute] !== value.trim()) throw invalid(`A escolha de "${product.name}" não corresponde à variante informada.`);
    }
    canonical.push({ product_id: product.id, variant_id: variant.id, attributes: resolved });
  }
  if (requireComplete) {
    for (const product of products.rows.filter(p => p.type === 'variable')) {
      if (!canonical.some(s => s.product_id === product.id)) {
        throw invalid(`Selecione a variante para o produto "${product.name}".`);
      }
    }
  }
  return canonical;
}

/** Bloqueio ordenado e leitura do saldo na mesma conexão. NULL é ilimitado. */
export async function reserveSelectionStock(
  selections: CanonicalSelection[], eventId: string, excludeRegistrationId?: string,
): Promise<void> {
  for (const id of [...new Set(selections.map(s => s.variant_id))].sort()) {
    const variant = await query('SELECT available_quantity FROM product_variants WHERE id = $1 FOR UPDATE', [id]);
    if (!variant.rows.length) throw invalid('Variante não encontrada.');
    if (variant.rows[0].available_quantity == null) continue;
    const usage = await query(
      `SELECT COUNT(DISTINCT r.id)::int AS count FROM registration_product_selections s
       JOIN registrations r ON r.id = s.registration_id
       WHERE s.variant_id = $1 AND r.event_id = $2 AND ${registrationConsumesVariantStockSql('r')}
       AND ($3::uuid IS NULL OR r.id <> $3)`, [id, eventId, excludeRegistrationId ?? null]);
    if (Number(usage.rows[0].count) >= Number(variant.rows[0].available_quantity)) {
      throw Object.assign(new Error('Estoque desta variante esgotado. Escolha outra opção.'), { statusCode: 409 });
    }
  }
}

export async function saveCanonicalSelections(registrationId: string, selections: CanonicalSelection[]): Promise<void> {
  for (const selection of selections) {
    for (const [name, value] of Object.entries(selection.attributes)) {
      await query(
        `INSERT INTO registration_product_selections
         (registration_id, product_id, variant_id, attribute_name, attribute_value) VALUES ($1,$2,$3,$4,$5)`,
        [registrationId, selection.product_id, selection.variant_id, name, value]);
    }
  }
}
