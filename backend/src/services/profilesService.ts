import { query } from '../config/database.js';
import { Profile } from '../types/index.js';
import { comparePassword } from './authService.js';
import { isValidCpfDigits } from '../utils/cpf.js';
import { normalizePersonName, normalizePhoneDigits, normalizePostalCode, normalizePlaceName, normalizeProfileUpdateFields, normalizeEmail } from '../utils/profileNormalization.js';
import {
  assertValidFullName,
  assertValidPhone,
  assertValidContactPhone,
  assertValidPostalCode,
  assertValidCity,
  assertValidNeighborhood,
  assertValidBirthDateRange,
  assertValidGender,
  assertValidContactEmail,
  normalizeGender,
} from '../utils/profileValidation.js';

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
  is_public?: boolean;
  preferred_name?: string;
  profession?: string;
  cbat?: string;
  team?: string;
  postal_code?: string;
  street?: string;
  address_number?: string;
  address_complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  cpf?: string;
}

// Get profile by user ID
export const getProfileByUserId = async (userId: string) => {
  const result = await query(
    `SELECT p.*, u.email
     FROM profiles p
     JOIN users u ON p.id = u.id
     WHERE p.id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as Profile & { email?: string };
};

// Verify user password
export const verifyUserPassword = async (userId: string, password: string): Promise<boolean> => {
  const result = await query(
    'SELECT password_hash FROM users WHERE id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    return false;
  }

  const passwordHash = result.rows[0].password_hash;
  return await comparePassword(password, passwordHash);
};

async function validateProfileFieldsOnUpdate(
  userId: string,
  data: UpdateProfileData,
  normalizedData: ReturnType<typeof normalizeProfileUpdateFields>
) {
  const trackedFields = [
    'phone',
    'postal_code',
    'city',
    'neighborhood',
    'contact_phone',
    'contact_email',
    'birth_date',
    'gender',
  ] as const;

  if (!trackedFields.some((field) => data[field] !== undefined)) {
    return;
  }

  const currentResult = await query(
    `SELECT phone, postal_code, city, neighborhood, contact_phone, contact_email, birth_date, gender
     FROM profiles WHERE id = $1`,
    [userId]
  );
  const current = currentResult.rows[0] ?? {};

  if (data.phone !== undefined) {
    const newValue = normalizedData.phone ?? '';
    const currentValue = normalizePhoneDigits(current.phone);
    if (newValue !== currentValue) {
      assertValidPhone(newValue, { allowEmpty: true, source: 'profiles.updateProfile.phone' });
    }
  }

  if (data.contact_phone !== undefined) {
    const newValue = normalizedData.contact_phone ?? '';
    const currentValue = normalizePhoneDigits(current.contact_phone);
    if (newValue !== currentValue) {
      assertValidContactPhone(newValue, {
        allowEmpty: true,
        source: 'profiles.updateProfile.contact_phone',
      });
    }
  }

  if (data.contact_email !== undefined) {
    const newValue = normalizedData.contact_email ?? '';
    const currentValue = current.contact_email
      ? normalizeEmail(current.contact_email)
      : '';
    if (newValue !== currentValue) {
      assertValidContactEmail(newValue, {
        allowEmpty: true,
        source: 'profiles.updateProfile.contact_email',
      });
    }
  }

  if (data.postal_code !== undefined) {
    const newValue = normalizedData.postal_code ?? '';
    const currentValue = normalizePostalCode(current.postal_code);
    if (newValue !== currentValue) {
      assertValidPostalCode(newValue, {
        allowEmpty: true,
        source: 'profiles.updateProfile.postal_code',
      });
    }
  }

  if (data.city !== undefined) {
    const newValue = normalizedData.city ?? '';
    const currentValue = current.city ? normalizePlaceName(current.city) : '';
    if (newValue !== currentValue) {
      assertValidCity(newValue, { allowEmpty: true, source: 'profiles.updateProfile.city' });
    }
  }

  if (data.neighborhood !== undefined) {
    const newValue = normalizedData.neighborhood ?? '';
    const currentValue = current.neighborhood
      ? normalizePlaceName(current.neighborhood)
      : '';
    if (newValue !== currentValue) {
      assertValidNeighborhood(newValue, {
        allowEmpty: true,
        source: 'profiles.updateProfile.neighborhood',
      });
    }
  }

  if (data.birth_date !== undefined) {
    const newValue = data.birth_date ? String(data.birth_date).split('T')[0] : '';
    const currentValue = current.birth_date
      ? String(current.birth_date).split('T')[0]
      : '';
    if (newValue !== currentValue) {
      assertValidBirthDateRange(newValue, {
        allowEmpty: true,
        source: 'profiles.updateProfile.birth_date',
      });
    }
  }

  if (data.gender !== undefined) {
    const newValue = data.gender ? normalizeGender(data.gender) : '';
    const currentValue = current.gender ? normalizeGender(current.gender) : '';
    if (newValue !== currentValue) {
      assertValidGender(newValue, { allowEmpty: true, source: 'profiles.updateProfile.gender' });
    }
  }
}

// Update profile
export const updateProfile = async (userId: string, data: UpdateProfileData) => {
  const normalizedData = normalizeProfileUpdateFields(data);

  if (data.full_name !== undefined) {
    const currentResult = await query(
      'SELECT full_name FROM profiles WHERE id = $1',
      [userId]
    );
    const currentFullName = currentResult.rows[0]?.full_name as string | undefined;
    const normalizedCurrent = currentFullName
      ? normalizePersonName(currentFullName)
      : '';
    const normalizedNew = normalizedData.full_name ?? '';
    if (normalizedNew !== normalizedCurrent) {
      assertValidFullName(normalizedNew, { source: 'profiles.updateProfile.full_name' });
    }
  }

  if (data.gender !== undefined) {
    normalizedData.gender = normalizeGender(data.gender) || undefined;
  }

  await validateProfileFieldsOnUpdate(userId, data, normalizedData);

  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  Object.entries(normalizedData).forEach(([key, value]) => {
    if (value !== undefined && key !== 'password') {
      // Clean CPF: remove formatting
      if (key === 'cpf' && value) {
        const cleanCpf = String(value).replace(/[^0-9]/g, '');
        if (!isValidCpfDigits(cleanCpf)) {
          throw new Error('CPF inválido');
        }
        fields.push(`${key} = $${paramIndex}`);
        values.push(cleanCpf);
        paramIndex++;
      } else {
      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
      }
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

/** Perfil por CPF para fluxo operacional (organizador/admin). Não exige is_public. */
export const getProfileByCpfForOrganizerLookup = async (cpf: string) => {
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
    WHERE p.cpf = $1`,
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
