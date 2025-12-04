import { apiClient } from './client.js';

export interface HomePageSettings {
  id: string;
  hero_title: string;
  hero_subtitle?: string;
  hero_image_url?: string;
  whatsapp_number?: string;
  whatsapp_text?: string;
  consultoria_title?: string;
  consultoria_description?: string;
  stats_events?: string;
  stats_events_label?: string;
  stats_runners?: string;
  stats_runners_label?: string;
  stats_cities?: string;
  stats_cities_label?: string;
  stats_years?: string;
  stats_years_label?: string;
  created_at?: string;
  updated_at?: string;
}

export interface UpdateHomePageSettingsData {
  hero_title?: string;
  hero_subtitle?: string;
  hero_image_url?: string;
  whatsapp_number?: string;
  whatsapp_text?: string;
  consultoria_title?: string;
  consultoria_description?: string;
  stats_events?: string;
  stats_events_label?: string;
  stats_runners?: string;
  stats_runners_label?: string;
  stats_cities?: string;
  stats_cities_label?: string;
  stats_years?: string;
  stats_years_label?: string;
}

// Get home page settings
export const getHomePageSettings = async () => {
  return apiClient.get<HomePageSettings>('/home-page-settings');
};

// Update home page settings (admin only)
export const updateHomePageSettings = async (data: UpdateHomePageSettingsData) => {
  return apiClient.put<HomePageSettings>('/home-page-settings', data);
};





