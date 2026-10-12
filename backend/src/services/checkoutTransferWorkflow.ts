import pool,{query,withTransaction} from '../config/database.js';
import {checkoutPaymentGateway,type CheckoutPaymentGateway,type GatewayPayment} from './checkoutPaymentGateway.js';
import {finalizeCheckoutTransfer,validateCheckoutTransfer} from './checkoutTransferService.js';
import {getSystemSettings} from './systemSettingsService.js';
import {getTransferRequestById} from './transferRequestService.js';
import {z} from 'zod';
import {isValidCpfDigits} from '../utils/cpf.js';

export const checkoutTransferInput=z.object({request_key:z.string().uuid(),
  new_runner_cpf:z.string().max(18).transform(v=>v.replace(/\D/g,'')).refine(isValidCpfDigits),
  new_runner_email:z.string().trim().email().max(254).optional(),reason:z.string().trim().max(1000).optional()}).strict();
export const checkoutTransferDecision=z.object({status:z.enum(['approved','rejected','cancelled']),
  admin_notes:z.string().trim().max(2000).optional(),new_runner_id:z.string().uuid().optional()}).strict();
export function parseTransferInput<T>(schema:z.ZodType<T>,value:unknown):T {
  const parsed=schema.safeParse(value);
  if(!parsed.success) throw Object.assign(new Error('Dados da transferência inválidos.'),{statusCode:400});
  return parsed.data;
}

