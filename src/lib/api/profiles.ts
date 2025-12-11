import { apiClient } from './client.js';

export interface Profile {
  id: string;
  full_name: string;
  cpf: string;
  phone: string;
  email?: string; // Email from users table (for public profile search)
  gender?: string;
  birth_date: string;
  lgpd_consent?: boolean;
  is_public?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface UpdateProfileData {
  full_name?: string;
  phone?: string;
  gender?: string;
  birth_date?: string;
  is_public?: boolean;
}

// Get own profile
export const getOwnProfile = async () => {
  return apiClient.get<Profile>('/profiles/me');
};

// Update own profile
export const updateOwnProfile = async (data: UpdateProfileData) => {
  return apiClient.put<Profile>('/profiles/me', data);
};

// Get public profile by CPF (for registration by others)
export const getPublicProfileByCpf = async (cpf: string) => {
  // Build query string manually like other API functions
  const queryParams = new URLSearchParams();
  queryParams.append('cpf', cpf);
  const queryString = queryParams.toString();
  const endpoint = `/profiles/search-by-cpf${queryString ? `?${queryString}` : ''}`;
  
  return apiClient.get<Profile>(endpoint);
};





