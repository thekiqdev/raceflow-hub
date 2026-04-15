import { query } from '../config/database.js';
import {
  getLiquidRegistrationValue,
  getReportableRevenue,
  type FinancialRegistrationLike,
} from './financialReportingService.js';

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
  // Get platform fee settings
  const { getSystemSettings } = await import('./systemSettingsService.js');
  const settings = await getSystemSettings();
  const platformFee = settings.platform_fee || 0;
  const platformFeeType = (settings.platform_fee_type || 'fixed') as 'fixed' | 'percentage';
  const platformFeeMin = settings.platform_fee_min ?? 0;

  const result = await query(
    `SELECT 
      r.id,
      r.payment_status,
      r.total_amount,
      r.payment_method,
      r.kit_id,
      r.platform_fee_amount,
      r.registration_edit_fee_amount
    FROM registrations r
    JOIN events e ON r.event_id = e.id
    WHERE e.organizer_id = $1`,
    [organizerId]
  );

  let totalRevenue = 0;
  let pixRevenue = 0;
  let creditCardRevenue = 0;
  let boletoRevenue = 0;
  let kitRevenue = 0;
  let totalRegistrations = result.rows.length;
  let paidRegistrations = 0;

  result.rows.forEach((row) => {
    if (row.payment_status === 'paid') {
      paidRegistrations++;
      const valorLiquido = getLiquidRegistrationValue(row as FinancialRegistrationLike, {
        platformFee,
        platformFeeType,
        platformFeeMin,
      });

      totalRevenue += valorLiquido;

      if (row.payment_method === 'pix') {
        pixRevenue += valorLiquido;
      } else if (row.payment_method === 'credit_card') {
        creditCardRevenue += valorLiquido;
      } else if (row.payment_method === 'boleto') {
        boletoRevenue += valorLiquido;
      }

      if (row.kit_id) {
        kitRevenue += valorLiquido;
      }
    }
  });

  return {
    totalRevenue,
    pixRevenue,
    creditCardRevenue,
    boletoRevenue,
    kitRevenue,
    totalRegistrations,
    paidRegistrations,
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
  // Get platform fee settings
  const { getSystemSettings } = await import('./systemSettingsService.js');
  const settings = await getSystemSettings();
  const platformFee = settings.platform_fee || 0;
  const platformFeeType = (settings.platform_fee_type || 'fixed') as 'fixed' | 'percentage';
  const platformFeeMin = settings.platform_fee_min ?? 0;

  const result = await query(
    `SELECT 
      e.id as event_id,
      e.title as event_title,
      e.event_date,
      r.id as registration_id,
      r.payment_status,
      r.total_amount,
      r.platform_fee_amount,
      r.registration_edit_fee_amount
    FROM events e
    LEFT JOIN registrations r ON e.id = r.event_id
    WHERE e.organizer_id = $1
    ORDER BY e.event_date DESC`,
    [organizerId]
  );

  // Group by event and calculate revenue with canonical financial helper.
  const eventMap = new Map<string, {
    eventId: string;
    eventTitle: string;
    eventDate: string;
    registrations: number;
    paidRegistrations: number;
    totalRevenue: number;
  }>();

  const rowsByEvent = new Map<string, any[]>();
  result.rows.forEach((row) => {
    const eventRows = rowsByEvent.get(row.event_id) || [];
    eventRows.push(row);
    rowsByEvent.set(row.event_id, eventRows);
  });

  result.rows.forEach((row) => {
    const eventId = row.event_id;
    if (!eventMap.has(eventId)) {
      eventMap.set(eventId, {
        eventId,
        eventTitle: row.event_title,
        eventDate: row.event_date,
        registrations: 0,
        paidRegistrations: 0,
        totalRevenue: 0,
      });
    }

    const event = eventMap.get(eventId)!;
    if (row.registration_id) {
      event.registrations++;
      if (row.payment_status === 'paid') {
        event.paidRegistrations++;
      }
    }
  });

  for (const [eventId, rows] of rowsByEvent.entries()) {
    const event = eventMap.get(eventId);
    if (!event) continue;
    event.totalRevenue = getReportableRevenue(rows as FinancialRegistrationLike[], {
      platformFee,
      platformFeeType,
      platformFeeMin,
    });
  }

  return Array.from(eventMap.values()).map((event) => ({
    eventId: event.eventId,
    eventTitle: event.eventTitle,
    eventDate: event.eventDate,
    totalRevenue: event.totalRevenue,
    registrations: event.registrations,
    paidRegistrations: event.paidRegistrations,
    avgTicket: event.paidRegistrations > 0
      ? event.totalRevenue / event.paidRegistrations
      : 0,
  }));
};

