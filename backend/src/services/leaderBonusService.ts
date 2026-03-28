/**
 * Serviço de bônus de convite — leitura (progresso) e escrita (concessão/revogação).
 * Escrita no domínio de convites: apenas via núcleo canônico (invitationBonusCanonicalCore + invitationBonusGrantService).
 * Ver docs/DOMINIO_CONVITES_CONTRATO_CANONICO.md
 */

import { query } from '../config/database.js';
import { getEventById } from './eventsService.js';
import { getGroupLeaderById } from './groupLeadersService.js';
import { grantInvitationBonusSlotAtomic } from './invitationBonusGrantService.js';
import {
  calculateCanonicalInvitationBonusStateForCommission,
  logLegacyProductionPaidCountForCommission,
} from './invitationBonusCanonicalCore.js';
import {
  runExclusiveLeaderEventInvitationBonus,
  logInvitationBonusStructured,
  normalizeTriggerContext,
  type InvitationBonusTriggerContext,
} from './invitationBonusTriggerGate.js';

export type { InvitationBonusTriggerContext } from './invitationBonusTriggerGate.js';

/**
 * Check if leader has reached the required purchases for invitation bonus
 * and grant free registration if applicable
 */
export const checkAndGrantInvitationBonus = async (
  leaderId: string,
  eventId: string,
  ctx?: InvitationBonusTriggerContext
): Promise<{ granted: boolean; registrationId?: string }> => {
  const triggerCtx = normalizeTriggerContext(ctx);
  return runExclusiveLeaderEventInvitationBonus(leaderId, eventId, async () => {
  logInvitationBonusStructured({
    event: 'invitation_bonus_trigger',
    phase: 'start',
    op: 'checkAndGrantInvitationBonus',
    leader_id: leaderId,
    event_id: eventId,
    source: triggerCtx.source,
    correlation_id: triggerCtx.correlation_id,
    detail: triggerCtx.detail,
  });
  try {
  console.log(`🔍 [checkAndGrantInvitationBonus] Iniciando verificação para líder ${leaderId}, evento ${eventId}`);

  // Get all invitation bonus configurations (can be 'invitation' or 'both' type)
  const invitationBonuses = await query(
    `SELECT * FROM leader_event_commissions 
     WHERE leader_id = $1 AND event_id = $2 
     AND bonus_type IN ('invitation', 'both')
     ORDER BY bonus_type = 'both' DESC, required_purchases ASC`,
    [leaderId, eventId]
  );

  console.log(`🔍 [checkAndGrantInvitationBonus] Configurações de bônus encontradas: ${invitationBonuses.rows.length}`);

  if (invitationBonuses.rows.length === 0) {
    console.log(`ℹ️ [checkAndGrantInvitationBonus] Nenhuma configuração de bônus encontrada para líder ${leaderId} no evento ${eventId}`);
    return { granted: false };
  }

  // Check each bonus configuration to see if we need to grant new bonuses
  for (const bonus of invitationBonuses.rows) {
    console.log(`🔍 [checkAndGrantInvitationBonus] Processando bônus config: id=${bonus.id}, required_purchases=${bonus.required_purchases}, bonus_type=${bonus.bonus_type}`);

    const canonical = await calculateCanonicalInvitationBonusStateForCommission(
      leaderId,
      eventId,
      bonus.id,
      bonus.required_purchases
    );
    const legacy = await logLegacyProductionPaidCountForCommission(leaderId, eventId, bonus.id);
    if (legacy.paidCount_legacy_production !== canonical.paidCount_canonical) {
      console.log(
        `📊 [checkAndGrantInvitationBonus] Comissão ${bonus.id}: canônico paidCount=${canonical.paidCount_canonical} (cupom=${canonical.coupon_code_resolved ?? 'não resolvido'}) | legado_produção=${legacy.paidCount_legacy_production} (diagnóstico)`
      );
    }

    const paidCount = canonical.paidCount_canonical;
    const requiredPurchases = bonus.required_purchases != null && bonus.required_purchases >= 1
      ? bonus.required_purchases
      : 1;
    if (requiredPurchases !== (bonus.required_purchases ?? 0)) {
      console.log(`⚠️ [checkAndGrantInvitationBonus] required_purchases inválido (${bonus.required_purchases}), usando 1`);
    }

    let timesGranted = canonical.times_granted_db;

    console.log(`🔍 [checkAndGrantInvitationBonus] Convites já concedidos para comissão ${bonus.id}: ${timesGranted}`);

    const expectedBonuses = canonical.expectedBonuses_canonical;

    console.log(`🔍 [checkAndGrantInvitationBonus] Bônus config: required_purchases=${requiredPurchases}, paidCount_canonical=${paidCount}, expectedBonuses_canonical=${expectedBonuses}, timesGranted=${timesGranted}`);
    
    // If we need to grant more bonuses, grant all pending bonuses
    if (expectedBonuses > timesGranted) {
      const bonusesToGrant = expectedBonuses - timesGranted;
      console.log(`🎁 [checkAndGrantInvitationBonus] Precisa conceder ${bonusesToGrant} bônus(es) pendente(s)`);
      // Get leader and event info (only once per bonus config)
      const leader = await getGroupLeaderById(leaderId);
      const event = await getEventById(eventId);

      if (!leader || !event) {
        throw new Error('Líder ou evento não encontrado');
      }

      // Get leader's user_id
      const leaderUser = await query(
        'SELECT id FROM users WHERE id = $1',
        [leader.user_id]
      );

      if (leaderUser.rows.length === 0) {
        throw new Error('Usuário do líder não encontrado');
      }

      // Get default category for the event (first category with is_default = true, or cheapest)
      const categories = await query(
        `SELECT id, price FROM categories 
         WHERE event_id = $1
         ORDER BY is_default DESC, price ASC, created_at ASC
         LIMIT 1`,
        [eventId]
      );

      if (categories.rows.length === 0) {
        throw new Error('Nenhuma categoria disponível para o evento');
      }

      const defaultCategory = categories.rows[0];

      // Grant all pending bonuses (loop until timesGranted equals expectedBonuses)
      let bonusesGranted = 0;
      let lastRegistrationId: string | undefined;
      let attempts = 0;
      const maxAttempts = bonusesToGrant + 10; // Safety limit to prevent infinite loops

      while (timesGranted < expectedBonuses && attempts < maxAttempts) {
        attempts++;
        try {
          const { registrationId } = await grantInvitationBonusSlotAtomic({
            eventId,
            leaderId,
            commissionId: bonus.id,
            leaderUserId: leader.user_id,
            categoryId: defaultCategory.id,
          });
          console.log(
            `✅ Convite + inscrição bônus criados atomicamente para líder ${leaderId} (comissão ${bonus.id}) registration=${registrationId}`
          );

          bonusesGranted++;
          lastRegistrationId = registrationId;

          console.log(`✅ Bônus de inscrição grátis concedido para líder ${leaderId} no evento ${eventId} (${bonusesGranted} bônus(es) concedido(s) nesta iteração)`);

          const updatedGrantedCount = await query(
            `SELECT COUNT(*) as count FROM leader_invitations 
             WHERE leader_id = $1 AND event_id = $2 AND commission_id = $3 
             AND status IN ('available', 'sent', 'used')`,
            [leaderId, eventId, bonus.id]
          );
          timesGranted = parseInt(updatedGrantedCount.rows[0].count) || 0;
          console.log(`🔄 [checkAndGrantInvitationBonus] Atualizado: timesGranted=${timesGranted} para comissão ${bonus.id}`);
        } catch (error: any) {
          console.error(`❌ [checkAndGrantInvitationBonus] Erro na concessão atômica (já com rollback se aplicável):`, error.message);
          break;
        }
      }

      if (bonusesGranted > 0) {
        console.log(`✅ Total de ${bonusesGranted} bônus(es) concedido(s) para líder ${leaderId} no evento ${eventId}`);
        return {
          granted: true,
          registrationId: lastRegistrationId,
        };
      } else {
        console.log(`ℹ️ [checkAndGrantInvitationBonus] Nenhum bônus foi concedido (expectedBonuses=${expectedBonuses}, timesGranted=${timesGranted})`);
      }
    } else {
      console.log(`ℹ️ [checkAndGrantInvitationBonus] Não precisa conceder bônus (expectedBonuses=${expectedBonuses} <= timesGranted=${timesGranted})`);
    }
  }

  console.log(`ℹ️ [checkAndGrantInvitationBonus] Nenhum bônus concedido para líder ${leaderId} no evento ${eventId}`);
  return { granted: false };
  } catch (error: any) {
    logInvitationBonusStructured({
      event: 'invitation_bonus_trigger',
      phase: 'error',
      op: 'checkAndGrantInvitationBonus',
      leader_id: leaderId,
      event_id: eventId,
      source: triggerCtx.source,
      correlation_id: triggerCtx.correlation_id,
      detail: triggerCtx.detail,
      message: error?.message,
    });
    throw error;
  } finally {
    logInvitationBonusStructured({
      event: 'invitation_bonus_trigger',
      phase: 'end',
      op: 'checkAndGrantInvitationBonus',
      leader_id: leaderId,
      event_id: eventId,
      source: triggerCtx.source,
      correlation_id: triggerCtx.correlation_id,
      detail: triggerCtx.detail,
    });
  }
  });
};

