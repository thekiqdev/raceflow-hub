/**
 * Política de consumo de estoque por variante (saldo derivado).
 *
 * Consomem: pending, confirmed, refund_requested, transferred (somente legado sem split).
 * Não consomem: cancelled, refunded, nem casca `transferred` com `transferred_to_registration_id`
 * (split super admin — o consumo fica na nova linha `confirmed`).
 * Exceção: kit de pedido já entregue continua consumindo até a devolução física registrada.
 */
export const VARIANT_STOCK_CONSUMING_REGISTRATION_STATUSES = [
  'pending',
  'confirmed',
  'refund_requested',
  'transferred',
] as const;

/** Condição SQL para JOIN/WHERE em `registrations` (alias padrão `r`). */
export function registrationConsumesVariantStockSql(alias = 'r'): string {
  return `(${registrationConsumesCapacitySql(alias)} OR (
    to_jsonb(${alias})->>'checkout_kit_collected_at' IS NOT NULL
    AND to_jsonb(${alias})->>'checkout_kit_returned_at' IS NULL
  ))`;
}

/** Vaga na corrida não depende de um kit entregue que ainda aguarda devolução física. */
export function registrationConsumesCapacitySql(alias = 'r'): string {
  return `(
    ${alias}.status IN ('pending', 'confirmed', 'refund_requested')
    OR (
      ${alias}.status = 'transferred'
      AND ${alias}.transferred_to_registration_id IS NULL
    )
  )`;
}
