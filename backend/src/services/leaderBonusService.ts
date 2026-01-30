import { query } from '../config/database.js';
import { createRegistration } from './registrationsService.js';
import { getEventById } from './eventsService.js';
import { getGroupLeaderById } from './groupLeadersService.js';
import { getRegistrationsByLeaderCoupons } from './leaderRegistrationsService.js';

/**
 * Check if leader has reached the required purchases for invitation bonus
 * and grant free registration if applicable
 */
export const checkAndGrantInvitationBonus = async (
  leaderId: string,
  eventId: string
): Promise<{ granted: boolean; registrationId?: string }> => {
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
    
    // NOVO: Buscar o cupom específico desta comissão para contar apenas inscrições que usaram este cupom
    let couponCode: string | null = null;
    try {
      const { getCouponsByLeader } = await import('./couponsService.js');
      const coupons = await getCouponsByLeader(leaderId);
      const commissionIdShort = bonus.id.replace(/-/g, '').substring(0, 8).toUpperCase();
      
      // Encontrar cupom que contém o ID da comissão no código
      console.log(`🔍 [checkAndGrantInvitationBonus] Buscando cupom para comissão ${bonus.id} (ID curto: ${commissionIdShort})`);
      console.log(`🔍 [checkAndGrantInvitationBonus] Total de cupons do líder: ${coupons.length}`);
      
      const matchingCoupon = coupons.find((c) => {
        const matchesEvent = c.event_ids?.includes(eventId) || c.event_id === eventId;
        if (!matchesEvent) {
          console.log(`   ⏭️ Cupom ${c.code} não corresponde ao evento ${eventId}`);
          return false;
        }
        if (c.code && c.code.includes(commissionIdShort)) {
          console.log(`   ✅ Cupom ${c.code} contém o ID da comissão ${commissionIdShort}`);
          return true;
        }
        if (bonus.name && c.name && c.name.includes(bonus.name)) {
          console.log(`   ✅ Cupom ${c.code} corresponde ao nome da comissão "${bonus.name}"`);
          return true;
        }
        console.log(`   ⏭️ Cupom ${c.code} não corresponde (ID: ${c.code?.includes(commissionIdShort) ? 'sim' : 'não'}, Nome: ${bonus.name && c.name && c.name.includes(bonus.name) ? 'sim' : 'não'})`);
        return false;
      });
      
      if (matchingCoupon) {
        couponCode = matchingCoupon.code;
        console.log(`🎫 [checkAndGrantInvitationBonus] ✅ Cupom encontrado para comissão ${bonus.id}: ${couponCode}`);
      } else {
        console.log(`ℹ️ [checkAndGrantInvitationBonus] ⚠️ Nenhum cupom encontrado para comissão ${bonus.id}, contando todas as inscrições do evento`);
        console.log(`   📋 Cupons disponíveis: ${coupons.map(c => c.code).join(', ')}`);
      }
    } catch (couponError: any) {
      console.log(`⚠️ [checkAndGrantInvitationBonus] Erro ao buscar cupom: ${couponError.message}`);
    }
    
    // Count paid registrations for this specific commission (filtered by coupon if available)
    const registrations = await getRegistrationsByLeaderCoupons(leaderId, {
      event_id: eventId,
      payment_status: 'paid',
      coupon_code: couponCode || undefined, // NOVO: Filtrar por cupom específico
    });

    const paidCount = registrations.length;
    console.log(`🔍 [checkAndGrantInvitationBonus] Comissão ${bonus.id}, Cupom ${couponCode || 'N/A'}: ${paidCount} compras pagas`);
    
    // Count how many times this bonus has already been granted for this specific bonus config
    // NOVO: Contar apenas convites associados a esta comissão específica usando commission_id
    let timesGranted = 0;
    
    // Contar convites já concedidos para esta comissão específica
    const grantedCount = await query(
      `SELECT COUNT(*) as count FROM leader_invitations 
       WHERE leader_id = $1 AND event_id = $2 AND commission_id = $3`,
      [leaderId, eventId, bonus.id]
    );
    timesGranted = parseInt(grantedCount.rows[0].count) || 0;
    
    console.log(`🔍 [checkAndGrantInvitationBonus] Convites já concedidos para comissão ${bonus.id}: ${timesGranted}`);
    
    // Calculate how many bonuses should have been granted by now
    // Each time we reach required_purchases, we get a new bonus
    const expectedBonuses = Math.floor(paidCount / bonus.required_purchases);
    
    console.log(`🔍 [checkAndGrantInvitationBonus] Bônus config: required_purchases=${bonus.required_purchases}, paidCount=${paidCount}, expectedBonuses=${expectedBonuses}, timesGranted=${timesGranted}`);
    
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
          // Create free registration for the leader
          const freeRegistration = await createRegistration({
            event_id: eventId,
            runner_id: leader.user_id,
            registered_by: leader.user_id,
            category_id: defaultCategory.id,
            payment_method: 'free_bonus' as any,
            total_amount: 0,
          });

          // Create invitation record so leader can send it to a runner
          try {
            const { createInvitationFromBonus } = await import('./leaderInvitationsService.js');
            await createInvitationFromBonus(leaderId, freeRegistration.id, eventId, bonus.id);
            console.log(`✅ Convite criado para líder ${leaderId} no evento ${eventId} (comissão ${bonus.id}, ${timesGranted + 1}º bônus)`);
          } catch (invitationError: any) {
            // Log error but don't fail bonus grant if invitation creation fails
            console.error('Erro ao criar convite:', invitationError.message);
          }

          bonusesGranted++;
          lastRegistrationId = freeRegistration.id;

          console.log(`✅ Bônus de inscrição grátis concedido para líder ${leaderId} no evento ${eventId} (${bonusesGranted} bônus(es) concedido(s) nesta iteração)`);
          
          // Re-fetch count to ensure we're up to date (in case of concurrent grants)
          // NOVO: Recontar apenas convites desta comissão específica
          const updatedGrantedCount = await query(
            `SELECT COUNT(*) as count FROM leader_invitations 
             WHERE leader_id = $1 AND event_id = $2 AND commission_id = $3`,
            [leaderId, eventId, bonus.id]
          );
          timesGranted = parseInt(updatedGrantedCount.rows[0].count) || 0;
          console.log(`🔄 [checkAndGrantInvitationBonus] Atualizado: timesGranted=${timesGranted} para comissão ${bonus.id}`);
        } catch (error: any) {
          console.error(`❌ Erro ao conceder bônus ${timesGranted + 1}:`, error.message);
          // Continue trying to grant remaining bonuses even if one fails
          // But break if we've tried too many times
          if (attempts >= maxAttempts) {
            console.error(`❌ Limite de tentativas atingido ao conceder bônus`);
            break;
          }
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
};

