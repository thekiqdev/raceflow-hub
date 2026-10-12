import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { getCheckoutTickets,getCheckoutTicket,resendCheckoutTicket,collectCheckoutKit,returnCheckoutKit,type CheckoutTicket } from '@/lib/api/checkoutDelivery';
import { downloadCheckoutTickets } from './checkoutTicketDownload';

const money=(n:number)=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const status=(t:CheckoutTicket)=>t.payment_status==='refunded'?'Reembolsado':t.order_status==='needs_review'?'Em revisão':t.released?'Confirmado':t.status==='cancelled'?'Cancelado':'Aguardando confirmação';
export function CheckoutPurchases({eventId,hideEmpty=false}:{eventId?:string;hideEmpty?:boolean}) {
  const [tickets,setTickets]=useState<CheckoutTicket[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[filter,setFilter]=useState('');
  const [page,setPage]=useState(1);
  const keys=useRef(new Map<string,string>());
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{const r=await getCheckoutTickets(eventId);if(!r.success || !r.data) throw new Error(r.error || 'Não foi possível consultar os ingressos.');setTickets(r.data);}
    catch(e){setError(e instanceof Error?e.message:'Falha ao consultar os ingressos.');}finally{setLoading(false);}
  },[eventId]);
  useEffect(()=>{void load();},[load]);
  const act=async(work:()=>Promise<void>)=>{
    setBusy(true);setError('');setNotice('');try{await work();}catch(e){setError(e instanceof Error?e.message:'Não foi possível concluir.');}finally{setBusy(false);}
  };
  const download=async(ids:string[])=>{
    const fresh:CheckoutTicket[]=[];
    for(const id of ids){const r=await getCheckoutTicket(id);if(!r.success || !r.data) throw new Error(r.error || 'Ingresso indisponível.');fresh.push(r.data);}
    await downloadCheckoutTickets(fresh);
  };
  if(hideEmpty && !loading && !error && !tickets.length) return null;
  const visible=tickets.filter(t=>`${t.runner_name ?? ''} ${t.confirmation_code ?? ''} ${t.event_title}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase().trim()));
  const pages=Math.max(1,Math.ceil(visible.length/20)),currentPage=Math.min(page,pages);
  const orders=new Map<string,CheckoutTicket[]>();for(const t of visible.slice((currentPage-1)*20,currentPage*20)) orders.set(t.order_id,[...(orders.get(t.order_id) ?? []),t]);
  return <section aria-label="Ingressos de compras em grupo" className="space-y-4 min-w-0">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">{eventId?'Inscrições de compras em grupo':'Minhas compras e ingressos'}</h2><Button variant="outline" disabled={loading || busy} onClick={()=>void load()}>Atualizar ingressos</Button></div>
    {loading && <p role="status">Consultando ingressos…</p>}
    {error && <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive">{error}</p>}
    {notice && <p role="status" className="rounded-lg border p-3">{notice}</p>}
    {!loading && !error && !tickets.length && <p className="text-muted-foreground">Você ainda não possui inscrições neste novo fluxo.</p>}
    {!!tickets.length && <label className="block text-sm">Buscar participante, evento ou código<input className="mt-1 block w-full rounded-md border bg-background p-3" value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}} /></label>}
    {[...orders].map(([orderId,items])=><div key={orderId} className="rounded-xl border p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{items[0].event_title}</h3><p className="text-xs text-muted-foreground break-all">Pedido {orderId}</p>{items.some(t=>t.buyer) && <p className="text-sm">Você comprou estes ingressos.</p>}</div>
      <Button variant="outline" disabled={busy || !items.some(t=>t.released)} onClick={()=>void act(()=>download(tickets.filter(t=>t.order_id===orderId && t.released).map(t=>t.id)))}>Baixar ingressos disponíveis</Button></div>
      <div className="grid gap-4 md:grid-cols-2">{items.map(t=><article key={t.id} className="min-w-0 rounded-lg bg-muted/40 p-4 space-y-2">
        <div className="flex flex-wrap justify-between gap-2"><h4 className="font-semibold break-words">{t.runner_name || 'Participante cadastrado'}</h4><span className="text-sm">{status(t)}</span></div>
        <p className="text-sm">{t.cpf_masked}</p><p className="text-sm">{[t.labels.category,t.labels.modality,t.labels.batch].filter(Boolean).join(' · ')}</p>
        <p className="text-sm">Kit: {t.labels.kit || 'Sem kit'}</p>
        {t.labels.products.map(p=><p key={p.product_id} className="text-sm">{[p.product_name,p.variant_name].filter(Boolean).join(': ')}</p>)}
        {t.custom_fields?.map((f,i)=><p key={i} className="text-sm break-words">{f.label}: {f.value}</p>)}
        <p className="font-medium">{money(t.pricing.total)}</p>
        {t.confirmation_code && <p className="text-xs break-all">{t.confirmation_code}</p>}
        {t.kit_collected_at && <p className="text-sm">Kit entregue em {new Date(t.kit_collected_at).toLocaleString('pt-BR')}</p>}
        {t.kit_returned_at && <p className="text-sm">Kit devolvido em {new Date(t.kit_returned_at).toLocaleString('pt-BR')}</p>}
        {eventId && t.payment_status==='refunded' && t.kit_collected_at && !t.kit_returned_at && <div className="space-y-2"><p className="text-sm">O kit continua fora do estoque até sua devolução física.</p><Button variant="outline" disabled={busy} onClick={()=>void act(async()=>{const r=await returnCheckoutKit(t.id);if(!r.success) throw new Error(r.error);await load();setNotice('Devolução física registrada; kit liberado no estoque.');})}>Confirmar recebimento do kit devolvido</Button></div>}
        {t.released && <div className="flex flex-wrap gap-2 pt-2">
          <Button asChild variant="outline"><Link to={`/registration/validate/${t.id}`}>Abrir ingresso</Link></Button>
          <Button disabled={busy} onClick={()=>void act(()=>download([t.id]))}>Baixar PDF</Button>
          {!eventId && <Button variant="outline" disabled={busy} onClick={()=>void act(async()=>{const key=keys.current.get(t.id) ?? crypto.randomUUID();keys.current.set(t.id,key);const r=await resendCheckoutTicket(t.id,key);if(!r.success) throw new Error(r.error);setNotice('Reenvio solicitado para o e-mail da sua conta.');})}>Reenviar e-mail</Button>}
          {eventId && t.labels.kit && !t.kit_collected_at && <Button variant="outline" disabled={busy} onClick={()=>void act(async()=>{const r=await collectCheckoutKit(t.id);if(!r.success) throw new Error(r.error);await load();setNotice('Retirada de kit registrada.');})}>Confirmar entrega do kit</Button>}
        </div>}
      </article>)}</div>
    </div>)}
    {pages>1 && <nav aria-label="Páginas de ingressos" className="flex flex-wrap items-center justify-between gap-3"><Button variant="outline" disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}>Anterior</Button><span>Página {currentPage} de {pages} · {visible.length} ingressos</span><Button variant="outline" disabled={currentPage===pages} onClick={()=>setPage(currentPage+1)}>Próxima</Button></nav>}
  </section>;
}
