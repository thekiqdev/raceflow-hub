import { apiClient } from './client.js';

export interface RegistrationByPeriod {
  period: string;
  total_registrations: number;
  paid_registrations: number;
  pending_registrations: number;
  failed_registrations: number;
  total_revenue: number;
}

export interface NewUsersByMonth {
  month: string;
  total_users: number;
  runners: number;
  organizers: number;
  admins: number;
}

export interface RevenueByEvent {
  event_id: string;
  event_title: string;
  event_date: string;
  organizer_id: string;
  organizer_name: string;
  total_registrations: number;
  paid_registrations: number;
  total_revenue: number;
  avg_ticket: number;
}

export interface TopOrganizer {
  organizer_id: string;
  organizer_name: string;
  total_events: number;
  total_registrations: number;
  paid_registrations: number;
  total_revenue: number;
  avg_ticket: number;
}

export interface AthleteBehavior {
  athlete_id: string;
  athlete_name: string;
  total_registrations: number;
  paid_registrations: number;
  failed_registrations: number;
  total_spent: number;
  avg_spent_per_registration: number;
  first_registration: string;
  last_registration: string;
}

export interface MonthlyEvolution {
  month: string;
  total_registrations: number;
  paid_registrations: number;
  total_revenue: number;
  previous_month_registrations: number | null;
  previous_month_revenue: number | null;
}

export interface EventPerformance {
  event_id: string;
  event_title: string;
  event_date: string;
  status: string;
  city: string;
  state: string;
  total_registrations: number;
  paid_registrations: number;
  pending_registrations: number;
  total_revenue: number;
  avg_ticket: number;
  conversion_rate: number;
}

/**
 * Get registrations by period
 */
export const getRegistrationsByPeriod = async (filters?: {
  start_date?: string;
  end_date?: string;
}): Promise<{
  success: boolean;
  data?: RegistrationByPeriod[];
  error?: string;
}> => {
  const queryParams = new URLSearchParams();
  if (filters?.start_date) queryParams.append('start_date', filters.start_date);
  if (filters?.end_date) queryParams.append('end_date', filters.end_date);

  const queryString = queryParams.toString();
  const endpoint = `/admin/reports/registrations-by-period${queryString ? `?${queryString}` : ''}`;

  return apiClient.get<RegistrationByPeriod[]>(endpoint);
};

/**
 * Get new users by month
 */
export const getNewUsersByMonth = async (months?: number): Promise<{
  success: boolean;
  data?: NewUsersByMonth[];
  error?: string;
}> => {
  const queryParams = new URLSearchParams();
  if (months) queryParams.append('months', months.toString());

  const queryString = queryParams.toString();
  const endpoint = `/admin/reports/new-users-by-month${queryString ? `?${queryString}` : ''}`;

  return apiClient.get<NewUsersByMonth[]>(endpoint);
};

/**
 * Get revenue by event
 */
export const getRevenueByEvent = async (filters?: {
  start_date?: string;
  end_date?: string;
}): Promise<{
  success: boolean;
  data?: RevenueByEvent[];
  error?: string;
}> => {
  const queryParams = new URLSearchParams();
  if (filters?.start_date) queryParams.append('start_date', filters.start_date);
  if (filters?.end_date) queryParams.append('end_date', filters.end_date);

  const queryString = queryParams.toString();
  const endpoint = `/admin/reports/revenue-by-event${queryString ? `?${queryString}` : ''}`;

  return apiClient.get<RevenueByEvent[]>(endpoint);
};

/**
 * Get top organizers
 */
export const getTopOrganizers = async (limit?: number): Promise<{
  success: boolean;
  data?: TopOrganizer[];
  error?: string;
}> => {
  const queryParams = new URLSearchParams();
  if (limit) queryParams.append('limit', limit.toString());

  const queryString = queryParams.toString();
  const endpoint = `/admin/reports/top-organizers${queryString ? `?${queryString}` : ''}`;

  return apiClient.get<TopOrganizer[]>(endpoint);
};

/**
 * Get athlete behavior
 */
export const getAthleteBehavior = async (limit?: number): Promise<{
  success: boolean;
  data?: AthleteBehavior[];
  error?: string;
}> => {
  const queryParams = new URLSearchParams();
  if (limit) queryParams.append('limit', limit.toString());

  const queryString = queryParams.toString();
  const endpoint = `/admin/reports/athlete-behavior${queryString ? `?${queryString}` : ''}`;

  return apiClient.get<AthleteBehavior[]>(endpoint);
};

/**
 * Get monthly evolution
 */
export const getMonthlyEvolution = async (months?: number): Promise<{
  success: boolean;
  data?: MonthlyEvolution[];
  error?: string;
}> => {
  const queryParams = new URLSearchParams();
  if (months) queryParams.append('months', months.toString());

  const queryString = queryParams.toString();
  const endpoint = `/admin/reports/monthly-evolution${queryString ? `?${queryString}` : ''}`;

  return apiClient.get<MonthlyEvolution[]>(endpoint);
};

/**
 * Get event performance
 */
export const getEventPerformance = async (filters?: {
  start_date?: string;
  end_date?: string;
}): Promise<{
  success: boolean;
  data?: EventPerformance[];
  error?: string;
}> => {
  const queryParams = new URLSearchParams();
  if (filters?.start_date) queryParams.append('start_date', filters.start_date);
  if (filters?.end_date) queryParams.append('end_date', filters.end_date);

  const queryString = queryParams.toString();
  const endpoint = `/admin/reports/event-performance${queryString ? `?${queryString}` : ''}`;

  return apiClient.get<EventPerformance[]>(endpoint);
};




