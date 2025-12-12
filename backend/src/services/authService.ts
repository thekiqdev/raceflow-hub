import bcrypt from 'bcrypt';
import jwt, { SignOptions } from 'jsonwebtoken';
import { query, getClient } from '../config/database.js';
import { AppRole } from '../types/index.js';

export interface RegisterData {
  email: string;
  password: string;
  full_name: string;
  cpf: string;
  phone: string;
  gender?: 'M' | 'F';
  birth_date: string;
  preferred_name?: string;
  postal_code?: string;
  street?: string;
  address_number?: string;
  address_complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  lgpd_consent: boolean;
  referral_code?: string; // Código de referência opcional
}

export interface LoginData {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    profile: {
      id: string;
      full_name: string;
      cpf: string;
      phone: string;
    };
    roles: AppRole[];
  };
  token: string;
}

// Hash password
export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
};

// Compare password
export const comparePassword = async (
  password: string,
  hash: string
): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

// Generate JWT token
export const generateToken = (userId: string, email: string): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not defined');
  }

  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

  return jwt.sign(
    { userId, email },
    secret,
    { expiresIn } as SignOptions
  );
};

// Register new user
export const register = async (data: RegisterData): Promise<AuthResponse> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Check if email already exists
    const emailCheck = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [data.email]
    );

    if (emailCheck.rows.length > 0) {
      throw new Error('Email already registered');
    }

    // Check if CPF already exists
    const cpfCheck = await client.query(
      'SELECT id FROM profiles WHERE cpf = $1',
      [data.cpf]
    );

    if (cpfCheck.rows.length > 0) {
      throw new Error('CPF already registered');
    }

    // Hash password
    const passwordHash = await hashPassword(data.password);

    // Create user
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, email_verified)
       VALUES ($1, $2, false)
       RETURNING id, email`,
      [data.email, passwordHash]
    );

    const user = userResult.rows[0];

    // Create profile with new address fields
    const profileResult = await client.query(
      `INSERT INTO profiles (
        id, full_name, cpf, phone, gender, birth_date, lgpd_consent,
        preferred_name, postal_code, street, address_number, address_complement,
        neighborhood, city, state
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id, full_name, cpf, phone`,
      [
        user.id,
        data.full_name,
        data.cpf,
        data.phone,
        data.gender || null,
        data.birth_date,
        data.lgpd_consent,
        data.preferred_name || null,
        data.postal_code || null,
        data.street || null,
        data.address_number || null,
        data.address_complement || null,
        data.neighborhood || null,
        data.city || null,
        data.state || null,
      ]
    );

    const profile = profileResult.rows[0];

    // Ensure 'runner' role is created (in case trigger didn't fire)
    await client.query(
      `INSERT INTO user_roles (user_id, role)
       VALUES ($1, 'runner')
       ON CONFLICT (user_id, role) DO NOTHING`,
      [user.id]
    );

    // Get user roles
    const rolesResult = await client.query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [user.id]
    );

    const roles = rolesResult.rows.map((row) => row.role as AppRole);
    
    // Ensure at least 'runner' role exists
    if (roles.length === 0) {
      console.warn(`⚠️ No roles found for user ${user.id}, forcing 'runner' role`);
      await client.query(
        `INSERT INTO user_roles (user_id, role)
         VALUES ($1, 'runner')
         ON CONFLICT (user_id, role) DO NOTHING`,
        [user.id]
      );
      roles.push('runner');
    }
    
    console.log(`✅ User registered: ${user.email}, roles: ${roles.join(', ')}`);

    // Create user referral if referral_code is provided
    if (data.referral_code) {
      try {
        const { createUserReferral } = await import('./referralsService.js');
        await createUserReferral({
          user_id: user.id,
          referral_code: data.referral_code,
          referral_type: 'code', // Default to 'code', can be 'link' if needed
        });
        console.log(`✅ Referência criada para usuário ${user.id} com código ${data.referral_code}`);
      } catch (error: any) {
        // Log error but don't fail registration if referral creation fails
        console.error('⚠️ Erro ao criar referência (não bloqueia cadastro):', error.message);
        // Don't rollback - referral is optional and shouldn't block registration
      }
    }

    // Generate token
    const token = generateToken(user.id, user.email);

    await client.query('COMMIT');

    return {
      user: {
        id: user.id,
        email: user.email,
        profile: {
          id: profile.id,
          full_name: profile.full_name,
          cpf: profile.cpf,
          phone: profile.phone,
        },
        roles,
      },
      token,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Login user
export const login = async (data: LoginData): Promise<AuthResponse> => {
  // Get user by email
  const userResult = await query(
    'SELECT id, email, password_hash FROM users WHERE email = $1',
    [data.email]
  );

  if (userResult.rows.length === 0) {
    throw new Error('Invalid email or password');
  }

  const user = userResult.rows[0];

  // Verify password
  const isValidPassword = await comparePassword(data.password, user.password_hash);

  if (!isValidPassword) {
    throw new Error('Invalid email or password');
  }

  // Get profile
  const profileResult = await query(
    'SELECT id, full_name, cpf, phone FROM profiles WHERE id = $1',
    [user.id]
  );

  if (profileResult.rows.length === 0) {
    throw new Error('Profile not found');
  }

  const profile = profileResult.rows[0];

  // Get user roles
  const rolesResult = await query(
    'SELECT role FROM user_roles WHERE user_id = $1',
    [user.id]
  );

  const roles = rolesResult.rows.map((row) => row.role as AppRole);

  // Generate token
  const token = generateToken(user.id, user.email);

  return {
    user: {
      id: user.id,
      email: user.email,
      profile: {
        id: profile.id,
        full_name: profile.full_name,
        cpf: profile.cpf,
        phone: profile.phone,
      },
      roles,
    },
    token,
  };
};

// Get user by ID
export const getUserById = async (userId: string) => {
  const userResult = await query(
    'SELECT id, email, email_verified FROM users WHERE id = $1',
    [userId]
  );

  if (userResult.rows.length === 0) {
    return null;
  }

  const user = userResult.rows[0];

  const profileResult = await query(
    'SELECT id, full_name, cpf, phone, gender, birth_date FROM profiles WHERE id = $1',
    [userId]
  );

  const profile = profileResult.rows[0] || null;

  const rolesResult = await query(
    'SELECT role FROM user_roles WHERE user_id = $1',
    [userId]
  );

  const roles = rolesResult.rows.map((row) => row.role as AppRole);

  return {
    id: user.id,
    email: user.email,
    email_verified: user.email_verified,
    profile,
    roles,
  };
};