const fail=(message:string,statusCode=409)=>Object.assign(new Error(message),{statusCode});
const reference=(id:string)=>`TRANSFER-${id}`;
const admin=async(id:string)=>(await query("SELECT 1 FROM user_roles WHERE user_id=$1 AND role='admin'",[id])).rows.length>0;
export async function isCheckoutTransfer(id:string) {
  return !!(await query("SELECT 1 FROM transfer_requests t JOIN registrations r ON r.id=t.registration_id WHERE t.id=$1 AND to_jsonb(r)->>'order_id' IS NOT NULL",[id])).rows.length;
}
async function request(id:string,actor?:string) {
  const row=(await query(`SELECT t.*,r.order_id FROM transfer_requests t JOIN registrations r ON r.id=t.registration_id
    WHERE t.id=$1 AND r.order_id IS NOT NULL`,[id])).rows[0];
  if(!row || actor && row.requested_by!==actor && !await admin(actor)) throw fail('Solicitação não encontrada.',404);
  return row;
}
// Serializa POST, consulta, callback e decisão administrativa. O núcleo também bloqueia o pedido.
async function serialized<T>(id:string,work:()=>Promise<T>) {
  const client=await pool.connect();let locked=false;
  try {
    locked=(await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,819)) AS locked',[id])).rows[0].locked;
    if(!locked) throw fail('Transferência em processamento. Consulte novamente.');
    return await work();
  } finally {
    if(locked) await client.query('SELECT pg_advisory_unlock(hashtextextended($1,819))',[id]);
    client.release();
  }
}
async function resolveRecipient(cpf?:string,email?:string) {
  const rows=(await query(`SELECT p.id FROM profiles p JOIN users u ON u.id=p.id
    WHERE ($1::text IS NOT NULL AND regexp_replace(COALESCE(p.cpf,''),'[^0-9]','','g')=$1)
       OR ($2::text IS NOT NULL AND lower(u.email)=$2)`,[cpf || null,email?.trim().toLowerCase() || null])).rows;
  if(rows.length>1) throw fail('CPF e e-mail devem identificar um único cadastro.');
  if(rows.length && cpf && email) {
    const match=(await query(`SELECT 1 FROM profiles p JOIN users u ON u.id=p.id WHERE p.id=$1
      AND regexp_replace(COALESCE(p.cpf,''),'[^0-9]','','g')=$2 AND lower(u.email)=$3`,[rows[0].id,cpf,email.toLowerCase()])).rows.length;
    if(!match) throw fail('CPF e e-mail não correspondem ao mesmo cadastro.');
  }
  return rows[0]?.id ?? null;
}
async function resolvePending(t:any) {
  if(t.new_runner_id) return;
  const id=await resolveRecipient(t.new_runner_cpf,t.new_runner_email);
  if(!id) throw fail('O novo titular precisa completar o cadastro antes de concluir a transferência.');
  await query('UPDATE transfer_requests SET new_runner_id=$2,updated_at=now() WHERE id=$1',[t.id,id]);
}
export interface CheckoutTransferInput {request_key:string;new_runner_cpf:string;new_runner_email?:string;reason?:string}
export function createCheckoutTransferWorkflow(gateway:CheckoutPaymentGateway=checkoutPaymentGateway) {
  let sweeping=false;
  async function view(id:string) {
    const t=await getTransferRequestById(id);
    const p=(await query('SELECT * FROM checkout_transfer_payments WHERE request_id=$1',[id])).rows[0];
    // O solicitante histórico pode consultar a taxa, mas não recebe o código de acesso do titular atual.
    const {confirmation_code:_code,runner_name:_currentRunner,...safe}=t ?? {};
    const payable=p?.state==='pending' && t?.status==='pending';
    return {...safe,payment:p?{status:p.state,asaas_payment_id:p.provider_id,
      value:Number(p.amount_cents)/100,
      invoice_url:payable?p.invoice_url:null,
      pix_qr_code:payable?p.pix_qr_code ?? null:null,
      issue:p.issue}:null};
  }
  async function finish(t:any) {
    if(!['pending','approved'].includes(t.status)) return;
    if(Number(t.transfer_fee)>0 && t.payment_status!=='paid' && t.status!=='approved') return;
    await resolvePending(t);
    await finalizeCheckoutTransfer(t.id);
  }
  async function apply(t:any,a:any,p:GatewayPayment) {
    if(a.state==='refunded') return;
    if(!p.id || a.provider_id && a.provider_id!==p.id || p.customer!==a.customer_id || p.externalReference!==reference(t.id)
      || p.billingType!=='PIX' || !Number.isFinite(Number(p.value)) || Math.round(Number(p.value)*100)!==Number(a.amount_cents)) {
      await query("UPDATE checkout_transfer_payments SET state='review',issue='Cobrança divergente. Revisão financeira necessária.',updated_at=now() WHERE request_id=$1",[t.id]);
      return;
    }
    // Revisão nunca volta a liberar a troca automaticamente; aceita apenas estorno total comprovado.
    if(a.state==='review' && p.status!=='REFUNDED') return;
    const hasRefund=Array.isArray(p.refunds) && p.refunds.some(r=>r.status!=='CANCELLED');
    const paid=!p.deleted && !hasRefund && ['CONFIRMED','RECEIVED'].includes(p.status);
    const refunded=p.status==='REFUNDED';
    await withTransaction(async()=>{
      await query(`UPDATE checkout_transfer_payments SET provider_id=$2,provider_status=$3,invoice_url=$4,
        pix_qr_code=COALESCE($5,pix_qr_code),state=$6,issue=$7,updated_at=now() WHERE request_id=$1`,
        [t.id,p.id,p.status,p.invoiceUrl ?? null,p.pixQrCode ?? null,
        refunded?'refunded':paid?'paid':hasRefund || p.deleted || a.state==='paid'?'review':'pending',
        !refunded && (hasRefund || p.deleted || a.state==='paid' && !paid)?'Situação financeira alterada. Revisão necessária.':null]);
      await query(`UPDATE transfer_requests SET asaas_payment_id=$2,payment_status=CASE WHEN $3 THEN 'paid' WHEN $4 THEN 'refunded' ELSE payment_status END,updated_at=now() WHERE id=$1`,[t.id,p.id,paid,refunded]);
    });
    if(paid) {
      // Pagamento permanece registrado se uma restrição impedir a troca; GET e callback podem retomar.
      try {await finish(await request(t.id));}
      catch(error:any) {
        if(error.statusCode!==409 && !['23505','CT001'].includes(error.code)) throw error;
        await query('UPDATE checkout_transfer_payments SET issue=$2,updated_at=now() WHERE request_id=$1',[t.id,
          error.statusCode===409?error.message:'Ingresso indisponível para transferência. Revisão necessária.']);
      }
    }
  }
  async function fillPixQr(id:string) {
    const a=(await query('SELECT * FROM checkout_transfer_payments WHERE request_id=$1',[id])).rows[0];
    if(!a || a.state!=='pending' || a.pix_qr_code || !a.provider_id) return;
    try {
      const payload=await gateway.pixQr(a.provider_id);
      if(payload) await query('UPDATE checkout_transfer_payments SET pix_qr_code=$2,updated_at=now() WHERE request_id=$1 AND pix_qr_code IS NULL',[id,payload]);
    } catch { /* GET/atualização retomam o QR sem nova cobrança. */ }
  }
  async function reconcile(id:string) {
    const t=await request(id),a=(await query('SELECT * FROM checkout_transfer_payments WHERE request_id=$1',[id])).rows[0];
    if(!a) {await finish(t);return;}
    if(a.state==='refunded' || a.state==='review' && !a.provider_id) return;
    if(a.provider_id) {await apply(t,a,await gateway.get(a.provider_id));await fillPixQr(id);return;}
    if(a.state==='prepared') return;
    const found=await gateway.find(reference(id));
    if(found.length===1) {await apply(t,a,found[0]);await fillPixQr(id);}
    else await query(`UPDATE checkout_transfer_payments SET state=$2,issue=$3,updated_at=now() WHERE request_id=$1`,
      [id,found.length?'review':'creating',found.length?'Mais de uma cobrança encontrada. Revisão financeira necessária.':'Aguardando localizar a cobrança. Não gere outra taxa.']);
  }
  return {
    async create(registrationId:string,actor:string,input:CheckoutTransferInput) {
      const id=await withTransaction(async()=>{
        const previous=(await query('SELECT * FROM transfer_requests WHERE requested_by=$1 AND checkout_request_key=$2',[actor,input.request_key])).rows[0];
        const cpf=input.new_runner_cpf?.replace(/\D/g,''),email=input.new_runner_email?.trim().toLowerCase();
        if(previous) {
          if(previous.registration_id!==registrationId || (previous.new_runner_cpf ?? '')!==(cpf ?? '') || (previous.new_runner_email ?? '')!==(email ?? '') || (previous.reason ?? '')!==(input.reason ?? '')) throw fail('Chave já utilizada para outra solicitação.');
          return previous.id;
        }
        const row=(await query('SELECT r.*,o.buyer_id FROM registrations r JOIN checkout_orders o ON o.id=r.order_id WHERE r.id=$1',[registrationId])).rows[0];
        if(!row || actor!==row.runner_id && actor!==row.buyer_id && !await admin(actor)) throw fail('Ingresso não encontrado.',404);
        if(!(await query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,817)) AS locked',[row.order_id])).rows[0].locked) throw fail('Pedido em processamento. Tente novamente.');
        if((await query("SELECT 1 FROM transfer_requests WHERE registration_id=$1 AND checkout_ticket_version=$2 AND status IN ('pending','approved')",[row.id,row.checkout_ticket_version])).rows.length) throw fail('Já existe uma transferência pendente para este ingresso.');
        const recipient=await resolveRecipient(cpf,email),settings=await getSystemSettings();
        const t=(await query(`INSERT INTO transfer_requests(registration_id,requested_by,new_runner_id,new_runner_cpf,new_runner_email,
          transfer_fee,reason,checkout_ticket_version,checkout_request_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [row.id,actor,recipient,cpf ?? null,email ?? null,settings.transfer_fee ?? 0,input.reason ?? null,row.checkout_ticket_version,input.request_key])).rows[0];
        await validateCheckoutTransfer(t.id,true);
        if(recipient && Number(settings.transfer_fee ?? 0)===0) await finalizeCheckoutTransfer(t.id);
        return t.id;
      });
      return view(id);
    },
    async read(id:string,actor:string) {
      await request(id,actor);
      return serialized(id,async()=>{await reconcile(id);return view(id);});
    },
    async pay(id:string,actor:string) {
      await request(id,actor);
      return serialized(id,async()=>{
        const t=await request(id,actor);
        if(!['pending','approved'].includes(t.status)) return view(id);
        let a=(await query('SELECT * FROM checkout_transfer_payments WHERE request_id=$1',[id])).rows[0];
        if(a && a.state!=='prepared') {await reconcile(id);return view(id);}
        await resolvePending(t);await validateCheckoutTransfer(id);
        if(Number(t.transfer_fee)===0) {await finish(await request(id));return view(id);}
        if(!a) {
          const customer=await gateway.customer(t.requested_by);
          a=(await query(`INSERT INTO checkout_transfer_payments(request_id,customer_id,amount_cents,state) VALUES($1,$2,$3,'prepared') RETURNING *`,[id,customer,Math.round(Number(t.transfer_fee)*100)])).rows[0];
        }
        // Gravado ANTES do POST. Falha/timeout nunca autoriza repetir uma cobrança incerta.
        await query("UPDATE checkout_transfer_payments SET state='creating',updated_at=now() WHERE request_id=$1",[id]);
        let payment:GatewayPayment;
        try {
          payment=await gateway.create({customer:a.customer_id,value:Number(a.amount_cents)/100,billingType:'PIX',description:'Taxa de transferência de inscrição',externalReference:reference(id),dueDate:new Date(Date.now()+3*86400000).toISOString().slice(0,10)});
        } catch {
          await query("UPDATE checkout_transfer_payments SET issue='Não foi possível confirmar a criação. Consulte novamente.',updated_at=now() WHERE request_id=$1",[id]);
          return view(id);
        }
        await apply(t,a,payment);await fillPixQr(id);return view(id);
      });
    },
    async decide(id:string,actor:string,input:{status:'approved'|'rejected'|'cancelled';admin_notes?:string;new_runner_id?:string}) {
      if(!await admin(actor)) throw fail('Apenas administradores podem processar solicitações.',403);
      return serialized(id,async()=>{
        await withTransaction(async()=>{
          const t=await request(id);
          if(t.status==='completed' && input.status==='approved' && (!input.new_runner_id || input.new_runner_id===t.new_runner_id)) return;
          if(!['pending','approved'].includes(t.status)) throw fail('Solicitação já processada.');
          const attempt=(await query('SELECT state FROM checkout_transfer_payments WHERE request_id=$1',[id])).rows[0];
          if(attempt && attempt.state!=='refunded' && input.status!=='approved') throw fail('Concilie o estorno da taxa antes de cancelar ou rejeitar.');
          await query(`UPDATE transfer_requests SET status=$2,admin_notes=$3,processed_by=$4,processed_at=now(),
            new_runner_id=COALESCE($5,new_runner_id),updated_at=now() WHERE id=$1`,[id,input.status,input.admin_notes ?? null,actor,input.new_runner_id ?? null]);
          if(input.status==='approved') await finish(await request(id));
        });return view(id);
      });
    },
    /** Cancelamento pelo solicitante para reabrir o ingresso e informar outro destinatário. */
    async cancel(id:string,actor:string) {
      await request(id,actor);
      return serialized(id,async()=>{
        const t=await request(id,actor);
        if(t.requested_by!==actor) throw fail('Apenas quem solicitou a transferência pode cancelá-la.',403);
        if(t.status==='cancelled') return view(id);
        if(t.status!=='pending') throw fail('Só é possível cancelar transferências pendentes.',409);
        const a=(await query('SELECT * FROM checkout_transfer_payments WHERE request_id=$1',[id])).rows[0];
        if(a) {
          if(a.state==='review') throw fail('Esta taxa está em revisão financeira e não pode ser cancelada por aqui.',409);
          if(a.state==='paid') throw fail('A taxa já foi paga. Aguarde a conclusão ou peça o estorno ao suporte.',409);
          if(a.state==='creating' || a.state==='pending') {
            let providerId=a.provider_id as string|null;
            if(!providerId) {
              const found=await gateway.find(reference(id));
              if(found.length>1) throw fail('Cobrança em revisão. Não é possível cancelar agora.',409);
              if(found.length===1) providerId=found[0].id;
            }
            if(providerId) {
              const remote=await gateway.get(providerId);
              if(!remote.deleted && ['CONFIRMED','RECEIVED'].includes(remote.status)) {
                throw fail('A taxa já foi paga. Aguarde a conclusão ou peça o estorno ao suporte.',409);
              }
              if(!remote.deleted && ['PENDING','OVERDUE'].includes(remote.status)) await gateway.remove(providerId);
              await query(`UPDATE checkout_transfer_payments SET provider_id=COALESCE(provider_id,$2),state='refunded',
                invoice_url=NULL,issue='Cancelado pelo solicitante.',provider_status='CANCELLED',updated_at=now() WHERE request_id=$1`,[id,providerId]);
            } else {
              await query(`UPDATE checkout_transfer_payments SET state='refunded',invoice_url=NULL,
                issue='Cancelado pelo solicitante.',updated_at=now() WHERE request_id=$1`,[id]);
            }
          } else if(a.state==='prepared') {
            await query(`UPDATE checkout_transfer_payments SET state='refunded',invoice_url=NULL,
              issue='Cancelado pelo solicitante.',updated_at=now() WHERE request_id=$1`,[id]);
          }
        }
        await query(`UPDATE transfer_requests SET status='cancelled',processed_by=$2,processed_at=now(),updated_at=now() WHERE id=$1`,[id,actor]);
        return view(id);
      });
    },
    async webhook(payload:{payment?:{id?:string;externalReference?:string|null}}) {
      const payment=payload.payment;if(!payment?.id) return false;
      const ref=/^TRANSFER-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(payment.externalReference ?? '')?.[1];
      const t=(await query(`SELECT t.id FROM transfer_requests t JOIN registrations r ON r.id=t.registration_id
        WHERE (t.asaas_payment_id=$1 OR t.id=$2::uuid) AND to_jsonb(r)->>'order_id' IS NOT NULL`,[payment.id,ref ?? null])).rows[0];
      if(!t) return false;
      await serialized(t.id,async()=>{
        const a=(await query('SELECT * FROM checkout_transfer_payments WHERE request_id=$1',[t.id])).rows[0];
        if(!a || a.state==='prepared') throw fail('Cobrança ainda não registrada para conciliação.');
        if(!a.provider_id) {
          await reconcile(t.id);
          const fresh=(await query('SELECT state FROM checkout_transfer_payments WHERE request_id=$1',[t.id])).rows[0];
          if(fresh.state==='creating') throw fail('Cobrança ainda não localizada. Tente novamente.',503);
          return;
        }
        // A notificação apenas dispara uma consulta autenticada; seus valores/status não autorizam a troca.
        await apply(await request(t.id),a,await gateway.get(payment.id!));
      });
      return true;
    },
    async sweep() {
      if(sweeping) return;sweeping=true;
      try {
        if(!(await query("SELECT to_regclass('public.checkout_transfer_payments') AS t")).rows[0].t) return;
        const rows=(await query(`SELECT p.request_id FROM checkout_transfer_payments p JOIN transfer_requests t ON t.id=p.request_id
          WHERE p.state IN ('creating','pending','paid') AND (p.state<>'paid' OR t.status IN ('pending','approved'))
          AND p.updated_at<now()-interval '5 minutes' ORDER BY p.updated_at LIMIT 50`)).rows;
        for(const row of rows) {
          try {
            await serialized(row.request_id,async()=>{
              await query('UPDATE checkout_transfer_payments SET updated_at=now() WHERE request_id=$1',[row.request_id]);
              await reconcile(row.request_id);
            });
          } catch { /* Próxima execução retoma; nunca cria uma cobrança no worker. */ }
        }
      } finally {sweeping=false;}
    },
  };
}
export const checkoutTransfers=createCheckoutTransferWorkflow();
