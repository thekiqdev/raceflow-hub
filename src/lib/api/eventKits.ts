import { apiClient } from './client.js';

export interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  variant_group_name?: string | null;
  available_quantity?: number | null;
  sku?: string | null;
  price?: number | null;
  created_at?: string;
}

export interface KitProduct {
  id: string;
  kit_id: string;
  name: string;
  description: string | null;
  type: 'variable' | 'unique';
  image_url: string | null;
  variant_attributes?: string[] | null;
  created_at?: string;
  variants?: ProductVariant[];
}

export interface EventKit {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  price: number;
  created_at?: string;
  products?: KitProduct[];
}

// Get all kits for an event
export const getEventKits = async (eventId: string) => {
  return apiClient.get<EventKit[]>(`/events/${eventId}/kits`);
};

// Sync (create/update/delete) kits for an event
export interface SyncVariantData {
  id?: string;
  name: string;
  variant_group_name?: string | null;
  available_quantity?: number | null;
  sku?: string | null;
  price?: number | null;
}

export interface SyncProductData {
  id?: string;
  name: string;
  description?: string | null;
  type: 'variable' | 'unique';
  image_url?: string | null;
  variant_attributes?: string[] | null;
  variants?: SyncVariantData[];
}

export interface SyncKitData {
  id?: string;
  name: string;
  description?: string | null;
  price: number;
  products?: SyncProductData[];
}

export const syncEventKits = async (eventId: string, kits: SyncKitData[]) => {
  return apiClient.post<EventKit[]>(`/events/${eventId}/kits`, { kits });
};

