import { query, getClient } from '../config/database.js';
import { AppRole } from '../types/index.js';
import bcrypt from 'bcrypt';

export interface UserWithStats {
  id: string;
  name: string;
  email: string;
  cpf?: string;
  phone: string;
  status: string;
  events?: number;
  registrations?: number;
  revenue?: number;
  role?: string;
  created_at: string;
}

export interface OrganizerStats {
  events: number;
  registrations: number;
  revenue: number;
}

/**
 * Get all organizers with statistics
 */
export const getOrganizers = async (searchTerm?: string): Promise<UserWithStats[]> => {
  let queryText = `
    SELECT 
      p.id,
      p.full_name as name,
      u.email,
      p.cpf,
      p.phone,
      COALESCE(p.status, 'active') as status,
      p.created_at,
      COUNT(DISTINCT e.id) as events,
      COUNT(DISTINCT r.id) as registrations,
      COALESCE(SUM(CASE WHEN r.payment_status = 'paid' THEN r.total_amount ELSE 0 END), 0) as revenue
    FROM profiles p
    JOIN users u ON p.id = u.id
    JOIN user_roles ur ON p.id = ur.user_id
    LEFT JOIN events e ON p.id = e.organizer_id
    LEFT JOIN registrations r ON e.id = r.event_id
    WHERE ur.role = 'organizer'
  `;

  const params: any[] = [];

  if (searchTerm) {
    queryText += ` AND (
      p.full_name ILIKE $${params.length + 1} OR
      u.email ILIKE $${params.length + 1} OR
      p.cpf ILIKE $${params.length + 1}
    )`;
    params.push(`%${searchTerm}%`);
  }

  queryText += `
    GROUP BY p.id, u.email, p.full_name, p.cpf, p.phone, p.status, p.created_at
    ORDER BY p.full_name
  `;

  const result = await query(queryText, params);
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    cpf: row.cpf,
    phone: row.phone,
    status: row.status || 'active',
    events: parseInt(row.events) || 0,
    registrations: parseInt(row.registrations) || 0,
    revenue: parseFloat(row.revenue) || 0,
    created_at: row.created_at,
  }));
};

/**
 * Get all athletes with statistics
 */
export const getAthletes = async (searchTerm?: string): Promise<UserWithStats[]> => {
  let queryText = `
    SELECT 
      p.id,
      p.full_name as name,
      u.email,
      p.cpf,
      p.phone,
      COALESCE(p.status, 'active') as status,
      p.created_at,
      COUNT(DISTINCT r.id) as registrations
    FROM profiles p
    JOIN users u ON p.id = u.id
    JOIN user_roles ur ON p.id = ur.user_id
    LEFT JOIN registrations r ON p.id = r.runner_id
    WHERE ur.role = 'runner'
  `;

  const params: any[] = [];

  if (searchTerm) {
    queryText += ` AND (
      p.full_name ILIKE $${params.length + 1} OR
      u.email ILIKE $${params.length + 1} OR
      p.cpf ILIKE $${params.length + 1}
    )`;
    params.push(`%${searchTerm}%`);
  }

  queryText += `
    GROUP BY p.id, u.email, p.full_name, p.cpf, p.phone, p.status, p.created_at
    ORDER BY p.full_name
  `;

  const result = await query(queryText, params);
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    cpf: row.cpf,
    phone: row.phone,
    status: row.status || 'active',
    registrations: parseInt(row.registrations) || 0,
    created_at: row.created_at,
  }));
};

/**
 * Get all admins
 */
export const getAdmins = async (): Promise<UserWithStats[]> => {
  const queryText = `
    SELECT 
      p.id,
      p.full_name as name,
      u.email,
      p.phone,
      COALESCE(p.status, 'active') as status,
      p.created_at,
      ur.role
    FROM profiles p
    JOIN users u ON p.id = u.id
    JOIN user_roles ur ON p.id = ur.user_id
    WHERE ur.role = 'admin'
    ORDER BY p.full_name
  `;

  const result = await query(queryText);
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    status: row.status || 'active',
    role: row.role,
    created_at: row.created_at,
  }));
};

/**
 * Get user details by ID
 */
export const getUserById = async (userId: string): Promise<UserWithStats | null> => {
  const queryText = `
    SELECT 
      p.id,
      p.full_name as name,
      u.email,
      p.cpf,
      p.phone,
      p.gender,
      p.birth_date,
      COALESCE(p.status, 'active') as status,
      p.created_at,
      u.created_at as user_created_at,
      array_agg(ur.role) as roles
    FROM profiles p
    JOIN users u ON p.id = u.id
    LEFT JOIN user_roles ur ON p.id = ur.user_id
    WHERE p.id = $1
    GROUP BY p.id, u.email, p.full_name, p.cpf, p.phone, p.gender, p.birth_date, p.status, p.created_at, u.created_at
  `;

  const result = await query(queryText, [userId]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    cpf: row.cpf,
    phone: row.phone,
    status: row.status || 'active',
    role: row.roles?.[0],
    created_at: row.created_at,
  };
};

/**
 * Get user profile by ID (for admin)
 */
