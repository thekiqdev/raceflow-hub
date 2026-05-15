/**
 * Utility functions for calculating values with and without platform fees
 */

export interface PlatformFeeSettings {
  platform_fee: number;
  platform_fee_type: 'fixed' | 'percentage';
}

/**
 * Calculate the original value without platform fee
 * 
 * @param totalAmount - The total amount including platform fee
 * @param platformFee - The platform fee value
 * @param platformFeeType - Type of fee: 'fixed' or 'percentage'
 * @returns The original value without the platform fee
 * 
 * @example
 * // Percentage fee: if total is 110 and fee is 10%, original = 110 / 1.10 = 100
 * calculateValueWithoutFee(110, 10, 'percentage') // returns 100
 * 
 * @example
 * // Fixed fee: if total is 110 and fee is 10, original = 110 - 10 = 100
 * calculateValueWithoutFee(110, 10, 'fixed') // returns 100
 */
export function calculateValueWithoutFee(
  totalAmount: number,
  platformFee: number,
  platformFeeType: 'fixed' | 'percentage'
): number {
  // If any value is invalid, return the original totalAmount
  if (!totalAmount || totalAmount <= 0 || !platformFee || platformFee <= 0) {
    return totalAmount;
  }
  
  if (platformFeeType === 'percentage') {
    // If fee is percentage: value_without_fee = total_amount / (1 + fee/100)
    // Example: if total is 110 and fee is 10%, then original = 110 / 1.10 = 100
    return Math.round((totalAmount / (1 + platformFee / 100)) * 100) / 100;
  } else {
    // If fee is fixed: value_without_fee = total_amount - fee
    return Math.max(0, Math.round((totalAmount - platformFee) * 100) / 100);
  }
}

/**
 * Calculate the total amount with platform fee
 * 
 * @param baseAmount - The base amount without platform fee
 * @param platformFee - The platform fee value
 * @param platformFeeType - Type of fee: 'fixed' or 'percentage'
 * @returns The total amount including the platform fee
 * 
 * @example
 * // Percentage fee: if base is 100 and fee is 10%, total = 100 * 1.10 = 110
 * calculateValueWithFee(100, 10, 'percentage') // returns 110
 * 
 * @example
 * // Fixed fee: if base is 100 and fee is 10, total = 100 + 10 = 110
 * calculateValueWithFee(100, 10, 'fixed') // returns 110
 */
export interface RegistrationFeeFields {
  total_amount?: number | string | null;
  platform_fee_amount?: number | string | null;
  registration_edit_fee_amount?: number | string | null;
  payment_method?: string | null;
  payment_status?: string | null;
}

/**
 * Valor líquido para exibição do organizador (regra canônica):
 * - taxas persistidas (incluindo zero) => total - taxas
 * - ambas taxas NULL => fallback legado calculateValueWithoutFee
 */
export function getCanonicalRegistrationDisplayValue(
  reg: RegistrationFeeFields,
  platformFee: number,
  platformFeeType: 'fixed' | 'percentage'
): number {
  if (reg.payment_method === 'free_bonus' || reg.payment_status === 'convidado') {
    return 0;
  }

  const total = Number(reg.total_amount) || 0;
  const hasPersistedFee =
    reg.platform_fee_amount != null || reg.registration_edit_fee_amount != null;

  if (hasPersistedFee) {
    const fee =
      (reg.platform_fee_amount == null ? 0 : Number(reg.platform_fee_amount) || 0) +
      (reg.registration_edit_fee_amount == null ? 0 : Number(reg.registration_edit_fee_amount) || 0);
    return Math.max(0, Math.round((total - fee) * 100) / 100);
  }

  return Math.max(0, calculateValueWithoutFee(total, platformFee, platformFeeType));
}

export function calculateValueWithFee(
  baseAmount: number,
  platformFee: number,
  platformFeeType: 'fixed' | 'percentage'
): number {
  // If any value is invalid, return the original baseAmount
  if (!baseAmount || baseAmount <= 0 || !platformFee || platformFee <= 0) {
    return baseAmount;
  }
  
  if (platformFeeType === 'percentage') {
    // If fee is percentage: total = base * (1 + fee/100)
    return Math.round((baseAmount * (1 + platformFee / 100)) * 100) / 100;
  } else {
    // If fee is fixed: total = base + fee
    return Math.round((baseAmount + platformFee) * 100) / 100;
  }
}
