import { query } from '../config/database.js';
import { Profile } from '../types/index.js';

export interface UpdateProfileData {
  full_name?: string;
  phone?: string;
  gender?: string;
  birth_date?: string;
  logo_url?: string | null;
  organization_name?: string;
  contact_email?: string;
  contact_phone?: string;
  bio?: string;
  website_url?: string;
}

// Get profile by user ID
export const getProfileByUserId = async (userId: string) => {
  const result = await query(
    'SELECT * FROM profiles WHERE id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as Profile;
};

// Update profile
export const updateProfile = async (userId: string, data: UpdateProfileData) => {
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

  values.push(userId);
  
  // Always update updated_at
  fields.push(`updated_at = NOW()`);

  const result = await query(
    `UPDATE profiles 
     SET ${fields.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as Profile;
};

// Get public profile by CPF (for registration by others)
export const getPublicProfileByCpf = async (cpf: string) => {
  // Remove formatting from CPF
  const cleanCpf = cpf.replace(/[^0-9]/g, '');
  
  const result = await query(
    `SELECT 
      p.id,
      p.full_name,
      p.cpf,
      p.phone,
      p.gender,
      p.birth_date,
      u.email
    FROM profiles p
    JOIN users u ON p.id = u.id
    WHERE p.cpf = $1 AND p.is_public = TRUE`,
    [cleanCpf]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return {
    id: result.rows[0].id,
    full_name: result.rows[0].full_name,
    cpf: result.rows[0].cpf,
    phone: result.rows[0].phone,
    email: result.rows[0].email,
    gender: result.rows[0].gender,
    birth_date: result.rows[0].birth_date,
  };
};
