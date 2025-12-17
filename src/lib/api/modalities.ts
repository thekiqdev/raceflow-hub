import { apiClient } from './client.js';

export interface Modality {
  id: string;
  event_id: string;
  name: string;
  distance: string;
  created_at: string;
  updated_at: string;
}

export interface CreateModalityData {
  event_id: string;
  name: string;
  distance: string;
}

export interface UpdateModalityData {
  name?: string;
  distance?: string;
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

