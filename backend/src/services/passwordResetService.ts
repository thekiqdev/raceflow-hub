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
     RETURNING *,
            NOW() as db_now,
            EXTRACT(EPOCH FROM (expires_at - NOW())) as seconds_until_expiry`,
    [userId, token]
  );

  const createdToken = result.rows[0] as PasswordResetToken;
  const secondsUntilExpiry = parseFloat(result.rows[0].seconds_until_expiry || 0);
  
  console.log('🔑 [createPasswordResetToken] Token criado:', {
    id: createdToken.id,
    userId,
    tokenLength: token.length,
    tokenPreview: token.substring(0, 10) + '...',
    expiresAt: createdToken.expires_at,
    createdAt: createdToken.created_at,
    dbNow: result.rows[0].db_now,
    secondsUntilExpiry: secondsUntilExpiry,
    minutesUntilExpiry: Math.floor(secondsUntilExpiry / 60),
  });

  return createdToken;
};

/**
 * Find a valid password reset token
 */
export const findPasswordResetToken = async (token: string): Promise<PasswordResetToken | null> => {
  // Trim and clean token
  const cleanToken = token.trim();
  
  console.log('🔍 [findPasswordResetToken] Buscando token:', {
    tokenLength: cleanToken.length,
    tokenPreview: cleanToken.substring(0, 10) + '...',
  });
  
  // First, find the token without expiration check in WHERE clause
  // We'll check expiration in JavaScript for better debugging
  const result = await query(
    `SELECT *,
            NOW() as db_now,
            (expires_at > NOW()) as is_not_expired,
            EXTRACT(EPOCH FROM (expires_at - NOW())) as seconds_remaining,
            EXTRACT(EPOCH FROM (NOW() - created_at)) as age_seconds
     FROM password_reset_tokens
     WHERE token = $1
       AND used_at IS NULL
       AND expires_at > (NOW() - INTERVAL '1 minute')`,  // Grace period: allow tokens up to 1 minute expired
    [cleanToken]
  );

  console.log('🔍 [findPasswordResetToken] Resultado da busca:', {
    found: result.rows.length > 0,
    rowCount: result.rows.length,
  });

  if (result.rows.length === 0) {
    // Debug: check if token exists at all (even if expired or used)
    const debugResult = await query(
      `SELECT *,
              NOW() as db_now,
              (expires_at > NOW()) as is_not_expired,
              EXTRACT(EPOCH FROM (expires_at - NOW())) as seconds_remaining,
              EXTRACT(EPOCH FROM (NOW() - created_at)) as age_seconds
       FROM password_reset_tokens
       WHERE token = $1`,
      [cleanToken]
    );
    
    if (debugResult.rows.length > 0) {
      const debugRow = debugResult.rows[0];
      const secondsRemaining = parseFloat(debugRow.seconds_remaining || 0);
      const ageSeconds = parseFloat(debugRow.age_seconds || 0);
      
      console.log('⚠️ [findPasswordResetToken] Token encontrado mas inválido:', {
        id: debugRow.id,
        expiresAt: debugRow.expires_at,
        dbNow: debugRow.db_now,
        isNotExpired: debugRow.is_not_expired,
        secondsRemaining: secondsRemaining,
        minutesRemaining: Math.floor(secondsRemaining / 60),
        ageSeconds: ageSeconds,
        ageMinutes: Math.floor(ageSeconds / 60),
        usedAt: debugRow.used_at,
        isUsed: debugRow.used_at !== null,
        createdAt: debugRow.created_at,
        tokenMatches: debugRow.token === cleanToken,
      });
    } else {
      console.log('❌ [findPasswordResetToken] Token não encontrado no banco de dados');
    }
    
    return null;
  }

  const tokenRow = result.rows[0];
  const secondsRemaining = parseFloat(tokenRow.seconds_remaining || 0);
  const ageSeconds = parseFloat(tokenRow.age_seconds || 0);
  
  console.log('📊 [findPasswordResetToken] Token encontrado, verificando validade:', {
    id: tokenRow.id,
    expiresAt: tokenRow.expires_at,
    dbNow: tokenRow.db_now,
    isNotExpired: tokenRow.is_not_expired,
    secondsRemaining: secondsRemaining,
    minutesRemaining: Math.floor(secondsRemaining / 60),
    ageSeconds: ageSeconds,
    ageMinutes: Math.floor(ageSeconds / 60),
    usedAt: tokenRow.used_at,
  });
  
  // Check expiration using database comparison
  // Use seconds_remaining for more accurate check
  // Add a small buffer (5 seconds) to account for any timing differences
  if (secondsRemaining <= -5) {
    console.log('❌ [findPasswordResetToken] Token expirado (seconds_remaining <= -5):', {
      expiresAt: tokenRow.expires_at,
      dbNow: tokenRow.db_now,
      secondsRemaining: secondsRemaining,
      minutesRemaining: Math.floor(secondsRemaining / 60),
    });
    return null;
  }

  // Double check with boolean flag (but be more lenient)
  // Only reject if clearly expired (more than 1 minute past expiry)
  if (!tokenRow.is_not_expired && secondsRemaining < -60) {
    console.log('❌ [findPasswordResetToken] Token expirado (is_not_expired = false e seconds_remaining < -60):', {
      expiresAt: tokenRow.expires_at,
      dbNow: tokenRow.db_now,
      secondsRemaining: secondsRemaining,
    });
    return null;
  }
  
  // If token is slightly expired but within 1 minute, log warning but allow
  if (!tokenRow.is_not_expired && secondsRemaining >= -60) {
    console.log('⚠️ [findPasswordResetToken] Token ligeiramente expirado mas permitindo (grace period):', {
      expiresAt: tokenRow.expires_at,
      dbNow: tokenRow.db_now,
      secondsRemaining: secondsRemaining,
      minutesRemaining: Math.floor(secondsRemaining / 60),
    });
    // Continue - allow token within grace period
  }

  console.log('✅ [findPasswordResetToken] Token válido encontrado:', {
    id: tokenRow.id,
    secondsRemaining: secondsRemaining,
    minutesRemaining: Math.floor(secondsRemaining / 60),
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

