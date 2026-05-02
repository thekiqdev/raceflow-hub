import { getEventKits, type EventKit, type KitProduct } from "@/lib/api/eventKits";

/**
 * Carrega kits para dropdown (filtrado por categoria via kit_categories) e resolve
 * produtos do kit da inscrição. Se o kit não vier na lista filtrada ou vier sem
 * products, faz fallback GET /kits sem category_id (mesma ideia do drawer).
 */
export async function loadKitsForCategoryWithKitFallback(params: {
  eventId: string;
  categoryId: string | undefined;
  registrationKitId: string | null | undefined;
}): Promise<{
  kitsForDropdown: EventKit[];
  kitProducts: KitProduct[];
}> {
  const { eventId, categoryId, registrationKitId } = params;

  const first = await getEventKits(eventId, categoryId || undefined);
  let kitsForDropdown = first.success && first.data ? [...first.data] : [];

  if (!registrationKitId) {
    return { kitsForDropdown, kitProducts: [] };
  }

  let kit = kitsForDropdown.find((k) => k.id === registrationKitId);
  let products = kit?.products?.length ? kit.products : [];

  if (products.length === 0) {
    const all = await getEventKits(eventId);
    if (all.success && all.data) {
      const resolved = all.data.find((k) => k.id === registrationKitId) ?? null;
      products = resolved?.products?.length ? resolved.products : [];
      if (resolved && !kitsForDropdown.some((k) => k.id === resolved.id)) {
        kitsForDropdown = [...kitsForDropdown, resolved];
      }
    }
  }

  return { kitsForDropdown, kitProducts: products };
}

/**
 * Garante produtos do kit quando já se tem o objeto kit da lista mas pode estar sem products.
 */
export async function ensureKitProductsForEdit(
  eventId: string,
  kitId: string,
  kitFromList: EventKit | undefined
): Promise<KitProduct[]> {
  if (kitFromList?.products?.length) return kitFromList.products;
  const all = await getEventKits(eventId);
  if (!all.success || !all.data) return [];
  const k = all.data.find((x) => x.id === kitId);
  return k?.products?.length ? k.products : [];
}
