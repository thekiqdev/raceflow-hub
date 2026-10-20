/**
 * Service to calculate registration total amount (backend source of truth).
 * Used when admin edits a registration and when previewing edit.
 */

import { query } from '../config/database.js';
import { getSystemSettings } from './systemSettingsService.js';
import { calculateValueWithFee } from '../utils/feeCalculations.js';

export interface CalculateRegistrationTotalParams {
  eventId: string;
  categoryId: string;
  kitId: string | null;
  modalityId: string | null;
  /** Batch ID for category price; if not provided, uses category base price */
  batchId?: string | null;
  couponCode?: string | null;
  /** Runner ID for senior discount (60+ years) */
  runnerId?: string | null;
  /** Somente serviços internos: nascimento conferido/declarado do participante sem conta. */
  participantBirthDate?: string | null;
  /** Checkout público: lote vigente e cupom válido são obrigatórios quando informados. */
  publicCheckout?: boolean;
}

export interface CalculateRegistrationTotalResult {
  subtotal: number;
  seniorDiscount: number;
  couponDiscount: number;
  amountAfterDiscounts: number;
  platformFee: number;
  total: number;
  categoryPrice: number;
  kitPrice: number;
  /** Coupon applied (if valid) */
  couponApplied: boolean;
}

export class RegistrationPricingError extends Error {
  readonly statusCode = 400;
}

/** O valor informado é apenas a expectativa revisada, nunca a fonte do preço cobrado. */
export function registrationPriceMatches(expected: number, actual: number): boolean {
  return Number.isFinite(expected) && expected >= 0 &&
    Math.round(expected * 100) === Math.round(actual * 100);
}

function calculateAge(birthDate: Date): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

/**
 * Calculate the total amount for a registration (category + kit, discounts, platform fee).
 * Does not include registration_edit_fee; caller adds it when needed.
 */