/**
 * Obtém o ID da comissão (leader_event_commission) cujo cupom corresponde ao código informado.
 * Usado para disparar a verificação de convite na comissão correta quando um pagamento é confirmado com cupom.
 */
export const getCommissionIdByCouponCode = async (
  leaderId: string,
  eventId: string,
  couponCode: string
): Promise<string | null> => {
  if (!couponCode || !couponCode.trim()) return null;
  const { getCouponByEventCommission } = await import('./couponsService.js');
  const normalizedInput = couponCode.trim().toUpperCase();
  const bonuses = await query(
    `SELECT id FROM leader_event_commissions 
     WHERE leader_id = $1 AND event_id = $2 
     AND bonus_type IN ('invitation', 'both')
     ORDER BY created_at ASC`,
    [leaderId, eventId]
  );
  for (const row of bonuses.rows) {
    try {
      const coupon = await getCouponByEventCommission(leaderId, eventId, row.id);
      if (coupon?.code && coupon.code.trim().toUpperCase() === normalizedInput) {
        return row.id;
      }
    } catch (_) {}
  }
  return null;
};

/**
 * Dispara a verificação de bônus de convite quando uma inscrição paga usou cupom de líder.
 * Chama checkInvitationBonusForCommission para a comissão desse cupom e depois checkAllInvitationBonuses para todas.
 */
