import { before, beforeEach, after, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { Server } from 'node:http';
import type { CheckoutPaymentGateway, GatewayPayment } from '../src/services/checkoutPaymentGateway.js';

const url=new URL(process.env.DELIVERY_TEST_DATABASE_URL || 'http://missing');
if(!['postgres:','postgresql:'].includes(url.protocol) || url.hostname!=='127.0.0.1' || url.pathname!=='/cronoteam_stage7_test') {
  throw new Error('Informe DELIVERY_TEST_DATABASE_URL para PostgreSQL descartável local cronoteam_stage7_test.');
}
Object.assign(process.env,{POSTGRES_HOST:url.hostname,POSTGRES_PORT:url.port,POSTGRES_DB:url.pathname.slice(1),
  POSTGRES_USER:decodeURIComponent(url.username),POSTGRES_PASSWORD:decodeURIComponent(url.password),NODE_ENV:'test',
  JWT_SECRET:'orders-isolated-test-secret',MULTI_REGISTRATION_CHECKOUT_ENABLED:'true',LOG_SQL_ALL:'false'});
const {default:pool,query,withTransaction}=await import('../src/config/database.js');
const orders=await import('../src/services/checkoutOrdersService.js');
const {createCheckoutPaymentsService}=await import('../src/services/checkoutPaymentsService.js');
const {createParticipantsService}=await import('../src/services/checkoutParticipantsService.js');
const {getVariantRemainingStock}=await import('../src/services/registrationsService.js');
const {default:router}=await import('../src/routes/checkoutOrders.js');
const {orderRegistrationGuard}=await import('../src/middleware/orderRegistrationGuard.js');
const {errorHandler}=await import('../src/middleware/errorHandler.js');
const tickets=await import('../src/services/checkoutTicketsService.js');
const {createCheckoutDeliveryService,retryCheckoutDelivery}=await import('../src/services/checkoutDeliveryService.js');
const {default:deliveryRouter}=await import('../src/routes/checkoutDelivery.js');
const {default:myTicketsRouter}=await import('../src/routes/myTickets.js');
const {listMyTickets,listMyTicketEvents}=await import('../src/services/myTicketsService.js');
const {finalizeCheckoutTransfer}=await import('../src/services/checkoutTransferService.js');
const {createCheckoutTransferWorkflow}=await import('../src/services/checkoutTransferWorkflow.js');
const {createCheckoutTransfersRouter}=await import('../src/routes/checkoutTransfers.js');
const {checkoutPaymentGateway}=await import('../src/services/checkoutPaymentGateway.js');
const transferControllers=await import('../src/controllers/transferRequestController.js');
const {handleWebhook}=await import('../src/controllers/asaasWebhookController.js');
const {authenticate}=await import('../src/middleware/auth.js');
const {getRegistrationReceiptController,getRegistrationForValidation}=await import('../src/controllers/registrationsController.js');
const {updateProfile}=await import('../src/services/profilesService.js');
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
  await query(`ALTER TABLE profiles ADD COLUMN cpf_validated_at timestamptz, ADD COLUMN cpf_lookup_source text;
    ALTER TABLE events ADD COLUMN title text DEFAULT 'Corrida de teste', ADD COLUMN location text DEFAULT 'Parque', ADD COLUMN city text DEFAULT 'São Paulo', ADD COLUMN state text DEFAULT 'SP', ADD COLUMN banner_url text,
      ADD COLUMN transfers_enabled boolean DEFAULT true, ADD COLUMN transfer_until date;
    CREATE TABLE group_leaders(id uuid PRIMARY KEY,user_id uuid REFERENCES users,is_active boolean DEFAULT true,total_earnings numeric DEFAULT 0);
    CREATE TABLE leader_event_commissions(id uuid PRIMARY KEY,leader_id uuid REFERENCES group_leaders,event_id uuid REFERENCES events,bonus_type text,commission_percentage numeric,created_at timestamptz DEFAULT now());
    CREATE TABLE user_referrals(user_id uuid REFERENCES users,leader_id uuid REFERENCES group_leaders);
    CREATE TABLE leader_commissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),leader_id uuid REFERENCES group_leaders,registration_id uuid REFERENCES registrations,
      referred_user_id uuid NOT NULL REFERENCES users,event_id uuid REFERENCES events,commission_amount numeric,commission_percentage numeric,registration_amount numeric,status text,updated_at timestamptz);`);
  await query(`ALTER TABLE events ADD COLUMN status text DEFAULT 'published', ADD COLUMN event_date timestamptz DEFAULT now()+interval '30 days',
      ADD COLUMN registration_status text DEFAULT 'open', ADD COLUMN registration_auto_mode boolean DEFAULT false,
      ADD COLUMN registration_start_date timestamptz, ADD COLUMN registration_end_date timestamptz;
    ALTER TABLE modalities ADD COLUMN name text DEFAULT '5 km';
    ALTER TABLE event_kits ADD COLUMN name text DEFAULT 'Kit básico', ADD COLUMN deleted_at timestamptz, ADD COLUMN is_visible boolean DEFAULT true;
    ALTER TABLE registrations ADD COLUMN created_at timestamptz DEFAULT now(), ADD COLUMN asaas_payment_id text;
    CREATE TABLE kit_categories(kit_id uuid REFERENCES event_kits, category_id uuid REFERENCES categories);`);
  await query(`CREATE TABLE transfer_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),registration_id uuid REFERENCES registrations(id),
    requested_by uuid REFERENCES users(id),new_runner_id uuid REFERENCES users(id),transfer_fee numeric DEFAULT 0,payment_status text DEFAULT 'pending',
    status text DEFAULT 'pending',processed_by uuid REFERENCES users(id),processed_at timestamptz,updated_at timestamptz DEFAULT now(),
    new_runner_cpf text,new_runner_email text,reason text,admin_notes text,asaas_payment_id text,created_at timestamptz DEFAULT now());
    ALTER TABLE system_settings ADD COLUMN transfer_fee numeric DEFAULT 0;`);
  for(const file of ['118_registration_inventory_guards.sql','119_checkout_participants.sql','120_checkout_orders.sql','121_checkout_order_payments.sql','122_checkout_delivery.sql','123_checkout_ticket_transfers.sql','124_checkout_transfer_payments.sql','125_checkout_payment_pix_qr.sql','127_checkout_transfer_payment_pix_qr.sql']) {
    await query(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  }
  await query(`ALTER TABLE profiles ADD COLUMN phone text;
    ALTER TABLE categories ADD COLUMN category_type text DEFAULT 'general';
    ALTER TABLE coupons ADD COLUMN name text;
    ALTER TABLE group_leaders ADD COLUMN referral_code text;`);
  const app=express();app.use(express.json());app.use('/orders',router);
  app.use('/delivery',deliveryRouter);
  app.use('/tickets',myTicketsRouter);
  app.use('/transfers',createCheckoutTransfersRouter(transfers));
  app.get('/compat/transfer-requests/:id',authenticate,transferControllers.getTransferRequestByIdController);
  app.post('/compat/transfer-requests/:id/payment',authenticate,transferControllers.generateTransferPaymentController);
  app.patch('/compat/transfer-requests/:id',authenticate,transferControllers.updateTransferRequestController);
  app.post('/webhook',handleWebhook);
  app.get('/receipts/:id',authenticate,getRegistrationReceiptController);
  app.use('/validation',orderRegistrationGuard);
  app.get('/validation/:id',getRegistrationForValidation);
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
  await query("INSERT INTO users VALUES ($1,'organizador@example.test')",[organizer]);
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
  async create(input) {
    creates++;
    if(rejectCreate) throw {response:{status:400}};
    const p={...input,id:`pay_${creates}`,status:'PENDING',invoiceUrl:'https://sandbox.asaas.com/i/test',refunds:[],
      pixQrCode:input.billingType==='PIX'?'00020126580014br.gov.bcb.pix0136delivery-test':null};
    remote.push(p);
    if(timeoutCreate) throw new Error('timeout');
    return p;
  },
  async find(ref) {if(unavailable) throw new Error('offline');return remote.filter(p=>p.externalReference===ref);},
  async get(id) {if(unavailable) throw new Error('offline');const p=remote.find(p=>p.id===id);assert.ok(p);return structuredClone(p);},
  async pixQr(id) {
    if(unavailable) throw new Error('offline');
    const p=remote.find(x=>x.id===id);return p?.billingType==='PIX'?(p.pixQrCode || null):null;
  },
  async remove(id) {if(unavailable) throw new Error('offline');remote.find(p=>p.id===id)!.deleted=true;},
  async refund(id,value,description) {
    refundCalls++;remote.find(p=>p.id===id)!.refunds!.push({value,description,status:'DONE'});
    if(timeoutRefund) throw new Error('timeout');
  },
};
const payments=createCheckoutPaymentsService(gateway);
const transfers=createCheckoutTransferWorkflow(gateway);
Object.assign(checkoutPaymentGateway,gateway); // Nenhum teste de controller acessa serviços externos.
beforeEach(()=> {remote=[];creates=0;refundCalls=0;unavailable=false;timeoutCreate=false;rejectCreate=false;timeoutRefund=false;});
async function reserved(extra={}) {const r=await reviewed([0,1],extra);return orders.reserveCheckoutOrder(r.id,buyer,r.version);}
const state=async(id:string)=>(await orders.getCheckoutOrder(id,buyer)).status;
async function settled() {
  const o=await reserved({coupon_code:'GRUPO'});await payments.start(o.id,buyer,randomUUID(),'PIX');
  remote[0].status='RECEIVED';await payments.reconcile(o.id,buyer);return o;
}
const jobs=async()=>(await query('SELECT * FROM checkout_delivery_jobs ORDER BY created_at,id')).rows;
const regs=async()=>(await query('SELECT * FROM registrations ORDER BY participant_cpf')).rows;
const mailTo=async(index:number,email:string)=>manual.complete(participants[index],buyer,{full_name:`Atleta ${['Primeiro','Segundo','Terceiro'][index]}`,gender:'M',delivery_mode:'email',email});
// Etapa A da evolução de UX: referência de coexistência, sem modificar os contratos atuais.
async function legacyUxFixtures() {
  return (await query(await readFile(new URL('./fixtures/checkoutUxLegacy.sql',import.meta.url),'utf8'),[buyer,organizer])).rows;
}
const worker=(send=async(_mail:any)=>true,bonus=async(_payload:any)=>{})=>createCheckoutDeliveryService({send,bonus});
it('UX E1: consulta mista pagina e conta sobre o mesmo conjunto sem modificar inscrições',async()=>{
  await legacyUxFixtures();await settled();
  const before=(await query('SELECT * FROM registrations ORDER BY id')).rows;
  const all=await listMyTickets(buyer);
  assert.equal(all.total,6);assert.equal(new Set(all.items.map((i:any)=>i.registration_id)).size,6);
  assert.deepEqual(all.counts,{active:4,pending:1,transferred:1,cancelled:0,refunded:0});
  const first=await listMyTickets(buyer,{page_size:2}),second=await listMyTickets(buyer,{page:2,page_size:2});
  assert.equal(first.total,6);assert.equal(second.items.length,2);
  assert.equal(new Set([...first.items,...second.items].map((i:any)=>i.registration_id)).size,4);
  const pending=await listMyTickets(buyer,{status:'pending'});assert.equal(pending.total,1);assert.deepEqual(pending.counts,all.counts);
  const empty=await listMyTickets(buyer,{page:99,page_size:2});assert.equal(empty.items.length,0);assert.equal(empty.total,6);
  assert.deepEqual((await query('SELECT * FROM registrations ORDER BY id')).rows,before);
});
it('UX E1: lista de eventos só inclui eventos com ingresso confirmado',async()=>{
  const {listMyTicketEvents}=await import('../src/services/myTicketsService.js');
  await legacyUxFixtures();await settled();
  const events=await listMyTicketEvents(buyer);
  assert.ok(events.total>=1);
  assert.ok(events.items.every((e:any)=>e.confirmed_count>=1 && e.pending_count>=0));
  assert.equal(events.counts.active,4);
  const byEvent=await listMyTickets(buyer,{event_id:events.items[0].event_id,status:'active'});
  assert.equal(byEvent.total,events.items[0].confirmed_count);
});
it('UX E1: administrador e organizador não ganham acesso pessoal por filtros',async()=>{
  await settled();await query("INSERT INTO user_roles VALUES($1,'admin')",[otherBuyer]);
  const order=(await regs())[0].order_id;
  assert.equal((await listMyTickets(otherBuyer,{event_id:event})).total,0);
  assert.equal((await listMyTickets(organizer,{order_id:order})).total,0);
  assert.equal((await listMyTickets(buyer,{relationship:'runner'})).total,0);
  assert.equal((await listMyTickets(buyer,{relationship:'buyer'})).total,2);
});
it('UX E1: busca não revela nome privado, CPF ou código antes da confirmação',async()=>{
  const runner=await newRunner(cpfs[0]);await reserved();
  const privateTicket=(await listMyTickets(buyer)).items.find((i:any)=>i.participant.restricted)!;
  assert.equal(privateTicket.participant.name,null);assert.equal(privateTicket.participant.cpf_masked,null);
  assert.equal((await listMyTickets(buyer,{search:'Novo Atleta'})).total,0);
  assert.equal((await listMyTickets(runner,{search:'Novo Atleta'})).total,1);
  const serialized=JSON.stringify(await listMyTickets(buyer));
  assert.ok(!serialized.includes(cpfs[0]));assert.ok(!serialized.includes('birthDate'));assert.ok(!serialized.includes('confirmation_code'));
  const code=(await regs())[0].confirmation_code;assert.equal((await listMyTickets(buyer,{search:code})).total,0);
});
it('UX E1: vínculo de comprador e atleta não duplica ingresso nem revela código na lista',async()=>{
  await query("UPDATE profiles SET cpf=$2,cpf_validated_at=now(),cpf_lookup_source='cpf_brasil_api' WHERE id=$1",[buyer,cpfs[0]]);
  await settled();const list=await listMyTickets(buyer);
  assert.equal(list.total,2);assert.equal(list.items.filter((i:any)=>i.relationship.runner && i.relationship.buyer).length,1);
  assert.equal(list.items[0].ticket.released,true);assert.ok(!('confirmation_code' in list.items[0]));
});
it('UX E1: reais, alocação e reembolso são individuais; legado desconhecido não vira zero',async()=>{
  const legacy=await legacyUxFixtures();await query('UPDATE registrations SET total_amount=NULL WHERE id=$1',[legacy[0].id]);
  await settled();const all=await listMyTickets(buyer);
  assert.equal(all.items.find((i:any)=>i.registration_id===legacy[0].id).amounts.total_cents,null);
  const item=all.items.find((i:any)=>i.source==='order');
  assert.equal(item.amounts.total_cents,11000);assert.equal(item.amounts.paid_cents,11000);assert.equal(item.amounts.refunded_cents,0);
  await payments.refund(item.order_id,item.registration_id,randomUUID(),organizer);
  const refunded=await listMyTickets(buyer,{status:'refunded'});assert.equal(refunded.total,1);
  assert.equal(refunded.items[0].amounts.refunded_cents,11000);assert.equal(refunded.items[0].ticket.released,false);
});
it('UX E1: transferência legada diferencia titular atual e histórico do responsável',async()=>{
  const legacy=await legacyUxFixtures();const history=legacy.find(r=>r.status==='transferred');
  await query('UPDATE registrations SET runner_id=$2 WHERE id=$1',[history.id,otherBuyer]);
  assert.equal((await listMyTickets(buyer,{status:'transferred'})).total,1);
  const current=await listMyTickets(otherBuyer);assert.equal(current.total,1);assert.equal(current.items[0].state.group,'active');
  await query('UPDATE registrations SET transferred_to_registration_id=$2 WHERE id=$1',[history.id,legacy[0].id]);
  assert.equal((await listMyTickets(otherBuyer)).items[0].state.group,'transferred');
});
it('UX E1: HTTP exige autenticação, não aceita escolher proprietário e não permite cache',async()=>{
  await legacyUxFixtures();
  assert.equal((await fetch(`${baseUrl}/tickets/mine`)).status,401);
  const token=jwt.sign({userId:buyer,email:'comprador@example.test'},process.env.JWT_SECRET!);
  const headers={Authorization:`Bearer ${token}`};
  for(const suffix of ['?user_id='+otherBuyer,'?page_size=101','?page=0','?event_id=invalid','?status=wrong','?page=1&page=2']) {
    assert.equal((await fetch(`${baseUrl}/tickets/mine${suffix}`,{headers})).status,400);
  }
  const response=await fetch(`${baseUrl}/tickets/mine?page_size=2`,{headers});
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json() as any).data.total,4);
});
it('UX E1: pedido pago em conferência não libera ingresso; busca literal e imagem preservam escopo',async()=>{
  const o=await settled();
  await query("UPDATE events SET title='Corrida 100%_teste',banner_url='https://example.test/banner.jpg' WHERE id=$1",[event]);
  const literal=await listMyTickets(buyer,{search:'%_'});assert.equal(literal.total,2);
  assert.equal(literal.items[0].event.banner_url,'https://example.test/banner.jpg');
  await query("UPDATE checkout_orders SET status='needs_review' WHERE id=$1",[o.id]);
  const held=await listMyTickets(buyer);assert.equal(held.counts.pending,2);assert.equal(held.counts.active,0);
  assert.equal(held.items[0].ticket.released,false);assert.equal(held.items[0].ticket.download_available,false);
});
it('UX E3: adaptador legado preserva convite e valores da diferença sem expor perfil ou código',async()=>{
  const fixtures=await legacyUxFixtures(),paid=fixtures.find(r=>r.confirmation_code==='LEGACY-PAID')!;
  await query("INSERT INTO asaas_payments(registration_id,value,status) VALUES($1,80,'RECEIVED'),($1,20,'PENDING')",[paid.id]);
  const page=await listMyTickets(buyer);const item=page.items.find((t:any)=>t.registration_id===paid.id);
  assert.equal(item.legacy.amount_paid,80);assert.equal(item.legacy.pending_difference_amount,20);
  assert.equal(item.legacy.has_pending_difference,true);assert.equal(item.ticket.released,true);
  assert.equal(item.event.transfers_enabled,true);
  assert.ok(!('confirmation_code' in item.legacy));assert.ok(!('runner_cpf' in item.legacy));
  assert.equal(page.items.find((t:any)=>t.registration_id===fixtures.find(r=>r.payment_method==='free_bonus')!.id).legacy.category_id,null);
});
it('UX E3: consulta omite convites expirados e mantém contagem consistente',async()=>{
  const fixtures=await legacyUxFixtures(),invitation=fixtures.find(r=>r.payment_method==='free_bonus')!;
  await query("INSERT INTO leader_invitations(id,bonus_registration_id,runner_id,status) VALUES(gen_random_uuid(),$1,$2,'expired')",[invitation.id,buyer]);
  const page=await listMyTickets(buyer);assert.equal(page.total,3);assert.equal(page.items.some((t:any)=>t.registration_id===invitation.id),false);
  assert.equal(Object.values(page.counts).reduce((a:number,b:any)=>a+Number(b),0),3);
});
it('UX E3: somente solicitante recebe referência para retomar taxa de transferência',async()=>{
  const current=await newRunner(cpfs[0]);const {input}=await transferFixture();const row=(await regs()).find(r=>r.runner_id===current)!;
  const request=await transfers.create(row.id,buyer,input);
  const mine=(await listMyTickets(buyer)).items.find((t:any)=>t.registration_id===row.id);
  const athlete=(await listMyTickets(current)).items.find((t:any)=>t.registration_id===row.id);
  assert.deepEqual(mine.transfer,{pending:true,request_id:request.id});assert.deepEqual(athlete.transfer,{pending:true,request_id:null});
});
async function newRunner(cpf=cpfs[0],verified=true,birthDate='1990-01-01') {
  const id=randomUUID();await query("INSERT INTO users VALUES($1,'novo@example.test')",[id]);
  await query(`INSERT INTO profiles(id,cpf,full_name,birth_date,cpf_validated_at,cpf_lookup_source)
    VALUES($1,$2,'Novo Atleta',$3,CASE WHEN $4 THEN now() END,CASE WHEN $4 THEN 'cpf_brasil_api' ELSE 'manual' END)`,[id,cpf,birthDate,verified]);
  return id;
}
async function transferRequest(registrationId:string,newRunnerId:string,paid=true) {
  await query(`UPDATE system_settings SET enabled_modules=enabled_modules || '{"transfers":true}'::jsonb`);
  return (await query(`INSERT INTO transfer_requests(registration_id,requested_by,new_runner_id,transfer_fee,payment_status,checkout_ticket_version)
    SELECT id,$2,$3,10,$4,checkout_ticket_version FROM registrations WHERE id=$1 RETURNING *`,[registrationId,buyer,newRunnerId,paid?'paid':'pending'])).rows[0];
}
async function transferFixture(fee=10) {
  await settled();const row=(await regs())[0],recipient=await newRunner(cpfs[2]);
  await query(`UPDATE system_settings SET transfer_fee=$1,enabled_modules=enabled_modules || '{"transfers":true}'::jsonb`,[fee]);
  return {row,recipient,input:{request_key:randomUUID(),new_runner_cpf:cpfs[2]}};
}
async function httpTransfer(path:string,method='GET',body?:unknown,actor=buyer) {
  const token=jwt.sign({userId:actor,email:'comprador@example.test'},process.env.JWT_SECRET!);
  const result=await fetch(`${baseUrl}${path}`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:result.status,body:await result.json() as any};
}
it('UX E2 fluxo: HTTP autentica, valida entrada e protege taxa e versão',async()=>{
  const {row,input}=await transferFixture();const path=`/transfers/tickets/${row.id}/requests`;
  assert.equal((await fetch(`${baseUrl}${path}`,{method:'POST'})).status,401);
  assert.equal((await httpTransfer(path,'POST',{...input,transfer_fee:0})).status,400);
  assert.equal((await httpTransfer(path,'POST',{...input,new_runner_cpf:'123'})).status,400);
  assert.equal((await httpTransfer(path,'POST',input,otherBuyer)).status,404);
  const created=await httpTransfer(path,'POST',input);assert.equal(created.status,201);
  const t=created.body.data;assert.equal(Number(t.transfer_fee),10);assert.equal(t.checkout_ticket_version,0);
  assert.equal((await httpTransfer(`/transfers/requests/${t.id}`,'GET',undefined,otherBuyer)).status,404);
  assert.equal((await httpTransfer(`/transfers/requests/${t.id}/payment`,'POST',{payment_status:'paid'})).status,400);
  assert.equal((await httpTransfer(`/transfers/requests/${t.id}`,'PATCH',{status:'approved'},otherBuyer)).status,403);
});
it('UX E2 fluxo: criação repetida mantém solicitação e recusa chave alterada ou segunda taxa',async()=>{
  const {row,input}=await transferFixture();const first=await transfers.create(row.id,buyer,input);
  assert.equal((await transfers.create(row.id,buyer,input)).id,first.id);
  await assert.rejects(transfers.create(row.id,buyer,{...input,reason:'outro'}),/Chave/);
  await assert.rejects(transfers.create(row.id,buyer,{...input,request_key:randomUUID()}),/pendente/);
  assert.equal(await count('transfer_requests'),1);assert.equal(await count('checkout_transfer_payments'),0);
});
it('UX E2 fluxo: taxa zero transfere imediatamente sem gateway e repete com mesmo resultado',async()=>{
  const {row,input,recipient}=await transferFixture(0),before=creates;
  const t=await transfers.create(row.id,buyer,input);assert.equal(t.status,'completed');
  assert.equal((await transfers.create(row.id,buyer,input)).id,t.id);
  assert.equal((await query('SELECT runner_id FROM registrations WHERE id=$1',[row.id])).rows[0].runner_id,recipient);
  assert.equal(creates,before);assert.equal(await count('checkout_ticket_transfers'),1);
});
it('UX E2 fluxo: categoria inválida não gera solicitação nem cobrança',async()=>{
  const {row,input}=await transferFixture();await query('UPDATE categories SET min_age=90 WHERE id=$1',[category]);
  await assert.rejects(transfers.create(row.id,buyer,input),/categoria/);
  assert.equal(await count('transfer_requests'),0);assert.equal(creates,1);
});
it('UX E2 fluxo: inscrição duplicada do destino é rejeitada antes de cobrar a taxa',async()=>{
  const {row,input,recipient}=await transferFixture();
  const duplicate=(await regs()).find(r=>r.id!==row.id)!;
  await query('UPDATE profiles SET cpf=$2 WHERE id=$1',[recipient,duplicate.participant_cpf]);
  await assert.rejects(transfers.create(row.id,buyer,{...input,new_runner_cpf:duplicate.participant_cpf}),/já possui inscrição/);
  assert.equal(await count('transfer_requests'),0);assert.equal(creates,1);
});
it('UX E2 fluxo: destinatário sem cadastro aguarda cadastro antes da cobrança',async()=>{
  const {row,input,recipient}=await transferFixture();await query("UPDATE profiles SET cpf='12345678909' WHERE id=$1",[recipient]);
  const t=await transfers.create(row.id,buyer,input);
  await assert.rejects(transfers.pay(t.id!,buyer),/completar o cadastro/);assert.equal(creates,1);
  await query('UPDATE profiles SET cpf=$2 WHERE id=$1',[recipient,cpfs[2]]);
  const paid=await transfers.pay(t.id!,buyer);
  assert.equal(paid.payment?.status,'pending');
  assert.equal(paid.payment?.pix_qr_code,'00020126580014br.gov.bcb.pix0136delivery-test');
  assert.equal(creates,2);
});
it('UX E2 fluxo: CPF e email divergentes não escolhem outro cadastro',async()=>{
  const {row,input}=await transferFixture();
  await assert.rejects(transfers.create(row.id,buyer,{...input,new_runner_email:'comprador@example.test'}),/único cadastro/);
  await assert.rejects(transfers.create(row.id,buyer,{...input,new_runner_email:'inexistente@example.test'}),/mesmo cadastro/);
});
it('UX E2 fluxo: cobrança repetida e consulta legada concluem uma única transferência',async()=>{
  const {row,input}=await transferFixture();const t=await transfers.create(row.id,buyer,input);
  const path=`/compat/transfer-requests/${t.id}`;
  const paid=await httpTransfer(`${path}/payment`,'POST',{});assert.equal(paid.status,200);assert.equal(paid.body.data.payment.status,'pending');
  assert.match(paid.body.data.payment.pix_qr_code,/br\.gov\.bcb\.pix/);
  assert.equal((await httpTransfer(`${path}/payment`,'POST',{})).status,200);assert.equal(creates,2);
  remote[1].status='RECEIVED';
  const done=await httpTransfer(path);assert.equal(done.status,200);assert.equal(done.body.data.status,'completed');
  assert.equal((await httpTransfer(path)).body.data.status,'completed');
  assert.equal(await count('checkout_ticket_transfers'),1);
  const reg=(await query('SELECT * FROM registrations WHERE id=$1',[row.id])).rows[0];
  assert.equal(reg.status,'confirmed');assert.equal(reg.payment_status,'paid');
});
it('UX E2 fluxo: timeout de criação recupera por referência sem repetir POST',async()=>{
  const {row,input}=await transferFixture();const t=await transfers.create(row.id,buyer,input);
  timeoutCreate=true;assert.equal((await transfers.pay(t.id!,buyer)).payment?.status,'creating');timeoutCreate=false;
  assert.equal((await transfers.pay(t.id!,buyer)).payment?.status,'pending');assert.equal(creates,2);
  remote[1].status='RECEIVED';assert.equal((await transfers.read(t.id!,buyer)).status,'completed');
});
it('UX E2 fluxo: cobrança ainda não localizada não autoriza uma nova taxa',async()=>{
  const {row,input}=await transferFixture();const t=await transfers.create(row.id,buyer,input);
  rejectCreate=true;await transfers.pay(t.id!,buyer);rejectCreate=false;
  assert.equal((await transfers.pay(t.id!,buyer)).payment?.status,'creating');assert.equal(creates,2);
});
it('UX E2 fluxo: webhook consulta provedor e não confia em status ou valor recebidos',async()=>{
  const {row,input}=await transferFixture();const t=await transfers.create(row.id,buyer,input);await transfers.pay(t.id!,buyer);
  const payload={event:'PAYMENT_RECEIVED',payment:{id:remote[1].id,externalReference:remote[1].externalReference,status:'RECEIVED',value:0}};
  assert.equal((await httpTransfer('/webhook','POST',payload)).status,200);
  assert.equal(await count('checkout_ticket_transfers'),0);
  remote[1].status='RECEIVED';assert.equal((await httpTransfer('/webhook','POST',payload)).status,200);
  assert.equal((await httpTransfer('/webhook','POST',payload)).status,200);assert.equal(await count('checkout_ticket_transfers'),1);
});
it('UX E2 fluxo: divergência do provedor bloqueia transferência e link de pagamento',async()=>{
  const {row,input}=await transferFixture();const t=await transfers.create(row.id,buyer,input);await transfers.pay(t.id!,buyer);
  remote[1].status='RECEIVED';remote[1].value=1;
  const result=await transfers.read(t.id!,buyer);assert.equal(result.payment?.status,'review');assert.equal(result.payment?.invoice_url,null);
  assert.equal(result.payment_status,'pending');assert.equal(await count('checkout_ticket_transfers'),0);
});
it('UX E2 fluxo: pagamento confirmado durante bloqueio é retomado pelo GET',async()=>{
  const {row,input}=await transferFixture();const t=await transfers.create(row.id,buyer,input);await transfers.pay(t.id!,buyer);
  const client=await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtextextended($1,817))',[row.order_id]);remote[1].status='RECEIVED';
    const pending=await transfers.read(t.id!,buyer);assert.equal(pending.payment_status,'paid');assert.equal(pending.status,'pending');assert.match(pending.payment!.issue,/processamento/);
  } finally {await client.query('SELECT pg_advisory_unlock(hashtextextended($1,817))',[row.order_id]);client.release();}
  assert.equal((await transfers.read(t.id!,buyer)).status,'completed');assert.equal(await count('checkout_ticket_transfers'),1);
});
it('UX E2 fluxo: administrador mantém aprovação sem taxa paga e rejeição atômica',async()=>{
  const {row,input}=await transferFixture();await query("INSERT INTO user_roles VALUES($1,'admin')",[otherBuyer]);
  const t=await transfers.create(row.id,buyer,input);
  const path=`/compat/transfer-requests/${t.id}`;
  assert.equal((await httpTransfer(path,'PATCH',{status:'approved'},otherBuyer)).body.data.status,'completed');
  assert.equal((await httpTransfer(path,'PATCH',{status:'approved'},otherBuyer)).body.data.status,'completed');
  assert.equal(await count('checkout_ticket_transfers'),1);assert.equal(creates,1);
});
it('UX E2 fluxo: aprovação inválida faz rollback e requisições simultâneas não duplicam cobrança',async()=>{
  const {row,input}=await transferFixture();await query("INSERT INTO user_roles VALUES($1,'admin')",[otherBuyer]);
  const t=await transfers.create(row.id,buyer,input);
  await assert.rejects(transfers.decide(t.id!,otherBuyer,{status:'approved',new_runner_id:buyer}),/titular inválido/);
  assert.equal((await query('SELECT status,new_runner_id FROM transfer_requests WHERE id=$1',[t.id])).rows[0].status,'pending');
  await Promise.allSettled([transfers.pay(t.id!,buyer),transfers.pay(t.id!,buyer)]);
  assert.equal(creates,2);assert.equal(await count('checkout_transfer_payments'),1);
});
it('UX E2 fluxo: histórico de solicitação não revela código atual nem nome do próximo titular',async()=>{
  const {row,input}=await transferFixture(0);const t=await transfers.create(row.id,buyer,input);
  const current=await transfers.read(t.id!,buyer);
  assert.equal('confirmation_code' in current,false);assert.equal('runner_name' in current,false);
  assert.equal('confirmation_code' in (await httpTransfer(`/compat/transfer-requests/${t.id}`)).body.data,false);
});
it('UX E2 fluxo: antigo titular pode recuperar resposta perdida sem recuperar acesso ao ingresso',async()=>{
  const original=await newRunner(cpfs[0]);const {input}=await transferFixture(0);
  const row=(await regs()).find(r=>r.runner_id===original)!;
  const t=await transfers.create(row.id,original,input);assert.equal(t.status,'completed');
  assert.equal((await transfers.create(row.id,original,input)).id,t.id);
  assert.equal('confirmation_code' in await transfers.read(t.id!,original),false);
  await assert.rejects(tickets.authorizedTicket(row.id,original));
});
it('UX E2 fluxo: worker recupera taxa paga sem novo POST nem visita do comprador',async()=>{
  const {row,input}=await transferFixture();const t=await transfers.create(row.id,buyer,input);
  timeoutCreate=true;await transfers.pay(t.id!,buyer);timeoutCreate=false;remote[1].status='RECEIVED';
  await query("UPDATE checkout_transfer_payments SET updated_at=now()-interval '6 minutes'");
  await transfers.sweep();assert.equal((await query('SELECT status FROM transfer_requests WHERE id=$1',[t.id])).rows[0].status,'completed');
  assert.equal(creates,2);assert.equal(await count('checkout_ticket_transfers'),1);
});
it('UX E2 fluxo: taxa paga após reembolso do ingresso fica registrada para revisão',async()=>{
  const {row,input}=await transferFixture();const t=await transfers.create(row.id,buyer,input);await transfers.pay(t.id!,buyer);
  await payments.refund(row.order_id,row.id,randomUUID(),organizer);remote[1].status='RECEIVED';
  const result=await transfers.read(t.id!,buyer);assert.equal(result.payment_status,'paid');assert.equal(result.status,'pending');
  assert.match(result.payment!.issue,/indisponível/);assert.equal(await count('checkout_ticket_transfers'),0);
  assert.equal((await query('SELECT payment_status FROM registrations WHERE id=$1',[row.id])).rows[0].payment_status,'refunded');
});
it('UX E2 fluxo: aprovação administrativa com taxa pendente não duplica transferência no callback',async()=>{
  const {row,input}=await transferFixture();await query("INSERT INTO user_roles VALUES($1,'admin')",[otherBuyer]);
  const t=await transfers.create(row.id,buyer,input);await transfers.pay(t.id!,buyer);
  assert.equal((await transfers.decide(t.id!,otherBuyer,{status:'approved'})).status,'completed');
  remote[1].status='RECEIVED';await transfers.webhook({payment:remote[1]});
  assert.equal(await count('checkout_ticket_transfers'),1);assert.equal((await transfers.read(t.id!,buyer)).payment_status,'paid');
});
it('UX E2 fluxo: múltiplas cobranças incertas ficam em revisão sem transferir',async()=>{
  const {row,input}=await transferFixture();const t=await transfers.create(row.id,buyer,input);
  timeoutCreate=true;await transfers.pay(t.id!,buyer);timeoutCreate=false;
  remote[1].status='RECEIVED';remote.push({...remote[1],id:'pay_duplicate'});
  await transfers.webhook({payment:remote[1]});
  assert.equal((await transfers.read(t.id!,buyer)).payment?.status,'review');assert.equal(await count('checkout_ticket_transfers'),0);
});
it('UX E2 fluxo: estorno parcial da taxa impede concluir com status remoto ainda recebido',async()=>{
  const {row,input}=await transferFixture();const t=await transfers.create(row.id,buyer,input);await transfers.pay(t.id!,buyer);
  remote[1].status='RECEIVED';remote[1].refunds=[{status:'PENDING',value:5}];
  const result=await transfers.read(t.id!,buyer);assert.equal(result.payment?.status,'review');
  assert.equal(result.payment_status,'pending');assert.equal(await count('checkout_ticket_transfers'),0);
});
it('UX E2 fluxo: cancelamento administrativo espera estorno confirmado da taxa',async()=>{
  const {row,input}=await transferFixture();await query("INSERT INTO user_roles VALUES($1,'admin')",[otherBuyer]);
  const t=await transfers.create(row.id,buyer,input);await transfers.pay(t.id!,buyer);
  await assert.rejects(transfers.decide(t.id!,otherBuyer,{status:'cancelled'}),/estorno da taxa/);
  remote[1].status='RECEIVED';remote[1].refunds=[{status:'PENDING',value:5}];
  assert.equal((await transfers.read(t.id!,buyer)).payment?.status,'review');
  remote[1].status='REFUNDED';await transfers.read(t.id!,buyer);
  assert.equal((await transfers.decide(t.id!,otherBuyer,{status:'cancelled'})).status,'cancelled');
  assert.equal(await count('checkout_ticket_transfers'),0);
});
it('UX E2 fluxo: solicitante cancela pendente sem taxa e reabre com outro destinatário',async()=>{
  const {row,input}=await transferFixture();
  const t=await transfers.create(row.id,buyer,input);
  assert.equal((await httpTransfer(`/transfers/requests/${t.id}/cancel`,'POST',{})).status,200);
  assert.equal((await transfers.cancel(t.id!,buyer)).status,'cancelled');
  await assert.rejects(transfers.cancel(t.id!,otherBuyer),/não encontrada/);
  const next=await newRunner('39053344705');
  const again=await transfers.create(row.id,buyer,{request_key:randomUUID(),new_runner_cpf:'39053344705'});
  assert.equal(again.status,'pending');assert.notEqual(again.id,t.id);
  assert.equal((await query('SELECT new_runner_id FROM transfer_requests WHERE id=$1',[again.id])).rows[0].new_runner_id,next);
  assert.equal(await count('checkout_ticket_transfers'),0);
});
it('UX E2 fluxo: solicitante cancela Pix pendente e bloqueia cancelamento após pagamento',async()=>{
  const {row,input}=await transferFixture();
  const t=await transfers.create(row.id,buyer,input);await transfers.pay(t.id!,buyer);
  assert.equal((await transfers.cancel(t.id!,buyer)).status,'cancelled');
  assert.equal(remote[1].deleted,true);
  assert.equal((await query("SELECT state FROM checkout_transfer_payments WHERE request_id=$1",[t.id])).rows[0].state,'refunded');
  const paid=await transfers.create(row.id,buyer,{request_key:randomUUID(),new_runner_cpf:cpfs[2]});
  await transfers.pay(paid.id!,buyer);remote[2].status='RECEIVED';
  await assert.rejects(transfers.cancel(paid.id!,buyer),/taxa já foi paga/i);
  assert.equal((await transfers.read(paid.id!,buyer)).status,'completed');
});
it('UX E2 núcleo: transferência preserva fotografia, alocação e estoque, revoga link e conclui uma vez',async()=>{
  const original=await newRunner(cpfs[0]);const next=await newRunner(cpfs[2]);const o=await settled();
  await query("UPDATE profiles SET full_name='Titular Atual' WHERE id=$1",[next]);
  const row=(await tickets.ticketRows(o.id)).find(r=>r.runner_id===original);
  const token=tickets.ticketAccessToken(row),snapshot=structuredClone(row.snapshot);
  const legacyToken=jwt.sign({sub:row.id,aud:'checkout-ticket',iss:'cronoteam'},process.env.JWT_SECRET!,{expiresIn:'1h'});
  assert.equal((await tickets.ticketByAccessToken(legacyToken)).id,row.id);
  const allocation=(await query('SELECT * FROM checkout_payment_allocations WHERE registration_id=$1',[row.id])).rows[0];
  await tickets.collectCheckoutKit(row.id,organizer);
  const request=await transferRequest(row.id,next);
  const done=await finalizeCheckoutTransfer(request.id);assert.equal(done.ticket_version,1);
  assert.deepEqual(await finalizeCheckoutTransfer(request.id),done);
  const changed=(await tickets.ticketRows(o.id)).find(r=>r.id===row.id);
  assert.equal(changed.runner_id,next);assert.equal(changed.status,'confirmed');assert.equal(changed.payment_status,'paid');
  assert.deepEqual(changed.snapshot,snapshot);assert.ok(changed.checkout_kit_collected_at);assert.notEqual(changed.confirmation_code,row.confirmation_code);
  assert.deepEqual((await query('SELECT * FROM checkout_payment_allocations WHERE registration_id=$1',[row.id])).rows[0],allocation);
  assert.equal(await getVariantRemainingStock(variant,event),8);assert.equal(await count('checkout_ticket_transfers'),1);
  await assert.rejects(tickets.ticketByAccessToken(token),/substituído/);
  await assert.rejects(tickets.ticketByAccessToken(legacyToken),/substituído/);
  assert.equal((await tickets.ticketByAccessToken(tickets.ticketAccessToken(changed))).id,row.id);
  await assert.rejects(tickets.authorizedTicket(row.id,original),/não encontrada/);
  assert.equal((await tickets.authorizedTicket(row.id,next)).id,row.id);assert.equal((await tickets.authorizedTicket(row.id,buyer)).id,row.id);
  assert.equal((await tickets.authorizedTicket(row.id,next)).runner_name,'Titular Atual');
  assert.equal((await listMyTickets(next)).items[0].participant.name,'Titular Atual');
});
it('UX E2 lista: comprador vê pedido transferido como transferred; novo titular como active',async()=>{
  const original=await newRunner(cpfs[0]);const next=await newRunner(cpfs[2]);
  await query("UPDATE profiles SET full_name='Novo Titular',cpf_validated_at=now(),cpf_lookup_source='cpf_brasil_api' WHERE id=$1",[next]);
  const o=await settled();
  const row=(await tickets.ticketRows(o.id)).find(r=>r.runner_id===original)!;
  await finalizeCheckoutTransfer((await transferRequest(row.id,next)).id);
  const asBuyer=(await listMyTickets(buyer)).items.find((t:any)=>t.registration_id===row.id)!;
  assert.equal(asBuyer.state.group,'transferred');
  assert.deepEqual(asBuyer.relationship,{runner:false,buyer:true});
  assert.equal(asBuyer.ticket.released,true);
  const asRunner=(await listMyTickets(next)).items.find((t:any)=>t.registration_id===row.id)!;
  assert.equal(asRunner.state.group,'active');
  assert.deepEqual(asRunner.relationship,{runner:true,buyer:false});
  assert.equal((await listMyTickets(buyer,{status:'transferred'})).total,1);
  assert.equal((await listMyTickets(buyer,{status:'active'})).items.some((t:any)=>t.registration_id===row.id),false);
  assert.equal((await listMyTickets(original)).items.some((t:any)=>t.registration_id===row.id),false);
  const ev=(await listMyTicketEvents(buyer)).items.find((e:any)=>e.event_id===event)!;
  assert.ok(ev.transferred_count>=1);
});
it('UX E2 núcleo: taxa pendente, ator indevido e categoria incompatível não trocam titular',async()=>{
  const next=await newRunner(cpfs[2]);const o=await settled();const row=(await tickets.ticketRows(o.id))[0];
  const request=await transferRequest(row.id,next,false);
  await assert.rejects(finalizeCheckoutTransfer(request.id),/taxa/);
  await query("UPDATE transfer_requests SET payment_status='paid',requested_by=$2 WHERE id=$1",[request.id,otherBuyer]);
  await assert.rejects(finalizeCheckoutTransfer(request.id),/Solicitante/);
  await query('UPDATE transfer_requests SET requested_by=$2 WHERE id=$1',[request.id,buyer]);
  await query("UPDATE categories SET gender='feminino' WHERE id=$1",[category]);
  await assert.rejects(finalizeCheckoutTransfer(request.id),/requisitos/);assert.equal(await count('checkout_ticket_transfers'),0);
});
it('UX E2 núcleo: segunda solicitação da versão antiga não transfere novamente',async()=>{
  const next=await newRunner(cpfs[2]),later=await newRunner('12345678909');const o=await settled();const row=(await tickets.ticketRows(o.id))[0];
  const first=await transferRequest(row.id,next),second=await transferRequest(row.id,later);
  await finalizeCheckoutTransfer(first.id);await assert.rejects(finalizeCheckoutTransfer(second.id),/Titularidade alterada/);
  assert.equal(await count('checkout_ticket_transfers'),1);
});
it('UX E2 núcleo: ingresso já reembolsado bloqueia transferência e mantém estoque',async()=>{
  const next=await newRunner(cpfs[2]);const o=await settled();const row=(await tickets.ticketRows(o.id))[0];
  const request=await transferRequest(row.id,next);await payments.refund(o.id,row.id,randomUUID(),organizer);
  await assert.rejects(finalizeCheckoutTransfer(request.id),/indisponível/);assert.equal(await count('checkout_ticket_transfers'),0);
  assert.equal(await getVariantRemainingStock(variant,event),9);
});
it('UX E2 núcleo: mensagem antiga não entrega ingresso atual ao atleta anterior',async()=>{
  const original=await newRunner(cpfs[0]),next=await newRunner(cpfs[2]);const o=await settled();
  const w=worker();await w.materialize();const row=(await tickets.ticketRows(o.id)).find(r=>r.runner_id===original);
  const oldJob=(await jobs()).find(j=>j.registration_id===row.id && j.kind==='athlete_confirmation');assert.ok(oldJob);
  const request=await transferRequest(row.id,next);await finalizeCheckoutTransfer(request.id);
  assert.equal(await w.render(oldJob,await tickets.ticketRows(o.id)),null);
  const queued=(await jobs()).filter(j=>j.dedupe_key.startsWith(`transfer:${request.id}`));assert.ok(queued.length);
  const mail=await w.render(queued[0],await tickets.ticketRows(o.id));assert.ok(mail?.html.includes('Novo Atleta'));
});
it('UX E2 núcleo: trava financeira impede conclusão concorrente e libera para repetição segura',async()=>{
  const next=await newRunner(cpfs[2]);const o=await settled();const row=(await tickets.ticketRows(o.id))[0];const request=await transferRequest(row.id,next);
  const lock=await pool.connect();
  try {
    await lock.query('SELECT pg_advisory_lock(hashtextextended($1,817))',[o.id]);
    await assert.rejects(finalizeCheckoutTransfer(request.id),/processamento/);
  } finally {await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,817))',[o.id]);lock.release();}
  await finalizeCheckoutTransfer(request.id);assert.equal(await count('checkout_ticket_transfers'),1);
});
it('UX E2 núcleo: duplicidade de CPF no evento reverte titular, histórico e mensagens',async()=>{
  const next=await newRunner(cpfs[1]);const o=await settled();const row=(await tickets.ticketRows(o.id)).find(r=>r.participant_cpf===cpfs[0]);
  const request=await transferRequest(row.id,next);
  await assert.rejects(finalizeCheckoutTransfer(request.id));
  const same=(await tickets.ticketRows(o.id)).find(r=>r.id===row.id);assert.equal(same.confirmation_code,row.confirmation_code);
  assert.equal(await count('checkout_ticket_transfers'),0);assert.equal((await jobs()).filter(j=>j.dedupe_key.startsWith('transfer:')).length,0);
});
it('UX E2 núcleo: aprovação administrativa preserva exceção de taxa e registra solicitante',async()=>{
  const next=await newRunner(cpfs[2]);const o=await settled();const row=(await tickets.ticketRows(o.id))[0];const request=await transferRequest(row.id,next,false);
  await query("INSERT INTO user_roles VALUES($1,'admin')",[otherBuyer]);
  await query("UPDATE transfer_requests SET status='approved',processed_by=$2 WHERE id=$1",[request.id,otherBuyer]);
  await finalizeCheckoutTransfer(request.id);assert.equal(await count('checkout_ticket_transfers'),1);
});
it('UX E2 núcleo: módulo, prazo e taxa zero seguem as regras persistidas',async()=>{
  const next=await newRunner(cpfs[2]);const o=await settled();const row=(await tickets.ticketRows(o.id))[0];const request=await transferRequest(row.id,next,false);
  await query('UPDATE transfer_requests SET transfer_fee=0 WHERE id=$1',[request.id]);
  await query(`UPDATE system_settings SET enabled_modules=enabled_modules || '{"transfers":false}'::jsonb`);
  await assert.rejects(finalizeCheckoutTransfer(request.id),/evento ou prazo/);
  await query(`UPDATE system_settings SET enabled_modules=enabled_modules || '{"transfers":true}'::jsonb`);
  await query("UPDATE events SET transfer_until='2000-01-01' WHERE id=$1",[event]);
  await assert.rejects(finalizeCheckoutTransfer(request.id),/evento ou prazo/);
  await query('UPDATE events SET transfer_until=NULL WHERE id=$1',[event]);
  await finalizeCheckoutTransfer(request.id);assert.equal(await count('checkout_ticket_transfers'),1);
});
it('resumo único ao comprador; sem e-mail todos os ingressos ficam acessíveis na compra',async()=>{
  await settled();const sent:any[]=[];const w=worker(async m=>{sent.push(m);return true;});
  await w.sweep();await w.sweep();assert.equal(sent.length,1);assert.equal(sent[0].to,'comprador@example.test');
  assert.match(sent[0].html,/Atleta Primeiro/);assert.match(sent[0].html,/Atleta Segundo/);
  assert.match(sent[0].html,/Camiseta: Azul - M/);assert.match(sent[0].html,/Abrir ingresso/);
  assert.match(sent[0].html,/\/registration\/validate\//);
  assert.equal((await tickets.listCheckoutTickets(buyer)).length,2);assert.equal((await jobs())[0].status,'done');
  assert.equal(await getVariantRemainingStock(variant,event),8);
});
it('UX A: conta mista mantém inscrições legadas intactas ao consultar os ingressos de pedidos',async()=>{
  await legacyUxFixtures();
  const legacyBefore=(await query('SELECT * FROM registrations WHERE order_id IS NULL ORDER BY id')).rows;
  assert.equal(legacyBefore.length,4);
  assert.deepEqual(await tickets.listCheckoutTickets(buyer),[]);
  await settled();
  const list=await tickets.listCheckoutTickets(buyer);
  // Caracteriza a separação atual: a futura consulta unificada deverá incluir as quatro legadas.
  assert.equal(list.length,2);
  assert.ok(list.every(t=>t.order_id && t.released));
  assert.equal(new Set(list.map(t=>t.id)).size,2);
  assert.deepEqual((await query('SELECT * FROM registrations WHERE order_id IS NULL ORDER BY id')).rows,legacyBefore);
  assert.equal(await count('registrations'),6);
  assert.equal(await getVariantRemainingStock(variant,event),8);
});
it('UX A: comprador que também é atleta aparece uma vez e preserva inscrição e alocação financeira',async()=>{
  await settled();
  const original=(await regs()).find(r=>r.participant_cpf===cpfs[0]);
  const allocationsBefore=(await query('SELECT * FROM checkout_payment_allocations ORDER BY registration_id')).rows;
  await query('UPDATE profiles SET cpf=$2 WHERE id=$1',[buyer,cpfs[0]]);
  // A alteração de CPF invalida a prova; simular comprovação posterior, como no provedor.
  await query("UPDATE profiles SET cpf_validated_at=now(),cpf_lookup_source='cpf_brasil_api' WHERE id=$1",[buyer]);
  for(let i=0;i<2;i++) {
    const list=await tickets.listCheckoutTickets(buyer);
    assert.equal(list.length,2);
    assert.equal(list.filter(t=>t.id===original.id).length,1);
    assert.ok(list.find(t=>t.id===original.id)!.buyer);
  }
  const linked=(await regs()).find(r=>r.id===original.id);
  assert.equal(linked.runner_id,buyer);
  assert.equal(linked.confirmation_code,original.confirmation_code);
  assert.equal(await count('checkout_identity_links'),1);
  assert.deepEqual((await query('SELECT * FROM checkout_payment_allocations ORDER BY registration_id')).rows,allocationsBefore);
  assert.equal(await getVariantRemainingStock(variant,event),8);
});
it('UX A: ações legadas de pedido seguem bloqueadas por ID e por corpo sem modificar estoque ou registros',async()=>{
  const legacy=await legacyUxFixtures();await settled();
  const r=(await regs()).find(r=>r.order_id);
  const before=(await query('SELECT * FROM registrations ORDER BY id')).rows;
  assert.equal((await fetch(`${baseUrl}/legacy/${r.id}`)).status,200);
  for(const [method,path,body] of [
    ['GET',`/${r.id}/receipt`,undefined],
    ['PUT',`/${r.id}/transfer`,{}],
    ['PUT',`/${r.id}/cancel`,{}],
    ['POST','/transfer-requests',{registration_id:r.id}],
  ] as const) {
    const response=await fetch(`${baseUrl}/legacy${path}`,{method,
      headers:{'Content-Type':'application/json'},body:body ? JSON.stringify(body) : undefined});
    assert.equal(response.status,409);
    assert.match((await response.json() as {error:string}).error,/pedido/);
  }
  // Este harness caracteriza apenas o guard; não substitui testes dos controllers legados.
  assert.equal((await fetch(`${baseUrl}/legacy/${legacy[0].id}/receipt`)).status,200);
  assert.equal((await fetch(`${baseUrl}/legacy/transfer-requests`,{method:'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({registration_id:legacy[0].id})})).status,200);
  assert.deepEqual((await query('SELECT * FROM registrations ORDER BY id')).rows,before);
  assert.equal(await getVariantRemainingStock(variant,event),8);
});
it('UX A: dados de conta de terceiro ficam ocultos ao comprador antes de confirmar, mas não ao próprio atleta',async()=>{
  const runner=await newRunner(cpfs[0]);await reserved();
  const existing=(await regs()).find(r=>r.runner_id===runner);
  const buyerList=await tickets.listCheckoutTickets(buyer);
  const privateTicket=buyerList.find(t=>t.id===existing.id)!;
  assert.equal(privateTicket.runner_name,undefined);
  assert.equal(privateTicket.cpf_masked,undefined);
  assert.equal(privateTicket.custom_fields,undefined);
  assert.ok(buyerList.every(t=>!t.released && !t.confirmation_code));
  const own=await tickets.listCheckoutTickets(runner);
  assert.equal(own.length,1);assert.equal(own[0].runner_name,'Novo Atleta');
  assert.ok((await tickets.listCheckoutTickets(organizer,event)).find(t=>t.id===existing.id)!.runner_name);
  await assert.rejects(tickets.authorizedTicket(existing.id,buyer),/não estiver confirmado/);
});
it('UX A: administrador consulta evento explicitamente sem misturar ingressos operacionais à sua lista pessoal',async()=>{
  await settled();await query("INSERT INTO user_roles VALUES($1,'admin')",[otherBuyer]);
  assert.deepEqual(await tickets.listCheckoutTickets(otherBuyer),[]);
  assert.deepEqual(await tickets.listCheckoutTickets(organizer),[]);
  assert.equal((await tickets.listCheckoutTickets(otherBuyer,event)).length,2);
  const r=(await regs())[0];assert.equal((await tickets.authorizedTicket(r.id,otherBuyer)).id,r.id);
  await assert.rejects(tickets.listCheckoutTickets(buyer,event),/Sem acesso/);
});
it('UX A: retomar a mesma chave não reinclui participante removido nem reescreve escolhas salvas',async()=>{
  const key=randomUUID(),created=await orders.createCheckoutOrder(buyer,event,key);
  const saved=await orders.saveCheckoutOrder(created.id,buyer,created.version,[{participant_id:participants[0],choices:choices()}]);
  const resumed=await orders.createCheckoutOrder(buyer,event,key);
  assert.equal(resumed.id,saved.id);assert.equal(resumed.version,saved.version);
  assert.deepEqual(resumed.items,saved.items);
  const empty=await orders.saveCheckoutOrder(saved.id,buyer,saved.version,[]);
  const again=await orders.createCheckoutOrder(buyer,event,key);
  assert.equal(again.id,empty.id);assert.equal(again.version,empty.version);assert.deepEqual(again.items,[]);
  assert.equal(await count('checkout_orders'),1);assert.equal(await count('registrations'),0);
});
it('contato recebe ingresso e convite de cadastro; resumo não depende do cadastro',async()=>{
  await mailTo(0,'convidado@example.test');await settled();const sent:any[]=[];
  await worker(async m=>{sent.push(m);return true;}).sweep();assert.equal(sent.length,2);
  const personal=sent.find(m=>m.to==='convidado@example.test');assert.match(personal.html,/Completar cadastro/);
  assert.match(personal.html,/Atleta Primeiro/);assert.doesNotMatch(personal.html,/Atleta Segundo/);
  assert.ok((await regs()).every(r=>!r.runner_id));
});
it('contato igual ao comprador evita envio duplicado e mantém convite no resumo',async()=>{
  await mailTo(0,'comprador@example.test');await settled();const sent:any[]=[];
  await worker(async m=>{sent.push(m);return true;}).sweep();assert.equal(sent.length,1);assert.match(sent[0].html,/Completar cadastro/);
});
it('dados e respostas são escapados no HTML e campos preservam seus rótulos',async()=>{
  await query("INSERT INTO kit_products(id,kit_id,name,type) VALUES($1,$2,'Medalha oficial','unique')",[randomUUID(),kit]);
  await query("UPDATE categories SET name='<img src=x onerror=alert(1)>'");
  const field=randomUUID();await query("INSERT INTO category_custom_fields(id,category_id,label,field_type) VALUES($1,$2,'Equipe <nome>','text')",[field,category]);
  const reviewedOrder=await reviewed([0],{custom_field_values:{[field]:'<script>alert(1)</script>'}});
  const o=await orders.reserveCheckoutOrder(reviewedOrder.id,buyer,reviewedOrder.version);
  await payments.start(o.id,buyer,randomUUID(),'PIX');remote[0].status='RECEIVED';await payments.reconcile(o.id,buyer);
  const sent:any[]=[];await worker(async m=>{sent.push(m);return true;}).sweep();
  assert.match(sent[0].html,/&lt;img/);assert.match(sent[0].html,/Equipe &lt;nome&gt;/);assert.doesNotMatch(sent[0].html,/<script>/);
  assert.match(sent[0].html,/Medalha oficial/);
});
it('SMTP ausente mantém fila e nova tentativa envia uma vez',async()=>{
  await settled();await worker(async()=>false).sweep();let job=(await jobs())[0];assert.equal(job.status,'pending');assert.equal(job.attempts,1);
  await query("UPDATE checkout_delivery_jobs SET next_attempt_at=now()");let sent=0;
  await worker(async()=>{sent++;return true;}).sweep();assert.equal(sent,1);assert.equal((await jobs())[0].status,'done');
});
it('falha após início do SMTP fica incerta e exige aceite operacional para reenvio',async()=>{
  await settled();let calls=0;const w=worker(async()=>{calls++;throw new Error('timeout');});
  await w.sweep();await w.sweep();const job=(await jobs())[0];assert.equal(job.status,'unknown');assert.equal(calls,1);
  await assert.rejects(retryCheckoutDelivery(job.id),/possibilidade/);await retryCheckoutDelivery(job.id,true);
  await worker().sweep();assert.equal((await jobs())[0].status,'done');
});
it('trabalhadores concorrentes não duplicam fila nem envio',async()=>{
  await settled();let sent=0;const send=async()=>{sent++;await new Promise(r=>setTimeout(r,20));return true;};
  await Promise.all([worker(send).sweep(),worker(send).sweep()]);assert.equal(sent,1);assert.equal((await jobs()).length,1);
});
it('reembolso antes da entrega suprime confirmação do ingresso cancelado',async()=>{
  const o=await settled();const rows=await regs();const target=rows[0];await payments.refund(o.id,target.id,randomUUID(),organizer);
  const sent:any[]=[];await worker(async m=>{sent.push(m);return true;}).sweep();
  const summary=sent.find(m=>m.subject.includes('confirmadas'));assert.ok(summary);assert.doesNotMatch(summary.html,new RegExp(target.confirmation_code));
  assert.ok(sent.some(m=>m.subject.includes('Reembolso')));await assert.rejects(tickets.authorizedTicket(target.id,buyer),/indisponível/);
  assert.equal(await getVariantRemainingStock(variant,event),9);
});
it('pedido em revisão não libera ingresso nem envia confirmação',async()=>{
  const o=await settled();const w=worker();await w.materialize();await query("UPDATE checkout_orders SET status='needs_review' WHERE id=$1",[o.id]);
  let sent=0;await worker(async()=>{sent++;return true;}).sweep();assert.equal(sent,0);
  assert.ok((await tickets.listCheckoutTickets(buyer)).every(t=>!t.released && !t.confirmation_code));
});
it('vínculo por CPF e nascimento comprovados mantém código, escolhas, estoque e acesso do comprador',async()=>{
  await mailTo(0,'contato-diferente@example.test');await settled();const before=(await regs()).find(r=>r.participant_cpf===cpfs[0]);
  const runner=await newRunner();assert.equal(await tickets.linkVerifiedCheckoutTickets(runner),1);assert.equal(await tickets.linkVerifiedCheckoutTickets(runner),0);
  const after=(await regs()).find(r=>r.id===before.id);assert.equal(after.runner_id,runner);assert.equal(after.confirmation_code,before.confirmation_code);
  assert.equal(await count('registrations'),2);assert.equal(await count('checkout_identity_links'),1);
  assert.equal((await tickets.listCheckoutTickets(runner)).length,1);assert.equal((await tickets.listCheckoutTickets(buyer)).length,2);
  assert.equal(await getVariantRemainingStock(variant,event),8);
});
it('e-mail coincidente e CPF manual não reivindicam ingresso; nascimento divergente também não',async()=>{
  await settled();const manualRunner=await newRunner(cpfs[0],false);assert.equal(await tickets.linkVerifiedCheckoutTickets(manualRunner),0);
  const wrongDate=await newRunner(cpfs[1],true,'1991-01-01');assert.equal(await tickets.linkVerifiedCheckoutTickets(wrongDate),0);
  assert.ok((await regs()).every(r=>!r.runner_id));
});
it('CPF ambíguo em dois perfis não vincula automaticamente',async()=>{
  await settled();const runner=await newRunner();await newRunner();assert.equal(await tickets.linkVerifiedCheckoutTickets(runner),0);
});
it('alteração de identidade invalida prova e API de perfil não aceita forjá-la',async()=>{
  await settled();const runner=await newRunner();await query("UPDATE profiles SET birth_date='1991-01-01' WHERE id=$1",[runner]);
  assert.equal((await query('SELECT cpf_validated_at FROM profiles WHERE id=$1',[runner])).rows[0].cpf_validated_at,null);
  await assert.rejects(updateProfile(runner,{cpf_validated_at:new Date(),cpf_lookup_source:'cpf_brasil_api'} as any),/não permitido/);
  assert.equal(await tickets.linkVerifiedCheckoutTickets(runner),0);
});
it('acesso é limitado ao comprador, corredor e responsável do evento',async()=>{
  await settled();const r=(await regs())[0];await tickets.authorizedTicket(r.id,buyer);await tickets.authorizedTicket(r.id,organizer);
  await assert.rejects(tickets.authorizedTicket(r.id,otherBuyer),/não encontrada/);
  await assert.rejects(tickets.listCheckoutTickets(otherBuyer,event),/Sem acesso/);
  assert.equal((await tickets.listCheckoutTickets(organizer,event)).length,2);
});
it('link assinado funciona sem conta, rejeita token adulterado e deixa de funcionar após reembolso',async()=>{
  const o=await settled();const row=(await tickets.ticketRows(o.id))[0],token=tickets.ticketAccessToken(row);
  assert.equal((await tickets.ticketByAccessToken(token)).id,row.id);
  await assert.rejects(tickets.ticketByAccessToken(token+'x'),/inválido/);
  const wrong=jwt.sign({sub:row.id,aud:'login',iss:'cronoteam'},process.env.JWT_SECRET!);
  await assert.rejects(tickets.ticketByAccessToken(wrong),/inválido/);
  await payments.refund(o.id,row.id,randomUUID(),organizer);await assert.rejects(tickets.ticketByAccessToken(token),/disponível/);
});
it('retirada do kit exige escopo e é idempotente sem nova baixa de estoque',async()=>{
  await settled();const r=(await regs())[0];await assert.rejects(tickets.collectCheckoutKit(r.id,buyer),/Sem acesso/);
  const a=await tickets.collectCheckoutKit(r.id,organizer),b=await tickets.collectCheckoutKit(r.id,organizer);
  assert.equal(String(a.kit_collected_at),String(b.kit_collected_at));assert.equal(await getVariantRemainingStock(variant,event),8);
});
it('comissão de convidado é lançada uma vez e revertida uma vez; bônus usa fila',async()=>{
  const leader=randomUUID();await query('INSERT INTO group_leaders(id,user_id) VALUES($1,$2)',[leader,organizer]);
  await query('UPDATE coupons SET leader_id=$1',[leader]);await query("INSERT INTO leader_event_commissions(id,leader_id,event_id,bonus_type,commission_percentage) VALUES($1,$2,$3,'both',10)",[randomUUID(),leader,event]);
  const o=await settled();let bonuses=0;const w=worker(async()=>true,async()=>{bonuses++;});await w.sweep();await w.sweep();
  assert.equal(await count('leader_commissions'),2);assert.equal(bonuses,2);
  assert.equal(Number((await query('SELECT total_earnings FROM group_leaders')).rows[0].total_earnings),22);
  const r=(await regs())[0];await payments.refund(o.id,r.id,randomUUID(),organizer);await w.sweep();await w.sweep();
  assert.equal(Number((await query('SELECT total_earnings FROM group_leaders')).rows[0].total_earnings),11);
  assert.equal((await query("SELECT count(*)::int n FROM leader_commissions WHERE status='cancelled'")).rows[0].n,1);
  assert.equal(bonuses,3);
});
it('reenvio idempotente só envia à conta de quem solicita; não permite organizador como destinatário',async()=>{
  await settled();const r=(await regs())[0],key=randomUUID(),w=worker();await w.resend(r.id,buyer,key);await w.resend(r.id,buyer,key);
  assert.equal((await jobs()).length,1);assert.equal((await jobs())[0].recipient,'comprador@example.test');
  await assert.rejects(w.resend(r.id,organizer,randomUUID()),/apenas/);
});
it('rotas exigem autenticação e reprocessamento de mensagem exige administrador',async()=>{
  await settled();await worker(async()=>false).sweep();const job=(await jobs())[0];
  assert.equal((await fetch(`${baseUrl}/delivery/mine`)).status,401);
  const token=jwt.sign({userId:buyer,email:'comprador@example.test'},process.env.JWT_SECRET!);
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  assert.equal((await fetch(`${baseUrl}/delivery/messages/${job.id}/retry`,{method:'POST',headers,body:'{}'})).status,403);
  const o=(await regs())[0];const row=(await tickets.ticketRows(o.order_id))[0];
  const access=await fetch(`${baseUrl}/delivery/ticket-access`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:tickets.ticketAccessToken(row)})});
  assert.equal(access.status,200);assert.equal(access.headers.get('cache-control'),'no-store');
});
it('atleta já cadastrado recebe no e-mail da conta sem convite de cadastro',async()=>{
  const runner=await newRunner(cpfs[0]);const o=await settled();const rows=await tickets.ticketRows(o.id);
  assert.equal(rows.find(r=>r.participant_cpf===cpfs[0]).runner_id,runner);
  const sent:any[]=[];await worker(async m=>{sent.push(m);return true;}).sweep();
  const personal=sent.find(m=>m.to==='novo@example.test');assert.ok(personal);assert.doesNotMatch(personal.html,/Completar cadastro/);
  assert.equal((await tickets.listCheckoutTickets(runner)).length,1);
});
it('reembolso integral antes da entrega não envia confirmação antiga',async()=>{
  const o=await settled();for(const row of await regs()) await payments.refund(o.id,row.id,randomUUID(),organizer);
  const sent:any[]=[];await worker(async m=>{sent.push(m);return true;}).sweep();
  assert.equal(sent.length,2);assert.ok(sent.every(m=>m.subject.includes('Reembolso')));
  assert.equal((await tickets.listCheckoutTickets(buyer)).filter(t=>t.released).length,0);
});
it('falha de bônus é recuperável e não duplica comissão financeira',async()=>{
  const leader=randomUUID();await query('INSERT INTO group_leaders(id,user_id) VALUES($1,$2)',[leader,organizer]);
  await query('UPDATE coupons SET leader_id=$1',[leader]);await query("INSERT INTO leader_event_commissions(id,leader_id,event_id,bonus_type,commission_percentage) VALUES($1,$2,$3,'both',10)",[randomUUID(),leader,event]);
  await settled();await worker(async()=>true,async()=>{throw new Error('domínio indisponível');}).sweep();
  assert.equal((await jobs()).filter(j=>j.kind==='bonus' && j.status==='pending').length,2);
  await query("UPDATE checkout_delivery_jobs SET next_attempt_at=now() WHERE kind='bonus'");let calls=0;
  await worker(async()=>true,async()=>{calls++;}).sweep();assert.equal(calls,2);assert.equal(await count('leader_commissions'),2);
  const {getCanonicalPaidRegistrationIds}=await import('../src/services/invitationBonusCanonicalCore.js');
  assert.equal((await getCanonicalPaidRegistrationIds(leader,event,'GRUPO')).length,2);
});
it('falha financeira reverte fila e deixa efeito pendente para nova tentativa',async()=>{
  const leader=randomUUID();await query('INSERT INTO group_leaders(id,user_id) VALUES($1,$2)',[leader,organizer]);
  await query('UPDATE coupons SET leader_id=$1',[leader]);await query("INSERT INTO leader_event_commissions(id,leader_id,event_id,bonus_type,commission_percentage) VALUES($1,$2,$3,'commission',10)",[randomUUID(),leader,event]);
  await settled();await query(`CREATE FUNCTION reject_test_commission() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'falha simulada'; END; $$;
    CREATE TRIGGER reject_test_commission BEFORE INSERT ON leader_commissions FOR EACH ROW EXECUTE FUNCTION reject_test_commission()`);
  try{await worker().materialize();assert.equal(await count('checkout_delivery_jobs'),0);assert.equal(await count('leader_commissions'),0);
    assert.equal((await query('SELECT count(*)::int n FROM checkout_payment_effects WHERE processed_at IS NULL')).rows[0].n,2);
  }finally{await query('DROP TRIGGER reject_test_commission ON leader_commissions; DROP FUNCTION reject_test_commission()');}
  await worker().sweep();assert.equal(await count('leader_commissions'),2);
});
it('mensagem interrompida fica incerta após recuperação, sem envio automático',async()=>{
  await settled();const w=worker();await w.materialize();await query("UPDATE checkout_delivery_jobs SET status='sending',claimed_at=now()-interval '20 minutes'");
  let sent=0;await worker(async()=>{sent++;return true;}).sweep();assert.equal(sent,0);assert.equal((await jobs())[0].status,'unknown');
});
it('kit entregue permanece consumindo estoque após reembolso até devolução física confirmada',async()=>{
  await query('UPDATE product_variants SET available_quantity=2');const o=await settled(),r=(await regs())[0];
  await tickets.collectCheckoutKit(r.id,organizer);await payments.refund(o.id,r.id,randomUUID(),organizer);
  assert.equal(await getVariantRemainingStock(variant,event),0);
  await assert.rejects(reviewed([2]),/Estoque insuficiente/);
  await assert.rejects(withTransaction(async()=>{
    const inserted=(await query(`INSERT INTO registrations(event_id,runner_id,registered_by,category_id,kit_id,status)
      VALUES($1,$2,$3,$4,$5,'pending') RETURNING id`,[event,otherBuyer,buyer,category,kit])).rows[0];
    await query(`INSERT INTO registration_product_selections(registration_id,product_id,variant_id,attribute_name,attribute_value)
      VALUES($1,$2,$3,'Variante','Azul - M')`,[inserted.id,product,variant]);
  }),/Estoque/);
  await assert.rejects(tickets.returnCheckoutKit(r.id,buyer),/Sem acesso/);
  const returned=await tickets.returnCheckoutKit(r.id,organizer);assert.ok(returned.kit_returned_at);
  await tickets.returnCheckoutKit(r.id,organizer);assert.equal(await getVariantRemainingStock(variant,event),1);
  const next=await reviewed([2]);await orders.reserveCheckoutOrder(next.id,buyer,next.version);assert.equal(await getVariantRemainingStock(variant,event),0);
});


it('UX E4: comprovante responde apenas ao titular atual ou gestor autorizado e exige ingresso válido',async()=>{
  const id=randomUUID();
  await query(`INSERT INTO registrations(id,event_id,runner_id,registered_by,category_id,status,payment_status,total_amount,confirmation_code)
    VALUES ($1,$2,$3,$3,$4,'confirmed','paid',100,'LEGACY-RECEIPT')`,[id,event,buyer,category]);
  const read=(user?:string)=>fetch(`${baseUrl}/receipts/${id}`,{headers:user?{Authorization:`Bearer ${jwt.sign({userId:user},process.env.JWT_SECRET!)}`}:{},signal:AbortSignal.timeout(5000)});
  assert.equal((await read()).status,401);
  assert.equal((await read(otherBuyer)).status,403);
  let response=await read(buyer);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal((await response.json()).data.confirmation_code,'LEGACY-RECEIPT');
  await query("INSERT INTO user_roles VALUES ($1,'organizer'),($2,'organizer')",[organizer,otherBuyer]);
  assert.equal((await read(organizer)).status,200);assert.equal((await read(otherBuyer)).status,403);
  for(const [status,payment] of [['cancelled','paid'],['refunded','refunded'],['pending','pending'],['confirmed','partially_paid']]) {
    await query('UPDATE registrations SET status=$2,payment_status=$3 WHERE id=$1',[id,status,payment]);
    assert.equal((await read(buyer)).status,409);
  }
  await query("UPDATE registrations SET status='confirmed',payment_status='convidado' WHERE id=$1",[id]);
  assert.equal((await read(buyer)).status,200);
  await query("UPDATE registrations SET status='transferred',payment_status='paid',runner_id=$2 WHERE id=$1",[id,otherBuyer]);
  assert.equal((await read(buyer)).status,403);
  assert.equal((await (await fetch(`${baseUrl}/validation/${id}`)).json()).data.ticket_available,true);
  response=await read(otherBuyer);assert.equal(response.status,200);assert.equal((await response.json()).data.payment_status,'transferred');
  await query('UPDATE registrations SET transferred_to_registration_id=$2 WHERE id=$1',[id,randomUUID()]);
  assert.equal((await read(otherBuyer)).status,409);
  assert.equal((await (await fetch(`${baseUrl}/validation/${id}`)).json()).data.ticket_available,false);
});

it('UX admin lista única: detalhe operacional pendente exige gestão do evento e não libera ingresso',async()=>{
  const review=await reviewed([0]);const reserved=await orders.reserveCheckoutOrder(review.id,buyer,review.version);
  const id=reserved.items[0].registration_id!;
  const read=(actor?:string)=>fetch(`${baseUrl}/delivery/tickets/${id}/manage`,{headers:actor?{Authorization:`Bearer ${jwt.sign({userId:actor},process.env.JWT_SECRET!)}`}:{}});
  assert.equal((await read()).status,401);assert.equal((await read(buyer)).status,404);assert.equal((await read(otherBuyer)).status,404);
  let response=await read(organizer);assert.equal(response.status,200);
  let detail=(await response.json()).data;assert.equal(detail.id,id);assert.equal(detail.order_id,reserved.id);assert.equal(detail.released,false);assert.equal(detail.confirmation_code,null);
  await query("INSERT INTO user_roles VALUES ($1,'admin')",[otherBuyer]);
  assert.equal((await read(otherBuyer)).status,200);
  await orders.cancelCheckoutOrder(reserved.id,buyer);
  response=await read(organizer);detail=(await response.json()).data;
  assert.equal(detail.status,'cancelled');assert.equal(detail.released,false);assert.equal(detail.confirmation_code,null);
});
