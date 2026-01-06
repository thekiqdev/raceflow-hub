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
  
  // Use PostgreSQL NOW() + INTERVAL to ensure timezone consistency
  const result = await query(
    `INSERT INTO password_reset_tokens (user_id, token, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '30 minutes')
     RETURNING *`,
    [userId, token]
  );

  const createdToken = result.rows[0] as PasswordResetToken;
  
  console.log('🔑 [createPasswordResetToken] Token criado:', {
    id: createdToken.id,
    userId,
    tokenLength: token.length,
    tokenPreview: token.substring(0, 10) + '...',
    expiresAt: createdToken.expires_at,
    createdAt: createdToken.created_at,
    nowInDB: (await query('SELECT NOW() as now', [])).rows[0].now,
  });

  return createdToken;
};

/**
 * Find a valid password reset token
 */
export const findPasswordResetToken = async (token: string): Promise<PasswordResetToken | null> => {
  // Trim and clean token
  const cleanToken = token.trim();
  
  // Get current time from database for accurate comparison
  const nowResult = await query('SELECT NOW() as now', []);
  const dbNow = nowResult.rows[0].now;
  
  console.log('🔍 [findPasswordResetToken] Buscando token:', {
    tokenLength: cleanToken.length,
    tokenPreview: cleanToken.substring(0, 10) + '...',
    dbNow: dbNow,
  });
  
  const result = await query(
    `SELECT *, 
            (expires_at > NOW()) as is_not_expired,
            (NOW() - created_at) as age,
            (expires_at - NOW()) as time_remaining
     FROM password_reset_tokens
     WHERE token = $1
       AND used_at IS NULL`,
    [cleanToken]
  );

  console.log('🔍 [findPasswordResetToken] Resultado da busca:', {
    found: result.rows.length > 0,
    rowCount: result.rows.length,
    ifFound: result.rows.length > 0 ? {
      id: result.rows[0].id,
      expiresAt: result.rows[0].expires_at,
      isNotExpired: result.rows[0].is_not_expired,
      age: result.rows[0].age,
      timeRemaining: result.rows[0].time_remaining,
      usedAt: result.rows[0].used_at,
    } : null,
  });

  if (result.rows.length === 0) {
    // Debug: check if token exists but is expired or used
    const debugResult = await query(
      `SELECT id, expires_at, used_at, created_at,
              (expires_at > NOW()) as is_not_expired,
              (NOW() - created_at) as age,
              (expires_at - NOW()) as time_remaining
       FROM password_reset_tokens
       WHERE token = $1`,
      [cleanToken]
    );
    
    if (debugResult.rows.length > 0) {
      const debugRow = debugResult.rows[0];
      console.log('⚠️ [findPasswordResetToken] Token encontrado mas inválido:', {
        expiresAt: debugRow.expires_at,
        dbNow: dbNow,
        isNotExpired: debugRow.is_not_expired,
        age: debugRow.age,
        timeRemaining: debugRow.time_remaining,
        usedAt: debugRow.used_at,
        isUsed: debugRow.used_at !== null,
        createdAt: debugRow.created_at,
      });
    } else {
      console.log('❌ [findPasswordResetToken] Token não encontrado no banco de dados');
    }
    
    return null;
  }

  const tokenRow = result.rows[0];
  
  // Check expiration using database comparison
  if (!tokenRow.is_not_expired) {
    console.log('❌ [findPasswordResetToken] Token expirado:', {
      expiresAt: tokenRow.expires_at,
      dbNow: dbNow,
      timeRemaining: tokenRow.time_remaining,
    });
    return null;
  }

  console.log('✅ [findPasswordResetToken] Token válido encontrado:', {
    id: tokenRow.id,
    timeRemaining: tokenRow.time_remaining,
  });

  return {
    id: tokenRow.id,
    user_id: tokenRow.user_id,
    token: tokenRow.token,
    expires_at: tokenRow.expires_at,
    used_at: tokenRow.used_at,
    created_at: tokenRow.created_at,
  } as PasswordResetToken;
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

