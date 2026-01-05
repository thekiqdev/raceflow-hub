import { apiClient } from './client.js';

export interface KitPickupLocation {
  id: string;
  event_id: string;
  address: string;
  pickup_date: string;
  latitude?: number | null;
  longitude?: number | null;
  created_at?: string;
}

// Get all pickup locations for an event
export const getEventPickupLocations = async (eventId: string) => {
  return apiClient.get<KitPickupLocation[]>(`/events/${eventId}/pickup-locations`);
};

export interface CreatePickupLocationData {
  address: string;
  pickup_date: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface UpdatePickupLocationData {
  address?: string;
  pickup_date?: string;
  latitude?: number | null;
  longitude?: number | null;
}

// Create a new pickup location for an event
export const createPickupLocation = async (eventId: string, data: CreatePickupLocationData) => {
  return apiClient.post<KitPickupLocation>(`/events/${eventId}/pickup-locations`, data);
};

// Update a pickup location
export const updatePickupLocation = async (eventId: string, locationId: string, data: UpdatePickupLocationData) => {
  return apiClient.put<KitPickupLocation>(`/events/${eventId}/pickup-locations/${locationId}`, data);
};

// Delete a pickup location
export const deletePickupLocation = async (eventId: string, locationId: string) => {
  return apiClient.delete(`/events/${eventId}/pickup-locations/${locationId}`);
};

