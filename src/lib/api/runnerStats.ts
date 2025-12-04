import { apiClient } from './client.js';

export interface RunnerStats {
  total_registrations: number;
  completed_races: number;
  total_distance: number;
  total_spent: number;
  upcoming_races: number;
  average_ticket: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  unlocked_at?: string;
}

// Get statistics for the authenticated runner
export const getRunnerStats = async () => {
  return apiClient.get<RunnerStats>('/runner/stats');
};

// Get achievements for the authenticated runner
export const getRunnerAchievements = async () => {
  return apiClient.get<Achievement[]>('/runner/achievements');
};



