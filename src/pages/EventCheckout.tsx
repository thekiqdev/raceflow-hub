import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams,useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getEventById, type Event } from '@/lib/api/events';
import { GroupRegistrationFlow } from '@/components/registration/GroupRegistrationFlow';
import { Button } from '@/components/ui/button';
import { getReferralCoupon, saveReferralCoupon } from '@/lib/referralCouponCache';

export default function EventCheckout() {
  const {slug,id}=useParams();
  const [searchParams]=useSearchParams();
  const resumeOrderId=searchParams.get('pedido') || undefined;
  const forceNew=searchParams.get('novo')==='1' && !resumeOrderId;
  const reference=slug || id || '';
  const {user}=useAuth();
  const navigate=useNavigate();
  const [event,setEvent]=useState<Event|null>(null);
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);
  useEffect(()=> {
    let active=true;setEvent(null);setError('');
    getEventById(reference).then(result=> {
      if(!active) return;
      if(result.success && result.data) setEvent(result.data);
      else setError(result.error || 'Evento não encontrado.');
    }).catch(()=> {if(active) setError('Não foi possível carregar o evento. Tente novamente.');});
    return()=>{active=false;};
  },[reference,attempt]);
  const back=slug?`/evento/${encodeURIComponent(slug)}`:`/events/${encodeURIComponent(id || '')}`;
  // A página também permite retomar pedidos existentes quando a entrada de novas compras estiver desligada.
  if(event?.event_type==='EXTERNAL') return <Navigate to={back} replace/>;
  if(error) return <main className="mx-auto max-w-xl space-y-4 p-6"><h1 className="text-xl font-semibold">Sua inscrição</h1><p role="alert">{error}</p><Button onClick={()=>setAttempt(n=>n+1)}>Tentar novamente</Button><Link className="block underline" to={back}>Voltar ao evento</Link></main>;
  if(!event || !user) return <p role="status" className="p-6 text-center">Carregando sua inscrição…</p>;
  const cupomParam=searchParams.get('cupom')?.trim() || undefined;
  const refParam=searchParams.get('ref')?.trim() || undefined;
  if(cupomParam || refParam) saveReferralCoupon(event.id,{cupom:cupomParam,ref:refParam});
  const referralCoupon=(cupomParam || getReferralCoupon(event.id)?.cupom || '').trim().toUpperCase() || undefined;
  return <div className="h-[100dvh] overflow-hidden bg-background"><GroupRegistrationFlow key={`${user.id}:${event.id}:${resumeOrderId || ''}:${forceNew?'novo':''}:${referralCoupon || ''}`} resumeOrderId={resumeOrderId} forceNew={forceNew} mode="page" open event={event} buyerId={user.id} referralCoupon={referralCoupon} onOpenChange={open=>{if(!open) navigate(back,{viewTransition:true});}}/></div>;
}
