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
  // Ensure token is trimmed
  const cleanData = {
    ...data,
    token: data.token.trim(),
  };
  
  console.log('🔍 [resetPassword] Enviando:', {
    tokenLength: cleanData.token.length,
    tokenPreview: cleanData.token.substring(0, 20) + '...',
  });
  
  return apiClient.post('/auth/password-reset/reset', cleanData);
};

/**
 * Validate reset token
 */
export const validateResetToken = async (token: string): Promise<ValidateTokenResponse> => {
  const response = await apiClient.get<ValidateTokenResponse>(`/auth/password-reset/validate-token?token=${encodeURIComponent(token)}`);
  if (response.success && response.data) {
    return response.data;
  }
  return {
    success: false,
    valid: false,
    message: response.error || 'Token inválido',
  };
};

