import { query } from '../config/database.js';
import { GroupLeader } from '../types/index.js';

export interface CreateGroupLeaderData {
  user_id: string;
  // commission_percentage removed - now using event-specific commissions only
}

export interface UpdateGroupLeaderData {
  is_active?: boolean;
  // commission_percentage removed - now using event-specific commissions only
  referral_code?: string;
}

/**
 * Generate unique referral code
 * Format: 3 letras + 3 números (ex: ABC123)
 */
const generateReferralCode = async (): Promise<string> => {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Removed I, O for clarity
  const numbers = '23456789'; // Removed 0, 1 for clarity
  let code: string;
  let exists = true;
  
  // Try to generate a unique code (max 10 attempts)
  let attempts = 0;
  while (exists && attempts < 10) {
    // Generate 3 random letters
    const letterPart = Array.from({ length: 3 }, () => 
      letters.charAt(Math.floor(Math.random() * letters.length))
    ).join('');
    
    // Generate 3 random numbers
    const numberPart = Array.from({ length: 3 }, () => 
      numbers.charAt(Math.floor(Math.random() * numbers.length))
    ).join('');
    
    code = `${letterPart}${numberPart}`;
    
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
    VALUES ($1, $2, $3, NULL)
    RETURNING *`,
    [
      data.user_id,
      referralCode,
      true,
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
 * Validate referral code format
 * Format: 3 letras maiúsculas + 3 números (ex: ABC123)
 */
export const validateReferralCodeFormat = (code: string): boolean => {
  const regex = /^[A-Z]{3}[0-9]{3}$/;
  return regex.test(code);
};

/**
 * Check if referral code is unique (excluding current leader)
 */
export const isReferralCodeUnique = async (
  code: string,
  excludeLeaderId?: string
): Promise<boolean> => {
  let queryText = 'SELECT id FROM group_leaders WHERE referral_code = $1';
  const params: any[] = [code.toUpperCase()];
  
  if (excludeLeaderId) {
    queryText += ' AND id != $2';
    params.push(excludeLeaderId);
  }
  
  const result = await query(queryText, params);
  return result.rows.length === 0;
};

/**
 * Update group leader
 */
export const updateGroupLeader = async (
  leaderId: string,
  data: UpdateGroupLeaderData
): Promise<GroupLeader> => {
  // If updating referral_code, validate format and uniqueness
  if (data.referral_code !== undefined) {
    const code = data.referral_code.toUpperCase().trim();
    
    // Validate format
    if (!validateReferralCodeFormat(code)) {
      throw new Error('Código de referência deve ter formato: 3 letras maiúsculas + 3 números (ex: ABC123)');
    }
    
    // Check uniqueness (excluding current leader)
    const isUnique = await isReferralCodeUnique(code, leaderId);
    if (!isUnique) {
      throw new Error('Código de referência já está em uso por outro líder');
    }
    
    data.referral_code = code;
  }
  
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
 * Delete group leader permanently
 * Note: This will cascade delete all related records (referrals, commissions, etc.)
 */
export const deleteGroupLeader = async (leaderId: string): Promise<void> => {
  // Check if leader exists
  const leader = await getGroupLeaderById(leaderId);
  
  if (!leader) {
    throw new Error('Group leader not found');
  }
  
  // Delete the leader (cascade will handle related records)
  await query(
    'DELETE FROM group_leaders WHERE id = $1',
    [leaderId]
  );
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
 * Get all group leaders with user information (for organizer)
 * Returns all leaders created by admin with user details
 */
export const getAllGroupLeadersWithUserInfo = async (): Promise<any[]> => {
  const result = await query(
    `SELECT 
      gl.*,
      p.full_name as user_name,
      u.email as user_email,
      p.cpf as user_cpf,
      p.phone as user_phone
    FROM group_leaders gl
    LEFT JOIN profiles p ON gl.user_id = p.id
    LEFT JOIN users u ON gl.user_id = u.id
    ORDER BY gl.created_at DESC`
  );
  
  return result.rows.map(row => ({
    id: row.id,
    user_id: row.user_id,
    referral_code: row.referral_code,
    is_active: row.is_active,
    commission_percentage: row.commission_percentage,
    total_earnings: parseFloat(row.total_earnings) || 0,
    total_referrals: parseInt(row.total_referrals) || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
    user_name: row.user_name || null,
    user_email: row.user_email || null,
    user_cpf: row.user_cpf || null,
    user_phone: row.user_phone || null,
  }));
};

/**
 * Get total earnings for a leader from a specific organizer's events
 */
export const getLeaderEarningsByOrganizer = async (leaderId: string, organizerId: string): Promise<number> => {
  const result = await query(
    `SELECT COALESCE(SUM(lc.commission_amount), 0) as total
     FROM leader_commissions lc
     JOIN events e ON lc.event_id = e.id
     WHERE lc.leader_id = $1 
       AND e.organizer_id = $2
       AND lc.status = 'paid'`,
    [leaderId, organizerId]
  );
  
  return parseFloat(result.rows[0].total) || 0;
};

/**
 * Get leaders added by organizer
 * Returns only leaders that the organizer has added to their list
 * Includes earnings calculated only from this organizer's events
 */
export const getOrganizerLeaders = async (organizerId: string): Promise<any[]> => {
  const result = await query(
    `SELECT 
      gl.*,
      p.full_name as user_name,
      u.email as user_email,
      p.cpf as user_cpf,
      p.phone as user_phone,
      ogl.created_at as added_at
    FROM organizer_group_leaders ogl
    JOIN group_leaders gl ON ogl.leader_id = gl.id
    LEFT JOIN profiles p ON gl.user_id = p.id
    LEFT JOIN users u ON gl.user_id = u.id
    WHERE ogl.organizer_id = $1
    ORDER BY ogl.created_at DESC`,
    [organizerId]
  );
  
  // Calculate earnings for all leaders from this organizer's events in a single query
  const leaderIds = result.rows.map(row => row.id);
  let earningsMap = new Map<string, number>();
  
  if (leaderIds.length > 0) {
    const earningsResult = await query(
      `SELECT 
        lc.leader_id,
        COALESCE(SUM(lc.commission_amount), 0) as total_earnings
      FROM leader_commissions lc
      JOIN events e ON lc.event_id = e.id
      WHERE lc.leader_id = ANY($1::uuid[])
        AND e.organizer_id = $2
        AND lc.status = 'paid'
      GROUP BY lc.leader_id`,
      [leaderIds, organizerId]
    );
    
    earningsResult.rows.forEach((row: any) => {
      earningsMap.set(row.leader_id, parseFloat(row.total_earnings) || 0);
    });
  }
  
  // Map results with earnings
  return result.rows.map(row => {
    const organizerEarnings = earningsMap.get(row.id) || 0;
    
    return {
      id: row.id,
      user_id: row.user_id,
      referral_code: row.referral_code,
      is_active: row.is_active,
      commission_percentage: row.commission_percentage,
      total_earnings: organizerEarnings, // Earnings only from this organizer
      total_earnings_all: parseFloat(row.total_earnings) || 0, // Total from all organizers (for reference)
      total_referrals: parseInt(row.total_referrals) || 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
      user_name: row.user_name || null,
      user_email: row.user_email || null,
      user_cpf: row.user_cpf || null,
      user_phone: row.user_phone || null,
      added_at: row.added_at,
    };
  });
};

/**
 * Get available leaders (not yet added by organizer)
 * Returns all leaders that the organizer hasn't added yet
 */
export const getAvailableLeadersForOrganizer = async (organizerId: string): Promise<any[]> => {
  const result = await query(
    `SELECT 
      gl.*,
      p.full_name as user_name,
      u.email as user_email,
      p.cpf as user_cpf,
      p.phone as user_phone
    FROM group_leaders gl
    LEFT JOIN profiles p ON gl.user_id = p.id
    LEFT JOIN users u ON gl.user_id = u.id
    WHERE gl.id NOT IN (
      SELECT leader_id 
      FROM organizer_group_leaders 
      WHERE organizer_id = $1
    )
    ORDER BY gl.created_at DESC`,
    [organizerId]
  );
  
  return result.rows.map(row => ({
    id: row.id,
    user_id: row.user_id,
    referral_code: row.referral_code,
    is_active: row.is_active,
    commission_percentage: row.commission_percentage,
    total_earnings: parseFloat(row.total_earnings) || 0,
    total_referrals: parseInt(row.total_referrals) || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
    user_name: row.user_name || null,
    user_email: row.user_email || null,
    user_cpf: row.user_cpf || null,
    user_phone: row.user_phone || null,
  }));
};

/**
 * Add leader to organizer's list
 */
export const addLeaderToOrganizer = async (organizerId: string, leaderId: string): Promise<void> => {
  // Check if already added
  const existing = await query(
    'SELECT id FROM organizer_group_leaders WHERE organizer_id = $1 AND leader_id = $2',
    [organizerId, leaderId]
  );
  
  if (existing.rows.length > 0) {
    throw new Error('Leader already added to organizer');
  }
  
  // Check if leader exists
  const leader = await getGroupLeaderById(leaderId);
  if (!leader) {
    throw new Error('Leader not found');
  }
  
  // Add relationship
  await query(
    'INSERT INTO organizer_group_leaders (organizer_id, leader_id) VALUES ($1, $2)',
    [organizerId, leaderId]
  );
};

/**
 * Remove leader from organizer's list
 */
export const removeLeaderFromOrganizer = async (organizerId: string, leaderId: string): Promise<void> => {
  const result = await query(
    'DELETE FROM organizer_group_leaders WHERE organizer_id = $1 AND leader_id = $2',
    [organizerId, leaderId]
  );
  
  if (result.rowCount === 0) {
    throw new Error('Leader not found in organizer list');
  }
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

