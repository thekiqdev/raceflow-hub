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
}

export interface ChartDataPoint {
  month: string;
  month_key: string;
  value: number;
}

/**
 * Get dashboard statistics
 */
export const getDashboardStats = async (): Promise<DashboardStats> => {
  const result = await query(
    'SELECT * FROM admin_dashboard_stats'
  );

  if (result.rows.length === 0) {
    // Return default values if no data
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
    };
  }

  return result.rows[0];
};

/**
 * Get registrations by month for chart
 */
export const getRegistrationsByMonth = async (_months: number = 6): Promise<ChartDataPoint[]> => {
  const result = await query(
    `SELECT 
      month,
      month_key,
      inscricoes as value
    FROM admin_registrations_by_month
    ORDER BY month_key`
  );

  return result.rows;
};

/**
 * Get revenue by month for chart
 */
export const getRevenueByMonth = async (_months: number = 6): Promise<ChartDataPoint[]> => {
  const result = await query(
    `SELECT 
      month,
      month_key,
      faturamento as value
    FROM admin_revenue_by_month
    ORDER BY month_key`
  );

  return result.rows;
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

