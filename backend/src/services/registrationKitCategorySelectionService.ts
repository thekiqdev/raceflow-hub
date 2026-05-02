import { query } from '../config/database.js';
import type { RegistrationProductSelection } from './registrationProductSelectionsService.js';
import { getRegistrationProductSelections } from './registrationProductSelectionsService.js';
import type { ProductSelection } from './registrationsService.js';
import { getVariantRemainingStock } from './registrationsService.js';

export type KitCategorySelectionPlan =
  | { kind: 'noop' }
  | { kind: 'replace'; selections: ProductSelection[]; remapped: boolean }
  | { kind: 'reject'; reasons: string[] };

function normalizeKitProductName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function kitLinkedToCategory(kitId: string, categoryId: string): Promise<boolean> {
  const r = await query(`SELECT 1 FROM kit_categories WHERE kit_id = $1 AND category_id = $2`, [
    kitId,
    categoryId,
  ]);
  return r.rows.length > 0;
}

async function validateSelectionsAgainstKit(
  registrationId: string,
  eventId: string,
  kitId: string,
  existing: RegistrationProductSelection[]
): Promise<{ ok: true } | { ok: false; reasons: string[] }> {
  const reasons: string[] = [];
  if (existing.length === 0) return { ok: true };

  const kp = await query(`SELECT id FROM kit_products WHERE kit_id = $1`, [kitId]);
  const allowed = new Set(kp.rows.map((r: { id: string }) => String(r.id)));

  const byProduct = new Map<string, RegistrationProductSelection[]>();
  for (const row of existing) {
    if (!allowed.has(row.product_id)) {
      reasons.push(`Produto "${row.product_name}" não pertence ao kit da inscrição.`);
      continue;
    }
    if (!byProduct.has(row.product_id)) byProduct.set(row.product_id, []);
    byProduct.get(row.product_id)!.push(row);
  }
  if (reasons.length) return { ok: false, reasons };

  for (const [, rows] of byProduct) {
    const productLabel = rows[0]?.product_name || 'Produto';
    const variantIds = [...new Set(rows.map((r) => r.variant_id).filter(Boolean))] as string[];
    if (variantIds.length === 0) {
      reasons.push(
        `${productLabel}: seleção sem variante vinculada ao estoque; é necessário escolher novamente as opções do kit.`
      );
      continue;
    }
    if (variantIds.length > 1) {
      reasons.push(`${productLabel}: há mais de uma variante nas seleções salvas; reescolha as opções do kit.`);
      continue;
    }
    const vid = variantIds[0];
    const vr = await query(`SELECT 1 FROM product_variants WHERE id = $1 AND product_id = $2`, [
      vid,
      rows[0].product_id,
    ]);
    if (vr.rows.length === 0) {
      reasons.push(`${productLabel}: variante inválida para este produto.`);
      continue;
    }
    const remaining = await getVariantRemainingStock(vid, eventId, registrationId);
    if (remaining !== null && remaining <= 0) {
      reasons.push(`${productLabel}: sem estoque para a variante atualmente selecionada.`);
    }
  }

  if (reasons.length) return { ok: false, reasons };
  return { ok: true };
}

async function tryRemapSelectionsToNewKit(
  registrationId: string,
  eventId: string,
  oldKitId: string,
  newKitId: string,
  existing: RegistrationProductSelection[]
): Promise<ProductSelection[] | null> {
  const oldProducts = await query(`SELECT id, name FROM kit_products WHERE kit_id = $1`, [oldKitId]);
  const newProducts = await query(`SELECT id, name FROM kit_products WHERE kit_id = $1`, [newKitId]);
  const oldIdToName = new Map(oldProducts.rows.map((r: { id: string; name: string }) => [String(r.id), String(r.name)]));
  const newNormToId = new Map(
    newProducts.rows.map((r: { id: string; name: string }) => [
      normalizeKitProductName(String(r.name)),
      String(r.id),
    ])
  );

  const byOldProduct = new Map<string, RegistrationProductSelection[]>();
  for (const row of existing) {
    if (!byOldProduct.has(row.product_id)) byOldProduct.set(row.product_id, []);
    byOldProduct.get(row.product_id)!.push(row);
  }

  const mapped: ProductSelection[] = [];

  for (const [oldPid, rows] of byOldProduct) {
    const oldName = oldIdToName.get(oldPid);
    if (!oldName) return null;
    const newPid = newNormToId.get(normalizeKitProductName(oldName));
    if (!newPid) return null;

    const variantIds = [...new Set(rows.map((r) => r.variant_id).filter(Boolean))] as string[];
    if (variantIds.length !== 1) return null;
    const oldVid = variantIds[0];

    const vn = await query(`SELECT name FROM product_variants WHERE id = $1`, [oldVid]);
    if (vn.rows.length === 0) return null;
    const variantName = String(vn.rows[0].name);

    const nv = await query(`SELECT id FROM product_variants WHERE product_id = $1 AND name = $2`, [
      newPid,
      variantName,
    ]);
    if (nv.rows.length === 0) return null;

    mapped.push({ product_id: newPid, variant_id: String(nv.rows[0].id) });
  }

  for (const sel of mapped) {
    if (sel.variant_id) {
      const remaining = await getVariantRemainingStock(sel.variant_id, eventId, registrationId);
      if (remaining !== null && remaining <= 0) return null;
    }
  }

  return mapped;
}

