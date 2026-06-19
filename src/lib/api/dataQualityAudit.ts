import { apiClient } from './client.js';

export type QualityHealthLevel = 'excellent' | 'good' | 'attention' | 'critical';

export interface ProfileQualityOverview {
  period_days: number;
  total_rejections: number;
  invalid_full_name: number;
  invalid_phone: number;
  invalid_postal_code: number;
  invalid_city: number;
  invalid_neighborhood: number;
  invalid_birth_date: number;
  invalid_gender: number;
  invalid_email: number;
  total_validations: number;
  rejection_rate_pct: number;
  quality_status: QualityHealthLevel;
}

export interface ProfileQualityDailyRow {
  day: string;
  rejections: number;
  total: number;
}

export interface ProfileQualityTopErrorRow {
  code: string;
  count: number;
}

export interface ProfileQualityBySourceRow {
  source: string;
  count: number;
  pct: number;
}

export const getProfileQualityOverview = async (days = 30) => {
  return apiClient.get<ProfileQualityOverview>(`/admin/audit/data-quality/overview?days=${days}`);
};

export const getProfileQualityDaily = async (days = 30) => {
  return apiClient.get<ProfileQualityDailyRow[]>(`/admin/audit/data-quality/daily?days=${days}`);
};

export const getProfileQualityTopErrors = async (days = 30) => {
  return apiClient.get<ProfileQualityTopErrorRow[]>(`/admin/audit/data-quality/top-errors?days=${days}`);
};

export const getProfileQualityBySource = async (days = 30) => {
  return apiClient.get<ProfileQualityBySourceRow[]>(`/admin/audit/data-quality/by-source?days=${days}`);
};
