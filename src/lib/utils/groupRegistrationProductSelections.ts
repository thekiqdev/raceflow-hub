/**
 * Linhas planas de registration_product_selections (GET /registrations/:id).
 * Usado para exibição agrupada somente leitura (drawer, detalhe, etc.).
 */
export interface RegistrationProductSelectionRow {
  product_id: string;
  product_name: string;
  variant_id: string | null;
  variant_name: string | null;
  attribute_name: string;
  attribute_value: string;
}

export interface GroupedKitProductSelection {
  product_id: string;
  product_name: string;
  /** Rótulos de variação (deduplicados, ordem de aparição). */
  variation_labels: string[];
  /**
   * Atributos excluindo a linha sintética "Variante" (evita duplicar o bloco de variação
   * quando variant_name ou attribute_name === "Variante" já cobre o rótulo).
   */
  other_attributes: { attribute_name: string; attribute_value: string }[];
}

function addVariantLabel(
  variantLabels: string[],
  variantSet: Set<string>,
  label: string
): void {
  const t = label.trim();
  if (!t || variantSet.has(t)) return;
  variantSet.add(t);
  variantLabels.push(t);
}

export function groupRegistrationProductSelections(
  rows: RegistrationProductSelectionRow[]
): GroupedKitProductSelection[] {
  const byProduct = new Map<
    string,
    {
      product_name: string;
      variantLabels: string[];
      variantSet: Set<string>;
      otherAttributes: { attribute_name: string; attribute_value: string }[];
      attrKeySet: Set<string>;
    }
  >();

  for (const sel of rows) {
    let g = byProduct.get(sel.product_id);
    if (!g) {
      g = {
        product_name: sel.product_name || "Produto",
        variantLabels: [],
        variantSet: new Set(),
        otherAttributes: [],
        attrKeySet: new Set(),
      };
      byProduct.set(sel.product_id, g);
    }

    const vn = sel.variant_name?.trim();
    if (vn) {
      addVariantLabel(g.variantLabels, g.variantSet, vn);
    } else if (sel.attribute_name === "Variante" && sel.attribute_value?.trim()) {
      addVariantLabel(g.variantLabels, g.variantSet, sel.attribute_value.trim());
    }

    if (sel.attribute_name !== "Variante") {
      const ak = `${sel.attribute_name}\0${sel.attribute_value}`;
      if (!g.attrKeySet.has(ak)) {
        g.attrKeySet.add(ak);
        g.otherAttributes.push({
          attribute_name: sel.attribute_name,
          attribute_value: sel.attribute_value,
        });
      }
    }
  }

  return [...byProduct.entries()].map(([product_id, v]) => ({
    product_id,
    product_name: v.product_name,
    variation_labels: v.variantLabels,
    other_attributes: v.otherAttributes,
  }));
}
