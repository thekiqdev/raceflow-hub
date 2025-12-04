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




