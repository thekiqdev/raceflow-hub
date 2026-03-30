import { query } from '../config/database.js';

export interface ContactMessage {
  id: string;
  type: 'event' | 'platform';
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  event_id: string | null;
  organizer_id: string | null;
  event_title?: string;
  organizer_name?: string;
  status: 'new' | 'viewed' | 'replied' | 'closed';
  created_at: Date;
  updated_at: Date;
}

export interface CreateContactMessageData {
  type: 'event' | 'platform';
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  event_id?: string;
  organizer_id?: string;
}

export interface UpdateContactMessageData {
  status?: 'new' | 'viewed' | 'replied' | 'closed';
}

/**
 * Create a new contact message
 */
export const createContactMessage = async (data: CreateContactMessageData): Promise<ContactMessage> => {
  const result = await query(
    `INSERT INTO contact_messages (
      type, name, email, phone, subject, message, event_id, organizer_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [
      data.type,
      data.name,
      data.email,
      data.phone || null,
      data.subject,
      data.message,
      data.event_id || null,
      data.organizer_id || null,
    ]
  );

  return {
    id: result.rows[0].id,
    type: result.rows[0].type,
    name: result.rows[0].name,
    email: result.rows[0].email,
    phone: result.rows[0].phone,
    subject: result.rows[0].subject,
    message: result.rows[0].message,
    event_id: result.rows[0].event_id,
    organizer_id: result.rows[0].organizer_id,
    status: result.rows[0].status,
    created_at: result.rows[0].created_at,
    updated_at: result.rows[0].updated_at,
  };
};

/**
 * Get all contact messages with optional filters
 */
export const getContactMessages = async (filters?: {
  type?: 'event' | 'platform';
  status?: string;
  search?: string;
  organizer_id?: string;
}): Promise<ContactMessage[]> => {
  let sql = `
    SELECT 
      cm.*,
      e.title as event_title,
      p.full_name as organizer_name
    FROM contact_messages cm
    LEFT JOIN events e ON cm.event_id = e.id
    LEFT JOIN profiles p ON cm.organizer_id = p.id
    WHERE 1=1
  `;
  const params: any[] = [];
  let paramCount = 1;

  if (filters?.type) {
    sql += ` AND cm.type = $${paramCount++}`;
    params.push(filters.type);
  }

  if (filters?.status) {
    sql += ` AND cm.status = $${paramCount++}`;
    params.push(filters.status);
  }

  if (filters?.organizer_id) {
    sql += ` AND cm.organizer_id = $${paramCount++}`;
    params.push(filters.organizer_id);
  }

  if (filters?.search) {
    sql += ` AND (
      cm.name ILIKE $${paramCount} OR
      cm.email ILIKE $${paramCount} OR
      cm.subject ILIKE $${paramCount} OR
      cm.message ILIKE $${paramCount} OR
      e.title ILIKE $${paramCount}
    )`;
    params.push(`%${filters.search}%`);
    paramCount++;
  }

  sql += ' ORDER BY cm.created_at DESC';

  const result = await query(sql, params);

  return result.rows.map((row) => ({
    id: row.id,
    type: row.type,
    name: row.name,
    email: row.email,
    phone: row.phone,
    subject: row.subject,
    message: row.message,
    event_id: row.event_id,
    organizer_id: row.organizer_id,
    event_title: row.event_title,
    organizer_name: row.organizer_name,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
};

/**
 * Get contact message by ID
 */
export const getContactMessageById = async (id: string): Promise<ContactMessage | null> => {
  const result = await query(
    `SELECT 
      cm.*,
      e.title as event_title,
      p.full_name as organizer_name
    FROM contact_messages cm
    LEFT JOIN events e ON cm.event_id = e.id
    LEFT JOIN profiles p ON cm.organizer_id = p.id
    WHERE cm.id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    email: row.email,
    phone: row.phone,
    subject: row.subject,
    message: row.message,
    event_id: row.event_id,
    organizer_id: row.organizer_id,
    event_title: row.event_title,
    organizer_name: row.organizer_name,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

/**
 * Update contact message
 */
export const updateContactMessage = async (
  id: string,
  data: UpdateContactMessageData
): Promise<ContactMessage> => {
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
    `UPDATE contact_messages 
     SET ${updates.join(', ')}
     WHERE id = $${paramCount}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new Error('Contact message not found');
  }

  const row = result.rows[0];
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    email: row.email,
    phone: row.phone,
    subject: row.subject,
    message: row.message,
    event_id: row.event_id,
    organizer_id: row.organizer_id,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

/**
 * Get count of new contact messages for admin (platform type)
 */
export const getNewPlatformMessagesCount = async (): Promise<number> => {
  const result = await query(
    "SELECT COUNT(*) as count FROM contact_messages WHERE type = 'platform' AND status = 'new'"
  );
  return parseInt(result.rows[0].count) || 0;
};

/**
 * Get count of new contact messages for organizer (event type for their events)
 */
export const getNewEventMessagesCount = async (organizerId: string): Promise<number> => {
  const result = await query(
    `SELECT COUNT(*) as count 
     FROM contact_messages 
     WHERE type = 'event' 
     AND organizer_id = $1 
     AND status = 'new'`,
    [organizerId]
  );
  return parseInt(result.rows[0].count) || 0;
};