export const triggerInvitationBonusAfterPaidWithCoupon = async (
  leaderId: string,
  eventId: string,
  couponCode: string | null,
  ctx?: InvitationBonusTriggerContext
): Promise<void> => {
  const triggerCtx = normalizeTriggerContext(ctx);
  try {
    logInvitationBonusStructured({
      event: 'invitation_bonus_trigger',
      phase: 'start',
      op: 'triggerInvitationBonusAfterPaidWithCoupon',
      leader_id: leaderId,
      event_id: eventId,
      source: triggerCtx.source,
      correlation_id: triggerCtx.correlation_id,
      detail: triggerCtx.detail,
    });
    if (couponCode?.trim()) {
      const commissionId = await getCommissionIdByCouponCode(leaderId, eventId, couponCode);
      if (commissionId) {
        console.log(`🎁 [triggerInvitationBonusAfterPaidWithCoupon] Disparando verificação para comissão ${commissionId} (cupom usado na compra)`);
        await checkInvitationBonusForCommission(leaderId, eventId, commissionId, {
          ...triggerCtx,
          detail: `${triggerCtx.detail ?? ''} after_paid_commission`.trim(),
        });
      }
    }
    await checkAllInvitationBonuses(leaderId, eventId, {
      ...triggerCtx,
      detail: `${triggerCtx.detail ?? ''} after_paid_full_check`.trim(),
    });
    logInvitationBonusStructured({
      event: 'invitation_bonus_trigger',
      phase: 'end',
      op: 'triggerInvitationBonusAfterPaidWithCoupon',
      leader_id: leaderId,
      event_id: eventId,
      source: triggerCtx.source,
      correlation_id: triggerCtx.correlation_id,
      detail: triggerCtx.detail,
    });
  } catch (err: any) {
    logInvitationBonusStructured({
      event: 'invitation_bonus_trigger',
      phase: 'error',
      op: 'triggerInvitationBonusAfterPaidWithCoupon',
      leader_id: leaderId,
      event_id: eventId,
      source: triggerCtx.source,
      correlation_id: triggerCtx.correlation_id,
      detail: triggerCtx.detail,
      message: err?.message,
    });
    console.error('❌ [triggerInvitationBonusAfterPaidWithCoupon] Erro:', err.message);
  }
};

