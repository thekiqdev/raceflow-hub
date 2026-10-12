import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {Button} from '@/components/ui/button';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {getManagedCheckoutTicket,getCheckoutTicket,getCheckoutTickets,collectCheckoutKit,returnCheckoutKit,type CheckoutTicket} from '@/lib/api/checkoutDelivery';
import {downloadCheckoutTickets} from '@/components/registration/checkoutTicketDownload';
import {canAdminTransferRegistration} from '@/components/admin/TransferRegistrationAdminDialog';
import {AdminCheckoutTransferDialog} from '@/components/admin/AdminCheckoutTransferDialog';

/** Detalhe da linha selecionada; a tabela continua sendo a única listagem. */
export function OrderRegistrationDetailSheet({registrationId,eventId,onClose,onRefreshList,allowAdminTransfer=false}:{registrationId:string|null;eventId:string;onClose:()=>void;onRefreshList:()=>void;allowAdminTransfer?:boolean}) {
  const [ticket,setTicket]=useState<CheckoutTicket|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [transferOpen,setTransferOpen]=useState(false);
  const alive=useRef(true),working=useRef(false);
  async function load() {
    if(!registrationId) return;
    const r=await getManagedCheckoutTicket(registrationId);
    if(!r.success || !r.data) throw new Error(r.error || 'Não foi possível consultar a inscrição.');
    if(r.data.event_id!==eventId) throw new Error('Esta inscrição pertence a outro evento.');
    if(alive.current) setTicket(r.data);
  }
  async function act(work:()=>Promise<void>) {
    if(working.current)return;
    working.current=true;setBusy(true);setError('');setNotice('');
    try {await work();} catch(e) {if(alive.current)setError(e instanceof Error?e.message:'Não foi possível concluir.');}
    finally {working.current=false;if(alive.current)setBusy(false);}
  }
  useEffect(()=>{alive.current=true;void act(load);return()=>{alive.current=false;};},[registrationId,eventId]);
  async function download(all=false) {
    if(!ticket)return;
    let ids=[ticket.id];
    if(all) {
      const r=await getCheckoutTickets(eventId);
      if(!r.success || !r.data)throw new Error(r.error || 'Não foi possível consultar o pedido.');
      ids=r.data.filter(t=>t.order_id===ticket.order_id && t.released).map(t=>t.id);
    }
    const fresh:CheckoutTicket[]=[];
    for(const id of ids){const r=await getCheckoutTicket(id);if(!r.success || !r.data)throw new Error(r.error || 'Ingresso indisponível.');fresh.push(r.data);}
    await downloadCheckoutTickets(fresh);
  }
  async function kitAction(returned:boolean) {
    if(!ticket)return;
    const r=await (returned?returnCheckoutKit(ticket.id):collectCheckoutKit(ticket.id));
    if(!r.success)throw new Error(r.error || 'Não foi possível atualizar o kit.');
    await load();onRefreshList();
    if(alive.current)setNotice(returned?'Devolução física registrada.':'Retirada de kit registrada.');
  }
  const status=ticket?.payment_status==='refunded'?'Reembolsado':ticket?.order_status==='needs_review'?'Em revisão':ticket?.released?'Confirmado':ticket?.status==='cancelled'?'Cancelado':'Aguardando confirmação';
  const canTransfer=allowAdminTransfer && !!ticket && canAdminTransferRegistration({
    order_id:ticket.order_id,
    status:ticket.released?'confirmed':ticket.status,
    payment_status:ticket.payment_status,
  });
  return <>
    <Sheet open={!!registrationId} onOpenChange={open=>{if(!open)onClose();}}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader><SheetTitle>Detalhes da inscrição</SheetTitle><SheetDescription>Dados do participante e ações do ingresso selecionado.</SheetDescription></SheetHeader>
        {busy && <p role="status" className="my-4">Consultando…</p>}
        {error && <div role="alert" className="my-4 space-y-2 text-destructive"><p>{error}</p><Button variant="outline" disabled={busy} onClick={()=>void act(load)}>Atualizar inscrição</Button></div>}
        {notice && <p role="status" className="my-4">{notice}</p>}
        {ticket && <div className="mt-6 space-y-4 break-words">
          <div><h3 className="font-semibold">{ticket.runner_name || 'Participante cadastrado'}</h3><p>{ticket.cpf_masked}</p><p>{status}</p></div>
          <p>{ticket.event_title}</p><p>{[ticket.labels.category,ticket.labels.modality,ticket.labels.batch].filter(Boolean).join(' · ')}</p>
          <p>Kit: {ticket.labels.kit || 'Sem kit'}</p>
          {ticket.labels.products.map(p=><p key={p.product_id}>{[p.product_name,p.variant_name].filter(Boolean).join(': ')}</p>)}
          {ticket.custom_fields?.map((f,i)=><p key={i}>{f.label}: {f.value}</p>)}
          <p className="font-semibold">{Number(ticket.pricing.total).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p>
          {ticket.kit_collected_at && <p>Kit entregue em {new Date(ticket.kit_collected_at).toLocaleString('pt-BR')}</p>}
          {ticket.kit_returned_at && <p>Kit devolvido em {new Date(ticket.kit_returned_at).toLocaleString('pt-BR')}</p>}
          <div className="grid gap-2 [&_button]:min-h-11 [&_button]:whitespace-normal">
            {ticket.released && <><Button asChild variant="outline"><Link to={`/registration/validate/${ticket.id}`}>Abrir ingresso</Link></Button><Button disabled={busy} onClick={()=>void act(()=>download())}>Baixar PDF</Button><Button variant="outline" disabled={busy} onClick={()=>void act(()=>download(true))}>Baixar ingressos disponíveis do pedido</Button>
              {ticket.labels.kit && !ticket.kit_collected_at && <Button disabled={busy} onClick={()=>void act(()=>kitAction(false))}>Confirmar entrega do kit</Button>}</>}
            {canTransfer && <Button variant="outline" disabled={busy} onClick={()=>setTransferOpen(true)}>Transferir inscrição</Button>}
            {ticket.payment_status==='refunded' && ticket.kit_collected_at && !ticket.kit_returned_at && <><p>O kit continua fora do estoque até sua devolução física.</p><Button disabled={busy} onClick={()=>void act(()=>kitAction(true))}>Confirmar recebimento do kit devolvido</Button></>}
          </div>
          <details className="rounded-lg border p-3"><summary className="cursor-pointer">Pedido da compra</summary><p className="mt-2 break-all text-sm">{ticket.order_id}</p></details>
        </div>}
      </SheetContent>
    </Sheet>
    <AdminCheckoutTransferDialog
      open={transferOpen}
      onOpenChange={setTransferOpen}
      registrationId={ticket?.id ?? null}
      subtitle={ticket ? `${ticket.runner_name || '—'} • ${ticket.confirmation_code || ticket.id}` : undefined}
      onSuccess={()=>{void act(load);onRefreshList();}}
    />
  </>;
}
