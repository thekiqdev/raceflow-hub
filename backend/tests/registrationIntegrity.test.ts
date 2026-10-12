import { before, beforeEach, after, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

// Nunca utiliza a conexão do .env. Exige banco descartável com nome fixo e host local.
const url = new URL(process.env.REGISTRATION_TEST_DATABASE_URL || 'http://missing');
if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1'
    || url.pathname !== '/cronoteam_stage2_test') {
  throw new Error('Informe REGISTRATION_TEST_DATABASE_URL para o PostgreSQL descartável local cronoteam_stage2_test.');
}
Object.assign(process.env, {
  POSTGRES_HOST: url.hostname, POSTGRES_PORT: url.port, POSTGRES_DB: url.pathname.slice(1),
  POSTGRES_USER: decodeURIComponent(url.username), POSTGRES_PASSWORD: decodeURIComponent(url.password),
  NODE_ENV: 'test', LOG_SQL_ALL: 'false',
});
const { default: pool, query, withTransaction } = await import('../src/config/database.js');
const { createRegistration, getVariantRemainingStock, completeRegistrationAttributes,
  replaceRegistrationProductSelectionsForEdit } = await import('../src/services/registrationsService.js');
const { resolveRegistrationSelections } = await import('../src/services/registrationSelectionsWriteService.js');
const { sendInvitationByCpf } = await import('../src/services/leaderInvitationsService.js');
const event = randomUUID(), otherEvent = randomUUID(), organizer = randomUUID();
const category = randomUUID(), otherCategory = randomUUID(), kit = randomUUID(), otherKit = randomUUID();
const product = randomUUID(), secondProduct = randomUUID(), variant = randomUUID(), secondVariant = randomUUID();
const runner = randomUUID(), secondRunner = randomUUID(), coupon = randomUUID(), modality = randomUUID();
const choices = [{ product_id: product, variant_id: variant }];
const input = (runnerId = runner, extra = {}) => ({ event_id: event, category_id: category,
  kit_id: kit, runner_id: runnerId, registered_by: runnerId, total_amount: 120,
  payment_method: 'pix' as const, product_selections: choices, ...extra });
const count = async (table: string) => Number((await query(`SELECT COUNT(*) AS count FROM ${table}`)).rows[0].count);

let ownsFixture = false;
before(async () => {
  // Não sobrescreve schema existente: banco deve estar vazio ao iniciar a suíte.
  assert.equal((await query("SELECT to_regclass('public.registrations') AS existing")).rows[0].existing, null);
  ownsFixture = true;
  await query(await readFile(new URL('./fixtures/registrationIntegrity.sql', import.meta.url), 'utf8'));
  await query(await readFile(new URL('../migrations/118_registration_inventory_guards.sql', import.meta.url), 'utf8'));
});
beforeEach(async () => {
  await query(`TRUNCATE leader_invitations, registration_custom_field_values, registration_product_selections,
    registrations, coupon_events, coupons, product_variants, kit_products, event_kits,
    category_custom_fields, category_batches, category_modalities, modalities, categories, events, profiles, users CASCADE`);
  await query('INSERT INTO events VALUES ($1,$3),($2,$3)', [event, otherEvent, organizer]);
  await query('INSERT INTO categories (id,event_id,name) VALUES ($1,$2,\'Geral\'),($3,$4,\'Outro\')', [category,event,otherCategory,otherEvent]);
  await query('INSERT INTO profiles (id) VALUES ($1),($2)', [runner,secondRunner]);
  await query('INSERT INTO users (id) VALUES ($1),($2)', [runner,secondRunner]);
  await query("UPDATE profiles SET cpf='52998224725',full_name='Atleta Teste' WHERE id=$1",[runner]);
  await query('INSERT INTO event_kits (id,event_id) VALUES ($1,$2),($3,$4)', [kit,event,otherKit,otherEvent]);
  await query(`INSERT INTO kit_products (id,kit_id,name,variant_attributes) VALUES
    ($1,$2,'Camiseta','["Cor","Tamanho"]'),($3,$4,'Boné','["Tamanho"]')`, [product,kit,secondProduct,otherKit]);
  await query(`INSERT INTO product_variants VALUES ($1,$2,'Azul - M',1),($3,$4,'G',1)`, [variant,product,secondVariant,secondProduct]);
  await query('INSERT INTO coupons (id,organizer_id,code,max_uses) VALUES ($1,$2,\'ULTIMO\',1)', [coupon,organizer]);
  await query('INSERT INTO modalities VALUES ($1,$2,1)', [modality,event]);
  await query('INSERT INTO category_modalities VALUES ($1,$2)', [category,modality]);
});
after(async () => {
  if (ownsFixture) await query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await pool.end();
});

