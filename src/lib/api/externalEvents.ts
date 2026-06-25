import { apiClient } from './client.js';
import type { Event } from './events.js';

export interface CreateExternalEventData {
  organizer_id: string;
  title: string;
  event_date: string;
  banner_url: string;
  external_url: string;
  status?: 'draft' | 'published' | 'ongoing' | 'finished' | 'cancelled';
}

export interface UpdateExternalEventData {
  organizer_id?: string;
  title?: string;
  event_date?: string;
  banner_url?: string;
  external_url?: string;
  status?: 'draft' | 'published' | 'ongoing' | 'finished' | 'cancelled';
}

export const createExternalEvent = async (data: CreateExternalEventData) => {
  return apiClient.post<Event>('/admin/events/external', data);
};

export const updateExternalEvent = async (eventId: string, data: UpdateExternalEventData) => {
  return apiClient.put<Event>(`/admin/events/external/${eventId}`, data);
};

export const getExternalEvent = async (eventId: string) => {
  return apiClient.get<Event>(`/admin/events/external/${eventId}`);
};
