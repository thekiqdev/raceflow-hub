import { query, getClient } from '../config/database.js';

export interface WithdrawRequest {
  id: string;
  organizer_id: string;
  organizer_name?: string;
  amount: number;
  fee: number;
  net_amount: number;
  payment_method: string;
  status: string;
  requested_at: string;
  processed_at?: string;
  processed_by?: string;
  notes?: string;
}

export interface RefundRequest {
  id: string;
  registration_id: string;
  athlete_id: string;
  athlete_name?: string;
  event_id: string;
  event_title?: string;
  amount: number;
  reason: string;
  status: string;
  requested_at: string;
  processed_at?: string;
  processed_by?: string;
  notes?: string;
}

export interface FinancialSettings {
  id: string;
  commission_percentage: number;
  min_withdraw_amount: number;
  payment_gateway: string;
  gateway_public_key?: string;
  gateway_private_key?: string;
  updated_at: string;
  updated_by?: string;
}

export interface FinancialOverview {
  total_revenue: number;
  platform_commissions: number;
  total_withdrawals: number;
  available_balance: number;
  pending_withdrawals: number;
  pending_refunds: number;
}

/**
 * Get financial overview statistics
 */
export const getFinancialOverview = async (): Promise<FinancialOverview> => {
  // Total revenue from paid registrations
  const revenueResult = await query(
    `SELECT COALESCE(SUM(total_amount), 0) as total_revenue
     FROM registrations
     WHERE payment_status = 'paid'`
  );
  const total_revenue = parseFloat(revenueResult.rows[0].total_revenue) || 0;

  // Platform commissions (5% by default, but should use settings)
  const settingsResult = await query('SELECT commission_percentage FROM financial_settings LIMIT 1');
  const commissionPercentage = settingsResult.rows.length > 0 
    ? parseFloat(settingsResult.rows[0].commission_percentage) / 100 
    : 0.05;
  const platform_commissions = total_revenue * commissionPercentage;

  // Total withdrawals
  const withdrawalsResult = await query(
    `SELECT COALESCE(SUM(net_amount), 0) as total_withdrawals
     FROM withdraw_requests
     WHERE status = 'approved'`
  );
  const total_withdrawals = parseFloat(withdrawalsResult.rows[0].total_withdrawals) || 0;

  // Available balance (revenue - commissions - withdrawals)
  const available_balance = total_revenue - platform_commissions - total_withdrawals;

  // Pending withdrawals
  const pendingWithdrawalsResult = await query(
    `SELECT COALESCE(SUM(amount), 0) as pending_withdrawals
     FROM withdraw_requests
     WHERE status = 'pending'`
  );
  const pending_withdrawals = parseFloat(pendingWithdrawalsResult.rows[0].pending_withdrawals) || 0;

  // Pending refunds
  const pendingRefundsResult = await query(
    `SELECT COALESCE(SUM(amount), 0) as pending_refunds
     FROM refund_requests
     WHERE status = 'em_analise'`
  );
  const pending_refunds = parseFloat(pendingRefundsResult.rows[0].pending_refunds) || 0;

  return {
    total_revenue,
    platform_commissions,
    total_withdrawals,
    available_balance,
    pending_withdrawals,
    pending_refunds,
  };
};

/**
 * Get all withdrawal requests
 */
export const getWithdrawRequests = async (status?: string): Promise<WithdrawRequest[]> => {
  let queryText = `
    SELECT 
      wr.*,
      p.full_name as organizer_name
    FROM withdraw_requests wr
    JOIN profiles p ON wr.organizer_id = p.id
  `;

  const params: any[] = [];

  if (status) {
    queryText += ' WHERE wr.status = $1';
    params.push(status);
  }

  queryText += ' ORDER BY wr.requested_at DESC';

  const result = await query(queryText, params);
  return result.rows.map((row) => ({
    id: row.id,
    organizer_id: row.organizer_id,
    organizer_name: row.organizer_name,
    amount: parseFloat(row.amount),
    fee: parseFloat(row.fee),
    net_amount: parseFloat(row.net_amount),
    payment_method: row.payment_method,
    status: row.status,
    requested_at: row.requested_at,
    processed_at: row.processed_at,
    processed_by: row.processed_by,
    notes: row.notes,
  }));
};

