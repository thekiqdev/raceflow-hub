import { apiClient } from './client.js';

export interface OrganizerSettings {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  logo_url?: string | null;
  organization_name?: string;
  contact_email?: string;
  contact_phone?: string;
  bio?: string;
  website_url?: string;
}

export interface UpdateOrganizerSettingsData {
  full_name?: string;
  phone?: string;
  logo_url?: string | null;
  organization_name?: string;
  contact_email?: string;
  contact_phone?: string;
  bio?: string;
  website_url?: string;
}

// Get organizer settings
export const getOrganizerSettings = async () => {
  return apiClient.get<OrganizerSettings>('/organizer/settings');
};

// Update organizer settings
export const updateOrganizerSettings = async (data: UpdateOrganizerSettingsData) => {
  return apiClient.put<OrganizerSettings>('/organizer/settings', data);
};