/**
 * Check all invitation bonuses for a leader after a new paid registration
 */
export const checkAllInvitationBonuses = async (
  leaderId: string,
  eventId: string
): Promise<void> => {
  try {
    console.log(`🎁 [checkAllInvitationBonuses] Verificando bônus para líder ${leaderId} no evento ${eventId}`);
    const result = await checkAndGrantInvitationBonus(leaderId, eventId);
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
    let couponCode: string | null = null;
    try {
      const { getCouponsByLeader } = await import('./couponsService.js');
      const coupons = await getCouponsByLeader(leaderId);
      const commissionIdShort = bonus.id.replace(/-/g, '').substring(0, 8).toUpperCase();
      const matchingCoupon = coupons.find((c: any) => {
        const matchesEvent = c.event_ids?.includes(eventId) || c.event_id === eventId;
        return matchesEvent && c.code && c.code.includes(commissionIdShort);
      });
      if (matchingCoupon) couponCode = matchingCoupon.code;
    } catch (_) {}

    const registrations = await getRegistrationsByLeaderCoupons(leaderId, {
      event_id: eventId,
      payment_status: 'paid',
      coupon_code: couponCode || undefined,
    });
    const paidCount = registrations.length;
    const expectedBonuses = Math.floor(paidCount / bonus.required_purchases);

    const grantedResult = await query(
      `SELECT COUNT(*) as count FROM leader_invitations 
       WHERE leader_id = $1 AND event_id = $2 AND commission_id = $3`,
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
