import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { accessCheckoutTicket,getCheckoutTicket,type CheckoutTicket } from '@/lib/api/checkoutDelivery';

/** Compatibilidade de e-mails/links antigos: resolve o ingresso e abre a validação canônica. */
export default function CheckoutTicketPage(){
  const location=useLocation();
  const navigate=useNavigate();
  const [token]=useState(()=>window.location.hash.slice(1));
  const id=new URLSearchParams(location.search).get('id');
  const [error,setError]=useState('');
  const load=useCallback(async()=>{
    const result=token?await accessCheckoutTicket(token):id?await getCheckoutTicket(id):null;
    if(!result?.success || !result.data) throw new Error(result?.error || 'Abra o link recebido por e-mail ou entre em Minhas compras.');
    return result.data as CheckoutTicket;
  },[id,token]);
  useEffect(()=>{
    // Fragmento não é enviado na requisição da página; permite reabrir/recarregar o link.
    void load().then(t=>navigate(`/registration/validate/${t.id}`,{replace:true}))
      .catch(e=>setError(e instanceof Error?e.message:'Ingresso indisponível.'));
  },[load,navigate]);
  return <main className="mx-auto max-w-2xl space-y-5 p-4 sm:p-8">
    <Link to="/minhas-compras" className="underline">Minhas compras</Link><h1 className="text-2xl font-bold">Seu ingresso</h1>
    {error && <p role="alert" className="rounded-lg border p-4">{error}</p>}
    {!error && <p role="status">Abrindo validação da inscrição…</p>}
  </main>;
}
