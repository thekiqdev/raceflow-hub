import { it } from 'node:test';
import assert from 'node:assert/strict';
import { activeBatches, categoryKits, choiceProblems, copyChoices, evaluateCategoryEligibility, paymentMethodAvailable, participantProgress } from '../../src/components/registration/groupCheckoutModel.ts';
import type { Category } from '../../src/lib/api/categories.ts';
import type { EventKit } from '../../src/lib/api/eventKits.ts';
const category={id:'category',modality_ids:['modality'],batches:[],gender:'ambos',min_age:null,max_age:null} as unknown as Category;
const kits=[{id:'kit',category_ids:['category'],products:[{id:'product',name:'Camiseta',type:'variable',variants:[{id:'variant',available_quantity:1}]}]}] as EventKit[];
const choices={category_id:'category',modality_id:'modality',kit_id:'kit',product_selections:[{product_id:'product',variant_id:'variant'}]};
it('cópia não replica respostas pessoais e preserva respostas do destino da mesma categoria',()=> {
  const source={...choices,custom_field_values:{personal:'Fonte'},coupon_code:'GRUPO'};
  const target={category_id:'category',custom_field_values:{personal:'Destino'}};
  const copied=copyChoices(source,target);
  assert.deepEqual(copied.custom_field_values,{personal:'Destino'});
  assert.equal(copied.coupon_code,undefined);
  assert.equal(copyChoices(source,target,true).coupon_code,'GRUPO');
  assert.equal(copyChoices(source,{...target,coupon_code:'MEU'}).coupon_code,'MEU');
  copied.product_selections![0].variant_id='different';assert.equal(source.product_selections[0].variant_id,'variant');
});
it('progresso só completa escolhas válidas, identificadas e salvas, independentemente da ordem JSONB',()=> {
  const state=(value:typeof choices|{},savedChoices?:typeof choices,identityReady=true,reviewIssue?:string)=>participantProgress(value,[category],kits,{savedChoices,identityReady,reviewIssue}).state;
  assert.equal(state({}),'not_started');
  assert.equal(state({category_id:'category'}),'in_progress');
  assert.equal(state(choices),'in_progress');
  assert.equal(state(choices,{...choices}),'complete');
  assert.equal(state(choices,{product_selections:choices.product_selections,kit_id:'kit',modality_id:'modality',category_id:'category'}),'complete');
  assert.equal(state(choices,choices,false),'needs_review');
  assert.equal(state(choices,choices,true,'Categoria incompatível'),'needs_review');
  assert.equal(state({...choices,kit_id:'removed'}),'needs_review');
  const depleted=structuredClone(kits);depleted[0].products![0].variants![0].available_quantity=0;
  assert.equal(participantProgress(choices,[category],depleted,{identityReady:true,savedChoices:choices}).state,'needs_review');
});
it('cópia usa lista explícita de escolhas, sem propagar identidade adicionada ao objeto',()=> {
  const source={...choices,cpf:'52998224725',email:'source@example.test',participant_id:'source'};
  const copied=copyChoices(source,{});
  assert.equal('cpf' in copied,false);assert.equal('email' in copied,false);assert.equal('participant_id' in copied,false);
});
it('cópia entre categorias limpa campos que pertenciam à categoria anterior',()=> {
  assert.deepEqual(copyChoices(choices,{category_id:'other',custom_field_values:{old:'value'}}).custom_field_values,{});
});
it('seleções completas passam; ausência de variante e esgotamento precisam de correção',()=> {
  assert.deepEqual(choiceProblems(choices,[category],kits),[]);
  assert.match(choiceProblems({...choices,product_selections:[]},[category],kits).join(' '),/Camiseta|produto|product/);
  const unavailable=structuredClone(kits);unavailable[0].products![0].variants![0].available_quantity=0;
  assert.match(choiceProblems(choices,[category],unavailable).join(' '),/esgotada/);
});
it('kits precisam estar visíveis e vinculados explicitamente à categoria',()=> {
  assert.equal(categoryKits('other',kits).length,0);
  assert.equal(categoryKits('category',[{...kits[0],is_visible:false}]).length,0);
});
it('lotes vencidos ou futuros não são oferecidos',()=> {
  const c={...category,batches:[{id:'past',valid_from:'2020-01-01',valid_to:'2020-01-02'},
    {id:'active',valid_from:'2020-01-01',valid_to:null},{id:'future',valid_from:'2099-01-01',valid_to:null}]} as Category;
  assert.deepEqual(activeBatches(c,new Date('2026-01-01').getTime()).map(b=>b.id),['active']);
  assert.match(choiceProblems({...choices,category_batch_id:'past'},[c],kits).join(' '),/lote/);
});
it('bloqueia escolhas quando há lotes cadastrados mas nenhum vigente',()=> {
  const c={...category,batches:[{id:'past',valid_from:'2020-01-01',valid_to:'2020-01-02'}]} as Category;
  assert.match(choiceProblems({...choices,category_batch_id:null},[c],kits).join(' '),/Não há lote vigente/);
});
it('métodos desativados ou fora do prazo não permitem iniciar cobrança',()=> {
  assert.equal(paymentMethodAvailable({pix_enabled:false},'PIX'),false);
  assert.equal(paymentMethodAvailable({credit_card_disabled_at:'2020-01-01'},'CREDIT_CARD'),false);
  assert.equal(paymentMethodAvailable({},'PIX'),true);
});
it('elegibilidade de categoria filtra idade e gênero como o backend do checkout',()=> {
  const femaleAdult={...category,gender:'feminino',min_age:18,max_age:39} as Category;
  const ref=new Date('2026-06-15T12:00:00');
  assert.equal(evaluateCategoryEligibility(femaleAdult,{gender:'F',birth_date:'1990-01-01',ready:true},ref).eligible,true);
  assert.match(evaluateCategoryEligibility(femaleAdult,{gender:'M',birth_date:'1990-01-01',ready:true},ref).message || '',/feminino/i);
  assert.match(evaluateCategoryEligibility(femaleAdult,{gender:'F',birth_date:'2015-01-01',ready:true},ref).message || '',/mínima/i);
  assert.match(evaluateCategoryEligibility(femaleAdult,{gender:'F',birth_date:'1970-01-01',ready:true},ref).message || '',/máxima/i);
  assert.equal(evaluateCategoryEligibility(femaleAdult,{gender:'O',birth_date:'1990-01-01',ready:true},ref).eligible,false);
  assert.match(choiceProblems(choices,[femaleAdult],kits,{profile:{gender:'M',birth_date:'1990-01-01'}}).join(' '),/feminino/i);
});
