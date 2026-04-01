import { apiClient, type ApiResponse } from './client.js';

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

export interface CreateManualRunnerData {
  email: string;
  password: string;
  full_name: string;
  cpf: string;
  phone: string;
  gender?: 'M' | 'F' | 'O' | null;
  birth_date: string;
  preferred_name?: string | null;
  profession?: string | null;
  cbat?: string | null;
  team?: string | null;
  postal_code?: string | null;
  street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  lgpd_consent: boolean;
}

export interface PaginatedUsersData {
  items: UserWithStats[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

function buildUserListQuery(
  basePath: '/admin/users/organizers' | '/admin/users/athletes' | '/admin/users/admins',
  searchTerm: string | undefined,
  pagination: { page: number; page_size: 30 | 50 } | undefined
): string {
  const q = new URLSearchParams();
  if (searchTerm) q.set('search', searchTerm);
  if (pagination) {
    q.set('page', String(pagination.page));
    q.set('page_size', String(pagination.page_size));
  }
  const qs = q.toString();
  return `${basePath}${qs ? `?${qs}` : ''}`;
}

export async function getOrganizers(
  searchTerm?: string,
  pagination?: undefined
): Promise<ApiResponse<UserWithStats[]>>;
export async function getOrganizers(
  searchTerm: string | undefined,
  pagination: { page: number; page_size: 30 | 50 }
): Promise<ApiResponse<PaginatedUsersData>>;
export async function getOrganizers(
  searchTerm?: string,
  pagination?: { page: number; page_size: 30 | 50 }
): Promise<ApiResponse<UserWithStats[] | PaginatedUsersData>> {
  const path = buildUserListQuery('/admin/users/organizers', searchTerm, pagination);
  if (pagination) {
    return apiClient.get<PaginatedUsersData>(path);
  }
  return apiClient.get<UserWithStats[]>(path);
}

export async function getAthletes(
  searchTerm?: string,
  pagination?: undefined
): Promise<ApiResponse<UserWithStats[]>>;
export async function getAthletes(
  searchTerm: string | undefined,
  pagination: { page: number; page_size: 30 | 50 }
): Promise<ApiResponse<PaginatedUsersData>>;
export async function getAthletes(
  searchTerm?: string,
  pagination?: { page: number; page_size: 30 | 50 }
): Promise<ApiResponse<UserWithStats[] | PaginatedUsersData>> {
  const path = buildUserListQuery('/admin/users/athletes', searchTerm, pagination);
  if (pagination) {
    return apiClient.get<PaginatedUsersData>(path);
  }
  return apiClient.get<UserWithStats[]>(path);
}

export async function getAdmins(
  pagination?: undefined
): Promise<ApiResponse<UserWithStats[]>>;
export async function getAdmins(
  pagination: { page: number; page_size: 30 | 50 }
): Promise<ApiResponse<PaginatedUsersData>>;
export async function getAdmins(
  pagination?: { page: number; page_size: 30 | 50 }
): Promise<ApiResponse<UserWithStats[] | PaginatedUsersData>> {
  const path = buildUserListQuery('/admin/users/admins', undefined, pagination);
  if (pagination) {
    return apiClient.get<PaginatedUsersData>(path);
  }
  return apiClient.get<UserWithStats[]>(path);
}

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

export const createManualRunner = async (data: CreateManualRunnerData): Promise<{
  success: boolean;
  data?: { id: string };
  message?: string;
  error?: string;
}> => {
  return apiClient.post<{ id: string }>('/admin/users/runners/manual', data);
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
  email?: string;
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

