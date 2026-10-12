import { before, beforeEach, after, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { Server } from 'node:http';

const url=new URL(process.env.ORDERS_TEST_DATABASE_URL || 'http://missing');
if(!['postgres:','postgresql:'].includes(url.protocol) || url.hostname!=='127.0.0.1' || url.pathname!=='/cronoteam_stage4_test') {
  throw new Error('Informe ORDERS_TEST_DATABASE_URL para PostgreSQL descartável local cronoteam_stage4_test.');
}
Object.assign(process.env,{POSTGRES_HOST:url.hostname,POSTGRES_PORT:url.port,POSTGRES_DB:url.pathname.slice(1),
  POSTGRES_USER:decodeURIComponent(url.username),POSTGRES_PASSWORD:decodeURIComponent(url.password),NODE_ENV:'test',
  JWT_SECRET:'orders-isolated-test-secret',MULTI_REGISTRATION_CHECKOUT_ENABLED:'true',LOG_SQL_ALL:'false'});
const {default:pool,query,withTransaction}=await import('../src/config/database.js');
const orders=await import('../src/services/checkoutOrdersService.js');
const {createParticipantsService}=await import('../src/services/checkoutParticipantsService.js');
const {getVariantRemainingStock}=await import('../src/services/registrationsService.js');
const {cancelExpiredRegistrations}=await import('../src/services/expiredRegistrationsService.js');
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
  await query(`ALTER TABLE events ADD COLUMN status text DEFAULT 'published', ADD COLUMN event_date timestamptz DEFAULT now()+interval '30 days',
      ADD COLUMN registration_status text DEFAULT 'open', ADD COLUMN registration_auto_mode boolean DEFAULT false,
      ADD COLUMN registration_start_date timestamptz, ADD COLUMN registration_end_date timestamptz;
    ALTER TABLE modalities ADD COLUMN name text DEFAULT '5 km';
    ALTER TABLE event_kits ADD COLUMN name text DEFAULT 'Kit básico', ADD COLUMN deleted_at timestamptz, ADD COLUMN is_visible boolean DEFAULT true;
    ALTER TABLE registrations ADD COLUMN created_at timestamptz DEFAULT now(), ADD COLUMN asaas_payment_id text;
    CREATE TABLE kit_categories(kit_id uuid REFERENCES event_kits, category_id uuid REFERENCES categories);`);
  for(const file of ['118_registration_inventory_guards.sql','119_checkout_participants.sql','120_checkout_orders.sql']) {
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

it('UX B: criação concorrente inclui o comprador uma única vez e sem reservar estoque',async()=> {
  await query('UPDATE profiles SET cpf=$2 WHERE id=$1',[buyer,cpfs[0]]);
  const key=randomUUID();
  const [a,b]=await Promise.all([orders.createCheckoutOrder(buyer,event,key,true),orders.createCheckoutOrder(buyer,event,key,true)]);
  assert.equal(a.id,b.id);assert.equal(a.items.length,1);assert.equal(b.items.length,1);
  assert.equal(a.buyer.participant_id,a.items[0].participant_id);assert.equal(a.buyer.full_name,'Comprador Teste');
  assert.equal(a.buyer.email,'comprador@example.test');assert.equal(a.buyer.status,'ready');
  assert.equal(await count('registrations'),0);assert.equal(await getVariantRemainingStock(variant,event),10);
});
it('UX B: remoção e rascunho antigo vazio nunca provocam reinclusão automática',async()=> {
  await query('UPDATE profiles SET cpf=$2 WHERE id=$1',[buyer,cpfs[0]]);
  const key=randomUUID(),a=await orders.createCheckoutOrder(buyer,event,key,true);
  await orders.saveCheckoutOrder(a.id,buyer,a.version,[]);
  assert.equal((await orders.createCheckoutOrder(buyer,event,key,true)).items.length,0);
  const oldKey=randomUUID(),old=await orders.createCheckoutOrder(buyer,event,oldKey);
  assert.equal((await orders.createCheckoutOrder(buyer,event,oldKey,true)).id,old.id);
  assert.equal((await orders.getCheckoutOrder(old.id,buyer)).items.length,0);
});
it('UX B: inclusão explícita preserva terceiros, respeita versão e não duplica comprador',async()=> {
  await query('UPDATE profiles SET cpf=$2 WHERE id=$1',[buyer,cpfs[0]]);
  const a=await draft([1]);
  const next=await orders.addCheckoutBuyer(a.id,buyer,a.version);
  assert.equal(next.items.length,2);assert.deepEqual(next.items[0].choices,a.items[0].choices);
  assert.equal(next.buyer.participant_id,next.items[1].participant_id);
  assert.equal((await orders.addCheckoutBuyer(next.id,buyer,next.version)).items.length,2);
  await assert.rejects(orders.addCheckoutBuyer(next.id,buyer,a.version),/alterado/);
  await assert.rejects(orders.addCheckoutBuyer(next.id,otherBuyer,next.version),/não encontrado/);
});
it('UX B: perfil incompleto pode comprar para terceiros sem inscrição própria automática',async()=> {
  const a=await orders.createCheckoutOrder(buyer,event,randomUUID(),true);
  assert.equal(a.buyer.status,'incomplete');assert.equal(a.items.length,0);
  assert.deepEqual(a.buyer.issues.map(i=>i.field),['cpf']);
  const saved=await orders.saveCheckoutOrder(a.id,buyer,a.version,[{participant_id:participants[1],choices:choices()}]);
  assert.equal((await orders.reviewCheckoutOrder(a.id,buyer,saved.version)).total_cents,12000);
  await assert.rejects(orders.addCheckoutBuyer(a.id,buyer,saved.version+1),/perfil/);
});
it('UX B: renovação da identidade do comprador preserva escolhas e invalida revisão anterior',async()=> {
  await query('UPDATE profiles SET cpf=$2 WHERE id=$1',[buyer,cpfs[0]]);
  const order=await orders.createCheckoutOrder(buyer,event,randomUUID(),true);
  const saved=await orders.saveCheckoutOrder(order.id,buyer,order.version,[{participant_id:order.buyer.participant_id!,choices:choices()}]);
  await query("UPDATE checkout_participants SET expires_at=now()-interval '1 minute' WHERE id=$1",[order.buyer.participant_id]);
  const renewed=await orders.addCheckoutBuyer(order.id,buyer,saved.version);
  assert.equal(renewed.items.length,1);assert.deepEqual(renewed.items[0].choices,saved.items[0].choices);
  assert.equal(renewed.version,saved.version+1);
  assert.ok((await orders.reviewCheckoutOrder(order.id,buyer,renewed.version)).total_cents>0);
});
it('UX B: CPF ambíguo e inscrição preexistente não impedem comprar para outros',async()=> {
  await query('UPDATE profiles SET cpf=$1',[cpfs[0]]);
  const ambiguous=await orders.createCheckoutOrder(buyer,event,randomUUID(),true);
  assert.equal(ambiguous.buyer.status,'ambiguous');assert.equal(ambiguous.items.length,0);
  await query('UPDATE profiles SET cpf=NULL WHERE id=$1',[otherBuyer]);
  await query("INSERT INTO registrations(event_id,runner_id,registered_by,status,payment_status) VALUES($1,$2,$2,'confirmed','paid')",[event,buyer]);
  const existing=await orders.createCheckoutOrder(buyer,event,randomUUID(),true);
  assert.equal(existing.buyer.status,'already_registered');assert.equal(existing.items.length,0);
  const saved=await orders.saveCheckoutOrder(existing.id,buyer,existing.version,[{participant_id:participants[1],choices:choices()}]);
  assert.equal((await orders.reviewCheckoutOrder(saved.id,buyer,saved.version)).items.length,1);
});
it('UX B: API não aceita escolher outro comprador e mantém proteção de autenticação',async()=> {
  await query('UPDATE profiles SET cpf=$2 WHERE id=$1',[buyer,cpfs[0]]);
  const token=jwt.sign({userId:buyer,email:'comprador@example.test'},process.env.JWT_SECRET!);
  const headers={'Content-Type':'application/json',Authorization:`Bearer ${token}`};
  const payload={event_id:event,request_key:randomUUID(),include_buyer:true};
  assert.equal((await fetch(`${baseUrl}/orders`,{method:'POST',headers,body:JSON.stringify({...payload,buyer_id:otherBuyer})})).status,400);
  const response=await fetch(`${baseUrl}/orders`,{method:'POST',headers,body:JSON.stringify(payload)});
  assert.equal(response.status,200);
  const body=await response.json() as any;assert.equal(body.data.buyer.full_name,'Comprador Teste');
  assert.equal((await fetch(`${baseUrl}/orders/${body.data.id}/buyer`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:1})})).status,401);
});

