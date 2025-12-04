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



