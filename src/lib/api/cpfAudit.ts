import { apiClient } from './client.js';

export type ProviderHealthLevel = 'excellent' | 'good' | 'attention' | 'critical';

export interface CpfAuditOverview {
  CPF_LOOKUP_OK: number;
  CPF_NOT_IN_REGISTRY: number;
  LOCAL_INVALID_FORMAT: number;
  EXTERNAL_TIMEOUT: number;
  EXTERNAL_QUOTA: number;
  EXTERNAL_AUTH: number;
  EXTERNAL_PLAN: number;
  EXTERNAL_BAD_RESPONSE: number;
  RATE_LIMITED: number;
  total_lookups: number;
  api_success_rate_pct: number;
  manual_count: number;
  manual_pct: number;
  provider_health: ProviderHealthLevel;
  period_days: number;
}

export interface CpfAuditDailyRow {
  day: string;
  success: number;
  manual: number;
  invalid: number;
  timeout: number;
  total: number;
}

export interface CpfAuditRecentError {
  created_at: string;
  result_code: string;
  request_id: string | null;
  source: string;
  provider: string | null;
}

export const getCpfAuditOverview = async (days = 30) => {
  return apiClient.get<CpfAuditOverview>(`/admin/audit/cpf/overview?days=${days}`);
};

export const getCpfAuditDaily = async (days = 30) => {
  return apiClient.get<CpfAuditDailyRow[]>(`/admin/audit/cpf/daily?days=${days}`);
};

export const getCpfRecentErrors = async (limit = 50) => {
  return apiClient.get<CpfAuditRecentError[]>(`/admin/audit/cpf/recent-errors?limit=${limit}`);
};
