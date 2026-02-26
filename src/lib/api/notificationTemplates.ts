import { apiClient } from './client.js';

export interface NotificationTemplate {
  id: string;
  template_key: string;
  template_name: string;
  template_type: 'email' | 'sms' | 'push' | 'in_app';
  target_audience: 'admin' | 'organizer' | 'runner' | 'all';
  subject?: string | null;
  body_html?: string | null;
  body_text?: string | null;
  variables: Record<string, any>;
  is_active: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateNotificationTemplateData {
  template_key: string;
  template_name: string;
  template_type: 'email' | 'sms' | 'push' | 'in_app';
  target_audience: 'admin' | 'organizer' | 'runner' | 'all';
  subject?: string | null;
  body_html?: string | null;
  body_text?: string | null;
  variables?: Record<string, any>;
  is_active?: boolean;
  is_system?: boolean;
}

export interface UpdateNotificationTemplateData {
  template_name?: string;
  template_type?: 'email' | 'sms' | 'push' | 'in_app';
  target_audience?: 'admin' | 'organizer' | 'runner' | 'all';
  subject?: string | null;
  body_html?: string | null;
  body_text?: string | null;
  variables?: Record<string, any>;
  is_active?: boolean;
}

export interface GetNotificationTemplatesFilters {
  template_type?: 'email' | 'sms' | 'push' | 'in_app';
  target_audience?: 'admin' | 'organizer' | 'runner' | 'all';
  is_active?: boolean;
}

/**
 * Get all notification templates with optional filters
 */
export const getNotificationTemplates = async (filters?: GetNotificationTemplatesFilters) => {
  const queryParams = new URLSearchParams();
  
  if (filters?.template_type) {
    queryParams.append('template_type', filters.template_type);
  }
  if (filters?.target_audience) {
    queryParams.append('target_audience', filters.target_audience);
  }
  if (filters?.is_active !== undefined) {
    queryParams.append('is_active', filters.is_active.toString());
  }

  const queryString = queryParams.toString();
  const endpoint = `/notification-templates${queryString ? `?${queryString}` : ''}`;
  
  return apiClient.get<NotificationTemplate[]>(endpoint);
};

/**
 * Get notification template by ID
 */
export const getNotificationTemplateById = async (id: string) => {
  return apiClient.get<NotificationTemplate>(`/notification-templates/${id}`);
};

/**
 * Get notification template by key
 */
export const getNotificationTemplateByKey = async (templateKey: string) => {
  return apiClient.get<NotificationTemplate>(`/notification-templates/key/${templateKey}`);
};

/**
 * Create a new notification template
 */
export const createNotificationTemplate = async (data: CreateNotificationTemplateData) => {
  return apiClient.post<NotificationTemplate>('/notification-templates', data);
};

/**
 * Update notification template
 */
export const updateNotificationTemplate = async (id: string, data: UpdateNotificationTemplateData) => {
  return apiClient.put<NotificationTemplate>(`/notification-templates/${id}`, data);
};

/**
 * Delete notification template
 */
export const deleteNotificationTemplate = async (id: string) => {
  return apiClient.delete(`/notification-templates/${id}`);
};

/**
 * Initialize default templates
 */
export const initializeDefaultTemplates = async () => {
  return apiClient.post('/notification-templates/initialize', {});
};

