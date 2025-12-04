import { apiClient } from './client.js';

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


