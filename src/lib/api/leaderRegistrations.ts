import { apiClient } from './client.js';

export interface LeaderRegistration {
  id: string;
  event_id: string;
  event_title: string;
  event_date: string;
  runner_id: string;
  runner_name: string;
  runner_cpf: string;
  runner_email: string;
  category_name: string;
  total_amount: number;
  payment_status: string;
  status: string;
  coupon_code: string;
  created_at: string;
  confirmation_code: string | null;
}

// Get my coupon registrations (leader endpoint)
export const getMyCouponRegistrations = async (filters?: {
  event_id?: string;
  coupon_code?: string;
  payment_status?: 'pending' | 'paid' | 'cancelled';
}) => {
  const queryParams = new URLSearchParams();
  if (filters?.event_id) queryParams.append('event_id', filters.event_id);
  if (filters?.coupon_code) queryParams.append('coupon_code', filters.coupon_code);
  if (filters?.payment_status) queryParams.append('payment_status', filters.payment_status);
  
  const queryString = queryParams.toString();
  const endpoint = `/group-leaders/me/coupon-registrations${queryString ? `?${queryString}` : ''}`;
  
  return apiClient.get<{ data: LeaderRegistration[]; count: number }>(endpoint);
};

// Get leader's coupon registrations (organizer/admin endpoint)
export const getLeaderCouponRegistrations = async (
  leaderId: string,
  filters?: {
    event_id?: string;
    coupon_code?: string;
    payment_status?: 'pending' | 'paid' | 'cancelled';
  }
) => {
  const queryParams = new URLSearchParams();
  if (filters?.event_id) queryParams.append('event_id', filters.event_id);
  if (filters?.coupon_code) queryParams.append('coupon_code', filters.coupon_code);
  if (filters?.payment_status) queryParams.append('payment_status', filters.payment_status);
  
  const queryString = queryParams.toString();
  const endpoint = `/organizer/group-leaders/${leaderId}/coupon-registrations${queryString ? `?${queryString}` : ''}`;
  
  return apiClient.get<{ data: LeaderRegistration[]; count: number }>(endpoint);
};

// Get leader's coupon registrations (admin endpoint)
export const getAdminLeaderCouponRegistrations = async (
  leaderId: string,
  filters?: {
    event_id?: string;
    coupon_code?: string;
    payment_status?: 'pending' | 'paid' | 'cancelled';
  }
) => {
  const queryParams = new URLSearchParams();
  if (filters?.event_id) queryParams.append('event_id', filters.event_id);
  if (filters?.coupon_code) queryParams.append('coupon_code', filters.coupon_code);
  if (filters?.payment_status) queryParams.append('payment_status', filters.payment_status);
  
  const queryString = queryParams.toString();
  const endpoint = `/admin/group-leaders/${leaderId}/coupon-registrations${queryString ? `?${queryString}` : ''}`;
  
  return apiClient.get<{ data: LeaderRegistration[]; count: number }>(endpoint);
};

