import type { KitProduct } from "@/lib/api/eventKits";
import type { RegistrationProductSelectionRow } from "@/lib/utils/groupRegistrationProductSelections";

export type VariableKitProductSelectionPayload = {
  product_id: string;
  variant_id?: string;
  attribute_selections: Record<string, string>;
};

function normalizeKitProductName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Mesma regra usada em AdminRegistrations: monta `product_selections` a partir do estado local de atributos.
 * Com `requireAll: true`, exige todas as opções preenchidas para cada produto variável do kit (fluxo reescolha pós-409).
 */
export function buildProductSelectionsForVariableKit(
  kitProducts: KitProduct[],
  editingProductAttributes: Record<string, Record<string, string>>,
  options?: { requireAll?: boolean }
): VariableKitProductSelectionPayload[] | null {
  const requireAll = options?.requireAll ?? false;
  const variableProducts = kitProducts.filter(
    (p) => p.type === "variable" && p.variant_attributes && p.variant_attributes.length > 0
  );
  if (variableProducts.length === 0) return [];

  const out: VariableKitProductSelectionPayload[] = [];

  for (const product of variableProducts) {
    const attributes = editingProductAttributes[product.id] || {};
    const hasAttributes =
      Object.keys(attributes).length > 0 &&
      Object.values(attributes).some((val) => val && String(val).trim() !== "");
    if (!hasAttributes) {
      if (requireAll) return null;
      continue;
    }

    const attrNames = product.variant_attributes!;
    if (requireAll) {
      const allFilled = attrNames.every((attr) => attributes[attr]?.trim());
      if (!allFilled) return null;
    }

    let variantId: string | undefined;
    if (product.variants && product.variant_attributes) {
      const selectedValues = product.variant_attributes.map((attr) => attributes[attr] || "").filter(Boolean);
      if (selectedValues.length === product.variant_attributes.length) {
        const variant = product.variants.find((v) => {
          const variantValues = v.name.split(" - ").map((x) => x.trim());
          return product.variant_attributes!.every((attr, idx) => variantValues[idx] === attributes[attr]);
        });
        if (variant) variantId = variant.id;
      }
    }

    out.push({
      product_id: product.id,
      variant_id: variantId,
      attribute_selections: { ...attributes },
    });
  }

  if (requireAll && out.length !== variableProducts.length) return null;
  return out;
}

/**
 * Pré-preenche o estado de atributos a partir das linhas canônicas da inscrição.
 * Tenta casar por `product_id`; se o kit mudou, tenta pelo nome normalizado do produto.
 */
export function seedEditingAttributesFromCanonicalRows(
  kitProducts: KitProduct[],
  canonicalRows: RegistrationProductSelectionRow[] | undefined | null
): Record<string, Record<string, string>> {
  if (!canonicalRows?.length || !kitProducts.length) return {};

  const variableProducts = kitProducts.filter(
    (p) => p.type === "variable" && p.variant_attributes && p.variant_attributes.length > 0
  );
  if (!variableProducts.length) return {};

  const byProductId = new Map<string, RegistrationProductSelectionRow[]>();
  for (const r of canonicalRows) {
    const pid = r.product_id?.trim();
    if (!pid) continue;
    if (!byProductId.has(pid)) byProductId.set(pid, []);
    byProductId.get(pid)!.push(r);
  }

  const nameToRows = new Map<string, RegistrationProductSelectionRow[]>();
  for (const [, rows] of byProductId) {
    const name = normalizeKitProductName(rows[0]?.product_name || "");
    if (name && !nameToRows.has(name)) nameToRows.set(name, rows);
  }

  const out: Record<string, Record<string, string>> = {};

  for (const p of variableProducts) {
    const attrs = p.variant_attributes!;
    let rows = byProductId.get(p.id) || [];
    if (!rows.length) {
      const alt = nameToRows.get(normalizeKitProductName(p.name));
      if (alt) rows = alt;
    }
    if (!rows.length) continue;

    const acc: Record<string, string> = {};

    /** Legado: backend gravou uma linha única attribute_name "Variante" com o nome composto da variante. */
    const singleVariante =
      rows.length === 1 && (rows[0].attribute_name || "").trim() === "Variante";

    if (singleVariante && attrs.length >= 1) {
      const raw = (rows[0].attribute_value || "").trim();
      if (raw.includes("-")) {
        const parts = raw.split(/\s*-\s*/).map((x) => x.trim()).filter(Boolean);
        for (let i = 0; i < Math.min(attrs.length, parts.length); i++) {
          acc[attrs[i]] = parts[i];
        }
      } else {
        acc[attrs[0]] = raw;
      }
    }

    for (const r of rows) {
      if (singleVariante) break;
      const an = (r.attribute_name || "").trim();
      const av = (r.attribute_value || "").trim();
      if (!an || !av) continue;
      if (!attrs.includes(an)) continue;
      acc[an] = av;
    }
    if (Object.keys(acc).length > 0) out[p.id] = acc;
  }

  return out;
}

export function kitHasVariableProductsWithAttributes(kitProducts: KitProduct[]): boolean {
  return kitProducts.some((p) => {
    if (p.type !== "variable") return false;
    const attrs = p.variant_attributes;
    return Array.isArray(attrs) && attrs.length > 0;
  });
}
