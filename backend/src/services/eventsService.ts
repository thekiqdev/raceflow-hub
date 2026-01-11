import { query } from '../config/database.js';
import { EventStatus, EventRegistrationStatus, Event } from '../types/index.js';

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
  registration_status?: EventRegistrationStatus | null;
  registration_start_date?: string | null;
  registration_end_date?: string | null;
  registration_auto_mode?: boolean;
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
  registration_status?: EventRegistrationStatus | null;
  registration_start_date?: string | null;
  registration_end_date?: string | null;
  registration_auto_mode?: boolean;
}

/**
 * Calcula o status de inscrições baseado nas datas quando modo automático está ativado
 * @param event Evento com os campos de data e modo automático
 * @returns Status calculado ou null se não for possível calcular
 */
export function calculateRegistrationStatus(event: Partial<Event>): EventRegistrationStatus | null {
  // Se modo automático não está ativado ou datas não estão definidas, retorna null
  if (!event.registration_auto_mode || !event.registration_start_date || !event.registration_end_date) {
    return null;
  }

  const now = new Date();
  const startDate = new Date(event.registration_start_date);
  const endDate = new Date(event.registration_end_date);

  if (now < startDate) {
    return 'not_open';
  } else if (now >= startDate && now <= endDate) {
    return 'open';
  } else {
    return 'closed';
  }
}

// Get all events (with filters and statistics)
export const getEvents = async (filters?: {
  status?: EventStatus;
  city?: string;
  state?: string;
  organizer_id?: string;
  search?: string;
  order_by_date?: 'asc' | 'desc'; // 'asc' = mais próximo primeiro, 'desc' = mais longe primeiro
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
      e.registration_status,
      e.registration_start_date,
      e.registration_end_date,
      e.registration_auto_mode,
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
    const searchTerm = `%${filters.search}%`;
    const searchParamIndex = params.length + 1;
    // Use the same parameter index for all ILIKE conditions (PostgreSQL allows this)
    conditions.push(`(
      COALESCE(e.title, '') ILIKE $${searchParamIndex} OR
      COALESCE(e.description, '') ILIKE $${searchParamIndex} OR
      COALESCE(p.full_name, '') ILIKE $${searchParamIndex} OR
      COALESCE(e.city, '') ILIKE $${searchParamIndex} OR
      COALESCE(e.state, '') ILIKE $${searchParamIndex}
    )`);
    params.push(searchTerm);
  }

  if (conditions.length > 0) {
    queryText += ' WHERE ' + conditions.join(' AND ');
  }

  // Order by event date (default: ASC - mais próximo primeiro)
  const orderBy = filters?.order_by_date === 'desc' ? 'DESC' : 'ASC';
  queryText += ` ORDER BY e.event_date ${orderBy}, e.created_at DESC`;

  console.log('🔍 Executing query with filters:', JSON.stringify(filters, null, 2));
  console.log('🔍 Query text:', queryText);
  console.log('🔍 Query params:', params);
  console.log('🔍 Number of conditions:', conditions.length);
  
  const result = await query(queryText, params);
  
  console.log(`📊 getEvents query returned ${result.rows.length} events`);
  if (result.rows.length > 0) {
    console.log('📊 First event:', {
      id: result.rows[0].id,
      title: result.rows[0].title,
      status: result.rows[0].status,
    });
  } else if (filters?.search) {
    console.log('⚠️ No events found with search term:', filters.search);
  }
  
  // Import getFileUrl to convert file paths to URLs
  const { getFileUrl } = await import('../middleware/upload.js');
  
  return result.rows.map((row) => {
    // Calcular status de inscrições se modo automático estiver ativado
    let effectiveRegistrationStatus = row.registration_status;
    if (row.registration_auto_mode && row.registration_start_date && row.registration_end_date) {
      const calculatedStatus = calculateRegistrationStatus({
        registration_auto_mode: row.registration_auto_mode,
        registration_start_date: row.registration_start_date,
        registration_end_date: row.registration_end_date,
      });
      if (calculatedStatus) {
        effectiveRegistrationStatus = calculatedStatus;
      }
    }

    return {
      ...row,
      banner_url: row.banner_url ? getFileUrl(row.banner_url) : null,
      regulation_url: row.regulation_url ? getFileUrl(row.regulation_url) : null,
      registration_status: effectiveRegistrationStatus,
      registration_count: parseInt(row.registration_count) || 0,
      confirmed_registrations: parseInt(row.confirmed_registrations) || 0,
      revenue: parseFloat(row.revenue) || 0,
      avg_ticket: parseFloat(row.avg_ticket) || 0,
    };
  });
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

  // Import getFileUrl to convert file paths to URLs
  const { getFileUrl } = await import('../middleware/upload.js');
  
  const row = result.rows[0];
  
  // Calcular status de inscrições se modo automático estiver ativado
  let effectiveRegistrationStatus = row.registration_status;
  if (row.registration_auto_mode && row.registration_start_date && row.registration_end_date) {
    const calculatedStatus = calculateRegistrationStatus({
      registration_auto_mode: row.registration_auto_mode,
      registration_start_date: row.registration_start_date,
      registration_end_date: row.registration_end_date,
    });
    if (calculatedStatus) {
      effectiveRegistrationStatus = calculatedStatus;
    }
  }

  return {
    ...row,
    banner_url: row.banner_url ? getFileUrl(row.banner_url) : null,
    regulation_url: row.regulation_url ? getFileUrl(row.regulation_url) : null,
    registration_status: effectiveRegistrationStatus,
  };
};

// Create event
export const createEvent = async (data: CreateEventData) => {
  console.log('🔧 createEvent called with:', data);
  
  // Se modo automático está ativado, calcular status automaticamente
  let registrationStatus = data.registration_status;
  if (data.registration_auto_mode && data.registration_start_date && data.registration_end_date) {
    const calculatedStatus = calculateRegistrationStatus({
      registration_auto_mode: data.registration_auto_mode,
      registration_start_date: data.registration_start_date ? new Date(data.registration_start_date) : null,
      registration_end_date: data.registration_end_date ? new Date(data.registration_end_date) : null,
    });
    if (calculatedStatus) {
      registrationStatus = calculatedStatus;
    }
  }
  
  const result = await query(
    `INSERT INTO events (
      organizer_id, title, description, event_date, location, 
      city, state, banner_url, regulation_url, result_url, status,
      registration_status, registration_start_date, registration_end_date, registration_auto_mode
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
      registrationStatus || null,
      data.registration_start_date || null,
      data.registration_end_date || null,
      data.registration_auto_mode || false,
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
  // Se modo automático está ativado e datas foram fornecidas, calcular status automaticamente
  if (data.registration_auto_mode && data.registration_start_date && data.registration_end_date) {
    const calculatedStatus = calculateRegistrationStatus({
      registration_auto_mode: data.registration_auto_mode,
      registration_start_date: data.registration_start_date ? new Date(data.registration_start_date) : null,
      registration_end_date: data.registration_end_date ? new Date(data.registration_end_date) : null,
    });
    if (calculatedStatus) {
      data.registration_status = calculatedStatus;
    }
  }

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

