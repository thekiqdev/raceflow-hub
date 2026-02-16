import { query } from '../config/database.js';
import { LeaderCommission } from '../types/index.js';
import { getGroupLeaderById } from './groupLeadersService.js';
import { addToTotalEarnings } from './groupLeadersService.js';

export interface CreateCommissionData {
  leader_id: string;
  registration_id: string;
  referred_user_id: string;
  event_id: string;
  registration_amount: number;
}

/**
 * Calculate commission amount
 * Now uses event-specific commission only (no global commission)
 */
export const calculateCommissionAmount = async (
  leaderId: string,
  eventId: string,
  registrationAmount: number
): Promise<{ amount: number; percentage: number }> => {
  // Get leader
  const leader = await getGroupLeaderById(leaderId);
  
  if (!leader) {
    throw new Error('Group leader not found');
  }
  
  if (!leader.is_active) {
    throw new Error('Group leader is not active');
  }
  
  // Get event-specific commission (prefer 'commission' or 'both' type)
  const commissionResult = await query(
    `SELECT * FROM leader_event_commissions 
     WHERE leader_id = $1 AND event_id = $2 
     AND bonus_type IN ('commission', 'both')
     ORDER BY bonus_type = 'both' DESC, created_at DESC
     LIMIT 1`,
    [leaderId, eventId]
  );
  
  if (commissionResult.rows.length === 0) {
    // No commission configured for this event - return 0
    return {
      amount: 0,
      percentage: 0,
    };
  }
  
  const eventCommission = commissionResult.rows[0];
  const commissionPercentage = eventCommission.commission_percentage;
  
  // Calculate commission amount
  const commissionAmount = registrationAmount * (commissionPercentage / 100);
  
  return {
    amount: parseFloat(commissionAmount.toFixed(2)),
    percentage: commissionPercentage,
  };
};

/**
 * Create commission record
 */