/**
 * Check all invitation bonuses for a leader after a new paid registration
 */
export const checkAllInvitationBonuses = async (
  leaderId: string,
  eventId: string,
  ctx?: InvitationBonusTriggerContext
): Promise<void> => {
  try {
    console.log(`🎁 [checkAllInvitationBonuses] Verificando bônus para líder ${leaderId} no evento ${eventId}`);
    const result = await checkAndGrantInvitationBonus(leaderId, eventId, ctx);
    if (result.granted) {
      console.log(`✅ [checkAllInvitationBonuses] Bônus concedido com sucesso`);
    } else {
      console.log(`ℹ️ [checkAllInvitationBonuses] Nenhum bônus concedido`);
    }
  } catch (error: any) {
    // Log error but don't fail the registration process
    console.error('❌ [checkAllInvitationBonuses] Erro ao verificar bônus de convite:', error.message);
    console.error('❌ [checkAllInvitationBonuses] Stack:', error.stack);
  }
};

/**
 * Verifica e aplica/revoga bônus de convite para uma comissão específica.
 * Usado após troca de cupom ou atrelar inscrição, para garantir que a contagem
 * já inclui a inscrição recém-atualizada e que convites sejam gerados ou revogados conforme a meta.
 */
export const checkInvitationBonusForCommission = async (
  leaderId: string,
  eventId: string,
  commissionId: string,
  ctx?: InvitationBonusTriggerContext
): Promise<{ granted: number; revoked: number }> => {
  const triggerCtx = normalizeTriggerContext(ctx);
  return runExclusiveLeaderEventInvitationBonus(leaderId, eventId, async () => {
  logInvitationBonusStructured({
    event: 'invitation_bonus_trigger',
    phase: 'start',
    op: 'checkInvitationBonusForCommission',
    leader_id: leaderId,
    event_id: eventId,
    commission_id: commissionId,
    source: triggerCtx.source,
    correlation_id: triggerCtx.correlation_id,
    detail: triggerCtx.detail,
  });
  try {
  const { getLeaderEventCommissionById } = await import('./leaderEventCommissionsService.js');

  const commission = await getLeaderEventCommissionById(commissionId);
  if (!commission || !['invitation', 'both'].includes(commission.bonus_type || '')) {
    return { granted: 0, revoked: 0 };
  }

  const bonus = commission as { id: string; required_purchases: number | null };
  const canonical = await calculateCanonicalInvitationBonusStateForCommission(
    leaderId,
    eventId,
    bonus.id,
    bonus.required_purchases
  );
  const paidCount = canonical.paidCount_canonical;
  const requiredPurchases = bonus.required_purchases != null && bonus.required_purchases >= 1
    ? bonus.required_purchases
    : 1;
  const expectedBonuses = canonical.expectedBonuses_canonical;
  let timesGranted = canonical.times_granted_db;

  console.log(
    `🎁 [checkInvitationBonusForCommission] Comissão ${bonus.id}: paidCount_canonical=${paidCount}, required=${requiredPurchases}, expectedBonuses_canonical=${expectedBonuses}, timesGranted=${timesGranted}`
  );

  let granted = 0;
  if (expectedBonuses > timesGranted) {
    const leader = await getGroupLeaderById(leaderId);
    const event = await getEventById(eventId);
    if (!leader || !event) return { granted: 0, revoked: 0 };

    const categories = await query(
      `SELECT id FROM categories 
       WHERE event_id = $1 ORDER BY is_default DESC, price ASC, created_at ASC LIMIT 1`,
      [eventId]
    );
    if (categories.rows.length === 0) return { granted: 0, revoked: 0 };
    const defaultCategory = categories.rows[0];

    const bonusesToGrant = expectedBonuses - timesGranted;
    let attempts = 0;
    const maxAttempts = bonusesToGrant + 5;
    while (timesGranted < expectedBonuses && attempts < maxAttempts) {
      attempts++;
      try {
        await grantInvitationBonusSlotAtomic({
          eventId,
          leaderId,
          commissionId: bonus.id,
          leaderUserId: leader.user_id,
          categoryId: defaultCategory.id,
        });
        granted++;
        const updated = await query(
          `SELECT COUNT(*) as count FROM leader_invitations 
           WHERE leader_id = $1 AND event_id = $2 AND commission_id = $3 
           AND status IN ('available', 'sent', 'used')`,
          [leaderId, eventId, bonus.id]
        );
        timesGranted = parseInt(updated.rows[0].count) || 0;
      } catch (err: any) {
        console.error(
          `❌ [checkInvitationBonusForCommission] Erro na concessão atômica (rollback se aplicável):`,
          err.message
        );
        break;
      }
    }
    if (granted > 0) {
      console.log(`✅ [checkInvitationBonusForCommission] Concedidos ${granted} convite(s) para comissão ${bonus.id}`);
    }
  }

  let revoked = 0;
  if (timesGranted > expectedBonuses) {
    const toRevoke = timesGranted - expectedBonuses;
    const toRevokeIds = await query(
      `SELECT id FROM leader_invitations 
       WHERE leader_id = $1 AND event_id = $2 AND commission_id = $3 AND status = 'available'
       ORDER BY created_at DESC LIMIT $4`,
      [leaderId, eventId, bonus.id, toRevoke]
    );
    for (const row of toRevokeIds.rows) {
      await query(
        `UPDATE leader_invitations SET status = 'expired', updated_at = NOW() WHERE id = $1`,
        [row.id]
      );
      revoked++;
    }
    if (revoked > 0) {
      console.log(`🔄 [checkInvitationBonusForCommission] Revogados ${revoked} convite(s) em excesso para comissão ${bonus.id}`);
    }
  }

  return { granted, revoked };
  } catch (error: any) {
    logInvitationBonusStructured({
      event: 'invitation_bonus_trigger',
      phase: 'error',
      op: 'checkInvitationBonusForCommission',
      leader_id: leaderId,
      event_id: eventId,
      commission_id: commissionId,
      source: triggerCtx.source,
      correlation_id: triggerCtx.correlation_id,
      detail: triggerCtx.detail,
      message: error?.message,
    });
    throw error;
  } finally {
    logInvitationBonusStructured({
      event: 'invitation_bonus_trigger',
      phase: 'end',
      op: 'checkInvitationBonusForCommission',
      leader_id: leaderId,
      event_id: eventId,
      commission_id: commissionId,
      source: triggerCtx.source,
      correlation_id: triggerCtx.correlation_id,
      detail: triggerCtx.detail,
    });
  }
  });
};

