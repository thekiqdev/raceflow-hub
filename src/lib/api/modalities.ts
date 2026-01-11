import { apiClient } from './client.js';

export interface Modality {
  id: string;
  event_id: string;
  name: string;
  distance: string;
  display_order: number;
  max_participants: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateModalityData {
  event_id: string;
  name: string;
  distance: string;
  display_order?: number; // Opcional na criação - será calculado automaticamente se não fornecido
  max_participants?: number | null; // Limite máximo de participantes (NULL = sem limite)
}

export interface UpdateModalityData {
  name?: string;
  distance?: string;
  display_order?: number; // Permite atualizar a ordem de exibição
  max_participants?: number | null; // Limite máximo de participantes (NULL = sem limite)
}

// Get all modalities for an event
export const getModalities = async (eventId: string) => {
  return apiClient.get<Modality[]>(`/modalities/event/${eventId}`);
};

// Get modality by ID
export const getModalityById = async (id: string) => {
  return apiClient.get<Modality>(`/modalities/${id}`);
};

// Create a new modality
export const createModality = async (data: CreateModalityData) => {
  return apiClient.post<Modality>('/modalities', data);
};

// Update a modality
export const updateModality = async (id: string, data: UpdateModalityData) => {
  return apiClient.put<Modality>(`/modalities/${id}`, data);
};

// Delete a modality
export const deleteModality = async (id: string) => {
  return apiClient.delete(`/modalities/${id}`);
};

// Reorder modalities for an event
export interface ReorderModalitiesData {
  modalityOrders: Array<{ id: string; display_order: number }>;
}

export const reorderModalities = async (eventId: string, data: ReorderModalitiesData) => {
  return apiClient.put<void>(`/modalities/events/${eventId}/reorder`, data);
};

