import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { getDashboardStats, getChartData } from '../services/adminService.js';

/**
 * GET /api/admin/dashboard/stats
 * Get dashboard statistics
 */
export const getDashboardStatsController = async (
  _req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const stats = await getDashboardStats();

    // Calculate percentage change for revenue
    const revenueChange = stats.previous_month_revenue > 0
      ? ((stats.total_revenue - stats.previous_month_revenue) / stats.previous_month_revenue) * 100
      : 0;

    res.json({
      success: true,
      data: {
        ...stats,
        revenue_change_percentage: Math.round(revenueChange * 100) / 100,
      },
    });
  } catch (error: any) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch dashboard statistics',
    });
  }
};

/**
 * GET /api/admin/dashboard/charts
 * Get chart data for dashboard
 */
export const getDashboardChartsController = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const months = parseInt(req.query.period as string) || 6;
    const chartData = await getChartData(months);

    res.json({
      success: true,
      data: chartData,
    });
  } catch (error: any) {
    console.error('Error fetching chart data:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Failed to fetch chart data',
    });
  }
};




