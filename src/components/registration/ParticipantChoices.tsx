import { useEffect, useId, useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Category } from '@/lib/api/categories';
import type { EventKit } from '@/lib/api/eventKits';
import type { Modality } from '@/lib/api/modalities';
import type { OrderChoices } from '@/lib/api/checkoutOrders';
import { activeBatches, categoryKits, money } from './groupCheckoutModel';
import { ChoiceCards } from './ChoiceCards';

const price=(value:number)=>money(Math.round(Number(value)*100));
type StepKey='category'|'modality'|'batch'|'kit'|`product:${string}`|'extras';
type StepDef={key:StepKey;label:string;summary?:string;done:boolean};
export type ChoicesNav={canBack:boolean;canContinue:boolean;isExtras:boolean;isLastStep:boolean;back:()=>void;continue:()=>void};

function buildSteps(value:OrderChoices,categories:Category[],kits:EventKit[],modalities:Modality[]):StepDef[] {
  const category=categories.find(c=>c.id===value.category_id);
  const availableKits=categoryKits(category?.id,kits);
  const kit=availableKits.find(k=>k.id===value.kit_id);
  const batches=activeBatches(category);
  const steps:StepDef[]=[{
    key:'category',label:'Categoria',done:!!category,
    summary:category?.name,
  }];
  if((category?.modality_ids?.length ?? 0)>1) {
    const modality=modalities.find(m=>m.id===value.modality_id);
    steps.push({key:'modality',label:'Modalidade',done:!!value.modality_id && !!category?.modality_ids?.includes(value.modality_id!),
      summary:modality?`${modality.name} ${modality.distance || ''}`.trim():undefined});
  }
  if(batches.length>1) {
    const batch=batches.find(b=>b.id===value.category_batch_id);
    steps.push({key:'batch',label:'Lote',done:!!batch,summary:batch?.name || (batch?'Lote vigente':undefined)});
  }
  if(category && availableKits.length) {
    steps.push({key:'kit',label:'Kit',done:!!kit,summary:kit?.name});
    for(const product of kit?.products ?? []) {
      if(product.type!=='variable' || !(product.variants?.length)) continue;
      const selected=value.product_selections?.find(s=>s.product_id===product.id)?.variant_id;
      const variant=product.variants.find(v=>v.id===selected);
      steps.push({key:`product:${product.id}`,label:product.name,done:!!selected,
        summary:variant?.name});
    }
  }
  if(category) steps.push({key:'extras',label:'Extras',done:true,summary:value.coupon_code || (category.custom_fields?.length?'Informações':'Opcional')});
  return steps;
}

function firstIncomplete(steps:StepDef[]):StepKey {
  return steps.find(s=>!s.done)?.key ?? steps[steps.length-1]?.key ?? 'category';
}

