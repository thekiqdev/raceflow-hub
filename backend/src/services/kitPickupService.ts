import { query } from '../config/database.js';
import { getEventById } from './eventsService.js';

export interface PickupTimeSlot {
  start_time: string; // HH:MM format
  end_time: string; // HH:MM format
}

export interface PickupScheduleItem {
  date: string; // YYYY-MM-DD format
  time_slots: PickupTimeSlot[];
}

export interface KitPickupLocation {
  id: string;
  event_id: string;
  name: string | null;
  address: string;
  additional_info: string | null;
  pickup_date: Date; // Kept for backward compatibility
  pickup_schedule: PickupScheduleItem[]; // New: multiple dates and time slots
  latitude: number | null;
  longitude: number | null;
  created_at: Date | null;
}

/**
 * Helper function to convert event slug or UUID to UUID
 */
async function getEventIdFromSlugOrId(eventIdOrSlug: string): Promise<string | null> {
  // Check if it's already a UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(eventIdOrSlug)) {
    return eventIdOrSlug;
  }
  
  // If it's a slug, get the event to find the UUID
  const event = await getEventById(eventIdOrSlug);
  return event?.id || null;
}

/**
 * Get all pickup locations for an event
 */
export const getEventPickupLocations = async (eventIdOrSlug: string): Promise<KitPickupLocation[]> => {
  // Convert slug to UUID if necessary
  const eventId = await getEventIdFromSlugOrId(eventIdOrSlug);
  if (!eventId) {
    return [];
  }
  
  const result = await query(
    `SELECT * FROM kit_pickup_locations 
     WHERE event_id = $1 
     ORDER BY name ASC, pickup_date ASC`,
    [eventId]
  );

  return result.rows.map((row) => {
    // Parse pickup_schedule if it's a string (JSONB can be returned as string)
    let pickup_schedule: PickupScheduleItem[] = [];
    if (row.pickup_schedule) {
      if (typeof row.pickup_schedule === 'string') {
        try {
          pickup_schedule = JSON.parse(row.pickup_schedule);
        } catch (e) {
          console.error('Erro ao fazer parse do pickup_schedule:', e);
          pickup_schedule = [];
        }
      } else if (Array.isArray(row.pickup_schedule)) {
        pickup_schedule = row.pickup_schedule;
      }
    }
    
    return {
      id: row.id,
      event_id: row.event_id,
      name: row.name || null,
      address: row.address,
      additional_info: row.additional_info || null,
      pickup_date: row.pickup_date,
      pickup_schedule,
      latitude: row.latitude ? parseFloat(row.latitude) : null,
      longitude: row.longitude ? parseFloat(row.longitude) : null,
      created_at: row.created_at,
    };
  });
};

export interface CreatePickupLocationData {
  name?: string | null;
  address: string;
  additional_info?: string | null;
  pickup_date?: string; // Kept for backward compatibility
  pickup_schedule?: PickupScheduleItem[]; // New: multiple dates and time slots
  latitude?: number | null;
  longitude?: number | null;
}

export interface UpdatePickupLocationData {
  name?: string | null;
  address?: string;
  additional_info?: string | null;
  pickup_date?: string; // Kept for backward compatibility
  pickup_schedule?: PickupScheduleItem[]; // New: multiple dates and time slots
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
  console.log('🔧 [createPickupLocation] Dados recebidos:', { eventId, data });
  
  // Determine pickup_date from schedule if not provided (for backward compatibility)
  let pickup_date = data.pickup_date;
  if (!pickup_date && data.pickup_schedule && data.pickup_schedule.length > 0) {
    // Use the first date from schedule
    const firstDate = data.pickup_schedule[0].date;
    const firstTimeSlot = data.pickup_schedule[0].time_slots?.[0];
    if (firstTimeSlot && firstTimeSlot.start_time) {
      // Format: YYYY-MM-DD HH:MM:SS (PostgreSQL format)
      pickup_date = `${firstDate} ${firstTimeSlot.start_time}:00`;
    } else {
      pickup_date = `${firstDate} 08:00:00`;
    }
  }
  
