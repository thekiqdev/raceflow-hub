import {useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {Button} from '@/components/ui/button';
import type {MyTicket} from '@/lib/api/myTickets';
import {getCheckoutTicket,type CheckoutTicket} from '@/lib/api/checkoutDelivery';
import {downloadCheckoutTickets} from '@/components/registration/checkoutTicketDownload';
import {isPublicTransferDeadlinePassed} from '@/lib/utils/eventTransferDeadline';
export function OrderTicketActions({ticket,transfersEnabled,onTransfer}:{ticket:MyTicket;transfersEnabled:boolean;onTransfer:()=>void}) {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  const sending=useRef(false);
  async function act(work:()=>Promise<void>) {if(sending.current)return;sending.current=true;setBusy(true);setError('');setMessage('');try{await work();}catch(e){setError(e instanceof Error?e.message:'Não foi possível concluir.');}finally{sending.current=false;setBusy(false);}}
  async function download(ids:string[]) {
    const values:CheckoutTicket[]=[];for(const id of ids){const r=await getCheckoutTicket(id);if(!r.success || !r.data)throw new Error(r.error || 'Ingresso indisponível.');values.push(r.data);}
    await downloadCheckoutTickets(values);
  }
  const released=ticket.ticket.released;
  const eventOpen=new Date(ticket.event.date)>new Date();
  const transferredAway=ticket.state.group==='transferred';
  const hasPublishedResults=Boolean(ticket.event.result_url?.trim() || ticket.event.has_results);
  const canTransfer=!transferredAway && !hasPublishedResults && released && transfersEnabled && ticket.event.transfers_enabled && !isPublicTransferDeadlinePassed(ticket.event.transfer_until) && eventOpen;
  if(hasPublishedResults) {
    return ticket.kit.collected_at ? <p className="text-xs text-muted-foreground">Kit já retirado</p> : null;
  }
  if(transferredAway) {
    return ticket.kit.collected_at ? <p className="text-xs text-muted-foreground">Kit já retirado</p> : null;
  }
  return <div className="space-y-3">
    {ticket.kit.collected_at && <p className="text-xs text-muted-foreground">Kit já retirado</p>}
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 [&_button]:min-h-11 [&_a]:min-h-11 [&_button]:w-full [&_a]:w-full [&_button]:whitespace-normal [&_a]:whitespace-normal">
      {released && <><Button asChild variant="outline"><Link to={`/registration/validate/${ticket.registration_id}`}>Visualizar inscrição</Link></Button>
        <Button disabled={busy} onClick={()=>void act(()=>download([ticket.registration_id]))}>Baixar ingresso</Button></>}
      {ticket.transfer.request_id?<Button variant="outline" onClick={onTransfer}>Acompanhar transferência</Button>:canTransfer && !ticket.transfer.pending?<Button variant="outline" onClick={onTransfer}>Transferir</Button>:null}
      {ticket.relationship.buyer && ticket.state.group==='pending' && <Button asChild><Link to={`/events/${ticket.event.id}/inscricao?pedido=${ticket.order_id}`}>Acompanhar pagamento</Link></Button>}
    </div>
    {ticket.transfer.pending && !ticket.transfer.request_id && <p className="text-sm">Transferência em andamento pelo responsável.</p>}
    {!released && ticket.state.group==='pending' && !ticket.relationship.buyer && <p className="text-sm">Aguardando a confirmação do pagamento pelo comprador.</p>}
    {message && <p role="status" className="text-sm">{message}</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
