import { apiClient } from './client';

export interface ValidateCompletionResponse {
  success: boolean;
  valid: boolean;
  runnerName?: string;
  eventTitle?: string;
  error?: string;
}

export interface SetPasswordInvitationData {
  token: string;
  newPassword: string;
}

export interface SetPasswordInvitationResponse {
  success: boolean;
  data?: {
    user: {
      id: string;
      email: string;
      profile: { id: string; full_name: string; cpf: string; phone: string } | null;
      roles: string[];
    };
    token: string;
  };
  error?: string;
  message?: string;
}

/**
 * Valida o token do link de completar cadastro (convite sem cadastro).
 * GET /api/invitations/complete-registration/validate?token=xxx
 */
export const validateCompletionToken = async (
  token: string
): Promise<ValidateCompletionResponse> => {
  const cleanToken = token.trim();
  const response = await apiClient.get<ValidateCompletionResponse>(
    `/invitations/complete-registration/validate?token=${encodeURIComponent(cleanToken)}`
  );
  const body = response as unknown as ValidateCompletionResponse;
  return {
    success: !!body.success,
    valid: !!body.valid,
    runnerName: body.runnerName,
    eventTitle: body.eventTitle,
    error: body.error,
  };
};

/**
 * Define senha usando o token do link de completar cadastro e retorna token de login.
 * POST /api/auth/set-password-invitation
 */
export const setPasswordInvitation = async (
  data: SetPasswordInvitationData
): Promise<SetPasswordInvitationResponse> => {
  const cleanData = {
    token: data.token.trim(),
    newPassword: data.newPassword,
  };
  const response = await apiClient.post<SetPasswordInvitationResponse['data']>(
    '/auth/set-password-invitation',
    cleanData
  );
  return response as unknown as SetPasswordInvitationResponse;
};
