import { apiClient } from './client.js';

export interface OrganizerFinancialOverview {
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

export interface CreateWithdrawRequestData {
  amount: number;
  payment_method: 'PIX' | 'TED' | 'BANK_TRANSFER';
  pix_key?: string;
}

// Get financial overview
export const getOrganizerFinancialOverview = async () => {
  return apiClient.get<OrganizerFinancialOverview>('/organizer/financial/overview');
};

// Get withdrawal requests
export const getOrganizerWithdrawals = async (status?: string) => {
  const queryParams = new URLSearchParams();
  if (status) queryParams.append('status', status);

  const queryString = queryParams.toString();
  const endpoint = `/organizer/financial/withdrawals${queryString ? `?${queryString}` : ''}`;

  return apiClient.get<WithdrawRequest[]>(endpoint);
};

// Create withdrawal request
export const createWithdrawRequest = async (data: CreateWithdrawRequestData) => {
  return apiClient.post<WithdrawRequest>('/organizer/financial/withdrawals', data);
};




