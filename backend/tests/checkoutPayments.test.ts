import { before, beforeEach, after, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { Server } from 'node:http';
import type { CheckoutPaymentGateway, GatewayPayment } from '../src/services/checkoutPaymentGateway.js';

const url=new URL(process.env.PAYMENTS_TEST_DATABASE_URL || 'http://missing');
if(!['postgres:','postgresql:'].includes(url.protocol) || url.hostname!=='127.0.0.1' || url.pathname!=='/cronoteam_stage5_test') {
  throw new Error('Informe PAYMENTS_TEST_DATABASE_URL para PostgreSQL descartável local cronoteam_stage5_test.');
}
Object.assign(process.env,{POSTGRES_HOST:url.hostname,POSTGRES_PORT:url.port,POSTGRES_DB:url.pathname.slice(1),
  POSTGRES_USER:decodeURIComponent(url.username),POSTGRES_PASSWORD:decodeURIComponent(url.password),NODE_ENV:'test',
  JWT_SECRET:'orders-isolated-test-secret',MULTI_REGISTRATION_CHECKOUT_ENABLED:'true',LOG_SQL_ALL:'false'});
const {default:pool,query}=await import('../src/config/database.js');
const orders=await import('../src/services/checkoutOrdersService.js');
const {createCheckoutPaymentsService}=await import('../src/services/checkoutPaymentsService.js');
const {createParticipantsService}=await import('../src/services/checkoutParticipantsService.js');
const {getVariantRemainingStock}=await import('../src/services/registrationsService.js');
const {default:router}=await import('../src/routes/checkoutOrders.js');
const {orderRegistrationGuard}=await import('../src/middleware/orderRegistrationGuard.js');
const {errorHandler}=await import('../src/middleware/errorHandler.js');
const manual=createParticipantsService(async()=>({ok:false,internalCode:'EXTERNAL_NOT_FOUND'}));
const buyer=randomUUID(),otherBuyer=randomUUID(),event=randomUUID(),organizer=randomUUID(),category=randomUUID(),modality=randomUUID();
const kit=randomUUID(),product=randomUUID(),variant=randomUUID(),coupon=randomUUID();
const cpfs=['52998224725','16899535009','11144477735'];
let participants:string[],ownsFixture=false,server:Server,baseUrl:string;
before(async()=> {
  assert.equal((await query("SELECT to_regclass('public.users') AS existing")).rows[0].existing,null);
  ownsFixture=true;
  await query(await readFile(new URL('./fixtures/registrationIntegrity.sql',import.meta.url),'utf8'));
  await query(await readFile(new URL('../migrations/070_add_payment_methods_to_events.sql',import.meta.url),'utf8'));
  await query(`CREATE TABLE user_roles(user_id uuid REFERENCES users,role text);
    CREATE TABLE asaas_payments(registration_id uuid REFERENCES registrations,value numeric,status text);`);
  await query(`ALTER TABLE events ADD COLUMN status text DEFAULT 'published', ADD COLUMN event_date timestamptz DEFAULT now()+interval '30 days',
      ADD COLUMN registration_status text DEFAULT 'open', ADD COLUMN registration_auto_mode boolean DEFAULT false,
      ADD COLUMN registration_start_date timestamptz, ADD COLUMN registration_end_date timestamptz;
    ALTER TABLE modalities ADD COLUMN name text DEFAULT '5 km';
    ALTER TABLE event_kits ADD COLUMN name text DEFAULT 'Kit básico', ADD COLUMN deleted_at timestamptz, ADD COLUMN is_visible boolean DEFAULT true;
    ALTER TABLE registrations ADD COLUMN created_at timestamptz DEFAULT now(), ADD COLUMN asaas_payment_id text;
    CREATE TABLE kit_categories(kit_id uuid REFERENCES event_kits, category_id uuid REFERENCES categories);`);
  for(const file of ['118_registration_inventory_guards.sql','119_checkout_participants.sql','120_checkout_orders.sql','121_checkout_order_payments.sql','125_checkout_payment_pix_qr.sql','126_checkout_payment_keep_reservation.sql']) {
    await query(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  }
  const app=express();app.use(express.json());app.use('/orders',router);
  app.use('/legacy',orderRegistrationGuard,(_req,res)=>res.json({success:true}));app.use(errorHandler);
  server=await new Promise<Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  baseUrl=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
});
beforeEach(async()=> {
  await query(`TRUNCATE checkout_order_items,checkout_orders,checkout_participants,registrations,
    registration_product_selections,registration_custom_field_values,kit_categories,kit_products,product_variants,
    event_kits,profiles,users,categories,category_modalities,category_batches,category_custom_fields,
    modalities,leader_invitations,coupons,coupon_events,events CASCADE`);
  await query("INSERT INTO users VALUES ($1,'comprador@example.test'),($2,'outro@example.test')",[buyer,otherBuyer]);
  await query("INSERT INTO profiles(id,full_name) VALUES ($1,'Comprador Teste'),($2,'Outro Comprador')",[buyer,otherBuyer]);
  await query('INSERT INTO events(id,organizer_id) VALUES ($1,$2)',[event,organizer]);
  await query("INSERT INTO categories(id,event_id,name,max_participants) VALUES ($1,$2,'Geral',10)",[category,event]);
  await query('INSERT INTO modalities(id,event_id,max_participants) VALUES ($1,$2,10)',[modality,event]);
  await query('INSERT INTO category_modalities VALUES ($1,$2)',[category,modality]);
  await query('INSERT INTO event_kits(id,event_id) VALUES ($1,$2)',[kit,event]);
  await query('INSERT INTO kit_categories VALUES ($1,$2)',[kit,category]);
  await query(`INSERT INTO kit_products(id,kit_id,name,variant_attributes) VALUES ($1,$2,'Camiseta','["Cor","Tamanho"]')`,[product,kit]);
  await query("INSERT INTO product_variants VALUES ($1,$2,'Azul - M',10)",[variant,product]);
  await query("INSERT INTO coupons(id,organizer_id,code,max_uses) VALUES ($1,$2,'GRUPO',10)",[coupon,organizer]);
  participants=[];
  for(const [i,cpf] of cpfs.entries()) {
    const p=await manual.prepare(buyer,{event_id:event,cpf,birth_date:'1990-01-01'});
    await manual.complete(p.id,buyer,{full_name:`Atleta ${['Primeiro','Segundo','Terceiro'][i]}`,gender:'M',delivery_mode:'buyer'});
    participants.push(p.id);
  }
});
after(async()=> {
  if(server) await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  if(ownsFixture) await query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await pool.end();
});
const choices=(extra={})=>({category_id:category,modality_id:modality,kit_id:kit,
  product_selections:[{product_id:product,variant_id:variant}],...extra});
async function draft(indices=[0,1],extra={}) {
  const order=await orders.createCheckoutOrder(buyer,event,randomUUID());
  return orders.saveCheckoutOrder(order.id,buyer,order.version,indices.map(i=>({participant_id:participants[i],choices:choices(extra)})));
}
async function reviewed(indices=[0,1],extra={}) {
  const order=await draft(indices,extra);return orders.reviewCheckoutOrder(order.id,buyer,order.version);
}
const count=async(table:string)=>Number((await query(`SELECT COUNT(*) AS count FROM ${table}`)).rows[0].count);

let remote:GatewayPayment[],creates:number,refundCalls:number,unavailable:boolean,timeoutCreate:boolean,rejectCreate:boolean,timeoutRefund:boolean;
const gateway:CheckoutPaymentGateway={
  async customer(id) {assert.equal(id,buyer);return 'cus_buyer';},
  async tokenize(input) {
    assert.ok(input.creditCard.number);assert.ok(input.remoteIp);
    return {creditCardToken:`tok_${input.creditCard.number.slice(-4)}`,creditCardBrand:'VISA',creditCardNumber:input.creditCard.number.slice(-4)};
  },
  async create(input) {
    creates++;
    if(rejectCreate) throw {response:{status:400}};
    if(input.billingType==='CREDIT_CARD') {
      assert.ok(input.creditCardToken || (input.creditCard && input.creditCardHolderInfo));
      if(input.creditCardToken) assert.equal(input.creditCard,undefined);
    }
    const p={...input,id:`pay_${creates}`,status:'PENDING',invoiceUrl:'https://sandbox.asaas.com/i/test',refunds:[],
      pixQrCode:input.billingType==='PIX'?'00020126580014br.gov.bcb.pix0136checkout-test-payload':null};
    remote.push(p);
    if(timeoutCreate) throw new Error('timeout');
    return p;
  },
  async find(ref) {if(unavailable) throw new Error('offline');return remote.filter(p=>p.externalReference===ref);},
  async get(id) {if(unavailable) throw new Error('offline');const p=remote.find(p=>p.id===id);assert.ok(p);return structuredClone(p);},
  async pixQr(id) {
    if(unavailable) throw new Error('offline');
    const p=remote.find(x=>x.id===id);return p?.billingType==='PIX'?(p.pixQrCode || '00020126580014br.gov.bcb.pix0136checkout-test-payload'):null;
  },
  async remove(id) {if(unavailable) throw new Error('offline');remote.find(p=>p.id===id)!.deleted=true;},
  async refund(id,value,description) {
    refundCalls++;remote.find(p=>p.id===id)!.refunds!.push({value,description,status:'DONE'});
    if(timeoutRefund) throw new Error('timeout');
  },
};
const payments=createCheckoutPaymentsService(gateway);
beforeEach(()=> {remote=[];creates=0;refundCalls=0;unavailable=false;timeoutCreate=false;rejectCreate=false;timeoutRefund=false;});
async function reserved(extra={}) {const r=await reviewed([0,1],extra);return orders.reserveCheckoutOrder(r.id,buyer,r.version);}
const state=async(id:string)=>(await orders.getCheckoutOrder(id,buyer)).status;
async function settled() {
  const o=await reserved({coupon_code:'GRUPO'});await payments.start(o.id,buyer,randomUUID(),'PIX');
  remote[0].status='RECEIVED';await payments.reconcile(o.id,buyer);return o;
}
it('uma cobrança por grupo, total do servidor, mesma chave retoma sem cobrar novamente',async()=> {
  const o=await reserved(),key=randomUUID();
  const a=await payments.start(o.id,buyer,key,'PIX');
  assert.equal(a?.amount_cents,24000);assert.equal(remote[0].value,240);assert.equal(remote[0].customer,'cus_buyer');
  assert.equal(a?.pix_qr_code,'00020126580014br.gov.bcb.pix0136checkout-test-payload');
  assert.equal((await payments.start(o.id,buyer,key,'PIX'))?.id,a?.id);assert.equal(creates,1);
  await assert.rejects(payments.start(o.id,buyer,randomUUID(),'PIX'),/já possui/);
  assert.equal(await count('checkout_payment_allocations'),2);assert.equal(await state(o.id),'awaiting_payment');
});
it('conciliação completa o payload PIX quando a criação ainda não tinha QR',async()=> {
  const o=await reserved(),key=randomUUID();
  const a=await payments.start(o.id,buyer,key,'PIX');
  await query('UPDATE checkout_payment_attempts SET pix_qr_code=NULL WHERE id=$1',[a!.id]);
  remote[0].pixQrCode='00020126580014br.gov.bcb.pix0136checkout-backfill';
  const refreshed=await payments.reconcile(o.id,buyer);
  assert.equal(refreshed?.pix_qr_code,'00020126580014br.gov.bcb.pix0136checkout-backfill');
});
it('timeout após criação recupera por referência sem repetir POST',async()=> {
  const o=await reserved();timeoutCreate=true;
  assert.equal((await payments.start(o.id,buyer,randomUUID(),'PIX'))?.status,'unknown');
  assert.equal((await payments.reconcile(o.id,buyer))?.status,'pending');assert.equal(creates,1);
});
it('timeout sem cobrança visível mantém reserva mesmo expirada e nunca reenvia',async()=> {
  const o=await reserved(),key=randomUUID();timeoutCreate=true;
  await payments.start(o.id,buyer,key,'PIX');remote=[];
  await query("UPDATE checkout_payment_attempts SET expires_at=now()-interval '1 hour'");
  await payments.start(o.id,buyer,key,'PIX');await payments.cancel(o.id,buyer);
  assert.equal(creates,1);assert.equal(await state(o.id),'awaiting_payment');assert.equal(await getVariantRemainingStock(variant,event),8);
});
it('pagamento confirma todos uma vez e não baixa estoque novamente',async()=> {
  const o=await settled();assert.equal(await state(o.id),'confirmed');
  await payments.reconcile(o.id,buyer);await payments.reconcile(o.id,buyer);
  assert.equal((await query("SELECT count(*)::int AS n FROM registrations WHERE status='confirmed' AND payment_status='paid'")).rows[0].n,2);
  assert.equal(await count('checkout_payment_effects'),2);assert.equal(await getVariantRemainingStock(variant,event),8);
  assert.equal((await query('SELECT sum(gross_cents)::int AS n FROM checkout_payment_allocations WHERE settled_at IS NOT NULL')).rows[0].n,22000);
});
it('webhooks repetidos/fora de ordem usam estado atual, deduplicam e não rebaixam confirmação',async()=> {
  const o=await reserved();await payments.start(o.id,buyer,randomUUID(),'CREDIT_CARD',{credit_card_token:'tok_webhook'});remote[0].status='CONFIRMED';
  const payload={id:'evt_1',event:'PAYMENT_CREATED',payment:{...remote[0],status:'PENDING'}};
  assert.equal(await payments.webhook(payload),true);await payments.webhook(payload);
  assert.equal(await state(o.id),'confirmed');assert.equal(await count('checkout_payment_events'),1);
  remote[0].status='PENDING';await payments.reconcile(o.id,buyer);assert.equal(await state(o.id),'confirmed');
});
it('Pix CONFIRMED cautelar mantém reserva até RECEIVED',async()=> {
  const o=await reserved();await payments.start(o.id,buyer,randomUUID(),'PIX');remote[0].status='CONFIRMED';
  await payments.reconcile(o.id,buyer);assert.equal(await state(o.id),'awaiting_payment');
  await payments.cancel(o.id,buyer);assert.equal(remote[0].deleted,undefined);assert.equal(await state(o.id),'awaiting_payment');
});
it('expiração consulta e remove cobrança antes de devolver estoque/cupom uma vez',async()=> {
  const o=await reserved({coupon_code:'GRUPO'});await payments.start(o.id,buyer,randomUUID(),'PIX');
  await query("UPDATE checkout_payment_attempts SET expires_at=now()-interval '1 hour',checked_at=NULL");
  await payments.sweep();await payments.reconcile(o.id,buyer);
  assert.equal(remote[0].deleted,true);assert.equal(await state(o.id),'cancelled');
  assert.equal(await getVariantRemainingStock(variant,event),10);assert.equal((await query('SELECT current_uses FROM coupons')).rows[0].current_uses,0);
});
it('gateway indisponível impede liberar reserva e sweep funciona com flag desativada',async()=> {
  const o=await reserved();await payments.start(o.id,buyer,randomUUID(),'PIX');unavailable=true;
  await payments.cancel(o.id,buyer);assert.equal(await state(o.id),'awaiting_payment');
  unavailable=false;process.env.MULTI_REGISTRATION_CHECKOUT_ENABLED='false';
  try {await query('UPDATE checkout_payment_attempts SET checked_at=NULL');await payments.sweep();assert.equal(await state(o.id),'cancelled');}
  finally {process.env.MULTI_REGISTRATION_CHECKOUT_ENABLED='true';}
});
it('pagamento recebido no limite confirma em vez de cancelar',async()=> {
  const o=await reserved();await payments.start(o.id,buyer,randomUUID(),'PIX');remote[0].status='RECEIVED';
  await query("UPDATE checkout_payment_attempts SET expires_at=now()-interval '1 hour'");
  await payments.cancel(o.id,buyer);assert.equal(await state(o.id),'confirmed');assert.equal(remote[0].deleted,undefined);
});
it('pagamento tardio após liberação fica em revisão sem reativar ingresso',async()=> {
  const o=await reserved();await payments.start(o.id,buyer,randomUUID(),'PIX');await payments.cancel(o.id,buyer);
  remote[0].deleted=false;remote[0].status='RECEIVED';await payments.reconcile(o.id,buyer);
  assert.equal(await state(o.id),'needs_review');assert.equal(await getVariantRemainingStock(variant,event),10);
  assert.equal((await query("SELECT count(*)::int AS n FROM registrations WHERE status='confirmed'")).rows[0].n,0);
});
it('rejeição definitiva permite nova tentativa; timeout nunca permite nova cobrança',async()=> {
  const o=await reserved();rejectCreate=true;
  assert.equal((await payments.start(o.id,buyer,randomUUID(),'PIX'))?.status,'failed');assert.equal(await state(o.id),'reserved');
  rejectCreate=false;await payments.start(o.id,buyer,randomUUID(),'PIX');assert.equal(creates,2);
  assert.equal(await count('checkout_payment_allocations'),2);
});
it('voltar à revisão e reservar de novo permite Pix sem somar inscrições canceladas',async()=> {
  const first=await reserved();
  await payments.start(first.id,buyer,randomUUID(),'PIX');
  await payments.switchMethod(first.id,buyer);
  assert.equal(await state(first.id),'reserved');
  const reviewed=await orders.unreserveCheckoutOrder(first.id,buyer);
  assert.equal(reviewed.status,'reviewed');
  const again=await orders.reserveCheckoutOrder(reviewed.id,buyer,reviewed.version);
  const paid=await payments.start(again.id,buyer,randomUUID(),'PIX');
  assert.equal(paid?.status,'pending');
  assert.equal(paid?.amount_cents,again.total_cents);
  assert.equal((await query("SELECT count(*)::int AS n FROM checkout_payment_allocations a JOIN checkout_payment_attempts p ON p.id=a.attempt_id WHERE p.id=$1",[paid!.id])).rows[0].n,2);
});
it('gratuito confirma conjunto sem gateway',async()=> {
  await query('UPDATE categories SET price=0');await query('UPDATE event_kits SET price=0');
  const o=await reserved();const key=randomUUID();
  assert.equal((await payments.start(o.id,buyer,key,'PIX'))?.method,'FREE');await payments.start(o.id,buyer,key,'PIX');
  assert.equal(creates,0);assert.equal(await state(o.id),'confirmed');assert.equal(await count('checkout_payment_effects'),2);
});
it('estorno de ingresso FREE cancela localmente sem gateway e marca pedido reembolsado',async()=> {
  await query('UPDATE categories SET price=0');await query('UPDATE event_kits SET price=0');
  const o=await reserved();
  await payments.start(o.id,buyer,randomUUID(),'PIX');
  assert.equal(await state(o.id),'confirmed');
  const id=o.items[0].registration_id!;
  const r=await payments.refund(o.id,id,randomUUID(),buyer);
  assert.equal(r.status,'done');assert.equal(r.amount_cents,0);assert.equal(refundCalls,0);
  assert.equal((await query('SELECT status,payment_status FROM registrations WHERE id=$1',[id])).rows[0].status,'cancelled');
  assert.equal((await query('SELECT status,payment_status FROM registrations WHERE id=$1',[id])).rows[0].payment_status,'refunded');
  // Segundo participante ainda ativo → pedido permanece confirmed.
  assert.equal(await state(o.id),'confirmed');
  const other=o.items[1].registration_id!;
  await payments.refund(o.id,other,randomUUID(),buyer);
  assert.equal(await state(o.id),'refunded');assert.equal(refundCalls,0);
});
it('pedido misto mantém item gratuito pendente até confirmação do total',async()=> {
  await query('UPDATE coupons SET discount_value=120');
  const created=await orders.createCheckoutOrder(buyer,event,randomUUID());
  const saved=await orders.saveCheckoutOrder(created.id,buyer,created.version,[
    {participant_id:participants[0],choices:choices({coupon_code:'GRUPO'})},
    {participant_id:participants[1],choices:choices()},
  ]);
  const r=await orders.reviewCheckoutOrder(saved.id,buyer,saved.version);
  const o=await orders.reserveCheckoutOrder(r.id,buyer,r.version);
  await payments.start(o.id,buyer,randomUUID(),'PIX');assert.equal(remote[0].value,120);
  assert.equal((await query("SELECT count(*)::int AS n FROM registrations WHERE status='pending'")).rows[0].n,2);
  remote[0].status='RECEIVED';await payments.reconcile(o.id,buyer);
  assert.equal((await query("SELECT count(*)::int AS n FROM registrations WHERE status='confirmed'")).rows[0].n,2);
});
it('valor, cliente ou método divergente bloqueia confirmação',async()=> {
  const o=await reserved();await payments.start(o.id,buyer,randomUUID(),'PIX');remote[0].value=1;remote[0].status='RECEIVED';
  await payments.reconcile(o.id,buyer);assert.equal(await state(o.id),'needs_review');assert.equal(await count('checkout_payment_effects'),0);
});
it('duas chamadas concorrentes enviam um único POST',async()=> {
  const o=await reserved(),key=randomUUID();
  const results=await Promise.allSettled([payments.start(o.id,buyer,key,'PIX'),payments.start(o.id,buyer,key,'PIX')]);
  assert.ok(results.some(r=>r.status==='fulfilled'));assert.equal(creates,1);
});
it('outro comprador não consulta, cancela ou cobra pedido',async()=> {
  const o=await reserved();
  await assert.rejects(payments.start(o.id,otherBuyer,randomUUID(),'PIX'),/não encontrado/);
  await assert.rejects(payments.reconcile(o.id,otherBuyer),/não encontrado/);
  await assert.rejects(payments.cancel(o.id,otherBuyer),/não encontrado/);assert.equal(creates,0);
});
it('estorno individual confirmado preserva outros ingressos e não duplica pedido ao gateway',async()=> {
  const o=await settled(),id=o.items[0].registration_id!,key=randomUUID();
  const r=await payments.refund(o.id,id,key,buyer);assert.equal(r.status,'done');assert.equal(r.amount_cents,11000);
  await payments.refund(o.id,id,key,buyer);assert.equal(refundCalls,1);assert.equal(await state(o.id),'confirmed');
  assert.equal(await getVariantRemainingStock(variant,event),9);assert.equal((await query('SELECT current_uses FROM coupons')).rows[0].current_uses,1);
  assert.equal((await query("SELECT count(*)::int AS n FROM registrations WHERE payment_status='paid'")).rows[0].n,1);
});
it('timeout de estorno recupera resultado sem reenviar',async()=> {
  const o=await settled();timeoutRefund=true;const key=randomUUID(),id=o.items[0].registration_id!;
  assert.equal((await payments.refund(o.id,id,key,buyer)).status,'done');
  await payments.refund(o.id,id,key,buyer);assert.equal(refundCalls,1);
});
it('estorno externo parcial/chargeback exige revisão sem devolver estoque indevidamente',async()=> {
  const o=await settled();remote[0].refunds=[{status:'DONE',value:1,description:'outside'}];
  await payments.reconcile(o.id,buyer);assert.equal(await state(o.id),'needs_review');assert.equal(await getVariantRemainingStock(variant,event),8);
});
it('estorno integral devolve conjunto uma vez',async()=> {
  const o=await settled();remote[0].status='REFUNDED';await payments.reconcile(o.id,buyer);await payments.reconcile(o.id,buyer);
  assert.equal(await state(o.id),'refunded');assert.equal(await getVariantRemainingStock(variant,event),10);
  assert.equal((await query('SELECT current_uses FROM coupons')).rows[0].current_uses,0);assert.equal(await count('checkout_payment_effects'),4);
});
it('falha ao confirmar segundo item reverte confirmação e efeitos do primeiro',async()=> {
  const o=await reserved();await payments.start(o.id,buyer,randomUUID(),'PIX');
  await query(`CREATE FUNCTION fail_payment_confirmation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.status='confirmed' AND NEW.participant_cpf='16899535009' THEN RAISE EXCEPTION 'injected'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_payment_confirmation BEFORE UPDATE ON registrations FOR EACH ROW EXECUTE FUNCTION fail_payment_confirmation();`);
  try {
    remote[0].status='RECEIVED';await payments.reconcile(o.id,buyer);
    assert.equal(await state(o.id),'awaiting_payment');assert.equal(await count('checkout_payment_effects'),0);
    assert.equal((await query("SELECT count(*)::int AS n FROM registrations WHERE status='confirmed'")).rows[0].n,0);
  } finally {await query('DROP TRIGGER fail_payment_confirmation ON registrations; DROP FUNCTION fail_payment_confirmation()');}
  await payments.reconcile(o.id,buyer);assert.equal(await state(o.id),'confirmed');
});
it('contabilidade soma alocações sem multiplicar receita e preserva pagamentos antigos',async()=> {
  const {getTotalPaidForRegistration,getTotalPaidForRegistrationIds,getAmountPaidForOrganizer}=await import('../src/services/asaasService.js');
  const o=await settled();const ids=o.items.map(i=>i.registration_id!);
  const totals=await getTotalPaidForRegistrationIds(ids);
  assert.equal(Object.values(totals).reduce((a,b)=>a+b,0),220);
  assert.equal(await getTotalPaidForRegistration(ids[0]),110);assert.equal(await getAmountPaidForOrganizer(ids[0]),110);
  await payments.refund(o.id,ids[0],randomUUID(),buyer);assert.equal(await getTotalPaidForRegistration(ids[0]),0);
  await query("INSERT INTO registrations(event_id,runner_id,total_amount) VALUES($1,$2,75) RETURNING id",[event,randomUUID()]).then(async result=> {
    const id=result.rows[0].id;await query("INSERT INTO asaas_payments VALUES($1,75,'RECEIVED')",[id]);
    assert.equal(await getTotalPaidForRegistration(id),75);
  });
});
it('API rejeita valor forjado, exige autenticação e restringe estorno a admin',async()=> {
  const o=await reserved();const token=jwt.sign({userId:buyer,email:'comprador@example.test'},process.env.JWT_SECRET!);
  const headers={'Content-Type':'application/json',Authorization:`Bearer ${token}`};
  assert.equal((await fetch(`${baseUrl}/orders/${o.id}/payment`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
  assert.equal((await fetch(`${baseUrl}/orders/${o.id}/payment`,{method:'POST',headers,body:JSON.stringify({request_key:randomUUID(),method:'PIX',value:1})})).status,400);
  assert.equal((await fetch(`${baseUrl}/orders/${o.id}/refund`,{method:'POST',headers,body:JSON.stringify({request_key:randomUUID(),registration_id:o.items[0].registration_id})})).status,403);
  process.env.MULTI_REGISTRATION_CHECKOUT_ENABLED='false';
  try {
    assert.equal((await fetch(`${baseUrl}/orders/${o.id}/payment`,{headers})).status,200);
    assert.equal((await fetch(`${baseUrl}/orders/${o.id}/payment`,{method:'POST',headers,body:'{}'})).status,503);
  } finally {process.env.MULTI_REGISTRATION_CHECKOUT_ENABLED='true';}
  assert.equal(creates,0);
});
it('método desabilitado e reserva expirada não criam cobrança',async()=> {
  const o=await reserved();await query('UPDATE events SET pix_enabled=false');
  await assert.rejects(payments.start(o.id,buyer,randomUUID(),'PIX'),/indisponível/);
  await query("UPDATE checkout_orders SET reservation_expires_at=now()-interval '1 hour'");
  await assert.rejects(payments.start(o.id,buyer,randomUUID(),'CREDIT_CARD',{credit_card_token:'tok_expired'}),/expirada/);assert.equal(creates,0);
});
it('cartão exige token ou formulário e rejeita tentativa sem dados',async()=> {
  const o=await reserved();
  await assert.rejects(payments.start(o.id,buyer,randomUUID(),'CREDIT_CARD'),/dados do cartão/);
  assert.equal(creates,0);assert.equal(await state(o.id),'reserved');
});
it('estorno incerto sem confirmação bloqueia nova solicitação sem liberar ingresso',async()=> {
  const o=await settled();unavailable=true;
  await assert.rejects(payments.refund(o.id,o.items[0].registration_id!,randomUUID(),buyer),/Concilie/);
  unavailable=false;timeoutRefund=true;const original=gateway.refund;
  gateway.refund=async()=> {refundCalls++;throw new Error('timeout');};
  try {
    const key=randomUUID();assert.equal((await payments.refund(o.id,o.items[0].registration_id!,key,buyer)).status,'unknown');
    await payments.refund(o.id,o.items[0].registration_id!,key,buyer);
    await assert.rejects(payments.refund(o.id,o.items[1].registration_id!,randomUUID(),buyer),/pendente/);
    assert.equal(refundCalls,1);assert.equal(await getVariantRemainingStock(variant,event),8);
  } finally {gateway.refund=original;}
});
it('estorno de todos os itens fecha pedido mesmo com status agregado ainda RECEIVED',async()=> {
  const o=await settled();for(const item of o.items) await payments.refund(o.id,item.registration_id!,randomUUID(),buyer);
  assert.equal(await state(o.id),'refunded');assert.equal(await getVariantRemainingStock(variant,event),10);
  await payments.reconcile(o.id,buyer);assert.equal(await state(o.id),'refunded');
});
it('estorno tardio após cancelamento não devolve cupom duas vezes',async()=> {
  const o=await reserved({coupon_code:'GRUPO'});await payments.start(o.id,buyer,randomUUID(),'PIX');await payments.cancel(o.id,buyer);
  await query('UPDATE coupons SET current_uses=5');remote[0].status='REFUNDED';
  await payments.reconcile(o.id,buyer);assert.equal((await query('SELECT current_uses FROM coupons')).rows[0].current_uses,5);
});
it('estorno cancelado pelo provedor não libera estoque e permite nova tentativa',async()=> {
  const o=await settled();const original=gateway.refund;
  gateway.refund=async(id,value,description)=> {refundCalls++;remote.find(p=>p.id===id)!.refunds!.push({value,description,status:'CANCELLED'});};
  try {
    const r=await payments.refund(o.id,o.items[0].registration_id!,randomUUID(),buyer);
    assert.equal(r.status,'failed');assert.equal(await getVariantRemainingStock(variant,event),8);
  } finally {gateway.refund=original;}
  const r=await payments.refund(o.id,o.items[0].registration_id!,randomUUID(),buyer);
  assert.equal(r.status,'done');assert.equal(refundCalls,2);
});
it('cobrança restaurada após cancelamento não volta a oferecer link pagável',async()=> {
  const o=await reserved();await payments.start(o.id,buyer,randomUUID(),'PIX');await payments.cancel(o.id,buyer);
  remote[0].deleted=false;
  const result=await payments.reconcile(o.id,buyer);
  assert.equal(result?.status,'review');assert.equal(result?.invoice_url,null);
  assert.equal(await state(o.id),'needs_review');assert.equal(await getVariantRemainingStock(variant,event),10);
});
const cardPayload={credit_card_token:'tok_4111',remote_ip:'127.0.0.1'};
const rawCard={
  credit_card:{holderName:'Teste Comprador',number:'4111111111111111',expiryMonth:'12',expiryYear:'2030',ccv:'123'},
  credit_card_holder_info:{name:'Teste Comprador',email:'comprador@example.test',cpfCnpj:'52998224725',postalCode:'01310100',addressNumber:'100',phone:'11999999999'},
};
it('tokenização devolve token e cobrança CREDIT_CARD usa só token sem PAN',async()=> {
  const o=await reserved();
  const tokenized=await payments.tokenize(o.id,buyer,rawCard,'203.0.113.10');
  assert.equal(tokenized.credit_card_token,'tok_1111');assert.equal(tokenized.last4,'1111');
  const paid=await payments.start(o.id,buyer,randomUUID(),'CREDIT_CARD',{credit_card_token:tokenized.credit_card_token,remote_ip:'203.0.113.10'});
  assert.equal(paid?.method,'CREDIT_CARD');assert.equal(creates,1);
  assert.equal((remote[0] as any).creditCardToken,'tok_1111');
  assert.equal((remote[0] as any).creditCard,undefined);
});
it('cobrança CREDIT_CARD aceita cartão bruto no create (fluxo legado)',async()=> {
  const o=await reserved();
  const paid=await payments.start(o.id,buyer,randomUUID(),'CREDIT_CARD',{...rawCard,remote_ip:'203.0.113.10'});
  assert.equal(paid?.method,'CREDIT_CARD');assert.equal(creates,1);
  assert.equal((remote[0] as any).creditCard?.number,'4111111111111111');
  assert.ok((remote[0] as any).creditCardHolderInfo);
  assert.equal((remote[0] as any).creditCardToken,undefined);
});
it('timeout de cartão com token fica unknown e concilia sem repetir POST',async()=> {
  const o=await reserved();timeoutCreate=true;
  assert.equal((await payments.start(o.id,buyer,randomUUID(),'CREDIT_CARD',cardPayload))?.status,'unknown');
  assert.equal((await payments.reconcile(o.id,buyer))?.status,'pending');assert.equal(creates,1);
});
it('troca de meio abandona cobrança PIX, mantém reserva e permite cartão',async()=> {
  const o=await reserved({coupon_code:'GRUPO'});
  await payments.start(o.id,buyer,randomUUID(),'PIX');
  assert.equal(await state(o.id),'awaiting_payment');assert.equal(await getVariantRemainingStock(variant,event),8);
  const switched=await payments.switchMethod(o.id,buyer);
  assert.equal(switched?.status,'cancelled');assert.equal(switched?.keep_reservation,true);
  assert.equal(remote[0].deleted,true);assert.equal(await state(o.id),'reserved');
  assert.equal(await getVariantRemainingStock(variant,event),8);
  assert.equal((await query('SELECT current_uses FROM coupons')).rows[0].current_uses,2);
  const next=await payments.start(o.id,buyer,randomUUID(),'CREDIT_CARD',cardPayload);
  assert.equal(next?.method,'CREDIT_CARD');assert.equal(creates,2);assert.equal(await state(o.id),'awaiting_payment');
});
it('troca de meio cartão → PIX mantém estoque e cria nova cobrança',async()=> {
  const o=await reserved();
  await payments.start(o.id,buyer,randomUUID(),'CREDIT_CARD',cardPayload);
  await payments.switchMethod(o.id,buyer);
  assert.equal(await state(o.id),'reserved');assert.equal(await getVariantRemainingStock(variant,event),8);
  const next=await payments.start(o.id,buyer,randomUUID(),'PIX');
  assert.equal(next?.method,'PIX');assert.equal(creates,2);assert.ok(next?.pix_qr_code);
});
it('troca com gateway offline mantém pedido aguardando e não libera estoque',async()=> {
  const o=await reserved();await payments.start(o.id,buyer,randomUUID(),'PIX');unavailable=true;
  const result=await payments.switchMethod(o.id,buyer);
  assert.equal(await state(o.id),'awaiting_payment');assert.equal(result?.cancel_requested,true);assert.equal(result?.keep_reservation,true);
  assert.equal(await getVariantRemainingStock(variant,event),8);
  unavailable=false;await payments.reconcile(o.id,buyer);
  assert.equal(await state(o.id),'reserved');assert.equal(remote[0].deleted,true);
});
it('pagamento RECEIVED durante troca confirma em vez de liberar',async()=> {
  const o=await reserved();await payments.start(o.id,buyer,randomUUID(),'PIX');remote[0].status='RECEIVED';
  await payments.switchMethod(o.id,buyer);
  assert.equal(await state(o.id),'confirmed');assert.equal(remote[0].deleted,undefined);
});
it('pagamento tardio após troca fica em revisão sem matar estoque já reutilizado',async()=> {
  const o=await reserved();await payments.start(o.id,buyer,randomUUID(),'PIX');
  await payments.switchMethod(o.id,buyer);assert.equal(await state(o.id),'reserved');
  remote[0].deleted=false;remote[0].status='RECEIVED';await payments.reconcile(o.id,buyer);
  assert.equal(await state(o.id),'needs_review');
  assert.equal((await query("SELECT count(*)::int AS n FROM registrations WHERE status='confirmed'")).rows[0].n,0);
  assert.equal(await getVariantRemainingStock(variant,event),8);
});
it('cancelar pedido após troca em andamento é bloqueado até concluir',async()=> {
  const o=await reserved();await payments.start(o.id,buyer,randomUUID(),'PIX');unavailable=true;
  await payments.switchMethod(o.id,buyer);
  await assert.rejects(payments.cancel(o.id,buyer),/troca de meio/);
  unavailable=false;
});
it('troca recusa tentativa unknown/creating e cancelamento de pedido não preserva reserva',async()=> {
  const o=await reserved();timeoutCreate=true;
  await payments.start(o.id,buyer,randomUUID(),'PIX');
  await assert.rejects(payments.switchMethod(o.id,buyer),/Consulte a situação/);
  timeoutCreate=false;await payments.reconcile(o.id,buyer);
  await payments.cancel(o.id,buyer);
  assert.equal(await state(o.id),'cancelled');assert.equal(await getVariantRemainingStock(variant,event),10);
});