export function ParticipantChoices({value,onChange,categories,kits,modalities,embedNav=true,onNavChange}:{
  value:OrderChoices;onChange:(v:OrderChoices)=>void;categories:Category[];kits:EventKit[];modalities:Modality[];
  embedNav?:boolean;onNavChange?:(nav:ChoicesNav|null)=>void;
}) {
  const id=useId();
  const category=categories.find(c=>c.id===value.category_id);
  const availableKits=categoryKits(category?.id,kits);
  const kit=availableKits.find(k=>k.id===value.kit_id);
  const batches=activeBatches(category);
  const steps=useMemo(()=>buildSteps(value,categories,kits,modalities),[value,categories,kits,modalities]);
  const [step,setStep]=useState<StepKey>(()=>firstIncomplete(steps));

  useEffect(()=> {
    if(!steps.some(s=>s.key===step)) setStep(firstIncomplete(steps));
  },[steps,step]);

  function goNext(from:StepKey) {
    const index=steps.findIndex(s=>s.key===from);
    const next=steps[index+1]?.key ?? 'extras';
    setStep(next);
  }

  function chooseCategory(categoryId:string) {
    if(categoryId===value.category_id) {goNext('category');return;}
    if(value.category_id && !window.confirm('Trocar a categoria? Modalidade, lote, kit e respostas desta categoria precisarão ser conferidos novamente.')) return;
    const next=categories.find(c=>c.id===categoryId);
    onChange({category_id:categoryId,modality_id:next?.modality_ids?.length===1?next.modality_ids[0]:null,
      category_batch_id:activeBatches(next)[0]?.id ?? null,coupon_code:value.coupon_code});
    window.setTimeout(()=> {
      const nextSteps=buildSteps({category_id:categoryId,modality_id:next?.modality_ids?.length===1?next.modality_ids[0]:null,
        category_batch_id:activeBatches(next)[0]?.id ?? null,coupon_code:value.coupon_code},categories,kits,modalities);
      setStep(firstIncomplete(nextSteps));
    },0);
  }

  const current=steps.find(s=>s.key===step) ?? steps[0];
  const currentIndex=Math.max(0,steps.findIndex(s=>s.key===step));
  const productId=step.startsWith('product:')?step.slice('product:'.length):null;
  const product=kit?.products?.find(p=>p.id===productId);
  const canBack=currentIndex>0;
  const canContinue=step!=='extras' && !!current?.done;
  const isExtras=step==='extras';
  const isLastStep=currentIndex===Math.max(0,steps.length-1);

  useEffect(()=> {
    if(!onNavChange) return;
    onNavChange({
      canBack,canContinue,isExtras,isLastStep,
      back:()=>setStep(steps[currentIndex-1]?.key ?? 'category'),
      continue:()=>goNext(step),
    });
  },[canBack,canContinue,isExtras,isLastStep,step,currentIndex,steps,onNavChange]);
  useEffect(()=> ()=> {onNavChange?.(null);},[onNavChange]);

  return <div className={`flex min-w-0 flex-col gap-3 ${embedNav?'min-h-[min(28rem,70dvh)] sm:min-h-0 sm:gap-4':'min-h-0 flex-1 gap-3 sm:gap-4'}`} aria-label="Escolhas da inscrição">
    <div className="shrink-0 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-primary sm:text-sm">Etapa {currentIndex+1} de {steps.length} · {current?.label}</p>
        <p className="text-[11px] text-muted-foreground sm:text-xs">{steps.filter(s=>s.done).length}/{steps.length}</p>
      </div>
      <ol className="flex gap-1" aria-label="Progresso das escolhas">
        {steps.map((s,i)=><li key={s.key} className={`h-1 flex-1 rounded-full sm:h-1.5 ${i<=currentIndex?'bg-primary':s.done?'bg-primary/40':'bg-muted'}`}/>)}
      </ol>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="toolbar" aria-label="Escolhas já feitas">
        {steps.filter(s=>s.key!=='extras' || s.summary).map(s=><button key={s.key} type="button"
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium sm:px-3 sm:py-1.5 sm:text-xs ${s.key===step?'border-primary bg-primary/10 text-primary':s.done?'border-border bg-muted/40 text-foreground':'border-dashed text-muted-foreground'}`}
          aria-current={s.key===step?'step':undefined}
          onClick={()=>setStep(s.key)}>
          {s.done && s.summary?`${s.label}: ${s.summary}`:s.label}
        </button>)}
      </div>
    </div>

    <div className={`flex min-h-0 flex-1 flex-col gap-3 ${embedNav?'':'lg:mx-auto lg:w-full lg:max-w-2xl'}`}>
      {step==='category' && <ChoiceCards compact stepId={`${id}-category`} label="Categoria" hint="Em qual categoria este participante vai correr?"
        value={value.category_id} onChange={chooseCategory}
        options={categories.map(c=>({id:c.id,title:c.name,price:`${price(activeBatches(c)[0]?.price ?? c.price)} pela categoria`,
          description:[c.gender==='masculino'?'Masculino':c.gender==='feminino'?'Feminino':null,c.min_age!=null?`A partir de ${c.min_age} anos`:null,c.max_age!=null?`Até ${c.max_age} anos`:null].filter(Boolean).join(' · ')}))}/>}

      {step==='modality' && category && <ChoiceCards compact key={`modality-${category.id}`} label="Modalidade" hint="Escolha a modalidade desta categoria."
        value={value.modality_id}
        options={modalities.filter(m=>category.modality_ids!.includes(m.id)).map(m=>({id:m.id,title:`${m.name} ${m.distance || ''}`.trim()}))}
        onChange={modality_id=>{onChange({...value,modality_id});goNext('modality');}}/>}

      {step==='batch' && !!batches.length && <ChoiceCards compact key={`batch-${category?.id}`} label="Lote" hint="Confira o lote e o valor vigentes."
        value={value.category_batch_id}
        options={batches.map(b=>({id:b.id,title:b.name || 'Lote vigente',price:price(b.price)}))}
        onChange={category_batch_id=>{onChange({...value,category_batch_id});goNext('batch');}}/>}

      {step==='batch' && !batches.length && value.category_batch_id && <div className="space-y-2 rounded-xl border border-amber-400 p-3 text-sm">
        <p>O lote selecionado não está mais vigente. Confira o preço atualizado na próxima revisão.</p>
        <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" onClick={()=>{onChange({...value,category_batch_id:null});goNext('batch');}}>Usar preço atual da categoria</Button>
      </div>}

      {step==='kit' && (availableKits.length
        ? <ChoiceCards compact key={`kit-${category?.id}`} label="Kit" hint="Escolha o kit e confira os itens incluídos." value={value.kit_id}
          options={availableKits.map(k=>({id:k.id,title:k.name,description:k.description || undefined,price:Number(k.price)===0?'Incluído':`+ ${price(k.price)}`}))}
          onChange={kit_id=> {
            if(kit_id===value.kit_id) {goNext('kit');return;}
            if(value.product_selections?.length && !window.confirm('Trocar o kit? As opções dos produtos precisarão ser escolhidas novamente.')) return;
            const nextValue={...value,kit_id,product_selections:[] as OrderChoices['product_selections']};
            onChange(nextValue);
            window.setTimeout(()=>setStep(firstIncomplete(buildSteps(nextValue,categories,kits,modalities))),0);
          }}/>
        : <p className="text-sm text-muted-foreground">Esta categoria não possui kit para escolher.</p>)}

      {productId && product && <div className="flex min-h-0 flex-1 flex-col gap-2">
        {product.image_url && <img src={product.image_url} alt="" loading="lazy" className="mx-auto h-20 w-auto rounded-lg object-contain sm:h-28" onError={e=>{e.currentTarget.hidden=true;}}/>}
        {product.type==='variable'?<ChoiceCards compact label={product.name} hint={product.description || 'Selecione sua opção.'}
          value={value.product_selections?.find(s=>s.product_id===product.id)?.variant_id}
          options={(product.variants ?? []).map(v=>({id:v.id,title:v.name,disabled:v.available_quantity!=null && v.available_quantity<=0}))}
          onChange={variant_id=>{
            const product_selections=[...(value.product_selections ?? []).filter(s=>s.product_id!==product.id),{product_id:product.id,variant_id}];
            const nextValue={...value,product_selections};
            onChange(nextValue);
            window.setTimeout(()=>setStep(firstIncomplete(buildSteps(nextValue,categories,kits,modalities))),0);
          }}/>
          :<p className="text-sm"><span className="font-medium">Incluído:</span> {product.name}</p>}
      </div>}

      {step==='extras' && category && <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain" aria-label="Informações do participante">
        <p className="text-xs text-muted-foreground sm:text-sm">Opcional. Respostas pessoais não são copiadas de outras pessoas.</p>
        {category.custom_fields?.map(field=><div key={field.id} className="space-y-1.5"><Label htmlFor={`${id}-${field.id}`}>{field.label}</Label>
          <Input id={`${id}-${field.id}`} type={field.field_type==='number'?'number':'text'} className="min-h-11 text-base" maxLength={2000}
            value={value.custom_field_values?.[field.id] ?? ''} onChange={e=>onChange({...value,custom_field_values:{...value.custom_field_values,[field.id]:e.target.value}})}/>
        </div>)}
        <div className="space-y-1.5"><Label htmlFor={`${id}-coupon`}>Cupom deste participante (opcional)</Label>
          <Input id={`${id}-coupon`} autoCapitalize="characters" maxLength={80} className="min-h-11 text-base" value={value.coupon_code ?? ''} onChange={e=>onChange({...value,coupon_code:e.target.value.trim().toUpperCase() || undefined})}/>
        </div>
        <p className="text-[11px] text-muted-foreground sm:text-xs">Preços de referência. Taxas, descontos e disponibilidade serão conferidos na revisão.</p>
      </div>}
    </div>

    {embedNav && <div className="flex shrink-0 items-center justify-between gap-2">
      <Button type="button" variant="ghost" className="min-h-10 px-2" disabled={!canBack}
        onClick={()=>setStep(steps[currentIndex-1]?.key ?? 'category')}>
        <ChevronLeft className="mr-1 h-4 w-4"/>Voltar
      </Button>
      {canContinue && <Button type="button" variant="outline" className="min-h-10" onClick={()=>goNext(step)}>Continuar</Button>}
      {isExtras && <p className="text-xs font-medium text-green-700">Escolhas prontas para concluir</p>}
    </div>}
  </div>;
}
