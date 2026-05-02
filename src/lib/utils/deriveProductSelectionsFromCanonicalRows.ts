import type { ProductSelection } from "@/lib/api/registrations";
import type { RegistrationProductSelectionRow } from "@/lib/utils/groupRegistrationProductSelections";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s.trim());
}

/**
 * Reconstrói o payload `product_selections` do PUT a partir das linhas planas
 * retornadas em `GET /registrations/:id` (`detail.product_selections`).
 *
 * Regras:
 * - Um produto por grupo (`product_id`); IDs devem ser UUID válidos.
 * - Todas as linhas não nulas de `variant_id` de um mesmo produto devem coincidir.
 * - `attribute_selections`: mescla `attribute_name` → `attribute_value` (trim);
 *   conflito de mesmo nome com valores diferentes invalida toda a derivação.
 * - Linhas `attribute_name === "Variante"` são omitidas se houver `variant_id`
 *   resolvido (o backend expande a partir da variante quando não há attrs).
 * - Se o grupo não tiver nem `variant_id` nem atributos utilizáveis → derivação inválida.
 */
export function deriveProductSelectionsPayloadFromCanonicalRows(
  rows: RegistrationProductSelectionRow[] | undefined | null
): ProductSelection[] | null {
  if (!rows?.length) return null;

  const byProduct = new Map<string, RegistrationProductSelectionRow[]>();
  for (const row of rows) {
    const pid = row.product_id?.trim();
    if (!pid || !isUuid(pid)) return null;
    if (!byProduct.has(pid)) byProduct.set(pid, []);
    byProduct.get(pid)!.push(row);
  }

  const out: ProductSelection[] = [];

  for (const [product_id, productRows] of byProduct) {
    const variantSeen = new Set<string>();
    for (const r of productRows) {
      const v = r.variant_id?.trim();
      if (v) {
        if (!isUuid(v)) return null;
        variantSeen.add(v);
      }
    }
    if (variantSeen.size > 1) return null;
    const variant_id = variantSeen.size === 1 ? [...variantSeen][0] : undefined;

    const attribute_selections: Record<string, string> = {};
    for (const r of productRows) {
      const an = (r.attribute_name || "").trim();
      const av = (r.attribute_value || "").trim();
      if (!an || !av) continue;
      if (an === "Variante" && variant_id) continue;

      if (attribute_selections[an] !== undefined && attribute_selections[an] !== av) {
        return null;
      }
      attribute_selections[an] = av;
    }

    const hasAttrs = Object.keys(attribute_selections).length > 0;
    if (!hasAttrs && !variant_id) return null;

    const sel: ProductSelection = { product_id };
    if (variant_id) sel.variant_id = variant_id;
    if (hasAttrs) sel.attribute_selections = attribute_selections;
    out.push(sel);
  }

  return out.length > 0 ? out : null;
}
