import { apiClient } from './client.js';

export interface Quote {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  event_location: string;
  athletes_count: string;
  same_start_finish: string;
  electric_power: string;
  additional_points: string | null;
  chest_numbers: string;
  distances: string;
  timing_gate: string;
  cronoteam_registration: string;
  event_date: string;
  description: string;
  status: 'new' | 'viewed' | 'contacted' | 'closed';
  created_at: string;
  updated_at: string;
}

export interface CreateQuoteData {
  full_name: string;
  phone: string;
  email: string;
  event_location: string;
  athletes_count: string;
  same_start_finish: string;
  electric_power: string;
  additional_points?: string;
  chest_numbers: string;
  distances: string;
  timing_gate: string;
  cronoteam_registration: string;
  event_date: string;
  description: string;
}

export interface UpdateQuoteData {
  status?: 'new' | 'viewed' | 'contacted' | 'closed';
}

// Create a new quote (public)
export const createQuote = async (data: CreateQuoteData) => {
  return apiClient.post<Quote>('/quotes', data, { hasToken: false });
};

// Get all quotes (admin only)
export const getQuotes = async (filters?: { status?: string; search?: string }) => {
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.search) params.append('search', filters.search);
  
  const queryString = params.toString();
  return apiClient.get<Quote[]>(`/quotes${queryString ? `?${queryString}` : ''}`);
};

// Get quote by ID (admin only)
export const getQuoteById = async (id: string) => {
  return apiClient.get<Quote>(`/quotes/${id}`);
};

// Update quote (admin only)
export const updateQuote = async (id: string, data: UpdateQuoteData) => {
  return apiClient.put<Quote>(`/quotes/${id}`, data);
};

// Get count of new quotes (admin only)
export const getNewQuotesCount = async () => {
  return apiClient.get<{ count: number }>('/quotes/new-count');
};

