import { query } from '../config/database.js';
import { AppRole } from '../types/index.js';

// Get user roles
export const getUserRoles = async (userId: string) => {
  const result = await query(
    'SELECT role FROM user_roles WHERE user_id = $1',
    [userId]
  );

  return result.rows.map((row) => row.role as AppRole);
};

// Check if user has role
export const hasRole = async (userId: string, role: AppRole): Promise<boolean> => {
  const result = await query(
    'SELECT 1 FROM user_roles WHERE user_id = $1 AND role = $2',
    [userId, role]
  );

  return result.rows.length > 0;
};

// Add role to user
export const addRole = async (userId: string, role: AppRole) => {
  const result = await query(
    `INSERT INTO user_roles (user_id, role)
     VALUES ($1, $2)
     ON CONFLICT (user_id, role) DO NOTHING
     RETURNING *`,
    [userId, role]
  );

  return result.rows[0];
};

// Remove role from user
export const removeRole = async (userId: string, role: AppRole) => {
  const result = await query(
    'DELETE FROM user_roles WHERE user_id = $1 AND role = $2 RETURNING *',
    [userId, role]
  );

  return result.rows.length > 0;
};





