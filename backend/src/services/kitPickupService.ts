import { query } from '../config/database.js';

export interface KitPickupLocation {
  id: string;
  event_id: string;
  address: string;
  pickup_date: Date;
  latitude: number | null;
  longitude: number | null;
  created_at: Date | null;
}

/**
 * Get all pickup locations for an event
 */
export const getEventPickupLocations = async (eventId: string): Promise<KitPickupLocation[]> => {
  const result = await query(
    `SELECT * FROM kit_pickup_locations 
     WHERE event_id = $1 
     ORDER BY pickup_date ASC`,
    [eventId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    event_id: row.event_id,
    address: row.address,
    pickup_date: row.pickup_date,
    latitude: row.latitude ? parseFloat(row.latitude) : null,
    longitude: row.longitude ? parseFloat(row.longitude) : null,
    created_at: row.created_at,
  }));
};



