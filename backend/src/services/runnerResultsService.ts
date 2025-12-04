import { query } from '../config/database.js';

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
  podiums: number; // Top 3 (será calculado se tivermos dados de posição)
  improvement_percentage: number; // Será calculado se tivermos dados de tempo
  completed_races: number;
}

/**
 * Get all results for a runner
 * Results are based on confirmed registrations for events that have passed and have a result_url
 */
export const getRunnerResults = async (runnerId: string): Promise<RunnerResult[]> => {
  const result = await query(
    `SELECT 
      r.id as registration_id,
      r.id,
      r.event_id,
      e.title as event_title,
      e.event_date,
      e.result_url,
      ec.name as category_name,
      ec.distance as category_distance,
      r.confirmation_code,
      r.created_at
    FROM registrations r
    JOIN events e ON r.event_id = e.id
    JOIN event_categories ec ON r.category_id = ec.id
    WHERE r.runner_id = $1
      AND r.status = 'confirmed'
      AND r.payment_status = 'paid'
      AND e.event_date < NOW()
      AND e.result_url IS NOT NULL
      AND e.result_url != ''
    ORDER BY e.event_date DESC`,
    [runnerId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    registration_id: row.registration_id,
    event_id: row.event_id,
    event_title: row.event_title,
    event_date: row.event_date,
    category_name: row.category_name,
    category_distance: row.category_distance,
    result_url: row.result_url,
    confirmation_code: row.confirmation_code,
    created_at: row.created_at,
  }));
};

/**
 * Get statistics for runner results
 */
export const getRunnerResultsStats = async (runnerId: string): Promise<RunnerResultsStats> => {
  const results = await getRunnerResults(runnerId);
  
  return {
    total_races: results.length,
    podiums: 0, // Placeholder - would need position data
    improvement_percentage: 0, // Placeholder - would need time data
    completed_races: results.length,
  };
};

/**
 * Get result for a specific event
 */
export const getRunnerResultByEvent = async (runnerId: string, eventId: string): Promise<RunnerResult | null> => {
  const result = await query(
    `SELECT 
      r.id as registration_id,
      r.id,
      r.event_id,
      e.title as event_title,
      e.event_date,
      e.result_url,
      ec.name as category_name,
      ec.distance as category_distance,
      r.confirmation_code,
      r.created_at
    FROM registrations r
    JOIN events e ON r.event_id = e.id
    JOIN event_categories ec ON r.category_id = ec.id
    WHERE r.runner_id = $1
      AND r.event_id = $2
      AND r.status = 'confirmed'
      AND r.payment_status = 'paid'
      AND e.event_date < NOW()
      AND e.result_url IS NOT NULL
      AND e.result_url != ''
    LIMIT 1`,
    [runnerId, eventId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    registration_id: row.registration_id,
    event_id: row.event_id,
    event_title: row.event_title,
    event_date: row.event_date,
    category_name: row.category_name,
    category_distance: row.category_distance,
    result_url: row.result_url,
    confirmation_code: row.confirmation_code,
    created_at: row.created_at,
  };
};



