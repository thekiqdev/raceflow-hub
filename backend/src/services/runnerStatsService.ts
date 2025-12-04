import { query } from '../config/database.js';

export interface RunnerStats {
  total_registrations: number;
  completed_races: number;
  total_distance: number; // in km
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

/**
 * Get statistics for a runner based on their registrations
 */
export const getRunnerStats = async (runnerId: string): Promise<RunnerStats> => {
  // Get all registrations for the runner
  const registrationsResult = await query(
    `SELECT 
      r.id,
      r.status,
      r.payment_status,
      r.total_amount,
      r.created_at,
      e.event_date,
      ec.distance
    FROM registrations r
    JOIN events e ON r.event_id = e.id
    JOIN event_categories ec ON r.category_id = ec.id
    WHERE r.runner_id = $1`,
    [runnerId]
  );

  const registrations = registrationsResult.rows;
  const now = new Date();

  const total_registrations = registrations.length;
  const completed_races = registrations.filter(r => 
    new Date(r.event_date) < now && r.status === 'confirmed'
  ).length;
  const upcoming_races = registrations.filter(r => 
    new Date(r.event_date) >= now && r.status === 'confirmed' && r.payment_status === 'paid'
  ).length;

  // Calculate total distance (extract number from distance string like "10km" or "5K")
  const total_distance = registrations
    .filter(r => r.status === 'confirmed' && r.payment_status === 'paid')
    .reduce((sum, r) => {
      const distanceStr = r.distance || '';
      const distanceNum = parseFloat(distanceStr.replace(/[^0-9.]/g, ''));
      return sum + (isNaN(distanceNum) ? 0 : distanceNum);
    }, 0);

  // Calculate total spent
  const total_spent = registrations
    .filter(r => r.payment_status === 'paid')
    .reduce((sum, r) => sum + parseFloat(r.total_amount || 0), 0);

  // Calculate average ticket
  const paidRegistrations = registrations.filter(r => r.payment_status === 'paid');
  const average_ticket = paidRegistrations.length > 0
    ? total_spent / paidRegistrations.length
    : 0;

  return {
    total_registrations,
    completed_races,
    total_distance,
    total_spent,
    upcoming_races,
    average_ticket,
  };
};

/**
 * Calculate achievements for a runner based on their registrations
 */
export const getRunnerAchievements = async (runnerId: string): Promise<Achievement[]> => {
  const stats = await getRunnerStats(runnerId);
  
  // Get registrations for achievement calculations
  const registrationsResult = await query(
    `SELECT 
      r.id,
      r.status,
      r.payment_status,
      r.created_at,
      e.event_date,
      ec.distance
    FROM registrations r
    JOIN events e ON r.event_id = e.id
    JOIN event_categories ec ON r.category_id = ec.id
    WHERE r.runner_id = $1
      AND r.status = 'confirmed'
      AND r.payment_status = 'paid'
    ORDER BY e.event_date ASC`,
    [runnerId]
  );

  const registrations = registrationsResult.rows;
  const now = new Date();
  const completedRaces = registrations.filter(r => new Date(r.event_date) < now);
  const firstRace = completedRaces[0];
  const totalDistance = stats.total_distance;

  // Calculate if early bird achievement (registration more than 30 days before event)
  const hasEarlyBird = registrations.some(r => {
    const eventDate = new Date(r.event_date);
    const registrationDate = new Date(r.created_at);
    const daysDiff = (eventDate.getTime() - registrationDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysDiff > 30;
  });

  const achievements: Achievement[] = [
    {
      id: 'first_race',
      title: 'Primeira Corrida',
      description: 'Complete sua primeira corrida',
      unlocked: completedRaces.length >= 1,
      unlocked_at: firstRace ? firstRace.event_date : undefined,
    },
    {
      id: 'five_races',
      title: 'Corredor Dedicado',
      description: 'Complete 5 corridas',
      unlocked: completedRaces.length >= 5,
    },
    {
      id: 'ten_races',
      title: 'Veterano',
      description: 'Complete 10 corridas',
      unlocked: completedRaces.length >= 10,
    },
    {
      id: 'distance_50k',
      title: '50km Totais',
      description: 'Corra 50km no total',
      unlocked: totalDistance >= 50,
    },
    {
      id: 'distance_100k',
      title: '100km Totais',
      description: 'Corra 100km no total',
      unlocked: totalDistance >= 100,
    },
    {
      id: 'early_bird',
      title: 'Madrugador',
      description: 'Faça uma inscrição com mais de 30 dias de antecedência',
      unlocked: hasEarlyBird,
    },
  ];

  return achievements;
};



