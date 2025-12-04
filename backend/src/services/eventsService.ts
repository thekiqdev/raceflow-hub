import { query } from '../config/database.js';
import { EventStatus } from '../types/index.js';

export interface CreateEventData {
  organizer_id: string;
  title: string;
  description?: string;
  event_date: string;
  location: string;
  city: string;
  state: string;
  banner_url?: string;
  regulation_url?: string;
  result_url?: string;
  status?: EventStatus;
}

export interface UpdateEventData {
  title?: string;
  description?: string;
  event_date?: string;
  location?: string;
  city?: string;
  state?: string;
  banner_url?: string;
  regulation_url?: string;
  result_url?: string;
  status?: EventStatus;
}

// Get all events (with filters and statistics)
export const getEvents = async (filters?: {
  status?: EventStatus;
  city?: string;
  state?: string;
  organizer_id?: string;
  search?: string;
}) => {
  // Use a subquery approach to avoid GROUP BY issues
  let queryText = `
    SELECT 
      e.id,
      e.organizer_id,
      e.title,
      e.description,
      e.event_date,
      e.location,
      e.city,
      e.state,
      e.banner_url,
      e.regulation_url,
      e.result_url,
      e.status,
      e.created_at,
      e.updated_at,
      p.full_name as organizer_name,
      COALESCE(reg_stats.registration_count, 0) as registration_count,
      COALESCE(reg_stats.confirmed_registrations, 0) as confirmed_registrations,
      COALESCE(reg_stats.revenue, 0) as revenue,
      COALESCE(reg_stats.avg_ticket, 0) as avg_ticket
    FROM events e
    LEFT JOIN profiles p ON e.organizer_id = p.id
    LEFT JOIN (
      SELECT 
        event_id,
        COUNT(DISTINCT id) as registration_count,
        COUNT(DISTINCT CASE WHEN payment_status = 'paid' THEN id END) as confirmed_registrations,
        COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END), 0) as revenue,
        COALESCE(AVG(CASE WHEN payment_status = 'paid' THEN total_amount END), 0) as avg_ticket
      FROM registrations
      GROUP BY event_id
    ) reg_stats ON e.id = reg_stats.event_id
  `;
  const params: any[] = [];
  const conditions: string[] = [];

  if (filters?.status) {
    conditions.push(`e.status = $${params.length + 1}`);
    params.push(filters.status);
  }

  if (filters?.city) {
    conditions.push(`e.city ILIKE $${params.length + 1}`);
    params.push(`%${filters.city}%`);
  }

  if (filters?.state) {
    conditions.push(`e.state ILIKE $${params.length + 1}`);
    params.push(`%${filters.state}%`);
  }

  if (filters?.organizer_id) {
    conditions.push(`e.organizer_id = $${params.length + 1}`);
    params.push(filters.organizer_id);
  }

  if (filters?.search) {
    conditions.push(`(
      e.title ILIKE $${params.length + 1} OR
      e.description ILIKE $${params.length + 1} OR
      p.full_name ILIKE $${params.length + 1} OR
      e.city ILIKE $${params.length + 1} OR
      e.state ILIKE $${params.length + 1}
    )`);
    const searchTerm = `%${filters.search}%`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
  }

  if (conditions.length > 0) {
    queryText += ' WHERE ' + conditions.join(' AND ');
  }

  queryText += ' ORDER BY e.created_at DESC, e.event_date DESC';

  console.log('🔍 Executing query with filters:', JSON.stringify(filters, null, 2));
  console.log('🔍 Query text:', queryText.substring(0, 200) + '...');
  console.log('🔍 Query params:', params);
  
  const result = await query(queryText, params);
  
  console.log(`📊 getEvents query returned ${result.rows.length} events`);
  if (result.rows.length > 0) {
    console.log('📊 First event status:', result.rows[0].status);
  }
  
  return result.rows.map((row) => ({
    ...row,
    registration_count: parseInt(row.registration_count) || 0,
    confirmed_registrations: parseInt(row.confirmed_registrations) || 0,
    revenue: parseFloat(row.revenue) || 0,
    avg_ticket: parseFloat(row.avg_ticket) || 0,
  }));
};

// Get event by ID
export const getEventById = async (eventId: string) => {
  const result = await query(
    `SELECT 
      e.*,
      p.full_name as organizer_name,
      p.logo_url as organizer_logo_url,
      p.organization_name as organizer_organization_name,
      p.contact_email as organizer_contact_email,
      p.contact_phone as organizer_contact_phone,
      p.website_url as organizer_website_url,
      p.bio as organizer_bio
    FROM events e
    LEFT JOIN profiles p ON e.organizer_id = p.id
    WHERE e.id = $1`,
    [eventId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

// Create event
export const createEvent = async (data: CreateEventData) => {
  console.log('🔧 createEvent called with:', data);
  
  const result = await query(
    `INSERT INTO events (
      organizer_id, title, description, event_date, location, 
      city, state, banner_url, regulation_url, result_url, status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *`,
    [
      data.organizer_id,
      data.title,
      data.description || null,
      data.event_date,
      data.location,
      data.city,
      data.state,
      data.banner_url || null,
      data.regulation_url || null,
      data.result_url || null,
      data.status || 'draft',
    ]
  );

  console.log('✅ Event inserted, returned rows:', result.rows.length);
  
  if (result.rows.length === 0) {
    throw new Error('Failed to create event - no rows returned');
  }

  return result.rows[0];
};

// Update event
export const updateEvent = async (eventId: string, data: UpdateEventData) => {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined) {
      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  });

  if (fields.length === 0) {
    throw new Error('No fields to update');
  }

  values.push(eventId);

  const result = await query(
    `UPDATE events 
     SET ${fields.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

// Delete event
export const deleteEvent = async (eventId: string) => {
  const result = await query('DELETE FROM events WHERE id = $1 RETURNING id', [eventId]);
  return result.rows.length > 0;
};

// Check if user is organizer of event
export const isEventOrganizer = async (eventId: string, userId: string): Promise<boolean> => {
  const result = await query(
    'SELECT organizer_id FROM events WHERE id = $1 AND organizer_id = $2',
    [eventId, userId]
  );
  return result.rows.length > 0;
};

