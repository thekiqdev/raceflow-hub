import { query } from '../config/database.js';

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
export const getRegistrationsByPeriod = async (
  startDate?: string,
  endDate?: string
): Promise<RegistrationByPeriod[]> => {
  let queryText = 'SELECT * FROM report_registrations_by_period';
  const params: any[] = [];
  const conditions: string[] = [];

  if (startDate) {
    conditions.push(`period >= $${params.length + 1}`);
    params.push(startDate);
  }

  if (endDate) {
    conditions.push(`period <= $${params.length + 1}`);
    params.push(endDate);
  }

  if (conditions.length > 0) {
    queryText += ' WHERE ' + conditions.join(' AND ');
  }

  queryText += ' ORDER BY period DESC LIMIT 365'; // Last year

  const result = await query(queryText, params);
  return result.rows.map((row) => ({
    period: row.period,
    total_registrations: parseInt(row.total_registrations) || 0,
    paid_registrations: parseInt(row.paid_registrations) || 0,
    pending_registrations: parseInt(row.pending_registrations) || 0,
    failed_registrations: parseInt(row.failed_registrations) || 0,
    total_revenue: parseFloat(row.total_revenue) || 0,
  }));
};

/**
 * Get new users by month
 */
export const getNewUsersByMonth = async (
  months: number = 12
): Promise<NewUsersByMonth[]> => {
  const result = await query(
    `SELECT * FROM report_new_users_by_month 
     ORDER BY month DESC 
     LIMIT $1`,
    [months]
  );

  return result.rows.map((row) => ({
    month: row.month,
    total_users: parseInt(row.total_users) || 0,
    runners: parseInt(row.runners) || 0,
    organizers: parseInt(row.organizers) || 0,
    admins: parseInt(row.admins) || 0,
  }));
};

/**
 * Get revenue by event
 */
export const getRevenueByEvent = async (
  startDate?: string,
  endDate?: string
): Promise<RevenueByEvent[]> => {
  let queryText = 'SELECT * FROM report_revenue_by_event';
  const params: any[] = [];
  const conditions: string[] = [];

  if (startDate) {
    conditions.push(`event_date >= $${params.length + 1}`);
    params.push(startDate);
  }

  if (endDate) {
    conditions.push(`event_date <= $${params.length + 1}`);
    params.push(endDate);
  }

  if (conditions.length > 0) {
    queryText += ' WHERE ' + conditions.join(' AND ');
  }

  queryText += ' ORDER BY total_revenue DESC';

  const result = await query(queryText, params);
  return result.rows.map((row) => ({
    event_id: row.event_id,
    event_title: row.event_title,
    event_date: row.event_date,
    organizer_id: row.organizer_id,
    organizer_name: row.organizer_name,
    total_registrations: parseInt(row.total_registrations) || 0,
    paid_registrations: parseInt(row.paid_registrations) || 0,
    total_revenue: parseFloat(row.total_revenue) || 0,
    avg_ticket: parseFloat(row.avg_ticket) || 0,
  }));
};

/**
 * Get top organizers
 */
export const getTopOrganizers = async (limit: number = 10): Promise<TopOrganizer[]> => {
  const result = await query(
    `SELECT * FROM report_top_organizers 
     ORDER BY total_revenue DESC 
     LIMIT $1`,
    [limit]
  );

  return result.rows.map((row) => ({
    organizer_id: row.organizer_id,
    organizer_name: row.organizer_name,
    total_events: parseInt(row.total_events) || 0,
    total_registrations: parseInt(row.total_registrations) || 0,
    paid_registrations: parseInt(row.paid_registrations) || 0,
    total_revenue: parseFloat(row.total_revenue) || 0,
    avg_ticket: parseFloat(row.avg_ticket) || 0,
  }));
};

/**
 * Get athlete behavior
 */
export const getAthleteBehavior = async (limit: number = 100): Promise<AthleteBehavior[]> => {
  const result = await query(
    `SELECT * FROM report_athlete_behavior 
     ORDER BY total_registrations DESC 
     LIMIT $1`,
    [limit]
  );

  return result.rows.map((row) => ({
    athlete_id: row.athlete_id,
    athlete_name: row.athlete_name,
    total_registrations: parseInt(row.total_registrations) || 0,
    paid_registrations: parseInt(row.paid_registrations) || 0,
    failed_registrations: parseInt(row.failed_registrations) || 0,
    total_spent: parseFloat(row.total_spent) || 0,
    avg_spent_per_registration: parseFloat(row.avg_spent_per_registration) || 0,
    first_registration: row.first_registration,
    last_registration: row.last_registration,
  }));
};

/**
 * Get monthly registration evolution
 */
export const getMonthlyEvolution = async (
  months: number = 12
): Promise<MonthlyEvolution[]> => {
  const result = await query(
    `SELECT * FROM report_monthly_registration_evolution 
     ORDER BY month DESC 
     LIMIT $1`,
    [months]
  );

  return result.rows.map((row) => ({
    month: row.month,
    total_registrations: parseInt(row.total_registrations) || 0,
    paid_registrations: parseInt(row.paid_registrations) || 0,
    total_revenue: parseFloat(row.total_revenue) || 0,
    previous_month_registrations: row.previous_month_registrations
      ? parseInt(row.previous_month_registrations)
      : null,
    previous_month_revenue: row.previous_month_revenue
      ? parseFloat(row.previous_month_revenue)
      : null,
  }));
};

/**
 * Get event performance
 */
export const getEventPerformance = async (
  startDate?: string,
  endDate?: string
): Promise<EventPerformance[]> => {
  let queryText = 'SELECT * FROM report_event_performance';
  const params: any[] = [];
  const conditions: string[] = [];

  if (startDate) {
    conditions.push(`event_date >= $${params.length + 1}`);
    params.push(startDate);
  }

  if (endDate) {
    conditions.push(`event_date <= $${params.length + 1}`);
    params.push(endDate);
  }

  if (conditions.length > 0) {
    queryText += ' WHERE ' + conditions.join(' AND ');
  }

  queryText += ' ORDER BY total_revenue DESC';

  const result = await query(queryText, params);
  return result.rows.map((row) => ({
    event_id: row.event_id,
    event_title: row.event_title,
    event_date: row.event_date,
    status: row.status,
    city: row.city,
    state: row.state,
    total_registrations: parseInt(row.total_registrations) || 0,
    paid_registrations: parseInt(row.paid_registrations) || 0,
    pending_registrations: parseInt(row.pending_registrations) || 0,
    total_revenue: parseFloat(row.total_revenue) || 0,
    avg_ticket: parseFloat(row.avg_ticket) || 0,
    conversion_rate: parseFloat(row.conversion_rate) || 0,
  }));
};




