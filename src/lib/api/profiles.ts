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
  preferred_name?: string;
  profession?: string;
  cbat?: string;
  team?: string;
  postal_code?: string;
  street?: string;
  address_number?: string;
  address_complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  created_at?: string;
  updated_at?: string;
}

export interface UpdateProfileData {
  full_name?: string;
  phone?: string;
  gender?: string;
  birth_date?: string;
  preferred_name?: string;
  profession?: string;
  cbat?: string;
  team?: string;
  postal_code?: string;
  street?: string;
  address_number?: string;
  address_complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  is_public?: boolean;
  cpf?: string;
  password?: string; // Required when runner updates CPF
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
export const getPublicProfileByCpf = async (cpf: string, signal?: AbortSignal) => {
  const queryParams = new URLSearchParams();
  queryParams.append('cpf', cpf);
  const queryString = queryParams.toString();
  const endpoint = `/profiles/search-by-cpf${queryString ? `?${queryString}` : ''}`;

  return apiClient.get<Profile>(endpoint, { signal });
};

/** Busca atleta por CPF para inscrição pelo organizador (não exige perfil público). Requer papel organizer ou admin. */
export const getRunnerProfileByCpfForOrganizer = async (cpf: string, signal?: AbortSignal) => {
  const queryParams = new URLSearchParams();
  queryParams.append('cpf', cpf);
  const queryString = queryParams.toString();
  const endpoint = `/profiles/organizer/search-by-cpf${queryString ? `?${queryString}` : ''}`;

  return apiClient.get<Profile>(endpoint, { signal });
};