export const createCommission = async (
  data: CreateCommissionData
): Promise<LeaderCommission> => {
  // Get coupon code from registration to find the specific commission
  const registrationData = await query(
    'SELECT coupon_code FROM registrations WHERE id = $1',
    [data.registration_id]
  );
  const couponCode = registrationData.rows[0]?.coupon_code;
  
  let commissionConfig: any = null;
  let foundByCoupon = false;
  
  // If a coupon was used, try to find the specific commission associated with that coupon
  if (couponCode) {
    // Find commission by matching coupon code (contains commission ID in the code)
    const { getCouponByCodeOnly } = await import('./couponsService.js');
    try {
      const coupon = await getCouponByCodeOnly(couponCode);
      if (coupon && coupon.leader_id === data.leader_id) {
        // Extract commission ID from coupon code (first 8 chars after referral code)
        // Coupon code format: REFERRAL_CODE + COMMISSION_ID_SHORT + TIMESTAMP + RANDOM
        const { getCouponsByLeader } = await import('./couponsService.js');
        const leaderCoupons = await getCouponsByLeader(data.leader_id);
        const matchingCoupon = leaderCoupons.find(c => c.code === couponCode);
        
        if (matchingCoupon) {
          // Try to find commission by matching coupon code pattern
          // The coupon code contains the commission ID (first 8 chars without dashes)
          const allCommissions = await query(
            `SELECT * FROM leader_event_commissions 
             WHERE leader_id = $1 AND event_id = $2
             ORDER BY created_at DESC`,
            [data.leader_id, data.event_id]
          );
          
          // Match commission by checking if coupon code contains commission ID
          for (const comm of allCommissions.rows) {
            const commissionIdShort = comm.id.replace(/-/g, '').substring(0, 8).toUpperCase();
            if (couponCode.includes(commissionIdShort)) {
              commissionConfig = comm;
              foundByCoupon = true;
              console.log(`✅ [createCommission] Comissão encontrada pelo cupom ${couponCode}: ${comm.id} (tipo: ${comm.bonus_type}, percentual: ${comm.commission_percentage}%)`);
              break;
            }
          }
        }
      }
    } catch (couponError: any) {
      console.log(`ℹ️ [createCommission] Erro ao buscar cupom ${couponCode}:`, couponError.message);
    }
  }
  
  // If no commission found by coupon, check for any commission or both type
  if (!commissionConfig) {
    const commissionResult = await query(
      `SELECT * FROM leader_event_commissions 
       WHERE leader_id = $1 AND event_id = $2 
       AND bonus_type IN ('commission', 'both')
       ORDER BY bonus_type = 'both' DESC, created_at DESC
       LIMIT 1`,
      [data.leader_id, data.event_id]
    );
    
    if (commissionResult.rows.length > 0) {
      commissionConfig = commissionResult.rows[0];
    }
  }
  
  // If commission config found and it's invitation type only, don't create commission
  if (commissionConfig && commissionConfig.bonus_type === 'invitation') {
    console.log(`ℹ️ [createCommission] Cupom pertence a comissão do tipo 'invitation', pulando criação de comissão`);
    try {
      const { triggerInvitationBonusAfterPaidWithCoupon } = await import('./leaderBonusService.js');
      const registration = await query(
        'SELECT payment_status FROM registrations WHERE id = $1',
        [data.registration_id]
      );
      if (registration.rows.length > 0 && registration.rows[0].payment_status === 'paid') {
        await triggerInvitationBonusAfterPaidWithCoupon(data.leader_id, data.event_id, couponCode);
      }
    } catch (bonusError: any) {
      console.error('❌ [createCommission] Erro ao verificar bônus:', bonusError.message);
    }
    throw new Error('No commission configured for this event (invitation type only)');
  }
  
  // If no commission config exists (only 'invitation' type), don't create commission
  if (!commissionConfig) {
    console.log(`ℹ️ [createCommission] Nenhuma configuração de comissão encontrada (apenas tipo 'invitation'), pulando criação de comissão`);
    try {
      const { triggerInvitationBonusAfterPaidWithCoupon } = await import('./leaderBonusService.js');
      const registration = await query(
        'SELECT payment_status FROM registrations WHERE id = $1',
        [data.registration_id]
      );
      if (registration.rows.length > 0 && registration.rows[0].payment_status === 'paid') {
        await triggerInvitationBonusAfterPaidWithCoupon(data.leader_id, data.event_id, couponCode);
      }
    } catch (bonusError: any) {
      console.error('❌ [createCommission] Erro ao verificar bônus:', bonusError.message);
    }
    throw new Error('No commission configured for this event (invitation type only)');
  }

  // Calculate commission using the commission config found (either by coupon or fallback)
  // This ensures we use the correct commission percentage configured by the organizer
  const commissionPercentage = commissionConfig.commission_percentage;
  const commissionAmount = data.registration_amount * (commissionPercentage / 100);
  const amount = parseFloat(commissionAmount.toFixed(2));
  const percentage = commissionPercentage;
  
  console.log(`💰 [createCommission] Calculando comissão usando configuração encontrada:`, {
    commission_id: commissionConfig.id,
    commission_percentage: commissionPercentage,
    registration_amount: data.registration_amount,
    commission_amount: amount,
    found_by_coupon: foundByCoupon,
    coupon_code: couponCode || null,
  });
  
  // Only create commission if amount > 0
  if (amount <= 0) {
    throw new Error('Commission amount must be greater than 0');
  }
  
  // Check if an active (non-cancelled) commission already exists for this registration
  const existingCommission = await query(
    `SELECT id FROM leader_commissions 
     WHERE registration_id = $1 AND leader_id = $2 AND status IN ('pending', 'paid')`,
    [data.registration_id, data.leader_id]
  );
  
  if (existingCommission.rows.length > 0) {
    throw new Error('Commission already exists for this registration');
  }
  
  // Create commission
  const result = await query(
    `INSERT INTO leader_commissions (
      leader_id, registration_id, referred_user_id, event_id,
      commission_amount, commission_percentage, registration_amount, status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [
      data.leader_id,
      data.registration_id,
      data.referred_user_id,
      data.event_id,
      amount,
      percentage,
      data.registration_amount,
      'pending',
    ]
  );
  
  // Update leader's total earnings
  await addToTotalEarnings(data.leader_id, amount);
  
  const commission = result.rows[0] as LeaderCommission;
  
  // Check if this commission type includes invitation bonus and check if we need to grant it
  // Only check for invitation bonuses if the commission type is 'both' or 'invitation'
  // If it's only 'commission', don't check for invitation bonuses
  if (commissionConfig && (commissionConfig.bonus_type === 'both' || commissionConfig.bonus_type === 'invitation')) {
    try {
      console.log(`🎁 [createCommission] Verificando bônus de convite após criar comissão para líder ${data.leader_id} no evento ${data.event_id} (tipo: ${commissionConfig.bonus_type})`);
      const { checkAllInvitationBonuses } = await import('./leaderBonusService.js');
      // Only check if registration is paid (we'll check payment status from registration)
      const registration = await query(
        'SELECT payment_status FROM registrations WHERE id = $1',
        [data.registration_id]
      );
      
      if (registration.rows.length > 0 && registration.rows[0].payment_status === 'paid') {
        console.log(`✅ [createCommission] Pagamento está pago, verificando bônus...`);
        await checkAllInvitationBonuses(data.leader_id, data.event_id);
      } else {
        console.log(`ℹ️ [createCommission] Pagamento não está pago ainda (status: ${registration.rows[0]?.payment_status}), bônus será verificado quando o pagamento for confirmado`);
      }
    } catch (bonusError: any) {
      // Log error but don't fail commission creation if bonus check fails
      console.error('❌ [createCommission] Erro ao verificar bônus de convite após criar comissão:', bonusError.message);
      console.error('❌ [createCommission] Stack:', bonusError.stack);
    }
  } else {
    console.log(`ℹ️ [createCommission] Tipo de comissão é apenas 'commission', não verificando bônus de convite`);
  }
  
  return commission;
};

/**
 * Get commissions by leader ID
 */
export interface CommissionFilters {
  status?: 'pending' | 'paid' | 'cancelled';
  start_date?: string;
  end_date?: string;
  event_id?: string;
}

export const getCommissionsByLeader = async (
  leaderId: string,
  filters?: CommissionFilters,
  organizerId?: string
): Promise<LeaderCommission[]> => {
  let sql = `
    SELECT lc.*, 
           e.title as event_title,
           u.email as referred_user_email,
           p.full_name as referred_user_name
    FROM leader_commissions lc
    JOIN events e ON lc.event_id = e.id
    JOIN registrations r ON lc.registration_id = r.id AND (r.status IS NULL OR r.status != 'cancelled')
    JOIN users u ON lc.referred_user_id = u.id
    LEFT JOIN profiles p ON u.id = p.id
    WHERE lc.leader_id = $1
    AND lc.status IN ('pending', 'paid')
  `;
  
  const values: any[] = [leaderId];
  let paramIndex = 2;
  
  // Filter by organizer if provided
  if (organizerId) {
    sql += ` AND e.organizer_id = $${paramIndex}`;
    values.push(organizerId);
    paramIndex++;
  }
  
  if (filters) {
    if (filters.status) {
      sql += ` AND lc.status = $${paramIndex}`;
      values.push(filters.status);
      paramIndex++;
    }
    
    if (filters.start_date) {
      sql += ` AND lc.created_at >= $${paramIndex}`;
      values.push(filters.start_date);
      paramIndex++;
    }
    
    if (filters.end_date) {
      sql += ` AND lc.created_at <= $${paramIndex}`;
      values.push(filters.end_date);
      paramIndex++;
    }
    
    if (filters.event_id) {
      sql += ` AND lc.event_id = $${paramIndex}`;
      values.push(filters.event_id);
      paramIndex++;
    }
  }
  
  sql += ' ORDER BY lc.created_at DESC';
  
  const result = await query(sql, values);
  
  return result.rows as LeaderCommission[];
};

/**
 * Get commission by ID
 */
export const getCommissionById = async (commissionId: string): Promise<LeaderCommission | null> => {
  const result = await query(
    'SELECT * FROM leader_commissions WHERE id = $1',
    [commissionId]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return result.rows[0] as LeaderCommission;
};

/**
 * Get commission by registration ID (for admin: show commission linked to a registration)
 */
/** Retorna a comissão ativa (pending ou paid) vinculada à inscrição. Canceladas são ignoradas para permitir novo atrelamento. */
export const getCommissionByRegistrationId = async (registrationId: string): Promise<LeaderCommission | null> => {
  const result = await query(
    `SELECT * FROM leader_commissions 
     WHERE registration_id = $1 AND status IN ('pending', 'paid') 
     ORDER BY created_at DESC LIMIT 1`,
    [registrationId]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return result.rows[0] as LeaderCommission;
};

/**
 * Update commission status
 */
export const updateCommissionStatus = async (
  commissionId: string,
  status: 'pending' | 'paid' | 'cancelled',
  paidAt?: Date
): Promise<LeaderCommission> => {
  const result = await query(
    `UPDATE leader_commissions 
     SET status = $1, paid_at = $2, updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [status, paidAt || null, commissionId]
  );
  
  if (result.rows.length === 0) {
    throw new Error('Commission not found');
  }
  
  return result.rows[0] as LeaderCommission;
};

