import pool, { query, withTransaction } from '../config/database.js';
import { sendEmail, type SendEmailOptions } from './notificationService.js';
import { applyCheckoutCommission } from './checkoutCommissionEffects.js';
import { authorizedTicket, deliveryInstalled, ticketRows, ticketView } from './checkoutTicketsService.js';
import { currentTicketIdentity,ticketVersion } from './checkoutTicketIdentity.js';

const escape=(v:unknown)=>String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const money=(value:unknown)=>Number(value || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fail=(message:string,statusCode=409)=>Object.assign(new Error(message),{statusCode});
function site() {
  const url=new URL(process.env.FRONTEND_URL || 'https://cronoteam.com.br');
  if(!['https:','http:'].includes(url.protocol)) throw new Error('FRONTEND_URL inválida.');
  return url.origin;
}
async function enqueue(orderId:string,registrationId:string|null,kind:string,key:string,recipient:string|null,payload={}) {
  return (await query(`INSERT INTO checkout_delivery_jobs(order_id,registration_id,kind,dedupe_key,recipient,payload)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(dedupe_key) DO NOTHING RETURNING id`,[orderId,registrationId,kind,key,recipient,payload])).rows[0]?.id;
}
async function athleteEmail(row:any) {
  // Conta existente usa seu e-mail atual; convidado usa o contato escolhido na compra.
  const identity=currentTicketIdentity(row);
  if(identity.runnerId) return (await query('SELECT email FROM users WHERE id=$1',[identity.runnerId])).rows[0]?.email ?? null;
  return identity.deliveryMode==='email' ? identity.email : null;
}
async function defaultBonus(payload:any) {
  if(payload.refund) {
    const {recalculateAndRevokeExcessInvitations}=await import('./leaderBonusService.js');
    await recalculateAndRevokeExcessInvitations(payload.leaderId,payload.eventId);
  } else {
    const {executeInvitationBonusDomainCommand}=await import('./invitationBonusDomainOrchestrator.js');
    await executeInvitationBonusDomainCommand({type:'payment_confirmed_with_coupon',mode:'automatico',source:'checkout_delivery',
      correlation_id:payload.registrationId,leader_id:payload.leaderId,event_id:payload.eventId,coupon_code:payload.couponCode,
      detail:'checkout_order_payment'});
  }
}
export function createCheckoutDeliveryService(deps:{send?:(mail:SendEmailOptions)=>Promise<boolean>;bonus?:(payload:any)=>Promise<void>}={}) {
  const send=deps.send ?? sendEmail,bonus=deps.bonus ?? defaultBonus;
  async function materialize() {
    if(!await deliveryInstalled()) return;
    const effects=(await query(`SELECT f.id,f.registration_id FROM checkout_payment_effects f
      JOIN registrations r ON r.id=f.registration_id JOIN checkout_orders o ON o.id=r.order_id
      WHERE f.processed_at IS NULL AND o.status<>'needs_review' ORDER BY f.created_at,f.id LIMIT 100`)).rows;
    for(const e of effects) {
      try {await withTransaction(async()=> {
        const reg=(await query('SELECT order_id FROM registrations WHERE id=$1',[e.registration_id])).rows[0];
        if(!reg) return;
        await query('SELECT id FROM checkout_orders WHERE id=$1 FOR UPDATE',[reg.order_id]);
        const effect=(await query('SELECT * FROM checkout_payment_effects WHERE id=$1 FOR UPDATE',[e.id])).rows[0];
        if(effect.processed_at) return;
        const rows=await ticketRows(reg.order_id),row=rows.find(r=>r.id===e.registration_id)!;
        if(row.order_status==='needs_review') return;
        const valid=effect.kind==='confirmed'?ticketView(row).released:row.payment_status==='refunded';
        if(!valid) {
          // Se o estorno antecedeu a entrega, não anunciar confirmação antiga nem gerar comissão.
          if(row.payment_status==='refunded' || row.status==='cancelled') await query('UPDATE checkout_payment_effects SET processed_at=now() WHERE id=$1',[effect.id]);
          return;
        }
        const buyer=(await query('SELECT email FROM users WHERE id=$1',[row.buyer_id])).rows[0];
        const recipient=await athleteEmail(row);
        if(effect.kind==='confirmed') {
          await enqueue(row.order_id,null,'buyer_confirmation',`buyer:${row.order_id}`,buyer?.email ?? null);
          if(recipient && recipient.toLowerCase()!==buyer?.email?.toLowerCase()) await enqueue(row.order_id,row.id,'athlete_confirmation',`athlete:${row.id}`,recipient,{ticket_version:ticketVersion(row)});
        } else {
          await enqueue(row.order_id,row.id,'refund',`refund-buyer:${row.id}`,buyer?.email ?? null);
          if(recipient && recipient.toLowerCase()!==buyer?.email?.toLowerCase()) await enqueue(row.order_id,row.id,'refund',`refund-athlete:${row.id}`,recipient);
        }
        const leaderIds=await applyCheckoutCommission(effect,row);
        // Bônus de convite pode existir sem comissão financeira.
        if(effect.kind==='refunded' && !leaderIds.length) {
          const c=(await query('SELECT c.leader_id FROM checkout_order_items i JOIN coupons c ON c.id=i.coupon_id WHERE i.registration_id=$1',[row.id])).rows[0];
          if(c?.leader_id) leaderIds.push(c.leader_id);
        }
        for(const leaderId of leaderIds) await enqueue(row.order_id,row.id,'bonus',`bonus:${effect.id}:${leaderId}`,null,
          {leaderId,eventId:row.event_id,registrationId:row.id,couponCode:row.coupon_code,refund:effect.kind==='refunded'});
        await query('UPDATE checkout_payment_effects SET processed_at=now() WHERE id=$1',[effect.id]);
      });} catch { console.error('Efeito de entrega pendente:',e.id); }
    }
  }
  function ticketHtml(row:any) {
    const t=ticketView(row),labels=t.labels;
    const access=`${site()}/registration/validate/${row.id}`;
    const fields=(t.custom_fields ?? []).map(f=>`<li>${escape(f.label)}: ${escape(f.value)}</li>`).join('');
    return `<section><h2>${escape(t.runner_name)}</h2><p>${escape(t.cpf_masked)}</p>
      <p>${escape(t.event_title)} · ${escape(new Date(t.event_date).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}))}</p>
      <p>${escape(t.location)}</p><p>${escape(labels.category)} · ${escape(labels.modality)} · ${escape(labels.batch)}</p>
      <p>Kit: ${escape(labels.kit || 'Sem kit')}</p><ul>${(labels.products ?? []).map((p:any)=>`<li>${escape(p.product_name)}: ${escape(p.variant_name)}</li>`).join('')}${fields}</ul>
      <p>Categoria e kit: ${money(t.pricing.subtotal)} · Descontos: ${money(Number(t.pricing.seniorDiscount)+Number(t.pricing.couponDiscount))} · Taxa: ${money(t.pricing.platformFee)} · Total: ${money(t.pricing.total)}</p>
      <p>Código da inscrição: <strong>${escape(t.confirmation_code)}</strong></p><p><a href="${escape(access)}">Abrir ingresso</a></p></section>`;
  }
  async function render(job:any,rows:any[]):Promise<SendEmailOptions|null> {
    if(job.kind==='bonus') return null;
    if(!job.recipient) throw fail('Destinatário indisponível.');
    let html:string,subject:string;
    if(job.kind==='buyer_confirmation') {
      const released=rows.filter(r=>ticketView(r).released);
      if(!released.length) return null;
      html=`<h1>Suas inscrições estão confirmadas</h1><p>Pedido ${escape(job.order_id)}</p>${released.map(ticketHtml).join('')}
        <p><a href="${escape(site())}/minhas-compras">Acompanhar minhas compras</a></p>`;
      subject='Inscrições confirmadas — Cronoteam';
    } else {
      const row=rows.find(r=>r.id===job.registration_id);
      if(!row) return null;
      if(job.kind==='athlete_confirmation' && (job.payload?.ticket_version ?? 0)!==ticketVersion(row)) return null;
      if(job.kind==='transfer_notice') return {to:job.recipient,subject:'Transferência de inscrição — Cronoteam',html:'<h1>Inscrição transferida</h1><p>A titularidade deste ingresso foi alterada. O acesso anterior foi substituído.</p>',messageId:`<checkout-${job.id}@cronoteam.com.br>`};
      if(job.kind==='refund') {
        if(row.payment_status!=='refunded') return null;
        subject='Reembolso da inscrição — Cronoteam';
        html=`<h1>Inscrição reembolsada</h1><p>${escape(currentTicketIdentity(row).fullName)} · ${escape(row.event_title)}</p>
          <p>Inscrição ${escape(row.confirmation_code)}. Valor: ${money(row.snapshot.pricing.total)}.</p><p>Este ingresso não é mais válido.</p>`;
      } else {
        if(!ticketView(row).released) return null;
        subject='Sua inscrição está confirmada — Cronoteam';html=`<h1>Sua inscrição está confirmada</h1>${ticketHtml(row)}`;
      }
    }
    // Comprador que usa o mesmo e-mail do convidado recebe o convite no resumo, sem envio duplicado.
    const needsAccount=rows.some(r=>!r.runner_id && currentTicketIdentity(r).deliveryMode==='email' &&
      currentTicketIdentity(r).email?.toLowerCase()===job.recipient.toLowerCase() && (!job.registration_id || r.id===job.registration_id));
    if(needsAccount && job.kind!=='refund') html+=`<p>Seu ingresso já é válido. Para acompanhá-lo na sua conta, cadastre-se com os dados de quem vai correr.</p><p><a href="${escape(site())}/cadastro">Completar cadastro</a></p>`;
    return {to:job.recipient,subject,html,messageId:`<checkout-${job.id}@cronoteam.com.br>`};
  }
  async function dispatch(id:string) {
    const client=await pool.connect();let locked=false,orderLock:string|null=null,bonusLock:string|null=null;
    try {
      locked=(await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,819)) AS locked',[id])).rows[0].locked;
      if(!locked) return;
      const job=await withTransaction(async()=> {
        const row=(await query('SELECT * FROM checkout_delivery_jobs WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!row || row.status!=='pending' || new Date(row.next_attempt_at).getTime()>Date.now()) return null;
        await query("UPDATE checkout_delivery_jobs SET status='sending',claimed_at=now(),attempts=attempts+1,last_error=NULL WHERE id=$1",[id]);
        return row;
      });
      if(!job) return;
      let began=false;
      try {
        const acquired=(await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,817)) AS locked',[job.order_id])).rows[0].locked;
        if(!acquired) throw fail('Pedido em processamento.');
        orderLock=job.order_id;
        const rows=await ticketRows(job.order_id);
        if(rows.some(r=>r.order_status==='needs_review')) throw fail('Pedido em revisão.');
        if(job.kind==='bonus') {
          const key=`${job.payload.leaderId}:${job.payload.eventId}`;
          if(!(await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,821)) AS locked',[key])).rows[0].locked) throw fail('Bônus em processamento.');
          bonusLock=key;
          // Domínio canônico usa estado atual; uma confirmação já estornada não concede bônus antigo.
          if(!job.payload.refund && !rows.some(r=>r.id===job.registration_id && ticketView(r).released)) {
            await query("UPDATE checkout_delivery_jobs SET status='cancelled' WHERE id=$1",[id]);return;
          }
          began=true;await bonus(job.payload);
        } else {
          const mail=await render(job,rows);
          if(!mail) {await query("UPDATE checkout_delivery_jobs SET status='cancelled' WHERE id=$1",[id]);return;}
          began=true;
          if(!await send(mail)) {began=false;throw new Error('SMTP não configurado.');}
        }
        await query("UPDATE checkout_delivery_jobs SET status='done',completed_at=now() WHERE id=$1",[id]);
      } catch {
        // SMTP não oferece transação com o banco: envio incerto requer decisão operacional.
        const retryable=(!began || job.kind==='bonus') && job.attempts<7;
        await query(`UPDATE checkout_delivery_jobs SET status=$2,last_error=$3,
          next_attempt_at=now()+($4::int * interval '1 minute') WHERE id=$1`,[id,retryable?'pending':'unknown',
          began && job.kind!=='bonus'?'Resultado do envio incerto; conferir antes de reenviar.':'Entrega pendente; verifique a configuração e o estado do pedido.',Math.min(60,2**job.attempts)]);
      }
    } finally {
      let discard=false;
      try {
        if(bonusLock) await client.query('SELECT pg_advisory_unlock(hashtextextended($1,821))',[bonusLock]);
        if(orderLock) await client.query('SELECT pg_advisory_unlock(hashtextextended($1,817))',[orderLock]);
        if(locked) await client.query('SELECT pg_advisory_unlock(hashtextextended($1,819))',[id]);
      } catch {discard=true;}
      finally {client.release(discard);}
    }
  }
  let running=false;
  async function sweep() {
    if(running || !await deliveryInstalled()) return;
    running=true;
    try {
      await materialize();
      // Recuperação de crash nunca reenvia automaticamente um e-mail que pode ter sido aceito.
      await query(`UPDATE checkout_delivery_jobs SET status=CASE WHEN kind='bonus' THEN 'pending' ELSE 'unknown' END,
        last_error='Processamento interrompido; conferir entrega.' WHERE status='sending' AND claimed_at<now()-interval '15 minutes'`);
      const jobs=(await query("SELECT id FROM checkout_delivery_jobs WHERE status='pending' AND next_attempt_at<=now() ORDER BY next_attempt_at,created_at LIMIT 100")).rows;
      for(const job of jobs) await dispatch(job.id);
    } finally {running=false;}
  }
  async function resend(registrationId:string,userId:string,key:string) {
    const ticket=await authorizedTicket(registrationId,userId);
    const row=(await ticketRows(ticket.order_id)).find(r=>r.id===registrationId)!;
    if(userId!==row.buyer_id && userId!==row.runner_id) throw fail('Reenvio disponível apenas ao comprador ou corredor.',403);
    const buyer=(await query('SELECT email FROM users WHERE id=$1',[row.buyer_id])).rows[0]?.email;
    // Reenvio solicitado pelo comprador sempre vai ao comprador; corredor recebe em seu próprio e-mail.
    const recipient=userId===row.buyer_id?buyer:(await query('SELECT email FROM users WHERE id=$1',[userId])).rows[0]?.email;
    if(!recipient) throw fail('Destinatário indisponível.');
    return enqueue(row.order_id,row.id,'athlete_confirmation',`resend:${userId}:${registrationId}:${key}`,recipient,{ticket_version:ticketVersion(row)});
  }
  return {materialize,dispatch,sweep,resend,render};
}
export const checkoutDelivery=createCheckoutDeliveryService();

export async function retryCheckoutDelivery(id:string,acceptPossibleDuplicate=false) {
  const client=await pool.connect();let locked=false;
  try {
    locked=(await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,819)) AS locked',[id])).rows[0].locked;
    if(!locked) throw fail('Entrega em processamento.');
    await withTransaction(async()=>{
      const job=(await query('SELECT status FROM checkout_delivery_jobs WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!job) throw fail('Entrega não encontrada.',404);
      if(!['pending','unknown'].includes(job.status)) throw fail('Entrega não pode ser retomada neste estado.');
      if(job.status==='unknown' && !acceptPossibleDuplicate) throw fail('Confira o provedor e aceite a possibilidade de envio duplicado.');
      await query("UPDATE checkout_delivery_jobs SET status='pending',attempts=0,next_attempt_at=now(),last_error=NULL WHERE id=$1",[id]);
    });
  } finally {
    let discard=false;
    try {if(locked) await client.query('SELECT pg_advisory_unlock(hashtextextended($1,819))',[id]);}
    catch {discard=true;}
    finally {client.release(discard);}
  }
}
