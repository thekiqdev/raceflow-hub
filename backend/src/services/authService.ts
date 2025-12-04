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
  gender?: string;
  birth_date: string;
  lgpd_consent: boolean;
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

    // Create profile
    const profileResult = await client.query(
      `INSERT INTO profiles (id, full_name, cpf, phone, gender, birth_date, lgpd_consent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, full_name, cpf, phone`,
      [
        user.id,
        data.full_name,
        data.cpf,
        data.phone,
        data.gender || null,
        data.birth_date,
        data.lgpd_consent,
      ]
    );

    const profile = profileResult.rows[0];

    // Get user roles (should have 'runner' by default from trigger)
    const rolesResult = await client.query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [user.id]
    );

    const roles = rolesResult.rows.map((row) => row.role as AppRole);

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

