import { query } from '../config/database.js';

export interface SupportTicket {
  id: string;
  user_id: string;
  user_name?: string;
  user_type?: string;
  subject: string;
  message: string;
  status: string;
  priority: string;
  category?: string;
  assigned_to?: string;
  assigned_to_name?: string;
  messages_count?: number;
  created_at: string;
  updated_at: string;
  closed_at?: string;
}

export interface SupportTicketMessage {
  id: string;
  ticket_id: string;
  user_id: string;
  user_name?: string;
  message: string;
  is_internal: boolean;
  created_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  target_audience: string;
  status: string;
  scheduled_at?: string;
  published_at?: string;
  created_by?: string;
  created_by_name?: string;
  reads_count?: number;
  created_at: string;
  updated_at: string;
}

/**
 * Get all support tickets
 */
export const getSupportTickets = async (filters?: {
  status?: string;
  priority?: string;
  search?: string;
  assigned_to?: string;
}): Promise<SupportTicket[]> => {
  let queryText = `
    SELECT 
      st.*,
      p.full_name as user_name,
      ur.role as user_type,
      assigned.full_name as assigned_to_name,
      COUNT(DISTINCT stm.id) as messages_count
    FROM support_tickets st
    LEFT JOIN profiles p ON st.user_id = p.id
    LEFT JOIN user_roles ur ON p.id = ur.user_id
    LEFT JOIN profiles assigned ON st.assigned_to = assigned.id
    LEFT JOIN support_ticket_messages stm ON st.id = stm.ticket_id
  `;

  const params: any[] = [];
  const conditions: string[] = [];

  if (filters?.status) {
    conditions.push(`st.status = $${params.length + 1}`);
    params.push(filters.status);
  }

  if (filters?.priority) {
    conditions.push(`st.priority = $${params.length + 1}`);
    params.push(filters.priority);
  }

  if (filters?.assigned_to) {
    conditions.push(`st.assigned_to = $${params.length + 1}`);
    params.push(filters.assigned_to);
  }

  if (filters?.search) {
    conditions.push(`(
      st.subject ILIKE $${params.length + 1} OR
      st.message ILIKE $${params.length + 1} OR
      p.full_name ILIKE $${params.length + 1}
    )`);
    const searchTerm = `%${filters.search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  if (conditions.length > 0) {
    queryText += ' WHERE ' + conditions.join(' AND ');
  }

  queryText += ' GROUP BY st.id, p.full_name, ur.role, assigned.full_name ORDER BY st.created_at DESC';

  const result = await query(queryText, params);
  return result.rows.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    user_name: row.user_name,
    user_type: row.user_type,
    subject: row.subject,
    message: row.message,
    status: row.status,
    priority: row.priority,
    category: row.category,
    assigned_to: row.assigned_to,
    assigned_to_name: row.assigned_to_name,
    messages_count: parseInt(row.messages_count) || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
    closed_at: row.closed_at,
  }));
};

/**
 * Get ticket by ID
 */
export const getTicketById = async (ticketId: string): Promise<SupportTicket | null> => {
  const result = await query(
    `SELECT 
      st.*,
      p.full_name as user_name,
      ur.role as user_type,
      assigned.full_name as assigned_to_name,
      COUNT(DISTINCT stm.id) as messages_count
    FROM support_tickets st
    LEFT JOIN profiles p ON st.user_id = p.id
    LEFT JOIN user_roles ur ON p.id = ur.user_id
    LEFT JOIN profiles assigned ON st.assigned_to = assigned.id
    LEFT JOIN support_ticket_messages stm ON st.id = stm.ticket_id
    WHERE st.id = $1
    GROUP BY st.id, p.full_name, ur.role, assigned.full_name`,
    [ticketId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    user_id: row.user_id,
    user_name: row.user_name,
    user_type: row.user_type,
    subject: row.subject,
    message: row.message,
    status: row.status,
    priority: row.priority,
    category: row.category,
    assigned_to: row.assigned_to,
    assigned_to_name: row.assigned_to_name,
    messages_count: parseInt(row.messages_count) || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
    closed_at: row.closed_at,
  };
};

/**
 * Get ticket messages
 */
export const getTicketMessages = async (ticketId: string): Promise<SupportTicketMessage[]> => {
  const result = await query(
    `SELECT 
      stm.*,
      p.full_name as user_name
    FROM support_ticket_messages stm
    LEFT JOIN profiles p ON stm.user_id = p.id
    WHERE stm.ticket_id = $1
    ORDER BY stm.created_at ASC`,
    [ticketId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    ticket_id: row.ticket_id,
    user_id: row.user_id,
    user_name: row.user_name,
    message: row.message,
    is_internal: row.is_internal,
    created_at: row.created_at,
  }));
};

/**
 * Update ticket status
 */
export const updateTicketStatus = async (
  ticketId: string,
  status: string,
  assignedTo?: string
): Promise<SupportTicket | null> => {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  fields.push(`status = $${paramIndex}`);
  values.push(status);
  paramIndex++;

  if (assignedTo !== undefined) {
    fields.push(`assigned_to = $${paramIndex}`);
    values.push(assignedTo || null);
    paramIndex++;
  }

  if (status === 'fechado' || status === 'resolvido') {
    fields.push(`closed_at = NOW()`);
  } else if (status !== 'fechado' && status !== 'resolvido') {
    fields.push(`closed_at = NULL`);
  }

  fields.push(`updated_at = NOW()`);
  values.push(ticketId);

  const result = await query(
    `UPDATE support_tickets 
     SET ${fields.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    return null;
  }

  return getTicketById(ticketId);
};

/**
 * Add message to ticket
 */
export const addTicketMessage = async (data: {
  ticket_id: string;
  user_id: string;
  message: string;
  is_internal?: boolean;
}): Promise<SupportTicketMessage> => {
  const result = await query(
    `INSERT INTO support_ticket_messages (ticket_id, user_id, message, is_internal)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [data.ticket_id, data.user_id, data.message, data.is_internal || false]
  );

  // Update ticket updated_at
  await query(
    'UPDATE support_tickets SET updated_at = NOW() WHERE id = $1',
    [data.ticket_id]
  );

  // If message is from admin, update ticket status
  if (!data.is_internal) {
    await query(
      `UPDATE support_tickets 
       SET status = CASE 
         WHEN status = 'aberto' THEN 'em_analise'
         ELSE status
       END,
       updated_at = NOW()
       WHERE id = $1`,
      [data.ticket_id]
    );
  }

  const row = result.rows[0];
  const userResult = await query(
    'SELECT full_name FROM profiles WHERE id = $1',
    [row.user_id]
  );

  return {
    ...row,
    user_name: userResult.rows[0]?.full_name,
  };
};

/**
 * Get all announcements
 */
export const getAnnouncements = async (filters?: {
  status?: string;
  target_audience?: string;
}): Promise<Announcement[]> => {
  let queryText = `
    SELECT 
      a.*,
      p.full_name as created_by_name,
      COUNT(DISTINCT ar.id) as reads_count
    FROM announcements a
    LEFT JOIN profiles p ON a.created_by = p.id
    LEFT JOIN announcement_reads ar ON a.id = ar.announcement_id
  `;

  const params: any[] = [];
  const conditions: string[] = [];

  if (filters?.status) {
    conditions.push(`a.status = $${params.length + 1}`);
    params.push(filters.status);
  }

  if (filters?.target_audience) {
    conditions.push(`a.target_audience = $${params.length + 1}`);
    params.push(filters.target_audience);
  }

  if (conditions.length > 0) {
    queryText += ' WHERE ' + conditions.join(' AND ');
  }

  queryText += ' GROUP BY a.id, p.full_name ORDER BY a.created_at DESC';

  const result = await query(queryText, params);
  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    target_audience: row.target_audience,
    status: row.status,
    scheduled_at: row.scheduled_at,
    published_at: row.published_at,
    created_by: row.created_by,
    created_by_name: row.created_by_name,
    reads_count: parseInt(row.reads_count) || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
};

/**
 * Create announcement
 */
export const createAnnouncement = async (data: {
  title: string;
  content: string;
  target_audience: string;
  status: string;
  scheduled_at?: string;
  created_by: string;
}): Promise<Announcement> => {
  const result = await query(
    `INSERT INTO announcements (title, content, target_audience, status, scheduled_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      data.title,
      data.content,
      data.target_audience,
      data.status,
      data.scheduled_at || null,
      data.created_by,
    ]
  );

  const row = result.rows[0];
  const userResult = await query(
    'SELECT full_name FROM profiles WHERE id = $1',
    [row.created_by]
  );

  return {
    ...row,
    created_by_name: userResult.rows[0]?.full_name,
    reads_count: 0,
  };
};

/**
 * Update announcement
 */
export const updateAnnouncement = async (
  announcementId: string,
  data: {
    title?: string;
    content?: string;
    target_audience?: string;
    status?: string;
    scheduled_at?: string;
  }
): Promise<Announcement | null> => {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.title !== undefined) {
    fields.push(`title = $${paramIndex}`);
    values.push(data.title);
    paramIndex++;
  }

  if (data.content !== undefined) {
    fields.push(`content = $${paramIndex}`);
    values.push(data.content);
    paramIndex++;
  }

  if (data.target_audience !== undefined) {
    fields.push(`target_audience = $${paramIndex}`);
    values.push(data.target_audience);
    paramIndex++;
  }

  if (data.status !== undefined) {
    fields.push(`status = $${paramIndex}`);
    values.push(data.status);
    paramIndex++;

    if (data.status === 'published') {
      fields.push(`published_at = NOW()`);
    }
  }

  if (data.scheduled_at !== undefined) {
    fields.push(`scheduled_at = $${paramIndex}`);
    values.push(data.scheduled_at || null);
    paramIndex++;
  }

  if (fields.length === 0) {
    throw new Error('No fields to update');
  }

  fields.push(`updated_at = NOW()`);
  values.push(announcementId);

  const result = await query(
    `UPDATE announcements 
     SET ${fields.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const userResult = await query(
    'SELECT full_name FROM profiles WHERE id = $1',
    [row.created_by]
  );

  const readsResult = await query(
    'SELECT COUNT(*) as count FROM announcement_reads WHERE announcement_id = $1',
    [announcementId]
  );

  return {
    ...row,
    created_by_name: userResult.rows[0]?.full_name,
    reads_count: parseInt(readsResult.rows[0].count) || 0,
  };
};

/**
 * Delete announcement
 */
export const deleteAnnouncement = async (announcementId: string): Promise<boolean> => {
  const result = await query(
    'DELETE FROM announcements WHERE id = $1 RETURNING id',
    [announcementId]
  );

  return result.rows.length > 0;
};




