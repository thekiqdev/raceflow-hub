import { apiClient } from './client.js';

export interface Registration {
  id: string;
  event_id: string;
  runner_id: string;
  registered_by: string;
  category_id: string;
  kit_id?: string;
  status?: 'pending' | 'confirmed' | 'cancelled' | 'refund_requested' | 'refunded';
  payment_status?: 'pending' | 'paid' | 'refunded' | 'failed';
  payment_method?: 'pix' | 'credit_card' | 'boleto';
  total_amount: number;
  confirmation_code?: string;
  created_at?: string;
  updated_at?: string;
  event_title?: string;
  event_date?: string;
  category_name?: string;
  category_distance?: string;
  runner_name?: string;
  runner_cpf?: string;
  kit_name?: string;
  event_organizer_id?: string;
}

export interface CreateRegistrationData {
  event_id: string;
  runner_id?: string;
  category_id: string;
  kit_id?: string;
  payment_method?: 'pix' | 'credit_card' | 'boleto';
  total_amount: number;
}

export interface UpdateRegistrationData {
  status?: 'pending' | 'confirmed' | 'cancelled' | 'refund_requested' | 'refunded';
  payment_status?: 'pending' | 'paid' | 'refunded' | 'failed';
  payment_method?: 'pix' | 'credit_card' | 'boleto';
}

// Get registrations
export const getRegistrations = async (filters?: {
  event_id?: string;
  runner_id?: string;
  organizer_id?: string;
  status?: string;
  payment_status?: string;
  search?: string;
}) => {
  const queryParams = new URLSearchParams();
  if (filters?.event_id) queryParams.append('event_id', filters.event_id);
  if (filters?.runner_id) queryParams.append('runner_id', filters.runner_id);
  if (filters?.organizer_id) queryParams.append('organizer_id', filters.organizer_id);
  if (filters?.status) queryParams.append('status', filters.status);
  if (filters?.payment_status) queryParams.append('payment_status', filters.payment_status);
  if (filters?.search) queryParams.append('search', filters.search);

  const queryString = queryParams.toString();
  const endpoint = `/registrations${queryString ? `?${queryString}` : ''}`;

  return apiClient.get<Registration[]>(endpoint);
};

// Get registration by ID
export const getRegistrationById = async (id: string) => {
  return apiClient.get<Registration>(`/registrations/${id}`);
};

// Get payment status by registration ID
export const getPaymentStatus = async (registrationId: string) => {
  return apiClient.get<{ status: string; payment_date?: string }>(`/registrations/${registrationId}/payment-status`);
};

// Create registration
export const createRegistration = async (data: CreateRegistrationData) => {
  return apiClient.post<Registration>('/registrations', data);
};

// Update registration
export const updateRegistration = async (id: string, data: UpdateRegistrationData) => {
  return apiClient.put<Registration>(`/registrations/${id}`, data);
};

// Transfer registration to another runner by CPF
export const transferRegistration = async (id: string, cpf: string) => {
  return apiClient.put<Registration>(`/registrations/${id}/transfer`, { cpf });
};

// Cancel registration
export const cancelRegistration = async (id: string) => {
  return apiClient.put<Registration>(`/registrations/${id}/cancel`, {});
};

// Get registration receipt
export const getRegistrationReceipt = async (id: string) => {
  return apiClient.get<Registration>(`/registrations/${id}/receipt`);
};

// Export registrations
export const exportRegistrations = async (filters?: {
  event_id?: string;
  status?: string;
  payment_status?: string;
}) => {
  const queryParams = new URLSearchParams();
  if (filters?.event_id) queryParams.append('event_id', filters.event_id);
  if (filters?.status) queryParams.append('status', filters.status);
  if (filters?.payment_status) queryParams.append('payment_status', filters.payment_status);

  const queryString = queryParams.toString();
  const endpoint = `/registrations/export${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}${endpoint}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to export registrations');
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `inscricoes_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};


