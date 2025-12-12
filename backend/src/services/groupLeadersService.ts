import { query } from '../config/database.js';
import { GroupLeader } from '../types/index.js';

export interface CreateGroupLeaderData {
  user_id: string;
  commission_percentage?: number | null;
}

export interface UpdateGroupLeaderData {
  is_active?: boolean;
  commission_percentage?: number | null;
}

/**
 * Generate unique referral code
 * Format: LEADER-XXXXX (5 alphanumeric characters)
 */
const generateReferralCode = async (): Promise<string> => {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed I, O, 0, 1 for clarity
  let code: string;
  let exists = true;
  
  // Try to generate a unique code (max 10 attempts)
  let attempts = 0;
  while (exists && attempts < 10) {
    const randomPart = Array.from({ length: 5 }, () => 
      characters.charAt(Math.floor(Math.random() * characters.length))
    ).join('');
    
    code = `LEADER-${randomPart}`;
    
    const checkResult = await query(
      'SELECT id FROM group_leaders WHERE referral_code = $1',
      [code]
    );
    
    exists = checkResult.rows.length > 0;
    attempts++;
  }
  
  if (exists) {
    throw new Error('Failed to generate unique referral code after multiple attempts');
  }
  
  return code!;
};

/**
 * Create a new group leader
 */
export const createGroupLeader = async (data: CreateGroupLeaderData): Promise<GroupLeader> => {
  // Check if user already has a leader account
  const existingLeader = await query(
    'SELECT id FROM group_leaders WHERE user_id = $1',
    [data.user_id]
  );
  
  if (existingLeader.rows.length > 0) {
    throw new Error('User already has a group leader account');
  }
  
  // Generate unique referral code
  const referralCode = await generateReferralCode();
  
  // Create leader
  const result = await query(
    `INSERT INTO group_leaders (
      user_id, referral_code, is_active, commission_percentage
    )
    VALUES ($1, $2, $3, $4)
    RETURNING *`,
    [
      data.user_id,
      referralCode,
      true,
      data.commission_percentage || null,
    ]
  );
  
  return result.rows[0] as GroupLeader;
};

/**
 * Get group leader by user ID
 */
export const getGroupLeaderByUserId = async (userId: string): Promise<GroupLeader | null> => {
  const result = await query(
    'SELECT * FROM group_leaders WHERE user_id = $1',
    [userId]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return result.rows[0] as GroupLeader;
};

/**
 * Get group leader by referral code
 */
export const getGroupLeaderByCode = async (referralCode: string): Promise<GroupLeader | null> => {
  const result = await query(
    'SELECT * FROM group_leaders WHERE referral_code = $1 AND is_active = true',
    [referralCode.toUpperCase()]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return result.rows[0] as GroupLeader;
};

/**
 * Get group leader by ID
 */
export const getGroupLeaderById = async (leaderId: string): Promise<GroupLeader | null> => {
  const result = await query(
    'SELECT * FROM group_leaders WHERE id = $1',
    [leaderId]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return result.rows[0] as GroupLeader;
};

/**
 * Update group leader
 */
export const updateGroupLeader = async (
  leaderId: string,
  data: UpdateGroupLeaderData
): Promise<GroupLeader> => {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;
  
  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined) {
      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  });
  
  if (fields.length === 0) {
    throw new Error('No fields to update');
  }
  
  values.push(leaderId);
  
  const result = await query(
    `UPDATE group_leaders 
     SET ${fields.join(', ')}, updated_at = NOW()
     WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );
  
  if (result.rows.length === 0) {
    throw new Error('Group leader not found');
  }
  
  return result.rows[0] as GroupLeader;
};

/**
 * Deactivate group leader
 */
export const deactivateGroupLeader = async (leaderId: string): Promise<GroupLeader> => {
  return updateGroupLeader(leaderId, { is_active: false });
};

/**
 * Activate group leader
 */
export const activateGroupLeader = async (leaderId: string): Promise<GroupLeader> => {
  return updateGroupLeader(leaderId, { is_active: true });
};

/**
 * Get all group leaders (for admin)
 */
export const getAllGroupLeaders = async (): Promise<GroupLeader[]> => {
  const result = await query(
    'SELECT * FROM group_leaders ORDER BY created_at DESC'
  );
  
  return result.rows as GroupLeader[];
};

/**
 * Increment total referrals count
 */
export const incrementTotalReferrals = async (leaderId: string): Promise<void> => {
  await query(
    'UPDATE group_leaders SET total_referrals = total_referrals + 1 WHERE id = $1',
    [leaderId]
  );
};

/**
 * Add to total earnings
 */
export const addToTotalEarnings = async (leaderId: string, amount: number): Promise<void> => {
  await query(
    'UPDATE group_leaders SET total_earnings = total_earnings + $1 WHERE id = $2',
    [amount, leaderId]
  );
};

