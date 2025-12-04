import { apiClient } from './client';

export interface OrganizerDashboardStats {
  organizer_id: string;
  active_events: number;
  draft_events: number;
  finished_events: number;
  total_registrations: number;
  registrations_today: number;
  total_revenue: number;
  revenue_this_month: number;
}

export interface ChartDataPoint {
  date: string;
  count?: number;
  value?: number;
}

export interface GenderData {
  gender: string;
  count: number;
}

export interface ModalityData {
  name: string;
  count: number;
}

export interface TopEvent {
  event_id: string;
  title: string;
  registrations: number;
  revenue: number;
}

export interface OrganizerChartData {
  registrationsByDay: ChartDataPoint[];
  revenueByDay: ChartDataPoint[];
  genderData: GenderData[];
  modalityData: ModalityData[];
  topEvents: TopEvent[];
}

/**
 * Get dashboard statistics for the authenticated organizer
 */
export const getOrganizerDashboardStats = async (): Promise<{
  success: boolean;
  data?: OrganizerDashboardStats;
  error?: string;
  message?: string;
}> => {
  return apiClient.get<OrganizerDashboardStats>('/organizer/dashboard/stats');
};

/**
 * Get chart data for organizer dashboard
 * @param period - Number of days to fetch data for (default: 30)
 */
export const getOrganizerDashboardCharts = async (
  period: number = 30
): Promise<{
  success: boolean;
  data?: OrganizerChartData;
  error?: string;
  message?: string;
}> => {
  return apiClient.get<OrganizerChartData>(
    `/organizer/dashboard/charts?period=${period}`
  );
};

// Reports interfaces
export interface OrganizerFinancialSummary {
  totalRevenue: number;
  pixRevenue: number;
  creditCardRevenue: number;
  boletoRevenue: number;
  kitRevenue: number;
  totalRegistrations: number;
  paidRegistrations: number;
}

export interface OrganizerEventRevenue {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  totalRevenue: number;
  registrations: number;
  paidRegistrations: number;
  avgTicket: number;
}

// Get financial summary for reports
export const getOrganizerFinancialSummary = async () => {
  return apiClient.get<OrganizerFinancialSummary>('/organizer/reports/financial-summary');
};

// Get event revenues for reports
export const getOrganizerEventRevenues = async () => {
  return apiClient.get<OrganizerEventRevenue[]>('/organizer/reports/event-revenues');
};