it('cria inscrição e dois atributos, consumindo apenas uma unidade; confirmação/cancelamento são idempotentes', async () => {
  const reg = await createRegistration(input());
  assert.equal(await count('registration_product_selections'), 2);
  assert.equal(await getVariantRemainingStock(variant,event), 0);
  for (let i=0;i<2;i++) await query("UPDATE registrations SET status='confirmed' WHERE id=$1",[reg.id]);
  assert.equal(await getVariantRemainingStock(variant,event), 0);
  for (let i=0;i<2;i++) await query("UPDATE registrations SET status='cancelled' WHERE id=$1",[reg.id]);
  assert.equal(await getVariantRemainingStock(variant,event), 1);
});

it('reverte inscrição, escolhas e cupom quando campo personalizado falha após o INSERT', async () => {
  await assert.rejects(createRegistration(input(runner, { coupon_code:'ULTIMO', custom_field_values:{[randomUUID()]:'inválido'} })), /Campo personalizado inválido/);
  assert.equal(await count('registrations'),0);
  assert.equal(await count('registration_product_selections'),0);
  assert.equal((await query('SELECT current_uses FROM coupons')).rows[0].current_uses,0);
});

it('duas compras da última variante resultam em uma única inscrição', async () => {
  const results = await Promise.allSettled([createRegistration(input()),createRegistration(input(secondRunner))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(await count('registrations'),1);
  assert.match(String((results.find(r=>r.status==='rejected') as PromiseRejectedResult).reason), /Estoque/);
});

it('mesmo atleta em duas requisições simultâneas não duplica inscrição', async () => {
  await query('UPDATE product_variants SET available_quantity=NULL');
  const results = await Promise.allSettled([createRegistration(input()),createRegistration(input())]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(await count('registrations'),1);
});

it('cupom de último uso é serializado inclusive entre eventos diferentes', async () => {
  const results = await Promise.allSettled([
    createRegistration(input(runner,{coupon_code:'ULTIMO'})),
    createRegistration(input(secondRunner,{event_id:otherEvent,category_id:otherCategory,kit_id:otherKit,
      coupon_code:'ULTIMO',product_selections:[{product_id:secondProduct,variant_id:secondVariant}]})),
  ]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await query('SELECT current_uses FROM coupons')).rows[0].current_uses,1);
  assert.equal(await count('registrations'),1);
});

it('capacidade de categoria e modalidade é conferida dentro da transação', async () => {
  await query('UPDATE product_variants SET available_quantity=NULL');
  await query('UPDATE categories SET max_participants=1 WHERE id=$1',[category]);
  await createRegistration(input(runner,{modality_id:modality}));
  await assert.rejects(createRegistration(input(secondRunner)), /limite máximo/);
  await query('UPDATE categories SET max_participants=NULL');
  await assert.rejects(createRegistration(input(secondRunner,{modality_id:modality})), /Modalidade sem vagas/);
  assert.equal(await count('registrations'),1);
});

it('rejeita categoria, produto ou variante de outro evento e atributos contraditórios', async () => {
  await assert.rejects(createRegistration(input(runner,{category_id:otherCategory})), /Categoria não pertence/);
  await assert.rejects(createRegistration(input(runner,{product_selections:[{product_id:secondProduct,variant_id:secondVariant}]})), /Produto da seleção/);
  await assert.rejects(createRegistration(input(runner,{product_selections:[{product_id:product,variant_id:secondVariant}]})), /Variante não pertence/);
  await assert.rejects(createRegistration(input(runner,{product_selections:[{...choices[0],attribute_selections:{Cor:'Vermelho'}}]})), /não corresponde/);
  assert.equal(await count('registrations'),0);
});

it('resolve combinação completa sem variant_id; rejeita parcial ou produto obrigatório ausente', async () => {
  const resolved = await withTransaction(()=>resolveRegistrationSelections(kit,event,[{product_id:product,attribute_selections:{Cor:'Azul',Tamanho:'M'}}]));
  assert.equal(resolved[0].variant_id,variant);
  await assert.rejects(withTransaction(()=>resolveRegistrationSelections(kit,event,[{product_id:product,attribute_selections:{Cor:'Azul'}}])), /combinação válida/);
  await assert.rejects(createRegistration(input(runner,{product_selections:[]})), /Selecione a variante/);
});

it('kit com dois produtos exige e grava cada variante, com estoque independente', async () => {
  await query('UPDATE kit_products SET kit_id=$1 WHERE id=$2',[kit,secondProduct]);
  await assert.rejects(createRegistration(input()), /Selecione a variante para o produto "Boné"/);
  await createRegistration(input(runner,{product_selections:[...choices,{product_id:secondProduct,variant_id:secondVariant}]}));
  assert.equal(await count('registration_product_selections'),3);
  assert.equal(await getVariantRemainingStock(variant,event),0);
  assert.equal(await getVariantRemainingStock(secondVariant,event),0);
});

it('edição inválida preserva escolhas anteriores mesmo após alteração do kit na transação', async () => {
  const reg = await createRegistration(input());
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE registrations SET kit_id=$1 WHERE id=$2',[otherKit,reg.id]);
    await assert.rejects(replaceRegistrationProductSelectionsForEdit(client,reg.id,event,choices), /Kit não pertence/);
    await client.query('ROLLBACK');
  } finally { client.release(); }
  assert.equal((await query('SELECT kit_id FROM registrations WHERE id=$1',[reg.id])).rows[0].kit_id,kit);
  assert.equal(await count('registration_product_selections'),2);
});

async function rawPurchase(runnerId:string, selectedVariant=variant, beforeCommit?:()=>Promise<void>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {rows} = await client.query(`INSERT INTO registrations(event_id,runner_id,category_id,kit_id)
      VALUES ($1,$2,$3,$4) RETURNING id`,[event,runnerId,category,kit]);
    await client.query(`INSERT INTO registration_product_selections VALUES ($1,$2,$3,'Cor','Azul')`,[rows[0].id,product,selectedVariant]);
    await beforeCommit?.();
    await client.query('COMMIT');
    return rows[0];
  } catch(e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

it('migração impede sobre-venda concorrente de escritores SQL que não usam o serviço', async () => {
  let arrive!:()=>void;
  const bothInserted = new Promise<void>(resolve=> { arrive=resolve; });
  let inserted=0;
  const barrier=async()=> { if (++inserted===2) arrive(); await bothInserted; };
  const results = await Promise.allSettled([rawPurchase(runner,variant,barrier),rawPurchase(secondRunner,variant,barrier)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.match(String((results.find(r=>r.status==='rejected') as PromiseRejectedResult).reason), /Estoque/);
  assert.equal(await count('registrations'),1);
});

it('revisão de preço dentro da transação rejeita total antigo sem gravar ou consumir cupom', async () => {
  await assert.rejects(createRegistration(input(runner,{require_valid_coupon:true,total_amount:0,coupon_code:'ULTIMO'})),
    (e:any)=>e.code==='REGISTRATION_PRICE_CHANGED' && e.pricing.total===110);
  assert.equal(await count('registrations'),0);
  assert.equal((await query('SELECT current_uses FROM coupons')).rows[0].current_uses,0);
});

it('completar atributos preserva escolha antiga se combinação nova não existe', async () => {
  const reg = await createRegistration(input());
  await assert.rejects(completeRegistrationAttributes(reg.id,runner,[{product_id:product,attribute_selections:{Cor:'Azul',Tamanho:'GG'}}]), /combinação válida/);
  assert.equal(await count('registration_product_selections'),2);
  await completeRegistrationAttributes(reg.id,runner,choices);
  assert.equal(await count('registration_product_selections'),2);
  assert.equal(await getVariantRemainingStock(variant,event),0);
});

it('falha ao atribuir kit no convite reverte envio e preserva inscrição bônus', async () => {
  await createRegistration(input(secondRunner));
  const leader = randomUUID(), invitation = randomUUID();
  const bonus = await createRegistration(input(leader,{payment_method:'free_bonus',kit_id:null,product_selections:[]}));
  await query('INSERT INTO leader_invitations(id,leader_id,bonus_registration_id,event_id) VALUES ($1,$2,$3,$4)',[invitation,leader,bonus.id,event]);
  await assert.rejects(sendInvitationByCpf(leader,invitation,'52998224725',undefined,{
    runner_chooses_category_modality_kit:false,kit_id:kit,product_selections:choices,
  }), /Estoque/);
  assert.equal((await query('SELECT status FROM leader_invitations')).rows[0].status,'available');
  const persisted = (await query('SELECT runner_id,kit_id FROM registrations WHERE id=$1',[bonus.id])).rows[0];
  assert.equal(persisted.runner_id,leader);
  assert.equal(persisted.kit_id,null);
});

it('bônus disponíveis do líder não bloqueiam confirmação da própria inscrição', async () => {
  const reg = await createRegistration(input());
  await createRegistration(input(runner,{payment_method:'free_bonus',kit_id:null,product_selections:[]}));
  await query("UPDATE registrations SET status='confirmed' WHERE id=$1",[reg.id]);
  assert.equal(await count('registrations'),2);
});

it('dois convites concorrentes não podem ser atribuídos ao mesmo corredor', async () => {
  let arrive!:()=>void;
  const bothInserted = new Promise<void>(resolve=> { arrive=resolve; });
  let inserted=0;
  const assign=()=>withTransaction(async()=> {
    const reg=(await query(`INSERT INTO registrations(event_id,runner_id,payment_method,status)
      VALUES ($1,$2,'free_bonus','confirmed') RETURNING id`,[event,runner])).rows[0];
    await query(`INSERT INTO leader_invitations(id,leader_id,bonus_registration_id,event_id,runner_id,status)
      VALUES ($1,$2,$3,$4,$5,'sent')`,[randomUUID(),randomUUID(),reg.id,event,runner]);
    if (++inserted===2) arrive();
    await bothInserted;
  });
  const results=await Promise.allSettled([assign(),assign()]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(await count('leader_invitations'),1);
  await assert.rejects(createRegistration(input()), /já possui/);
});

it('migração rejeita variante de outro produto e duplicidade por gravação direta', async () => {
  await assert.rejects(rawPurchase(runner,secondVariant), /não pertencem/);
  await query('UPDATE product_variants SET available_quantity=NULL');
  await rawPurchase(runner);
  await assert.rejects(rawPurchase(runner), /já possui/);
});

it('transferência split considera estado final e mantém apenas uma unidade consumida', async () => {
  const original = await createRegistration(input());
  await withTransaction(async () => {
    const dest = (await query(`INSERT INTO registrations(event_id,runner_id,category_id,kit_id,status)
      VALUES ($1,$2,$3,$4,'confirmed') RETURNING id`,[event,secondRunner,category,kit])).rows[0];
    await query(`INSERT INTO registration_product_selections SELECT $1, product_id, variant_id, attribute_name, attribute_value
      FROM registration_product_selections WHERE registration_id=$2`,[dest.id,original.id]);
    await query("UPDATE registrations SET status='transferred', transferred_to_registration_id=$1 WHERE id=$2",[dest.id,original.id]);
  });
  assert.equal(await getVariantRemainingStock(variant,event),0);
});
