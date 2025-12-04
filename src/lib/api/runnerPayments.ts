import { apiClient } from './client.js';

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

// Get payment history for the authenticated runner
export const getRunnerPayments = async () => {
  return apiClient.get<RunnerPayment[]>('/runner/payments');
};



