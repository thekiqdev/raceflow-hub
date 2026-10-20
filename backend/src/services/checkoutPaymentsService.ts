import { createHash } from 'node:crypto';
import pool, { query, withTransaction } from '../config/database.js';
import { checkoutPaymentGateway, type CheckoutPaymentGateway, type GatewayPayment } from './checkoutPaymentGateway.js';
import { cancelCheckoutOrder } from './checkoutOrdersService.js';

const fail=(message:string,statusCode=409)=>Object.assign(new Error(message),{statusCode});
const reference=(id:string)=>`ORDER-${id}`;
const paid=(p:GatewayPayment)=>p.status==='RECEIVED' || (p.billingType==='CREDIT_CARD' && p.status==='CONFIRMED');
const cents=(value:unknown)=>Math.round(Number(value)*100);
const definitive=(error:any)=>error?.response?.status===400;
/** Extrai status/códigos do Asaas sem registrar PAN, CVV ou body completo. */
function gatewayErrorInfo(error:unknown) {
  const err=error as {message?:string;code?:string;response?:{status?:number;data?:{errors?:Array<{code?:string;description?:string;message?:string}>}}};
  if(!err?.response) {
    return {httpStatus:null as number|null,network:true,codes:[] as string[],descriptions:[err?.code || err?.message || 'sem resposta do gateway']};
  }
  const list=Array.isArray(err.response.data?.errors)?err.response.data!.errors!:[];
  return {
    httpStatus:err.response.status ?? null,
    network:false,
    codes:list.map(e=>String(e?.code || '').trim()).filter(Boolean).slice(0,8),
    descriptions:list.map(e=>String(e?.description || e?.message || '').trim()).filter(Boolean).slice(0,5),
  };
}
function logGatewayFailure(context:string,error:unknown) {
  const info=gatewayErrorInfo(error);
  console.error(`❌ Gateway ${context}:`,{
    httpStatus:info.httpStatus,
    network:info.network,
    codes:info.codes,
    descriptions:info.descriptions,
  });
}
/** Mensagem para o comprador: sem jargão de gateway; usa hint da Asaas quando for clara. */
function customerCardRejectMessage(error:unknown,fallback:string) {
  const hint=gatewayErrorInfo(error).descriptions[0];
  if(!hint || hint.length>160) return fallback;
  const technical=/gateway|asaas|provider|tokeniz|http|api\b/i.test(hint);
  if(technical) return fallback;
  return hint.endsWith('.')?hint:`${hint}.`;
}

export interface CheckoutCardInput {
  credit_card_token?:string;
  credit_card?:{holderName:string;number:string;expiryMonth:string;expiryYear:string;ccv:string};
  credit_card_holder_info?:{name:string;email:string;cpfCnpj:string;postalCode:string;addressNumber:string;
    addressComplement?:string;phone:string;mobilePhone?:string};
  remote_ip?:string;
}
function hasCardToken(card?:CheckoutCardInput) {return !!card?.credit_card_token?.trim();}
function hasRawCard(card?:CheckoutCardInput) {return !!card?.credit_card && !!card?.credit_card_holder_info;}
function requireCardInput(card?:CheckoutCardInput) {
  if(hasCardToken(card) || hasRawCard(card)) return;
  throw fail('Informe os dados do cartão para confirmar o pagamento.',400);
}

