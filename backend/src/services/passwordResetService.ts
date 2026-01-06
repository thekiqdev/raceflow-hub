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
  const result = await query(
    `SELECT * FROM password_reset_tokens
     WHERE token = $1
       AND expires_at > NOW()
       AND used_at IS NULL`,
    [token]
  );

  if (result.rows.length === 0) {
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

