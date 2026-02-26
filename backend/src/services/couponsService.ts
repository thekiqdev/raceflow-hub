import { query } from '../config/database.js';
import { Coupon, CouponType } from '../types/index.js';

export interface CreateCouponData {
  organizer_id: string;
  event_ids?: string[] | null;
  leader_id?: string | null;
  code: string;
  name: string;
  type: CouponType;
  discount_value: number;
  expiration_date?: Date | null;
  max_uses?: number | null;
  is_active?: boolean;
}

export interface UpdateCouponData {
  event_ids?: string[] | null;
  leader_id?: string | null;
  name?: string;
  type?: CouponType;
  discount_value?: number;
  expiration_date?: Date | null;
  max_uses?: number | null;
  is_active?: boolean;
}

/**
 * Check if coupon code is unique for the organizer
 */
const isCodeUnique = async (code: string, organizerId: string, excludeId?: string): Promise<boolean> => {
  let queryText = 'SELECT id FROM coupons WHERE code = $1 AND organizer_id = $2';
  const params: any[] = [code, organizerId];
  
  if (excludeId) {
    queryText += ' AND id != $3';
    params.push(excludeId);
  }
  
  const result = await query(queryText, params);
  return result.rows.length === 0;
};

/**
 * Get event IDs for a coupon
 */
const getCouponEventIds = async (couponId: string): Promise<string[]> => {
  const result = await query(
    'SELECT event_id FROM coupon_events WHERE coupon_id = $1',
    [couponId]
  );
  return result.rows.map(row => row.event_id);
};

/**
 * Set event IDs for a coupon (replaces existing)
 */
const setCouponEventIds = async (couponId: string, eventIds: string[] | null): Promise<void> => {
  // Delete existing relationships
  await query('DELETE FROM coupon_events WHERE coupon_id = $1', [couponId]);
  
  // Insert new relationships if eventIds is provided and not empty
  if (eventIds && eventIds.length > 0) {
    for (const eventId of eventIds) {
      await query(
        'INSERT INTO coupon_events (coupon_id, event_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [couponId, eventId]
      );
    }
  }
};

/**
 * Create a new coupon
 */
