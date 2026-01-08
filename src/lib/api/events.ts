import { apiClient } from './client.js';

export type EventRegistrationStatus = 'not_open' | 'open' | 'closed';

export interface Event {
  id: string;
  organizer_id: string;
  title: string;
  description?: string;
  event_date: string;
  location: string;
  city: string;
  state: string;
  banner_url?: string;
  regulation_url?: string;
  result_url?: string;
  status?: 'draft' | 'published' | 'ongoing' | 'finished' | 'cancelled';
  registration_status?: EventRegistrationStatus | null;
  registration_start_date?: string | null;
  registration_end_date?: string | null;
  registration_auto_mode?: boolean;
  created_at?: string;
  updated_at?: string;
  organizer_name?: string;
  organizer_logo_url?: string;
  organizer_organization_name?: string;
  organizer_contact_email?: string;
  organizer_contact_phone?: string;
  organizer_website_url?: string;
  organizer_bio?: string;
  registration_count?: number;
  confirmed_registrations?: number;
  revenue?: number;
  avg_ticket?: number;
}

export interface CreateEventData {
  title: string;
  description?: string;
  event_date: string;
  location: string;
  city: string;
  state: string;
  banner_url?: string;
  regulation_url?: string;
  result_url?: string;
  status?: 'draft' | 'published' | 'ongoing' | 'finished' | 'cancelled';
  organizer_id?: string;
  registration_status?: EventRegistrationStatus | null;
  registration_start_date?: string | null;
  registration_end_date?: string | null;
  registration_auto_mode?: boolean;
}

export interface UpdateEventData {
  title?: string;
  description?: string;
  event_date?: string;
  location?: string;
  city?: string;
  state?: string;
  banner_url?: string;
  regulation_url?: string;
  result_url?: string;
  status?: 'draft' | 'published' | 'ongoing' | 'finished' | 'cancelled';
  registration_status?: EventRegistrationStatus | null;
  registration_start_date?: string | null;
  registration_end_date?: string | null;
  registration_auto_mode?: boolean;
}

// Get all events
export const getEvents = async (filters?: {
  status?: string;
  city?: string;
  state?: string;
  organizer_id?: string;
  search?: string;
}) => {
  const queryParams = new URLSearchParams();
  if (filters?.status) queryParams.append('status', filters.status);
  if (filters?.city) queryParams.append('city', filters.city);
  if (filters?.state) queryParams.append('state', filters.state);
  if (filters?.organizer_id) queryParams.append('organizer_id', filters.organizer_id);
  if (filters?.search) queryParams.append('search', filters.search);

  const queryString = queryParams.toString();
  const endpoint = `/events${queryString ? `?${queryString}` : ''}`;

  const response = await apiClient.get<Event[]>(endpoint);
  
  // Debug log
  if (filters?.organizer_id) {
    console.log('📋 getEvents response:', {
      success: response.success,
      dataLength: response.data?.length || 0,
      organizer_id: filters.organizer_id,
      events: response.data,
    });
  }
  
  return response;
};

// Get event by ID
export const getEventById = async (id: string) => {
  return apiClient.get<Event>(`/events/${id}`);
};

// Create event
export const createEvent = async (data: CreateEventData) => {
  const response = await apiClient.post<Event>('/events', data);
  
  // Debug log
  console.log('✅ createEvent response:', {
    success: response.success,
    eventId: response.data?.id,
    event: response.data,
  });
  
  return response;
};

// Update event
export const updateEvent = async (id: string, data: UpdateEventData) => {
  return apiClient.put<Event>(`/events/${id}`, data);
};

// Delete event
export const deleteEvent = async (id: string) => {
  return apiClient.delete(`/events/${id}`);
};

/**
 * Calcula o status efetivo de inscrições do evento
 * - Se modo automático está ativado, calcula baseado nas datas
 * - Se modo automático está desativado, usa o status manual
 * - Se ambos são NULL, retorna NULL (usa lógica antiga)
 */
export function getEffectiveRegistrationStatus(event: Event): EventRegistrationStatus | null {
  // Se modo automático está ativado, calcular baseado nas datas
  if (event.registration_auto_mode && event.registration_start_date && event.registration_end_date) {
    const now = new Date();
    const startDate = new Date(event.registration_start_date);
    const endDate = new Date(event.registration_end_date);
    
    if (now < startDate) {
      return 'not_open';
    } else if (now >= startDate && now <= endDate) {
      return 'open';
    } else {
      return 'closed';
    }
  }
  
  // Caso contrário, usar status manual
  return event.registration_status || null;
}

