import { query } from '../config/database.js';
import { UserReferral } from '../types/index.js';
import { getGroupLeaderByCode } from './groupLeadersService.js';
import { incrementTotalReferrals } from './groupLeadersService.js';

export interface CreateUserReferralData {
  user_id: string;
  referral_code: string;
  referral_type: 'link' | 'code';
}

/**
 * Create user referral
 * @param data - Referral data
 * @param client - Optional database client for transaction support
 */
export const createUserReferral = async (
  data: CreateUserReferralData,
  client?: any
): Promise<UserReferral> => {
  const queryFn = client ? client.query.bind(client) : query;
  
  // Validate referral code and get leader
  const leader = await getGroupLeaderByCode(data.referral_code);
  
  if (!leader) {
    throw new Error('Invalid or inactive referral code');
  }
  
  // Check if user already has a referral
  const existingReferral = await queryFn(
    'SELECT id FROM user_referrals WHERE user_id = $1',
    [data.user_id]
  );
  
  if (existingReferral.rows.length > 0) {
    throw new Error('User already has a referral');
  }
  
  // Prevent self-referral
  if (leader.user_id === data.user_id) {
    throw new Error('Cannot refer yourself');
  }
  
  // Create referral
  const result = await queryFn(
    `INSERT INTO user_referrals (
      user_id, leader_id, referral_code, referral_type
    )
    VALUES ($1, $2, $3, $4)
    RETURNING *`,
    [
      data.user_id,
      leader.id,
      data.referral_code.toUpperCase(),
      data.referral_type,
    ]
  );
  
  // Increment total referrals count for the leader (only if not in transaction)
  if (!client) {
    await incrementTotalReferrals(leader.id);
  } else {
    // If in transaction, update directly
    await queryFn(
      'UPDATE group_leaders SET total_referrals = total_referrals + 1 WHERE id = $1',
      [leader.id]
    );
  }
  
  return result.rows[0] as UserReferral;
};

/**
 * Get user referral by user ID
 */
export const getUserReferral = async (userId: string): Promise<UserReferral | null> => {
  const result = await query(
    'SELECT * FROM user_referrals WHERE user_id = $1',
    [userId]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return result.rows[0] as UserReferral;
};

/**
 * Get all referrals by leader ID
 */
export const getReferralsByLeader = async (leaderId: string): Promise<UserReferral[]> => {
  const result = await query(
    `SELECT ur.*, u.email, p.full_name, p.cpf
     FROM user_referrals ur
     JOIN users u ON ur.user_id = u.id
     LEFT JOIN profiles p ON u.id = p.id
     WHERE ur.leader_id = $1
     ORDER BY ur.created_at DESC`,
    [leaderId]
  );
  
  return result.rows as UserReferral[];
};

/**
 * Get referral statistics for a leader
 */
export interface ReferralStats {
  total_referrals: number;
  total_registrations: number;
  total_commissions: number;
  pending_commissions: number;
  paid_commissions: number;
}

export const getReferralStats = async (leaderId: string): Promise<ReferralStats> => {
  const result = await query(
    `SELECT 
      COUNT(DISTINCT ur.id) as total_referrals,
      COUNT(DISTINCT r.id) as total_registrations,
      COALESCE(SUM(CASE WHEN lc.status = 'paid' THEN lc.commission_amount ELSE 0 END), 0) as paid_commissions,
      COALESCE(SUM(CASE WHEN lc.status = 'pending' THEN lc.commission_amount ELSE 0 END), 0) as pending_commissions,
      COALESCE(SUM(lc.commission_amount), 0) as total_commissions
     FROM user_referrals ur
     LEFT JOIN registrations r ON ur.user_id = r.runner_id
     LEFT JOIN leader_commissions lc ON r.id = lc.registration_id AND lc.leader_id = $1
     WHERE ur.leader_id = $1`,
    [leaderId]
  );
  
  const row = result.rows[0];
  
  return {
    total_referrals: parseInt(row.total_referrals) || 0,
    total_registrations: parseInt(row.total_registrations) || 0,
    total_commissions: parseFloat(row.total_commissions) || 0,
    pending_commissions: parseFloat(row.pending_commissions) || 0,
    paid_commissions: parseFloat(row.paid_commissions) || 0,
  };
};

