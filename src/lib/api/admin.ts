import { apiClient } from './client.js';

export interface DashboardStats {
  active_events: number;
  pending_events: number;
  total_runners: number;
  new_runners_this_month: number;
  active_organizers: number;
  pending_organizers: number;
  total_revenue: number;
  previous_month_revenue: number;
  total_registrations: number;
  total_commissions: number;
  finished_events: number;
  revenue_change_percentage?: number;
  /** OK Etapa 4: Taxa de inscrição (soma em inscrições pagas) */
  platform_fee_revenue?: number;
  /** OK Etapa 4: Taxa de atualização (soma em inscrições pagas) */
  registration_edit_fee_revenue?: number;
  /** OK Etapa 4: Total taxas da plataforma */
  total_platform_fees?: number;
}

export interface ChartDataPoint {
  month: string;
  month_key: string;
  value: number;
}

export interface ChartData {
  registrations: ChartDataPoint[];
  revenue: ChartDataPoint[];
}

/**
 * Get dashboard statistics
 */
export const getDashboardStats = async (): Promise<{
  success: boolean;
  data?: DashboardStats;
  error?: string;
  message?: string;
}> => {
  return apiClient.get<DashboardStats>('/admin/dashboard/stats');
};

/**
 * Get chart data for dashboard
 */
export const getDashboardCharts = async (period: number = 6): Promise<{
  success: boolean;
  data?: ChartData;
  error?: string;
  message?: string;
}> => {
  return apiClient.get<ChartData>(`/admin/dashboard/charts?period=${period}`);
};

/** Fase 5: perfis com/sem validação CPF na fonte oficial (contas legadas). */
export interface CpfValidationOverview {
  total_profiles: number;
  validated_count: number;
  legacy_without_validation: number;
  validated_via_cpf_brasil: number;
  legacy_pct: number;
}

export const getCpfValidationOverview = async (): Promise<{
  success: boolean;
  data?: CpfValidationOverview;
  error?: string;
  message?: string;
}> => {
  return apiClient.get<CpfValidationOverview>('/admin/reports/cpf-validation-overview');
};

/** Fase 6: série diária de sucesso/falha em lookup CPF (cadastro). */
export interface CpfLookupMetricDayRow {
  day: string;
  success_count: number;
  failure_count: number;
  total: number;
  failure_rate_pct: number;
}

export interface CpfLookupMetricsSummary {
  days: CpfLookupMetricDayRow[];
  period_success: number;
  period_failure: number;
  period_total: number;
  period_failure_rate_pct: number;
}

export const getCpfLookupMetrics = async (
  days: number = 14
): Promise<{
  success: boolean;
  data?: CpfLookupMetricsSummary;
  error?: string;
  message?: string;
}> => {
  return apiClient.get<CpfLookupMetricsSummary>(`/admin/reports/cpf-lookup-metrics?days=${days}`);
};

/** Leader commission (generated record) - for admin remove commission */
export interface LeaderCommissionRecord {
  id: string;
  leader_id: string;
  registration_id: string;
  event_id: string;
  commission_amount: number;
  commission_percentage: number;
  registration_amount: number;
  status: 'pending' | 'paid' | 'cancelled';
  created_at?: string;
  paid_at?: string | null;
}

/**
 * Get the leader commission linked to a registration (admin only)
 */
export const getRegistrationCommission = async (registrationId: string) => {
  return apiClient.get<LeaderCommissionRecord>(`/admin/registrations/${registrationId}/commission`);
};

/**
 * Remove (cancel) a leader commission (admin only)
 */
export const removeCommission = async (commissionId: string) => {
  return apiClient.delete<LeaderCommissionRecord>(`/admin/commissions/${commissionId}`);
};
