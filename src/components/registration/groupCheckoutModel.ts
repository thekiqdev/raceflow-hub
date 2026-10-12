import type { Category } from '@/lib/api/categories';
import type { EventKit } from '@/lib/api/eventKits';
import type { OrderChoices } from '@/lib/api/checkoutOrders';

export type ParticipantDraft = { participant_id:string; choices:OrderChoices };
export type CategoryEligibilityProfile = { birth_date?: string | null; gender?: string | null; ready?: boolean };
export type CategoryEligibilityResult = { eligible:boolean; message?:string };
export const money=(cents:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
export function activeBatches(category?:Category,now=Date.now()) {
  return (category?.batches ?? []).filter(b=>b.valid_from && new Date(b.valid_from).getTime()<=now &&
    (!b.valid_to || new Date(b.valid_to).getTime()>=now)).sort((a,b)=>new Date(b.valid_from!).getTime()-new Date(a.valid_from!).getTime());
}
export function categoryKits(categoryId:string|undefined,kits:EventKit[]) {
  return kits.filter(k=>!k.deleted_at && k.is_visible!==false && !!categoryId && k.category_ids?.includes(categoryId));
}
/** Alinhado a checkoutParticipantsService.evaluateCategoryEligibility (O não libera categoria restrita). */
export function calculateParticipantAge(birthDate:string,referenceDate=new Date()):number|null {
  const raw=birthDate.includes('T')?birthDate:`${birthDate}T12:00:00`;
  const dob=new Date(raw);
  if(Number.isNaN(dob.getTime())) return null;
  let age=referenceDate.getFullYear()-dob.getFullYear();
  if(referenceDate.getMonth()<dob.getMonth() || (referenceDate.getMonth()===dob.getMonth() && referenceDate.getDate()<dob.getDate())) age--;
  return age;
}
export function normalizeCheckoutGender(gender?:string|null):'masculino'|'feminino'|null {
  const value=String(gender ?? '').toUpperCase();
  if(value==='M' || value==='MASCULINO') return 'masculino';
  if(value==='F' || value==='FEMININO') return 'feminino';
  return null;
}
export function evaluateCategoryEligibility(category:Pick<Category,'gender'|'min_age'|'max_age'>,profile?:CategoryEligibilityProfile|null,referenceDate=new Date()):CategoryEligibilityResult {
  if(profile?.ready===false) {
    return {eligible:false,message:'Complete a identificação deste participante antes de escolher a categoria.'};
  }
  const normalized=normalizeCheckoutGender(profile?.gender);
  const categoryGender=category.gender || 'ambos';
  if(categoryGender!=='ambos' && categoryGender!==normalized) {
    return {eligible:false,message:categoryGender==='masculino'?'Categoria exclusiva para masculino.':'Categoria exclusiva para feminino.'};
  }
  const hasMin=!!(category.min_age && category.min_age>0);
  const hasMax=!!(category.max_age && category.max_age>0);
  if(hasMin || hasMax) {
    if(!profile?.birth_date) {
      return {eligible:false,message:'Informe a data de nascimento para esta categoria.'};
    }
    const age=calculateParticipantAge(profile.birth_date,referenceDate);
    if(age==null) return {eligible:false,message:'Data de nascimento inválida para conferir a idade.'};
    if(hasMin && age<category.min_age!) {
      return {eligible:false,message:`Idade mínima desta categoria: ${category.min_age} anos.`};
    }
    if(hasMax && age>category.max_age!) {
      return {eligible:false,message:`Idade máxima desta categoria: ${category.max_age} anos.`};
    }
  }
  return {eligible:true};
}
export function isCategoryEligibleForParticipant(category:Pick<Category,'gender'|'min_age'|'max_age'>,profile?:CategoryEligibilityProfile|null,referenceDate=new Date()) {
  return evaluateCategoryEligibility(category,profile,referenceDate).eligible;
}
export function choiceProblems(choices:OrderChoices,categories:Category[],kits:EventKit[],options?:{
  profile?:CategoryEligibilityProfile|null;
  categoryFit?:Record<string,CategoryEligibilityResult>|null;
}):string[] {
  const category=categories.find(c=>c.id===choices.category_id);
  if(!category) return ['Selecione uma categoria.'];
  const errors:string[]=[];
  const batchFit=options?.categoryFit?.[category.id];
  if(batchFit) {
    if(!batchFit.eligible) errors.push(batchFit.message || 'Esta categoria não está disponível para este participante.');
  } else if(options?.profile) {
    const fit=evaluateCategoryEligibility(category,options.profile);
    if(!fit.eligible) errors.push(fit.message || 'Esta categoria não está disponível para este participante.');
  }
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
export function participantProgress(choices:OrderChoices,categories:Category[],kits:EventKit[],options:{identityReady:boolean;savedChoices?:OrderChoices;reviewIssue?:string;profile?:CategoryEligibilityProfile|null;categoryFit?:Record<string,CategoryEligibilityResult>|null}) {
  const problems=choiceProblems(choices,categories,kits,{profile:options.profile,categoryFit:options.categoryFit});
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