/**
 * Get all refund requests
 */
export const getRefundRequests = async (status?: string): Promise<RefundRequest[]> => {
  let queryText = `
    SELECT 
      rr.*,
      pa.full_name as athlete_name,
      e.title as event_title
    FROM refund_requests rr
    JOIN profiles pa ON rr.athlete_id = pa.id
    JOIN events e ON rr.event_id = e.id
  `;

  const params: any[] = [];

  if (status) {
    queryText += ' WHERE rr.status = $1';
    params.push(status);
  }

  queryText += ' ORDER BY rr.requested_at DESC';

  const result = await query(queryText, params);
  return result.rows.map((row) => ({
    id: row.id,
    registration_id: row.registration_id,
    athlete_id: row.athlete_id,
    athlete_name: row.athlete_name,
    event_id: row.event_id,
    event_title: row.event_title,
    amount: parseFloat(row.amount),
    reason: row.reason,
    status: row.status,
    requested_at: row.requested_at,
    processed_at: row.processed_at,
    processed_by: row.processed_by,
    notes: row.notes,
  }));
};

/**
 * Approve withdrawal request
 */
export const approveWithdrawal = async (requestId: string, processedBy: string, notes?: string): Promise<void> => {
  await query(
    `UPDATE withdraw_requests 
     SET status = 'approved', 
         processed_at = NOW(), 
         processed_by = $1,
         notes = $2,
         updated_at = NOW()
     WHERE id = $3`,
    [processedBy, notes || null, requestId]
  );
};

/**
 * Reject withdrawal request
 */
export const rejectWithdrawal = async (requestId: string, processedBy: string, notes?: string): Promise<void> => {
  await query(
    `UPDATE withdraw_requests 
     SET status = 'rejected', 
         processed_at = NOW(), 
         processed_by = $1,
         notes = $2,
         updated_at = NOW()
     WHERE id = $3`,
    [processedBy, notes || null, requestId]
  );
};

/**
 * Approve refund request
 */
