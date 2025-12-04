import { query } from '../config/database.js';

export interface RunnerPayment {
  id: string;
  registration_id: string;
  event_title: string;
  event_date: string;
  total_amount: number;
  payment_method: string;
  payment_status: string;
  confirmation_code: string;
  created_at: string;
}

/**
 * Get payment history for a runner
 */
export const getRunnerPayments = async (runnerId: string): Promise<RunnerPayment[]> => {
  const result = await query(
    `SELECT 
      r.id as registration_id,
      r.id,
      e.title as event_title,
      e.event_date,
      r.total_amount,
      r.payment_method,
      r.payment_status,
      r.confirmation_code,
      r.created_at
    FROM registrations r
    JOIN events e ON r.event_id = e.id
    WHERE r.runner_id = $1
      AND r.payment_status IN ('paid', 'refunded')
    ORDER BY r.created_at DESC`,
    [runnerId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    registration_id: row.registration_id,
    event_title: row.event_title,
    event_date: row.event_date,
    total_amount: parseFloat(row.total_amount || 0),
    payment_method: row.payment_method || 'N/A',
    payment_status: row.payment_status,
    confirmation_code: row.confirmation_code,
    created_at: row.created_at,
  }));
};



