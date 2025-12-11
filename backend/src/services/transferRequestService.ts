import { query } from '../config/database.js';

export interface TransferRequest {
  id: string;
  registration_id: string;
  requested_by: string;
  new_runner_cpf?: string;
  new_runner_email?: string;
  new_runner_id?: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled';
  transfer_fee: number;
  payment_status: 'pending' | 'paid' | 'refunded';
  asaas_payment_id?: string;
  reason?: string;
  admin_notes?: string;
  processed_by?: string;
  processed_at?: string;
  created_at: string;
  updated_at: string;
  // Joined data
  confirmation_code?: string;
  event_title?: string;
  runner_name?: string;
  new_runner_name?: string;
  requester_name?: string;
}

/**
 * Create a new transfer request
 */
export const createTransferRequest = async (data: {
  registration_id: string;
  requested_by: string;
  new_runner_cpf?: string;
  new_runner_email?: string;
  new_runner_id?: string;
  transfer_fee: number;
  reason?: string;
}): Promise<TransferRequest> => {
  const result = await query(
    `INSERT INTO transfer_requests (
      registration_id, requested_by, new_runner_cpf, new_runner_email, 
      new_runner_id, transfer_fee, reason, status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
    RETURNING *`,
    [
      data.registration_id,
      data.requested_by,
      data.new_runner_cpf || null,
      data.new_runner_email || null,
      data.new_runner_id || null,
      data.transfer_fee,
      data.reason || null,
    ]
  );

  return result.rows[0];
};

/**
 * Get transfer request by ID
 */
export const getTransferRequestById = async (id: string): Promise<TransferRequest | null> => {
  const result = await query(
    `SELECT 
      tr.*,
      r.confirmation_code,
      e.title as event_title,
      p_requester.full_name as requester_name,
      p_runner.full_name as runner_name,
      p_new.full_name as new_runner_name
    FROM transfer_requests tr
    LEFT JOIN registrations r ON tr.registration_id = r.id
    LEFT JOIN events e ON r.event_id = e.id
    LEFT JOIN profiles p_requester ON tr.requested_by = p_requester.id
    LEFT JOIN profiles p_runner ON r.runner_id = p_runner.id
    LEFT JOIN profiles p_new ON tr.new_runner_id = p_new.id
    WHERE tr.id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

/**
 * Get all transfer requests with filters
 */
export const getTransferRequests = async (filters?: {
  status?: string;
  requested_by?: string;
}): Promise<TransferRequest[]> => {
  let queryStr = `
    SELECT 
      tr.*,
      r.confirmation_code,
      e.title as event_title,
      p_requester.full_name as requester_name,
      p_runner.full_name as runner_name,
      p_new.full_name as new_runner_name
    FROM transfer_requests tr
    LEFT JOIN registrations r ON tr.registration_id = r.id
    LEFT JOIN events e ON r.event_id = e.id
    LEFT JOIN profiles p_requester ON tr.requested_by = p_requester.id
    LEFT JOIN profiles p_runner ON r.runner_id = p_runner.id
    LEFT JOIN profiles p_new ON tr.new_runner_id = p_new.id
    WHERE 1=1
  `;
  
  const params: any[] = [];
  let paramIndex = 1;

  if (filters?.status) {
    queryStr += ` AND tr.status = $${paramIndex}`;
    params.push(filters.status);
    paramIndex++;
  }

  if (filters?.requested_by) {
    queryStr += ` AND tr.requested_by = $${paramIndex}`;
    params.push(filters.requested_by);
    paramIndex++;
  }

  queryStr += ` ORDER BY tr.created_at DESC`;

  const result = await query(queryStr, params);
  return result.rows;
};

/**
 * Update transfer request
 */
export const updateTransferRequest = async (
  id: string,
  data: {
    status?: 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled';
    new_runner_id?: string;
    admin_notes?: string;
    processed_by?: string;
    payment_status?: 'pending' | 'paid' | 'refunded';
    asaas_payment_id?: string;
  }
): Promise<TransferRequest | null> => {
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

  // If status is being updated to approved/rejected/completed, set processed_at
  if (data.status && ['approved', 'rejected', 'completed'].includes(data.status)) {
    fields.push(`processed_at = NOW()`);
  }

  fields.push(`updated_at = NOW()`);
  
  // Add id as the last parameter (use current paramIndex before incrementing)
  const idParamIndex = paramIndex;
  values.push(id);

  const result = await query(
    `UPDATE transfer_requests 
     SET ${fields.join(', ')}
     WHERE id = $${idParamIndex}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};


