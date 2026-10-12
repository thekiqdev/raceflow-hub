import { before, beforeEach, after, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { CpfBrasilCallResult } from '../src/services/cpfBrasilClient.js';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { Server } from 'node:http';

const url = new URL(process.env.PARTICIPANTS_TEST_DATABASE_URL || 'http://missing');
if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' || url.pathname !== '/cronoteam_stage3_test') {
  throw new Error('Defina PARTICIPANTS_TEST_DATABASE_URL para o banco descartável local cronoteam_stage3_test.');
}
Object.assign(process.env,{POSTGRES_HOST:url.hostname,POSTGRES_PORT:url.port,POSTGRES_DB:url.pathname.slice(1),
  POSTGRES_USER:decodeURIComponent(url.username),POSTGRES_PASSWORD:decodeURIComponent(url.password),
  NODE_ENV:'test',JWT_SECRET:'participants-test-only-secret',LOG_SQL_ALL:'false'});
const { default:pool,query } = await import('../src/config/database.js');
const { createParticipantsService,checkParticipantCpf } = await import('../src/services/checkoutParticipantsService.js');
const { default:router } = await import('../src/routes/checkoutParticipants.js');
const { errorHandler } = await import('../src/middleware/errorHandler.js');
const cpf='52998224725', birthday='1990-05-20';
const buyer=randomUUID(), otherBuyer=randomUUID(), runner=randomUUID(), event=randomUUID(), category=randomUUID();
let calls=0;
const service=createParticipantsService(async()=> {
  calls++;
  return {ok:true,internalCode:'OK',payload:{cpf,nome:'Maria Teste',sexoRaw:'F',nascIso:birthday}};
});
const manual=createParticipantsService(async()=>({ok:false,internalCode:'EXTERNAL_NOT_FOUND'}));
it('CPF já incluído é rejeitado sem sobrescrever nome, contato ou prontidão',async()=> {
  const initial=await service.prepare(buyer,{event_id:event,cpf,birth_date:birthday});
  const saved=await service.complete(initial.id,buyer,{delivery_mode:'email',email:'corredora@example.test'});
  const callsBefore=calls;
  await assert.rejects(service.prepare(buyer,{event_id:event,cpf,birth_date:birthday,excluded_participant_ids:[initial.id]}),/já está no pedido/);
  assert.equal(calls,callsBefore);
  assert.deepEqual(await service.get(initial.id,buyer),saved);
});
let ownsFixture=false, server:Server, baseUrl:string;
before(async()=> {
  assert.equal((await query("SELECT to_regclass('public.users') AS existing")).rows[0].existing,null);
  ownsFixture=true;
  await query(`CREATE TABLE users(id uuid PRIMARY KEY,email text);
    CREATE TABLE profiles(id uuid PRIMARY KEY REFERENCES users,cpf text,full_name text,birth_date date,gender text,is_public boolean DEFAULT false);
    CREATE TABLE events(id uuid PRIMARY KEY,status text DEFAULT 'published');
    CREATE TABLE categories(id uuid PRIMARY KEY,event_id uuid,min_age int,max_age int,gender text DEFAULT 'ambos');
    CREATE TABLE registrations(id uuid PRIMARY KEY,event_id uuid,runner_id uuid,status text,payment_method text,transferred_to_registration_id uuid);
    CREATE TABLE leader_invitations(bonus_registration_id uuid,runner_id uuid,status text);`);
  await query(await readFile(new URL('../migrations/119_checkout_participants.sql',import.meta.url),'utf8'));
  const app=express(); app.use(express.json()); app.use('/participants',router); app.use(errorHandler);
  server=await new Promise<Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  baseUrl=`http://127.0.0.1:${(server.address() as {port:number}).port}/participants`;
});
beforeEach(async()=> {
  calls=0;
  await query('TRUNCATE checkout_participants,profiles,users,events,categories,registrations,leader_invitations CASCADE');
  await query('INSERT INTO users VALUES ($1,\'comprador@example.test\'),($2,\'outro@example.test\')',[buyer,otherBuyer]);
  await query('INSERT INTO events(id) VALUES ($1)',[event]);
  await query('INSERT INTO categories(id,event_id) VALUES ($1,$2)',[category,event]);
});
after(async()=> {
  if(server) await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  if(ownsFixture) await query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await pool.end();
});
async function addAccount() {
  await query("INSERT INTO users VALUES ($1,'sigiloso@example.test')",[runner]);
  await query("INSERT INTO profiles VALUES ($1,$2,'Nome Privado',$3,'F',false)",[runner,cpf,birthday]);
}
const prepare=()=>service.prepare(buyer,{event_id:event,cpf,birth_date:birthday});
async function request(path:string,method='GET',body?:unknown,userId=buyer,auth=true) {
  return fetch(baseUrl+path,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${jwt.sign({userId,email:'test@example.test'},process.env.JWT_SECRET!)}`}:{})},
    body:body===undefined?undefined:JSON.stringify(body)});
}

it('consulta de conta privada retorna somente existência e não exige visibilidade pública',async()=> {
  await addAccount();
  assert.deepEqual(await checkParticipantCpf(cpf),{registered:true});
  const response=await request('/check-cpf','POST',{cpf});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{success:true,data:{registered:true}});
  assert.equal(response.headers.get('cache-control'),'no-store');
});
it('identifica cadastrado sem consultar provedor nem expor dados ou ID do perfil',async()=> {
  await addAccount();
  const result=await service.prepare(buyer,{event_id:event,cpf});
  assert.equal(calls,0); assert.equal(result.registered,true); assert.equal(result.ready,true);
  assert.equal('full_name' in result,false); assert.equal('email' in result,false);
  assert.equal('birth_date' in result,false); assert.equal('gender' in result,false);
  assert.notEqual(result.id,runner);
});
it('CPF inválido e nascimento impossível são rejeitados antes da consulta externa',async()=> {
  await assert.rejects(service.prepare(buyer,{event_id:event,cpf:'11111111111',birth_date:birthday}),/CPF inválido/);
  await assert.rejects(service.prepare(buyer,{event_id:event,cpf,birth_date:'1990-02-31'}),/nascimento inválida/);
  await assert.rejects(service.prepare(buyer,{event_id:event,cpf}),/Informe a data/);
  assert.equal(calls,0);
});
it('nascimento divergente não retorna dados nem cria rascunho',async()=> {
  await assert.rejects(service.prepare(buyer,{event_id:event,cpf,birth_date:'1991-05-20'}),/Não foi possível conferir/);
  assert.equal((await query('SELECT * FROM checkout_participants')).rowCount,0);
});
it('pré-preenche novo participante e permite finalizar sem email nem criar conta',async()=> {
  const p=await prepare();
  assert.equal('full_name' in p && p.full_name,'Maria Teste');
  const saved=await service.complete(p.id,buyer,{delivery_mode:'buyer'});
  assert.equal(saved.ready,true); assert.equal(saved.delivery_mode,'buyer');
  assert.equal('email' in saved && saved.email,null);
  assert.equal((await query('SELECT * FROM users')).rowCount,2);
  assert.equal((await query('SELECT * FROM registrations')).rowCount,0);
  const resolved=await service.resolveForCheckout(p.id,buyer,event);
  assert.equal(resolved.runnerId,null); assert.equal(resolved.cpf,cpf);
});
it('não aceita alterações em nome ou sexo conferidos pela API',async()=> {
  const p=await prepare();
  await assert.rejects(service.complete(p.id,buyer,{full_name:'Outra Pessoa',delivery_mode:'buyer'}),/nome conferido/);
  await assert.rejects(service.complete(p.id,buyer,{gender:'M',delivery_mode:'buyer'}),/sexo conferido/);
});
it('not found permite entrada manual e sexo sem API; exige nome e data válida',async()=> {
  const p=await manual.prepare(buyer,{event_id:event,cpf,birth_date:birthday});
  assert.equal('manual_entry_allowed' in p && p.manual_entry_allowed,true);
  await assert.rejects(manual.complete(p.id,buyer,{delivery_mode:'buyer'}),/nome completo/);
  const saved=await manual.complete(p.id,buyer,{full_name:'Atleta Manual',gender:'M',delivery_mode:'buyer'});
  assert.equal(saved.ready,true);
});
it('erro técnico nunca libera entrada manual nem indica inexistência',async()=> {
  for(const code of ['EXTERNAL_TIMEOUT','EXTERNAL_QUOTA','EXTERNAL_BAD_RESPONSE','CONFIG_MISSING','FEATURE_DISABLED'] as const) {
    const unavailable=createParticipantsService(async():Promise<CpfBrasilCallResult>=>({ok:false,internalCode:code}));
    await assert.rejects(unavailable.prepare(buyer,{event_id:event,cpf,birth_date:birthday}),(e:any)=>e.statusCode===503);
  }
  assert.equal((await query('SELECT * FROM checkout_participants')).rowCount,0);
});
it('email opcional é validado e removido quando comprador muda para sua conta',async()=> {
  const p=await prepare();
  await assert.rejects(service.complete(p.id,buyer,{delivery_mode:'email',email:'inválido'}),/e-mail válido/);
  const saved=await service.complete(p.id,buyer,{delivery_mode:'email',email:' Atleta@example.test '});
  assert.equal('email' in saved && saved.email,'atleta@example.test');
  const buyerOnly=await service.complete(p.id,buyer,{delivery_mode:'buyer',email:'atleta@example.test'});
  assert.equal('email' in buyerOnly && buyerOnly.email,null);
});
it('reenvios concorrentes do mesmo CPF reutilizam referência no evento/comprador',async()=> {
  const [a,b]=await Promise.all([prepare(),prepare()]);
  assert.equal(a.id,b.id); assert.equal((await query('SELECT * FROM checkout_participants')).rowCount,1);
  const other=await service.prepare(otherBuyer,{event_id:event,cpf,birth_date:birthday});
  assert.notEqual(other.id,a.id);
});
it('outro comprador, evento diferente e rascunho expirado não são aceitos',async()=> {
  const p=await prepare(); await service.complete(p.id,buyer,{delivery_mode:'buyer'});
  await assert.rejects(service.get(p.id,otherBuyer),(e:any)=>e.statusCode===404);
  await assert.rejects(service.complete(p.id,otherBuyer,{delivery_mode:'buyer'}),(e:any)=>e.statusCode===404);
  await assert.rejects(service.resolveForCheckout(p.id,buyer,randomUUID()),/não pertence/);
  await query("UPDATE checkout_participants SET expires_at=now()-interval '1 second'");
  await assert.rejects(service.get(p.id,buyer),(e:any)=>e.statusCode===404);
});
it('conta criada durante consulta é reconhecida sem expor dados retornados pela API',async()=> {
  const concurrent=createParticipantsService(async()=> {
    await addAccount();
    return {ok:true,internalCode:'OK',payload:{cpf,nome:'Nome Externo',sexoRaw:'F',nascIso:birthday}};
  });
  const p=await concurrent.prepare(buyer,{event_id:event,cpf,birth_date:birthday});
  assert.equal(p.registered,true); assert.equal('full_name' in p,false);
});
it('conta criada depois da identificação é resolvida internamente; não altera contato',async()=> {
  const p=await prepare(); await service.complete(p.id,buyer,{delivery_mode:'email',email:'opcional@example.test'});
  await addAccount();
  const refreshed=await service.get(p.id,buyer);
  assert.equal(refreshed.registered,true); assert.equal('email' in refreshed,false);
  const resolved=await service.resolveForCheckout(p.id,buyer,event);
  assert.equal(resolved.runnerId,runner);
  assert.equal((await query('SELECT email FROM users WHERE id=$1',[runner])).rows[0].email,'sigiloso@example.test');
});
it('valida elegibilidade sem revelar nascimento, sexo ou idade da conta',async()=> {
  await addAccount(); const p=await prepare();
  await query("UPDATE categories SET gender='masculino'");
  const denied=await service.eligibility(p.id,buyer,category);
  assert.equal(denied.eligible,false); assert.deepEqual(Object.keys(denied).sort(),['eligible','message']);
  await query("UPDATE categories SET gender='feminino',min_age=18");
  assert.deepEqual(await service.eligibility(p.id,buyer,category),{eligible:true});
  await query('UPDATE categories SET min_age=100');
  assert.equal((await service.eligibility(p.id,buyer,category)).eligible,false);
});
it('resolução interna impede inscrição ativa duplicada e rascunho incompleto',async()=> {
  const p=await prepare();
  await assert.rejects(service.resolveForCheckout(p.id,buyer,event),/Complete os dados/);
  await addAccount();
  await query("INSERT INTO registrations VALUES ($1,$2,$3,'confirmed','pix',NULL)",[randomUUID(),event,runner]);
  await assert.rejects(service.resolveForCheckout(p.id,buyer,event),/já possui inscrição/);
  await assert.rejects(service.prepare(buyer,{event_id:event,cpf}),/já possui inscrição/);
});
it('HTTP exige autenticação, valida campos e impede acesso por outro comprador',async()=> {
  assert.equal((await request('/check-cpf','POST',{cpf},buyer,false)).status,401);
  assert.equal((await request('/','POST',{event_id:event,cpf,runner_id:runner})).status,400);
  const p=await prepare();
  assert.equal((await request(`/${p.id}`,'GET',undefined,otherBuyer)).status,404);
  assert.equal((await request(`/${p.id}`,'PATCH',{delivery_mode:'buyer',birth_date:'1990-01-01'})).status,400);
});
it('resolução do grupo rejeita referência repetida e evento não publicado',async()=> {
  const p=await prepare(); await service.complete(p.id,buyer,{delivery_mode:'buyer'});
  await assert.rejects(service.resolveManyForCheckout([p.id,p.id],buyer,event),/repetido/);
  assert.equal((await service.resolveManyForCheckout([p.id],buyer,event)).length,1);
  await query("UPDATE events SET status='draft'");
  await assert.rejects(service.resolveForCheckout(p.id,buyer,event),/Evento indisponível/);
});
it('sexo ausente na API pode ser declarado e não libera categoria restrita sem correspondência',async()=> {
  const unknown=createParticipantsService(async()=>({ok:true,internalCode:'OK',payload:{cpf,nome:'Atleta Teste',sexoRaw:'',nascIso:birthday}}));
  const p=await unknown.prepare(buyer,{event_id:event,cpf,birth_date:birthday});
  await assert.rejects(unknown.complete(p.id,buyer,{delivery_mode:'buyer'}),/Informe o sexo/);
  await unknown.complete(p.id,buyer,{delivery_mode:'buyer',gender:'O'});
  await query("UPDATE categories SET gender='masculino'");
  assert.equal((await unknown.eligibility(p.id,buyer,category)).eligible,false);
});