export const createCoupon = async (data: CreateCouponData): Promise<Coupon> => {
  // Validate discount value based on type
  if (data.type === 'percentage' && (data.discount_value <= 0 || data.discount_value > 100)) {
    throw new Error('Discount percentage must be between 0 and 100');
  }
  
  if (data.type === 'fixed' && data.discount_value <= 0) {
    throw new Error('Fixed discount value must be greater than 0');
  }
  
  // Check if code is unique for this organizer
  const codeIsUnique = await isCodeUnique(data.code, data.organizer_id);
  if (!codeIsUnique) {
    throw new Error('Coupon code already exists for this organizer');
  }
  
  // Create coupon (event_id is kept for backward compatibility, but will be NULL)
  const result = await query(
    `INSERT INTO coupons (
      organizer_id, event_id, leader_id, code, name, type, discount_value, 
      expiration_date, max_uses, is_active
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      data.organizer_id,
      null, // event_id is deprecated, use coupon_events instead
      data.leader_id || null,
      data.code.toUpperCase().trim(),
      data.name,
      data.type,
      data.discount_value,
      data.expiration_date || null,
      data.max_uses || null,
      data.is_active !== undefined ? data.is_active : true,
    ]
  );
  
  const row = result.rows[0];
  const coupon: Coupon = {
    ...row,
    discount_value: parseFloat(row.discount_value) || 0,
    current_uses: parseInt(row.current_uses) || 0,
  } as Coupon;
  
  // Set event relationships if provided
  if (data.event_ids && data.event_ids.length > 0) {
    await setCouponEventIds(coupon.id, data.event_ids);
  }
  
  // Fetch coupon with event IDs
  const eventIds = await getCouponEventIds(coupon.id);
  return { ...coupon, event_ids: eventIds } as any;
};

/**
 * Get coupon by ID
 */
export const getCouponById = async (couponId: string): Promise<Coupon | null> => {
  const result = await query(
    'SELECT * FROM coupons WHERE id = $1',
    [couponId]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  const row = result.rows[0];
  const coupon: Coupon = {
    ...row,
    discount_value: parseFloat(row.discount_value) || 0,
    current_uses: parseInt(row.current_uses) || 0,
  } as Coupon;
  const eventIds = await getCouponEventIds(couponId);
  return { ...coupon, event_ids: eventIds } as any;
};

/**
 * Get coupon by code (without organizer ID - useful for finding leader coupons)
 */
export const getCouponByCodeOnly = async (code: string): Promise<Coupon | null> => {
  const normalized = (code || '').trim().toUpperCase();
  if (!normalized) return null;
  const result = await query(
    'SELECT * FROM coupons WHERE UPPER(TRIM(code)) = $1',
    [normalized]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  const row = result.rows[0];
  const coupon: Coupon = {
    ...row,
    discount_value: parseFloat(row.discount_value) || 0,
    current_uses: parseInt(row.current_uses) || 0,
  } as Coupon;
  
  // Get event IDs for this coupon
  const eventIds = await getCouponEventIds(coupon.id);
  return { ...coupon, event_ids: eventIds } as any;
};

/**
 * Get coupon by code and organizer ID
 */
export const getCouponByCode = async (code: string, organizerId: string): Promise<Coupon | null> => {
  const result = await query(
    'SELECT * FROM coupons WHERE code = $1 AND organizer_id = $2',
    [code.toUpperCase().trim(), organizerId]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  const row = result.rows[0];
  return {
    ...row,
    discount_value: parseFloat(row.discount_value) || 0,
    current_uses: parseInt(row.current_uses) || 0,
  } as Coupon;
};

/**
 * Get all coupons for an organizer
 */
export const getCouponsByOrganizer = async (organizerId: string): Promise<Coupon[]> => {
  const result = await query(
    'SELECT * FROM coupons WHERE organizer_id = $1 ORDER BY created_at DESC',
    [organizerId]
  );
  
  // Get event IDs for each coupon
  const coupons = await Promise.all(
    result.rows.map(async (row) => {
      const coupon: Coupon = {
        ...row,
        discount_value: parseFloat(row.discount_value) || 0,
        current_uses: parseInt(row.current_uses) || 0,
      } as Coupon;
      const eventIds = await getCouponEventIds(coupon.id);
      return { ...coupon, event_ids: eventIds } as any;
    })
  );
  
  return coupons;
};

/**
 * Get coupons by leader ID
 */
export const getCouponsByLeader = async (leaderId: string, organizerId?: string): Promise<Coupon[]> => {
  let queryText = 'SELECT * FROM coupons WHERE leader_id = $1';
  const params: any[] = [leaderId];
  
  // Filter by organizer if provided
  if (organizerId) {
    queryText += ' AND organizer_id = $2';
    params.push(organizerId);
  }
  
  queryText += ' ORDER BY created_at DESC';
  
  const result = await query(queryText, params);
  
  const coupons = await Promise.all(
    result.rows.map(async (row) => {
      const coupon: Coupon = {
        ...row,
        discount_value: parseFloat(row.discount_value) || 0,
        current_uses: parseInt(row.current_uses) || 0,
      } as Coupon;
      const eventIds = await getCouponEventIds(coupon.id);
      return { ...coupon, event_ids: eventIds } as any;
    })
  );
  
  return coupons;
};

/**
 * Get coupon associated with a leader event commission
 * This function finds the coupon that was created for a specific commission
 * by matching the commission ID in the coupon code
 */
export const getCouponByEventCommission = async (
  leaderId: string,
  eventId: string,
  commissionId?: string // NOVO: ID da comissão específica (opcional)
): Promise<Coupon | null> => {
  let commission: any = null;
  
  // NOVO: Se commissionId foi fornecido, buscar comissão específica
  if (commissionId) {
    const { getLeaderEventCommissionById } = await import('./leaderEventCommissionsService.js');
    commission = await getLeaderEventCommissionById(commissionId);
    
    // Verificar se a comissão pertence ao líder e evento corretos
    if (commission && (commission.leader_id !== leaderId || commission.event_id !== eventId)) {
      console.log(`⚠️ [getCouponByEventCommission] Comissão ${commissionId} não pertence ao líder ${leaderId} ou evento ${eventId}`);
      commission = null;
    }
  }
  
  // Se não encontrou por ID ou não foi fornecido, buscar pela lógica padrão
  if (!commission) {
    const { getLeaderEventCommission } = await import('./leaderEventCommissionsService.js');
    commission = await getLeaderEventCommission(leaderId, eventId);
  }
  
  if (!commission) {
    console.log(`ℹ️ [getCouponByEventCommission] Nenhuma comissão encontrada para líder ${leaderId} e evento ${eventId}${commissionId ? ` (procurando comissão ${commissionId})` : ''}`);
    return null;
  }
  
  // Get all coupons for this leader
  const coupons = await getCouponsByLeader(leaderId);
  
  if (coupons.length === 0) {
    console.log(`ℹ️ [getCouponByEventCommission] Nenhum cupom encontrado para líder ${leaderId}`);
    return null;
  }
  
  // Extract commission ID short (first 8 chars without dashes)
  const commissionIdShort = commission.id.replace(/-/g, '').substring(0, 8).toUpperCase();
  
  // Find coupon by matching commission ID in the code
  let coupon = coupons.find((c) => {
    // Check if coupon is for this event
    const matchesEvent = c.event_ids?.includes(eventId) || c.event_id === eventId;
    if (!matchesEvent) return false;
    
    // Check if coupon code contains the commission ID
    if (c.code && c.code.includes(commissionIdShort)) {
      return true;
    }
    
    // Fallback: check if coupon name contains commission name
    if (commission.name && c.name && c.name.includes(commission.name)) {
      return true;
    }
    
    return false;
  });
  
  // If not found by ID, try to find by event (if only one coupon for this event)
  if (!coupon) {
    const eventCoupons = coupons.filter((c) => 
      c.event_ids?.includes(eventId) || c.event_id === eventId
    );
    
    // If there's only one coupon for this event, use it
    if (eventCoupons.length === 1) {
      coupon = eventCoupons[0];
      console.log(`ℹ️ [getCouponByEventCommission] Usando único cupom encontrado para o evento: ${coupon.code}`);
    } else if (eventCoupons.length > 1) {
      // If multiple coupons, try to match by name or use the first one as fallback
      coupon = eventCoupons.find((c) => 
        commission.name && c.name && c.name.includes(commission.name)
      ) || eventCoupons[0];
      console.log(`⚠️ [getCouponByEventCommission] Múltiplos cupons encontrados, usando: ${coupon.code}`);
    }
  }
  
  if (coupon) {
    console.log(`✅ [getCouponByEventCommission] Cupom encontrado: ${coupon.code} para comissão ${commission.id}`);
    
    // Validate coupon is active
    if (!coupon.is_active) {
      console.log(`⚠️ [getCouponByEventCommission] Cupom ${coupon.code} está inativo`);
      // Return it anyway, but log warning
    }
    
    return coupon;
  }
  
  console.log(`❌ [getCouponByEventCommission] Nenhum cupom encontrado para comissão ${commission.id}`);
  return null;
};

/**
 * Update coupon
 */
export const updateCoupon = async (couponId: string, data: UpdateCouponData): Promise<Coupon> => {
  const coupon = await getCouponById(couponId);
  if (!coupon) {
    throw new Error('Coupon not found');
  }
  
  // Validate discount value if type is being updated
  if (data.type !== undefined || data.discount_value !== undefined) {
    const type = data.type || coupon.type;
    const discountValue = data.discount_value !== undefined ? data.discount_value : coupon.discount_value;
    
    if (type === 'percentage' && (discountValue <= 0 || discountValue > 100)) {
      throw new Error('Discount percentage must be between 0 and 100');
    }
    
    if (type === 'fixed' && discountValue <= 0) {
      throw new Error('Fixed discount value must be greater than 0');
    }
  }
  
  // Build update query dynamically
  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;
  
  if (data.name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    values.push(data.name);
  }
  
  if (data.type !== undefined) {
    updates.push(`type = $${paramIndex++}`);
    values.push(data.type);
  }
  
  if (data.discount_value !== undefined) {
    updates.push(`discount_value = $${paramIndex++}`);
    values.push(data.discount_value);
  }
  
  if (data.expiration_date !== undefined) {
    updates.push(`expiration_date = $${paramIndex++}`);
    values.push(data.expiration_date);
  }
  
  if (data.max_uses !== undefined) {
    updates.push(`max_uses = $${paramIndex++}`);
    values.push(data.max_uses);
  }
  
  if (data.is_active !== undefined) {
    updates.push(`is_active = $${paramIndex++}`);
    values.push(data.is_active);
  }
  
  if (data.leader_id !== undefined) {
    updates.push(`leader_id = $${paramIndex++}`);
    values.push(data.leader_id || null);
  }
  
  let updatedCoupon = coupon;
  
  // Update coupon fields if there are any
  if (updates.length > 0) {
    updates.push(`updated_at = NOW()`);
    values.push(couponId);
    
    const result = await query(
      `UPDATE coupons 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );
    
    const row = result.rows[0];
    updatedCoupon = {
      ...row,
      discount_value: parseFloat(row.discount_value) || 0,
      current_uses: parseInt(row.current_uses) || 0,
    } as Coupon;
  } else {
    // Even if no fields to update, still update updated_at if event_ids changed
    if (data.event_ids !== undefined) {
      await query(
        `UPDATE coupons SET updated_at = NOW() WHERE id = $1`,
        [couponId]
      );
    }
  }
  
  // Update event relationships if provided
  if (data.event_ids !== undefined) {
    await setCouponEventIds(couponId, data.event_ids);
  }
  
  // Fetch coupon with event IDs
  const eventIds = await getCouponEventIds(couponId);
  return { ...updatedCoupon, event_ids: eventIds } as any;
};

