import { query } from '../config/database.js';

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
  /** OK Etapa 4: Taxa de inscrição (soma de platform_fee_amount em inscrições pagas) */
  platform_fee_revenue?: number;
  /** OK Etapa 4: Taxa de atualização (soma de registration_edit_fee_amount em inscrições pagas) */
  registration_edit_fee_revenue?: number;
  /** OK Etapa 4: Total taxas da plataforma (inscrição + atualização) */
  total_platform_fees?: number;
}

export interface ChartDataPoint {
  month: string;
  month_key: string;
  value: number;
}

/**
 * Get dashboard statistics
 * Falls back to direct queries if view doesn't exist
 */
export const getDashboardStats = async (): Promise<DashboardStats> => {
  try {
    // Try to use the view first
    const result = await query(
      'SELECT * FROM admin_dashboard_stats'
    );

    if (result.rows.length > 0) {
      const row = result.rows[0];
      return {
        active_events: parseInt(row.active_events) || 0,
        pending_events: parseInt(row.pending_events) || 0,
        total_runners: parseInt(row.total_runners) || 0,
        new_runners_this_month: parseInt(row.new_runners_this_month) || 0,
        active_organizers: parseInt(row.active_organizers) || 0,
        pending_organizers: parseInt(row.pending_organizers) || 0,
        total_revenue: parseFloat(row.total_revenue) || 0,
        previous_month_revenue: parseFloat(row.previous_month_revenue) || 0,
        total_registrations: parseInt(row.total_registrations) || 0,
        total_commissions: parseFloat(row.total_commissions) || 0,
        finished_events: parseInt(row.finished_events) || 0,
        platform_fee_revenue: row.platform_fee_revenue != null ? parseFloat(row.platform_fee_revenue) : undefined,
        registration_edit_fee_revenue: row.registration_edit_fee_revenue != null ? parseFloat(row.registration_edit_fee_revenue) : undefined,
        total_platform_fees: row.total_platform_fees != null ? parseFloat(row.total_platform_fees) : undefined,
      };
    }
  } catch (error: any) {
    // View doesn't exist, calculate stats directly
    console.warn('admin_dashboard_stats view not found, calculating stats directly:', error.message);
  }

  // Fallback: Calculate stats directly from tables
  try {
    const [
      activeEventsResult,
      pendingEventsResult,
      totalRunnersResult,
      newRunnersResult,
      activeOrganizersResult,
      pendingOrganizersResult,
      totalRevenueResult,
      previousMonthRevenueResult,
      totalRegistrationsResult,
      finishedEventsResult,
      platformFeeRevenueResult,
      registrationEditFeeRevenueResult,
    ] = await Promise.all([
      // Active events (published and not finished)
      query(`
        SELECT COUNT(*) as count
        FROM events
        WHERE status = 'published' 
        AND (event_date IS NULL OR event_date > NOW())
      `),
      // Pending events (draft)
      query(`
        SELECT COUNT(*) as count
        FROM events
        WHERE status = 'draft'
      `),
      // Total runners
      query(`
        SELECT COUNT(DISTINCT u.id) as count
        FROM users u
        JOIN user_roles ur ON u.id = ur.user_id
        WHERE ur.role = 'runner'
      `),
      // New runners this month
      query(`
        SELECT COUNT(DISTINCT u.id) as count
        FROM users u
        JOIN user_roles ur ON u.id = ur.user_id
        WHERE ur.role = 'runner'
        AND DATE_TRUNC('month', u.created_at) = DATE_TRUNC('month', NOW())
      `),
      // Active organizers
      query(`
        SELECT COUNT(DISTINCT u.id) as count
        FROM users u
        JOIN user_roles ur ON u.id = ur.user_id
        WHERE ur.role = 'organizer'
        AND u.id IN (SELECT DISTINCT organizer_id FROM events WHERE organizer_id IS NOT NULL)
      `),
      // Pending organizers (no events created yet)
      query(`
        SELECT COUNT(DISTINCT u.id) as count
        FROM users u
        JOIN user_roles ur ON u.id = ur.user_id
        WHERE ur.role = 'organizer'
        AND u.id NOT IN (SELECT DISTINCT organizer_id FROM events WHERE organizer_id IS NOT NULL)
      `),
      // Total revenue
      query(`
        SELECT COALESCE(SUM(total_amount), 0) as total
        FROM registrations
        WHERE payment_status = 'paid'
      `),
      // Previous month revenue
      query(`
        SELECT COALESCE(SUM(total_amount), 0) as total
        FROM registrations
        WHERE payment_status = 'paid'
        AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')
      `),
      // Total registrations
      query(`
        SELECT COUNT(*) as count
        FROM registrations
      `),
      // Finished events
      query(`
        SELECT COUNT(*) as count
        FROM events
        WHERE event_date IS NOT NULL AND event_date < NOW()
      `),
      // OK Etapa 4: Taxa de inscrição (inscrições pagas)
      query(`
        SELECT COALESCE(SUM(platform_fee_amount), 0) as total
        FROM registrations
        WHERE payment_status = 'paid'
      `),
      // OK Etapa 4: Taxa de atualização (inscrições pagas)
      query(`
        SELECT COALESCE(SUM(registration_edit_fee_amount), 0) as total
        FROM registrations
        WHERE payment_status = 'paid'
      `),
    ]);

    // Calculate commissions (5% default)
    const totalRevenue = parseFloat(totalRevenueResult.rows[0]?.total || '0');
    const commissionPercentage = 0.05; // 5%
    const totalCommissions = totalRevenue * commissionPercentage;

    const platformFeeRevenue = parseFloat(platformFeeRevenueResult.rows[0]?.total || '0');
    const registrationEditFeeRevenue = parseFloat(registrationEditFeeRevenueResult.rows[0]?.total || '0');

    return {
      active_events: parseInt(activeEventsResult.rows[0]?.count || '0'),
      pending_events: parseInt(pendingEventsResult.rows[0]?.count || '0'),
      total_runners: parseInt(totalRunnersResult.rows[0]?.count || '0'),
      new_runners_this_month: parseInt(newRunnersResult.rows[0]?.count || '0'),
      active_organizers: parseInt(activeOrganizersResult.rows[0]?.count || '0'),
      pending_organizers: parseInt(pendingOrganizersResult.rows[0]?.count || '0'),
      total_revenue: totalRevenue,
      previous_month_revenue: parseFloat(previousMonthRevenueResult.rows[0]?.total || '0'),
      total_registrations: parseInt(totalRegistrationsResult.rows[0]?.count || '0'),
      total_commissions: totalCommissions,
      finished_events: parseInt(finishedEventsResult.rows[0]?.count || '0'),
      platform_fee_revenue: platformFeeRevenue,
      registration_edit_fee_revenue: registrationEditFeeRevenue,
      total_platform_fees: platformFeeRevenue + registrationEditFeeRevenue,
    };
  } catch (error: any) {
    console.error('Error calculating dashboard stats:', error);
    // Return default values on error
    return {
      active_events: 0,
      pending_events: 0,
      total_runners: 0,
      new_runners_this_month: 0,
      active_organizers: 0,
      pending_organizers: 0,
      total_revenue: 0,
      previous_month_revenue: 0,
      total_registrations: 0,
      total_commissions: 0,
      finished_events: 0,
      platform_fee_revenue: 0,
      registration_edit_fee_revenue: 0,
      total_platform_fees: 0,
    };
  }
};

