import { apiClient } from './client.js';

export interface RegisterData {
  email: string;
  password: string;
  full_name: string;
  cpf: string;
  phone: string;
  gender?: 'M' | 'F';
  birth_date: string;
  preferred_name?: string;
  postal_code?: string;
  street?: string;
  address_number?: string;
  address_complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  lgpd_consent: boolean;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface User {
  id: string;
  email: string;
  email_verified: boolean;
  profile: {
    id: string;
    full_name: string;
    cpf: string;
    phone: string;
    gender?: string;
    birth_date?: string;
  } | null;
  roles: string[];
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    profile: {
      id: string;
      full_name: string;
      cpf: string;
      phone: string;
    };
    roles: string[];
  };
  token: string;
}

// Register new user
export const register = async (data: RegisterData) => {
  return apiClient.post<AuthResponse>('/auth/register', data);
};

// Login user
export const login = async (data: LoginData) => {
  return apiClient.post<AuthResponse>('/auth/login', data);
};

// Get current user
export const getCurrentUser = async () => {
  return apiClient.get<User>('/auth/me');
};

// Logout user
export const logout = async () => {
  return apiClient.post('/auth/logout');
};