it('criação idempotente e edição/remover participantes invalidam revisão sem reservar',async()=> {
  const key=randomUUID();
  const [a,b]=await Promise.all([orders.createCheckoutOrder(buyer,event,key),orders.createCheckoutOrder(buyer,event,key)]);
  assert.equal(a.id,b.id);assert.equal(await count('checkout_orders'),1);
  const saved=await orders.saveCheckoutOrder(a.id,buyer,a.version,[{participant_id:participants[0],choices:choices()}]);
  const review=await orders.reviewCheckoutOrder(a.id,buyer,saved.version);
  assert.equal(review.total_cents,12000);assert.equal(await count('registrations'),0);
  await assert.rejects(orders.saveCheckoutOrder(a.id,buyer,saved.version,[]),/alterado/);
  const empty=await orders.saveCheckoutOrder(a.id,buyer,review.version,[]);
  assert.equal(empty.status,'draft');assert.equal(empty.total_cents,0);assert.equal(empty.items.length,0);
});
it('grupo de convidados gera inscrições distintas, uma reserva por variante e total em centavos',async()=> {
  const review=await reviewed();const reserved=await orders.reserveCheckoutOrder(review.id,buyer,review.version);
  assert.equal(reserved.total_cents,24000);assert.equal(reserved.status,'reserved');
  const regs=(await query('SELECT * FROM registrations ORDER BY participant_cpf')).rows;
  assert.equal(regs.length,2);assert.ok(regs.every(r=>r.runner_id===null && r.registered_by===buyer && r.status==='pending'));
  assert.equal(new Set(regs.map(r=>r.confirmation_code)).size,2);
  assert.equal(await count('users'),2);assert.equal(await count('registration_product_selections'),4);
  assert.equal(await getVariantRemainingStock(variant,event),8);
  const retry=await orders.reserveCheckoutOrder(review.id,buyer,review.version);
  assert.deepEqual(retry.items.map(i=>i.registration_id),reserved.items.map(i=>i.registration_id));
  assert.equal(await count('registrations'),2);
});
it('voltar da reserva à revisão libera estoque e permite reservar de novo',async()=> {
  const review=await reviewed();
  const reserved=await orders.reserveCheckoutOrder(review.id,buyer,review.version);
  assert.equal(await getVariantRemainingStock(variant,event),8);
  const back=await orders.unreserveCheckoutOrder(reserved.id,buyer);
  assert.equal(back.status,'reviewed');
  assert.ok(back.review_expires_at);
  assert.equal(back.reservation_expires_at,null);
  assert.ok(back.items.every(i=>!i.registration_id));
  assert.equal((await query("SELECT COUNT(*)::int AS n FROM registrations WHERE status='pending'")).rows[0].n,0);
  assert.equal(await getVariantRemainingStock(variant,event),10);
  const again=await orders.reserveCheckoutOrder(back.id,buyer,back.version);
  assert.equal(again.status,'reserved');
  assert.equal(await getVariantRemainingStock(variant,event),8);
  // Segunda volta: inscrições canceladas da ida anterior não podem bloquear a conciliação.
  const backAgain=await orders.unreserveCheckoutOrder(again.id,buyer);
  assert.equal(backAgain.status,'reviewed');
  assert.equal(await getVariantRemainingStock(variant,event),10);
});
it('conta existente usa runner correto sem expor identidade ou contato ao comprador',async()=> {
  const runner=randomUUID();await query("INSERT INTO users VALUES ($1,'privado@example.test')",[runner]);
  await query("INSERT INTO profiles(id,cpf,full_name,birth_date,gender) VALUES ($1,$2,'Nome Privado','1990-01-01','M')",[runner,cpfs[0]]);
  const review=await reviewed([0,1]);
  assert.equal(review.items[0].participant?.registered,true);
  assert.equal('full_name' in review.items[0].participant!,false);
  assert.equal('email' in review.items[0].participant!,false);
  assert.equal(JSON.stringify(review).includes('Nome Privado'),false);
  const reserved=await orders.reserveCheckoutOrder(review.id,buyer,review.version);
  assert.equal((await query('SELECT runner_id FROM registrations WHERE id=$1',[reserved.items[0].registration_id])).rows[0].runner_id,runner);
});
it('demanda agregada de variante insuficiente impede reservar qualquer item',async()=> {
  const review=await reviewed();await query('UPDATE product_variants SET available_quantity=1');
  await assert.rejects(orders.reserveCheckoutOrder(review.id,buyer,review.version),/Estoque insuficiente/);
  assert.equal(await count('registrations'),0);assert.equal(await count('registration_product_selections'),0);
});
it('capacidade de categoria/modalidade considera o grupo inteiro',async()=> {
  const order=await draft();await query('UPDATE categories SET max_participants=1');
  await assert.rejects(orders.reviewCheckoutOrder(order.id,buyer,order.version),/categoria/);
  await query('UPDATE categories SET max_participants=10');await query('UPDATE modalities SET max_participants=1');
  await assert.rejects(orders.reviewCheckoutOrder(order.id,buyer,order.version),/modalidade/);
  assert.equal(await count('registrations'),0);
});
it('cupom aplica por item, limite é agregado e cancelar devolve usos uma vez',async()=> {
  const order=await draft([0,1],{coupon_code:'GRUPO'});await query('UPDATE coupons SET max_uses=1');
  await assert.rejects(orders.reviewCheckoutOrder(order.id,buyer,order.version),/cupom não possui usos/);
  await query('UPDATE coupons SET max_uses=10');
  const review=await orders.reviewCheckoutOrder(order.id,buyer,order.version);
  assert.equal(review.total_cents,22000);
  await orders.reserveCheckoutOrder(review.id,buyer,review.version);
  assert.equal((await query('SELECT current_uses FROM coupons')).rows[0].current_uses,2);
  await orders.cancelCheckoutOrder(review.id,buyer);await orders.cancelCheckoutOrder(review.id,buyer);
  assert.equal((await query('SELECT current_uses FROM coupons')).rows[0].current_uses,0);
  assert.equal(await getVariantRemainingStock(variant,event),10);
});
it('alteração de preço exige nova revisão sem criar inscrições nem consumir cupom',async()=> {
  const review=await reviewed([0,1],{coupon_code:'GRUPO'});await query('UPDATE categories SET price=101');
  await assert.rejects(orders.reserveCheckoutOrder(review.id,buyer,review.version),/Revise o pedido novamente/);
  assert.equal(await count('registrations'),0);assert.equal((await query('SELECT current_uses FROM coupons')).rows[0].current_uses,0);
  const next=await orders.reviewCheckoutOrder(review.id,buyer,review.version);assert.equal(next.total_cents,22200);
  await orders.reserveCheckoutOrder(next.id,buyer,next.version);
});
it('falha no segundo INSERT reverte primeiro item, escolhas, cupom e estado do pedido',async()=> {
  const review=await reviewed([0,1],{coupon_code:'GRUPO'});
  await query(`CREATE FUNCTION fail_second_order_item() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.participant_cpf='16899535009' THEN RAISE EXCEPTION 'falha injetada'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_second BEFORE INSERT ON registrations FOR EACH ROW EXECUTE FUNCTION fail_second_order_item();`);
  try {await assert.rejects(orders.reserveCheckoutOrder(review.id,buyer,review.version),/falha injetada/);}
  finally {await query('DROP TRIGGER fail_second ON registrations; DROP FUNCTION fail_second_order_item()');}
  assert.equal(await count('registrations'),0);assert.equal(await count('registration_product_selections'),0);
  assert.equal((await query('SELECT current_uses FROM coupons')).rows[0].current_uses,0);
  assert.equal((await orders.getCheckoutOrder(review.id,buyer)).status,'reviewed');
});
it('dois pedidos concorrentes pela última unidade permitem apenas um grupo',async()=> {
  const a=await reviewed([0]),b=await reviewed([1]);await query('UPDATE product_variants SET available_quantity=1');
  const results=await Promise.allSettled([orders.reserveCheckoutOrder(a.id,buyer,a.version),orders.reserveCheckoutOrder(b.id,buyer,b.version)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(await count('registrations'),1);
});
it('mesmo CPF sem conta não pode ocupar dois pedidos de compradores diferentes',async()=> {
  const a=await reviewed([0]);const p=await manual.prepare(otherBuyer,{event_id:event,cpf:cpfs[0],birth_date:'1990-01-01'});
  await manual.complete(p.id,otherBuyer,{full_name:'Atleta Primeiro',gender:'M',delivery_mode:'buyer'});
  const b=await orders.createCheckoutOrder(otherBuyer,event,randomUUID());
  const saved=await orders.saveCheckoutOrder(b.id,otherBuyer,b.version,[{participant_id:p.id,choices:choices()}]);
  const reviewedB=await orders.reviewCheckoutOrder(b.id,otherBuyer,saved.version);
  const results=await Promise.allSettled([orders.reserveCheckoutOrder(a.id,buyer,a.version),orders.reserveCheckoutOrder(b.id,otherBuyer,reviewedB.version)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(await count('registrations'),1);
});
it('migração impede checkout legado de duplicar CPF de participante sem conta',async()=> {
  const a=await reviewed([0]);await orders.reserveCheckoutOrder(a.id,buyer,a.version);
  const runner=randomUUID();await query("INSERT INTO users VALUES ($1,'novo@example.test')",[runner]);
  await query("INSERT INTO profiles(id,cpf,full_name) VALUES ($1,$2,'Nova Conta')",[runner,cpfs[0]]);
  await assert.rejects(query(`INSERT INTO registrations(event_id,runner_id,category_id,status) VALUES ($1,$2,$3,'pending')`,[event,runner,category]),/já possui inscrição/);
  assert.equal(await count('registrations'),1);
});
it('expiração cancela todo grupo e restaura saldo sem duplicar devolução',async()=> {
  const a=await reviewed([0,1],{coupon_code:'GRUPO'});await orders.reserveCheckoutOrder(a.id,buyer,a.version);
  await query("UPDATE checkout_orders SET reservation_expires_at=now()-interval '1 second'");
  await orders.expireCheckoutOrders();await orders.expireCheckoutOrders();
  const result=await orders.getCheckoutOrder(a.id,buyer);assert.equal(result.status,'expired');
  assert.ok((await query('SELECT status FROM registrations')).rows.every(r=>r.status==='cancelled'));
  assert.equal(await getVariantRemainingStock(variant,event),10);
  assert.equal((await query('SELECT current_uses FROM coupons')).rows[0].current_uses,0);
});
it('operações individuais antigas não podem acessar ou alterar itens do grupo',async()=> {
  const a=await reviewed([0]);const reserved=await orders.reserveCheckoutOrder(a.id,buyer,a.version);
  const id=reserved.items[0].registration_id;
  await assert.rejects(query("UPDATE registrations SET status='confirmed' WHERE id=$1",[id]),/gerenciada pelo pedido/);
  await assert.rejects(query('DELETE FROM registration_product_selections WHERE registration_id=$1',[id]),/gerenciadas pelo pedido/);
  const response=await fetch(`${baseUrl}/legacy/${id}`);assert.equal(response.status,200);
  const previewAllowed=await fetch(`${baseUrl}/legacy/${id}/preview-edit`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  assert.notEqual(previewAllowed.status,409);
  const kitCtx=await fetch(`${baseUrl}/legacy/${id}/editable-kit-context`);
  assert.notEqual(kitCtx.status,409);
  const validateAllowed=await fetch(`${baseUrl}/legacy/${id}/validate`);
  assert.equal(validateAllowed.status,200);
  const blocked=await fetch(`${baseUrl}/legacy/${id}/generate-payment`,{method:'POST'});assert.equal(blocked.status,409);
});
it('taxa e desconto por idade são calculados por item, inclusive para atleta sem conta',async()=> {
  await query(`UPDATE system_settings SET enabled_modules='{"platform_fees":true,"senior_discount_60_plus":true}',
    platform_fee=5,platform_fee_type='fixed'`);
  await query("UPDATE checkout_participants SET birth_date='1940-01-01' WHERE id=$1",[participants[0]]);
  try {
    const a=await reviewed([0,1]);
    assert.equal(a.items[0].pricing?.seniorDiscount,60);
    assert.equal(a.items[0].pricing?.total,65);
    assert.equal(a.items[1].pricing?.total,125);
    assert.equal(a.total_cents,19000);
  } finally {await query(`UPDATE system_settings SET enabled_modules='{"platform_fees":true,"senior_discount_60_plus":false}',platform_fee=0`);}
});
it('kit oculto, escolha incompatível e revisão vencida não criam reservas',async()=> {
  const a=await draft([0]);await query('UPDATE event_kits SET is_visible=false');
  await assert.rejects(orders.reviewCheckoutOrder(a.id,buyer,a.version),/Kit indisponível/);
  await query('UPDATE event_kits SET is_visible=true');
  const review=await orders.reviewCheckoutOrder(a.id,buyer,a.version);
  await query("UPDATE checkout_orders SET review_expires_at=now()-interval '1 second'");
  await assert.rejects(orders.reserveCheckoutOrder(a.id,buyer,review.version),/Revise o pedido/);
  assert.equal(await count('registrations'),0);
});
it('isolamento do comprador, versão e participantes repetidos são conferidos',async()=> {
  const a=await draft([0]);await assert.rejects(orders.getCheckoutOrder(a.id,otherBuyer),/não encontrado/);
  await assert.rejects(orders.saveCheckoutOrder(a.id,buyer,a.version,[{participant_id:participants[0],choices:choices()},{participant_id:participants[0],choices:choices()}]),/diferentes/);
  const other=await orders.createCheckoutOrder(otherBuyer,event,randomUUID());
  await assert.rejects(orders.saveCheckoutOrder(other.id,otherBuyer,other.version,[{participant_id:participants[0],choices:choices()}]),/Participante inválido/);
});
it('API fica desabilitada por padrão, exige autenticação e rejeita preços enviados',async()=> {
  delete process.env.MULTI_REGISTRATION_CHECKOUT_ENABLED;
  try {assert.equal((await fetch(`${baseUrl}/orders`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,503);}
  finally {process.env.MULTI_REGISTRATION_CHECKOUT_ENABLED='true';}
  assert.equal((await fetch(`${baseUrl}/orders`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
  const token=jwt.sign({userId:buyer,email:'comprador@example.test'},process.env.JWT_SECRET!);
  const response=await fetch(`${baseUrl}/orders`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
    body:JSON.stringify({event_id:event,request_key:randomUUID(),total_amount:0})});
  assert.equal(response.status,400);
});
it('expirador legado ignora o grupo e limpeza de reservas funciona com novas compras desativadas',async()=> {
  const review=await reviewed([0,1],{coupon_code:'GRUPO'});await orders.reserveCheckoutOrder(review.id,buyer,review.version);
  await withTransaction(async()=> {
    await query("SELECT set_config('cronoteam.order_write',$1,true)",[review.id]);
    await query("UPDATE registrations SET created_at=now()-interval '1 hour' WHERE order_id=$1",[review.id]);
  });
  assert.equal(await cancelExpiredRegistrations(20),0);
  assert.ok((await query('SELECT status FROM registrations')).rows.every(r=>r.status==='pending'));
  await query("UPDATE checkout_orders SET reservation_expires_at=now()-interval '1 second'");
  delete process.env.MULTI_REGISTRATION_CHECKOUT_ENABLED;
  try {await orders.expireCheckoutOrders();}
  finally {process.env.MULTI_REGISTRATION_CHECKOUT_ENABLED='true';}
  assert.equal((await orders.getCheckoutOrder(review.id,buyer)).status,'expired');
});

it('UX inscrição própria: pendências específicas e retomada após correção sem recriar pedido',async()=>{
  await query("UPDATE profiles SET cpf='00000000003',full_name='Ana',birth_date=NULL,gender=NULL WHERE id=$1",[buyer]);
  const order=await orders.createCheckoutOrder(buyer,event,randomUUID(),true);
  assert.deepEqual(order.buyer.issues.map(i=>i.field),['cpf','full_name','birth_date','gender']);
  assert.equal(order.items.length,0);
  await query("UPDATE profiles SET cpf=$2,full_name='Ana Corredora',birth_date='1990-01-01',gender='F' WHERE id=$1",[buyer,cpfs[0]]);
  const refreshed=await orders.getCheckoutOrder(order.id,buyer);
  assert.equal(refreshed.buyer.status,'ready');assert.equal(refreshed.items.length,0);
  const included=await orders.addCheckoutBuyer(order.id,buyer,refreshed.version);
  assert.equal(included.items.length,1);assert.equal(included.id,order.id);
  const saved=await orders.saveCheckoutOrder(order.id,buyer,included.version,[{participant_id:included.buyer.participant_id!,choices:choices()}]);
  const reviewed=await orders.reviewCheckoutOrder(order.id,buyer,saved.version);
  assert.equal(reviewed.items.length,1);assert.ok(reviewed.total_cents>0);
  const reserved=await orders.reserveCheckoutOrder(order.id,buyer,reviewed.version);
  const rows=(await query('SELECT runner_id,registered_by FROM registrations WHERE order_id=$1',[reserved.id])).rows;
  assert.equal(rows.length,1);assert.equal(rows[0].runner_id,buyer);assert.equal(rows[0].registered_by,buyer);
});
