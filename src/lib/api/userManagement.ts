import { apiClient } from './client.js';

export interface UserWithStats {
  id: string;
  name: string;
  email: string;
  cpf?: string;
  phone: string;
  status: string;
  events?: number;
  registrations?: number;
  revenue?: number;
  role?: string;
  created_at: string;
}

export interface CreateAdminData {
  email: string;
  password: string;
  full_name: string;
  phone: string;
  role?: 'admin';
}

/**
 * Get all organizers with statistics
 */
export const getOrganizers = async (searchTerm?: string): Promise<{
  success: boolean;
  data?: UserWithStats[];
  error?: string;
  message?: string;
}> => {
  const query = searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : '';
  return apiClient.get<UserWithStats[]>(`/admin/users/organizers${query}`);
};

/**
 * Get all athletes with statistics
 */
export const getAthletes = async (searchTerm?: string): Promise<{
  success: boolean;
  data?: UserWithStats[];
  error?: string;
  message?: string;
}> => {
  const query = searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : '';
  return apiClient.get<UserWithStats[]>(`/admin/users/athletes${query}`);
};

/**
 * Get all admins
 */
export const getAdmins = async (): Promise<{
  success: boolean;
  data?: UserWithStats[];
  error?: string;
  message?: string;
}> => {
  return apiClient.get<UserWithStats[]>('/admin/users/admins');
};

/**
 * Get user by ID
 */
export const getUserById = async (userId: string): Promise<{
  success: boolean;
  data?: UserWithStats;
  error?: string;
  message?: string;
}> => {
  return apiClient.get<UserWithStats>(`/admin/users/${userId}`);
};

/**
 * Update user status
 */
export const updateUserStatus = async (userId: string, status: 'active' | 'pending' | 'blocked'): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> => {
  return apiClient.put(`/admin/users/${userId}/status`, { status });
};

/**
 * Approve organizer
 */
export const approveOrganizer = async (userId: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> => {
  return apiClient.post(`/admin/users/${userId}/approve`, {});
};

/**
 * Block user
 */
export const blockUser = async (userId: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> => {
  return apiClient.post(`/admin/users/${userId}/block`, {});
};

/**
 * Unblock user
 */
export const unblockUser = async (userId: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> => {
  return apiClient.post(`/admin/users/${userId}/unblock`, {});
};

/**
 * Reset user password
 */
export const resetUserPassword = async (userId: string, newPassword: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> => {
  return apiClient.post(`/admin/users/${userId}/reset-password`, { newPassword });
};

/**
 * Create new admin
 */
export const createAdmin = async (data: CreateAdminData): Promise<{
  success: boolean;
  data?: { id: string };
  message?: string;
  error?: string;
}> => {
  return apiClient.post<{ id: string }>('/admin/users/admins', data);
};

