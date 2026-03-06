/**
 * Utility functions for calculating values with and without platform fees
 */

export interface PlatformFeeSettings {
  platform_fee: number;
  platform_fee_type: 'fixed' | 'percentage';
  /** Taxa mínima (R$) quando tipo é percentual; se o % for menor, aplica este valor. */
  platform_fee_min?: number;
}

/**
 * Calculate the original value without platform fee
 *
 * @param totalAmount - The total amount including platform fee
 * @param platformFee - The platform fee value
 * @param platformFeeType - Type of fee: 'fixed' or 'percentage'
 * @param platformFeeMin - Optional minimum fee (R$) when type is percentage; used to infer fee from total
 */
export function calculateValueWithoutFee(
  totalAmount: number,
  platformFee: number,
  platformFeeType: 'fixed' | 'percentage',
  platformFeeMin?: number
): number {
  if (!totalAmount || totalAmount <= 0 || !platformFee || platformFee <= 0) {
    return totalAmount;
  }

  if (platformFeeType === 'percentage') {
    const min = typeof platformFeeMin === 'number' && platformFeeMin > 0 ? platformFeeMin : 0;
    // Fee that was applied = max(total * p/(100+p), min); valueWithoutFee = total - fee
    const feeFromPercent = (totalAmount * platformFee) / (100 + platformFee);
    const fee = min > 0 ? Math.max(feeFromPercent, min) : feeFromPercent;
    return Math.max(0, Math.round((totalAmount - fee) * 100) / 100);
  } else {
    return Math.max(0, Math.round((totalAmount - platformFee) * 100) / 100);
  }
}

/**
 * Calculate the total amount with platform fee.
 * When type is percentage and platformFeeMin is set, applies at least that amount (R$).
 * Evento gratuito (baseAmount = 0): não aplica taxa, retorna 0.
 *
 * @param baseAmount - The base amount without platform fee
 * @param platformFee - The platform fee value
 * @param platformFeeType - Type of fee: 'fixed' or 'percentage'
 * @param platformFeeMin - Optional minimum fee (R$) when type is percentage
 */
export function calculateValueWithFee(
  baseAmount: number,
  platformFee: number,
  platformFeeType: 'fixed' | 'percentage',
  platformFeeMin?: number
): number {
  if (!baseAmount || baseAmount <= 0 || !platformFee || platformFee <= 0) {
    return baseAmount;
  }

  if (platformFeeType === 'percentage') {
    const min = typeof platformFeeMin === 'number' && platformFeeMin > 0 ? platformFeeMin : 0;
    const feeFromPercent = Math.round((baseAmount * (platformFee / 100)) * 100) / 100;
    const fee = min > 0 ? Math.max(feeFromPercent, min) : feeFromPercent;
    return Math.round((baseAmount + fee) * 100) / 100;
  } else {
    return Math.round((baseAmount + platformFee) * 100) / 100;
  }
}
