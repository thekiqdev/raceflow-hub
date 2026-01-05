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

export interface CreatePickupLocationData {
  address: string;
  pickup_date: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface UpdatePickupLocationData {
  address?: string;
  pickup_date?: string;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Create a new pickup location for an event
 */
export const createPickupLocation = async (
  eventId: string,
  data: CreatePickupLocationData
): Promise<KitPickupLocation> => {
  const result = await query(
    `INSERT INTO kit_pickup_locations (event_id, address, pickup_date, latitude, longitude)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      eventId,
      data.address,
      data.pickup_date,
      data.latitude || null,
      data.longitude || null,
    ]
  );

  return {
    id: result.rows[0].id,
    event_id: result.rows[0].event_id,
    address: result.rows[0].address,
    pickup_date: result.rows[0].pickup_date,
    latitude: result.rows[0].latitude ? parseFloat(result.rows[0].latitude) : null,
    longitude: result.rows[0].longitude ? parseFloat(result.rows[0].longitude) : null,
    created_at: result.rows[0].created_at,
  };
};

/**
 * Update a pickup location
 */
export const updatePickupLocation = async (
  locationId: string,
  data: UpdatePickupLocationData
): Promise<KitPickupLocation> => {
  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (data.address !== undefined) {
    updates.push(`address = $${paramCount++}`);
    values.push(data.address);
  }
  if (data.pickup_date !== undefined) {
    updates.push(`pickup_date = $${paramCount++}`);
    values.push(data.pickup_date);
  }
  if (data.latitude !== undefined) {
    updates.push(`latitude = $${paramCount++}`);
    values.push(data.latitude);
  }
  if (data.longitude !== undefined) {
    updates.push(`longitude = $${paramCount++}`);
    values.push(data.longitude);
  }

  if (updates.length === 0) {
    throw new Error('No fields to update');
  }

  values.push(locationId);

  const result = await query(
    `UPDATE kit_pickup_locations 
     SET ${updates.join(', ')}
     WHERE id = $${paramCount}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new Error('Pickup location not found');
  }

  return {
    id: result.rows[0].id,
    event_id: result.rows[0].event_id,
    address: result.rows[0].address,
    pickup_date: result.rows[0].pickup_date,
    latitude: result.rows[0].latitude ? parseFloat(result.rows[0].latitude) : null,
    longitude: result.rows[0].longitude ? parseFloat(result.rows[0].longitude) : null,
    created_at: result.rows[0].created_at,
  };
};

/**
 * Delete a pickup location
 */
export const deletePickupLocation = async (locationId: string): Promise<boolean> => {
  const result = await query(
    'DELETE FROM kit_pickup_locations WHERE id = $1 RETURNING id',
    [locationId]
  );
  return result.rows.length > 0;
};

