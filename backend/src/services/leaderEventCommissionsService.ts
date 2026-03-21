import { query } from '../config/database.js';
import { LeaderEventCommission, CreateLeaderEventCommissionData, UpdateLeaderEventCommissionData } from '../types/index.js';

/**
 * Create a new leader event commission
 */
export const createLeaderEventCommission = async (
  data: CreateLeaderEventCommissionData
): Promise<LeaderEventCommission> => {
  const bonusType = data.bonus_type || 'commission';

  // Validate commission percentage (required for commission and both types)
  if ((bonusType === 'commission' || bonusType === 'both') && (data.commission_percentage < 0 || data.commission_percentage > 100)) {
    throw new Error('Percentual de comissão deve estar entre 0 e 100');
  }

  // Validate required_purchases for invitation and both types
  if (bonusType === 'invitation' || bonusType === 'both') {
    if (!data.required_purchases || data.required_purchases <= 0) {
      throw new Error('Número de compras necessárias deve ser maior que 0 para bônus de convite');
    }
  }

  const commissionPercentage = bonusType === 'invitation' ? 0 : data.commission_percentage;

  const result = await query(
    `INSERT INTO leader_event_commissions (
      leader_id, event_id, commission_percentage, bonus_type, required_purchases, name
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *`,
    [
      data.leader_id,
      data.event_id,
      commissionPercentage,
      bonusType,
      data.required_purchases || null,
      data.name || null,
    ]
  );

  return result.rows[0] as LeaderEventCommission;
};

/**
 * Get all leader event commissions for a given event (organizer's event).
 * Used e.g. when attaching a registration to a commission - list commissions to choose from.
 */
export const getLeaderEventCommissionsByEvent = async (
  eventId: string,
  organizerId: string
): Promise<any[]> => {
  const result = await query(
    `SELECT 
      lec.id,
      lec.leader_id,
      lec.event_id,
      lec.name,
      lec.commission_percentage,
      COALESCE(lec.bonus_type, 'commission') as bonus_type,
      lec.required_purchases,
      gl.referral_code as leader_referral_code,
      p.full_name as leader_name,
      e.title as event_title
    FROM leader_event_commissions lec
    JOIN events e ON lec.event_id = e.id
    JOIN group_leaders gl ON lec.leader_id = gl.id
    LEFT JOIN profiles p ON gl.user_id = p.id
    WHERE lec.event_id = $1 AND e.organizer_id = $2
    ORDER BY gl.referral_code, lec.name`,
    [eventId, organizerId]
  );
  return result.rows;
};

/**
 * Get all event commissions for a leader
 */
