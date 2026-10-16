import { useCallback, useEffect, useRef, useState } from 'react';
import { getCategories, type Category } from '@/lib/api/categories';
import { getEventKits, type EventKit } from '@/lib/api/eventKits';
import { getModalities, type Modality } from '@/lib/api/modalities';
import { getParticipant, type CheckoutParticipant } from '@/lib/api/checkoutParticipants';
import * as api from '@/lib/api/checkoutOrders';
import type { ApiResponse } from '@/lib/api/client';
import { clearReferralCoupon, getReferralCoupon } from '@/lib/referralCouponCache';
import type { ParticipantDraft } from './groupCheckoutModel';

type Resume={requestKey:string;orderId?:string;paymentKey?:string;method?:'PIX'|'CREDIT_CARD'};
export function unwrap<T>(response:ApiResponse<T>):T {
  if(!response.success || response.data===undefined) throw new Error(response.error || 'Não foi possível concluir. Tente novamente.');
  return response.data;
}
export function useGroupCheckout(eventId:string,buyerId:string,open:boolean,includeBuyer=false,resumeOrderId?:string,forceNew=false,referralCoupon?:string) {
  const storageKey=`checkout-order:${buyerId}:${eventId}`;
  const resume=useRef<Resume>();
  if(!resume.current) {
    try {resume.current=JSON.parse(sessionStorage.getItem(storageKey) || 'null') as Resume | undefined;} catch { /* Armazenamento indisponível. */ }
    if(forceNew) {
      resume.current={requestKey:crypto.randomUUID()};
      try {sessionStorage.setItem(storageKey,JSON.stringify(resume.current));} catch { /* Armazenamento indisponível. */ }
    } else {
      if(!resume.current?.requestKey) resume.current={requestKey:crypto.randomUUID()};
      if(resumeOrderId && resume.current.orderId!==resumeOrderId) resume.current={requestKey:crypto.randomUUID(),orderId:resumeOrderId};
    }
  }
  const [order,setOrder]=useState<api.CheckoutOrder|null>(null);
  const [draft,setDraft]=useState<ParticipantDraft[]>([]);
  const [participants,setParticipants]=useState<Record<string,CheckoutParticipant>>({});
  const [catalog,setCatalog]=useState<{categories:Category[];kits:EventKit[];modalities:Modality[]}>({categories:[],kits:[],modalities:[]});
  const [payment,setPayment]=useState<api.CheckoutPayment|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[dirty,setDirty]=useState(false);
  const [storageWarning,setStorageWarning]=useState(false),[ready,setReady]=useState(false);
  const [editing,setEditing]=useState(true);
  const busyRef=useRef(false),alive=useRef(true),started=useRef(false);
  const orderRef=useRef(order),draftRef=useRef(draft),dirtyRef=useRef(false);
  const persist=useCallback(()=> {
    try {sessionStorage.setItem(storageKey,JSON.stringify(resume.current));} catch {setStorageWarning(true);}
  },[storageKey]);
  useEffect(()=> {alive.current=true;return()=>{alive.current=false;};},[]);
  function referralCouponCode() {
    const fromProp=referralCoupon?.trim().toUpperCase();
    if(fromProp) return fromProp;
    const code=getReferralCoupon(eventId)?.cupom?.trim().toUpperCase();
    return code || undefined;
  }
  function defaultChoices():ParticipantDraft['choices'] {
    const coupon_code=referralCouponCode();
    return coupon_code?{coupon_code}:{};
  }
  /** Aplica cupom do link/cache só em itens ainda sem cupom (rascunho/revisão). */
  function seedDraftCoupons() {
    const code=referralCouponCode();
    const current=orderRef.current;
    if(!code || !current || !['draft','reviewed'].includes(current.status)) return;
    let changed=false;
    const next=draftRef.current.map(item=> {
      if(item.choices.coupon_code?.trim()) return item;
      changed=true;
      return {...item,choices:{...item.choices,coupon_code:code}};
    });
    // Direto no draft: pode rodar dentro de `run()` (busy=true), e o autosave persiste depois.
    if(!changed) return;
    draftRef.current=next;setDraft(next);dirtyRef.current=true;setDirty(true);setEditing(true);
  }
  function clearReferralIfConfirmed(status:string) {
    if(status==='confirmed') clearReferralCoupon(eventId);
  }
  function adopt(value:api.CheckoutOrder,replace=true) {
    orderRef.current=value;setOrder(value);
    clearReferralIfConfirmed(value.status);
    if(replace) {draftRef.current=value.items.map(i=>({participant_id:i.participant_id,choices:i.choices}));setDraft(draftRef.current);dirtyRef.current=false;setDirty(false);}
  }
  async function run(work:()=>Promise<void>) {
    if(busyRef.current) return false;
    busyRef.current=true;setBusy(true);setError('');
    try {await work();return true;} catch(e) {if(alive.current) setError(e instanceof Error?e.message:'Não foi possível concluir. Tente novamente.');return false;}
    finally {busyRef.current=false;if(alive.current) setBusy(false);}
  }
  async function hydrate(value:api.CheckoutOrder) {
    const results=await Promise.all(value.items.map(async item=> {
      // Fotografias de pedidos reservados não dependem da validade do rascunho de identidade.
      if(!['draft','reviewed'].includes(value.status)) return null;
      const response=await getParticipant(item.participant_id);
      return response.success && response.data ? response.data : null;
    }));
    if(alive.current) setParticipants(Object.fromEntries(results.filter((p):p is CheckoutParticipant=>!!p).map(p=>[p.id,p])));
  }
  async function load() {
    await run(async()=> {
      persist();
      const [cats,kits,mods,value]=await Promise.all([getCategories(eventId),getEventKits(eventId,{context:'public'}),getModalities(eventId),
        resume.current!.orderId ? api.getCheckoutOrder(resume.current!.orderId) : api.createCheckoutOrder(eventId,resume.current!.requestKey,includeBuyer)]);
      const next=unwrap(value);
      if(next.event_id!==eventId) throw new Error('Este pedido pertence a outro evento. Abra-o pela lista de inscrições.');
      // Salvar referência assim que conhecida, mesmo se o catálogo falhar.
      resume.current!.orderId=next.id;persist();
      if(!alive.current) return;
      setCatalog({categories:unwrap(cats),kits:unwrap(kits),modalities:unwrap(mods)});
      adopt(next);setEditing(next.status==='draft');
      await hydrate(next);
      if(!alive.current) return;
      seedDraftCoupons();
      setReady(true);
      if(['reserved','awaiting_payment','confirmed','needs_review','refunded'].includes(next.status)) await refreshPayment(next.id);
    });
  }
  useEffect(()=> {if(open && !started.current) {started.current=true;void load();}},[open]); // instance is keyed by buyer/event
  function change(next:ParticipantDraft[]) {
    if(busyRef.current || !orderRef.current || !['draft','reviewed'].includes(orderRef.current.status)) return;
    draftRef.current=next;setDraft(next);dirtyRef.current=true;setDirty(true);setEditing(true);setError('');
  }
  async function save() {
    const current=orderRef.current!;
    if(!dirtyRef.current) return current;
    const saved=unwrap(await api.saveCheckoutOrder(current.id,current.version,draftRef.current));
    if(alive.current) adopt(saved);
    return saved;
  }
  // Não repetir automaticamente uma gravação que falhou; a interface oferece salvar/recarregar.
  useEffect(()=> {
    if(!open || !dirty || busy || error || !ready) return;
    const timer=window.setTimeout(()=>void run(async()=>{await save();}),900);
    return()=>window.clearTimeout(timer);
  },[draft,open,dirty,busy,error,ready]);
  async function refreshPayment(id=orderRef.current!.id) {
    const result=unwrap(await api.getCheckoutPayment(id));
    const updated=unwrap(await api.getCheckoutOrder(id));
    if(alive.current) {setPayment(result);adopt(updated);}
  }
  function add(participant:CheckoutParticipant,replaceId?:string) {
    if(busyRef.current) {setError('Aguarde o salvamento e clique novamente em Salvar participante.');return false;}
    if(draftRef.current.some(d=>d.participant_id===participant.id && d.participant_id!==replaceId)) {setError('Este participante já está no pedido.');return false;}
    setParticipants(prev=>({...prev,[participant.id]:participant}));
    if(replaceId) change(draftRef.current.map(d=>d.participant_id===replaceId?{participant_id:participant.id,choices:participant.id===replaceId?d.choices:defaultChoices()}:d));
    else if(draftRef.current.length<20) change([...draftRef.current,{participant_id:participant.id,choices:defaultChoices()}]);
    else {setError('O limite é de 20 participantes por pedido.');return false;}
    return true;
  }
  function review() {return run(async()=> {
    const saved=await save();
    const reviewed=unwrap(await api.reviewCheckoutOrder(saved.id,saved.version));
    if(alive.current) {adopt(reviewed);setEditing(false);}
  });}
  function reserve() {return run(async()=> {
    const current=orderRef.current!;
    const reserved=unwrap(await api.reserveCheckoutOrder(current.id,current.version));
    if(alive.current) {adopt(reserved);setEditing(false);}
  });}
  function backToReview() {return run(async()=> {
    let current=orderRef.current!;
    // Seletor após Pix: abandona a cobrança aberta e só então libera a reserva.
    if(current.status==='awaiting_payment') {
      const latest=payment && !['failed','cancelled'].includes(payment.status)?payment:null;
      if(latest && !latest.cancel_requested) {
        const switched=unwrap(await api.switchCheckoutPayment(current.id));
        const updated=unwrap(await api.getCheckoutOrder(current.id));
        if(alive.current) {
          adopt(updated);
          setPayment(switched?.status==='cancelled' || switched?.status==='failed'?switched:null);
        }
        current=orderRef.current!;
      }
    }
    if(current.status!=='reserved') throw new Error('Só é possível voltar à revisão com reserva ativa sem pagamento.');
    const reviewed=unwrap(await api.unreserveCheckoutOrder(current.id));
    delete resume.current!.paymentKey;delete resume.current!.method;persist();
    if(alive.current) {adopt(reviewed);setPayment(null);setEditing(false);}
  });}
  function pay(method:'PIX'|'CREDIT_CARD',card?:{
    credit_card_token?:string;
    credit_card?:{holderName:string;number:string;expiryMonth:string;expiryYear:string;ccv:string};
    credit_card_holder_info?:{name:string;email:string;cpfCnpj:string;postalCode:string;addressNumber:string;
      addressComplement?:string;phone:string;mobilePhone?:string};
  }) {return run(async()=> {
    const current=orderRef.current!;
    let payload=card;
    if(method==='CREDIT_CARD') {
      // Mesmo caminho do pagamento legado: POST /payments com creditCard + holder (sem tokenizeCreditCard).
      if(card?.credit_card_token) {
        payload={credit_card_token:card.credit_card_token};
      } else if(card?.credit_card && card?.credit_card_holder_info) {
        payload={credit_card:card.credit_card,credit_card_holder_info:card.credit_card_holder_info};
      } else {
        throw new Error('Preencha os dados do cartão para pagar nesta tela.');
      }
    }
    if(payment?.status==='failed' || payment?.status==='cancelled') {
      delete resume.current!.paymentKey;delete resume.current!.method;
      // A falha/troca antiga já foi consumida. Se a nova resposta se perder, reutilizar a nova chave.
      setPayment(null);
    }
    if(resume.current!.method && resume.current!.method!==method) {
      // Pedido ainda reservado: o usuário pode mudar Pix ↔ cartão antes de uma nova cobrança.
      if(current.status==='reserved') {
        delete resume.current!.paymentKey;delete resume.current!.method;persist();
      } else {
        throw new Error('Consulte a tentativa já iniciada antes de trocar a forma de pagamento.');
      }
    }
    resume.current!.paymentKey ??=crypto.randomUUID();resume.current!.method=method;persist();
    const result=unwrap(await api.startCheckoutPayment(current.id,resume.current!.paymentKey!,method,payload));
    if(alive.current) setPayment(result);
    const updated=unwrap(await api.getCheckoutOrder(current.id));
    if(alive.current) adopt(updated);
  });}
  function switchPayment() {return run(async()=> {
    const current=orderRef.current!;
    const result=unwrap(await api.switchCheckoutPayment(current.id));
    delete resume.current!.paymentKey;delete resume.current!.method;persist();
    const updated=unwrap(await api.getCheckoutOrder(current.id));
    if(alive.current) {
      adopt(updated);
      setPayment(result);
      if(updated.status==='reserved' || result?.status==='cancelled' || result?.status==='failed') {
        // Troca concluída: libera seletor de meio sem reutilizar a chave anterior.
        setPayment(result?.status==='cancelled' || result?.status==='failed' ? result : null);
      }
    }
  });}
  function reload() {return run(async()=> {
    const [cats,kits,mods]=await Promise.all([getCategories(eventId),getEventKits(eventId,{context:'public'}),getModalities(eventId)]);
    if(alive.current) setCatalog({categories:unwrap(cats),kits:unwrap(kits),modalities:unwrap(mods)});
    const current=unwrap(await api.getCheckoutOrder(orderRef.current!.id));
    if(alive.current) {adopt(current);setEditing(current.status==='draft');}
    await hydrate(current);
    if(['awaiting_payment','confirmed','needs_review','refunded','reserved'].includes(current.status)) await refreshPayment(current.id);
  });}
  function cancel() {return run(async()=> {
    const next=unwrap(await api.cancelCheckoutOrder(orderRef.current!.id));
    if(alive.current) {
      adopt(next);
      if(['cancelled','expired'].includes(next.status)) {
        delete resume.current!.paymentKey;delete resume.current!.method;persist();
      }
    }
    if(next.status==='awaiting_payment') await refreshPayment(next.id);
  });}
  function newOrder() {return run(async()=> {
    if(resume.current!.orderId===orderRef.current?.id) resume.current={requestKey:crypto.randomUUID()};
    persist();
    const value=unwrap(await api.createCheckoutOrder(eventId,resume.current!.requestKey,includeBuyer));
    resume.current!.orderId=value.id;persist();
    if(alive.current) {adopt(value);setPayment(null);setParticipants({});setEditing(true);await hydrate(value);seedDraftCoupons();}
  });}
  function addBuyer() {return run(async()=> {
    const renewing=!!orderRef.current?.buyer?.participant_id && draftRef.current.some(d=>d.participant_id===orderRef.current!.buyer!.participant_id);
    // Renovação pode ser necessária justamente porque a identidade expirada impede salvar.
    const saved=renewing?orderRef.current!:await save();
    const value=unwrap(await api.addCheckoutBuyer(saved.id,saved.version));
    if(alive.current) {adopt(value,!(renewing && dirtyRef.current));setEditing(true);await hydrate(value);seedDraftCoupons();}
  });}
  return {order,draft,participants,catalog,payment,busy,error,dirty,storageWarning,ready,editing,setEditing,setError,
    change,add,addBuyer,review,reserve,backToReview,pay,switchPayment,cancel,reload,newOrder,load,save:()=>run(async()=>{await save();}),
    refresh:()=>run(()=>refreshPayment()),preferredMethod:resume.current.method};
}
