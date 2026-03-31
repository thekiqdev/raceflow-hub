import type { PaymentStatusResult } from '../types/asaas.js';

/** TTL curto para aliviar GET /payment-status + chamadas repetidas ao Asaas (ms). */
const TTL_MS = Math.max(
  1000,
  parseInt(process.env.PAYMENT_STATUS_POLL_CACHE_MS || '4000', 10)
);

type CacheEntry = { expiresAt: number; result: PaymentStatusResult };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<PaymentStatusResult>>();

/**
 * Cache em memória + deduplicação in-flight para consultas de status ao Asaas
 * disparadas pelo polling de payment-status (mesmo asaas_payment_id em janela curta).
 */
export async function getAsaasPaymentStatusWithPollCache(
  asaasPaymentId: string,
  fetcher: () => Promise<PaymentStatusResult>
): Promise<PaymentStatusResult> {
  const now = Date.now();
  const hit = cache.get(asaasPaymentId);
  if (hit && hit.expiresAt > now) {
    return hit.result;
  }

  const pending = inflight.get(asaasPaymentId);
  if (pending) {
    return pending;
  }

  const promise = (async () => {
    try {
      const result = await fetcher();
      cache.set(asaasPaymentId, {
        expiresAt: Date.now() + TTL_MS,
        result,
      });
      return result;
    } finally {
      inflight.delete(asaasPaymentId);
    }
  })();

  inflight.set(asaasPaymentId, promise);
  return promise;
}
