import { query } from '../config/database.js';
import { loadKitProductsWithStockForEvent, type KitProduct } from './eventKitsService.js';
import { getKitCategories } from './kitCategoriesService.js';
import { resolveEffectiveVariantAttributes } from './kitProductVariantAttributesInference.js';

export type EditableKitIssueCode =
  | 'NO_KIT_ASSIGNED'
  | 'KIT_NOT_FOUND_OR_WRONG_EVENT'
  | 'KIT_CATEGORY_MISMATCH'
  | 'SELECTION_PRODUCT_NOT_IN_KIT'
  | 'INVALID_VARIANT'
  | 'MISSING_VARIANT_ATTRIBUTES'
  | 'VARIANT_ATTRIBUTES_INFERRED';

export interface EditableKitIssue {
  code: EditableKitIssueCode;
  message: string;
  detail?: Record<string, unknown>;
}

/** Linha canônica alinhada ao que a UI já usa; inclui seleções órfãs quando o produto sumiu do kit. */
export interface EditableCanonicalSelectionRow {
  product_id: string;
  product_name: string | null;
  variant_id: string | null;
  variant_name: string | null;
  attribute_name: string;
  attribute_value: string;
  /** true quando kit_products não tem mais este product_id */
  product_unlinked?: boolean;
}

export interface RegistrationEditableKitContext {
  registration_id: string;
  event_id: string;
  category_id: string | null;
  kit_id: string | null;
  kit_category_ids: string[];
  kit_category_consistent: boolean;
  kit: {
    id: string;
    event_id: string;
    name: string;
    description: string | null;
    price: number;
    display_order: number;
    created_at: Date | null;
  } | null;
  products: KitProduct[];
  canonical_selections: EditableCanonicalSelectionRow[];
  issues: EditableKitIssue[];
}

function pushIssue(
  issues: EditableKitIssue[],
  code: EditableKitIssueCode,
  message: string,
  detail?: Record<string, unknown>
) {
  issues.push({ code, message, detail });
}

/**
 * Contexto editável da inscrição: kit efetivo (registrations.kit_id), produtos/variantes/atributos
 * e seleções canônicas, com flags de inconsistência. Não depende da listagem filtrada por categoria.
 */
