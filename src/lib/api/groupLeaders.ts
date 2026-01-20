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
  // User information (returned by organizer endpoint)
  user_name?: string | null;
  user_email?: string | null;
  user_cpf?: string | null;
  user_phone?: string | null;
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
  // commission_percentage removed - now using event-specific commissions only
}

export interface UpdateGroupLeaderData {
  is_active?: boolean;
  // commission_percentage removed - now using event-specific commissions only
  referral_code?: string;
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

export const deleteGroupLeader = async (id: string) => {
  return apiClient.delete<{ success: boolean; message: string }>(`/admin/group-leaders/${id}/delete`);
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

// Organizer endpoints
export const getOrganizerGroupLeaders = async () => {
  return apiClient.get<GroupLeader[]>('/organizer/group-leaders');
};

export const getAvailableLeadersForOrganizer = async () => {
  return apiClient.get<GroupLeader[]>('/organizer/group-leaders/available');
};

export const addLeaderToOrganizer = async (leaderId: string) => {
  return apiClient.post<{ success: boolean; message: string }>(`/organizer/group-leaders/${leaderId}/add`);
};

export const removeLeaderFromOrganizer = async (leaderId: string) => {
  return apiClient.delete<{ success: boolean; message: string }>(`/organizer/group-leaders/${leaderId}/remove`);
};

export const createOrganizerGroupLeader = async (data: CreateGroupLeaderData) => {
  return apiClient.post<GroupLeader>('/organizer/group-leaders', data);
};

export const getOrganizerGroupLeaderById = async (id: string) => {
  return apiClient.get<GroupLeader>(`/organizer/group-leaders/${id}`);
};

export const updateOrganizerGroupLeader = async (id: string, data: UpdateGroupLeaderData) => {
  return apiClient.put<GroupLeader>(`/organizer/group-leaders/${id}`, data);
};

export const activateOrganizerGroupLeader = async (id: string) => {
  return apiClient.post<GroupLeader>(`/organizer/group-leaders/${id}/activate`, {});
};

export const deactivateOrganizerGroupLeader = async (id: string) => {
  return apiClient.delete<GroupLeader>(`/organizer/group-leaders/${id}`);
};

export const getOrganizerReferralsByLeader = async (id: string) => {
  return apiClient.get<UserReferral[]>(`/organizer/group-leaders/${id}/referrals`);
};

export const getOrganizerCommissionsByLeader = async (id: string, filters?: {
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
  const endpoint = `/organizer/group-leaders/${id}/commissions${queryString ? `?${queryString}` : ''}`;
  
  return apiClient.get<LeaderCommission[]>(endpoint);
};

