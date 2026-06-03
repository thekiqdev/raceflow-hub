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

export interface LeadersInvitationsGrantedRow {
  leader_id: string;
  leader_name: string | null;
  invitations_granted: number;
}

/** Estatísticas agregadas de convites do evento (base leader_invitations). */
/** Resumo geral do evento (agregados de inscrições). */
export interface EventGeneralStats {
  total_registrations: number;
  confirmed_registrations: number;
  transferred_registrations: number;
  cancelled_registrations: number;
  paid_registrations: number;
  pix_count: number;
  card_count: number;
  free_bonus_count: number;
  invited_count: number;
  from_invitation_count: number;
  free_bonus_admin_count: number;
  normal_paid_count: number;
}

export type EventProductStockStatus = 'available' | 'low' | 'exhausted' | 'unlimited';

export interface EventProductStockVariationRow {
  product_id: string;
  product_name: string;
  variation_id: string;
  variation_name: string;
  stock_initial: number | null;
  stock_used: number;
  stock_available: number | null;
  status: EventProductStockStatus;
}

export interface EventProductStockReportSummary {
  products_count: number;
  stock_initial_total: number;
  stock_used_total: number;
  stock_available_total: number;
  exhausted_variations_count: number;
}

export interface EventProductStockReport {
  summary: EventProductStockReportSummary;
  variations: EventProductStockVariationRow[];
  low_stock_alerts: EventProductStockVariationRow[];
}

export interface EventInvitationStats {
  event_id: string;
  total_invitations: number;
  available_invitations: number;
  sent_invitations: number;
  used_invitations: number;
  expired_invitations: number;
  conversion_rate: number | null;
  revenue_from_invitations: number;
  paid_registrations_from_invitations: number;
  valid_invitations: number;
  orphan_free_bonus_count: number;
  inconsistent_invitations: number;
  computed_at: string;
  rules_version: string;
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

/**
 * GET /api/admin/reports/leaders-invitations-granted/:eventId
 * Counts invitations per leader for the event in statuses available/sent/used.
 */
export const getLeadersInvitationsGrantedByEvent = async (eventId: string): Promise<{
  success: boolean;
  data?: LeadersInvitationsGrantedRow[];
  error?: string;
}> => {
  return apiClient.get<LeadersInvitationsGrantedRow[]>(
    `/admin/reports/leaders-invitations-granted/${eventId}`
  );
};

/**
 * GET /api/organizer/reports/leaders-invitations-granted/:eventId
 * Counts invitations per leader for the event in statuses available/sent/used.
 */
export const getOrganizerLeadersInvitationsGrantedByEvent = async (
  eventId: string
): Promise<{
  success: boolean;
  data?: LeadersInvitationsGrantedRow[];
  error?: string;
}> => {
  return apiClient.get<LeadersInvitationsGrantedRow[]>(
    `/organizer/reports/leaders-invitations-granted/${eventId}`
  );
};

/**
 * GET /api/admin/reports/events/:eventId/invitation-stats
 */
export const getEventInvitationStats = async (eventId: string): Promise<{
  success: boolean;
  data?: EventInvitationStats;
  error?: string;
  message?: string;
}> => {
  return apiClient.get<EventInvitationStats>(`/admin/reports/events/${eventId}/invitation-stats`);
};

/**
 * GET /api/organizer/reports/events/:eventId/invitation-stats
 */
export const getOrganizerEventInvitationStats = async (eventId: string): Promise<{
  success: boolean;
  data?: EventInvitationStats;
  error?: string;
  message?: string;
}> => {
  return apiClient.get<EventInvitationStats>(`/organizer/reports/events/${eventId}/invitation-stats`);
};

/**
 * GET /api/admin/reports/events/:eventId/general-stats
 */
export const getEventGeneralStats = async (eventId: string): Promise<{
  success: boolean;
  data?: EventGeneralStats;
  error?: string;
  message?: string;
}> => {
  return apiClient.get<EventGeneralStats>(`/admin/reports/events/${eventId}/general-stats`);
};

/**
 * GET /api/organizer/reports/events/:eventId/general-stats
 */
export const getOrganizerEventGeneralStats = async (eventId: string): Promise<{
  success: boolean;
  data?: EventGeneralStats;
  error?: string;
  message?: string;
}> => {
  return apiClient.get<EventGeneralStats>(`/organizer/reports/events/${eventId}/general-stats`);
};

/**
 * GET /api/admin/reports/events/:eventId/product-stock
 */
export const getEventProductStockReport = async (eventId: string): Promise<{
  success: boolean;
  data?: EventProductStockReport;
  error?: string;
  message?: string;
}> => {
  return apiClient.get<EventProductStockReport>(`/admin/reports/events/${eventId}/product-stock`);
};

/**
 * GET /api/organizer/reports/events/:eventId/product-stock
 */
export const getOrganizerEventProductStockReport = async (eventId: string): Promise<{
  success: boolean;
  data?: EventProductStockReport;
  error?: string;
  message?: string;
}> => {
  return apiClient.get<EventProductStockReport>(`/organizer/reports/events/${eventId}/product-stock`);
};