/**
 * Planeja sincronização de registration_product_selections ao mudar categoria e/ou kit.
 * Não altera o banco — apenas retorna noop | replace | reject.
 */
export async function planRegistrationKitCategorySelectionSync(params: {
  registrationId: string;
  eventId: string;
  oldCategoryId: string;
  newCategoryId: string;
  oldKitId: string | null;
  newKitId: string | null;
  /** true quando o cliente enviou explicitamente kit_id: null */
  explicitKitRemoval: boolean;
  incomingProductSelections?: ProductSelection[] | undefined;
}): Promise<KitCategorySelectionPlan> {
  const {
    registrationId,
    eventId,
    oldCategoryId,
    newCategoryId,
    oldKitId,
    newKitId,
    explicitKitRemoval,
    incomingProductSelections,
  } = params;

  const existingSelections = await getRegistrationProductSelections(registrationId);

  if (explicitKitRemoval && existingSelections.length > 0) {
    return {
      kind: 'reject',
      reasons: [
        'Não é possível remover o kit enquanto existirem seleções de produto. Remova primeiro os atributos/variações pela função dedicada.',
      ],
    };
  }

  const categoryChanged = oldCategoryId !== newCategoryId;
  const kitChanged = oldKitId !== newKitId;

  if (!categoryChanged && !kitChanged) {
    return { kind: 'noop' };
  }

  if (!newKitId) {
    return { kind: 'noop' };
  }

  const linked = await kitLinkedToCategory(newKitId, newCategoryId);
  if (!linked) {
    return {
      kind: 'reject',
      reasons: ['Este kit não está disponível para a categoria selecionada.'],
    };
  }

  if (incomingProductSelections !== undefined) {
    if (incomingProductSelections.length === 0) {
      return {
        kind: 'reject',
        reasons: [
          'Envie product_selections com as novas escolhas ou omita o campo para tentar reaproveitamento automático.',
        ],
      };
    }
    const kp = await query(`SELECT id FROM kit_products WHERE kit_id = $1`, [newKitId]);
    const allowed = new Set(kp.rows.map((r: { id: string }) => String(r.id)));
    for (const s of incomingProductSelections) {
      if (!allowed.has(s.product_id)) {
        return { kind: 'reject', reasons: ['Uma ou mais seleções não pertencem ao novo kit.'] };
      }
    }
    return { kind: 'replace', selections: incomingProductSelections, remapped: false };
  }

  if (existingSelections.length === 0) {
    return { kind: 'noop' };
  }

  if (kitChanged && !oldKitId) {
    return {
      kind: 'reject',
      reasons: [
        'Existem seleções de produto gravadas sem kit anterior definido. Envie product_selections compatíveis com o novo kit.',
      ],
    };
  }

  if (!kitChanged && categoryChanged) {
    const v = await validateSelectionsAgainstKit(registrationId, eventId, newKitId, existingSelections);
    if (!v.ok) return { kind: 'reject', reasons: v.reasons };
    return { kind: 'noop' };
  }

  if (kitChanged && oldKitId && newKitId) {
    const mapped = await tryRemapSelectionsToNewKit(
      registrationId,
      eventId,
      oldKitId,
      newKitId,
      existingSelections
    );
    if (mapped) {
      return { kind: 'replace', selections: mapped, remapped: true };
    }
    return {
      kind: 'reject',
      reasons: [
        'Não foi possível reaproveitar automaticamente as variantes ao trocar o kit (produtos ou nomes de variante diferentes). Envie product_selections no corpo da requisição com as novas escolhas válidas para o novo kit.',
      ],
    };
  }

  return { kind: 'noop' };
}
