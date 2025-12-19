import { apiClient } from './client.js';

export type CouponType = 'percentage' | 'fixed';

export interface Coupon {
  id: string;
  organizer_id: string;
  event_id: string | null; // Deprecated, use event_ids instead
  event_ids?: string[]; // Array of event IDs
  leader_id?: string | null; // ID do líder de grupo (opcional - cupons exclusivos)
  code: string;
  name: string;
  type: CouponType;
  discount_value: number;
  expiration_date: string | null;
  max_uses: number | null;
  current_uses: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateCouponData {
  event_ids?: string[] | null;
  code: string;
  name: string;
  type: CouponType;
  discount_value: number;
  expiration_date?: string | null;
  max_uses?: number | null;
  is_active?: boolean;
}

export interface UpdateCouponData {
  event_ids?: string[] | null;
  name?: string;
  type?: CouponType;
  discount_value?: number;
  expiration_date?: string | null;
  max_uses?: number | null;
  is_active?: boolean;
}

// Get all coupons for the current organizer
export const getCoupons = async () => {
  return apiClient.get<Coupon[]>('/organizer/coupons');
};

// Get coupon by ID
export const getCouponById = async (id: string) => {
  return apiClient.get<Coupon>(`/organizer/coupons/${id}`);
};

// Create a new coupon
export const createCoupon = async (data: CreateCouponData) => {
  return apiClient.post<Coupon>('/organizer/coupons', data);
};

// Update coupon
export const updateCoupon = async (id: string, data: UpdateCouponData) => {
  return apiClient.put<Coupon>(`/organizer/coupons/${id}`, data);
};

// Delete coupon
export const deleteCoupon = async (id: string) => {
  return apiClient.delete(`/organizer/coupons/${id}`);
};

// Validate coupon (public endpoint)
export const validateCoupon = async (code: string, eventId: string) => {
  return apiClient.post<Coupon>('/coupons/validate', { code, event_id: eventId });
};

// Leader Coupons endpoints
export const getLeaderCoupons = async (leaderId: string) => {
  return apiClient.get<Coupon[]>(`/organizer/group-leaders/${leaderId}/coupons`);
};

export const createLeaderCoupon = async (leaderId: string, data: CreateCouponData) => {
  return apiClient.post<Coupon>(`/organizer/group-leaders/${leaderId}/coupons`, data);
};

export const updateLeaderCoupon = async (leaderId: string, couponId: string, data: UpdateCouponData) => {
  return apiClient.put<Coupon>(`/organizer/group-leaders/${leaderId}/coupons/${couponId}`, data);
};

export const deleteLeaderCoupon = async (leaderId: string, couponId: string) => {
  return apiClient.delete(`/organizer/group-leaders/${leaderId}/coupons/${couponId}`);
};

