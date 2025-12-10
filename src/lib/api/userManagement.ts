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

/**
 * Get user profile by ID (admin)
 */
export const getUserProfileById = async (userId: string): Promise<{
  success: boolean;
  data?: {
    id: string;
    full_name: string;
    email: string;
    cpf?: string;
    phone: string;
    gender?: string;
    birth_date?: string;
    status: string;
    role?: string;
  };
  error?: string;
}> => {
  return apiClient.get(`/admin/users/${userId}/profile`);
};

/**
 * Update user profile (admin)
 */
export const updateUserProfile = async (userId: string, data: {
  full_name?: string;
  phone?: string;
  gender?: string;
  birth_date?: string;
  status?: 'active' | 'pending' | 'blocked';
  role?: 'admin' | 'organizer' | 'runner';
}): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> => {
  return apiClient.put(`/admin/users/${userId}/profile`, data);
};

/**
 * Delete user (admin) - soft delete
 */
export const deleteUser = async (userId: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> => {
  return apiClient.delete(`/admin/users/${userId}`);
};

/**
 * Hard delete user profile (admin) - permanently deletes user and all related data
 * WARNING: This is a destructive operation that cannot be undone
 */
export const hardDeleteUserProfile = async (userId: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> => {
  return apiClient.delete(`/admin/users/${userId}/hard-delete`);
};

/**
 * Generate random password
 */
export const generateRandomPassword = (length: number = 12): string => {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
};

/**
 * Convert athlete to organizer
 */
export const convertAthleteToOrganizer = async (userId: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> => {
  return apiClient.post(`/admin/users/${userId}/convert-to-organizer`, {});
};

