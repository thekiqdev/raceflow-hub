import { query } from '../config/database.js';

export interface LeaderRegistration {
  id: string;
  event_id: string;
  event_title: string;
  event_date: Date;
  runner_id: string;
  runner_name: string;
  runner_cpf: string;
  runner_email: string;
  category_name: string;
  total_amount: number;
  payment_status: string;
  status: string;
  coupon_code: string;
  created_at: Date;
  confirmation_code: string | null;
}

/**
 * Get registrations by leader's coupons or referrals
 * Returns all registrations that used coupons belonging to the leader OR were made by users referred by the leader
 */
export const getRegistrationsByLeaderCoupons = async (
  leaderId: string,
  filters?: {
    event_id?: string;
    coupon_code?: string;
    payment_status?: 'pending' | 'paid' | 'cancelled';
  }
): Promise<LeaderRegistration[]> => {
  let queryText = `
    SELECT DISTINCT
      r.id,
      r.event_id,
      e.title as event_title,
      e.event_date,
      r.runner_id,
      p.full_name as runner_name,
      p.cpf as runner_cpf,
      u.email as runner_email,
      c.name as category_name,
      r.total_amount,
      r.payment_status,
      r.status,
      COALESCE(r.coupon_code, '') as coupon_code,
      r.created_at,
      r.confirmation_code
    FROM registrations r
    JOIN events e ON r.event_id = e.id
    LEFT JOIN profiles p ON r.runner_id = p.id
    LEFT JOIN users u ON p.id = u.id
    LEFT JOIN categories c ON r.category_id = c.id
    WHERE (
      -- Registrations with leader's coupons
      (r.coupon_code IS NOT NULL AND EXISTS (
        SELECT 1 FROM coupons cp 
        WHERE UPPER(TRIM(cp.code)) = UPPER(TRIM(r.coupon_code)) AND cp.leader_id = $1
      ))
      OR
      -- Registrations by users referred by the leader
      EXISTS (
        SELECT 1 FROM user_referrals ur 
        WHERE ur.user_id = r.runner_id AND ur.leader_id = $1
      )
    )
  `;
  
  const params: any[] = [leaderId];
  const conditions: string[] = [];
  
  if (filters?.event_id) {
    conditions.push(`r.event_id = $${params.length + 1}`);
    params.push(filters.event_id);
  }
  
  if (filters?.coupon_code) {
    conditions.push(`r.coupon_code IS NOT NULL AND UPPER(TRIM(r.coupon_code)) = UPPER(TRIM($${params.length + 1}))`);
    params.push(filters.coupon_code);
  }
  
  if (filters?.payment_status) {
    conditions.push(`r.payment_status = $${params.length + 1}`);
    params.push(filters.payment_status);
    // Para contagem de "compras pagas" (bônus de convite), não contar inscrições canceladas
    if (filters.payment_status === 'paid') {
      conditions.push(`r.status != 'cancelled'`);
    }
  }
  // Removed default filter - now shows all registrations (pending, paid, cancelled)
  
  if (conditions.length > 0) {
    queryText += ' AND ' + conditions.join(' AND ');
  }
  
  queryText += ' ORDER BY r.created_at DESC';
  
  console.log('🔍 Query para buscar registrações do líder:', leaderId);
  console.log('🔍 Query SQL:', queryText);
  console.log('🔍 Parâmetros:', params);
  
  const result = await query(queryText, params);
  
  console.log('✅ Registrações encontradas:', result.rows.length);
  if (result.rows.length > 0) {
    console.log('📋 Primeira registração:', result.rows[0]);
  } else {
    console.log('⚠️ Nenhuma registração encontrada. Verificando se há cupons ou referências...');
    // Debug: verificar se há cupons do líder
    const couponsCheck = await query(
      'SELECT id, code, leader_id FROM coupons WHERE leader_id = $1',
      [leaderId]
    );
    console.log('🔍 Cupons do líder:', couponsCheck.rows.length, couponsCheck.rows);
    
    // Debug: verificar se há referências do líder
    const referralsCheck = await query(
      'SELECT id, user_id, leader_id FROM user_referrals WHERE leader_id = $1 LIMIT 5',
      [leaderId]
    );
    console.log('🔍 Referências do líder:', referralsCheck.rows.length, referralsCheck.rows);
  }
  
  return result.rows.map((row) => ({
    id: row.id,
    event_id: row.event_id,
    event_title: row.event_title,
    event_date: row.event_date,
    runner_id: row.runner_id,
    runner_name: row.runner_name || 'N/A',
    runner_cpf: row.runner_cpf || 'N/A',
    runner_email: row.runner_email || 'N/A',
    category_name: row.category_name || 'N/A',
    total_amount: parseFloat(row.total_amount) || 0,
    payment_status: row.payment_status,
    status: row.status,
    coupon_code: row.coupon_code || '',
    created_at: row.created_at,
    confirmation_code: row.confirmation_code,
  }));
};

/**
 * Get registration count by leader's coupons or referrals
 */
export const getRegistrationCountByLeaderCoupons = async (
  leaderId: string,
  filters?: {
    event_id?: string;
    coupon_code?: string;
  }
): Promise<number> => {
  let queryText = `
    SELECT COUNT(DISTINCT r.id) as count
    FROM registrations r
    WHERE (
      -- Registrations with leader's coupons
      (r.coupon_code IS NOT NULL AND EXISTS (
        SELECT 1 FROM coupons cp 
        WHERE UPPER(TRIM(cp.code)) = UPPER(TRIM(r.coupon_code)) AND cp.leader_id = $1
      ))
      OR
      -- Registrations by users referred by the leader
      EXISTS (
        SELECT 1 FROM user_referrals ur 
        WHERE ur.user_id = r.runner_id AND ur.leader_id = $1
      )
    )
  `;
  
  const params: any[] = [leaderId];
  const conditions: string[] = [];
  
  if (filters?.event_id) {
    conditions.push(`r.event_id = $${params.length + 1}`);
    params.push(filters.event_id);
  }
  
  if (filters?.coupon_code) {
    conditions.push(`r.coupon_code IS NOT NULL AND UPPER(TRIM(r.coupon_code)) = UPPER(TRIM($${params.length + 1}))`);
    params.push(filters.coupon_code);
  }
  
  if (conditions.length > 0) {
    queryText += ' AND ' + conditions.join(' AND ');
  }
  
  const result = await query(queryText, params);
  
  return parseInt(result.rows[0].count) || 0;
};

