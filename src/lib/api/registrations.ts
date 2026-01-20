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
  product_selections?: Array<{
    product_id: string;
    product_name: string;
    variant_id: string | null;
    variant_name: string | null;
    attribute_name: string;
    attribute_value: string;
  }>;
}

// Credit Card Data Types
export interface CreditCardData {
  holderName: string;
  number: string;
  expiryMonth: string; // MM (01-12)
  expiryYear: string; // YYYY
  ccv: string; // 3 or 4 digits
}

export interface CreditCardHolderInfo {
  name: string;
  email: string;
  cpfCnpj: string;
  postalCode: string;
  addressNumber: string;
  addressComplement?: string;
  phone: string;
  mobilePhone?: string;
}

export interface ProductSelection {
  product_id: string;
  variant_id?: string;
  attribute_selections?: Record<string, string>; // { attributeName: attributeValue }
}

export interface CreateRegistrationData {
  event_id: string;
  runner_id?: string;
  category_id: string;
  kit_id?: string;
  payment_method?: 'pix' | 'credit_card' | 'boleto';
  total_amount: number;
  coupon_code?: string;
  product_selections?: ProductSelection[];
  // Credit card data (only when payment_method is 'credit_card')
  credit_card?: CreditCardData;
  credit_card_holder_info?: CreditCardHolderInfo;
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

// Check if user already has an active registration for an event
export const checkExistingRegistration = async (eventId: string) => {
  return apiClient.get<{ hasExistingRegistration: boolean; registration: Registration | null }>(`/registrations/check-existing?event_id=${encodeURIComponent(eventId)}`);
};

// Get registration by ID (requires authentication)
export const getRegistrationById = async (id: string) => {
  return apiClient.get<Registration>(`/registrations/${id}`);
};

// Get registration by ID for validation (public - no authentication required)
export const getRegistrationForValidation = async (id: string) => {
  // Use same URL logic as apiClient
  const getApiUrl = () => {
    const envUrl = import.meta.env.VITE_API_URL;
    
    if (envUrl && !envUrl.includes('localhost')) {
      return envUrl;
    }
    
    if (import.meta.env.PROD) {
      return 'https://cronoteam-crono-back.e758qe.easypanel.host/api';
    }
    
    return 'http://localhost:3001/api';
  };

  const apiUrl = getApiUrl();
  const response = await fetch(`${apiUrl}/registrations/${id}/validate`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch registration' }));
    throw new Error(error.error || error.message || 'Failed to fetch registration');
  }

  return response.json();
};

// Get payment status by registration ID
export const getPaymentStatus = async (registrationId: string) => {
  return apiClient.get<{ status: string; payment_date?: string; pix_qr_code?: string | null; due_date?: string | null }>(`/registrations/${registrationId}/payment-status`);
};

// Generate payment for registration (creates payment if it doesn't exist)
export const generatePayment = async (registrationId: string) => {
  return apiClient.post<{ status: string; payment_date?: string; pix_qr_code?: string | null; due_date?: string | null; asaas_payment_id?: string }>(`/registrations/${registrationId}/generate-payment`);
};

// Create registration
export const createRegistration = async (data: CreateRegistrationData) => {
  return apiClient.post<Registration>('/registrations', data);
};

// Create registration by organizer for an athlete
export interface CreateRegistrationByOrganizerData {
  email: string;
  event_id: string;
  category_id: string;
  kit_id?: string;
  product_selections?: ProductSelection[];
}

export const createRegistrationByOrganizer = async (data: CreateRegistrationByOrganizerData) => {
  return apiClient.post<Registration>('/registrations/organizer/register-athlete', data);
};

// Create registration by group leader
export interface CreateRegistrationByLeaderData {
  email: string;
  event_id: string;
  category_id: string;
  kit_id?: string;
  commission_id?: string; // NOVO: ID da comissão específica (opcional)
  product_selections?: ProductSelection[];
}

export const createRegistrationByLeader = async (data: CreateRegistrationByLeaderData) => {
  return apiClient.post<Registration>('/registrations/leader/register-athlete', data);
};

// Update registration
export const updateRegistration = async (id: string, data: UpdateRegistrationData) => {
  return apiClient.put<Registration>(`/registrations/${id}`, data);
};

// Transfer registration to another runner by CPF or email
export const transferRegistration = async (id: string, cpf?: string, email?: string) => {
  return apiClient.put<Registration>(`/registrations/${id}/transfer`, { cpf, email });
};

// Cancel registration
export const cancelRegistration = async (id: string) => {
  return apiClient.put<Registration>(`/registrations/${id}/cancel`, {});
};

// Delete registration (hard delete - only for admin)
export const deleteRegistration = async (id: string) => {
  return apiClient.delete<Registration>(`/registrations/${id}`);
};

// Get registration receipt
export const getRegistrationReceipt = async (id: string) => {
  return apiClient.get<Registration>(`/registrations/${id}/receipt`);
};

// Get registrations with missing attributes
export interface MissingAttributesRegistration {
  registration_id: string;
  event_title: string;
  event_date: string;
  kit_id: string;
  kit_name: string;
  products_with_missing_attributes: Array<{
    product_id: string;
    product_name: string;
    variant_attributes: string[];
    available_variants: Array<{
      variant_id: string;
      variant_name: string;
      attribute_values: { [key: string]: string };
    }>;
  }>;
}

export const getRegistrationsWithMissingAttributes = async () => {
  return apiClient.get<MissingAttributesRegistration[]>("/registrations/missing-attributes");
};

// Complete registration attributes
export interface CompleteAttributesData {
  product_selections: Array<{
    product_id: string;
    variant_id?: string;
    attribute_selections: { [key: string]: string };
  }>;
}

export const completeRegistrationAttributes = async (
  registrationId: string,
  data: CompleteAttributesData
) => {
  return apiClient.post<{ success: boolean; message: string }>(
    `/registrations/${registrationId}/complete-attributes`,
    data
  );
};

// Remove registration attributes
export interface RemoveAttributesData {
  product_ids?: string[];
}

export const removeRegistrationAttributes = async (
  registrationId: string,
  data?: RemoveAttributesData
) => {
  return apiClient.post<{ success: boolean; message: string }>(
    `/registrations/${registrationId}/remove-attributes`,
    data || {}
  );
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


