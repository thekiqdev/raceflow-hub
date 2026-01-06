import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  createPasswordResetToken,
  findPasswordResetToken,
  markTokenAsUsed,
  invalidateUserTokens,
} from '../services/passwordResetService.js';
import { query } from '../config/database.js';
import { hashPassword } from '../services/authService.js';
import { sendNotificationSafely, getUserEmail, getUserName } from '../services/notificationService.js';
import { z } from 'zod';

const requestPasswordResetSchema = z.object({
  email: z.string().email('E-mail inválido'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token é obrigatório'),
  newPassword: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres'),
});

/**
 * POST /api/auth/password-reset/request
 * Request password reset (public endpoint)
 */
export const requestPasswordResetController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const validation = requestPasswordResetSchema.safeParse(req.body);
  
  if (!validation.success) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: validation.error.errors[0].message,
      details: validation.error.errors,
    });
    return;
  }

  const { email } = validation.data;

  // Find user by email
  const userResult = await query(
    'SELECT id, email FROM users WHERE email = $1',
    [email.toLowerCase().trim()]
  );

  // Always return success to prevent email enumeration
  if (userResult.rows.length === 0) {
    res.json({
      success: true,
      message: 'Se o e-mail estiver cadastrado, você receberá um link de recuperação de senha.',
    });
    return;
  }

  const user = userResult.rows[0];

  // Invalidate previous tokens for security
  await invalidateUserTokens(user.id);

  // Create new reset token
  const resetToken = await createPasswordResetToken(user.id);

  // Get user name for email
  const userName = await getUserName(user.id) || 'Usuário';
  const userEmail = user.email;

  // Generate reset URL
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken.token}`;

  // Send email notification
  try {
    await sendNotificationSafely({
      templateKey: 'password_reset_request',
      recipient: {
        email: userEmail,
        name: userName,
      },
      variables: {
        userName: userName,
        resetUrl: resetUrl,
        expiresIn: '30 minutos',
      },
    });
    console.log(`✅ Email de recuperação de senha enviado para ${userEmail}`);
  } catch (error: any) {
    console.error('❌ Erro ao enviar email de recuperação de senha:', error);
    // Don't fail the request if email fails
  }

  res.json({
    success: true,
    message: 'Se o e-mail estiver cadastrado, você receberá um link de recuperação de senha.',
  });
});

/**
 * POST /api/auth/password-reset/reset
 * Reset password using token (public endpoint)
 */
export const resetPasswordController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const validation = resetPasswordSchema.safeParse(req.body);
  
  if (!validation.success) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: validation.error.errors[0].message,
      details: validation.error.errors,
    });
    return;
  }

  const { token, newPassword } = validation.data;

  // Find valid token
  const resetToken = await findPasswordResetToken(token);

  if (!resetToken) {
    res.status(400).json({
      success: false,
      error: 'Invalid token',
      message: 'Token inválido ou expirado. Solicite um novo link de recuperação de senha.',
    });
    return;
  }

  // Hash new password
  const passwordHash = await hashPassword(newPassword);

  // Update user password
  await query(
    'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
    [passwordHash, resetToken.user_id]
  );

  // Mark token as used
  await markTokenAsUsed(resetToken.id);

  // Invalidate all other tokens for this user
  await invalidateUserTokens(resetToken.user_id);

  // Get user email and name for notification
  const userEmail = await getUserEmail(resetToken.user_id);
  const userName = await getUserName(resetToken.user_id) || 'Usuário';

  // Send confirmation email
  try {
    await sendNotificationSafely({
      templateKey: 'password_reset_success',
      recipient: {
        email: userEmail || '',
        name: userName,
      },
      variables: {
        userName: userName,
      },
    });
    console.log(`✅ Email de confirmação de alteração de senha enviado para ${userEmail}`);
  } catch (error: any) {
    console.error('❌ Erro ao enviar email de confirmação:', error);
    // Don't fail the request if email fails
  }

  res.json({
    success: true,
    message: 'Senha alterada com sucesso! Você já pode fazer login com sua nova senha.',
  });
});

/**
 * GET /api/auth/password-reset/validate-token
 * Validate if a token is still valid (public endpoint)
 */
export const validateTokenController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    res.status(400).json({
      success: false,
      error: 'Token required',
      message: 'Token é obrigatório',
    });
    return;
  }

  const resetToken = await findPasswordResetToken(token);

  if (!resetToken) {
    res.json({
      success: false,
      valid: false,
      message: 'Token inválido ou expirado',
    });
    return;
  }

  res.json({
    success: true,
    valid: true,
    message: 'Token válido',
  });
});