export const approveRefund = async (requestId: string, processedBy: string, notes?: string): Promise<void> => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');

    // Update refund request
    await client.query(
      `UPDATE refund_requests 
       SET status = 'aprovado', 
           processed_at = NOW(), 
           processed_by = $1,
           notes = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [processedBy, notes || null, requestId]
    );

    // Get refund details
    const refundResult = await client.query(
      'SELECT registration_id, amount FROM refund_requests WHERE id = $1',
      [requestId]
    );

    if (refundResult.rows.length > 0) {
      const { registration_id, amount } = refundResult.rows[0];

      // Update registration payment status to refunded
      await client.query(
        `UPDATE registrations 
         SET payment_status = 'refunded',
             status = 'cancelled',
             updated_at = NOW()
         WHERE id = $1`,
        [registration_id]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Reject refund request
 */
export const rejectRefund = async (requestId: string, processedBy: string, notes?: string): Promise<void> => {
  await query(
    `UPDATE refund_requests 
     SET status = 'rejeitado', 
         processed_at = NOW(), 
         processed_by = $1,
         notes = $2,
         updated_at = NOW()
     WHERE id = $3`,
    [processedBy, notes || null, requestId]
  );
};

/**
 * Get financial settings
 */
export const getFinancialSettings = async (): Promise<FinancialSettings | null> => {
  const result = await query('SELECT * FROM financial_settings ORDER BY updated_at DESC LIMIT 1');

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    commission_percentage: parseFloat(row.commission_percentage),
    min_withdraw_amount: parseFloat(row.min_withdraw_amount),
    payment_gateway: row.payment_gateway,
    gateway_public_key: row.gateway_public_key,
    gateway_private_key: row.gateway_private_key,
    updated_at: row.updated_at,
    updated_by: row.updated_by,
  };
};

/**
 * Update financial settings
 */
export const updateFinancialSettings = async (
  data: Partial<FinancialSettings>,
  updatedBy: string
): Promise<FinancialSettings> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Check if settings exist
    const existingResult = await client.query('SELECT id FROM financial_settings LIMIT 1');

    let settingsId: string;

    if (existingResult.rows.length > 0) {
      // Update existing
      settingsId = existingResult.rows[0].id;
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (data.commission_percentage !== undefined) {
        updateFields.push(`commission_percentage = $${paramIndex}`);
        values.push(data.commission_percentage);
        paramIndex++;
      }
      if (data.min_withdraw_amount !== undefined) {
        updateFields.push(`min_withdraw_amount = $${paramIndex}`);
        values.push(data.min_withdraw_amount);
        paramIndex++;
      }
      if (data.payment_gateway !== undefined) {
        updateFields.push(`payment_gateway = $${paramIndex}`);
        values.push(data.payment_gateway);
        paramIndex++;
      }
      if (data.gateway_public_key !== undefined) {
        updateFields.push(`gateway_public_key = $${paramIndex}`);
        values.push(data.gateway_public_key);
        paramIndex++;
      }
      if (data.gateway_private_key !== undefined) {
        updateFields.push(`gateway_private_key = $${paramIndex}`);
        values.push(data.gateway_private_key);
        paramIndex++;
      }

      updateFields.push(`updated_at = NOW()`);
      updateFields.push(`updated_by = $${paramIndex}`);
      values.push(updatedBy);
      paramIndex++;

      values.push(settingsId);

      await client.query(
        `UPDATE financial_settings 
         SET ${updateFields.join(', ')}
         WHERE id = $${paramIndex}`,
        values
      );
    } else {
      // Create new
      const insertResult = await client.query(
        `INSERT INTO financial_settings 
         (commission_percentage, min_withdraw_amount, payment_gateway, gateway_public_key, gateway_private_key, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          data.commission_percentage || 5.00,
          data.min_withdraw_amount || 100.00,
          data.payment_gateway || 'mercadopago',
          data.gateway_public_key || null,
          data.gateway_private_key || null,
          updatedBy,
        ]
      );
      settingsId = insertResult.rows[0].id;
    }

    await client.query('COMMIT');

    // Return updated settings
    const settings = await getFinancialSettings();
    if (!settings) {
      throw new Error('Failed to retrieve updated settings');
    }
    return settings;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get financial overview for a specific organizer
 */
export const getOrganizerFinancialOverview = async (organizerId: string): Promise<FinancialOverview> => {
  // Total revenue from paid registrations for this organizer's events
  const revenueResult = await query(
    `SELECT COALESCE(SUM(r.total_amount), 0) as total_revenue
     FROM registrations r
     JOIN events e ON r.event_id = e.id
     WHERE r.payment_status = 'paid'
     AND e.organizer_id = $1`,
    [organizerId]
  );
  const total_revenue = parseFloat(revenueResult.rows[0].total_revenue) || 0;

  // Platform commissions (5% by default, but should use settings)
  const settingsResult = await query('SELECT commission_percentage FROM financial_settings LIMIT 1');
  const commissionPercentage = settingsResult.rows.length > 0 
    ? parseFloat(settingsResult.rows[0].commission_percentage) / 100 
    : 0.05;
  const platform_commissions = total_revenue * commissionPercentage;

  // Total withdrawals for this organizer
  const withdrawalsResult = await query(
    `SELECT COALESCE(SUM(net_amount), 0) as total_withdrawals
     FROM withdraw_requests
     WHERE organizer_id = $1 AND status = 'approved'`,
    [organizerId]
  );
  const total_withdrawals = parseFloat(withdrawalsResult.rows[0].total_withdrawals) || 0;

  // Available balance (revenue - commissions - withdrawals)
  const available_balance = total_revenue - platform_commissions - total_withdrawals;

  // Pending withdrawals for this organizer
  const pendingWithdrawalsResult = await query(
    `SELECT COALESCE(SUM(amount), 0) as pending_withdrawals
     FROM withdraw_requests
     WHERE organizer_id = $1 AND status = 'pending'`,
    [organizerId]
  );
  const pending_withdrawals = parseFloat(pendingWithdrawalsResult.rows[0].pending_withdrawals) || 0;

  // Pending refunds for this organizer's events
  const pendingRefundsResult = await query(
    `SELECT COALESCE(SUM(rr.amount), 0) as pending_refunds
     FROM refund_requests rr
     JOIN events e ON rr.event_id = e.id
     WHERE rr.status = 'em_analise'
     AND e.organizer_id = $1`,
    [organizerId]
  );
  const pending_refunds = parseFloat(pendingRefundsResult.rows[0].pending_refunds) || 0;

  return {
    total_revenue,
    platform_commissions,
    total_withdrawals,
    available_balance,
    pending_withdrawals,
    pending_refunds,
  };
};