// Bloqueio de sessão serializa rede/DB por pedido sem manter transação aberta durante HTTP.
// Não é lease: um segundo worker nunca retoma um POST ainda em execução.
async function serialized<T>(id:string,work:()=>Promise<T>) {
  const client=await pool.connect();
  let locked=false;
  try {
    locked=(await client.query("SELECT pg_try_advisory_lock(hashtextextended($1,817)) AS locked",[id])).rows[0].locked;
    if(!locked) throw fail('Pagamento em processamento. Consulte novamente em instantes.');
    return await work();
  } finally {
    if(locked) await client.query('SELECT pg_advisory_unlock(hashtextextended($1,817))',[id]);
    client.release();
  }
}
async function order(id:string,buyerId?:string) {
  const row=(await query('SELECT * FROM checkout_orders WHERE id=$1 AND ($2::uuid IS NULL OR buyer_id=$2) FOR UPDATE',[id,buyerId ?? null])).rows[0];
  if(!row) throw fail('Pedido não encontrado.',404);
  return row;
}
async function latest(id:string) {
  return (await query('SELECT * FROM checkout_payment_attempts WHERE order_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',[id])).rows[0];
}
function publicPayment(a:any) {
  const payable=a?.status==='pending' && !a.cancel_requested;
  return a ? {id:a.id,status:a.status,method:a.method,amount_cents:Number(a.amount_cents),
    invoice_url:payable ? a.invoice_url : null,
    pix_qr_code:payable && a.method==='PIX' ? a.pix_qr_code ?? null : null,
    expires_at:a.expires_at,cancel_requested:!!a.cancel_requested,keep_reservation:!!a.keep_reservation,
    issue:a.issue} : null;
}
async function issue(a:any,message:string,review=false) {
  await withTransaction(async()=> {
    await order(a.order_id);
    await query(`UPDATE checkout_payment_attempts SET issue=$2,checked_at=now(),updated_at=now(),
      status=CASE WHEN $3 THEN 'review' ELSE status END WHERE id=$1`,[a.id,message,review]);
    if(review) await query("UPDATE checkout_orders SET status='needs_review',updated_at=now() WHERE id=$1",[a.order_id]);
  });
}
async function releasePayment(a:any) {
  // Só chamado depois de o gateway confirmar que a cobrança foi removida sem pagamento.
  // keep_reservation=true (troca de meio): volta a reserved sem liberar estoque/cupom.
  await withTransaction(async()=> {
    const o=await order(a.order_id);
    if(o.status!=='awaiting_payment') return;
    const current=(await query('SELECT keep_reservation FROM checkout_payment_attempts WHERE id=$1 FOR UPDATE',[a.id])).rows[0];
    await query("UPDATE checkout_payment_attempts SET status='cancelled',issue=NULL,checked_at=now(),updated_at=now() WHERE id=$1",[a.id]);
    await query("UPDATE checkout_orders SET status='reserved',updated_at=now() WHERE id=$1",[o.id]);
    if(!current?.keep_reservation) await cancelCheckoutOrder(o.id,o.buyer_id);
  });
}
async function refundItems(a:any,registrationIds:string[]) {
  for(const id of registrationIds) {
    const allocation=(await query('SELECT * FROM checkout_payment_allocations WHERE attempt_id=$1 AND registration_id=$2 FOR UPDATE',[a.id,id])).rows[0];
    if(!allocation || Number(allocation.refunded_cents)===Number(allocation.gross_cents) && Number(allocation.gross_cents)>0) continue;
    const reg=(await query('SELECT status,payment_status FROM registrations WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(reg.payment_status==='refunded') continue;
    await query('UPDATE checkout_payment_allocations SET refunded_cents=gross_cents WHERE registration_id=$1',[id]);
    await query("UPDATE registrations SET status='cancelled',payment_status='refunded',updated_at=now() WHERE id=$1",[id]);
    const coupon=(await query('SELECT coupon_id FROM checkout_order_items WHERE registration_id=$1',[id])).rows[0]?.coupon_id;
    if(coupon && reg.status!=='cancelled') await query('UPDATE coupons SET current_uses=GREATEST(0,current_uses-1),updated_at=now() WHERE id=$1',[coupon]);
    await query("INSERT INTO checkout_payment_effects(registration_id,kind) VALUES ($1,'refunded') ON CONFLICT DO NOTHING",[id]);
  }
}
async function apply(a:any,p:GatewayPayment) {
  if((a.provider_id && p.id!==a.provider_id) || p.externalReference!==reference(a.id) || p.customer!==a.customer_id
    || cents(p.value)!==Number(a.amount_cents) || p.billingType!==a.method) {
    await issue(a,'Cobrança divergente: revisão financeira necessária.',true);return;
  }
  await withTransaction(async()=> {
    const o=await order(a.order_id);
    const current=(await query('SELECT * FROM checkout_payment_attempts WHERE id=$1 FOR UPDATE',[a.id])).rows[0];
    await query(`UPDATE checkout_payment_attempts SET provider_id=$2,provider_status=$3,invoice_url=$4,
      pix_qr_code=COALESCE($5,pix_qr_code),checked_at=now(),updated_at=now(),issue=NULL WHERE id=$1`,
      [a.id,p.id,p.status,p.invoiceUrl ?? null,p.pixQrCode ?? null]);
    await query("SELECT set_config('cronoteam.order_write',$1,true)",[o.id]);
    const ids=(await query('SELECT registration_id FROM checkout_payment_allocations WHERE attempt_id=$1 ORDER BY registration_id',[a.id])).rows.map(r=>r.registration_id);
    if(p.status==='REFUNDED') {
      await refundItems(a,ids);
      await query("UPDATE checkout_payment_refunds SET status='done' WHERE attempt_id=$1 AND status<>'failed'",[a.id]);
      await query("UPDATE checkout_payment_attempts SET status='refunded' WHERE id=$1",[a.id]);
      await query("UPDATE checkout_orders SET status='refunded',version=version+1,updated_at=now() WHERE id=$1 AND status<>'refunded'",[o.id]);
      return;
    }
    const refunds=Array.isArray(p.refunds) ? p.refunds : [];
    const requests=(await query("SELECT * FROM checkout_payment_refunds WHERE attempt_id=$1 AND status<>'failed'",[a.id])).rows;
    const done=refunds.filter(r=>r.status==='DONE');
    const unmatched=refunds.some(r=>r.status!=='CANCELLED' && !requests.some(x=>r.description===`ORDER-REFUND-${x.id}` && cents(r.value)===Number(x.amount_cents)));
    for(const r of requests) {
      const remote=done.find(x=>x.description===`ORDER-REFUND-${r.id}` && cents(x.value)===Number(r.amount_cents));
      if(remote && r.status!=='done') {
        await refundItems(a,[r.registration_id]);
        await query("UPDATE checkout_payment_refunds SET status='done' WHERE id=$1",[r.id]);
      } else if(r.status!=='done' && refunds.some(x=>x.status==='CANCELLED' && x.description===`ORDER-REFUND-${r.id}` && cents(x.value)===Number(r.amount_cents))) {
        await query("UPDATE checkout_payment_refunds SET status='failed' WHERE id=$1",[r.id]);
      }
    }
    if(requests.length && requests.some(r=>done.some(x=>x.description===`ORDER-REFUND-${r.id}`)) && !unmatched) {
      const remaining=(await query('SELECT SUM(gross_cents-refunded_cents)::bigint AS cents FROM checkout_payment_allocations WHERE attempt_id=$1',[a.id])).rows[0].cents;
      if(Number(remaining)===0) {
        await refundItems(a,ids);
        await query("UPDATE checkout_orders SET status='refunded',updated_at=now() WHERE id=$1",[o.id]);
        await query("UPDATE checkout_payment_attempts SET status='refunded' WHERE id=$1",[a.id]);
        return;
      }
    }
    if(unmatched || /CHARGEBACK|DUNNING|REFUND/.test(p.status)) {
      await query("UPDATE checkout_orders SET status='needs_review',updated_at=now() WHERE id=$1",[o.id]);
      await query("UPDATE checkout_payment_attempts SET status='review',issue='Estorno externo ou contestação exige conciliação.' WHERE id=$1",[a.id]);
      return;
    }
    if(paid(p)) {
      if(['cancelled','expired','refunded','needs_review'].includes(o.status) || ['cancelled','refunded','review'].includes(current.status)) {
        await query("UPDATE checkout_orders SET status='needs_review',updated_at=now() WHERE id=$1",[o.id]);
        await query("UPDATE checkout_payment_attempts SET status='review',issue='Pagamento recebido após liberação ou divergência. Não reativar inscrições automaticamente.' WHERE id=$1",[a.id]);
        return;
      }
      if(o.status==='awaiting_payment') {
        await query("UPDATE registrations SET status='confirmed',payment_status='paid',updated_at=now() WHERE order_id=$1 AND status='pending'",[o.id]);
        await query('UPDATE checkout_payment_allocations SET settled_at=COALESCE(settled_at,now()) WHERE attempt_id=$1',[a.id]);
        await query(`INSERT INTO checkout_payment_effects(registration_id,kind) SELECT registration_id,'confirmed'
          FROM checkout_payment_allocations WHERE attempt_id=$1 ON CONFLICT DO NOTHING`,[a.id]);
        await query("UPDATE checkout_orders SET status='confirmed',version=version+1,updated_at=now() WHERE id=$1",[o.id]);
      }
      await query("UPDATE checkout_payment_attempts SET status='paid' WHERE id=$1",[a.id]);
      return;
    }
    // Nunca rebaixar uma confirmação por uma consulta atrasada ou estado inesperado.
    if(['paid','refunded','review'].includes(current.status)) return;
    if(p.deleted===true && ['PENDING','OVERDUE'].includes(p.status)) {
      await releasePayment(a);return;
    }
    if(current.status==='cancelled' || ['cancelled','expired'].includes(o.status)) {
      await query("UPDATE checkout_orders SET status='needs_review',updated_at=now() WHERE id=$1",[o.id]);
      await query("UPDATE checkout_payment_attempts SET status='review',issue='Cobrança reaberta após liberação. Revisão necessária.' WHERE id=$1",[a.id]);
      return;
    }
    await query("UPDATE checkout_payment_attempts SET status='pending' WHERE id=$1",[a.id]);
  });
}

export function createCheckoutPaymentsService(gateway:CheckoutPaymentGateway) {
  async function reconcileUnlocked(a:any) {
    if(!a || a.method==='FREE' || a.status==='failed') return;
    if(a.status==='preparing') {
      if(a.cancel_requested || new Date(a.expires_at).getTime()<=Date.now()) await releasePayment(a);
      return;
    }
    await query('UPDATE checkout_payment_attempts SET checked_at=now() WHERE id=$1',[a.id]);
    try {
      let p:GatewayPayment;
      if(a.provider_id) p=await gateway.get(a.provider_id);
      else {
        const matches=await gateway.find(reference(a.id));
        if(matches.length>1) { await issue(a,'Mais de uma cobrança encontrada. Revisão necessária.',true);return; }
        if(!matches.length) { await issue(a,'Resultado da cobrança ainda desconhecido. Não será reenviada automaticamente.');return; }
        p=matches[0];
      }
      await apply(a,p);
      let fresh=(await query('SELECT * FROM checkout_payment_attempts WHERE id=$1',[a.id])).rows[0];
      // QR pode ficar pronto depois da criação; tenta completar sem nova cobrança.
      if(fresh.method==='PIX' && fresh.status==='pending' && !fresh.pix_qr_code && fresh.provider_id) {
        try {
          const payload=await gateway.pixQr(fresh.provider_id);
          if(payload) {
            await query('UPDATE checkout_payment_attempts SET pix_qr_code=$2,updated_at=now() WHERE id=$1 AND pix_qr_code IS NULL',[fresh.id,payload]);
            fresh=(await query('SELECT * FROM checkout_payment_attempts WHERE id=$1',[a.id])).rows[0];
          }
        } catch { /* Conciliação segue; o comprador pode atualizar a tela. */ }
      }
      if(fresh.status==='pending' && (fresh.cancel_requested || new Date(fresh.expires_at).getTime()<=Date.now())) {
        // CONFIRMED Pix e análise de risco não são comprovantes de ausência de pagamento.
        if(!p.deleted && ['PENDING','OVERDUE'].includes(p.status)) {
          await query('UPDATE checkout_payment_attempts SET cancel_requested=true WHERE id=$1',[a.id]);
          await gateway.remove(p.id);
          await apply(fresh,await gateway.get(p.id));
        }
      }
    } catch {
      await issue(a,'Gateway indisponível. Reserva mantida até a conciliação.');
    }
  }
  async function tokenize(id:string,buyerId:string,card:{
    credit_card:{holderName:string;number:string;expiryMonth:string;expiryYear:string;ccv:string};
    credit_card_holder_info:{name:string;email:string;cpfCnpj:string;postalCode:string;addressNumber:string;
      addressComplement?:string;phone:string;mobilePhone?:string};
  },remoteIp:string) {
    if(!remoteIp.trim()) throw fail('Não foi possível identificar o IP do comprador para tokenizar o cartão.',400);
    return serialized(id,async()=> {
      const o=await withTransaction(()=>order(id,buyerId));
      if(!['reserved','awaiting_payment'].includes(o.status)) throw fail('Pedido indisponível para tokenizar cartão.');
      if(Number(o.total_cents)===0) throw fail('Pedido gratuito não usa cartão.');
      const event=(await query('SELECT credit_card_enabled,credit_card_disabled_at FROM events WHERE id=$1',[o.event_id])).rows[0];
      if(event?.credit_card_enabled===false || event?.credit_card_disabled_at && new Date(event.credit_card_disabled_at).getTime()<=Date.now()) {
        throw fail('Forma de pagamento indisponível.');
      }
      const customer=await gateway.customer(buyerId);
      try {
        const token=await gateway.tokenize({
          customer,
          creditCard:card.credit_card,
          creditCardHolderInfo:card.credit_card_holder_info,
          remoteIp:remoteIp.trim(),
        });
        return {
          credit_card_token:token.creditCardToken,
          brand:token.creditCardBrand ?? null,
          last4:token.creditCardNumber ?? null,
        };
      } catch(error) {
        logGatewayFailure('tokenize',error);
        if(definitive(error)) {
          throw fail(customerCardRejectMessage(error,'Não foi possível validar este cartão. Confira os dados e tente novamente.'),400);
        }
        throw fail('Não foi possível tokenizar o cartão agora. Tente novamente.',502);
      }
    });
  }
  async function start(id:string,buyerId:string,key:string,method:'PIX'|'CREDIT_CARD',card?:CheckoutCardInput) {
    if(method==='CREDIT_CARD') requireCardInput(card);
    return serialized(id,async()=> {
      let isNew=false;
      const a=await withTransaction(async()=> {
        const o=await order(id,buyerId);
        const existing=(await query('SELECT * FROM checkout_payment_attempts WHERE order_id=$1 AND request_key=$2',[id,key])).rows[0];
        if(existing) {
          if(existing.method!==method && existing.method!=='FREE') throw fail('A chave já foi usada com outra forma de pagamento.');
          return existing;
        }
        const previous=await latest(id);
        if(previous && !['failed','cancelled'].includes(previous.status)) throw fail('Este pedido já possui uma tentativa. Consulte o pagamento existente.');
        if(o.status!=='reserved' || new Date(o.reservation_expires_at).getTime()<=Date.now()) throw fail('Reserva indisponível ou expirada.');
        const event=(await query('SELECT * FROM events WHERE id=$1 FOR SHARE',[o.event_id])).rows[0];
        const prefix=method==='PIX' ? 'pix' : 'credit_card';
        if(Number(o.total_cents)>0 && (event[`${prefix}_enabled`]===false || event[`${prefix}_disabled_at`] && new Date(event[`${prefix}_disabled_at`]).getTime()<=Date.now())) throw fail('Forma de pagamento indisponível.');
        const created=(await query(`INSERT INTO checkout_payment_attempts(order_id,request_key,method,status,amount_cents,expires_at)
          VALUES ($1,$2,$3,'preparing',$4,$5) RETURNING *`,[id,key,Number(o.total_cents)===0?'FREE':method,o.total_cents,o.reservation_expires_at])).rows[0];
        // Só a leva atual (pending): idas/voltas deixam registrations canceladas no mesmo order_id.
        await query(`INSERT INTO checkout_payment_allocations(registration_id,attempt_id,gross_cents,platform_fee_cents)
          SELECT id,$2,round(total_amount*100),round(platform_fee_amount*100) FROM registrations WHERE order_id=$1 AND status='pending'
          ON CONFLICT(registration_id) DO UPDATE SET attempt_id=EXCLUDED.attempt_id,gross_cents=EXCLUDED.gross_cents,platform_fee_cents=EXCLUDED.platform_fee_cents`,[id,created.id]);
        const sum=(await query('SELECT SUM(gross_cents)::bigint AS total FROM checkout_payment_allocations WHERE attempt_id=$1',[created.id])).rows[0].total;
        if(Number(sum)!==Number(o.total_cents)) throw fail('Total das inscrições divergente.');
        await query("SELECT set_config('cronoteam.order_write',$1,true)",[id]);
        if(created.method!=='FREE') await query(`UPDATE registrations SET payment_method=$2,updated_at=now() WHERE order_id=$1 AND status='pending'`,[id,method==='PIX'?'pix':'credit_card']);
        await query("UPDATE checkout_orders SET status='awaiting_payment',version=version+1,updated_at=now() WHERE id=$1",[id]);
        isNew=true;return created;
      });
      if(a.method==='FREE') {
        await withTransaction(async()=> {
          const o=await order(id,buyerId);
          if(o.status!=='awaiting_payment') return;
          await query("SELECT set_config('cronoteam.order_write',$1,true)",[id]);
          await query("UPDATE registrations SET status='confirmed',payment_status='paid',updated_at=now() WHERE order_id=$1 AND status='pending'",[id]);
          await query('UPDATE checkout_payment_allocations SET settled_at=now() WHERE attempt_id=$1',[a.id]);
          await query(`INSERT INTO checkout_payment_effects(registration_id,kind) SELECT registration_id,'confirmed'
            FROM checkout_payment_allocations WHERE attempt_id=$1 ON CONFLICT DO NOTHING`,[a.id]);
          await query("UPDATE checkout_payment_attempts SET status='paid' WHERE id=$1",[a.id]);
          await query("UPDATE checkout_orders SET status='confirmed',version=version+1,updated_at=now() WHERE id=$1",[id]);
        });
      } else if(isNew || a.status==='preparing') {
        if(a.method==='CREDIT_CARD' && !hasCardToken(card) && !hasRawCard(card)) {
          await issue(a,'Reenvie os dados do cartão para concluir o pagamento nesta tela.');
          return publicPayment(await latest(id));
        }
        let customer:string;
        try { customer=await gateway.customer(buyerId); }
        catch { await issue(a,'Não foi possível preparar os dados do comprador. Tente novamente.');return publicPayment(await latest(id)); }
        if(new Date(a.expires_at).getTime()<=Date.now()) {await releasePayment(a);return publicPayment(await latest(id));}
        // Persistir ANTES de enviar. Após crash/timeout nunca repetir o POST sem prova de rejeição.
        await query("UPDATE checkout_payment_attempts SET customer_id=$2,status='creating',updated_at=now() WHERE id=$1",[a.id,customer]);
        const prepared={...a,customer_id:customer};
        let response:GatewayPayment;
        try {
          response=await gateway.create({customer,value:Number(a.amount_cents)/100,billingType:a.method,
            externalReference:reference(a.id),dueDate:new Date(a.expires_at).toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}),
            creditCardToken:card?.credit_card_token,creditCard:card?.credit_card,creditCardHolderInfo:card?.credit_card_holder_info,
            remoteIp:card?.remote_ip});
        } catch(error) {
          logGatewayFailure('payment-create',error);
          if(definitive(error)) {
            const issue=customerCardRejectMessage(error,
              'Não foi possível concluir o pagamento com este cartão. Confira os dados, o limite disponível ou tente outro cartão.');
            await withTransaction(async()=> {
              await order(id);
              await query("UPDATE checkout_payment_attempts SET status='failed',issue=$2 WHERE id=$1",[a.id,issue]);
              await query("UPDATE checkout_orders SET status='reserved',updated_at=now() WHERE id=$1",[id]);
            });
          } else {
            await query("UPDATE checkout_payment_attempts SET status='unknown',issue='Ainda não temos a confirmação do pagamento. Aguarde a atualização nesta tela.' WHERE id=$1",[a.id]);
          }
          return publicPayment(await latest(id));
        }
        await apply(prepared,response);
      } else await reconcileUnlocked(a);
      return publicPayment(await latest(id));
    });
  }
  async function reconcile(id:string,buyerId?:string) {
    return serialized(id,async()=> {
      await withTransaction(()=>order(id,buyerId));
      await reconcileUnlocked(await latest(id));
      return publicPayment(await latest(id));
    });
  }
  async function cancel(id:string,buyerId:string) {
    return serialized(id,async()=> {
      const a=await withTransaction(async()=> {
        const o=await order(id,buyerId);
        if(['draft','reviewed','reserved','cancelled','expired'].includes(o.status)) {await cancelCheckoutOrder(id,buyerId);return null;}
        if(o.status!=='awaiting_payment') throw fail('Pedido pago ou em revisão; cancelamento exige estorno.');
        const attempt=await latest(id);
        if(attempt.keep_reservation && attempt.cancel_requested && attempt.status!=='cancelled') {
          throw fail('Há uma troca de meio em andamento. Consulte a situação do pagamento.');
        }
        await query('UPDATE checkout_payment_attempts SET cancel_requested=true,keep_reservation=false WHERE id=$1',[attempt.id]);
        // Nenhuma chamada de cobrança foi iniciada neste estado.
        if(attempt.status==='preparing') {await releasePayment({...attempt,keep_reservation:false});return null;}
        return {...attempt,cancel_requested:true,keep_reservation:false};
      });
      if(a) await reconcileUnlocked(a);
      return publicPayment(await latest(id));
    });
  }
  /** Abandona a cobrança atual e mantém a reserva para iniciar outro meio (PIX ↔ cartão). */
  async function switchMethod(id:string,buyerId:string) {
    return serialized(id,async()=> {
      const a=await withTransaction(async()=> {
        const o=await order(id,buyerId);
        if(o.status!=='awaiting_payment') throw fail('Só é possível trocar o meio com pagamento em aberto.');
        const attempt=await latest(id);
        if(!attempt || attempt.method==='FREE') throw fail('Não há cobrança para trocar.');
        if(attempt.status==='failed' || attempt.status==='cancelled') {
          await query("UPDATE checkout_orders SET status='reserved',updated_at=now() WHERE id=$1 AND status='awaiting_payment'",[id]);
          return null;
        }
        if(['creating','unknown','review','paid','refunded'].includes(attempt.status)) {
          throw fail('Consulte a situação do pagamento antes de trocar o meio.');
        }
        if(attempt.cancel_requested && !attempt.keep_reservation) {
          throw fail('Cancelamento do pedido já foi solicitado.');
        }
        await query('UPDATE checkout_payment_attempts SET cancel_requested=true,keep_reservation=true WHERE id=$1',[attempt.id]);
        if(attempt.status==='preparing') {await releasePayment({...attempt,keep_reservation:true});return null;}
        return {...attempt,cancel_requested:true,keep_reservation:true};
      });
      if(a) await reconcileUnlocked(a);
      const latestAttempt=await latest(id);
      const o=(await query('SELECT status FROM checkout_orders WHERE id=$1',[id])).rows[0];
      if(o?.status==='awaiting_payment' && latestAttempt && !['cancelled','failed'].includes(latestAttempt.status)) {
        // Gateway offline ou cobrança ainda não removível: UI mostra troca em andamento.
        return publicPayment(latestAttempt);
      }
      return publicPayment(latestAttempt);
    });
  }
  async function webhook(payload:{id?:string;event:string;payment:{id:string;externalReference?:string|null}}) {
    const ref=payload.payment.externalReference;
    // Tolera banco sem a migração durante publicação; prefixo próprio jamais cai no legado.
    if(!(await query("SELECT to_regclass('public.checkout_payment_attempts') AS t")).rows[0].t) {
      if(ref?.startsWith('ORDER-')) throw fail('Conciliação de pedidos indisponível.',503);
      return false;
    }
    const attemptId=/^ORDER-([0-9a-f-]{36})$/i.exec(ref ?? '')?.[1];
    const a=(await query('SELECT * FROM checkout_payment_attempts WHERE provider_id=$1 OR id::text=$2',[payload.payment.id,attemptId ?? null])).rows[0];
    if(!a) {if(ref?.startsWith('ORDER-')) throw fail('Tentativa não encontrada.',503);return false;}
    await serialized(a.order_id,async()=> {
      const key=payload.id ? `asaas:${payload.id}` : createHash('sha256').update(JSON.stringify(payload)).digest('hex');
      await query(`INSERT INTO checkout_payment_events(event_key,attempt_id,event_type) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[key,a.id,payload.event]);
      // Reconsulta o estado atual mesmo para evento antigo: payload não confirma pagamento sozinho.
      await reconcileUnlocked(a);
      const fresh=(await query('SELECT issue FROM checkout_payment_attempts WHERE id=$1',[a.id])).rows[0];
      if(!fresh.issue) await query('UPDATE checkout_payment_events SET processed_at=COALESCE(processed_at,now()) WHERE event_key=$1',[key]);
    });
    return true;
  }
  async function markOrderRefundedIfComplete(attemptId:string,orderId:string) {
    const pending=(await query(`SELECT COUNT(*)::int AS n
      FROM checkout_payment_allocations a
      JOIN registrations r ON r.id=a.registration_id
      WHERE a.attempt_id=$1 AND COALESCE(r.payment_status,'')<>'refunded'`,[attemptId])).rows[0].n;
    if(Number(pending)!==0) return;
    await query("UPDATE checkout_payment_attempts SET status='refunded',updated_at=now() WHERE id=$1",[attemptId]);
    await query("UPDATE checkout_orders SET status='refunded',version=version+1,updated_at=now() WHERE id=$1 AND status<>'refunded'",[orderId]);
  }
  async function refund(id:string,registrationId:string,key:string,actorId:string) {
    return serialized(id,async()=> {
      const a=await latest(id);
      if(!a) throw fail('Pagamento não encontrado.',404);
      await reconcileUnlocked(a);
      const localOnly=a.method==='FREE' || Number(a.amount_cents)===0;
      let send=false;
      const r=await withTransaction(async()=> {
        const o=await order(id);
        const previous=(await query('SELECT * FROM checkout_payment_refunds WHERE attempt_id=$1 AND request_key=$2',[a.id,key])).rows[0];
        if(previous) {if(previous.registration_id!==registrationId) throw fail('Chave já utilizada.');return previous;}
        if(o.status!=='confirmed') throw fail('Pedido não disponível para estorno.');
        const current=await latest(id);
        if(current.issue || current.status!=='paid') throw fail('Concilie o pagamento antes de estornar.');
        const allocation=(await query('SELECT * FROM checkout_payment_allocations WHERE attempt_id=$1 AND registration_id=$2',[a.id,registrationId])).rows[0];
        const reg=(await query('SELECT status,payment_status FROM registrations WHERE id=$1 FOR UPDATE',[registrationId])).rows[0];
        if(!allocation || !reg) throw fail('Inscrição não disponível para estorno.');
        if(reg.payment_status==='refunded' || reg.status==='cancelled' || Number(allocation.refunded_cents)>0) {
          throw fail('Inscrição não disponível para estorno.');
        }
        // Cobrança paga: precisa de valor alocado. FREE/R$0: estorno local sem gateway.
        if(!localOnly && Number(allocation.gross_cents)<=0) throw fail('Inscrição não disponível para estorno.');
        if((await query("SELECT 1 FROM checkout_payment_refunds WHERE attempt_id=$1 AND (status IN ('sending','unknown','pending') OR registration_id=$2 AND status='done')",[a.id,registrationId])).rows.length) {
          throw fail('Existe estorno pendente ou concluído.');
        }
        if(localOnly) {
          await query("SELECT set_config('cronoteam.order_write',$1,true)",[id]);
          const created=(await query(`INSERT INTO checkout_payment_refunds(attempt_id,registration_id,request_key,requested_by,amount_cents,status)
            VALUES ($1,$2,$3,$4,$5,'done') RETURNING *`,[a.id,registrationId,key,actorId,Number(allocation.gross_cents)||0])).rows[0];
          await refundItems(a,[registrationId]);
          await markOrderRefundedIfComplete(a.id,id);
          return created;
        }
        const created=(await query(`INSERT INTO checkout_payment_refunds(attempt_id,registration_id,request_key,requested_by,amount_cents,status)
          VALUES ($1,$2,$3,$4,$5,'sending') RETURNING *`,[a.id,registrationId,key,actorId,allocation.gross_cents])).rows[0];
        send=true;return created;
      });
      if(send) {
        try {await gateway.refund(a.provider_id,Number(r.amount_cents)/100,`ORDER-REFUND-${r.id}`);
          await query("UPDATE checkout_payment_refunds SET status='pending' WHERE id=$1",[r.id]);
        } catch(error) {await query('UPDATE checkout_payment_refunds SET status=$2 WHERE id=$1',[r.id,definitive(error)?'failed':'unknown']);}
        await reconcileUnlocked(await latest(id));
      }
      const updated=(await query('SELECT id,status,amount_cents,registration_id FROM checkout_payment_refunds WHERE id=$1',[r.id])).rows[0];
      return {...updated,amount_cents:Number(updated.amount_cents)};
    });
  }
  let sweeping=false;
  async function sweep() {
    if(sweeping) return;
    sweeping=true;
    try {
      if(!(await query("SELECT to_regclass('public.checkout_payment_attempts') AS t")).rows[0].t) return;
      const rows=(await query(`SELECT order_id FROM (
          SELECT DISTINCT ON (order_id) * FROM checkout_payment_attempts ORDER BY order_id,created_at DESC,id DESC
        ) latest WHERE method<>'FREE' AND status NOT IN ('failed','refunded')
          AND (checked_at IS NULL OR checked_at<now()-interval '5 minutes')
        ORDER BY checked_at NULLS FIRST,created_at LIMIT 100`)).rows;
      for(const row of rows) {
        try {await reconcile(row.order_id);} catch { /* Outro worker pode estar processando este pedido. */ }
      }
    } finally {sweeping=false;}
  }
  return {start,tokenize,reconcile,cancel,switchMethod,webhook,refund,sweep};
}
export const checkoutPayments=createCheckoutPaymentsService(checkoutPaymentGateway);
