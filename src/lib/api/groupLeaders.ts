import { apiClient } from './client.js';

export interface GroupLeader {
  id: string;
  user_id: string;
  referral_code: string;
  is_active: boolean;
  commission_percentage: number | null;
  total_earnings: number;
  total_referrals: number;
  created_at: string;
  updated_at: string;
}

export interface UserReferral {
  id: string;
  user_id: string;
  leader_id: string;
  referral_code: string;
  referral_type: 'link' | 'code';
  created_at: string;
  email?: string;
  full_name?: string;
  cpf?: string;
}

export interface LeaderCommission {
  id: string;
  leader_id: string;
  registration_id: string;
  referred_user_id: string;
  event_id: string;
  commission_amount: number;
  commission_percentage: number;
  registration_amount: number;
  status: 'pending' | 'paid' | 'cancelled';
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  event_title?: string;
  referred_user_email?: string;
  referred_user_name?: string;
}

export interface CreateGroupLeaderData {
  user_id: string;
  commission_percentage?: number | null;
}

export interface UpdateGroupLeaderData {
  is_active?: boolean;
  commission_percentage?: number | null;
}

export interface ReferralStats {
  total_referrals: number;
  total_registrations: number;
  total_commissions: number;
  pending_commissions: number;
  paid_commissions: number;
}

// Get my group leader data
export const getMyGroupLeader = async () => {
  return apiClient.get<GroupLeader>('/group-leaders/me');
};

// Get my referrals
export const getMyReferrals = async () => {
  return apiClient.get<UserReferral[]>('/group-leaders/me/referrals');
};

// Get my commissions
export const getMyCommissions = async (filters?: {
  status?: 'pending' | 'paid' | 'cancelled';
  start_date?: string;
  end_date?: string;
  event_id?: string;
}) => {
  const queryParams = new URLSearchParams();
  if (filters?.status) queryParams.append('status', filters.status);
  if (filters?.start_date) queryParams.append('start_date', filters.start_date);
  if (filters?.end_date) queryParams.append('end_date', filters.end_date);
  if (filters?.event_id) queryParams.append('event_id', filters.event_id);
  
  const queryString = queryParams.toString();
  const endpoint = `/group-leaders/me/commissions${queryString ? `?${queryString}` : ''}`;
  
  return apiClient.get<LeaderCommission[]>(endpoint);
};

// Get my stats
export const getMyStats = async () => {
  return apiClient.get<GroupLeader & { stats: ReferralStats }>('/group-leaders/me/stats');
};

// Admin endpoints
export const createGroupLeader = async (data: CreateGroupLeaderData) => {
  return apiClient.post<GroupLeader>('/admin/group-leaders', data);
};

export const getAllGroupLeaders = async () => {
  return apiClient.get<GroupLeader[]>('/admin/group-leaders');
};

export const getGroupLeaderById = async (id: string) => {
  return apiClient.get<GroupLeader>(`/admin/group-leaders/${id}`);
};

export const updateGroupLeader = async (id: string, data: UpdateGroupLeaderData) => {
  return apiClient.put<GroupLeader>(`/admin/group-leaders/${id}`, data);
};

export const deactivateGroupLeader = async (id: string) => {
  return apiClient.delete<GroupLeader>(`/admin/group-leaders/${id}`);
};

export const activateGroupLeader = async (id: string) => {
  return apiClient.post<GroupLeader>(`/admin/group-leaders/${id}/activate`, {});
};

export const getReferralsByLeader = async (id: string) => {
  return apiClient.get<UserReferral[]>(`/admin/group-leaders/${id}/referrals`);
};

export const getCommissionsByLeader = async (id: string, filters?: {
  status?: 'pending' | 'paid' | 'cancelled';
  start_date?: string;
  end_date?: string;
  event_id?: string;
}) => {
  const queryParams = new URLSearchParams();
  if (filters?.status) queryParams.append('status', filters.status);
  if (filters?.start_date) queryParams.append('start_date', filters.start_date);
  if (filters?.end_date) queryParams.append('end_date', filters.end_date);
  if (filters?.event_id) queryParams.append('event_id', filters.event_id);
  
  const queryString = queryParams.toString();
  const endpoint = `/admin/group-leaders/${id}/commissions${queryString ? `?${queryString}` : ''}`;
  
  return apiClient.get<LeaderCommission[]>(endpoint);
};

