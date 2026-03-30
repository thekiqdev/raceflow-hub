import { apiClient } from './client.js';

export interface RegisterData {
  email: string;
  password: string;
  full_name: string;
  cpf: string;
  phone: string;
  gender?: 'M' | 'F';
  birth_date: string;
  /** JWT de POST /auth/lookup-cpf (obrigatório quando CPF Brasil está ativo no servidor). */
  cpf_lookup_proof?: string;
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
  lgpd_consent: boolean;
  referral_code?: string;
}

export interface LoginData {
  /** E-mail ou CPF (corpo JSON: `email` por compatibilidade com clientes antigos). */
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

/** Dados retornados pelo lookup (CPF Brasil). */
export interface LookupCpfData {
  cpf: string;
  full_name: string;
  birth_date: string;
  gender: string;
}

export interface LookupCpfResponseBody {
  success: boolean;
  data?: LookupCpfData;
  proof?: string;
  message?: string;
  code?: string;
  meta?: { request_id?: string };
}

/** Consulta CPF no backend (chave da API só no servidor). Opcional `signal` para cancelar requisição anterior. */
export const lookupCpfRequest = async (cpf: string, signal?: AbortSignal) => {
  return apiClient.post<LookupCpfResponseBody>('/auth/lookup-cpf', { cpf }, { signal });
};

/** Verifica se o CPF já tem cadastro na Cronoteam (mesmo rate limit que lookup-cpf). */
export const checkCpfRegisteredRequest = async (cpf: string, signal?: AbortSignal) => {
  return apiClient.post<{ registered: boolean }>(
    '/auth/check-cpf-registered',
    { cpf },
    { signal }
  );
};

/** Fase 6: flags públicas (sem segredos) para alinhar UX de cadastro. */
export interface CpfRegistrationConfig {
  registration_requires_lookup_proof: boolean;
  cpf_brasil_integration_configured: boolean;
  cpf_brasil_enabled: boolean;
}

export const getCpfRegistrationConfig = async () => {
  return apiClient.get<CpfRegistrationConfig>('/auth/cpf-registration-config');
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