  // Ensure pickup_date is set (required by database)
  if (!pickup_date) {
    // Format: YYYY-MM-DD HH:MM:SS (PostgreSQL TIMESTAMP format)
    pickup_date = new Date().toISOString().replace('T', ' ').slice(0, 19);
  }

  // Ensure pickup_schedule is properly formatted
  const pickup_schedule = data.pickup_schedule && data.pickup_schedule.length > 0 
    ? data.pickup_schedule 
    : [];

  console.log('📅 [createPickupLocation] pickup_date calculado:', pickup_date);
  console.log('📋 [createPickupLocation] pickup_schedule:', JSON.stringify(pickup_schedule));

  try {
    const result = await query(
      `INSERT INTO kit_pickup_locations (event_id, name, address, additional_info, pickup_date, pickup_schedule, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
       RETURNING *`,
      [
        eventId,
        data.name || null,
        data.address,
        data.additional_info || null,
        pickup_date,
        JSON.stringify(pickup_schedule),
        data.latitude || null,
        data.longitude || null,
      ]
    );
    
    console.log('✅ [createPickupLocation] Local criado com sucesso:', result.rows[0].id);

    // Parse pickup_schedule if it's a string
    let parsedPickupSchedule: PickupScheduleItem[] = [];
    if (result.rows[0].pickup_schedule) {
      if (typeof result.rows[0].pickup_schedule === 'string') {
        try {
          parsedPickupSchedule = JSON.parse(result.rows[0].pickup_schedule);
        } catch (e) {
          console.error('Erro ao fazer parse do pickup_schedule:', e);
          parsedPickupSchedule = [];
        }
      } else if (Array.isArray(result.rows[0].pickup_schedule)) {
        parsedPickupSchedule = result.rows[0].pickup_schedule;
      }
    }
    
    return {
      id: result.rows[0].id,
      event_id: result.rows[0].event_id,
      name: result.rows[0].name || null,
      address: result.rows[0].address,
      additional_info: result.rows[0].additional_info || null,
      pickup_date: result.rows[0].pickup_date,
      pickup_schedule: parsedPickupSchedule,
      latitude: result.rows[0].latitude ? parseFloat(result.rows[0].latitude) : null,
      longitude: result.rows[0].longitude ? parseFloat(result.rows[0].longitude) : null,
      created_at: result.rows[0].created_at,
    };
  } catch (error: any) {
    console.error('❌ [createPickupLocation] Erro ao inserir no banco:', error);
    console.error('❌ [createPickupLocation] Detalhes do erro:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
    });
    throw error;
  }
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

  if (data.name !== undefined) {
    updates.push(`name = $${paramCount++}`);
    values.push(data.name);
  }
  if (data.address !== undefined) {
    updates.push(`address = $${paramCount++}`);
    values.push(data.address);
  }
  if (data.additional_info !== undefined) {
    updates.push(`additional_info = $${paramCount++}`);
    values.push(data.additional_info);
  }
  if (data.pickup_date !== undefined) {
    updates.push(`pickup_date = $${paramCount++}`);
    values.push(data.pickup_date);
  }
  if (data.pickup_schedule !== undefined) {
    updates.push(`pickup_schedule = $${paramCount++}::jsonb`);
    values.push(JSON.stringify(data.pickup_schedule));
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

  // Parse pickup_schedule if it's a string
  let pickup_schedule: PickupScheduleItem[] = [];
  if (result.rows[0].pickup_schedule) {
    if (typeof result.rows[0].pickup_schedule === 'string') {
      try {
        pickup_schedule = JSON.parse(result.rows[0].pickup_schedule);
      } catch (e) {
        console.error('Erro ao fazer parse do pickup_schedule:', e);
        pickup_schedule = [];
      }
    } else if (Array.isArray(result.rows[0].pickup_schedule)) {
      pickup_schedule = result.rows[0].pickup_schedule;
    }
  }
  
  return {
    id: result.rows[0].id,
    event_id: result.rows[0].event_id,
    name: result.rows[0].name || null,
    address: result.rows[0].address,
    additional_info: result.rows[0].additional_info || null,
    pickup_date: result.rows[0].pickup_date,
    pickup_schedule,
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

