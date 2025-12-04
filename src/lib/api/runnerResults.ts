import { apiClient } from './client.js';

export interface RunnerResult {
  id: string;
  registration_id: string;
  event_id: string;
  event_title: string;
  event_date: string;
  category_name: string;
  category_distance: string;
  result_url: string;
  confirmation_code: string;
  created_at: string;
}

export interface RunnerResultsStats {
  total_races: number;
  podiums: number;
  improvement_percentage: number;
  completed_races: number;
}

// Get all results for the authenticated runner
export const getRunnerResults = async () => {
  return apiClient.get<RunnerResult[]>('/runner/results');
};

// Get statistics for runner results
export const getRunnerResultsStats = async () => {
  return apiClient.get<RunnerResultsStats>('/runner/results/stats');
};

// Get result for a specific event
export const getRunnerResultByEvent = async (eventId: string) => {
  return apiClient.get<RunnerResult>(`/runner/results/${eventId}`);
};



