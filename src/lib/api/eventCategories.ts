import { apiClient } from './client.js';

export interface CategoryBatch {
  id: string;
  category_id: string;
  price: number;
  valid_from: string | null;
  created_at?: string;
}

export interface EventCategory {
  id: string;
  event_id: string;
  name: string;
  distance: string;
  price: number;
  max_participants: number | null;
  created_at?: string;
  current_registrations?: number;
  available_spots?: number;
  batches?: CategoryBatch[];
}

// Get all categories for an event
export const getEventCategories = async (eventId: string) => {
  console.log('📡 getEventCategories called with eventId:', eventId);
  const response = await apiClient.get<EventCategory[]>(`/events/${eventId}/categories`);
  console.log('📡 getEventCategories response:', {
    success: response.success,
    dataLength: response.data?.length || 0,
    data: response.data,
    error: response.error,
  });
  return response;
};

// Sync (create/update/delete) categories for an event
export interface SyncCategoryBatch {
  id?: string;
  price: number;
  valid_from: string;
}

export interface SyncCategoryData {
  id?: string;
  name: string;
  distance: string;
  price: number;
  max_participants?: number | null;
  batches?: SyncCategoryBatch[];
}

export const syncEventCategories = async (eventId: string, categories: SyncCategoryData[]) => {
  return apiClient.post<EventCategory[]>(`/events/${eventId}/categories`, { categories });
};

