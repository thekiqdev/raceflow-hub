import { apiClient } from './client.js';

export interface TransferRequest {
  id: string;
  registration_id: string;
  requested_by: string;
  new_runner_cpf?: string;
  new_runner_email?: string;
  new_runner_id?: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled';
  transfer_fee: number;
  payment_status: 'pending' | 'paid' | 'refunded';
  asaas_payment_id?: string;
  reason?: string;
  admin_notes?: string;
  processed_by?: string;
  processed_at?: string;
  created_at: string;
  updated_at: string;
  // Joined data
  registration_code?: string;
  confirmation_code?: string;
  event_title?: string;
  runner_name?: string;
  new_runner_name?: string;
  requester_name?: string;
}

/**
 * Get all transfer requests (admin only)
 */
export const getTransferRequests = async (filters?: {
  status?: string;
}): Promise<{
  success: boolean;
  data?: TransferRequest[];
  error?: string;
}> => {
  const queryParams = new URLSearchParams();
  if (filters?.status) {
    queryParams.append('status', filters.status);
  }

  const queryString = queryParams.toString();
  const endpoint = `/admin/transfer-requests${queryString ? `?${queryString}` : ''}`;
  
  return apiClient.get<TransferRequest[]>(endpoint);
};

/**
 * Get transfer request by ID (for runners to check their own requests)
 */
export const getTransferRequestById = async (id: string): Promise<{
  success: boolean;
  data?: TransferRequest;
  error?: string;
}> => {
  return apiClient.get<TransferRequest>(`/registrations/transfer-requests/${id}`);
};

/**
 * Create a new transfer request
 */
export const createTransferRequest = async (data: {
  registration_id: string;
  new_runner_cpf?: string;
  new_runner_email?: string;
  reason?: string;
}): Promise<{
  success: boolean;
  data?: TransferRequest;
  message?: string;
  error?: string;
}> => {
  return apiClient.post<TransferRequest>('/registrations/transfer-requests', data);
};

/**
 * Generate payment for transfer fee
 */
export const generateTransferPayment = async (id: string): Promise<{
  success: boolean;
  data?: {
    pix_qr_code: string;
    pix_qr_code_id?: string;
    due_date: string;
    value: number;
    asaas_payment_id: string;
  };
  message?: string;
  error?: string;
}> => {
  return apiClient.post(`/registrations/transfer-requests/${id}/payment`);
};

/**
 * Update transfer request (approve/reject)
 */
export const updateTransferRequest = async (
  id: string,
  data: {
    status?: 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled';
    admin_notes?: string;
    new_runner_id?: string;
  }
): Promise<{
  success: boolean;
  data?: TransferRequest;
  message?: string;
  error?: string;
}> => {
  return apiClient.put<TransferRequest>(`/admin/transfer-requests/${id}`, data);
};