/**
 * Recalculate invitation bonuses for a leader/event and revoke excess (e.g. when a registration is detached).
 * Used when removing atrelamento so the old leader's bonus count decreases.
 */
export const recalculateAndRevokeExcessInvitations = async (
  leaderId: string,
  eventId: string
): Promise<number> => {
  let totalRevoked = 0;
  const invitationBonuses = await query(
    `SELECT * FROM leader_event_commissions 
     WHERE leader_id = $1 AND event_id = $2 
     AND bonus_type IN ('invitation', 'both')
     ORDER BY required_purchases ASC`,
    [leaderId, eventId]
  );

  for (const bonus of invitationBonuses.rows) {
    const canonical = await calculateCanonicalInvitationBonusStateForCommission(
      leaderId,
      eventId,
      bonus.id,
      bonus.required_purchases
    );
    const expectedBonuses = canonical.expectedBonuses_canonical;

    const grantedResult = await query(
      `SELECT COUNT(*) as count FROM leader_invitations 
       WHERE leader_id = $1 AND event_id = $2 AND commission_id = $3
       AND status IN ('available', 'sent', 'used')`,
      [leaderId, eventId, bonus.id]
    );
    const granted = parseInt(grantedResult.rows[0].count) || 0;

    if (granted > expectedBonuses) {
      const toRevoke = granted - expectedBonuses;
      const toRevokeIds = await query(
        `SELECT id FROM leader_invitations 
         WHERE leader_id = $1 AND event_id = $2 AND commission_id = $3 AND status = 'available'
         ORDER BY created_at DESC
         LIMIT $4`,
        [leaderId, eventId, bonus.id, toRevoke]
      );
      for (const row of toRevokeIds.rows) {
        await query(
          `UPDATE leader_invitations SET status = 'expired', updated_at = NOW() WHERE id = $1`,
          [row.id]
        );
        totalRevoked++;
      }
      if (toRevoke > 0) {
        console.log(`🔄 [recalculateAndRevokeExcessInvitations] Líder ${leaderId} evento ${eventId}: revogados ${toRevoke} convite(s) em excesso`);
      }
    }
  }
  return totalRevoked;
};

