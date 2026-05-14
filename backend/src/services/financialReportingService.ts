import { calculateValueWithoutFee } from '../utils/feeCalculations.js';

export interface FinancialRegistrationLike {
  payment_method?: string | null;
  payment_status?: string | null;
  status?: string | null;
  transferred_to_registration_id?: string | null;
  total_amount?: number | string | null;
  platform_fee_amount?: number | string | null;
  registration_edit_fee_amount?: number | string | null;
}

/** Casca após split super admin: ainda "paid" no DB, mas não deve gerar receita nem contagem ativa. */
export function isTransferredOutShellRegistration(reg: {
  status?: string | null;
  transferred_to_registration_id?: string | null;
}): boolean {
  return (
    reg.status === 'transferred' &&
    reg.transferred_to_registration_id != null &&
    String(reg.transferred_to_registration_id).length > 0
  );
}

export interface LegacyFallbackConfig {
  platformFee: number;
  platformFeeType: 'fixed' | 'percentage';
  platformFeeMin?: number;
}

export function getPlatformFeeTotal(reg: FinancialRegistrationLike): number {
  const pf = reg.platform_fee_amount == null ? 0 : Number(reg.platform_fee_amount) || 0;
  const ef = reg.registration_edit_fee_amount == null ? 0 : Number(reg.registration_edit_fee_amount) || 0;
  return Math.max(0, Math.round((pf + ef) * 100) / 100);
}

export function isLegacyWithoutFeeFields(reg: FinancialRegistrationLike): boolean {
  return reg.platform_fee_amount == null && reg.registration_edit_fee_amount == null;
}

/**
 * Valor líquido reportável da inscrição:
 * - convites (free_bonus / convidado) => 0
 * - taxas preenchidas (incluindo zero) => total - taxas
 * - legado (ambas taxas NULL) => fallback histórico
 */
export function getLiquidRegistrationValue(
  reg: FinancialRegistrationLike,
  fallback: LegacyFallbackConfig
): number {
  if (isTransferredOutShellRegistration(reg)) {
    return 0;
  }
  if (reg.payment_method === 'free_bonus' || reg.payment_status === 'convidado') {
    return 0;
  }

  const total = Number(reg.total_amount) || 0;
  let value = 0;

  if (!isLegacyWithoutFeeFields(reg)) {
    value = total - getPlatformFeeTotal(reg);
  } else {
    value = calculateValueWithoutFee(
      total,
      fallback.platformFee,
      fallback.platformFeeType,
      fallback.platformFeeMin ?? 0
    );
  }

  return Math.max(0, Math.round(value * 100) / 100);
}

export function getReportableRevenue(
  registrations: FinancialRegistrationLike[],
  fallback: LegacyFallbackConfig
): number {
  const total = registrations.reduce((sum, reg) => {
    if (reg.payment_status !== 'paid') return sum;
    if (isTransferredOutShellRegistration(reg)) return sum;
    return sum + getLiquidRegistrationValue(reg, fallback);
  }, 0);

  return Math.round(total * 100) / 100;
}

