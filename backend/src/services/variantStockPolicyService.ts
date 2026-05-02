/**
 * Política de consumo de estoque por variante (saldo derivado).
 *
 * Consomem: pending, confirmed, refund_requested, transferred.
 * Não consomem: cancelled, refunded.
 *
 * Nota sobre transferred: o modelo atual usa uma única linha em `registrations`
 * (runner_id atualizado, status transferred). O titular atual continua associado às
 * mesmas `registration_product_selections`; contar como consumo evita liberar estoque
 * indevidamente nem duplicar (não há segunda inscrição).
 */
export const VARIANT_STOCK_CONSUMING_REGISTRATION_STATUSES = [
  'pending',
  'confirmed',
  'refund_requested',
  'transferred',
] as const;

/** Condição SQL para JOIN/WHERE em `registrations` (alias padrão `r`). */
export function registrationConsumesVariantStockSql(alias = 'r'): string {
  return `${alias}.status IN ('pending', 'confirmed', 'refund_requested', 'transferred')`;
}
