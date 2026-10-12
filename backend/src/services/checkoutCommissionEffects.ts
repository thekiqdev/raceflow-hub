import { query } from '../config/database.js';

/** Chamado na transação do efeito, depois do bloqueio do pedido. Sem efeitos externos. */
export async function applyCheckoutCommission(effect:any,row:any) {
  if(effect.kind==='refunded') {
    const commissions=(await query("SELECT * FROM leader_commissions WHERE registration_id=$1 AND status IN ('pending','paid') ORDER BY leader_id FOR UPDATE",[row.id])).rows;
    for(const commission of commissions) {
      await query("UPDATE leader_commissions SET status='cancelled',updated_at=now() WHERE id=$1",[commission.id]);
      await query('UPDATE group_leaders SET total_earnings=total_earnings-$2 WHERE id=$1',[commission.leader_id,commission.commission_amount]);
    }
    return commissions.map(c=>c.leader_id) as string[];
  }
  const coupon=(await query(`SELECT c.* FROM checkout_order_items i JOIN coupons c ON c.id=i.coupon_id
    WHERE i.registration_id=$1`,[row.id])).rows[0];
  const referral=row.runner_id ? (await query('SELECT leader_id FROM user_referrals WHERE user_id=$1',[row.runner_id])).rows[0] : null;
  const leaderId=coupon?.leader_id ?? referral?.leader_id;
  if(!leaderId) return [];
  const leader=(await query('SELECT id,is_active FROM group_leaders WHERE id=$1 FOR UPDATE',[leaderId])).rows[0];
  if(!leader?.is_active) return [];
  const configs=(await query('SELECT * FROM leader_event_commissions WHERE leader_id=$1 AND event_id=$2 ORDER BY created_at DESC',[leaderId,row.event_id])).rows;
  const matched=coupon ? configs.find(c=>String(coupon.code).includes(c.id.replace(/-/g,'').slice(0,8).toUpperCase())) : null;
  const config=matched ?? configs.find(c=>c.bonus_type==='both') ?? configs.find(c=>c.bonus_type==='commission');
  const amount=Number(row.snapshot.pricing.total);
  const commission=config && config.bonus_type!=='invitation' ? Math.round(amount*Number(config.commission_percentage))/100 : 0;
  if(commission>0) {
    const exists=(await query("SELECT id FROM leader_commissions WHERE registration_id=$1 AND status IN ('pending','paid')",[row.id])).rows.length;
    if(!exists) {
      await query(`INSERT INTO leader_commissions(leader_id,registration_id,referred_user_id,event_id,commission_amount,
        commission_percentage,registration_amount,status,checkout_effect_id) VALUES($1,$2,$3,$4,$5,$6,$7,'pending',$8)`,
      [leaderId,row.id,row.runner_id,row.event_id,commission,config.commission_percentage,amount,effect.id]);
      await query('UPDATE group_leaders SET total_earnings=total_earnings+$2 WHERE id=$1',[leaderId,commission]);
    }
  }
  return [leaderId] as string[];
}
