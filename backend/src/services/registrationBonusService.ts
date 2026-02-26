import { query } from '../config/database.js';
import { checkAllInvitationBonuses } from './leaderBonusService.js';

/**
 * Check and grant invitation bonuses when a registration payment is confirmed
 * This should be called whenever a registration's payment_status changes to 'paid'
 */
export const checkInvitationBonusesOnPaymentConfirmation = async (
  registrationId: string
): Promise<void> => {
  try {
    // Get registration details
    const registrationResult = await query(
      `SELECT 
        r.id,
        r.event_id,
        r.runner_id,
        r.payment_status,
        r.coupon_code
      FROM registrations r
      WHERE r.id = $1`,
      [registrationId]
    );

    if (registrationResult.rows.length === 0) {
      console.log(`ℹ️ Inscrição não encontrada: ${registrationId}`);
      return;
    }

    const registration = registrationResult.rows[0];

    // Only check if payment is confirmed
    if (registration.payment_status !== 'paid') {
      return;
    }

    // Find the leader associated with this registration
    // Check multiple sources:
    // 1. If runner was referred by a leader (user_referrals)
    // 2. If registration used a leader's coupon
    // 3. If registration has a referral code in the URL (stored in user_referrals when user registered)
    
    let leaderId: string | null = null;

    // First, check if runner was referred by a leader
    const referralResult = await query(
      `SELECT leader_id 
       FROM user_referrals 
       WHERE user_id = $1`,
      [registration.runner_id]
    );

    if (referralResult.rows.length > 0) {
      leaderId = referralResult.rows[0].leader_id;
    } else if (registration.coupon_code) {
      // Check if coupon belongs to a leader
      const couponResult = await query(
        `SELECT leader_id 
         FROM coupons 
         WHERE code = $1 AND leader_id IS NOT NULL`,
        [registration.coupon_code]
      );

      if (couponResult.rows.length > 0) {
        leaderId = couponResult.rows[0].leader_id;
      }
    }

    if (!leaderId) {
      // No leader associated with this registration
      return;
    }

    console.log(`🔄 Verificando bônus de convite para líder ${leaderId} no evento ${registration.event_id}`);

    // Check and grant invitation bonuses
    await checkAllInvitationBonuses(leaderId, registration.event_id);

    console.log(`✅ Verificação de bônus de convite concluída para inscrição ${registrationId}`);
  } catch (error: any) {
    // Log error but don't fail the payment confirmation process
    console.error('❌ Erro ao verificar bônus de convite:', error.message);
  }
};

