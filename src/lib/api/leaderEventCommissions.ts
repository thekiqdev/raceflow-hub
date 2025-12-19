import { apiClient } from './client.js';

export interface LeaderEventCommission {
  id: string;
  leader_id: string;
  event_id: string;
  commission_percentage: number;
  bonus_type: 'commission' | 'invitation' | 'both';
  required_purchases: number | null;
  bonus_registration_id: string | null;
  bonus_earned_at: string | null;
  name: string | null;
  created_at: string;
  updated_at: string;
  event_title?: string;
  event_date?: string;
  organizer_id?: string;
  coupon?: {
    id: string;
    code: string;
    link: string;
    discount_value?: number;
  } | null;
  stats?: {
    paid_registrations: number;
    invitations_earned: number;
    total_commission_earned?: number;
  };
}

export interface CreateLeaderEventCommissionData {
  event_id: string;
  commission_percentage?: number;
  bonus_type?: 'commission' | 'invitation' | 'both';
  required_purchases?: number | null;
  name?: string | null;
  coupon_discount?: number;
}

export interface UpdateLeaderEventCommissionData {
  commission_percentage?: number;
  bonus_type?: 'commission' | 'invitation' | 'both';
  required_purchases?: number | null;
  name?: string | null;
  coupon_discount?: number;
}

// Get all event commissions for a leader (organizer endpoint)
export const getLeaderEventCommissions = async (leaderId: string, isAdmin: boolean = false) => {
  const basePath = isAdmin ? '/admin' : '/organizer';
  return apiClient.get<LeaderEventCommission[]>(`${basePath}/group-leaders/${leaderId}/event-commissions`);
};

// Get my event commissions (leader endpoint)
export const getMyEventCommissions = async () => {
  return apiClient.get<LeaderEventCommission[]>('/group-leaders/me/event-commissions');
};

// Create event commission for a leader
export const createLeaderEventCommission = async (
  leaderId: string,
  data: CreateLeaderEventCommissionData,
  isAdmin: boolean = false
) => {
  const basePath = isAdmin ? '/admin' : '/organizer';
  return apiClient.post<LeaderEventCommission>(`${basePath}/group-leaders/${leaderId}/event-commissions`, data);
};

// Update event commission
export const updateLeaderEventCommission = async (
  leaderId: string,
  commissionId: string,
  data: UpdateLeaderEventCommissionData,
  isAdmin: boolean = false
) => {
  const basePath = isAdmin ? '/admin' : '/organizer';
  return apiClient.put<LeaderEventCommission>(
    `${basePath}/group-leaders/${leaderId}/event-commissions/${commissionId}`,
    data
  );
};

// Delete event commission
export const deleteLeaderEventCommission = async (leaderId: string, commissionId: string, isAdmin: boolean = false) => {
  const basePath = isAdmin ? '/admin' : '/organizer';
  return apiClient.delete(`${basePath}/group-leaders/${leaderId}/event-commissions/${commissionId}`);
};

