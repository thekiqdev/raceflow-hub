import { apiClient } from './client.js';

export interface SupportTicket {
  id: string;
  user_id: string;
  user_name?: string;
  user_type?: string;
  subject: string;
  message: string;
  status: string;
  priority: string;
  category?: string;
  assigned_to?: string;
  assigned_to_name?: string;
  messages_count?: number;
  created_at: string;
  updated_at: string;
  closed_at?: string;
}

export interface SupportTicketMessage {
  id: string;
  ticket_id: string;
  user_id: string;
  user_name?: string;
  message: string;
  is_internal: boolean;
  created_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  target_audience: string;
  status: string;
  scheduled_at?: string;
  published_at?: string;
  created_by?: string;
  created_by_name?: string;
  reads_count?: number;
  created_at: string;
  updated_at: string;
}

export interface UpdateTicketStatusData {
  status: 'aberto' | 'em_analise' | 'respondido' | 'resolvido' | 'fechado';
  assigned_to?: string | null;
}

export interface AddTicketMessageData {
  message: string;
  is_internal?: boolean;
}

export interface CreateAnnouncementData {
  title: string;
  content: string;
  target_audience: 'all' | 'runners' | 'organizers' | 'admins';
  status: 'draft' | 'scheduled' | 'published' | 'archived';
  scheduled_at?: string | null;
}

export interface UpdateAnnouncementData {
  title?: string;
  content?: string;
  target_audience?: 'all' | 'runners' | 'organizers' | 'admins';
  status?: 'draft' | 'scheduled' | 'published' | 'archived';
  scheduled_at?: string | null;
}

/**
 * Get all support tickets
 */
export const getSupportTickets = async (filters?: {
  status?: string;
  priority?: string;
  search?: string;
  assigned_to?: string;
}): Promise<{
  success: boolean;
  data?: SupportTicket[];
  error?: string;
}> => {
  const queryParams = new URLSearchParams();
  if (filters?.status) queryParams.append('status', filters.status);
  if (filters?.priority) queryParams.append('priority', filters.priority);
  if (filters?.search) queryParams.append('search', filters.search);
  if (filters?.assigned_to) queryParams.append('assigned_to', filters.assigned_to);

  const queryString = queryParams.toString();
  const endpoint = `/admin/support/tickets${queryString ? `?${queryString}` : ''}`;

  return apiClient.get<SupportTicket[]>(endpoint);
};

/**
 * Get ticket by ID
 */
export const getTicketById = async (ticketId: string): Promise<{
  success: boolean;
  data?: SupportTicket;
  error?: string;
}> => {
  return apiClient.get<SupportTicket>(`/admin/support/tickets/${ticketId}`);
};

/**
 * Get ticket messages
 */
export const getTicketMessages = async (ticketId: string): Promise<{
  success: boolean;
  data?: SupportTicketMessage[];
  error?: string;
}> => {
  return apiClient.get<SupportTicketMessage[]>(`/admin/support/tickets/${ticketId}/messages`);
};

/**
 * Update ticket status
 */
export const updateTicketStatus = async (
  ticketId: string,
  data: UpdateTicketStatusData
): Promise<{
  success: boolean;
  data?: SupportTicket;
  message?: string;
  error?: string;
}> => {
  return apiClient.put<SupportTicket>(`/admin/support/tickets/${ticketId}/status`, data);
};

/**
 * Add message to ticket
 */
export const addTicketMessage = async (
  ticketId: string,
  data: AddTicketMessageData
): Promise<{
  success: boolean;
  data?: SupportTicketMessage;
  message?: string;
  error?: string;
}> => {
  return apiClient.post<SupportTicketMessage>(`/admin/support/tickets/${ticketId}/messages`, data);
};

/**
 * Get all announcements
 */
export const getAnnouncements = async (filters?: {
  status?: string;
  target_audience?: string;
}): Promise<{
  success: boolean;
  data?: Announcement[];
  error?: string;
}> => {
  const queryParams = new URLSearchParams();
  if (filters?.status) queryParams.append('status', filters.status);
  if (filters?.target_audience) queryParams.append('target_audience', filters.target_audience);

  const queryString = queryParams.toString();
  const endpoint = `/admin/support/announcements${queryString ? `?${queryString}` : ''}`;

  return apiClient.get<Announcement[]>(endpoint);
};

/**
 * Create announcement
 */
export const createAnnouncement = async (data: CreateAnnouncementData): Promise<{
  success: boolean;
  data?: Announcement;
  message?: string;
  error?: string;
}> => {
  return apiClient.post<Announcement>('/admin/support/announcements', data);
};

/**
 * Update announcement
 */
export const updateAnnouncement = async (
  announcementId: string,
  data: UpdateAnnouncementData
): Promise<{
  success: boolean;
  data?: Announcement;
  message?: string;
  error?: string;
}> => {
  return apiClient.put<Announcement>(`/admin/support/announcements/${announcementId}`, data);
};

/**
 * Delete announcement
 */
export const deleteAnnouncement = async (announcementId: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> => {
  return apiClient.delete(`/admin/support/announcements/${announcementId}`);
};




