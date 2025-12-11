import { apiClient } from './client.js';

export interface SystemSettings {
  id: string;
  platform_name: string;
  platform_logo_url?: string;
  platform_favicon_url?: string;
  contact_email?: string;
  contact_phone?: string;
  support_email?: string;
  support_phone?: string;
  company_address?: string;
  company_city?: string;
  company_state?: string;
  company_zip?: string;
  company_country: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_user?: string;
  smtp_password?: string;
  smtp_from_email?: string;
  smtp_from_name?: string;
  smtp_secure: boolean;
  payment_gateway: string;
  payment_test_mode: boolean;
  payment_public_key?: string;
  payment_secret_key?: string;
  enabled_modules: Record<string, boolean>;
  transfer_fee?: number;
  maintenance_mode: boolean;
  maintenance_message?: string;
  timezone: string;
  date_format: string;
  time_format: string;
  currency: string;
  language: string;
  created_at: string;
  updated_at: string;
}

export interface UpdateSystemSettingsData {
  platform_name?: string;
  platform_logo_url?: string | null;
  platform_favicon_url?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  support_email?: string | null;
  support_phone?: string | null;
  company_address?: string | null;
  company_city?: string | null;
  company_state?: string | null;
  company_zip?: string | null;
  company_country?: string;
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_user?: string | null;
  smtp_password?: string | null;
  smtp_from_email?: string | null;
  smtp_from_name?: string | null;
  smtp_secure?: boolean;
  payment_gateway?: string;
  payment_test_mode?: boolean;
  payment_public_key?: string | null;
  payment_secret_key?: string | null;
  enabled_modules?: Record<string, boolean>;
  transfer_fee?: number;
  maintenance_mode?: boolean;
  maintenance_message?: string | null;
  timezone?: string;
  date_format?: string;
  time_format?: string;
  currency?: string;
  language?: string;
}

/**
 * Get system settings
 */
export const getSystemSettings = async (): Promise<{
  success: boolean;
  data?: SystemSettings;
  error?: string;
  message?: string;
}> => {
  return apiClient.get<SystemSettings>('/admin/settings');
};

/**
 * Update system settings
 */
export const updateSystemSettings = async (data: UpdateSystemSettingsData): Promise<{
  success: boolean;
  data?: SystemSettings;
  message?: string;
  error?: string;
}> => {
  return apiClient.put<SystemSettings>('/admin/settings', data);
};




