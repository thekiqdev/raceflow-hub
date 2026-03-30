import { apiClient } from './client.js';

export interface LeaderInvitation {
  id: string;
  leader_id: string;
  bonus_registration_id: string;
  event_id: string;
  runner_id: string | null;
  runner_cpf: string | null;
  status: 'available' | 'sent' | 'used' | 'expired';
  sent_at: string | null;
  used_at: string | null;
  created_at: string;
  updated_at: string;
  event_title?: string;
  event_date?: string;
  runner_name?: string;
  runner_email?: string;
  /** true = corredor escolhe categoria/modalidade/kit; false = líder definiu; null = convite antigo */
  runner_chooses_category_modality_kit?: boolean | null;
}

export interface RunnerDataForInvitation {
  full_name: string;
  birth_date: string;
  city: string;
  gender: string;
  team?: string;
  email?: string;
  phone?: string;
}

export interface ProductSelectionForInvitation {
  product_id: string;
  variant_id?: string;
  attribute_selections?: Record<string, string>;
}

export interface SendInvitationData {
  invitation_id: string;
  runner_cpf: string;
  runner_data?: RunnerDataForInvitation;
  /** true = corredor escolhe categoria/modalidade/kit; false = líder definiu (obrigatório enviar category_id e opcionalmente modality_id, kit_id, product_selections) */
  runner_chooses_category_modality_kit?: boolean;
  category_id?: string;
  modality_id?: string;
  kit_id?: string;
  product_selections?: ProductSelectionForInvitation[];
}

// Get all invitations for the authenticated leader
export const getMyInvitations = async () => {
  return apiClient.get<LeaderInvitation[]>('/group-leaders/me/invitations');
};

// Get available invitations for the authenticated leader
export const getMyAvailableInvitations = async () => {
  return apiClient.get<LeaderInvitation[]>('/group-leaders/me/invitations/available');
};

// Send invitation to runner by CPF
export const sendInvitation = async (data: SendInvitationData) => {
  return apiClient.post<LeaderInvitation>('/group-leaders/me/invitations/send', data);
};

// Resend invitation email (convite must have status 'sent')
export const resendInvitationEmail = async (invitationId: string) => {
  return apiClient.post<{ success: boolean; message?: string }>(
    `/group-leaders/me/invitations/${invitationId}/resend-email`,
    {}
  );
};

// Get registration (ingresso) for a sent invitation - for leader to view QR / download PDF
export const getInvitationRegistration = async (invitationId: string) => {
  return apiClient.get<import('@/lib/api/registrations').Registration>(
    `/group-leaders/me/invitations/${invitationId}/registration`
  );
};