export async function calculateRegistrationTotal(
  params: CalculateRegistrationTotalParams
): Promise<CalculateRegistrationTotalResult> {
  const { eventId, categoryId, kitId, batchId, couponCode, runnerId, publicCheckout } = params;

  let categoryPrice = 0;
  let kitPrice = 0;

  // 1. Validate category belongs to event and get price
  const categoryResult = await query(
    'SELECT id, event_id, price FROM categories WHERE id = $1 AND event_id = $2 FOR SHARE',
    [categoryId, eventId]
  );
  if (categoryResult.rows.length === 0) {
    throw new RegistrationPricingError('Categoria não encontrada ou não pertence ao evento');
  }
  const categoryRow = categoryResult.rows[0];
  const categoryBasePrice = publicCheckout ? Number(categoryRow.price) : parseFloat(categoryRow.price) || 0;

  // 2. If batchId provided, get batch price; otherwise use category base price
  if (publicCheckout) {
    const batches = await query(
      `SELECT id, price,
         (valid_from IS NOT NULL AND valid_from <= NOW()
          AND (valid_to IS NULL OR valid_to >= NOW())) AS is_active
       FROM category_batches WHERE category_id = $1 FOR SHARE`,
      [categoryId]
    );
    const selected = batchId ? batches.rows.find((batch) => batch.id === batchId) : null;
    const hasConfiguredBatches = batches.rows.length > 0;
    const hasActiveBatch = batches.rows.some((batch) => batch.is_active);
    // Se a categoria usa lotes, nunca cair no preço base (evita inscrição R$ 0 com lotes mal datados).
    if (hasConfiguredBatches) {
      if (!batchId || !selected || !selected.is_active) {
        throw new RegistrationPricingError(
          hasActiveBatch
            ? 'Selecione um lote vigente antes de finalizar a inscrição.'
            : 'Não há lote vigente no momento. As inscrições serão liberadas quando o próximo lote começar.'
        );
      }
      categoryPrice = Number(selected.price);
    } else {
      categoryPrice = categoryBasePrice;
    }
  } else if (batchId) {
    const batchResult = await query(
      'SELECT id, category_id, price FROM category_batches WHERE id = $1 AND category_id = $2',
      [batchId, categoryId]
    );
    if (batchResult.rows.length > 0) {
      categoryPrice = parseFloat(batchResult.rows[0].price) || 0;
    } else {
      categoryPrice = categoryBasePrice;
    }
  } else {
    categoryPrice = categoryBasePrice;
  }

  // 3. Kit price (optional)
  if (kitId) {
    const kitResult = await query(
      'SELECT id, event_id, price FROM event_kits WHERE id = $1 AND event_id = $2 FOR SHARE',
      [kitId, eventId]
    );
    if (kitResult.rows.length === 0) {
      throw new RegistrationPricingError('Kit não encontrado ou não pertence ao evento');
    }
    kitPrice = publicCheckout ? Number(kitResult.rows[0].price) : parseFloat(kitResult.rows[0].price) || 0;
  }

  if (!Number.isFinite(categoryPrice) || categoryPrice < 0 || !Number.isFinite(kitPrice) || kitPrice < 0) {
    throw new RegistrationPricingError('Preço inválido na categoria ou no kit. Entre em contato com o organizador.');
  }
  const subtotal = Math.round((categoryPrice + kitPrice) * 100) / 100;

  // 4. Senior discount (50% if module enabled and runner >= 60)
  let seniorDiscount = 0;
  const settings = await getSystemSettings();
  const seniorDiscountEnabled = settings.enabled_modules?.senior_discount_60_plus === true;
  if (seniorDiscountEnabled && (runnerId || params.participantBirthDate) && subtotal > 0) {
    const profileResult = runnerId ? await query(
      'SELECT birth_date FROM profiles WHERE id = $1 FOR SHARE',
      [runnerId]
    ) : { rows: [{ birth_date: params.participantBirthDate }] };
    if (profileResult.rows.length > 0 && profileResult.rows[0].birth_date) {
      const age = calculateAge(new Date(profileResult.rows[0].birth_date));
      if (age >= 60) {
        seniorDiscount = Math.round(subtotal * 0.5 * 100) / 100;
      }
    }
  }

  const totalAfterSenior = Math.max(0, subtotal - seniorDiscount);

  // 5. Coupon discount
  let couponDiscount = 0;
  let couponApplied = false;
  if (couponCode && couponCode.trim() && (publicCheckout || totalAfterSenior > 0)) {
    const eventResult = await query(
      'SELECT organizer_id FROM events WHERE id = $1',
      [eventId]
    );
    if (eventResult.rows.length > 0) {
      const organizerId = eventResult.rows[0].organizer_id;
      const { validateCoupon } = await import('./couponsService.js');
      const validation = await validateCoupon(couponCode.trim(), organizerId, eventId);
      if (publicCheckout && (!validation.valid || !validation.coupon)) {
        throw new RegistrationPricingError(validation.error || 'Cupom inválido');
      }
      if (validation.valid && validation.coupon) {
        couponApplied = true;
        const coupon = validation.coupon;
        const discountValue = parseFloat(String(coupon.discount_value)) || 0;
        if (coupon.type === 'percentage') {
          couponDiscount = Math.round((totalAfterSenior * discountValue) / 100 * 100) / 100;
        } else {
          couponDiscount = Math.min(discountValue, totalAfterSenior);
        }
        couponDiscount = Math.round(couponDiscount * 100) / 100;
      }
    } else if (publicCheckout) {
      throw new RegistrationPricingError('Evento não encontrado para validar o cupom.');
    }
  }

  const amountAfterDiscounts = Math.max(0, totalAfterSenior - couponDiscount);

  // 6. Platform fee (evento gratuito: preço = 0 → não cobra taxa)
  const platformFeeEnabled = settings.enabled_modules?.platform_fees === true;
  const platformFeeValue = settings.platform_fee ?? 0;
  const platformFeeType = settings.platform_fee_type || 'fixed';
  const platformFeeMin = settings.platform_fee_min ?? 0;

  let platformFee = 0;
  let total = amountAfterDiscounts;
  if (platformFeeEnabled && platformFeeValue > 0 && amountAfterDiscounts > 0) {
    total = calculateValueWithFee(amountAfterDiscounts, platformFeeValue, platformFeeType, platformFeeMin);
    platformFee = Math.round((total - amountAfterDiscounts) * 100) / 100;
  }

  total = Math.max(0, Math.round(total * 100) / 100);

  return {
    subtotal,
    seniorDiscount,
    couponDiscount,
    amountAfterDiscounts,
    platformFee,
    total,
    categoryPrice,
    kitPrice,
    couponApplied,
  };
}
