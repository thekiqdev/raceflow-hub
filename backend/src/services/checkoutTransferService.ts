import { randomUUID } from 'node:crypto';
import { query,withTransaction } from '../config/database.js';
import { currentTicketIdentity,ticketVersion } from './checkoutTicketIdentity.js';
import { isValidCpfDigits } from '../utils/cpf.js';
import { isPublicTransferDeadlinePassed } from '../utils/eventTransferDeadline.js';
import { getSystemSettings } from './systemSettingsService.js';
const fail=(message:string)=>Object.assign(new Error(message),{statusCode:409});
/** Núcleo interno: somente solicitação persistida/versionada; nunca recebe confirmação financeira do cliente. */
export async function finalizeCheckoutTransfer(requestId:string) {
  return processCheckoutTransfer(requestId,false);
}
/** Valida antes de cobrar; a conclusão repete as verificações sob bloqueio. */
export async function validateCheckoutTransfer(requestId:string,allowMissingRecipient=false) {
  return processCheckoutTransfer(requestId,true,allowMissingRecipient);
}
async function processCheckoutTransfer(requestId:string,validateOnly:boolean,allowMissingRecipient=false) {
  return withTransaction(async()=>{
    const info=(await query('SELECT r.order_id FROM transfer_requests t JOIN registrations r ON r.id=t.registration_id WHERE t.id=$1',[requestId])).rows[0];
    if(!info?.order_id) throw fail('Solicitação não pertence a uma compra em grupo.');
    const locked=(await query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,817)) AS locked',[info.order_id])).rows[0].locked;
    if(!locked) throw fail('Pedido em processamento. Tente novamente.');
    const order=(await query('SELECT * FROM checkout_orders WHERE id=$1 FOR UPDATE',[info.order_id])).rows[0];
    const request=(await query('SELECT * FROM transfer_requests WHERE id=$1 FOR UPDATE',[requestId])).rows[0];
    const done=(await query('SELECT * FROM checkout_ticket_transfers WHERE request_id=$1',[requestId])).rows[0];
    if(done) return {registration_id:done.registration_id,ticket_version:done.ticket_version};
    const row=(await query('SELECT r.*,i.snapshot FROM registrations r JOIN checkout_order_items i ON i.registration_id=r.id WHERE r.id=$1 FOR UPDATE OF r',[request.registration_id])).rows[0];
    if(!row || row.order_id!==order.id || order.status!=='confirmed' || row.status!=='confirmed' || row.payment_status!=='paid') throw fail('Ingresso indisponível para transferência.');
    if(request.checkout_ticket_version==null || request.checkout_ticket_version!==ticketVersion(row)) throw fail('Titularidade alterada. Crie uma nova solicitação.');
    if(!['pending','approved'].includes(request.status)) throw fail('Solicitação indisponível para conclusão.');
    const admin=(await query("SELECT 1 FROM user_roles WHERE user_id=$1 AND role='admin'",[request.requested_by])).rows.length>0;
    if(!admin && request.requested_by!==row.runner_id && request.requested_by!==order.buyer_id) throw fail('Solicitante sem acesso ao ingresso atual.');
    const approvedByAdmin=request.status==='approved' && !!request.processed_by && (await query("SELECT 1 FROM user_roles WHERE user_id=$1 AND role='admin'",[request.processed_by])).rows.length>0;
    if(request.transfer_fee==null || !Number.isFinite(Number(request.transfer_fee)) || Number(request.transfer_fee)<0) throw fail('Taxa de transferência inválida.');
    if(!validateOnly && Number(request.transfer_fee)>0 && request.payment_status!=='paid' && !approvedByAdmin) throw fail('Aguarde a confirmação da taxa de transferência.');
    const event=(await query('SELECT * FROM events WHERE id=$1 FOR SHARE',[row.event_id])).rows[0];
    const settings=await getSystemSettings();
    if(!settings?.enabled_modules?.transfers || event.transfers_enabled===false || (!admin && isPublicTransferDeadlinePassed(event.transfer_until))) throw fail('Transferência indisponível para este evento ou prazo.');
    if((await query("SELECT 1 FROM checkout_payment_refunds WHERE registration_id=$1 AND status<>'failed'",[row.id])).rows.length) throw fail('Ingresso possui reembolso em processamento ou concluído.');
    if(validateOnly && allowMissingRecipient && !request.new_runner_id) return;
    const profile=(await query('SELECT * FROM profiles WHERE id=$1 FOR SHARE',[request.new_runner_id])).rows[0];
    const cpf=String(profile?.cpf ?? '').replace(/\D/g,'');
    if(!profile || !isValidCpfDigits(cpf) || !profile.full_name || !profile.birth_date || profile.id===row.runner_id || cpf===row.participant_cpf) throw fail('Novo titular inválido ou igual ao titular atual.');
    if((await query("SELECT id FROM profiles WHERE regexp_replace(COALESCE(cpf,''),'[^0-9]','','g')=$1",[cpf])).rows.length!==1) throw fail('CPF do novo titular possui cadastro ambíguo.');
    // Antecipar a proteção diferida do banco antes da cobrança; o trigger continua cobrindo concorrência.
    if((await query(`SELECT 1 FROM registrations r LEFT JOIN profiles p ON p.id=r.runner_id
      WHERE r.id<>$1 AND r.event_id=$2 AND COALESCE(r.participant_cpf,regexp_replace(p.cpf,'[^0-9]','','g'))=$3
        AND r.status<>'cancelled' AND NOT (r.status='transferred' AND r.transferred_to_registration_id IS NOT NULL)
        AND (COALESCE(r.payment_method::text,'')<>'free_bonus' OR EXISTS (SELECT 1 FROM leader_invitations li
          WHERE li.bonus_registration_id=r.id AND li.runner_id=r.runner_id AND li.status IN ('sent','used')))`,[row.id,row.event_id,cpf])).rows.length) throw fail('Este participante já possui inscrição neste evento.');
    const category=(await query('SELECT * FROM categories WHERE id=$1 AND event_id=$2 FOR SHARE',[row.category_id,row.event_id])).rows[0];
    const dob=new Date(profile.birth_date),today=new Date();
    let age=today.getFullYear()-dob.getFullYear();if(today.getMonth()<dob.getMonth() || today.getMonth()===dob.getMonth() && today.getDate()<dob.getDate()) age--;
    const sex=String(profile.gender).toUpperCase(),gender=['M','MASCULINO'].includes(sex)?'masculino':['F','FEMININO'].includes(sex)?'feminino':null;
    if(!category || !Number.isFinite(age) || age<0 || age>120 || category.min_age && age<category.min_age || category.max_age && age>category.max_age || category.gender!=='ambos' && category.gender!==gender) throw fail('Novo titular não atende aos requisitos da categoria.');
    if(validateOnly) return;
    const identity={runnerId:profile.id,fullName:profile.full_name,cpf,birthDate:dob.toISOString().slice(0,10),gender:profile.gender,deliveryMode:'account',email:null};
    const version=ticketVersion(row)+1;
    await query("SELECT set_config('cronoteam.order_write',$1,true)",[order.id]);
    await query(`UPDATE registrations SET runner_id=$2,participant_cpf=$3,checkout_current_identity=$4,
      checkout_ticket_version=$5,confirmation_code=$6,updated_at=now() WHERE id=$1`,[row.id,profile.id,cpf,identity,version,randomUUID().replace(/-/g,'').slice(0,20).toUpperCase()]);
    await query(`INSERT INTO checkout_ticket_transfers(request_id,registration_id,order_id,previous_runner_id,new_runner_id,requested_by,previous_identity,current_identity,ticket_version)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[requestId,row.id,order.id,row.runner_id,profile.id,request.requested_by,currentTicketIdentity(row),identity,version]);
    await query("UPDATE transfer_requests SET status='completed',processed_at=now(),updated_at=now() WHERE id=$1",[requestId]);
    await query("UPDATE checkout_delivery_jobs SET status='cancelled' WHERE registration_id=$1 AND kind='athlete_confirmation' AND status IN ('pending','sending')",[row.id]);
    const recipients=(await query('SELECT id,email FROM users WHERE id=ANY($1::uuid[])',[[profile.id,order.buyer_id,row.runner_id].filter(Boolean)])).rows;
    const delivered=new Set<string>();
    for(const id of [profile.id,order.buyer_id]) {
      const email=recipients.find(r=>r.id===id)?.email;if(!email || delivered.has(email.toLowerCase())) continue;delivered.add(email.toLowerCase());
      await query(`INSERT INTO checkout_delivery_jobs(order_id,registration_id,kind,dedupe_key,recipient,payload)
        VALUES($1,$2,'athlete_confirmation',$3,$4,$5) ON CONFLICT DO NOTHING`,[order.id,row.id,`transfer:${requestId}:${id}`,email,{ticket_version:version}]);
    }
    const oldIdentity=currentTicketIdentity(row);
    const previous=recipients.find(r=>r.id===row.runner_id)?.email ?? (oldIdentity.deliveryMode==='email'?oldIdentity.email:null);
    if(previous && !delivered.has(previous.toLowerCase())) await query(`INSERT INTO checkout_delivery_jobs(order_id,registration_id,kind,dedupe_key,recipient,payload)
      VALUES($1,$2,'transfer_notice',$3,$4,$5) ON CONFLICT DO NOTHING`,[order.id,row.id,`transfer-notice:${requestId}`,previous,{ticket_version:version}]);
    return {registration_id:row.id,ticket_version:version};
  });
}
