import type { Category } from '@/lib/api/categories';
import type { EventKit } from '@/lib/api/eventKits';
import type { OrderChoices } from '@/lib/api/checkoutOrders';

export type ParticipantDraft = { participant_id:string; choices:OrderChoices };
export const money=(cents:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
export function activeBatches(category?:Category,now=Date.now()) {
  return (category?.batches ?? []).filter(b=>b.valid_from && new Date(b.valid_from).getTime()<=now &&
    (!b.valid_to || new Date(b.valid_to).getTime()>=now)).sort((a,b)=>new Date(b.valid_from!).getTime()-new Date(a.valid_from!).getTime());
}
export function categoryKits(categoryId:string|undefined,kits:EventKit[]) {
  return kits.filter(k=>!k.deleted_at && k.is_visible!==false && !!categoryId && k.category_ids?.includes(categoryId));
}
export function choiceProblems(choices:OrderChoices,categories:Category[],kits:EventKit[]):string[] {
  const category=categories.find(c=>c.id===choices.category_id);
  if(!category) return ['Selecione uma categoria.'];
  const errors:string[]=[];
  if(category.modality_ids?.length && !category.modality_ids.includes(choices.modality_id ?? '')) errors.push('Selecione uma modalidade da categoria.');
  const batches=activeBatches(category);
  if(batches.length && !batches.some(b=>b.id===choices.category_batch_id)) errors.push('Selecione um lote vigente.');
  if(!batches.length && choices.category_batch_id) errors.push('Atualize o lote que não está mais vigente.');
  const availableKits=categoryKits(category.id,kits);
  const kit=availableKits.find(k=>k.id===choices.kit_id);
  if((availableKits.length || choices.kit_id) && !kit) errors.push('Selecione um kit disponível para a categoria.');
  for(const product of kit?.products ?? []) {
    if(product.type!=='variable') continue;
    const selection=choices.product_selections?.find(s=>s.product_id===product.id);
    const variant=product.variants?.find(v=>v.id===selection?.variant_id);
    if(!variant) errors.push(`Escolha uma opção de ${product.name}.`);
    else if(variant.available_quantity!=null && variant.available_quantity<=0) errors.push(`${product.name}: opção esgotada.`);
  }
  return errors;
}
/** Nunca copiar respostas pessoais, CPF, contato ou referência de participante. */
export function copyChoices(source:OrderChoices,target:OrderChoices,includeCoupon=false):OrderChoices {
  const sameCategory=source.category_id===target.category_id;
  return {category_id:source.category_id,modality_id:source.modality_id,category_batch_id:source.category_batch_id,kit_id:source.kit_id,
    product_selections:structuredClone(source.product_selections ?? []),coupon_code:includeCoupon?source.coupon_code:target.coupon_code,
    custom_field_values:sameCategory ? structuredClone(target.custom_field_values ?? {}) : {}};
}
/** JSONB pode devolver chaves em outra ordem; isso não significa alteração pendente. */
export function choicesSignature(value:unknown):string {
  const normalize=(v:unknown):unknown=>Array.isArray(v)?v.map(normalize):v && typeof v==='object'
    ?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,normalize(x)])):v;
  return JSON.stringify(normalize(value));
}
export function participantProgress(choices:OrderChoices,categories:Category[],kits:EventKit[],options:{identityReady:boolean;savedChoices?:OrderChoices;reviewIssue?:string}) {
  const problems=choiceProblems(choices,categories,kits);
  const saved=options.savedChoices!==undefined && choicesSignature(choices)===choicesSignature(options.savedChoices);
  if(!options.identityReady || options.reviewIssue) return {state:'needs_review' as const,label:'Precisa revisar',saved,problems:[options.reviewIssue || 'Renove a identificação deste participante.',...problems]};
  if(!choices.category_id) return {state:'not_started' as const,label:'Não iniciado',saved,problems};
  const category=categories.find(c=>c.id===choices.category_id);
  const kit=categoryKits(choices.category_id,kits).find(k=>k.id===choices.kit_id);
  const invalidSelection=!category || !!choices.modality_id && !category.modality_ids?.includes(choices.modality_id)
    || !!choices.category_batch_id && !activeBatches(category).some(b=>b.id===choices.category_batch_id)
    || !!choices.kit_id && !kit || (kit?.products ?? []).some(p=> {
      if(p.type!=='variable') return false;
      const selected=choices.product_selections?.find(s=>s.product_id===p.id);
      const variant=p.variants?.find(v=>v.id===selected?.variant_id);
      return !!selected && (!variant || variant.available_quantity!=null && variant.available_quantity<=0);
    });
  if(invalidSelection) return {state:'needs_review' as const,label:'Precisa revisar',saved,problems};
  if(problems.length) return {state:'in_progress' as const,label:'Em preenchimento',saved,problems};
  return {state:saved?'complete' as const:'in_progress' as const,label:saved?'Escolhas completas':'Aguardando salvar',saved,problems};
}
export function paymentMethodAvailable(event:{pix_enabled?:boolean|null;pix_disabled_at?:string|null;credit_card_enabled?:boolean|null;credit_card_disabled_at?:string|null},method:'PIX'|'CREDIT_CARD',now=Date.now()) {
  const enabled=method==='PIX'?event.pix_enabled:event.credit_card_enabled;
  const deadline=method==='PIX'?event.pix_disabled_at:event.credit_card_disabled_at;
  return enabled!==false && (!deadline || new Date(deadline).getTime()>now);
}
