import {useEffect,useRef,useState} from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {PixQrCode} from '@/components/payment/PixQrCode';
import {requestCheckoutTransfer,readCheckoutTransfer,payCheckoutTransfer,cancelCheckoutTransfer,type CheckoutTransfer} from '@/lib/api/checkoutTransfers';
import type {MyTicket} from '@/lib/api/myTickets';

type Draft={key:string;cpf:string;submitted?:boolean;id?:string};
function freshDraft(requestId?:string|null):Draft {
  return {key:crypto.randomUUID(),cpf:'',id:requestId ?? undefined};
}
function pixDueDate() {
  return new Date(Date.now()+3*86400000).toISOString().slice(0,10);
}
export function CheckoutTransferDialog({ticket,userId,fee,onClose,onComplete}:{ticket:MyTicket;userId:string;fee:number;onClose:()=>void;onComplete:()=>void}) {
  const storage=`ticket-transfer:${userId}:${ticket.registration_id}`;
  const [draft,setDraft]=useState<Draft>(()=>{
    try {
      const saved=JSON.parse(sessionStorage.getItem(storage) || 'null');
      if(saved?.key) return {key:saved.key,cpf:saved.cpf || '',submitted:saved.submitted,id:saved.id};
    } catch { /* Formulário recuperável sem armazenamento. */ }
    return freshDraft(ticket.transfer.request_id);
  });
  const [transfer,setTransfer]=useState<CheckoutTransfer|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const running=useRef(false),done=useRef(false),alive=useRef(true);
  function save(value:Draft) {setDraft(value);try {sessionStorage.setItem(storage,JSON.stringify(value));} catch { /* A mesma chave permanece na instância. */ }}
  function clearDraft() {
    try {sessionStorage.removeItem(storage);} catch { /* Nada a limpar. */ }
    const next=freshDraft();setDraft(next);setTransfer(null);done.current=false;
  }
  function adopt(value:CheckoutTransfer) {
    if(!alive.current) return;
    setTransfer(value);save({...draft,id:value.id,submitted:true});
    if(['completed','cancelled','rejected'].includes(value.status) && !done.current) {
      done.current=true;try {sessionStorage.removeItem(storage);} catch { /* Nada a limpar. */ }onComplete();
    }
  }
  async function run(work:()=>Promise<void>) {
    if(running.current) return;running.current=true;setBusy(true);setError('');
    try {await work();} catch(e) {if(alive.current) setError(e instanceof Error?e.message:'Não foi possível concluir.');}
    finally {running.current=false;if(alive.current) setBusy(false);}
  }
  async function refresh(id:string) {const r=await readCheckoutTransfer(id);if(!r.success || !r.data) throw new Error(r.error || 'Falha ao consultar a transferência.');adopt(r.data);}
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{
    if(!draft.id || done.current) return;
    void run(()=>refresh(draft.id!));
    const timer=setInterval(()=>{if(document.visibilityState==='visible') void run(()=>refresh(draft.id!));},15000);
    return()=>clearInterval(timer);
  },[draft.id,transfer?.status]);
  const completed=transfer?.status==='completed';
  const stopped=transfer?.status==='cancelled' || transfer?.status==='rejected';
  const canCancel=!!draft.id && transfer?.status==='pending'
    && (!transfer.payment || !['paid','review'].includes(transfer.payment.status));
  const pixCode=transfer?.payment?.status==='pending'?transfer.payment.pix_qr_code:null;
  return <Dialog open onOpenChange={open=>{if(!open && !running.current) onClose();}}><DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
    <DialogHeader><DialogTitle>{completed?'Transferência concluída':'Transferir inscrição'}</DialogTitle><DialogDescription>{ticket.event.title} · {ticket.participant.name || 'Participante'}</DialogDescription></DialogHeader>
    {!draft.id && <div className="space-y-4">
      <p className="text-sm">Informe o CPF do novo titular. O cadastro deve estar completo para finalizar.</p>
      <div><Label htmlFor="group-transfer-cpf">CPF do novo titular</Label><Input id="group-transfer-cpf" inputMode="numeric" maxLength={14} disabled={busy || draft.submitted} value={draft.cpf} onChange={e=>setDraft({...draft,cpf:e.target.value})}/></div>
      <p>Taxa de transferência: {fee.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p>
      <Button className="min-h-12 w-full" disabled={busy || !draft.cpf.trim()} onClick={()=>void run(async()=>{
        save({...draft,submitted:true});const r=await requestCheckoutTransfer(ticket.registration_id,{request_key:draft.key,new_runner_cpf:draft.cpf.trim()});
        if(!r.success || !r.data) {
          if([400,403,404,409].includes(r.httpStatus ?? 0) && !r.error?.includes('Chave já utilizada')) save({...draft,submitted:false});
          throw new Error(r.error || 'Não foi possível confirmar a solicitação. Retome com os mesmos dados.');
        }adopt(r.data);
      })}>{busy?'Processando…':draft.submitted?'Retomar solicitação':'Continuar transferência'}</Button>
    </div>}
    {draft.id && <div className="space-y-4">
      <p role="status">{completed?'O ingresso já está disponível para o novo titular.':stopped?'Esta solicitação foi encerrada. Feche para voltar aos seus ingressos.':transfer?.payment_status==='paid'?'Taxa paga. A transferência ainda está em processamento.':'Sua solicitação foi registrada. Consulte a situação antes de sair.'}</p>
      {transfer && <p>Taxa: {Number(transfer.transfer_fee).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p>}
      {transfer?.payment?.issue && <p role="alert" className="text-sm text-destructive">{transfer.payment.issue}</p>}
      {!completed && transfer?.status==='pending' && (!transfer.payment || transfer.payment.status==='prepared') && <Button className="min-h-12 w-full" disabled={busy} onClick={()=>void run(async()=>{
        const r=await payCheckoutTransfer(draft.id!);if(!r.success || !r.data) throw new Error(r.error || 'Não foi possível confirmar a cobrança.');adopt(r.data);
      })}>{Number(transfer.transfer_fee)>0?'Gerar pagamento da taxa':'Concluir transferência'}</Button>}
      {pixCode && <PixQrCode pixQrCode={pixCode} value={Number(transfer!.payment!.value)} dueDate={pixDueDate()} hideHeader/>}
      {!completed && transfer?.payment?.status==='pending' && !pixCode && <p className="text-sm text-muted-foreground">Gerando QR Code PIX… Atualize a situação em instantes.</p>}
      {!completed && !stopped && <Button variant="outline" className="min-h-12 w-full" disabled={busy} onClick={()=>void run(()=>refresh(draft.id!))}>Atualizar situação</Button>}
      {canCancel && <Button variant="destructive" className="min-h-12 w-full" disabled={busy} onClick={()=>void run(async()=>{
        const r=await cancelCheckoutTransfer(draft.id!);
        if(!r.success || !r.data) throw new Error(r.error || 'Não foi possível cancelar a solicitação.');
        clearDraft();onComplete();
      })}>Cancelar solicitação</Button>}
      {stopped && !completed && <Button className="min-h-12 w-full" disabled={busy} onClick={()=>{clearDraft();setError('');}}>Informar outro destinatário</Button>}
    </div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button variant="outline" disabled={busy} onClick={onClose}>Fechar</Button>
  </DialogContent></Dialog>;
}