/**
 * Get registrations by month for chart
 * Falls back to direct query if view doesn't exist
 */
export const getRegistrationsByMonth = async (_months: number = 6): Promise<ChartDataPoint[]> => {
  try {
    const result = await query(
      `SELECT 
        month,
        month_key,
        inscricoes as value
      FROM admin_registrations_by_month
      ORDER BY month_key`
    );
    return result.rows;
  } catch (error: any) {
    // View doesn't exist, calculate directly
    console.warn('admin_registrations_by_month view not found, calculating directly:', error.message);
    const result = await query(
      `SELECT 
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month_key,
        TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') as month,
        COUNT(*)::int as value
      FROM registrations
      WHERE created_at >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month_key`
    );
    return result.rows;
  }
};

/**
 * Get revenue by month for chart
 * Falls back to direct query if view doesn't exist
 */
export const getRevenueByMonth = async (_months: number = 6): Promise<ChartDataPoint[]> => {
  try {
    const result = await query(
      `SELECT 
        month,
        month_key,
        faturamento as value
      FROM admin_revenue_by_month
      ORDER BY month_key`
    );
    return result.rows;
  } catch (error: any) {
    // View doesn't exist, calculate directly
    console.warn('admin_revenue_by_month view not found, calculating directly:', error.message);
    const result = await query(
      `SELECT 
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month_key,
        TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') as month,
        COALESCE(SUM(total_amount), 0)::numeric as value
      FROM registrations
      WHERE payment_status = 'paid'
        AND created_at >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month_key`
    );
    return result.rows;
  }
};

/**
 * Get chart data (both registrations and revenue)
 */
export const getChartData = async (months: number = 6) => {
  const [registrations, revenue] = await Promise.all([
    getRegistrationsByMonth(months),
    getRevenueByMonth(months),
  ]);

  return {
    registrations,
    revenue,
  };
};

