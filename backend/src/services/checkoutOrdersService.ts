import { randomBytes } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { query, withTransaction } from '../config/database.js';
import { checkoutParticipants } from './checkoutParticipantsService.js';
import { calculateRegistrationTotal } from './registrationTotalService.js';
import { resolveRegistrationSelections, reserveSelectionStock, saveCanonicalSelections, type SelectionInput } from './registrationSelectionsWriteService.js';
import { registrationConsumesVariantStockSql,registrationConsumesCapacitySql } from './variantStockPolicyService.js';
import { formatCpf, isValidCpfDigits } from '../utils/cpf.js';
import { validateFullName, validateBirthDateRange, validateGender } from '../utils/profileValidation.js';

export interface OrderChoices {
  category_id?: string;
  modality_id?: string | null;
  category_batch_id?: string | null;
  kit_id?: string | null;
  coupon_code?: string;
  product_selections?: SelectionInput[];
  custom_field_values?: Record<string,string>;
}
export interface OrderItemInput { participant_id:string; choices:OrderChoices }
const fail=(message:string,statusCode=409)=>Object.assign(new Error(message),{statusCode});
const isoDate=(value:Date|string|null)=>value instanceof Date ? value.toISOString().slice(0,10) : value?.slice(0,10) ?? null;
const active=registrationConsumesVariantStockSql('r');
async function lockedOrder(id:string,buyerId?:string) {
  const row=(await query('SELECT * FROM checkout_orders WHERE id=$1 AND ($2::uuid IS NULL OR buyer_id=$2) FOR UPDATE',[id,buyerId ?? null])).rows[0];
  if(!row) throw fail('Pedido não encontrado.',404);
  return row;
}
function editable(order:any,version:number) {
  if(!['draft','reviewed'].includes(order.status)) throw fail('Este pedido não pode mais ser editado.');
  if(order.version!==version) throw fail('O pedido foi alterado. Recarregue a revisão.');
}
async function openEvent(eventId:string) {
  const event=(await query('SELECT * FROM events WHERE id=$1 FOR UPDATE',[eventId])).rows[0];
  const now=Date.now();
  if(!event || !['published','ongoing'].includes(event.status) || !Number.isFinite(new Date(event.event_date).getTime())
    || new Date(event.event_date).getTime()<now) throw fail('Evento indisponível para inscrição.');
  if(event.registration_auto_mode && event.registration_start_date && event.registration_end_date) {
    if(now<new Date(event.registration_start_date).getTime() || now>new Date(event.registration_end_date).getTime()) throw fail('As inscrições não estão abertas.');
  } else if(event.registration_status && event.registration_status!=='open') throw fail('As inscrições não estão abertas.');
  return event;
}
async function itemsOf(id:string) {
  return (await query('SELECT * FROM checkout_order_items WHERE order_id=$1 ORDER BY position',[id])).rows;
}
async function checkoutBuyer(order:any) {
  const p=(await query('SELECT p.*,u.email FROM profiles p JOIN users u ON u.id=p.id WHERE p.id=$1 FOR SHARE OF p',[order.buyer_id])).rows[0];
  const cpf=String(p?.cpf ?? '').replace(/\D/g,'');
  const gender=String(p?.gender ?? '').trim().toUpperCase();
  const compatibleGender=gender==='MASCULINO'?'M':gender==='FEMININO'?'F':gender==='OUTRO'?'O':gender;
  const issues:Array<{field:'cpf'|'full_name'|'birth_date'|'gender';message:string}>=[];
  if(!isValidCpfDigits(cpf)) issues.push({field:'cpf',message:'CPF ausente ou inválido.'});
  if(!validateFullName(p?.full_name).valid) issues.push({field:'full_name',message:'Informe nome e sobrenome válidos.'});
  if(!validateBirthDateRange(isoDate(p?.birth_date)).valid) issues.push({field:'birth_date',message:'Data de nascimento ausente ou inválida.'});
  if(!validateGender(compatibleGender).valid) issues.push({field:'gender',message:'Sexo ausente ou inválido.'});
  const common={full_name:p?.full_name ?? '',email:p?.email ?? '',cpf_masked:cpf?formatCpf(cpf):null,issues};
  if(!p || issues.length) return {...common,status:'incomplete' as const,participant_id:null};
  const owners=(await query("SELECT id FROM profiles WHERE regexp_replace(COALESCE(cpf,''),'[^0-9]','','g')=$1",[cpf])).rows;
  if(owners.length!==1 || owners[0].id!==order.buyer_id) return {...common,status:'ambiguous' as const,participant_id:null};
  const participant=(await query(`SELECT p.id FROM checkout_participants p JOIN checkout_order_items i ON i.participant_id=p.id
    WHERE i.order_id=$1 AND p.cpf=$2`,[order.id,cpf])).rows[0];
  const existing=(await query(`SELECT r.id FROM registrations r WHERE r.event_id=$1 AND r.runner_id=$2
    AND r.order_id IS DISTINCT FROM $3 AND r.status<>'cancelled'
    AND NOT (r.status='transferred' AND r.transferred_to_registration_id IS NOT NULL)
    AND (COALESCE(r.payment_method::text,'')<>'free_bonus' OR EXISTS
      (SELECT 1 FROM leader_invitations li WHERE li.bonus_registration_id=r.id AND li.runner_id=r.runner_id AND li.status IN ('sent','used')))
    LIMIT 1`,[order.event_id,order.buyer_id,order.id])).rows[0];
  return {...common,status:existing?'already_registered' as const:'ready' as const,participant_id:participant?.id ?? null};
}
async function insertBuyer(order:any) {
  const buyer=await checkoutBuyer(order);
  if(buyer.status!=='ready') return;
  const p=(await query('SELECT cpf FROM profiles WHERE id=$1',[order.buyer_id])).rows[0];
  const person=await checkoutParticipants.prepare(order.buyer_id,{event_id:order.event_id,cpf:p.cpf});
  if(buyer.participant_id) return; // Renovar identificação sem perder escolhas já gravadas.
  const position=Number((await query('SELECT COALESCE(MAX(position),-1)+1 AS position FROM checkout_order_items WHERE order_id=$1',[order.id])).rows[0].position);
  await query("INSERT INTO checkout_order_items(order_id,participant_id,position,choices) VALUES ($1,$2,$3,'{}')",[order.id,person.id,position]);
}
async function publicOrder(order:any) {
  const items=await itemsOf(order.id);
  const identities=new Map((await query("SELECT id,to_jsonb(r)->'checkout_current_identity' AS identity FROM registrations r WHERE order_id=$1",[order.id])).rows.map(r=>[r.id,r.identity]));
  // Adaptar apenas a resposta; a fotografia original da compra permanece imutável.
  for(const item of items) if(identities.get(item.registration_id)) item.snapshot={...item.snapshot,identity:identities.get(item.registration_id)};
  return { id:order.id,event_id:order.event_id,status:order.status,version:order.version,buyer:await checkoutBuyer(order),
    total_cents:Number(order.total_cents),review_expires_at:order.review_expires_at,reservation_expires_at:order.reservation_expires_at,
    items:items.map(item=>({ id:item.id,participant_id:item.participant_id,position:item.position,choices:item.choices,
      registration_id:item.registration_id,pricing:item.snapshot?.pricing ?? null,
      participant:item.snapshot ? {cpf_masked:formatCpf(item.snapshot.identity.cpf),
        registered:!!item.snapshot.identity.runnerId,delivery_mode:item.snapshot.identity.deliveryMode,
        ...(!item.snapshot.identity.runnerId ? {full_name:item.snapshot.identity.fullName,email:item.snapshot.identity.email} : {})} : null,
      labels:item.snapshot?.labels ?? null })) };
}
export async function createCheckoutOrder(buyerId:string,eventId:string,requestKey:string,includeBuyer=false) {
  return withTransaction(async()=> {
    const existing=(await query('SELECT * FROM checkout_orders WHERE buyer_id=$1 AND request_key=$2 FOR UPDATE',[buyerId,requestKey])).rows[0];
    if(existing) {
      if(existing.event_id!==eventId) throw fail('A chave já foi usada em outro evento.');
      return publicOrder(existing);
    }
    await openEvent(eventId);
    const inserted=(await query(`INSERT INTO checkout_orders(buyer_id,event_id,request_key) VALUES ($1,$2,$3)
      ON CONFLICT(buyer_id,request_key) DO NOTHING RETURNING *`,[buyerId,eventId,requestKey])).rows[0];
    const row=inserted ?? (await query('SELECT * FROM checkout_orders WHERE buyer_id=$1 AND request_key=$2 FOR UPDATE',[buyerId,requestKey])).rows[0];
    if(row.event_id!==eventId) throw fail('A chave já foi usada em outro evento.');
    // Apenas a criação vencedora inclui o comprador; retomadas vazias não o reinserem.
    if(inserted && includeBuyer) await insertBuyer(row);
    return publicOrder(row);
  });
}
export async function addCheckoutBuyer(id:string,buyerId:string,version:number) {
  return withTransaction(async()=> {
    const order=await lockedOrder(id,buyerId);editable(order,version);
    const buyer=await checkoutBuyer(order);
    if(buyer.status!=='ready') throw fail(buyer.status==='already_registered'?'Você já possui inscrição neste evento.':'Complete ou confira os dados do seu perfil antes de adicionar sua inscrição.',400);
    if(!buyer.participant_id && (await itemsOf(id)).length>=20) throw fail('O limite é de 20 participantes por pedido.',400);
    await insertBuyer(order);
    const updated=(await query("UPDATE checkout_orders SET status='draft',version=version+1,total_cents=0,review_expires_at=NULL,updated_at=now() WHERE id=$1 RETURNING *",[id])).rows[0];
    return publicOrder(updated);
  });
}
export async function saveCheckoutOrder(id:string,buyerId:string,version:number,items:OrderItemInput[]) {
  if(items.length>20 || new Set(items.map(i=>i.participant_id)).size!==items.length) throw fail('Use até 20 participantes diferentes por pedido.',400);
  return withTransaction(async()=> {
    const order=await lockedOrder(id,buyerId); editable(order,version);
    for(const item of [...items].sort((a,b)=>a.participant_id.localeCompare(b.participant_id))) {
      const valid=await query('SELECT id FROM checkout_participants WHERE id=$1 AND buyer_id=$2 AND event_id=$3 AND expires_at>now() FOR SHARE',
        [item.participant_id,buyerId,order.event_id]);
      if(!valid.rows.length) throw fail('Participante inválido ou identificação expirada.',400);
    }
    await query('DELETE FROM checkout_order_items WHERE order_id=$1',[id]);
    for(const [position,item] of items.entries()) await query(`INSERT INTO checkout_order_items(order_id,participant_id,position,choices)
      VALUES ($1,$2,$3,$4)`,[id,item.participant_id,position,JSON.stringify(item.choices)]);
    const updated=(await query(`UPDATE checkout_orders SET status='draft',version=version+1,total_cents=0,
      review_expires_at=NULL,updated_at=now() WHERE id=$1 RETURNING *`,[id])).rows[0];
    return publicOrder(updated);
  });
}
async function quote(order:any) {
  const event=await openEvent(order.event_id);
  const items=await itemsOf(order.id);
  if(!items.length) throw fail('Adicione pelo menos um participante.',400);
  const participants=await checkoutParticipants.resolveManyForCheckout(items.map(i=>i.participant_id),order.buyer_id,order.event_id);
  // Cupons podem ser compartilhados entre eventos; bloquear sempre na mesma ordem.
  const codes=[...new Set(items.map(i=>(i.choices.coupon_code as string|undefined)?.trim().toUpperCase()).filter(Boolean))].sort();
  for(const code of codes) await query('SELECT id FROM coupons WHERE organizer_id=$1 AND code=$2 FOR UPDATE',[event.organizer_id,code]);
  const prepared=[];
  for(const [index,item] of items.entries()) {
    try {
      const choices:OrderChoices=item.choices;
      const participant=participants[index];
      if(!choices.category_id) throw fail('Selecione uma categoria.',400);
      const category=(await query('SELECT * FROM categories WHERE id=$1 AND event_id=$2 FOR SHARE',[choices.category_id,event.id])).rows[0];
      if(!category) throw fail('Categoria inválida.',400);
      const profile=participant.runnerId ? (await query('SELECT full_name,birth_date,gender,cpf FROM profiles WHERE id=$1 FOR SHARE',[participant.runnerId])).rows[0] : null;
      if(participant.runnerId && (!profile || String(profile.cpf ?? '').replace(/\D/g,'')!==participant.cpf)) throw fail('Identificação alterada. Identifique novamente o participante.');
      // Perfil e regras da categoria permanecem estáveis entre elegibilidade e gravação.
      if(!(await checkoutParticipants.eligibility(item.participant_id,order.buyer_id,choices.category_id)).eligible) throw fail('Participante não elegível para a categoria.',400);
      let modality:any=null;
      if(choices.modality_id) {
        modality=(await query(`SELECT m.* FROM modalities m JOIN category_modalities cm ON cm.modality_id=m.id
          WHERE m.id=$1 AND m.event_id=$2 AND cm.category_id=$3 FOR SHARE OF m,cm`,[choices.modality_id,event.id,category.id])).rows[0];
        if(!modality) throw fail('Modalidade inválida para a categoria.',400);
      } else if((await query('SELECT 1 FROM category_modalities WHERE category_id=$1 LIMIT 1',[category.id])).rows.length) throw fail('Selecione uma modalidade.',400);
      let kit:any=null;
      if(choices.kit_id) {
        kit=(await query(`SELECT k.* FROM event_kits k JOIN kit_categories kc ON kc.kit_id=k.id
          WHERE k.id=$1 AND k.event_id=$2 AND kc.category_id=$3 AND k.deleted_at IS NULL AND k.is_visible=true FOR SHARE OF k,kc`,
        [choices.kit_id,event.id,category.id])).rows[0];
        if(!kit) throw fail('Kit indisponível para a categoria.',400);
      } else if((await query(`SELECT 1 FROM event_kits k JOIN kit_categories kc ON kc.kit_id=k.id
        WHERE k.event_id=$1 AND kc.category_id=$2 AND k.deleted_at IS NULL AND k.is_visible=true LIMIT 1`,[event.id,category.id])).rows.length) throw fail('Selecione um kit.',400);
      const selections=await resolveRegistrationSelections(choices.kit_id,event.id,choices.product_selections);
      const fields=(await query('SELECT id,field_type,label FROM category_custom_fields WHERE category_id=$1 FOR SHARE',[category.id])).rows;
      for(const [field,value] of Object.entries(choices.custom_field_values ?? {})) {
        const definition=fields.find(f=>f.id===field);
        if(!definition || (definition.field_type==='number' && value.trim() && !Number.isFinite(Number(value)))) throw fail('Campo personalizado inválido.',400);
      }
      const identity={...participant,fullName:profile?.full_name ?? participant.fullName,
        birthDate:isoDate(profile?.birth_date ?? participant.birthDate),gender:profile?.gender ?? participant.gender};
      // Não permitir que mudança do CPF da conta após identificação troque o titular silenciosamente.
      if(!identity.fullName || !identity.birthDate) throw fail('Participante com dados de identificação pendentes.',400);
      const pricing=await calculateRegistrationTotal({eventId:event.id,categoryId:category.id,kitId:choices.kit_id ?? null,
        modalityId:choices.modality_id ?? null,batchId:choices.category_batch_id,runnerId:participant.runnerId,
        participantBirthDate:identity.birthDate,couponCode:choices.coupon_code,publicCheckout:true});
      const coupon=choices.coupon_code ? (await query('SELECT * FROM coupons WHERE organizer_id=$1 AND code=$2',
        [event.organizer_id,choices.coupon_code.trim().toUpperCase()])).rows[0] : null;
      const batch=choices.category_batch_id ? (await query('SELECT * FROM category_batches WHERE id=$1',[choices.category_batch_id])).rows[0] : null;
      const productLabels=[];
      if(choices.kit_id) productLabels.push(...(await query(`SELECT id AS product_id,name AS product_name,
        ''::text AS variant_id,''::text AS variant_name FROM kit_products WHERE kit_id=$1 AND type='unique'
        AND id<>ALL($2::uuid[]) ORDER BY id`,[choices.kit_id,selections.map(s=>s.product_id)])).rows);
      for(const selection of selections) {
        const label=(await query(`SELECT p.id AS product_id,p.name AS product_name,v.id AS variant_id,v.name AS variant_name
          FROM kit_products p JOIN product_variants v ON v.product_id=p.id WHERE p.id=$1 AND v.id=$2`,[selection.product_id,selection.variant_id])).rows[0];
        productLabels.push(label);
      }
      const snapshot={identity,pricing,selections,labels:{category:category.name,modality:modality?.name ?? null,kit:kit?.name ?? null,
        batch:batch?.name ?? null,products:productLabels,custom_fields:Object.fromEntries(fields.map(f=>[f.id,f.label]))},
        choices:{...choices,coupon_code:choices.coupon_code?.trim().toUpperCase() ?? null}};
      prepared.push({item,snapshot,category,modality,coupon});
    } catch(error) {
      const message=error instanceof Error ? error.message : 'Revise os dados.';
      throw fail(`Participante ${index+1}: ${message}`, (error as {statusCode?:number}).statusCode ?? 400);
    }
  }
  // Demanda agregada: uma linha por inscrição, mesmo que a variante tenha vários atributos.
  const variants=new Map<string,number>(), categories=new Map<string,{count:number;limit:number}>(), modalities=new Map<string,{count:number;limit:number}>(), coupons=new Map<string,{count:number;row:any}>();
  for(const p of prepared) {
    for(const s of p.snapshot.selections) variants.set(s.variant_id,(variants.get(s.variant_id) ?? 0)+1);
    for(const [map,entity] of [[categories,p.category],[modalities,p.modality]] as const) if(entity) map.set(entity.id,{count:(map.get(entity.id)?.count ?? 0)+1,limit:Number(entity.max_participants)});
    if(p.coupon) coupons.set(p.coupon.id,{count:(coupons.get(p.coupon.id)?.count ?? 0)+1,row:p.coupon});
  }
  for(const [variantId,demand] of variants) {
    const v=(await query('SELECT available_quantity FROM product_variants WHERE id=$1 FOR UPDATE',[variantId])).rows[0];
    const used=(await query(`SELECT COUNT(DISTINCT r.id)::int AS count FROM registration_product_selections s JOIN registrations r ON r.id=s.registration_id
      WHERE s.variant_id=$1 AND ${active}`,[variantId])).rows[0].count;
    if(v.available_quantity!==null && Number(v.available_quantity)-used<demand) throw fail('Estoque insuficiente para todas as escolhas do grupo.');
  }
  for(const [map,column,label] of [[categories,'category_id','categoria'],[modalities,'modality_id','modalidade']] as const) {
    for(const [entityId,demand] of map) if(demand.limit>0) {
      const used=(await query(`SELECT COUNT(*)::int AS count FROM registrations r WHERE r.${column}=$1 AND ${registrationConsumesCapacitySql('r')}
        AND COALESCE(r.payment_method::text,'')<>'free_bonus'`,[entityId])).rows[0].count;
      if(used+demand.count>demand.limit) throw fail(`Vagas insuficientes na ${label} para o grupo.`);
    }
  }
  for(const {count,row} of coupons.values()) if(row.max_uses!==null && row.current_uses+count>row.max_uses) throw fail('O cupom não possui usos disponíveis para todos os participantes selecionados.');
  return prepared;
}
export async function reviewCheckoutOrder(id:string,buyerId:string,version:number) {
  return withTransaction(async()=> {
    const order=await lockedOrder(id,buyerId); editable(order,version);
    const prepared=await quote(order);
    let cents=0;
    for(const p of prepared) {
      cents+=Math.round(p.snapshot.pricing.total*100);
      await query('UPDATE checkout_order_items SET snapshot=$2,coupon_id=$3 WHERE id=$1',[p.item.id,JSON.stringify(p.snapshot),p.coupon?.id ?? null]);
    }
    const updated=(await query(`UPDATE checkout_orders SET status='reviewed',version=version+1,total_cents=$2,
      review_expires_at=now()+interval '15 minutes',updated_at=now() WHERE id=$1 RETURNING *`,[id,cents])).rows[0];
    return publicOrder(updated);
  });
}
export async function reserveCheckoutOrder(id:string,buyerId:string,version:number) {
  return withTransaction(async()=> {
    const order=await lockedOrder(id,buyerId);
    if(order.status==='reserved' && order.reserved_from_version===version) {
      if(new Date(order.reservation_expires_at).getTime()<=Date.now()) throw fail('A reserva expirou.');
      return publicOrder(order);
    }
    if(order.status!=='reviewed' || order.version!==version || new Date(order.review_expires_at).getTime()<=Date.now()) throw fail('Revise o pedido antes de reservar.');
    const prepared=await quote(order);
    if(prepared.some(p=>!isDeepStrictEqual(p.snapshot,p.item.snapshot))) throw fail('Valores ou dados foram atualizados. Revise o pedido novamente.');
    await query("SELECT set_config('cronoteam.order_write',$1,true)",[id]);
    for(const p of prepared) {
      const s=p.snapshot, c=s.choices;
      await reserveSelectionStock(s.selections,order.event_id);
      const reg=(await query(`INSERT INTO registrations(event_id,runner_id,registered_by,category_id,modality_id,kit_id,category_batch_id,
        status,payment_status,payment_method,total_amount,platform_fee_amount,registration_edit_fee_amount,confirmation_code,coupon_code,order_id,participant_cpf)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'pending','pending',NULL,$8,$9,0,$10,$11,$12,$13) RETURNING id`,
      [order.event_id,s.identity.runnerId,order.buyer_id,c.category_id,c.modality_id ?? null,c.kit_id ?? null,c.category_batch_id ?? null,
        s.pricing.total,s.pricing.platformFee,`REG-${randomBytes(16).toString('hex').toUpperCase()}`,c.coupon_code,id,s.identity.cpf])).rows[0];
      await saveCanonicalSelections(reg.id,s.selections);
      for(const [field,value] of Object.entries(c.custom_field_values ?? {})) await query(`INSERT INTO registration_custom_field_values
        (registration_id,category_custom_field_id,value) VALUES ($1,$2,$3)`,[reg.id,field,value.trim() || null]);
      if(p.coupon) await query('UPDATE coupons SET current_uses=current_uses+1,updated_at=now() WHERE id=$1',[p.coupon.id]);
      await query('UPDATE checkout_order_items SET registration_id=$2 WHERE id=$1',[p.item.id,reg.id]);
    }
    const updated=(await query(`UPDATE checkout_orders SET status='reserved',version=version+1,reserved_from_version=$2,
      reservation_expires_at=now()+interval '20 minutes',updated_at=now() WHERE id=$1 RETURNING *`,[id,version])).rows[0];
    return publicOrder(updated);
  });
}
async function releaseReservedInventory(order:any,action:'cancel'|'unreserve') {
  await query("SELECT set_config('cronoteam.order_write',$1,true)",[order.id]);
  // Ignora reservas já canceladas de idas e voltas; só a leva atual (pending) bloqueia conciliação.
  const rows=(await query(`SELECT * FROM registrations WHERE order_id=$1 AND status='pending' ORDER BY id FOR UPDATE`,[order.id])).rows;
  if(rows.some(r=>r.payment_status!=='pending')) {
    throw fail(action==='unreserve'
      ? 'Pedido exige conciliação antes de voltar à revisão.'
      : 'Pedido exige conciliação antes de cancelar.');
  }
  if(!rows.length) {
    await query('UPDATE checkout_order_items SET registration_id=NULL WHERE order_id=$1',[order.id]);
    return;
  }
  const coupons=(await query(`SELECT coupon_id,COUNT(*)::int AS uses FROM checkout_order_items
    WHERE order_id=$1 AND coupon_id IS NOT NULL GROUP BY coupon_id ORDER BY coupon_id`,[order.id])).rows;
  for(const c of coupons) await query('UPDATE coupons SET current_uses=GREATEST(0,current_uses-$2),updated_at=now() WHERE id=$1',[c.coupon_id,c.uses]);
  await query("UPDATE registrations SET status='cancelled',updated_at=now() WHERE order_id=$1 AND status='pending'",[order.id]);
  await query('UPDATE checkout_order_items SET registration_id=NULL WHERE order_id=$1',[order.id]);
}
async function release(order:any,status:'cancelled'|'expired') {
  if(!['draft','reviewed','reserved'].includes(order.status)) return;
  if(order.status==='reserved') await releaseReservedInventory(order,'cancel');
  await query('UPDATE checkout_orders SET status=$2,version=version+1,updated_at=now() WHERE id=$1',[order.id,status]);
}
/** Libera estoque/cupom da reserva e devolve o pedido à revisão (sem cancelar o pedido). */
export async function unreserveCheckoutOrder(id:string,buyerId:string) {
  return withTransaction(async()=> {
    const order=await lockedOrder(id,buyerId);
    if(order.status!=='reserved') throw fail('Só é possível voltar à revisão com reserva ativa sem pagamento.');
    await releaseReservedInventory(order,'unreserve');
    const updated=(await query(`UPDATE checkout_orders SET status='reviewed',version=version+1,
      reservation_expires_at=NULL,reserved_from_version=NULL,
      review_expires_at=now()+interval '15 minutes',updated_at=now() WHERE id=$1 RETURNING *`,[id])).rows[0];
    return publicOrder(updated);
  });
}
export async function cancelCheckoutOrder(id:string,buyerId:string) {
  return withTransaction(async()=> {
    const order=await lockedOrder(id,buyerId);
    if(!['draft','reviewed','reserved','cancelled','expired'].includes(order.status)) throw fail('Pedido exige conciliação antes de cancelar.');
    await release(order,'cancelled');
    return publicOrder(await lockedOrder(id,buyerId));
  });
}
export async function getCheckoutOrder(id:string,buyerId:string) {
  return withTransaction(async()=> {
    const order=await lockedOrder(id,buyerId);
    if(order.status==='reserved' && new Date(order.reservation_expires_at).getTime()<=Date.now()) await release(order,'expired');
    return publicOrder(await lockedOrder(id,buyerId));
  });
}
export async function expireCheckoutOrders() {
  // A limpeza continua com novas compras desativadas e tolera implantação anterior à migração.
  if(!(await query("SELECT to_regclass('public.checkout_orders') AS relation")).rows[0].relation) return;
  const ids=(await query("SELECT id FROM checkout_orders WHERE status='reserved' AND reservation_expires_at<=now() ORDER BY reservation_expires_at LIMIT 100")).rows;
  for(const {id} of ids) await withTransaction(async()=> {
    const order=await lockedOrder(id);
    if(order.status==='reserved' && new Date(order.reservation_expires_at).getTime()<=Date.now()) await release(order,'expired');
  });
}
