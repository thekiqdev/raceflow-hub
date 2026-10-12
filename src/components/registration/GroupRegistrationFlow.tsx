import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar, CheckCircle2, ChevronDown, ChevronLeft, Clock, Copy, Loader2, MapPin, Plus, Trash2 } from 'lucide-react';
import { ParticipantIdentityForm } from './ParticipantIdentityForm';
import { ParticipantChoices, type ChoicesNav } from './ParticipantChoices';
import { useGroupCheckout } from './useGroupCheckout';
import { CheckoutLeaveGuard } from './CheckoutLeaveGuard';
import { CheckoutActionBar, CheckoutPaymentPanel } from './CheckoutPaymentPanel';
import { checkParticipantEligibility } from '@/lib/api/checkoutParticipants';
import { choiceProblems, copyChoices, money, paymentMethodAvailable, participantProgress, choicesSignature, type ParticipantDraft } from './groupCheckoutModel';
import { formatDateOnlyBrasilia, formatTimeBrasilia } from '@/lib/utils';
import heroImage from '@/assets/hero-running.jpg';

interface EventInfo {
  id:string;title:string;pix_enabled?:boolean|null;pix_disabled_at?:string|null;
  credit_card_enabled?:boolean|null;credit_card_disabled_at?:string|null;
  banner_url?:string|null;event_date?:string|null;location?:string|null;city?:string|null;state?:string|null;
}
export function GroupRegistrationFlow({open,onOpenChange,event,buyerId,mode='dialog',resumeOrderId,forceNew=false,referralCoupon}:{open:boolean;onOpenChange:(open:boolean)=>void;event:EventInfo;buyerId:string;mode?:'page'|'dialog';resumeOrderId?:string;forceNew?:boolean;referralCoupon?:string}) {
  const pageMode=mode==='page';
  // Sempre consulta o status do comprador (já inscrito / incompleto) para orientar a compra de terceiros.
  const flow=useGroupCheckout(event.id,buyerId,open,true,resumeOrderId,forceNew,referralCoupon);
  const {order,draft,catalog,participants,payment,busy,error,dirty,editing}=flow;
  const [identity,setIdentity]=useState<string|null>(null);
  const pendingChanges=dirty || identity!==null;
  const [expanded,setExpanded]=useState<string|null>(null);
  const expandedOrder=useRef<string|null>(null);
  const expandedBuyer=useRef<string|null>(null);
  const openedOtherForRegistered=useRef<string|null>(null);
  useEffect(()=> {
    if(pageMode && order && (expandedOrder.current!==order.id || order.buyer?.participant_id && expandedBuyer.current!==order.buyer.participant_id)) {
      expandedOrder.current=order.id;
      setExpanded(order.buyer?.participant_id ?? order.items[0]?.participant_id ?? null);
    }
    expandedBuyer.current=order?.buyer?.participant_id ?? null;
  },[pageMode,order]);
  const buyerAlreadyRegistered=order?.buyer?.status==='already_registered';
  useEffect(()=> {
    if(!flow.ready || !order || !buyerAlreadyRegistered || draft.length>0 || identity!==null) return;
    if(openedOtherForRegistered.current===order.id) return;
    openedOtherForRegistered.current=order.id;
    setIdentity('new');
  },[flow.ready,order,buyerAlreadyRegistered,draft.length,identity]);
  const [method,setMethod]=useState<'PIX'|'CREDIT_CARD'>('PIX');
  const [now,setNow]=useState(Date.now());
  const [copySource,setCopySource]=useState<string|null>(null),[copyBusy,setCopyBusy]=useState(false);
  const [copyTarget,setCopyTarget]=useState<string|null>(null),[copyCoupon,setCopyCoupon]=useState(false),[replaceConfirmed,setReplaceConfirmed]=useState(false);
  const [issues,setIssues]=useState<Record<string,{signature:string;message:string}>>({});
  const [notice,setNotice]=useState('');
  const [copyPreview,setCopyPreview]=useState<Array<{id:string;eligible:boolean;reason:string;selected:boolean}>>([]);
  const [choicesNav,setChoicesNav]=useState<ChoicesNav|null>(null);
  const onChoicesNav=useCallback((nav:ChoicesNav|null)=>setChoicesNav(nav),[]);
  const [paymentFooterHost,setPaymentFooterHost]=useState<HTMLElement|null>(null);
  const [shellHeight,setShellHeight]=useState<number|null>(null);
  const midRef=useRef<HTMLDivElement>(null);
  const copyRef=useRef<HTMLElement>(null);
  const copySignature=useRef('');
  const errorRef=useRef<HTMLDivElement>(null),headingRef=useRef<HTMLHeadingElement>(null);
  const editable=!!order && ['draft','reviewed'].includes(order.status);
  const step=!order?0:editable ? (editing || dirty || order.status==='draft' ? 0 : 1) : 2;
  const disabled=busy || copyBusy;
  const canLeavePayment=order?.status==='reserved' && (!payment || ['failed','cancelled'].includes(payment.status))
    || (order?.status==='awaiting_payment' && !!payment && ['pending','preparing'].includes(payment.status) && !payment.cancel_requested);
  function canGoToStep(target:number) {
    if(disabled || target>=step) return false;
    if(step===1 && target===0) return editable;
    if(step===2 && (target===0 || target===1)) return !!canLeavePayment;
    return false;
  }
  async function goToStep(target:number) {
    if(!canGoToStep(target)) return;
    if(step===2) {
      if(!(await flow.backToReview())) return;
      if(target===0) flow.setEditing(true);
      return;
    }
    if(step===1 && target===0) flow.setEditing(true);
  }
  // preferredMethod com payment null = retomar CTA; não força o rádio (usuário pode voltar ao Pix no cartão).
  const activeAttempt=!!payment && !['failed','cancelled'].includes(payment.status);
  const methodLocked=!!flow.preferredMethod && (!payment || activeAttempt);
  const chosenMethod=activeAttempt && payment!.method!=='FREE' ? payment!.method
    :paymentMethodAvailable(event,method,now)?method:paymentMethodAvailable(event,'PIX',now)?'PIX':paymentMethodAvailable(event,'CREDIT_CARD',now)?'CREDIT_CARD':'PIX';
  const identityReady=(id:string)=>!!participants[id]?.ready && new Date(participants[id].expires_at).getTime()>now;
  const needsIdentity=draft.some(d=>!identityReady(d.participant_id));
  function progress(item:ParticipantDraft) {
    const issue=issues[item.participant_id];
    return participantProgress(item.choices,catalog.categories,catalog.kits,{identityReady:identityReady(item.participant_id),
      savedChoices:order?.items.find(i=>i.participant_id===item.participant_id)?.choices,
      reviewIssue:issue?.signature===choicesSignature(item.choices)?issue.message:undefined});
  }
  const completed=draft.filter(d=>progress(d).state==='complete').length;
  const copyReplaces=copyPreview.some(p=>p.selected && p.eligible && !!draft.find(d=>d.participant_id===p.id)?.choices.category_id);
  function selectionSummary(item:ParticipantDraft) {
    return [catalog.categories.find(c=>c.id===item.choices.category_id)?.name,catalog.modalities.find(m=>m.id===item.choices.modality_id)?.name,
      catalog.kits.find(k=>k.id===item.choices.kit_id)?.name].filter(Boolean).join(' · ');
  }
  function participantName(id:string,index:number) {
    if(id===order?.buyer?.participant_id) return `Sua inscrição · ${order.buyer.full_name}`;
    const identified=participants[id];const snapshot=order?.items.find(i=>i.participant_id===id)?.participant;
    return identified?.full_name || snapshot?.full_name || `Participante ${index+1}`;
  }
  function participantCpf(id:string) {return participants[id]?.cpf_masked || order?.items.find(i=>i.participant_id===id)?.participant?.cpf_masked;}
  const label=(id:string,index:number)=>`${participantName(id,index)}${participantCpf(id)?` · ${participantCpf(id)}`:''}`;
  useEffect(()=> {if(open) {const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer);}},[open]);
  useEffect(()=> {if(error) errorRef.current?.focus();},[error]);
  useEffect(()=> {headingRef.current?.focus();},[step]);
  useEffect(()=> {if(copySource) copyRef.current?.scrollIntoView({block:'nearest'});},[copySource]);
  useEffect(()=> {
    if(!pageMode) return;
    const vv=window.visualViewport;
    if(!vv) return;
    const sync=()=>setShellHeight(Math.round(vv.height));
    sync();
    vv.addEventListener('resize',sync);
    vv.addEventListener('scroll',sync);
    return()=>{vv.removeEventListener('resize',sync);vv.removeEventListener('scroll',sync);};
  },[pageMode]);
  useEffect(()=> {
    if(!pageMode) return;
    const mid=midRef.current;
    if(!mid) return;
    const onFocus=(e:FocusEvent)=>{
      const target=e.target;
      if(!(target instanceof HTMLElement)) return;
      if(!['INPUT','TEXTAREA','SELECT'].includes(target.tagName)) return;
      window.setTimeout(()=>target.scrollIntoView({block:'center',behavior:'smooth'}),50);
    };
    mid.addEventListener('focusin',onFocus);
    return()=>mid.removeEventListener('focusin',onFocus);
  },[pageMode,step,identity]);
  useEffect(()=> {
    if(identity===null) return;
    window.requestAnimationFrame(()=> {
      const el=document.getElementById('participant-identity');
      el?.scrollIntoView({behavior:'smooth',block:'start'});
      el?.querySelector<HTMLElement>('input,button,select,textarea')?.focus({preventScroll:true});
    });
  },[identity]);
  useEffect(()=> {
    const warn=(e:BeforeUnloadEvent)=>{if(pendingChanges){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[pendingChanges]);
  // Consultas manuais e ao voltar da fatura; sem polling que bloqueie a edição.
  useEffect(()=> {
    if(!open || order?.status!=='awaiting_payment') return;
    const onFocus=()=>{if(document.visibilityState==='visible') void flow.refresh();};
    window.addEventListener('focus',onFocus);document.addEventListener('visibilitychange',onFocus);
    return()=>{window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onFocus);};
  },[open,order?.status,flow.refresh]);
  function close(next:boolean) {
    if(!next && disabled) return;
    if(!pageMode && !next && pendingChanges && !window.confirm('Há alterações ainda não salvas. Deseja sair e descartar essas alterações?')) return;
    onOpenChange(next);
  }
  async function previewCopy(id:string,targetId?:string) {
    const source=draft.find(d=>d.participant_id===id)!;
    const problems=choiceProblems(source.choices,catalog.categories,catalog.kits);
    if(problems.length) {flow.setError(`Complete as escolhas antes de copiar: ${problems.join(' ')}`);return;}
    if(progress(source).state!=='complete') {flow.setError('Salve e confira as escolhas da origem antes de copiar.');return;}
    setCopyBusy(true);setCopySource(id);setCopyTarget(targetId ?? null);setCopyCoupon(false);setReplaceConfirmed(false);setCopyPreview([]);copySignature.current=choicesSignature(draft);
    try {
      const results:Array<{id:string;eligible:boolean;reason:string;selected:boolean}>=[];
      for(const target of draft.filter(d=>d.participant_id!==id && (!targetId || d.participant_id===targetId))) {
        if(!identityReady(target.participant_id)) {results.push({id:target.participant_id,eligible:false,reason:'Identifique novamente este participante.',selected:false});continue;}
        const result=await checkParticipantEligibility(target.participant_id,source.choices.category_id!);
        const eligible=result.success && result.data?.eligible===true;
        results.push({id:target.participant_id,eligible,selected:eligible,reason:eligible?'Compatível com a categoria.':result.data?.message || result.error || 'Não foi possível confirmar a compatibilidade.'});
      }
      setCopyPreview(results);
    } catch {flow.setError('Não foi possível conferir a cópia. Tente novamente.');setCopySource(null);}
    finally {setCopyBusy(false);}
  }
  function applyCopy() {
    if(choicesSignature(draft)!==copySignature.current) {flow.setError('As escolhas mudaram. Confira novamente quem receberá a cópia.');setCopySource(null);return;}
    const source=draft.find(d=>d.participant_id===copySource)!;
    if(progress(source).state!=='complete' || copyReplaces && !replaceConfirmed) return;
    if(copyPreview.some(p=>p.selected && p.eligible && !identityReady(p.id))) {
      flow.setError('A identificação de um participante venceu. Renove os dados e confira a cópia novamente.');setCopySource(null);return;
    }
    flow.change(draft.map(d=>copyPreview.some(p=>p.id===d.participant_id && p.eligible && p.selected)
      ? {...d,choices:copyChoices(source.choices,d.choices,copyCoupon)} : d));
    if(copyTarget) setExpanded(copyTarget);
    setCopySource(null);setCopyTarget(null);setCopyPreview([]);setNotice('Escolhas copiadas. Confira as opções e as informações individuais antes de concluir.');
  }
  async function finishParticipant(item:ParticipantDraft) {
    if(!identityReady(item.participant_id) || choiceProblems(item.choices,catalog.categories,catalog.kits).length) return;
    setCopyBusy(true);setNotice('');
    try {
      const result=await checkParticipantEligibility(item.participant_id,item.choices.category_id!);
      if(!result.success || !result.data?.eligible) {
        setIssues(prev=>({...prev,[item.participant_id]:{signature:choicesSignature(item.choices),message:result.data?.message || result.error || 'Confira a elegibilidade deste participante.'}}));
        return;
      }
      setIssues(prev=>{const next={...prev};delete next[item.participant_id];return next;});
      if(!await flow.save()) return;
      const others=draft.filter(d=>d.participant_id!==item.participant_id);
      const next=others.find(d=>progress(d).state!=='complete');
      setExpanded(next?.participant_id ?? null);
      setNotice(next?'Escolhas salvas. Continue com o próximo participante.':'Escolhas salvas. Você pode adicionar participantes ou revisar o pedido.');
      window.requestAnimationFrame(()=>document.getElementById(`participant-${next?.participant_id ?? item.participant_id}`)?.focus());
    } catch {flow.setError('Não foi possível conferir o participante. Tente novamente.');}
    finally {setCopyBusy(false);}
  }
  async function review() {
    for(const [index,item] of draft.entries()) {
      const problems=choiceProblems(item.choices,catalog.categories,catalog.kits);
      if(problems.length) {setExpanded(item.participant_id);flow.setError(`Participante ${index+1}: ${problems.join(' ')}`);return;}
    }
    await flow.review();
  }
  const deadline=step===1?order?.review_expires_at:order?.reservation_expires_at;
  const remaining=deadline?Math.max(0,Math.ceil((new Date(deadline).getTime()-now)/1000)):null;
  const Title=pageMode?'h1':DialogTitle;
  const Description=pageMode?'p':DialogDescription;
  const expandedItem=expanded?draft.find(d=>d.participant_id===expanded):undefined;
  const expandedProblems=expandedItem?choiceProblems(expandedItem.choices,catalog.categories,catalog.kits):[];
  const canConcludeExpanded=!!expandedItem && identity===null && !copySource && identityReady(expandedItem.participant_id) && !expandedProblems.length && (!pageMode || !!choicesNav?.isExtras);
  const primaryChoiceAction=canConcludeExpanded?'conclude':choicesNav?.canContinue?'continue':null;
  const locationLine=[event.location,event.city && event.state?`${event.city} - ${event.state}`:event.city || event.state].filter(Boolean).join(', ');
  const showShellFooter=pageMode && flow.ready && ((step===0 && identity===null && !copySource) || step===1 || step===2);
  useEffect(()=> {if(!expanded) setChoicesNav(null);},[expanded]);
  const content=<>
      {pageMode && <CheckoutLeaveGuard unsaved={pendingChanges}/>}
      <header className={`relative shrink-0 overflow-hidden text-left ${pageMode?'text-white':''}`}>
        {pageMode && <div className="absolute inset-0">
          <img src={event.banner_url || heroImage} alt="" className="h-full w-full object-cover" onError={e=>{const t=e.currentTarget;if(!t.src.endsWith('hero-running.jpg')) t.src=heroImage;}}/>
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 to-black/25"/>
        </div>}
        <div className={`relative z-10 px-3 pb-3 pt-2 sm:px-6 sm:pb-4 sm:pt-3 ${pageMode?'':'border-b bg-background/95 py-2.5 sm:py-4'}`}>
          <div className={`flex items-start gap-2 ${pageMode?'mx-auto w-full max-w-3xl lg:max-w-4xl':''}`}>
            {pageMode && <Button variant="ghost" size="sm" className="h-8 shrink-0 -ml-1 px-2 text-xs text-white hover:bg-white/15 hover:text-white sm:text-sm" disabled={disabled} onClick={()=>close(false)}>← Voltar ao evento</Button>}
            <div className="min-w-0 flex-1">
              <Title className={`truncate font-bold leading-tight ${pageMode?'text-lg drop-shadow sm:text-2xl lg:text-3xl':'text-base font-semibold sm:text-2xl'}`}>{pageMode?event.title:`Inscrições · ${event.title}`}</Title>
              {pageMode ? <Description className="sr-only">{buyerAlreadyRegistered?'Você já está inscrito. Pode inscrever outra pessoa neste pedido.':'Compre para você ou adicione outros corredores.'}</Description>
                : <Description className="mt-0.5 line-clamp-2 text-xs text-muted-foreground sm:mt-1.5 sm:line-clamp-none sm:text-sm">{buyerAlreadyRegistered?'Você já está inscrito. Pode inscrever outra pessoa neste pedido.':'Compre para você ou adicione outros corredores.'}</Description>}
              {pageMode && (event.event_date || locationLine) && <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/90 sm:mt-2 sm:text-sm">
                {event.event_date && <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true"/>{formatDateOnlyBrasilia(event.event_date)}</span>}
                {event.event_date && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true"/>{formatTimeBrasilia(event.event_date)}</span>}
                {!!locationLine && <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true"/><span className="truncate">{locationLine}</span></span>}
              </div>}
            </div>
          </div>
          <ol aria-label="Etapas da compra" className={`mt-2.5 grid grid-cols-3 gap-1 rounded-lg p-1 text-[11px] sm:text-xs ${pageMode?'mx-auto max-w-3xl bg-black/25 backdrop-blur-sm lg:max-w-4xl':'bg-muted/50 sm:mt-3 sm:flex sm:gap-5 sm:bg-transparent sm:p-0 sm:text-sm'}`}>
            {['Participantes','Revisão','Pagamento'].map((name,i)=> {
              const current=i===step;
              const clickable=canGoToStep(i);
              const tone=pageMode
                ?(current?'bg-white font-semibold text-foreground shadow-sm':clickable?'text-white hover:bg-white/15':'text-white/80')
                :(current?'bg-background font-semibold text-primary shadow-sm sm:bg-transparent sm:px-0 sm:py-0 sm:text-left sm:shadow-none':clickable?'text-primary sm:px-0 sm:py-0 sm:text-left':'text-muted-foreground sm:px-0 sm:py-0 sm:text-left');
              return <li key={name} aria-current={current?'step':undefined} className={`rounded-md text-center ${pageMode?'':'sm:text-left'}`}>
                {clickable
                  ? <button type="button" className={`w-full rounded-md px-1.5 py-1.5 ${tone}`} disabled={disabled} onClick={()=>void goToStep(i)}>{i+1}. {name}</button>
                  : <span className={`block px-1.5 py-1.5 ${tone}`}>{i+1}. {name}</span>}
              </li>;
            })}
          </ol>
        </div>
      </header>
      <div ref={midRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-6 lg:px-8">
        {error && <div ref={errorRef} tabIndex={-1} role="alert" className="mx-auto mb-4 max-w-3xl rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive lg:max-w-4xl">
          <p>{error}</p>{order && <Button type="button" variant="outline" className="mt-3 text-foreground" disabled={disabled} onClick={()=> {
            if(!dirty || window.confirm('Recarregar as escolhas salvas no servidor? As alterações locais ainda não salvas serão substituídas.')) void flow.reload();
          }}>Recarregar pedido salvo</Button>}
        </div>}
        {!flow.ready ? <div className="flex min-h-48 flex-col items-center justify-center gap-4" role="status">
          {busy?<><Loader2 className="animate-spin" aria-hidden="true"/>Preparando sua inscrição…</>:<Button onClick={()=>void flow.load()}>Tentar carregar novamente</Button>}
        </div> : <div className={`min-w-0 ${pageMode?'mx-auto w-full max-w-3xl lg:max-w-4xl':''}`}>
          <main className="min-w-0 space-y-3 sm:space-y-5" aria-busy={disabled}>
            {flow.storageWarning && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">Seu navegador não permite guardar a referência do pedido. Mantenha esta página aberta até concluir.</p>}
            <div className={`space-y-1 ${step===0 && expanded?'hidden sm:block':''}`}>
              <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none sm:text-xl">{step===0?'Quem vai correr?':step===1?'Confira as inscrições':'Conclua seu pedido'}</h2>
              {step===0 && <p className="text-xs text-muted-foreground sm:text-sm">
                {buyerAlreadyRegistered
                  ? 'Informe o CPF de outra pessoa para escolher categoria, modalidade e kit.'
                  : 'Escolha as opções e siga para o pagamento. Adicionar outras pessoas é opcional.'}
              </p>}
            </div>
            {step===0 && <>
              {order?.buyer && !buyerAlreadyRegistered && <section className="space-y-3 rounded-xl border bg-muted/20 p-4" aria-label="Dados do comprador">
                <h3 className="font-semibold">Sua inscrição</h3>
                <p className="break-words text-sm">{order.buyer.full_name || 'Complete seu nome no perfil'}</p>
                <p className="break-all text-sm text-muted-foreground">{order.buyer.email}{order.buyer.cpf_masked && ` · ${order.buyer.cpf_masked}`}</p>
                {['incomplete','ambiguous'].includes(order.buyer.status) && <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="status">
                  <p className="font-medium">Sua inscrição ainda não foi incluída no pedido.</p>
                  {order.buyer.status==='ambiguous' ? <p>Seu CPF está associado a mais de um perfil. A administração precisa conferir o cadastro antes de incluir sua inscrição.</p> : <>
                    <p>Precisamos corrigir os seguintes dados do seu cadastro:</p>
                    <ul className="list-disc space-y-1 pl-5">{order.buyer.issues?.length ? order.buyer.issues.map(issue=><li key={issue.field}>{issue.message}</li>) : <li>Confira CPF, nome completo, nascimento e sexo com a administração.</li>}</ul>
                    <p>Esses dados só podem ser corrigidos pela administração, conforme a regra atual da plataforma.</p>
                  </>}
                  <p>Você não precisa adicionar outra pessoa para comprar seu próprio ingresso.</p>
                  <Button variant="outline" className="min-h-11 h-auto whitespace-normal" disabled={disabled} onClick={()=>void flow.reload()}>Já corrigi meus dados · verificar novamente</Button>
                </div>}
                {order.buyer.status==='ready' && (draft.some(d=>d.participant_id===order.buyer!.participant_id)
                  ? <Button variant="outline" className="h-auto min-h-11 max-w-full whitespace-normal" disabled={disabled} onClick={()=>flow.change(draft.filter(d=>d.participant_id!==order.buyer!.participant_id))}>Vou comprar apenas para outras pessoas</Button>
                  : <><p className="text-sm">Seus dados estão prontos. Inclua sua inscrição para escolher categoria, modalidade e kit.</p><Button className="min-h-12" disabled={disabled || draft.length>=20} onClick={()=>void flow.addBuyer()}>Adicionar minha inscrição</Button></>)}
              </section>}
              {buyerAlreadyRegistered && identity===null && draft.length===0 && (
                <p className="text-sm text-muted-foreground" role="status">Você já possui uma inscrição neste evento. Informe o CPF de outra pessoa para continuar.</p>
              )}
              {draft.length>0 && <section className={`space-y-1.5 rounded-lg bg-muted/30 px-3 py-2.5 sm:space-y-2 sm:rounded-xl sm:p-4 ${expanded?'hidden sm:block':''}`} aria-label="Progresso dos participantes">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold sm:text-sm">{completed}/{draft.length} com escolhas completas</p>
                  <p className="text-[11px] text-muted-foreground sm:text-xs">Após revisão e pagamento</p>
                </div>
                <progress className="h-1.5 w-full accent-primary sm:h-2" value={completed} max={Math.max(1,draft.length)} aria-label="Participantes com escolhas completas"/>
              </section>}
              {notice && <p role="status" className="rounded-xl border border-primary/20 p-3 text-sm">{notice}</p>}
              <fieldset disabled={disabled} className="min-w-0 space-y-3 sm:space-y-4">
                {draft.map((item,index)=> {
                  const person=participants[item.participant_id];
                  const problems=choiceProblems(item.choices,catalog.categories,catalog.kits);
                  const stage=progress(item);
                  const sources=draft.filter(d=>d.participant_id!==item.participant_id && progress(d).state==='complete');
                  const expandedNow=expanded===item.participant_id;
                  return <section key={item.participant_id} className={`overflow-hidden rounded-xl border ${expandedNow?'border-primary/50 shadow-sm':''}`}>
                    <button id={`participant-${item.participant_id}`} type="button" className="flex min-h-14 w-full items-center justify-between gap-3 p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:min-h-20 sm:p-4" aria-expanded={expandedNow} aria-controls={`choices-${item.participant_id}`} onClick={()=>setExpanded(expandedNow?null:item.participant_id)}>
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold sm:h-9 sm:w-9 ${stage.state==='complete'?'bg-green-100 text-green-800':'bg-muted text-muted-foreground'}`} aria-hidden="true">{stage.state==='complete'?<CheckCircle2 className="h-5 w-5"/>:index+1}</span>
                      <span className="min-w-0"><span className="block break-words text-sm font-medium sm:text-base">{label(item.participant_id,index)}</span>
                        <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium sm:mt-1 sm:text-xs ${stage.state==='complete'?'bg-green-100 text-green-800':stage.state==='needs_review'?'bg-amber-100 text-amber-900':'bg-muted text-muted-foreground'}`}>{stage.label}</span>
                        {selectionSummary(item) && <span className="mt-1 block break-words text-[11px] text-muted-foreground sm:mt-2 sm:text-xs">{selectionSummary(item)}</span>}
                      </span><ChevronDown className={`h-5 w-5 shrink-0 ${expandedNow?'rotate-180':''}`} aria-hidden="true"/>
                    </button>
                    <div id={`choices-${item.participant_id}`} hidden={!expandedNow} className="space-y-4 border-t p-3 sm:p-4">
                      {draft.length>1 && identityReady(item.participant_id) && <div className="space-y-3">
                        <Button type="button" variant="outline" className="h-auto min-h-12 w-full whitespace-normal" disabled={!sources.length} onClick={()=>{setCopyTarget(item.participant_id);setCopySource(null);}}><Copy className="mr-2 h-4 w-4 shrink-0"/>Copiar de outro participante</Button>
                        {!sources.length && <p className="text-xs text-muted-foreground">Complete e salve outro participante para aproveitar suas escolhas.</p>}
                        {copyTarget===item.participant_id && !copySource && <div className="space-y-2 rounded-xl bg-muted/40 p-3" aria-label="Escolher origem da cópia">
                          <p className="text-sm font-medium">De quem deseja copiar?</p>
                          {sources.map(source=><Button key={source.participant_id} type="button" variant="outline" className="h-auto min-h-12 w-full justify-start whitespace-normal text-left" onClick={()=>void previewCopy(source.participant_id,item.participant_id)}>{participantName(source.participant_id,draft.indexOf(source))}</Button>)}
                          <Button type="button" variant="ghost" onClick={()=>setCopyTarget(null)}>Cancelar escolha da origem</Button>
                        </div>}
                      </div>}
                      {identityReady(item.participant_id) ? <ParticipantChoices value={item.choices} categories={catalog.categories} kits={catalog.kits} modalities={catalog.modalities}
                        embedNav={!pageMode} onNavChange={expandedNow?onChoicesNav:undefined}
                        onChange={choices=>flow.change(draft.map(d=>d.participant_id===item.participant_id?{...d,choices}:d))}/> :
                        <p className="text-sm">{item.participant_id===order?.buyer?.participant_id?'Atualize seus dados para continuar com as escolhas já preenchidas.':'Informe o CPF novamente para conferir os dados e continuar.'}</p>}
                      {!!stage.problems.length && <ul className="list-inside list-disc space-y-1 rounded-xl bg-amber-50 p-3 text-sm text-amber-950" aria-label="Pendências deste participante">{stage.problems.map((problem,i)=><li key={i}>{problem}</li>)}</ul>}
                      <p className="text-xs text-muted-foreground">{!stage.saved?(busy?'Salvando alterações…':error?'Não foi possível salvar. Use “Salvar agora” para tentar novamente.':'Alterações aguardando salvamento.'):'Escolhas salvas.'}</p>
                      {!pageMode && <Button type="button" className="h-auto min-h-12 w-full whitespace-normal" disabled={!identityReady(item.participant_id) || !!problems.length} onClick={()=>void finishParticipant(item)}>Concluir participante</Button>}
                      {(!identityReady(item.participant_id) || (expandedNow && choicesNav?.isLastStep)) && <div className="flex flex-wrap gap-2">
                        {item.participant_id===order?.buyer?.participant_id
                          ? <Button type="button" variant="outline" onClick={()=>void flow.addBuyer()}>Atualizar meus dados</Button>
                          : <Button type="button" variant="outline" onClick={()=>setIdentity(item.participant_id)}>Identificar novamente</Button>}
                        {draft.length>1 && person?.ready && <Button type="button" variant="outline" disabled={stage.state!=='complete'} onClick={()=>void previewCopy(item.participant_id)}><Copy className="mr-2 h-4 w-4"/>Aplicar a outros</Button>}
                        <Button type="button" variant="ghost" className="text-destructive" onClick={()=>{flow.change(draft.filter(d=>d.participant_id!==item.participant_id));setCopySource(null);}} aria-label={`Remover participante ${index+1}`}><Trash2 className="mr-2 h-4 w-4"/>Remover</Button>
                      </div>}
                    </div>
                  </section>;
                })}
                {identity!==null ? <section id="participant-identity" className="scroll-mt-28 space-y-3 rounded-xl border border-primary/40 p-3 sm:space-y-4 sm:p-4 sm:scroll-mt-8">
                  <h3 className="font-semibold">{identity==='new'?(buyerAlreadyRegistered?'Inscrever outro participante':'Adicionar participante'):'Renovar identificação'}</h3>
                  {buyerAlreadyRegistered && identity==='new' && <p className="text-xs text-muted-foreground sm:text-sm">Informe o CPF de quem ainda não está inscrito neste evento.</p>}
                  <ParticipantIdentityForm key={identity} eventId={event.id} excludedParticipantIds={draft.filter(d=>d.participant_id!==identity).map(d=>d.participant_id)} onReady={person=>{
                    if(flow.add(person,identity==='new'?undefined:identity)) {
                      setExpanded(person.id);setIdentity(null);setCopySource(null);
                      window.requestAnimationFrame(()=>document.getElementById(`participant-${person.id}`)?.scrollIntoView({behavior:'smooth',block:'start'}));
                    }
                  }}/>
                  <Button type="button" variant="ghost" onClick={()=>setIdentity(null)}>Voltar à lista</Button>
                </section> : !pageMode && <Button type="button" variant={buyerAlreadyRegistered && draft.length===0?'default':'outline'} className={`min-h-12 w-full ${buyerAlreadyRegistered && draft.length===0?'':'border-dashed'}`} disabled={draft.length>=20} onClick={()=>setIdentity('new')}><Plus className="mr-2 h-4 w-4"/>{buyerAlreadyRegistered?'Inscrever outro participante':'Adicionar outro participante'}</Button>}
              </fieldset>
              {copySource && <section ref={copyRef} className="space-y-3 rounded-xl border bg-muted/30 p-4" aria-label="Aplicar escolhas a outros participantes">
                <h3 className="font-semibold">Aplicar estas escolhas</h3>
                <p className="text-sm text-muted-foreground">Copia categoria, modalidade, lote, kit e variantes. Respostas pessoais não são copiadas. Vagas, estoque e descontos serão conferidos na revisão.</p>
                {copyBusy?<p role="status">Verificando compatibilidade…</p>:<>
                  {!copyTarget && <Button type="button" variant="ghost" disabled={disabled} onClick={()=>setCopyPreview(prev=>prev.map(p=>({...p,selected:p.eligible})))}>Selecionar todos os compatíveis</Button>}
                  {copyPreview.map(p=><label key={p.id} className="flex min-h-12 items-start gap-3 rounded-md p-2 text-sm">
                    <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" disabled={!p.eligible || disabled} checked={p.selected} onChange={e=>setCopyPreview(prev=>prev.map(row=>row.id===p.id?{...row,selected:e.target.checked}:row))}/>
                    <span><span className="block font-medium">{label(p.id,draft.findIndex(d=>d.participant_id===p.id))}</span><span className="text-muted-foreground">{p.reason}</span></span>
                  </label>)}
                  {draft.find(d=>d.participant_id===copySource)?.choices.coupon_code && <label className="flex min-h-12 items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5 shrink-0" checked={copyCoupon} onChange={e=>setCopyCoupon(e.target.checked)}/>Aplicar também o cupom da origem, sujeito à validação individual</label>}
                  {copyReplaces && <label className="flex min-h-12 items-start gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={replaceConfirmed} onChange={e=>setReplaceConfirmed(e.target.checked)}/>Confirmo substituir as escolhas existentes. Se a categoria mudar, as respostas individuais precisarão ser preenchidas novamente.</label>}
                  <div className="flex flex-wrap gap-2"><Button type="button" disabled={disabled || !copyPreview.some(p=>p.selected) || copyReplaces && !replaceConfirmed} onClick={applyCopy}>Aplicar aos selecionados</Button><Button type="button" variant="ghost" onClick={()=>{setCopySource(null);setCopyTarget(null);}}>Cancelar cópia</Button></div>
                </>}
              </section>}
              {!pageMode && <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                {dirty && <Button variant="outline" disabled={disabled} onClick={()=>void flow.save()}>Salvar agora</Button>}
                <Button className="min-h-12" disabled={disabled || !draft.length || needsIdentity || identity!==null || !!copySource} onClick={()=>void review()}>Revisar {draft.length===1?'inscrição':'inscrições'}</Button>
              </div>}
            </>}
            {step===1 && <>
              <p className="text-sm text-muted-foreground">Confira cada participante antes de reservar. As vagas e os kits ainda não estão garantidos.</p>
              <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
              {order?.items.map((item,index)=><section key={item.id} className="space-y-3 rounded-xl border p-4" aria-label={`Revisão de ${participantName(item.participant_id,index)}`}>
                <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="min-w-0 break-words font-medium">{label(item.participant_id,index)}</h3>
                  <Button variant="outline" className="min-h-11" disabled={disabled} aria-label={`Editar ${participantName(item.participant_id,index)}`} onClick={()=>{setExpanded(item.participant_id);flow.setEditing(true);}}>Editar</Button></div>
                <p className="text-sm">{[item.labels?.category,item.labels?.modality,item.labels?.batch].filter(Boolean).join(' · ')}</p>
                {item.labels?.kit && <p className="text-sm">{item.labels.kit}</p>}
                {!!item.labels?.products.length && <ul className="text-sm text-muted-foreground">{item.labels.products.map(p=><li key={p.product_id}>{p.product_name}: {p.variant_name}</li>)}</ul>}
                <p className="break-words text-sm text-muted-foreground">{item.participant?.delivery_mode==='email'?`Entrega para ${item.participant.email}`:item.participant?.registered?'Participante cadastrado. Inscrição vinculada ao corredor.':'Acompanhamento pela conta do comprador.'}</p>
                <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
                  <dt>Categoria + kit</dt><dd>{money(Math.round((item.pricing?.subtotal ?? 0)*100))}</dd>
                  <dt>Descontos</dt><dd>− {money(Math.round(((item.pricing?.seniorDiscount ?? 0)+(item.pricing?.couponDiscount ?? 0))*100))}</dd>
                  <dt>Taxa</dt><dd>{money(Math.round((item.pricing?.platformFee ?? 0)*100))}</dd>
                  <dt className="font-semibold">Total</dt><dd className="font-semibold">{money(Math.round((item.pricing?.total ?? 0)*100))}</dd>
                </dl>
              </section>)}
              </div>
              <p className="text-sm text-muted-foreground">{remaining===0?'A revisão venceu. Atualize os valores antes de continuar.':`Revisão válida por ${Math.floor((remaining ?? 0)/60)}min ${String((remaining ?? 0)%60).padStart(2,'0')}s.`}</p>
              {!pageMode && <CheckoutActionBar total={order?.total_cents ?? 0}>
                <Button className="h-auto min-h-12 w-full whitespace-normal" disabled={disabled} onClick={()=>void (remaining===0?flow.review():flow.reserve())}>{remaining===0?'Atualizar revisão':'Reservar e ir para pagamento'}</Button>
                <Button variant="outline" className="h-auto min-h-11 w-full whitespace-normal" disabled={disabled} onClick={()=>flow.setEditing(true)}>Editar participantes</Button>
              </CheckoutActionBar>}
            </>}
            {step===2 && order && <>
              <CheckoutPaymentPanel order={order} payment={payment} event={event} method={chosenMethod} onMethod={setMethod}
                busy={disabled} locked={methodLocked} remaining={remaining} now={now} onPay={(value,card)=>void flow.pay(value,card)} onRefresh={()=>void flow.refresh()}
                embedActionBar={!pageMode} actionBarHost={pageMode?paymentFooterHost:null}
                onBackToReview={()=>void flow.backToReview()}
                onSwitch={()=>{
                  const next=payment?.method==='PIX'?'CREDIT_CARD':'PIX';
                  void (async()=>{if(await flow.switchPayment()) setMethod(next);})();
                }}
                onNewOrder={()=>void flow.newOrder()} onCancel={()=>{}}
                onRegisterAnother={()=>void flow.newOrder()}/>
              {!pageMode && <Button variant="outline" className="w-full" disabled={disabled} onClick={()=>close(false)}>Fechar e acompanhar depois</Button>}
            </>}
          </main>
        </div>}
      </div>
      {showShellFooter && <footer className="shrink-0 border-t bg-background px-3 pt-2.5 shadow-[0_-6px_20px_rgba(0,0,0,0.06)] sm:px-6 lg:px-8" style={{paddingBottom:'max(0.75rem, env(safe-area-inset-bottom))'}}>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 lg:max-w-4xl">
          {step===0 && <>
            {expandedItem && identityReady(expandedItem.participant_id) && <div className="space-y-1.5">
              <div className="flex gap-2" aria-live="polite">
                {choicesNav?.canBack && <Button type="button" variant="outline" className="min-h-11 flex-1 sm:max-w-[9rem]" disabled={disabled} onClick={()=>choicesNav.back()}><ChevronLeft className="mr-1 h-4 w-4"/>Voltar</Button>}
                {primaryChoiceAction==='conclude'
                  ? <Button key="conclude" type="button" className="checkout-footer-cta min-h-11 flex-[2] bg-accent text-accent-foreground hover:bg-accent/90" disabled={disabled} onClick={()=>void finishParticipant(expandedItem)}>
                      <CheckCircle2 className="mr-2 h-4 w-4 shrink-0" aria-hidden="true"/>Concluir participante
                    </Button>
                  : primaryChoiceAction==='continue'
                    ? <Button key="continue" type="button" className="checkout-footer-cta min-h-11 flex-[2]" disabled={disabled} onClick={()=>choicesNav!.continue()}>Continuar</Button>
                    : <Button type="button" className="min-h-11 flex-[2]" disabled aria-disabled="true">{choicesNav?.isExtras?'Concluir participante':'Continuar'}</Button>}
              </div>
              {primaryChoiceAction==='conclude' && <p className="text-center text-[11px] font-medium text-accent sm:text-xs" role="status">Escolhas prontas — conclua este participante</p>}
            </div>}
            <div className={`flex-col gap-2 sm:flex-row ${expandedItem && identityReady(expandedItem.participant_id)?'hidden sm:flex':'flex'}`}>
              <Button type="button" variant={buyerAlreadyRegistered && draft.length===0?'default':'outline'} className={`min-h-11 flex-1 ${buyerAlreadyRegistered && draft.length===0?'':'border-dashed'}`} disabled={disabled || draft.length>=20} onClick={()=>setIdentity('new')}>
                <Plus className="mr-2 h-4 w-4"/>{buyerAlreadyRegistered?'Inscrever outro participante':'Adicionar outro participante'}
              </Button>
              <Button type="button" className="min-h-11 flex-1" disabled={disabled || !draft.length || needsIdentity || !!copySource || completed<draft.length} onClick={()=>void review()}>
                Revisar {draft.length===1?'inscrição':'inscrições'}
              </Button>
            </div>
            {dirty && <Button type="button" variant="ghost" className="min-h-9 text-xs" disabled={disabled} onClick={()=>void flow.save()}>Salvar agora</Button>}
          </>}
          {step===1 && <CheckoutActionBar total={order?.total_cents ?? 0} flush>
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <Button className="h-auto min-h-12 w-full whitespace-normal sm:flex-1" disabled={disabled} onClick={()=>void (remaining===0?flow.review():flow.reserve())}>{remaining===0?'Atualizar revisão':'Reservar e ir para pagamento'}</Button>
              <Button variant="outline" className="h-auto min-h-11 w-full whitespace-normal sm:flex-1" disabled={disabled} onClick={()=>flow.setEditing(true)}>Editar participantes</Button>
            </div>
          </CheckoutActionBar>}
          {step===2 && <div ref={setPaymentFooterHost} className="flex flex-col gap-2"/>}
        </div>
      </footer>}
  </>;
  return pageMode
    ? <section className="checkout-shell-enter flex max-h-[100dvh] flex-col overflow-hidden bg-background" style={{height:shellHeight!=null?`${shellHeight}px`:'100dvh'}}>{content}</section>
    : <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[94dvh] w-[calc(100%-1rem)] max-w-5xl flex-col gap-0 overflow-hidden rounded-xl p-0" onInteractOutside={e=>e.preventDefault()}>{content}</DialogContent>
    </Dialog>;
}