export async function getRegistrationEditableKitContext(
  registrationId: string
): Promise<RegistrationEditableKitContext | null> {
  const regResult = await query(
    `SELECT id, event_id, category_id, kit_id FROM registrations WHERE id = $1`,
    [registrationId]
  );
  if (regResult.rows.length === 0) {
    return null;
  }

  const reg = regResult.rows[0] as {
    id: string;
    event_id: string;
    category_id: string | null;
    kit_id: string | null;
  };

  const issues: EditableKitIssue[] = [];
  const categoryId: string | null = reg.category_id;
  const eventId = reg.event_id;

  const selectionsResult = await query(
    `SELECT
       rps.product_id,
       p.name AS product_name,
       rps.variant_id,
       pv.name AS variant_name,
       rps.attribute_name,
       rps.attribute_value,
       (p.id IS NULL) AS product_missing
     FROM registration_product_selections rps
     LEFT JOIN kit_products p ON rps.product_id = p.id
     LEFT JOIN product_variants pv ON rps.variant_id = pv.id
     WHERE rps.registration_id = $1
     ORDER BY COALESCE(p.name, ''), rps.attribute_name, rps.attribute_value`,
    [registrationId]
  );

  const canonical_selections: EditableCanonicalSelectionRow[] = selectionsResult.rows.map((row: any) => ({
    product_id: row.product_id,
    product_name: row.product_name,
    variant_id: row.variant_id,
    variant_name: row.variant_name,
    attribute_name: row.attribute_name,
    attribute_value: row.attribute_value,
    product_unlinked: row.product_missing === true,
  }));

  if (!reg.kit_id) {
    if (canonical_selections.length > 0) {
      pushIssue(issues, 'SELECTION_PRODUCT_NOT_IN_KIT', 'Existem seleções salvas mas a inscrição não tem kit.', {
        selection_count: canonical_selections.length,
      });
    }
    pushIssue(issues, 'NO_KIT_ASSIGNED', 'Inscrição sem kit_id.');
    return {
      registration_id: reg.id,
      event_id: eventId,
      category_id: categoryId,
      kit_id: null,
      kit_category_ids: [],
      kit_category_consistent: true,
      kit: null,
      products: [],
      canonical_selections,
      issues,
    };
  }

  const bundle = await loadKitProductsWithStockForEvent(reg.kit_id, eventId);
  if (!bundle) {
    pushIssue(issues, 'KIT_NOT_FOUND_OR_WRONG_EVENT', 'Kit da inscrição não existe ou não pertence ao evento.', {
      kit_id: reg.kit_id,
    });
    return {
      registration_id: reg.id,
      event_id: eventId,
      category_id: categoryId,
      kit_id: reg.kit_id,
      kit_category_ids: [],
      kit_category_consistent: false,
      kit: null,
      products: [],
      canonical_selections,
      issues,
    };
  }

  const { kit, products } = bundle;

  const rowsByProduct = new Map<string, EditableCanonicalSelectionRow[]>();
  for (const row of canonical_selections) {
    if (!row.product_id || row.product_unlinked) continue;
    if (!rowsByProduct.has(row.product_id)) rowsByProduct.set(row.product_id, []);
    rowsByProduct.get(row.product_id)!.push(row);
  }

  const inferredMeta: Array<{ product_id: string; product_name: string; source: string }> = [];
  for (const p of products) {
    const rows = rowsByProduct.get(p.id) ?? [];
    const canonForInfer = rows.map((r) => ({
      attribute_name: r.attribute_name,
      attribute_value: r.attribute_value,
    }));
    const { attributes, source } = resolveEffectiveVariantAttributes(p, canonForInfer);
    if (attributes.length > 0) {
      p.variant_attributes = attributes;
      if (source !== 'db') {
        inferredMeta.push({ product_id: p.id, product_name: p.name, source });
      }
    }
  }

  if (inferredMeta.length > 0) {
    pushIssue(
      issues,
      'VARIANT_ATTRIBUTES_INFERRED',
      'Nomes de atributos foram derivados das seleções salvas ou dos nomes das variantes (cadastro do kit sem variant_attributes). Recomenda-se corrigir o produto no cadastro do kit quando possível.',
      {
        products: inferredMeta,
      }
    );
  }

  const kit_category_ids = await getKitCategories(kit.id);

  let kit_category_consistent = true;
  if (categoryId && kit_category_ids.length > 0 && !kit_category_ids.includes(categoryId)) {
    kit_category_consistent = false;
    pushIssue(issues, 'KIT_CATEGORY_MISMATCH', 'A categoria da inscrição não está vinculada a este kit em kit_categories.', {
      category_id: categoryId,
      kit_id: kit.id,
      kit_category_ids,
    });
  }

  const productIdSet = new Set(products.map((p) => p.id));

  for (const p of products) {
    if (p.type === 'variable') {
      const attrs = p.variant_attributes;
      const ok = Array.isArray(attrs) && attrs.length > 0;
      if (!ok) {
        pushIssue(issues, 'MISSING_VARIANT_ATTRIBUTES', 'Produto variável sem variant_attributes utilizável.', {
          product_id: p.id,
          product_name: p.name,
        });
      }
    }
  }

  const reportedOrphanProducts = new Set<string>();
  const reportedInvalidVariants = new Set<string>();

  for (const sel of canonical_selections) {
    if (sel.product_unlinked || !productIdSet.has(sel.product_id)) {
      if (!reportedOrphanProducts.has(sel.product_id)) {
        reportedOrphanProducts.add(sel.product_id);
        pushIssue(issues, 'SELECTION_PRODUCT_NOT_IN_KIT', 'Seleção referencia produto que não está neste kit.', {
          product_id: sel.product_id,
          kit_id: kit.id,
        });
      }
      continue;
    }
    if (sel.variant_id) {
      const product = products.find((x) => x.id === sel.product_id);
      const variantBelongs =
        product?.variants?.some((v) => v.id === sel.variant_id) ?? false;
      const key = `${sel.product_id}:${sel.variant_id}`;
      if (!variantBelongs && !reportedInvalidVariants.has(key)) {
        reportedInvalidVariants.add(key);
        pushIssue(issues, 'INVALID_VARIANT', 'Variante da seleção não existe ou não pertence ao produto.', {
          product_id: sel.product_id,
          variant_id: sel.variant_id,
        });
      }
    }
  }

  return {
    registration_id: reg.id,
    event_id: eventId,
    category_id: categoryId,
    kit_id: kit.id,
    kit_category_ids,
    kit_category_consistent,
    kit: {
      id: kit.id,
      event_id: kit.event_id,
      name: kit.name,
      description: kit.description,
      price: kit.price,
      display_order: kit.display_order,
      created_at: kit.created_at,
    },
    products,
    canonical_selections,
    issues,
  };
}
