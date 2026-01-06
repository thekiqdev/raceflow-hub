import { apiClient } from './client';

export interface RequestPasswordResetData {
  email: string;
}

export interface ResetPasswordData {
  token: string;
  newPassword: string;
}

export interface ValidateTokenResponse {
  success: boolean;
  valid: boolean;
  message?: string;
}

/**
 * Request password reset
 */
export const requestPasswordReset = async (data: RequestPasswordResetData) => {
  return apiClient.post('/auth/password-reset/request', data);
};

/**
 * Reset password with token
 */
export const resetPassword = async (data: ResetPasswordData) => {
  return apiClient.post('/auth/password-reset/reset', data);
};

/**
 * Validate reset token
 */
export const validateResetToken = async (token: string): Promise<ValidateTokenResponse> => {
  console.log('🔍 [validateResetToken] Validando token via API:', {
    tokenLength: token.length,
    tokenPreview: token.substring(0, 10) + '...',
    encodedToken: encodeURIComponent(token).substring(0, 20) + '...',
  });

  const response = await apiClient.get<ValidateTokenResponse>(`/auth/password-reset/validate-token?token=${encodeURIComponent(token)}`);
  
  console.log('📋 [validateResetToken] Resposta da API:', response);

  if (response.success && response.data) {
    return response.data;
  }
  
  return {
    success: false,
    valid: false,
    message: response.error || 'Token inválido',
  };
};

