/**
 * NÚCLEO CANÔNICO — Domínio de convites (Etapa 1 / CORE)
 *
 * Fonte de verdade do cálculo de elegibilidade para concessão de convites:
 * - vendas elegíveis = inscrições pagas no evento com o cupom da comissão vinculado ao líder
 * - SEM fallback por referral (diferente do legado "produção" em getRegistrationsByLeaderCoupons sem filtro de cupom)
 *
 * Ref.: docs/DOMINIO_CONVITES_CONTRATO_CANONICO.md
 *
 * LEGADO (auditoria / diagnóstico): getRegistrationsByLeaderCoupons com ou sem coupon_code
 * continua disponível em leaderRegistrationsService para comparação na Fase 1.
 */

import { query } from '../config/database.js';
import { getCouponByEventCommission } from './couponsService.js';

/**
 * Canônico: inscrições pagas no evento com o cupom informado, pertencente ao líder (via coupons).
 * Sem referral. Se cupom vazio/nulo → conjunto vazio (não há vendas elegíveis para aquela comissão).
 */
export async function getCanonicalPaidRegistrationIds(
  leaderId: string,
  eventId: string,
  couponCode: string | null
): Promise<string[]> {
  if (!couponCode || !String(couponCode).trim()) {
    return [];
  }
  const result = await query(
    `SELECT DISTINCT r.id::text AS id
     FROM registrations r
     WHERE r.event_id = $1
       AND r.payment_status = 'paid'
       AND (r.status IS NULL OR r.status != 'cancelled')
       AND r.coupon_code IS NOT NULL
       AND UPPER(TRIM(r.coupon_code)) = UPPER(TRIM($3))
       AND EXISTS (
         SELECT 1 FROM coupons cp
         WHERE UPPER(TRIM(cp.code)) = UPPER(TRIM(r.coupon_code))
           AND cp.leader_id = $2
       )`,
    [eventId, leaderId, couponCode.trim()]
  );
  return (result.rows as { id: string }[]).map((r) => r.id);
}

function requiredPurchasesSafe(v: unknown): number {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return n >= 1 ? n : 1;
}

/** Conta convites concedidos no DB para a comissão (status que contam para meta). */
export async function countInvitationsGrantedDbForCommission(
  leaderId: string,
  eventId: string,
  commissionId: string
): Promise<number> {
  const grantedResult = await query(
    `SELECT COUNT(*)::int AS count FROM leader_invitations
     WHERE leader_id = $1 AND event_id = $2 AND commission_id = $3
       AND status IN ('available', 'sent', 'used')`,
    [leaderId, eventId, commissionId]
  );
  return parseInt(String(grantedResult.rows[0]?.count ?? 0), 10) || 0;
}

/**
 * Estado canônico por comissão — alvo oficial para concessão (Etapa 1) e leituras alinhadas ao núcleo.
 * Não inclui classificação de convites "inconsistentes" (isso permanece na auditoria Fase 1).
 */
export interface CanonicalInvitationBonusStateForCommission {
  leader_id: string;
  event_id: string;
  commission_id: string;
  coupon_code_resolved: string | null;
  paidCount_canonical: number;
  expectedBonuses_canonical: number;
  registration_ids_canonical: string[];
  times_granted_db: number;
}

/**
 * Resolve cupom da comissão e calcula estado canônico (sem efeitos colaterais, somente leitura).
 */
export async function calculateCanonicalInvitationBonusStateForCommission(
  leaderId: string,
  eventId: string,
  commissionId: string,
  requiredPurchasesRaw: unknown
): Promise<CanonicalInvitationBonusStateForCommission> {
  let couponCode: string | null = null;
  try {
    const coupon = await getCouponByEventCommission(leaderId, eventId, commissionId);
    if (coupon?.code) couponCode = coupon.code;
  } catch (_) {}

  const registration_ids_canonical = await getCanonicalPaidRegistrationIds(leaderId, eventId, couponCode);
  const paidCount_canonical = registration_ids_canonical.length;
  const required = requiredPurchasesSafe(requiredPurchasesRaw);
  const expectedBonuses_canonical = Math.floor(paidCount_canonical / required);
  const times_granted_db = await countInvitationsGrantedDbForCommission(leaderId, eventId, commissionId);

  return {
    leader_id: leaderId,
    event_id: eventId,
    commission_id: commissionId,
    coupon_code_resolved: couponCode,
    paidCount_canonical,
    expectedBonuses_canonical,
    registration_ids_canonical,
    times_granted_db,
  };
}

/**
 * LEGADO / diagnóstico: espelha o antigo cálculo de "produção" usado antes do núcleo canônico.
 * Mantido para logs e possível comparação; não usar para decisão de concessão.
 */
export async function logLegacyProductionPaidCountForCommission(
  leaderId: string,
  eventId: string,
  commissionId: string
): Promise<{ paidCount_legacy_production: number; coupon_code_used: string | null }> {
  const { getRegistrationsByLeaderCoupons } = await import('./leaderRegistrationsService.js');
  let couponCode: string | null = null;
  try {
    const coupon = await getCouponByEventCommission(leaderId, eventId, commissionId);
    if (coupon?.code) couponCode = coupon.code;
  } catch (_) {}

  const registrations = await getRegistrationsByLeaderCoupons(leaderId, {
    event_id: eventId,
    payment_status: 'paid',
    coupon_code: couponCode || undefined,
  });
  return {
    paidCount_legacy_production: registrations.length,
    coupon_code_used: couponCode,
  };
}