export const getLeaderEventCommissions = async (
  leaderId: string,
  organizerId?: string
): Promise<LeaderEventCommission[]> => {
  let queryText = `
    SELECT 
      lec.id,
      lec.leader_id,
      lec.event_id,
      lec.commission_percentage,
      COALESCE(lec.bonus_type, 'commission') as bonus_type,
      lec.required_purchases,
      lec.bonus_registration_id,
      lec.bonus_earned_at,
      lec.name,
      lec.created_at,
      lec.updated_at,
      e.title as event_title,
      e.event_date,
      e.organizer_id,
      e.slug as event_slug
    FROM leader_event_commissions lec
    JOIN events e ON lec.event_id = e.id
    WHERE lec.leader_id = $1
  `;
  const params: any[] = [leaderId];
  
  // Filter by organizer if provided
  if (organizerId) {
    queryText += ' AND e.organizer_id = $2';
    params.push(organizerId);
  }
  
  queryText += ' ORDER BY e.event_date DESC, e.title ASC';
  
  const result = await query(queryText, params);

  // Get coupons for each commission
  const commissions = result.rows as LeaderEventCommission[];
  const { getCouponsByLeader } = await import('./couponsService.js');
  const { getGroupLeaderById } = await import('./groupLeadersService.js');
  const { getRegistrationsByLeaderCoupons } = await import('./leaderRegistrationsService.js');

  // Somente leitura — não dispara checkAndGrantInvitationBonus ao listar (evita concessão indevida ao abrir tela).
  
  // Filter coupons by organizer if organizerId was provided
  // This ensures that only coupons from the specific organizer are shown
  const coupons = await getCouponsByLeader(leaderId, organizerId);
  const leader = await getGroupLeaderById(leaderId);
  
  // Enrich commissions with coupon data and progress stats
  const enrichedCommissions = await Promise.all(commissions.map(async (commission) => {
    // Find the coupon for this specific commission
    // Each commission has a unique coupon code that contains the commission ID (first 8 chars)
    const commissionIdShort = commission.id.replace(/-/g, '').substring(0, 8).toUpperCase();
    
    // Try to find coupon by commission ID in the code or by name matching
    let coupon = coupons.find((c) => {
      const matchesEvent = c.event_ids?.includes(commission.event_id) || c.event_id === commission.event_id;
      if (!matchesEvent) return false;
      
      // Check if coupon code contains the commission ID (it should, based on how we create it)
      if (c.code && c.code.includes(commissionIdShort)) {
        return true;
      }
      
      // Fallback: check if coupon name contains commission name
      if (commission.name && c.name && c.name.includes(commission.name)) {
        return true;
      }
      
      return false;
    });
    
    // If not found by ID, try to find by event and creation time proximity
    if (!coupon) {
      const eventCoupons = coupons.filter((c) => 
        c.event_ids?.includes(commission.event_id) || c.event_id === commission.event_id
      );
      
      // If there's only one coupon for this event, use it
      if (eventCoupons.length === 1) {
        coupon = eventCoupons[0];
      } else if (eventCoupons.length > 1) {
        // If multiple coupons, try to match by name or use the first one as fallback
        coupon = eventCoupons.find((c) => 
          commission.name && c.name && c.name.includes(commission.name)
        ) || eventCoupons[0];
      }
    }
    
    let paidCount = 0;
    let invitationsCount = 0;
    let totalCommissionEarned = 0;
    
    // If this commission has a coupon, count only registrations using this specific coupon
    if (coupon) {
      // Get paid registrations count using this specific coupon
      const paidRegistrations = await getRegistrationsByLeaderCoupons(leaderId, {
        event_id: commission.event_id,
        payment_status: 'paid',
        coupon_code: coupon.code,
      });
      paidCount = paidRegistrations.length;
      
      // Calculate total commission earned for this specific commission
      // Only count commissions that were generated from registrations using this coupon
      if (commission.bonus_type === 'commission' || commission.bonus_type === 'both') {
        const commissionResult = await query(
          `SELECT COALESCE(SUM(lc.commission_amount), 0) as total_commission
           FROM leader_commissions lc
           JOIN registrations r ON lc.registration_id = r.id
           WHERE lc.leader_id = $1 
             AND lc.event_id = $2
             AND r.coupon_code = $3
             AND lc.status IN ('paid', 'pending')`,
          [leaderId, commission.event_id, coupon.code]
        );
        totalCommissionEarned = parseFloat(commissionResult.rows[0]?.total_commission || '0') || 0;
      }
      
      // Calculate invitations earned based on this commission's configuration
      // Count only available invitations (not sent or used) for this specific commission
      if (commission.bonus_type === 'invitation' || commission.bonus_type === 'both') {
        const availableInvitationsResult = await query(
          `SELECT COUNT(*) as count FROM leader_invitations 
           WHERE leader_id = $1 AND event_id = $2 AND commission_id = $3 AND status = 'available'`,
          [leaderId, commission.event_id, commission.id]
        );
        invitationsCount = parseInt(availableInvitationsResult.rows[0]?.count || '0') || 0;
      }
    } else {
      // If no coupon, count all registrations for the event (fallback)
      const paidRegistrations = await getRegistrationsByLeaderCoupons(leaderId, {
        event_id: commission.event_id,
        payment_status: 'paid',
      });
      paidCount = paidRegistrations.length;
      
      // Calculate total commission earned for this event (without coupon filter)
      if (commission.bonus_type === 'commission' || commission.bonus_type === 'both') {
        const commissionResult = await query(
          `SELECT COALESCE(SUM(lc.commission_amount), 0) as total_commission
           FROM leader_commissions lc
           WHERE lc.leader_id = $1 
             AND lc.event_id = $2
             AND lc.status IN ('paid', 'pending')`,
          [leaderId, commission.event_id]
        );
        totalCommissionEarned = parseFloat(commissionResult.rows[0]?.total_commission || '0') || 0;
      }
      
      // For invitations, count only available invitations (not sent or used) for this specific commission
      if (commission.bonus_type === 'invitation' || commission.bonus_type === 'both') {
        const availableInvitationsResult = await query(
          `SELECT COUNT(*) as count FROM leader_invitations 
           WHERE leader_id = $1 AND event_id = $2 AND commission_id = $3 AND status = 'available'`,
          [leaderId, commission.event_id, commission.id]
        );
        invitationsCount = parseInt(availableInvitationsResult.rows[0]?.count || '0') || 0;
      }
    }
    
    const enriched: any = {
      ...commission,
      stats: {
        paid_registrations: paidCount,
        invitations_earned: invitationsCount,
        total_commission_earned: totalCommissionEarned,
      },
    };
    
    if (coupon && leader) {
      // URL pública do site (ex: https://cronoteam.com.br) para links de cupom
      let baseUrl = process.env.FRONTEND_URL?.replace(/\/$/, '') || 'http://localhost:8080';
      if (baseUrl === 'http://localhost:8080' && process.env.CORS_ORIGIN) {
        const origins = process.env.CORS_ORIGIN.split(',').map(o => o.trim());
        const origin8080 = origins.find(o => o.includes(':8080'));
        baseUrl = origin8080 || origins[0];
      } else if (baseUrl === 'http://localhost:8080' && process.env.API_URL) {
        baseUrl = process.env.API_URL.replace(/\/api\/?$/, '');
      }
      const eventPath = (commission as any).event_slug
        ? `/evento/${(commission as any).event_slug}`
        : `/events/${commission.event_id}`;
      enriched.coupon = {
        id: coupon.id,
        code: coupon.code,
        link: `${baseUrl}${eventPath}?ref=${leader.referral_code}&cupom=${coupon.code}`,
        discount_value: coupon.discount_value, // Include discount value
        type: coupon.type, // Include coupon type (percentage or fixed)
      };
    }
    
    return enriched;
  }));

  return enrichedCommissions;
};

