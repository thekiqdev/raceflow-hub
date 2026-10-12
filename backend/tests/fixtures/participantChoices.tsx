import React from 'react';
import { createRoot } from 'react-dom/client';
import { ParticipantChoices } from '../../../src/components/registration/ParticipantChoices';
import type { Category } from '../../../src/lib/api/categories';
import type { EventKit } from '../../../src/lib/api/eventKits';
import type { OrderChoices } from '../../../src/lib/api/checkoutOrders';
import type { Modality } from '../../../src/lib/api/modalities';
import '../../../src/index.css';
const categories=Array.from({length:8},(_,i)=>({id:`cat${i+1}`,name:`Categoria ${i+1}`,price:100,modality_ids:['mod'],batches:[],custom_fields:[{id:'answer',label:'Informação individual',field_type:'text'}]})) as Category[];
const kits=[{id:'kit',name:'Kit camiseta',price:0,category_ids:categories.map(c=>c.id),products:[{id:'shirt',name:'Camiseta',type:'variable',variants:[{id:'m',name:'M',available_quantity:3},{id:'g',name:'G',available_quantity:3},{id:'p',name:'P',available_quantity:0}]}]}] as EventKit[];
function Fixture() {
  const [value,setValue]=React.useState<OrderChoices>({});
  return <main className="mx-auto max-w-3xl p-4"><ParticipantChoices value={value} onChange={setValue} categories={categories} kits={kits} modalities={[{id:'mod',name:'Corrida',distance:'5 km'}] as Modality[]}/><output className="sr-only" aria-label="Escolhas JSON">{JSON.stringify(value)}</output></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
