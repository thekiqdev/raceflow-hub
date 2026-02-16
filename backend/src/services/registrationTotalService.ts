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
  const { eventId, categoryId, kitId, modalityId, batchId, couponCode, runnerId } = params;

  let categoryPrice = 0;
  let kitPrice = 0;

  // 1. Validate category belongs to event and get price
  const categoryResult = await query(
    'SELECT id, event_id, price FROM categories WHERE id = $1 AND event_id = $2',
    [categoryId, eventId]
  );
  if (categoryResult.rows.length === 0) {
    throw new Error('Categoria não encontrada ou não pertence ao evento');
  }
  const categoryRow = categoryResult.rows[0];
  const categoryBasePrice = parseFloat(categoryRow.price) || 0;

  // 2. If batchId provided, get batch price; otherwise use category base price
  if (batchId) {
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
      'SELECT id, event_id, price FROM event_kits WHERE id = $1 AND event_id = $2',
      [kitId, eventId]
    );
    if (kitResult.rows.length === 0) {
      throw new Error('Kit não encontrado ou não pertence ao evento');
    }
    kitPrice = parseFloat(kitResult.rows[0].price) || 0;
  }

  const subtotal = categoryPrice + kitPrice;

  // 4. Senior discount (50% if module enabled and runner >= 60)
  let seniorDiscount = 0;
  const settings = await getSystemSettings();
  const seniorDiscountEnabled = settings.enabled_modules?.senior_discount_60_plus === true;
  if (seniorDiscountEnabled && runnerId && subtotal > 0) {
    const profileResult = await query(
      'SELECT birth_date FROM profiles WHERE id = $1',
      [runnerId]
    );
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
  if (couponCode && couponCode.trim() && totalAfterSenior > 0) {
    const eventResult = await query(
      'SELECT organizer_id FROM events WHERE id = $1',
      [eventId]
    );
    if (eventResult.rows.length > 0) {
      const organizerId = eventResult.rows[0].organizer_id;
      const { validateCoupon } = await import('./couponsService.js');
      const validation = await validateCoupon(couponCode.trim(), organizerId, eventId);
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
    }
  }

  const amountAfterDiscounts = Math.max(0, totalAfterSenior - couponDiscount);

  // 6. Platform fee
  const platformFeeEnabled = settings.enabled_modules?.platform_fees === true;
  const platformFeeValue = settings.platform_fee ?? 0;
  const platformFeeType = settings.platform_fee_type || 'fixed';

  let platformFee = 0;
  let total = amountAfterDiscounts;
  if (platformFeeEnabled && platformFeeValue > 0 && amountAfterDiscounts > 0) {
    total = calculateValueWithFee(amountAfterDiscounts, platformFeeValue, platformFeeType);
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