export const getUserProfileById = async (userId: string) => {
  // First, get the profile data
  const profileQuery = `
    SELECT 
      p.id,
      p.full_name,
      u.email,
      p.cpf,
      p.phone,
      p.gender,
      p.birth_date,
      COALESCE(p.status, 'active') as status
    FROM profiles p
    JOIN users u ON p.id = u.id
    WHERE p.id = $1
  `;

  const profileResult = await query(profileQuery, [userId]);

  if (profileResult.rows.length === 0) {
    return null;
  }

  const profileRow = profileResult.rows[0];

  // Then, get the roles separately
  const rolesQuery = `
    SELECT role
    FROM user_roles
    WHERE user_id = $1
    ORDER BY role
    LIMIT 1
  `;

  const rolesResult = await query(rolesQuery, [userId]);
  const role = rolesResult.rows.length > 0 ? rolesResult.rows[0].role : null;
  
  return {
    id: profileRow.id,
    full_name: profileRow.full_name,
    email: profileRow.email,
    cpf: profileRow.cpf,
    phone: profileRow.phone,
    gender: profileRow.gender,
    birth_date: profileRow.birth_date,
    status: profileRow.status || 'active',
    role: role,
  };
};

/**
 * Update user status
 */
export const updateUserStatus = async (userId: string, status: 'active' | 'pending' | 'blocked'): Promise<void> => {
  await query(
    'UPDATE profiles SET status = $1, updated_at = NOW() WHERE id = $2',
    [status, userId]
  );
};

/**
 * Update user role
 */
export const updateUserRole = async (userId: string, role: 'admin' | 'organizer' | 'runner'): Promise<void> => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');

    // Remove all existing roles
    await client.query(
      'DELETE FROM user_roles WHERE user_id = $1',
      [userId]
    );

    // Add new role
    await client.query(
      'INSERT INTO user_roles (user_id, role) VALUES ($1, $2)',
      [userId, role]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Delete user (soft delete by setting status to blocked and removing roles)
 */
export const deleteUser = async (userId: string): Promise<void> => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');

    // Set status to blocked
    await client.query(
      'UPDATE profiles SET status = $1, updated_at = NOW() WHERE id = $2',
      ['blocked', userId]
    );

    // Remove all roles
    await client.query(
      'DELETE FROM user_roles WHERE user_id = $1',
      [userId]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Approve organizer (change status from pending to active)
 */
export const approveOrganizer = async (userId: string): Promise<void> => {
  await updateUserStatus(userId, 'active');
};

/**
 * Block user
 */
export const blockUser = async (userId: string): Promise<void> => {
  await updateUserStatus(userId, 'blocked');
};

/**
 * Unblock user
 */
export const unblockUser = async (userId: string): Promise<void> => {
  await updateUserStatus(userId, 'active');
};

/**
 * Reset user password
 */
export const resetUserPassword = async (userId: string, newPassword: string): Promise<void> => {
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

  await query(
    'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
    [hashedPassword, userId]
  );
};

/**
 * Create new admin user
 */
export const createAdmin = async (data: {
  email: string;
  password: string;
  full_name: string;
  phone: string;
  role?: AppRole;
}): Promise<string> => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');

    // Create user
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(data.password, saltRounds);

    const userResult = await client.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [data.email, hashedPassword]
    );

    const userId = userResult.rows[0].id;

    // Create profile
    await client.query(
      `INSERT INTO profiles (id, full_name, cpf, phone, birth_date, lgpd_consent, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, data.full_name, '00000000000', data.phone, '1990-01-01', true, 'active']
    );

    // Add admin role
    await client.query(
      'INSERT INTO user_roles (user_id, role) VALUES ($1, $2)',
      [userId, data.role || 'admin']
    );

    await client.query('COMMIT');
    return userId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Convert athlete to organizer
 * Removes 'runner' role and adds 'organizer' role
 */
export const convertAthleteToOrganizer = async (userId: string): Promise<void> => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');

    // Check if user has runner role
    const runnerCheck = await client.query(
      'SELECT 1 FROM user_roles WHERE user_id = $1 AND role = $2',
      [userId, 'runner']
    );

    if (runnerCheck.rows.length === 0) {
      throw new Error('User is not an athlete (does not have runner role)');
    }

    // Check if user already has organizer role
    const organizerCheck = await client.query(
      'SELECT 1 FROM user_roles WHERE user_id = $1 AND role = $2',
      [userId, 'organizer']
    );

    if (organizerCheck.rows.length > 0) {
      throw new Error('User already has organizer role');
    }

    // Remove runner role
    await client.query(
      'DELETE FROM user_roles WHERE user_id = $1 AND role = $2',
      [userId, 'runner']
    );

    // Add organizer role
    await client.query(
      'INSERT INTO user_roles (user_id, role) VALUES ($1, $2)',
      [userId, 'organizer']
    );

    // Update profile status to active if it was blocked
    await client.query(
      'UPDATE profiles SET status = $1, updated_at = NOW() WHERE id = $2 AND status = $3',
      ['active', userId, 'blocked']
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

