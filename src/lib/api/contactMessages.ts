import { apiClient, type ApiResponse } from './client.js';

export interface ContactMessage {
  id: string;
  type: 'event' | 'platform';
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  event_id: string | null;
  organizer_id: string | null;
  event_title?: string;
  organizer_name?: string;
  status: 'new' | 'viewed' | 'replied' | 'closed';
  created_at: string;
  updated_at: string;
}

export interface CreateContactMessageData {
  type: 'event' | 'platform';
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  event_id?: string;
  organizer_id?: string;
}

export interface UpdateContactMessageData {
  status?: 'new' | 'viewed' | 'replied' | 'closed';
}

export interface ContactMessageWhatsappInfo {
  phone: string;
  source: 'organizer' | 'admin';
}

export type CreateContactMessageResponse = ApiResponse<ContactMessage> & {
  whatsapp?: ContactMessageWhatsappInfo | null;
};

// Create a new contact message (public)
export const createContactMessage = async (
  data: CreateContactMessageData
): Promise<CreateContactMessageResponse> => {
  return apiClient.post<ContactMessage>('/contact-messages', data, {
    hasToken: false,
  }) as Promise<CreateContactMessageResponse>;
};

// Get all contact messages (admin/organizer only)
export const getContactMessages = async (filters?: { type?: string; status?: string; search?: string }) => {
  const params = new URLSearchParams();
  if (filters?.type) params.append('type', filters.type);
  if (filters?.status) params.append('status', filters.status);
  if (filters?.search) params.append('search', filters.search);
  
  const queryString = params.toString();
  return apiClient.get<ContactMessage[]>(`/contact-messages${queryString ? `?${queryString}` : ''}`);
};

// Get contact message by ID (admin/organizer only)
export const getContactMessageById = async (id: string) => {
  return apiClient.get<ContactMessage>(`/contact-messages/${id}`);
};

// Update contact message (admin/organizer only)
export const updateContactMessage = async (id: string, data: UpdateContactMessageData) => {
  return apiClient.put<ContactMessage>(`/contact-messages/${id}`, data);
};

// Get count of new contact messages (admin/organizer only)
export const getNewContactMessagesCount = async () => {
  return apiClient.get<{ count: number }>('/contact-messages/new-count');
};

