import jwt from 'jsonwebtoken';
import { query, withTransaction } from '../config/database.js';
import { formatCpf } from '../utils/cpf.js';
import { currentTicketIdentity,ticketVersion } from './checkoutTicketIdentity.js';

const fail=(message:string,statusCode=403)=>Object.assign(new Error(message),{statusCode});
const date=(v:any)=>v instanceof Date?v.toISOString().slice(0,10):String(v ?? '').slice(0,10);
export async function deliveryInstalled() {
  return !!(await query("SELECT to_regclass('public.checkout_delivery_jobs') AS t")).rows[0].t;
}
export async function linkVerifiedCheckoutTickets(userId:string) {
  if(!await deliveryInstalled()) return 0;
  const profile=(await query("SELECT * FROM profiles WHERE id=$1 AND cpf_validated_at IS NOT NULL AND cpf_lookup_source='cpf_brasil_api'",[userId])).rows[0];
  if(!profile) return 0;
  const cpf=String(profile.cpf ?? '').replace(/\D/g,'');
  if(!/^\d{11}$/.test(cpf)) return 0;
  const orders=(await query('SELECT DISTINCT order_id FROM registrations WHERE runner_id IS NULL AND participant_cpf=$1 AND order_id IS NOT NULL ORDER BY order_id',[cpf])).rows;
  let linked=0;
  for(const {order_id:id} of orders) linked+=await withTransaction(async()=> {
    await query('SELECT id FROM checkout_orders WHERE id=$1 FOR UPDATE',[id]);
    const fresh=(await query('SELECT * FROM profiles WHERE id=$1 FOR SHARE',[userId])).rows[0];
    if(!fresh?.cpf_validated_at || fresh.cpf_lookup_source!=='cpf_brasil_api' || String(fresh.cpf).replace(/\D/g,'')!==cpf) return 0;
    const owners=(await query("SELECT id FROM profiles WHERE regexp_replace(COALESCE(cpf,''),'[^0-9]','','g')=$1",[cpf])).rows;
    if(owners.length!==1 || owners[0].id!==userId) return 0;
    const regs=(await query(`SELECT r.id,i.snapshot,to_jsonb(r)->'checkout_current_identity' AS checkout_current_identity FROM registrations r JOIN checkout_order_items i ON i.registration_id=r.id
      WHERE r.order_id=$1 AND r.runner_id IS NULL AND r.participant_cpf=$2 ORDER BY r.id FOR UPDATE OF r`,[id,cpf])).rows;
    await query("SELECT set_config('cronoteam.order_write',$1,true)",[id]);
    let count=0;
    for(const r of regs) {
      if(date(currentTicketIdentity(r).birthDate)!==date(fresh.birth_date)) continue;
      await query('UPDATE registrations SET runner_id=$2,updated_at=now() WHERE id=$1',[r.id,userId]);
      await query(`INSERT INTO checkout_identity_links(registration_id,runner_id,verification_source)
        VALUES ($1,$2,'cpf_brasil_api') ON CONFLICT DO NOTHING`,[r.id,userId]);
      await query('UPDATE leader_commissions SET referred_user_id=$2 WHERE registration_id=$1 AND referred_user_id IS NULL',[r.id,userId]);
      count++;
    }
    return count;
  });
  return linked;
}
export async function canManageCheckoutEvent(eventId:string,userId:string) {
  return !!(await query(`SELECT 1 FROM events e WHERE e.id=$1 AND (e.organizer_id=$2 OR EXISTS
    (SELECT 1 FROM user_roles WHERE user_id=$2 AND role='admin'))`,[eventId,userId])).rows.length;
}
export async function ticketRows(orderId:string) {
  return (await query(`SELECT r.*,i.snapshot,o.status AS order_status,o.buyer_id,e.title AS event_title,e.event_date,
    e.location,e.city,e.state FROM registrations r JOIN checkout_order_items i ON i.registration_id=r.id
    JOIN checkout_orders o ON o.id=r.order_id JOIN events e ON e.id=r.event_id
    WHERE r.order_id=$1 ORDER BY i.position`,[orderId])).rows;
}
export function ticketView(row:any,includePrivate=true) {
  const released=row.order_status==='confirmed' && row.status==='confirmed' && row.payment_status==='paid';
  return {id:row.id,order_id:row.order_id,event_id:row.event_id,event_title:row.event_title,event_date:row.event_date,
    location:[row.location,row.city,row.state].filter(Boolean).join(' · '),status:row.status,payment_status:row.payment_status,
    released,confirmation_code:released?row.confirmation_code:null,
    runner_name:includePrivate?currentTicketIdentity(row).fullName:undefined,cpf_masked:includePrivate?formatCpf(row.participant_cpf):undefined,
    labels:row.snapshot.labels,pricing:row.snapshot.pricing,
    custom_fields:includePrivate?Object.entries(ticketVersion(row)>0?{}:row.snapshot.choices.custom_field_values ?? {}).map(([id,value])=>({
      label:row.snapshot.labels.custom_fields?.[id] ?? 'Informação adicional',value:String(value)})):undefined,
    kit_collected_at:row.checkout_kit_collected_at ?? null,kit_returned_at:row.checkout_kit_returned_at ?? null};
}
export async function listCheckoutTickets(userId:string,eventId?:string) {
  if(!await deliveryInstalled()) return [];
  if(eventId && !await canManageCheckoutEvent(eventId,userId)) throw fail('Sem acesso a este evento.');
  if(!eventId) await linkVerifiedCheckoutTickets(userId);
  const rows=(await query(`SELECT r.*,i.snapshot,o.status AS order_status,o.buyer_id,e.title AS event_title,e.event_date,
    e.location,e.city,e.state FROM registrations r JOIN checkout_order_items i ON i.registration_id=r.id
    JOIN checkout_orders o ON o.id=r.order_id JOIN events e ON e.id=r.event_id
    WHERE ($2::uuid IS NOT NULL AND o.event_id=$2) OR ($2::uuid IS NULL AND (o.buyer_id=$1 OR r.runner_id=$1))
    ORDER BY o.created_at DESC,o.id,i.position`,[userId,eventId ?? null])).rows;
  return rows.map(r=>({...ticketView(r,!!eventId || r.runner_id===userId || !currentTicketIdentity(r).runnerId || ['confirmed','refunded'].includes(r.order_status)),
    buyer:r.buyer_id===userId,order_status:r.order_status}));
}
/** Detalhe operacional; não libera QR de inscrições ainda não confirmadas. */
export async function managedCheckoutTicket(id:string,userId:string) {
  const row=(await query('SELECT order_id,event_id FROM registrations WHERE id=$1 AND order_id IS NOT NULL',[id])).rows[0];
  if(!row || !await canManageCheckoutEvent(row.event_id,userId)) throw fail('Inscrição não encontrada.',404);
  const ticket=(await ticketRows(row.order_id)).find(r=>r.id===id);
  if(!ticket) throw fail('Inscrição não encontrada.',404);
  return {...ticketView(ticket),order_status:ticket.order_status};
}
export async function authorizedTicket(id:string,userId:string) {
  const row=(await query('SELECT order_id,event_id,runner_id FROM registrations WHERE id=$1 AND order_id IS NOT NULL',[id])).rows[0];
  if(!row) throw fail('Inscrição não encontrada.',404);
  const ticket=(await ticketRows(row.order_id)).find(r=>r.id===id);
  if(ticket.buyer_id!==userId && ticket.runner_id!==userId && !await canManageCheckoutEvent(row.event_id,userId)) throw fail('Inscrição não encontrada.',404);
  if(!ticketView(ticket).released) throw fail('Ingresso indisponível enquanto o pedido não estiver confirmado.',409);
  return ticketView(ticket);
}
export function ticketAccessToken(row:any) {
  const secret=process.env.JWT_SECRET;if(!secret) throw new Error('JWT_SECRET ausente.');
  const expiration=Math.max(Date.now()+86400000,new Date(row.event_date).getTime()+30*86400000);
  return jwt.sign({sub:row.id,v:ticketVersion(row),aud:'checkout-ticket',iss:'cronoteam',exp:Math.floor(expiration/1000)},secret,{algorithm:'HS256'});
}
export async function ticketByAccessToken(token:string) {
  let claims:jwt.JwtPayload;
  try {claims=jwt.verify(token,process.env.JWT_SECRET!,{algorithms:['HS256'],audience:'checkout-ticket',issuer:'cronoteam'}) as jwt.JwtPayload;}
  catch {throw fail('Link inválido ou expirado.');}
  if(!claims.sub) throw fail('Link inválido.');
  const reg=(await query('SELECT order_id FROM registrations WHERE id=$1 AND order_id IS NOT NULL',[claims.sub])).rows[0];
  if(!reg) throw fail('Ingresso não encontrado.',404);
  const row=(await ticketRows(reg.order_id)).find(r=>r.id===claims.sub);
  if((claims.v ?? 0)!==ticketVersion(row)) throw fail('Este link foi substituído após uma transferência.');
  if(!ticketView(row).released) throw fail('Ingresso não está disponível.',409);
  return ticketView(row);
}
export async function collectCheckoutKit(id:string,userId:string) {
  return withTransaction(async()=> {
    const info=(await query('SELECT order_id,event_id FROM registrations WHERE id=$1 AND order_id IS NOT NULL',[id])).rows[0];
    if(!info || !await canManageCheckoutEvent(info.event_id,userId)) throw fail('Sem acesso à retirada deste kit.');
    await query('SELECT id FROM checkout_orders WHERE id=$1 FOR UPDATE',[info.order_id]);
    const ticket=await authorizedTicket(id,userId);
    if(!ticket.labels.kit) throw fail('Inscrição sem kit.',400);
    await query("SELECT set_config('cronoteam.order_write',$1,true)",[info.order_id]);
    await query(`UPDATE registrations SET checkout_kit_collected_at=now(),checkout_kit_collected_by=$2
      WHERE id=$1 AND checkout_kit_collected_at IS NULL`,[id,userId]);
    return {...ticket,kit_collected_at:(await query('SELECT checkout_kit_collected_at FROM registrations WHERE id=$1',[id])).rows[0].checkout_kit_collected_at};
  });
}

export async function returnCheckoutKit(id:string,userId:string) {
  return withTransaction(async()=>{
    const info=(await query('SELECT order_id,event_id FROM registrations WHERE id=$1 AND order_id IS NOT NULL',[id])).rows[0];
    if(!info || !await canManageCheckoutEvent(info.event_id,userId)) throw fail('Sem acesso à devolução deste kit.');
    await query('SELECT id FROM checkout_orders WHERE id=$1 FOR UPDATE',[info.order_id]);
    const row=(await ticketRows(info.order_id)).find(r=>r.id===id)!;
    if(row.payment_status!=='refunded' || !row.checkout_kit_collected_at) throw fail('Devolução disponível para kit entregue de inscrição reembolsada.',409);
    await query("SELECT set_config('cronoteam.order_write',$1,true)",[info.order_id]);
    await query(`UPDATE registrations SET checkout_kit_returned_at=now(),checkout_kit_returned_by=$2
      WHERE id=$1 AND checkout_kit_returned_at IS NULL`,[id,userId]);
    return ticketView((await ticketRows(info.order_id)).find(r=>r.id===id));
  });
}
