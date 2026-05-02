/**
 * Normalização e inferência segura de `variant_attributes` para produtos `variable`.
 *
 * Regras:
 * - Inferência só quando os dados permitem conclusão consistente (sem adivinhar nomes “Cor/Tamanho” sem evidência).
 * - Prioridade: valor persistido no kit → nomes nas seleções canônicas da inscrição → nomes derivados dos nomes das variantes (segmentos separados por " - ").
 */

export type VariantAttributesSource = 'db' | 'canonical' | 'variants_inferred' | 'none';

const SPLIT_PATTERN = /\s*-\s*/;

function splitVariantName(name: string): string[] {
  return name.split(SPLIT_PATTERN).map((p) => p.trim()).filter(Boolean);
}

/** Aceita JSONB array de strings; rejeita objeto legado ou formato inválido. */
export function parseVariantAttributesFromDb(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const arr = raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim());
    return arr.length > 0 ? arr : null;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parseVariantAttributesFromDb(parsed);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Sync de kits: usa nomes explícitos quando há strings não vazias; senão infere a partir
 * dos nomes das variantes no payload ("A - B" → Opção 1, Opção 2).
 */
export function resolveVariantAttributesForKitProductSync(productData: {
  type: 'variable' | 'unique';
  variant_attributes?: string[] | null;
  variants?: Array<{ name: string | null | undefined }>;
}): string[] | null {
  const explicit = Array.isArray(productData.variant_attributes)
    ? productData.variant_attributes
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .map((x) => x.trim())
    : [];
  if (explicit.length > 0) {
    return explicit;
  }
  if (productData.type !== 'variable') {
    return null;
  }
  return inferAttributeNamesFromVariantNames(productData.variants || []);
}

export function inferAttributeNamesFromVariantNames(variants: Array<{ name: string | null | undefined }>): string[] | null {
  if (!variants.length) return null;
  const segmentCounts: number[] = [];
  for (const v of variants) {
    const n = (v.name || '').trim();
    if (!n) return null;
    const parts = splitVariantName(n);
    if (parts.length === 0) return null;
    segmentCounts.push(parts.length);
  }
  const first = segmentCounts[0]!;
  if (!segmentCounts.every((c) => c === first) || first < 1) return null;
  return Array.from({ length: first }, (_, i) => `Opção ${i + 1}`);
}

/**
 * Ordem: primeira aparição de cada attribute_name nas linhas canônicas.
 * Ignora `Variante` (valor único composto tratado no frontend ou pela inferência por variantes).
 */
export function inferAttributeNamesFromCanonicalRows(
  rows: Array<{ attribute_name: string; attribute_value: string }>
): string[] | null {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const an = (r.attribute_name || '').trim();
    if (!an || an === 'Variante') continue;
    if (!seen.has(an)) {
      seen.add(an);
      ordered.push(an);
    }
  }
  return ordered.length > 0 ? ordered : null;
}

export interface KitProductLike {
  type: string;
  variant_attributes?: unknown;
  variants?: Array<{ name: string | null | undefined }>;
}

export function resolveEffectiveVariantAttributes(
  product: KitProductLike,
  canonicalRowsForProduct: Array<{ attribute_name: string; attribute_value: string }>
): { attributes: string[]; source: VariantAttributesSource } {
  const fromDb = parseVariantAttributesFromDb(product.variant_attributes);
  if (fromDb && fromDb.length > 0) {
    return { attributes: fromDb, source: 'db' };
  }
  if (product.type !== 'variable') {
    return { attributes: [], source: 'none' };
  }

  const fromCanon = inferAttributeNamesFromCanonicalRows(canonicalRowsForProduct);
  if (fromCanon && fromCanon.length > 0) {
    return { attributes: fromCanon, source: 'canonical' };
  }

  const fromVariants = inferAttributeNamesFromVariantNames(product.variants || []);
  if (fromVariants && fromVariants.length > 0) {
    return { attributes: fromVariants, source: 'variants_inferred' };
  }

  return { attributes: [], source: 'none' };
}
