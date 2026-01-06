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

  const result = await query(
    `INSERT INTO password_reset_tokens (user_id, token, expires_at)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [userId, token, expiresAt]
  );

  return result.rows[0] as PasswordResetToken;
};

/**
 * Find a valid password reset token
 */
export const findPasswordResetToken = async (token: string): Promise<PasswordResetToken | null> => {
  console.log('🔍 [findPasswordResetToken] Buscando token:', {
    tokenLength: token.length,
    tokenPreview: token.substring(0, 10) + '...',
    tokenType: typeof token,
  });

  const result = await query(
    `SELECT * FROM password_reset_tokens
     WHERE token = $1
       AND expires_at > NOW()
       AND used_at IS NULL`,
    [token]
  );

  console.log('📋 [findPasswordResetToken] Resultado da query:', {
    found: result.rows.length > 0,
    rowCount: result.rows.length,
    tokenId: result.rows[0]?.id,
    expiresAt: result.rows[0]?.expires_at,
    usedAt: result.rows[0]?.used_at,
    now: new Date().toISOString(),
  });

  if (result.rows.length === 0) {
    // Check if token exists but is expired or used
    const checkResult = await query(
      `SELECT * FROM password_reset_tokens WHERE token = $1`,
      [token]
    );
    
    if (checkResult.rows.length > 0) {
      const existingToken = checkResult.rows[0];
      console.log('⚠️ [findPasswordResetToken] Token encontrado mas inválido:', {
        expiresAt: existingToken.expires_at,
        usedAt: existingToken.used_at,
        isExpired: new Date(existingToken.expires_at) <= new Date(),
        isUsed: existingToken.used_at !== null,
      });
    } else {
      console.log('❌ [findPasswordResetToken] Token não encontrado no banco');
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

