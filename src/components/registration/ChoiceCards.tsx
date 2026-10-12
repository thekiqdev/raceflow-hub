import { useId, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface ChoiceOption {id:string;title:string;description?:string;price?:string;disabled?:boolean;disabledLabel?:string}

/** Radios nativos preservam teclado, leitor de tela e fieldset disabled. */
export function ChoiceCards({label,hint,value,options,onChange,stepId,compact=false}:{
  label:string;hint?:string;value?:string|null;options:ChoiceOption[];onChange:(id:string)=>void;stepId?:string;compact?:boolean;
}) {
  const id=useId();
  const [search,setSearch]=useState(''),[expanded,setExpanded]=useState(false);
  const filtered=options.filter(o=>`${o.title} ${o.description || ''}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  const limit=6;
  const visible=expanded || search?filtered:filtered.slice(0,limit);
  const selected=options.find(o=>o.id===value);
  const shown=selected && !search && !visible.includes(selected)?[...visible,selected]:visible;
  return <fieldset id={stepId} className={`min-w-0 ${compact?'flex min-h-0 flex-1 flex-col gap-2':'scroll-mt-28 space-y-3 sm:scroll-mt-8'}`}>
    <legend className={`font-semibold ${compact?'sr-only':'mb-1 text-base'}`}>{label}</legend>
    {hint && !compact && <p className="text-sm text-muted-foreground">{hint}</p>}
    {hint && compact && <p className="shrink-0 text-xs text-muted-foreground">{hint}</p>}
    {options.length>limit && <Input aria-label={`Buscar em ${label.toLocaleLowerCase('pt-BR')}`} placeholder="Buscar opção…" value={search} onChange={e=>setSearch(e.target.value)} className={`shrink-0 text-base ${compact?'min-h-10':'min-h-12'}`}/>}
    <div className={`grid min-w-0 gap-2 ${compact?'min-h-0 flex-1 content-start overflow-y-auto overscroll-contain pr-0.5 sm:grid-cols-2':'gap-3 sm:grid-cols-2'}`}>
      {shown.map(option=><label key={option.id} className="relative min-w-0 cursor-pointer">
        <input type="radio" name={id} value={option.id} aria-label={option.title} checked={value===option.id} disabled={option.disabled}
          onChange={()=>onChange(option.id)} className="peer sr-only"/>
        <span className={`flex h-full min-w-0 items-start gap-2 rounded-xl border-2 border-transparent bg-muted/40 ring-1 ring-border transition-colors peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:ring-transparent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary peer-disabled:cursor-not-allowed peer-disabled:opacity-50 ${compact?'min-h-12 p-2.5':'min-h-20 gap-3 p-4'}`}>
          <span className="min-w-0 flex-1 space-y-0.5">
            <span className={`block break-words font-medium ${compact?'text-sm leading-snug':''}`}>{option.title}</span>
            {option.description && <span className={`block break-words text-muted-foreground ${compact?'line-clamp-1 text-[11px]':'text-sm'}`}>{option.description}</span>}
            {option.price && <span className={`block font-semibold ${compact?'text-xs':'text-sm'}`}>{option.price}</span>}
            {option.disabled && <span className={`block font-medium ${compact?'text-xs':'text-sm'}`}>{option.disabledLabel || 'Esgotado'}</span>}
          </span>
          {value===option.id?<CheckCircle2 className={`mt-0.5 shrink-0 text-primary ${compact?'h-4 w-4':'h-5 w-5'}`} aria-hidden="true"/>:<span className={`mt-0.5 shrink-0 rounded-full border-2 border-muted-foreground/40 ${compact?'h-4 w-4':'h-5 w-5'}`} aria-hidden="true"/>}
        </span>
      </label>)}
    </div>
    {!shown.length && <p className="text-sm text-muted-foreground">{options.length?'Nenhuma opção encontrada.':'Nenhuma opção disponível no momento.'}</p>}
    {options.length>limit && !search && <Button type="button" variant="outline" className={`shrink-0 ${compact?'min-h-9':'min-h-11'}`} onClick={()=>setExpanded(v=>!v)}>{expanded?'Mostrar menos':`Ver todas as opções (${options.length})`}</Button>}
  </fieldset>;
}
