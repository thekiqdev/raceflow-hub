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
  display_order: number;
  is_visible?: boolean;
  deleted_at?: string | null;
  created_at?: string;
  products?: KitProduct[];
  category_ids?: string[]; // IDs das categorias associadas ao kit (opcional para compatibilidade retroativa)
}

export type EventKitsContext = 'public' | 'management';

export interface GetEventKitsParams {
  categoryId?: string;
  context?: EventKitsContext;
}

function buildEventKitsQuery(params?: GetEventKitsParams | string): string {
  let categoryId: string | undefined;
  let context: EventKitsContext | undefined;

  if (typeof params === 'string') {
    categoryId = params;
  } else if (params) {
    categoryId = params.categoryId;
    context = params.context;
  }

  const searchParams = new URLSearchParams();
  if (categoryId) searchParams.set('category_id', categoryId);
  if (context) searchParams.set('context', context);

  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

// Get all kits for an event
// @param eventId - ID of the event
// @param params - categoryId and/or context (public | management), or legacy categoryId string
export const getEventKits = async (eventId: string, params?: GetEventKitsParams | string) => {
  return apiClient.get<EventKit[]>(`/events/${eventId}/kits${buildEventKitsQuery(params)}`);
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
  display_order?: number; // Opcional na criação - será calculado automaticamente se não fornecido
  category_ids?: string[]; // IDs das categorias associadas ao kit (opcional)
  is_visible?: boolean;
  products?: SyncProductData[];
}

export const syncEventKits = async (eventId: string, kits: SyncKitData[]) => {
  return apiClient.post<EventKit[]>(`/events/${eventId}/kits`, { kits });
};

// Reorder event kits for an event
export interface ReorderEventKitsData {
  kitOrders: Array<{ id: string; display_order: number }>;
}

export const reorderEventKits = async (eventId: string, data: ReorderEventKitsData) => {
  return apiClient.put<void>(`/events/${eventId}/kits/reorder`, data);
};
