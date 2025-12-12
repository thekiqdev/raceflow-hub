import { query } from '../config/database.js';
import { LeaderCommission } from '../types/index.js';
import { getGroupLeaderById } from './groupLeadersService.js';
import { getSystemSettings } from './systemSettingsService.js';
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
 */
export const calculateCommissionAmount = async (
  leaderId: string,
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
  
  // Get commission percentage (leader-specific or global)
  let commissionPercentage = leader.commission_percentage;
  
  if (commissionPercentage === null || commissionPercentage === undefined) {
    // Use global percentage from system settings
    const settings = await getSystemSettings();
    commissionPercentage = settings.leader_commission_percentage || 0;
  }
  
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
  // Calculate commission
  const { amount, percentage } = await calculateCommissionAmount(
    data.leader_id,
    data.registration_amount
  );
  
  // Only create commission if amount > 0
  if (amount <= 0) {
    throw new Error('Commission amount must be greater than 0');
  }
  
  // Check if commission already exists for this registration
  const existingCommission = await query(
    'SELECT id FROM leader_commissions WHERE registration_id = $1 AND leader_id = $2',
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
  
  return result.rows[0] as LeaderCommission;
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
  filters?: CommissionFilters
): Promise<LeaderCommission[]> => {
  let sql = `
    SELECT lc.*, 
           e.title as event_title,
           u.email as referred_user_email,
           p.full_name as referred_user_name
    FROM leader_commissions lc
    JOIN events e ON lc.event_id = e.id
    JOIN users u ON lc.referred_user_id = u.id
    LEFT JOIN profiles p ON u.id = p.id
    WHERE lc.leader_id = $1
  `;
  
  const values: any[] = [leaderId];
  let paramIndex = 2;
  
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