/**
 * Progress item for invitation bonus: one row per leader_event_commission (invitation or both).
 */
export interface LeaderInvitationProgressItem {
  event_id: string;
  event_title: string;
  commission_id: string;
  commission_name: string | null;
  required_purchases: number;
  paid_count: number;
  invitations_granted: number;
  /** Inscrições restantes para ganhar o próximo convite (0 = já pode ter próximo) */
  next_convite_in: number;
}

/**
 * Get invitation progress for a leader: for each event commission with bonus_type invitation or both,
 * returns paid count, invitations granted, and progress toward next convite.
 * Somente leitura — não dispara concessão de bônus (evita efeitos colaterais ao abrir tela).
 * paid_count alinhado ao núcleo canônico (sem fallback referral).
 */
export const getLeaderInvitationProgress = async (
  leaderId: string,
  organizerId?: string
): Promise<LeaderInvitationProgressItem[]> => {
  let queryText = `SELECT lec.id as commission_id, lec.event_id, lec.name as commission_name, lec.required_purchases, e.title as event_title
     FROM leader_event_commissions lec
     JOIN events e ON lec.event_id = e.id
     WHERE lec.leader_id = $1 AND lec.bonus_type IN ('invitation', 'both')`;
  const params: any[] = [leaderId];
  if (organizerId) {
    queryText += ` AND e.organizer_id = $${params.length + 1}`;
    params.push(organizerId);
  }
  queryText += ` ORDER BY e.title, lec.name`;
  const bonuses = await query(queryText, params);

  const result: LeaderInvitationProgressItem[] = [];

  for (const row of bonuses.rows) {
    const required_purchases = parseInt(row.required_purchases, 10) || 1;
    const canonical = await calculateCanonicalInvitationBonusStateForCommission(
      leaderId,
      row.event_id,
      row.commission_id,
      row.required_purchases
    );
    const paid_count = canonical.paidCount_canonical;
    const invitations_granted = canonical.times_granted_db;

    const remainder = paid_count % required_purchases;
    // Só marcar "próximo convite disponível" (0) quando já atingiu pelo menos um múltiplo (ex.: 20, 40...)
    const next_convite_in =
      paid_count === 0
        ? required_purchases
        : remainder === 0
          ? 0
          : required_purchases - remainder;

    result.push({
      event_id: row.event_id,
      event_title: row.event_title || 'N/A',
      commission_id: row.commission_id,
      commission_name: row.commission_name || null,
      required_purchases,
      paid_count,
      invitations_granted,
      next_convite_in,
    });
  }

  return result;
}
