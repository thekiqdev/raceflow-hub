import { query } from '../config/database.js';

/**
 * Get dashboard statistics for an organizer
 */
export const getOrganizerDashboardStats = async (organizerId: string) => {
  const result = await query(
    `SELECT * FROM organizer_dashboard_stats WHERE organizer_id = $1`,
    [organizerId]
  );

  if (result.rows.length === 0) {
    // Return default stats if organizer has no events
    return {
      organizer_id: organizerId,
      active_events: 0,
      draft_events: 0,
      finished_events: 0,
      total_registrations: 0,
      registrations_today: 0,
      total_revenue: 0,
      revenue_this_month: 0,
    };
  }

  const stats = result.rows[0];
  return {
    organizer_id: stats.organizer_id,
    active_events: parseInt(stats.active_events) || 0,
    draft_events: parseInt(stats.draft_events) || 0,
    finished_events: parseInt(stats.finished_events) || 0,
    total_registrations: parseInt(stats.total_registrations) || 0,
    registrations_today: parseInt(stats.registrations_today) || 0,
    total_revenue: parseFloat(stats.total_revenue) || 0,
    revenue_this_month: parseFloat(stats.revenue_this_month) || 0,
  };
};

/**
 * Get chart data for organizer dashboard
 */
export const getOrganizerChartData = async (
  organizerId: string,
  periodDays: number = 30
) => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - periodDays);

  // Get registrations by day
  const registrationsResult = await query(
    `SELECT 
      registration_date::date as date,
      registration_count
    FROM organizer_registrations_by_day
    WHERE organizer_id = $1 
    AND registration_date >= $2
    ORDER BY registration_date ASC`,
    [organizerId, startDate.toISOString()]
  );

  // Get revenue by day
  const revenueResult = await query(
    `SELECT 
      revenue_date::date as date,
      revenue
    FROM organizer_revenue_by_day
    WHERE organizer_id = $1 
    AND revenue_date >= $2
    ORDER BY revenue_date ASC`,
    [organizerId, startDate.toISOString()]
  );

  // Get registrations by gender
  const genderResult = await query(
    `SELECT 
      gender,
      registration_count
    FROM organizer_registrations_by_gender
    WHERE organizer_id = $1
    ORDER BY registration_count DESC`,
    [organizerId]
  );

  // Get registrations by modality
  const modalityResult = await query(
    `SELECT 
      modality_name as name,
      registration_count as count
    FROM organizer_registrations_by_modality
    WHERE organizer_id = $1
    ORDER BY registration_count DESC
    LIMIT 10`,
    [organizerId]
  );

  // Get top events
  const topEventsResult = await query(
    `SELECT 
      event_id,
      event_title as title,
      registration_count,
      revenue
    FROM organizer_top_events
    WHERE organizer_id = $1
    ORDER BY registration_count DESC
    LIMIT 3`,
    [organizerId]
  );

  return {
    registrationsByDay: registrationsResult.rows.map((row) => ({
      date: row.date,
      count: parseInt(row.registration_count) || 0,
    })),
    revenueByDay: revenueResult.rows.map((row) => ({
      date: row.date,
      value: parseFloat(row.revenue) || 0,
    })),
    genderData: genderResult.rows.map((row) => ({
      gender: row.gender,
      count: parseInt(row.registration_count) || 0,
    })),
    modalityData: modalityResult.rows.map((row) => ({
      name: row.name,
      count: parseInt(row.count) || 0,
    })),
    topEvents: topEventsResult.rows.map((row) => ({
      event_id: row.event_id,
      title: row.title,
      registrations: parseInt(row.registration_count) || 0,
      revenue: parseFloat(row.revenue) || 0,
    })),
  };
};

/**
 * Get financial summary for organizer reports
 */
export interface OrganizerFinancialSummary {
  totalRevenue: number;
  pixRevenue: number;
  creditCardRevenue: number;
  boletoRevenue: number;
  kitRevenue: number;
  totalRegistrations: number;
  paidRegistrations: number;
}

export const getOrganizerFinancialSummary = async (organizerId: string): Promise<OrganizerFinancialSummary> => {
  const result = await query(
    `SELECT 
      COUNT(DISTINCT r.id) as total_registrations,
      COUNT(DISTINCT CASE WHEN r.payment_status = 'paid' THEN r.id END) as paid_registrations,
      COALESCE(SUM(CASE WHEN r.payment_status = 'paid' THEN r.total_amount ELSE 0 END), 0) as total_revenue,
      COALESCE(SUM(CASE WHEN r.payment_status = 'paid' AND r.payment_method = 'pix' THEN r.total_amount ELSE 0 END), 0) as pix_revenue,
      COALESCE(SUM(CASE WHEN r.payment_status = 'paid' AND r.payment_method = 'credit_card' THEN r.total_amount ELSE 0 END), 0) as credit_card_revenue,
      COALESCE(SUM(CASE WHEN r.payment_status = 'paid' AND r.payment_method = 'boleto' THEN r.total_amount ELSE 0 END), 0) as boleto_revenue,
      COALESCE(SUM(CASE WHEN r.payment_status = 'paid' AND r.kit_id IS NOT NULL THEN r.total_amount ELSE 0 END), 0) as kit_revenue
    FROM registrations r
    JOIN events e ON r.event_id = e.id
    WHERE e.organizer_id = $1`,
    [organizerId]
  );

  const row = result.rows[0];
  return {
    totalRevenue: parseFloat(row.total_revenue) || 0,
    pixRevenue: parseFloat(row.pix_revenue) || 0,
    creditCardRevenue: parseFloat(row.credit_card_revenue) || 0,
    boletoRevenue: parseFloat(row.boleto_revenue) || 0,
    kitRevenue: parseFloat(row.kit_revenue) || 0,
    totalRegistrations: parseInt(row.total_registrations) || 0,
    paidRegistrations: parseInt(row.paid_registrations) || 0,
  };
};

/**
 * Get revenue by event for organizer
 */
export interface OrganizerEventRevenue {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  totalRevenue: number;
  registrations: number;
  paidRegistrations: number;
  avgTicket: number;
}

export const getOrganizerEventRevenues = async (organizerId: string): Promise<OrganizerEventRevenue[]> => {
  const result = await query(
    `SELECT 
      e.id as event_id,
      e.title as event_title,
      e.event_date,
      COUNT(DISTINCT r.id) as registrations,
      COUNT(DISTINCT CASE WHEN r.payment_status = 'paid' THEN r.id END) as paid_registrations,
      COALESCE(SUM(CASE WHEN r.payment_status = 'paid' THEN r.total_amount ELSE 0 END), 0) as total_revenue
    FROM events e
    LEFT JOIN registrations r ON e.id = r.event_id
    WHERE e.organizer_id = $1
    GROUP BY e.id, e.title, e.event_date
    ORDER BY e.event_date DESC`,
    [organizerId]
  );

  return result.rows.map((row) => ({
    eventId: row.event_id,
    eventTitle: row.event_title,
    eventDate: row.event_date,
    totalRevenue: parseFloat(row.total_revenue) || 0,
    registrations: parseInt(row.registrations) || 0,
    paidRegistrations: parseInt(row.paid_registrations) || 0,
    avgTicket: parseInt(row.paid_registrations) > 0
      ? parseFloat(row.total_revenue) / parseInt(row.paid_registrations)
      : 0,
  }));
};