/**
 * Get withdrawal requests for a specific organizer
 */
export const getOrganizerWithdrawRequests = async (organizerId: string, status?: string): Promise<WithdrawRequest[]> => {
  let queryText = `
    SELECT 
      wr.*,
      p.full_name as organizer_name
    FROM withdraw_requests wr
    JOIN profiles p ON wr.organizer_id = p.id
    WHERE wr.organizer_id = $1
  `;

  const params: any[] = [organizerId];

  if (status) {
    queryText += ' AND wr.status = $2';
    params.push(status);
  }

  queryText += ' ORDER BY wr.requested_at DESC';

  const result = await query(queryText, params);
  return result.rows.map((row) => ({
    id: row.id,
    organizer_id: row.organizer_id,
    organizer_name: row.organizer_name,
    amount: parseFloat(row.amount),
    fee: parseFloat(row.fee),
    net_amount: parseFloat(row.net_amount),
    payment_method: row.payment_method,
    status: row.status,
    requested_at: row.requested_at,
    processed_at: row.processed_at,
    processed_by: row.processed_by,
    notes: row.notes,
  }));
};

/**
 * Create withdrawal request for organizer
 */
export interface CreateWithdrawRequestData {
  organizer_id: string;
  amount: number;
  payment_method: 'PIX' | 'TED' | 'BANK_TRANSFER';
  pix_key?: string;
}

export const createWithdrawRequest = async (data: CreateWithdrawRequestData): Promise<WithdrawRequest> => {
  // Get financial settings for fee calculation
  const settingsResult = await query('SELECT commission_percentage, min_withdraw_amount FROM financial_settings LIMIT 1');
  const minWithdrawAmount = settingsResult.rows.length > 0 
    ? parseFloat(settingsResult.rows[0].min_withdraw_amount) || 100 
    : 100;

  if (data.amount < minWithdrawAmount) {
    throw new Error(`Valor mínimo para saque é R$ ${minWithdrawAmount.toFixed(2)}`);
  }

  // Calculate fee (1% of amount)
  const fee = data.amount * 0.01;
  const net_amount = data.amount - fee;

  // Get organizer's available balance
  const overview = await getOrganizerFinancialOverview(data.organizer_id);
  if (data.amount > overview.available_balance) {
    throw new Error('Saldo insuficiente para realizar o saque');
  }

  const result = await query(
    `INSERT INTO withdraw_requests (
      organizer_id, amount, fee, net_amount, payment_method, status
    )
    VALUES ($1, $2, $3, $4, $5, 'pending')
    RETURNING *`,
    [data.organizer_id, data.amount, fee, net_amount, data.payment_method]
  );

  return {
    id: result.rows[0].id,
    organizer_id: result.rows[0].organizer_id,
    amount: parseFloat(result.rows[0].amount),
    fee: parseFloat(result.rows[0].fee),
    net_amount: parseFloat(result.rows[0].net_amount),
    payment_method: result.rows[0].payment_method,
    status: result.rows[0].status,
    requested_at: result.rows[0].requested_at,
  };
};

