/**
 * Cache de cupom/referência por evento em localStorage.
 * TTL: 7 dias. Limpar após inscrição concluída (chamada externa).
 * Ver: docs/PLANO_APLICACAO_CACHE_CUPOM.md
 */

const REFERRAL_COUPON_TTL_DAYS = 7;
const KEY_PREFIX = "referral_coupon_event_";

export interface ReferralCouponData {
  cupom?: string;
  ref?: string;
  savedAt: string;
}

function getStorageKey(eventId: string): string {
  return `${KEY_PREFIX}${eventId}`;
}

function isExpired(savedAt: string): boolean {
  const saved = new Date(savedAt).getTime();
  const now = Date.now();
  const ttlMs = REFERRAL_COUPON_TTL_DAYS * 24 * 60 * 60 * 1000;
  return now - saved > ttlMs;
}

/**
 * Grava cupom e/ou ref para o evento. Só grava se pelo menos um dos dois existir.
 */
export function saveReferralCoupon(
  eventId: string,
  data: { cupom?: string; ref?: string }
): void {
  const cupom = data.cupom?.trim() || undefined;
  const ref = data.ref?.trim() || undefined;
  if (!cupom && !ref) return;

  const payload: ReferralCouponData = {
    ...(cupom && { cupom }),
    ...(ref && { ref }),
    savedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(getStorageKey(eventId), JSON.stringify(payload));
  } catch (e) {
    console.warn("referralCouponCache: save failed", e);
  }
}

/**
 * Lê o cache do evento. Retorna null se não existir ou estiver expirado (7 dias).
 * Remove a chave automaticamente quando expirada.
 */
export function getReferralCoupon(eventId: string): ReferralCouponData | null {
  try {
    const key = getStorageKey(eventId);
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const data = JSON.parse(raw) as ReferralCouponData;
    if (!data || typeof data.savedAt !== "string") {
      localStorage.removeItem(key);
      return null;
    }

    if (isExpired(data.savedAt)) {
      localStorage.removeItem(key);
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * Remove o cache do evento (ex.: após inscrição concluída).
 */
export function clearReferralCoupon(eventId: string): void {
  try {
    localStorage.removeItem(getStorageKey(eventId));
  } catch (e) {
    console.warn("referralCouponCache: clear failed", e);
  }
}
