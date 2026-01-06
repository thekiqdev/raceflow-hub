import { query } from '../config/database.js';
import crypto from 'crypto';

export interface PasswordResetToken {
  id: string;
  user_id: string;
  token: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

/**
 * Generate a secure random token
 */
export const generateResetToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Create a password reset token for a user
 * Token expires in 30 minutes
 */
export const createPasswordResetToken = async (userId: string): Promise<PasswordResetToken> => {
  const token = generateResetToken();
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 30); // 30 minutes from now

  console.log('🔑 [createPasswordResetToken] Criando token:', {
    userId,
    tokenLength: token.length,
    tokenPreview: token.substring(0, 10) + '...',
    expiresAt: expiresAt.toISOString(),
    now: new Date().toISOString(),
    minutesUntilExpiry: 30,
  });

  const result = await query(
    `INSERT INTO password_reset_tokens (user_id, token, expires_at)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [userId, token, expiresAt]
  );

  const createdToken = result.rows[0] as PasswordResetToken;
  
  console.log('✅ [createPasswordResetToken] Token criado no banco:', {
    id: createdToken.id,
    tokenLength: createdToken.token.length,
    expiresAt: createdToken.expires_at,
    createdAt: createdToken.created_at,
  });

  return createdToken;
};

/**
 * Find a valid password reset token
 */
export const findPasswordResetToken = async (token: string): Promise<PasswordResetToken | null> => {
  // Trim and clean token
  const cleanToken = token.trim();
  
  console.log('🔍 Buscando token:', {
    tokenLength: cleanToken.length,
    tokenPreview: cleanToken.substring(0, 10) + '...',
    now: new Date().toISOString(),
  });
  
  const result = await query(
    `SELECT * FROM password_reset_tokens
     WHERE token = $1
       AND expires_at > NOW()
       AND used_at IS NULL`,
    [cleanToken]
  );

  console.log('🔍 Resultado da busca:', {
    found: result.rows.length > 0,
    rowCount: result.rows.length,
    ifFound: result.rows.length > 0 ? {
      id: result.rows[0].id,
      expiresAt: result.rows[0].expires_at,
      usedAt: result.rows[0].used_at,
    } : null,
  });

  if (result.rows.length === 0) {
    // Debug: check if token exists but is expired or used
    const debugResult = await query(
      `SELECT id, expires_at, used_at, created_at
       FROM password_reset_tokens
       WHERE token = $1`,
      [cleanToken]
    );
    
    if (debugResult.rows.length > 0) {
      const debugRow = debugResult.rows[0];
      console.log('⚠️ Token encontrado mas inválido:', {
        expiresAt: debugRow.expires_at,
        now: new Date(),
        isExpired: new Date(debugRow.expires_at) <= new Date(),
        usedAt: debugRow.used_at,
        isUsed: debugRow.used_at !== null,
        createdAt: debugRow.created_at,
      });
    } else {
      console.log('❌ Token não encontrado no banco de dados');
    }
    
    return null;
  }

  return result.rows[0] as PasswordResetToken;
};

/**
 * Mark a password reset token as used
 */
export const markTokenAsUsed = async (tokenId: string): Promise<void> => {
  await query(
    `UPDATE password_reset_tokens
     SET used_at = NOW()
     WHERE id = $1`,
    [tokenId]
  );
};

/**
 * Invalidate all tokens for a user (optional - for security)
 */
export const invalidateUserTokens = async (userId: string): Promise<void> => {
  await query(
    `UPDATE password_reset_tokens
     SET used_at = NOW()
     WHERE user_id = $1
       AND used_at IS NULL`,
    [userId]
  );
};

/**
 * Clean up expired tokens (can be run as a cron job)
 */
export const cleanupExpiredTokens = async (): Promise<number> => {
  const result = await query(
    `DELETE FROM password_reset_tokens
     WHERE expires_at < NOW()
       AND used_at IS NULL`,
    []
  );

  return result.rowCount || 0;
};

