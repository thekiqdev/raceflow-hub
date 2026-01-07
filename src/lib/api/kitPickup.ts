import { apiClient } from './client.js';

export interface PickupTimeSlot {
  start_time: string; // HH:MM format
  end_time: string; // HH:MM format
}

export interface PickupScheduleItem {
  date: string; // YYYY-MM-DD format
  time_slots: PickupTimeSlot[];
}

export interface KitPickupLocation {
  id: string;
  event_id: string;
  name?: string | null;
  address: string;
  pickup_date: string; // Kept for backward compatibility
  pickup_schedule?: PickupScheduleItem[]; // New: multiple dates and time slots
  latitude?: number | null;
  longitude?: number | null;
  created_at?: string;
}

// Get all pickup locations for an event
export const getEventPickupLocations = async (eventId: string) => {
  return apiClient.get<KitPickupLocation[]>(`/events/${eventId}/pickup-locations`);
};

export interface CreatePickupLocationData {
  name?: string | null;
  address: string;
  pickup_date?: string; // Kept for backward compatibility
  pickup_schedule?: PickupScheduleItem[]; // New: multiple dates and time slots
  latitude?: number | null;
  longitude?: number | null;
}

export interface UpdatePickupLocationData {
  name?: string | null;
  address?: string;
  pickup_date?: string; // Kept for backward compatibility
  pickup_schedule?: PickupScheduleItem[]; // New: multiple dates and time slots
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

