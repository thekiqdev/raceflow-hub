import { apiClient } from './client.js';

export interface FinancialOverview {
  total_revenue: number;
  platform_commissions: number;
  total_withdrawals: number;
  available_balance: number;
  pending_withdrawals: number;
  pending_refunds: number;
}

export interface WithdrawRequest {
  id: string;
  organizer_id: string;
  organizer_name?: string;
  amount: number;
  fee: number;
  net_amount: number;
  payment_method: string;
  status: string;
  requested_at: string;
  processed_at?: string;
  processed_by?: string;
  notes?: string;
}

export interface RefundRequest {
  id: string;
  registration_id: string;
  athlete_id: string;
  athlete_name?: string;
  event_id: string;
  event_title?: string;
  amount: number;
  reason: string;
  status: string;
  requested_at: string;
  processed_at?: string;
  processed_by?: string;
  notes?: string;
}

export interface FinancialSettings {
  id: string;
  commission_percentage: number;
  min_withdraw_amount: number;
  payment_gateway: string;
  gateway_public_key?: string;
  gateway_private_key?: string;
  updated_at: string;
  updated_by?: string;
}

/**
 * Get financial overview
 */
export const getFinancialOverview = async (): Promise<{
  success: boolean;
  data?: FinancialOverview;
  error?: string;
  message?: string;
}> => {
  return apiClient.get<FinancialOverview>('/admin/financial/overview');
};

/**
 * Get withdrawal requests
 */
export const getWithdrawRequests = async (status?: string): Promise<{
  success: boolean;
  data?: WithdrawRequest[];
  error?: string;
  message?: string;
}> => {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiClient.get<WithdrawRequest[]>(`/admin/financial/withdrawals${query}`);
};

/**
 * Approve withdrawal request
 */
export const approveWithdrawal = async (requestId: string, notes?: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> => {
  return apiClient.post(`/admin/financial/withdrawals/${requestId}/approve`, { notes });
};

/**
 * Reject withdrawal request
 */
export const rejectWithdrawal = async (requestId: string, notes?: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> => {
  return apiClient.post(`/admin/financial/withdrawals/${requestId}/reject`, { notes });
};

/**
 * Get refund requests
 */
export const getRefundRequests = async (status?: string): Promise<{
  success: boolean;
  data?: RefundRequest[];
  error?: string;
  message?: string;
}> => {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiClient.get<RefundRequest[]>(`/admin/financial/refunds${query}`);
};

/**
 * Approve refund request
 */
export const approveRefund = async (requestId: string, notes?: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> => {
  return apiClient.post(`/admin/financial/refunds/${requestId}/approve`, { notes });
};

/**
 * Reject refund request
 */
export const rejectRefund = async (requestId: string, notes?: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> => {
  return apiClient.post(`/admin/financial/refunds/${requestId}/reject`, { notes });
};

/**
 * Get financial settings
 */
export const getFinancialSettings = async (): Promise<{
  success: boolean;
  data?: FinancialSettings;
  error?: string;
  message?: string;
}> => {
  return apiClient.get<FinancialSettings>('/admin/financial/settings');
};

/**
 * Update financial settings
 */
export const updateFinancialSettings = async (data: Partial<FinancialSettings>): Promise<{
  success: boolean;
  data?: FinancialSettings;
  message?: string;
  error?: string;
}> => {
  return apiClient.put<FinancialSettings>('/admin/financial/settings', data);
};




