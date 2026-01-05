import { query } from '../config/database.js';

export interface Quote {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  event_location: string;
  athletes_count: string;
  same_start_finish: string;
  electric_power: string;
  additional_points: string | null;
  chest_numbers: string;
  distances: string;
  timing_gate: string;
  cronoteam_registration: string;
  event_date: string;
  description: string;
  status: 'new' | 'viewed' | 'contacted' | 'closed';
  created_at: Date;
  updated_at: Date;
}

export interface CreateQuoteData {
  full_name: string;
  phone: string;
  email: string;
  event_location: string;
  athletes_count: string;
  same_start_finish: string;
  electric_power: string;
  additional_points?: string;
  chest_numbers: string;
  distances: string;
  timing_gate: string;
  cronoteam_registration: string;
  event_date: string;
  description: string;
}

export interface UpdateQuoteData {
  status?: 'new' | 'viewed' | 'contacted' | 'closed';
}

/**
 * Create a new quote
 */
export const createQuote = async (data: CreateQuoteData): Promise<Quote> => {
  const result = await query(
    `INSERT INTO quotes (
      full_name, phone, email, event_location, athletes_count,
      same_start_finish, electric_power, additional_points,
      chest_numbers, distances, timing_gate, cronoteam_registration,
      event_date, description
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *`,
    [
      data.full_name,
      data.phone,
      data.email,
      data.event_location,
      data.athletes_count,
      data.same_start_finish,
      data.electric_power,
      data.additional_points || null,
      data.chest_numbers,
      data.distances,
      data.timing_gate,
      data.cronoteam_registration,
      data.event_date,
      data.description,
    ]
  );

  return {
    id: result.rows[0].id,
    full_name: result.rows[0].full_name,
    phone: result.rows[0].phone,
    email: result.rows[0].email,
    event_location: result.rows[0].event_location,
    athletes_count: result.rows[0].athletes_count,
    same_start_finish: result.rows[0].same_start_finish,
    electric_power: result.rows[0].electric_power,
    additional_points: result.rows[0].additional_points,
    chest_numbers: result.rows[0].chest_numbers,
    distances: result.rows[0].distances,
    timing_gate: result.rows[0].timing_gate,
    cronoteam_registration: result.rows[0].cronoteam_registration,
    event_date: result.rows[0].event_date,
    description: result.rows[0].description,
    status: result.rows[0].status,
    created_at: result.rows[0].created_at,
    updated_at: result.rows[0].updated_at,
  };
};

/**
 * Get all quotes with optional filters
 */
export const getQuotes = async (filters?: {
  status?: string;
  search?: string;
}): Promise<Quote[]> => {
  let sql = 'SELECT * FROM quotes WHERE 1=1';
  const params: any[] = [];
  let paramCount = 1;

  if (filters?.status) {
    sql += ` AND status = $${paramCount++}`;
    params.push(filters.status);
  }

  if (filters?.search) {
    sql += ` AND (
      full_name ILIKE $${paramCount} OR
      email ILIKE $${paramCount} OR
      event_location ILIKE $${paramCount} OR
      phone ILIKE $${paramCount}
    )`;
    params.push(`%${filters.search}%`);
    paramCount++;
  }

  sql += ' ORDER BY created_at DESC';

  const result = await query(sql, params);

  return result.rows.map((row) => ({
    id: row.id,
    full_name: row.full_name,
    phone: row.phone,
    email: row.email,
    event_location: row.event_location,
    athletes_count: row.athletes_count,
    same_start_finish: row.same_start_finish,
    electric_power: row.electric_power,
    additional_points: row.additional_points,
    chest_numbers: row.chest_numbers,
    distances: row.distances,
    timing_gate: row.timing_gate,
    cronoteam_registration: row.cronoteam_registration,
    event_date: row.event_date,
    description: row.description,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
};

/**
 * Get quote by ID
 */
export const getQuoteById = async (id: string): Promise<Quote | null> => {
  const result = await query('SELECT * FROM quotes WHERE id = $1', [id]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    full_name: row.full_name,
    phone: row.phone,
    email: row.email,
    event_location: row.event_location,
    athletes_count: row.athletes_count,
    same_start_finish: row.same_start_finish,
    electric_power: row.electric_power,
    additional_points: row.additional_points,
    chest_numbers: row.chest_numbers,
    distances: row.distances,
    timing_gate: row.timing_gate,
    cronoteam_registration: row.cronoteam_registration,
    event_date: row.event_date,
    description: row.description,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

/**
 * Update quote
 */
export const updateQuote = async (
  id: string,
  data: UpdateQuoteData
): Promise<Quote> => {
  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (data.status !== undefined) {
    updates.push(`status = $${paramCount++}`);
    values.push(data.status);
  }

  if (updates.length === 0) {
    throw new Error('No fields to update');
  }

  updates.push(`updated_at = NOW()`);
  values.push(id);

  const result = await query(
    `UPDATE quotes 
     SET ${updates.join(', ')}
     WHERE id = $${paramCount}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new Error('Quote not found');
  }

  const row = result.rows[0];
  return {
    id: row.id,
    full_name: row.full_name,
    phone: row.phone,
    email: row.email,
    event_location: row.event_location,
    athletes_count: row.athletes_count,
    same_start_finish: row.same_start_finish,
    electric_power: row.electric_power,
    additional_points: row.additional_points,
    chest_numbers: row.chest_numbers,
    distances: row.distances,
    timing_gate: row.timing_gate,
    cronoteam_registration: row.cronoteam_registration,
    event_date: row.event_date,
    description: row.description,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

/**
 * Get count of new quotes
 */
export const getNewQuotesCount = async (): Promise<number> => {
  const result = await query(
    "SELECT COUNT(*) as count FROM quotes WHERE status = 'new'"
  );
  return parseInt(result.rows[0].count) || 0;
};