/**
 * Delete coupon
 */
export const deleteCoupon = async (couponId: string): Promise<void> => {
  const coupon = await getCouponById(couponId);
  if (!coupon) {
    throw new Error('Coupon not found');
  }
  
  await query(
    'DELETE FROM coupons WHERE id = $1',
    [couponId]
  );
};

/**
 * Increment coupon usage
 */
export const incrementCouponUsage = async (couponId: string): Promise<void> => {
  await query(
    `UPDATE coupons 
     SET current_uses = current_uses + 1, updated_at = NOW()
     WHERE id = $1`,
    [couponId]
  );
};

/**
 * Validate coupon (check if it can be used)
 */
export const validateCoupon = async (
  code: string, 
  organizerId: string, 
  eventId?: string
): Promise<{ valid: boolean; coupon?: Coupon; error?: string }> => {
  const coupon = await getCouponByCode(code, organizerId);
  
  if (!coupon) {
    return { valid: false, error: 'Cupom não encontrado' };
  }
  
  if (!coupon.is_active) {
    return { valid: false, coupon, error: 'Cupom está inativo' };
  }
  
  // Check expiration
  if (coupon.expiration_date) {
    const now = new Date();
    const expiration = new Date(coupon.expiration_date);
    if (now > expiration) {
      return { valid: false, coupon, error: 'Cupom expirado' };
    }
  }
  
  // Check max uses
  if (coupon.max_uses !== null && coupon.current_uses >= coupon.max_uses) {
    return { valid: false, coupon, error: 'Cupom atingiu o limite de uso' };
  }
  
  // Check if coupon applies to this event
  if (eventId) {
    const eventIds = await getCouponEventIds(coupon.id);
    // If coupon has specific events, check if this event is included
    if (eventIds.length > 0 && !eventIds.includes(eventId)) {
      return { valid: false, coupon, error: 'Cupom não é válido para este evento' };
    }
  }
  
  // If coupon is exclusive to a leader, only validate that the leader exists
  // The coupon can be used by anyone who has the code (sent by the leader)
  if (coupon.leader_id) {
    const { getGroupLeaderById } = await import('./groupLeadersService.js');
    
    const leader = await getGroupLeaderById(coupon.leader_id);
    if (!leader || !leader.is_active) {
      return { valid: false, coupon, error: 'Líder associado ao cupom não encontrado ou inativo' };
    }
    
    // Cupom exclusivo do líder pode ser usado por qualquer pessoa que tenha o código
    // Não há restrição de referência - o líder pode compartilhar com quem quiser
  }
  
  // Get coupon with event IDs
  const eventIds = await getCouponEventIds(coupon.id);
  const couponWithEvents = { ...coupon, event_ids: eventIds } as any;
  
  return { valid: true, coupon: couponWithEvents };
};