/**
 * Get total earnings for a leader
 */
export const getTotalEarnings = async (leaderId: string): Promise<number> => {
  const result = await query(
    `SELECT COALESCE(SUM(commission_amount), 0) as total
     FROM leader_commissions
     WHERE leader_id = $1 AND status = 'paid'`,
    [leaderId]
  );
  
  return parseFloat(result.rows[0].total) || 0;
};

/**
 * Get pending earnings for a leader
 */
export const getPendingEarnings = async (leaderId: string): Promise<number> => {
  const result = await query(
    `SELECT COALESCE(SUM(commission_amount), 0) as total
     FROM leader_commissions
     WHERE leader_id = $1 AND status = 'pending'`,
    [leaderId]
  );
  
  return parseFloat(result.rows[0].total) || 0;
};

/**
 * Cancel commission (when registration is cancelled)
 */
export const cancelCommission = async (commissionId: string): Promise<LeaderCommission> => {
  const commission = await getCommissionById(commissionId);
  
  if (!commission) {
    throw new Error('Commission not found');
  }
  
  if (commission.status === 'paid') {
    throw new Error('Cannot cancel a paid commission');
  }
  
  // Update total earnings (subtract the amount)
  await addToTotalEarnings(commission.leader_id, -commission.commission_amount);
  
  return updateCommissionStatus(commissionId, 'cancelled');
};

/**
 * Admin-only: remove (cancel) a commission regardless of status (pending or paid).
 * Subtracts the amount from leader total earnings and optionally clears coupon_code on the registration.
 */
export const adminCancelCommission = async (commissionId: string): Promise<LeaderCommission> => {
  const commission = await getCommissionById(commissionId);
  
  if (!commission) {
    throw new Error('Commission not found');
  }
  
  // Subtract from leader total earnings (for both pending and paid)
  await addToTotalEarnings(commission.leader_id, -commission.commission_amount);
  
  const updated = await updateCommissionStatus(commissionId, 'cancelled');
  
  // Opcional: desatrelar cupom da inscrição para refletir que não está mais atrelada
  if (commission.registration_id) {
    await query(
      'UPDATE registrations SET coupon_code = NULL WHERE id = $1',
      [commission.registration_id]
    );
  }
  
  return updated;
};