/**
 * Get event commission by ID
 */
export const getLeaderEventCommissionById = async (
  commissionId: string
): Promise<LeaderEventCommission | null> => {
  const result = await query(
    `SELECT 
      id,
      leader_id,
      event_id,
      commission_percentage,
      COALESCE(bonus_type, 'commission') as bonus_type,
      required_purchases,
      bonus_registration_id,
      bonus_earned_at,
      name,
      created_at,
      updated_at
    FROM leader_event_commissions WHERE id = $1`,
    [commissionId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as LeaderEventCommission;
};

/**
 * Get commission for a specific leader and event
 */
export const getLeaderEventCommission = async (
  leaderId: string,
  eventId: string,
  bonusType?: 'commission' | 'invitation' | 'both'
): Promise<LeaderEventCommission | null> => {
  let queryText = `SELECT 
      id,
      leader_id,
      event_id,
      commission_percentage,
      COALESCE(bonus_type, 'commission') as bonus_type,
      required_purchases,
      bonus_registration_id,
      bonus_earned_at,
      name,
      created_at,
      updated_at
    FROM leader_event_commissions WHERE leader_id = $1 AND event_id = $2`;
  
  const params: any[] = [leaderId, eventId];
  
  if (bonusType) {
    queryText += ` AND bonus_type = $3`;
    params.push(bonusType);
  } else {
    // Default: get commission or both type (for backward compatibility)
    queryText += ` AND bonus_type IN ('commission', 'both')`;
  }
  
  queryText += ` ORDER BY bonus_type = 'both' DESC, created_at DESC LIMIT 1`;
  
  const result = await query(queryText, params);

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as LeaderEventCommission;
};

/**
 * Update leader event commission
 */
export const updateLeaderEventCommission = async (
  commissionId: string,
  data: UpdateLeaderEventCommissionData
): Promise<LeaderEventCommission> => {
  // Get current commission to check type
  const current = await getLeaderEventCommissionById(commissionId);
  if (!current) {
    throw new Error('Comissão não encontrada');
  }

  const bonusType = data.bonus_type || current.bonus_type;

  // Validate commission percentage (required for commission and both types)
  if (data.commission_percentage !== undefined) {
    if ((bonusType === 'commission' || bonusType === 'both') && (data.commission_percentage < 0 || data.commission_percentage > 100)) {
      throw new Error('Percentual de comissão deve estar entre 0 e 100');
    }
  }

  // Validate required_purchases for invitation and both types
  if ((bonusType === 'invitation' || bonusType === 'both') && data.required_purchases !== undefined) {
    if (!data.required_purchases || data.required_purchases <= 0) {
      throw new Error('Número de compras necessárias deve ser maior que 0 para bônus de convite');
    }
  }

  const updateFields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.commission_percentage !== undefined) {
    updateFields.push(`commission_percentage = $${paramIndex}`);
    values.push(bonusType === 'invitation' ? 0 : data.commission_percentage);
    paramIndex++;
  }

  if (data.bonus_type !== undefined) {
    updateFields.push(`bonus_type = $${paramIndex}`);
    values.push(data.bonus_type);
    paramIndex++;
  }

  if (data.required_purchases !== undefined) {
    updateFields.push(`required_purchases = $${paramIndex}`);
    values.push(data.required_purchases);
    paramIndex++;
  }

  if (data.name !== undefined) {
    updateFields.push(`name = $${paramIndex}`);
    values.push(data.name);
    paramIndex++;
  }

  if (updateFields.length === 0) {
    throw new Error('Nenhum campo para atualizar');
  }

  updateFields.push(`updated_at = NOW()`);
  values.push(commissionId);

  const result = await query(
    `UPDATE leader_event_commissions 
     SET ${updateFields.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new Error('Comissão não encontrada');
  }

  const updatedCommission = result.rows[0] as LeaderEventCommission;

  // If coupon_discount is provided, update the associated coupon
  if (data.coupon_discount !== undefined) {
    try {
      const { getCouponsByLeader } = await import('./couponsService.js');
      const { updateCoupon } = await import('./couponsService.js');
      const { getEventById } = await import('./eventsService.js');
      
      // Get event to find organizer_id for filtering coupons
      const event = await getEventById(updatedCommission.event_id);
      const organizerId = event?.organizer_id;
      
      // Filter coupons by organizer to ensure we only update the correct coupon
      const coupons = await getCouponsByLeader(updatedCommission.leader_id, organizerId);
      
      // Find the coupon associated with this commission
      const commissionIdShort = updatedCommission.id.replace(/-/g, '').substring(0, 8).toUpperCase();
      
      let coupon = coupons.find((c) => {
        const matchesEvent = c.event_ids?.includes(updatedCommission.event_id) || c.event_id === updatedCommission.event_id;
        if (!matchesEvent) return false;
        
        // Check if coupon code contains the commission ID
        if (c.code && c.code.includes(commissionIdShort)) {
          return true;
        }
        
        // Fallback: check if coupon name contains commission name
        if (updatedCommission.name && c.name && c.name.includes(updatedCommission.name)) {
          return true;
        }
        
        return false;
      });
      
      // If not found by ID, try to find by event
      if (!coupon) {
        const eventCoupons = coupons.filter((c) => 
          c.event_ids?.includes(updatedCommission.event_id) || c.event_id === updatedCommission.event_id
        );
        
        if (eventCoupons.length === 1) {
          coupon = eventCoupons[0];
        } else if (eventCoupons.length > 1) {
          coupon = eventCoupons.find((c) => 
            updatedCommission.name && c.name && c.name.includes(updatedCommission.name)
          ) || eventCoupons[0];
        }
      }
      
      if (coupon) {
        // Update coupon discount
        await updateCoupon(coupon.id, {
          discount_value: data.coupon_discount,
        });
        console.log(`✅ Desconto do cupom ${coupon.code} atualizado para ${data.coupon_discount}%`);
      } else {
        console.log(`ℹ️ Cupom não encontrado para atualizar desconto da comissão ${updatedCommission.id}`);
      }
    } catch (couponError: any) {
      // Log error but don't fail commission update if coupon update fails
      console.error('Erro ao atualizar desconto do cupom:', couponError.message);
    }
  }

  return updatedCommission;
};

/**
 * Delete leader event commission
 */
export const deleteLeaderEventCommission = async (
  commissionId: string
): Promise<void> => {
  const result = await query(
    'DELETE FROM leader_event_commissions WHERE id = $1',
    [commissionId]
  );

  if (result.rowCount === 0) {
    throw new Error('Comissão não encontrada');
  }
};

