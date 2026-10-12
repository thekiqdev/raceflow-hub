import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, Clock3, Copy, CreditCard, QrCode } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PixQrCode } from '@/components/payment/PixQrCode';
import { CreditCardForm } from '@/components/payment/CreditCardForm';
import type { CheckoutOrder, CheckoutPayment } from '@/lib/api/checkoutOrders';
import type { CreditCardData, CreditCardHolderInfo } from '@/lib/api/registrations';
import { money, paymentMethodAvailable } from './groupCheckoutModel';

type Method='PIX'|'CREDIT_CARD';
type PaymentSettings=Parameters<typeof paymentMethodAvailable>[0];
export type CheckoutCardPayInput={credit_card:CreditCardData;credit_card_holder_info:CreditCardHolderInfo};
function pixDueDate(expiresAt:string) {
  try {return new Date(expiresAt).toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});}
  catch {return expiresAt.slice(0,10);}
}
export function CheckoutActionBar({total,children,flush=false}:{total:number;children:React.ReactNode;flush?:boolean}) {
  return <div className={flush?'space-y-2':'space-y-3 rounded-xl border bg-background p-4 shadow-sm'} style={flush?undefined:{paddingBottom:'max(1rem, env(safe-area-inset-bottom))'}}>
    <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="text-sm text-muted-foreground">Total do pedido</span><strong className="text-xl">{money(total)}</strong></div>
    {children}
  </div>;
}
export function CheckoutPaymentPanel({order,payment,event,method,onMethod,busy,locked,remaining,now,onPay,onRefresh,onCancel,onSwitch,onBackToReview,onNewOrder,onRegisterAnother,embedActionBar=true,actionBarHost=null}:{
  order:CheckoutOrder;payment:CheckoutPayment|null;event:PaymentSettings;method:Method;onMethod:(value:Method)=>void;
  busy:boolean;locked:boolean;remaining:number|null;now:number;
  onPay:(method:Method,card?:CheckoutCardPayInput)=>void;onRefresh:()=>void;onCancel:()=>void;onSwitch?:()=>void;
  onBackToReview?:()=>void;onNewOrder:()=>void;onRegisterAnother?:()=>void;embedActionBar?:boolean;actionBarHost?:HTMLElement|null;
}) {
  const [copiedPix,setCopiedPix]=useState(false);
  const [pickingMethod,setPickingMethod]=useState(false);
  const [pickerMethod,setPickerMethod]=useState<Method>(method);
  const free=order.total_cents===0;
  const expired=remaining===0;
  const terminal=['cancelled','expired','refunded'].includes(order.status);
  const canStart=order.status==='reserved' && (!payment || ['failed','cancelled'].includes(payment.status));
  const preparing=order.status==='awaiting_payment' && payment?.status==='preparing';
  const uncertain=payment?.status==='unknown' || payment?.status==='creating';
  const available=(value:Method)=>paymentMethodAvailable(event,value,now);
  const waiting=order.status==='awaiting_payment';
  const switching=!!payment?.cancel_requested && !!payment.keep_reservation && !['cancelled','failed'].includes(payment.status);
  const cancellingOrder=!!payment?.cancel_requested && !payment.keep_reservation && !['cancelled','failed'].includes(payment.status);
  const resuming=canStart && locked && !payment;
  const resumablePix=waiting && payment?.status==='pending' && payment.method==='PIX' && !!payment.pix_qr_code && !payment.cancel_requested && !expired;
  const activeMethod=pickingMethod?pickerMethod:method;
  const showPix=resumablePix && !pickingMethod;
  const showCardForm=!free && activeMethod==='CREDIT_CARD' && available('CREDIT_CARD') && !expired
    && !(payment?.cancel_requested && !['cancelled','failed'].includes(payment.status))
    && (canStart || (preparing && payment?.method==='CREDIT_CARD'))
    && !pickingMethod;
  const cardPending=waiting && payment?.status==='pending' && payment.method==='CREDIT_CARD' && !payment.cancel_requested && !expired && !pickingMethod;
  // Voltar também na tela do cartão (antes ou depois de abrir o formulário), para poder retomar o Pix.
  const canGoBack=!free && !pickingMethod && !expired && (
    showCardForm
    || (waiting && !!payment && ['pending','preparing'].includes(payment.status) && !payment.cancel_requested)
  );
  const showMethodPicker=!free && (canStart || pickingMethod) && !expired;
  const uncertainTitle=payment?.status==='creating'?'Registrando cobrança no gateway':'Conferindo a tentativa de pagamento';
  const uncertainCopy=payment?.status==='creating'
    ? 'A cobrança está sendo registrada. Não envie o cartão de novo — aguarde a confirmação nesta tela.'
    : 'Ainda não recebemos uma resposta definitiva. Aguarde a atualização desta tela antes de preencher o cartão novamente.';
  useEffect(()=> {
    if(order.status==='confirmed' || terminal || cancellingOrder) setPickingMethod(false);
  },[order.status,terminal,cancellingOrder]);
  useEffect(()=> {
    if(pickingMethod) setPickerMethod(method==='CREDIT_CARD' && available('CREDIT_CARD')?'CREDIT_CARD':available('PIX')?'PIX':'CREDIT_CARD');
  },[pickingMethod]);
  async function copyPixKey() {
    if(!payment?.pix_qr_code) return;
    try {
      await navigator.clipboard.writeText(payment.pix_qr_code);
      setCopiedPix(true);
      toast.success('Chave Pix copiada!');
      window.setTimeout(()=>setCopiedPix(false),2000);
    } catch {
      toast.error('Não foi possível copiar a chave Pix');
    }
  }
  function primaryLabel() {
    if(pickingMethod && activeMethod==='PIX' && resumablePix) return 'Tentar novamente';
    if(pickingMethod && activeMethod==='CREDIT_CARD' && resumablePix) return 'Continuar com cartão';
    if(free) return 'Confirmar inscrições gratuitas';
    if(resuming) return `Retomar tentativa · ${money(order.total_cents)}`;
    if(payment?.status==='failed' || payment?.status==='cancelled') return `Tentar novamente · ${money(order.total_cents)}`;
    return `Gerar pagamento único · ${money(order.total_cents)}`;
  }
  function onPrimaryAction() {
    if(pickingMethod && activeMethod==='PIX' && resumablePix) {
      onMethod('PIX');
      setPickingMethod(false);
      return;
    }
    if(pickingMethod && activeMethod==='CREDIT_CARD' && resumablePix) {
      onSwitch?.();
      setPickingMethod(false);
      return;
    }
    if(pickingMethod && activeMethod==='CREDIT_CARD' && canStart) {
      onMethod('CREDIT_CARD');
      setPickingMethod(false);
      return;
    }
    if(pickingMethod && activeMethod==='PIX' && canStart) {
      onMethod('PIX');
      setPickingMethod(false);
      onPay('PIX');
      return;
    }
    onPay(activeMethod);
  }
  if(order.status==='confirmed') return <section role="status" className="space-y-4 rounded-2xl border border-green-600/30 bg-green-50 p-5 text-green-950">
    <CheckCircle2 className="h-10 w-10" aria-hidden="true"/><h3 className="text-xl font-semibold">Pedido confirmado</h3>
    <p>{free?'Todas as inscrições gratuitas foram confirmadas.':'O pagamento foi confirmado.'} Cada participante tem seu próprio ingresso.</p>
    <p className="break-all text-sm">Referência do pedido: {order.id}</p>
    <div className="grid gap-2 sm:grid-cols-2">
      <Button asChild className="h-auto min-h-12 w-full whitespace-normal"><Link to="/minhas-compras">Ver e baixar meus ingressos</Link></Button>
      <Button type="button" variant="outline" className="h-auto min-h-12 w-full whitespace-normal text-green-950 border-green-700/40" disabled={busy} onClick={()=>(onRegisterAnother || onNewOrder)()}>Inscrever outro participante</Button>
    </div>
  </section>;
  if(order.status==='needs_review') return <section role="status" className="space-y-3 rounded-2xl border border-amber-400 bg-amber-50 p-5 text-amber-950">
    <h3 className="text-lg font-semibold">Pagamento em conferência</h3><p>Há uma divergência que precisa ser conferida. Não faça um novo pagamento para este pedido.</p>
    <p className="break-all text-sm">Referência: {order.id}</p><Button variant="outline" className="h-auto min-h-12 w-full whitespace-normal" disabled={busy} onClick={onRefresh}>Atualizar situação</Button>
  </section>;
  if(terminal) return <section role="status" className="space-y-4 rounded-2xl border p-5">
    <h3 className="text-lg font-semibold">{order.status==='refunded'?'Pedido reembolsado':order.status==='expired'?'Reserva expirada':'Pedido cancelado'}</h3>
    <p className="text-sm text-muted-foreground">Para comprar novamente, comece outro pedido e confira a disponibilidade atual.</p>
    <Button className="h-auto min-h-12 w-full whitespace-normal" disabled={busy} onClick={onNewOrder}>Iniciar outro pedido</Button>
  </section>;
  return <section className="space-y-5" aria-label="Pagamento do pedido">
    {(free || showCardForm || cardPending) && <div className="rounded-2xl border bg-muted/20 p-5">
      {free && <p className="font-semibold">Inscrições gratuitas</p>}
      <p className={`text-sm text-muted-foreground ${free?'mt-2':''}`}>{free?'Confirme abaixo para concluir as inscrições, sem cobrança.':showCardForm?'Preencha os dados do cartão abaixo. A confirmação acontece nesta tela.':cardPending?'Estamos confirmando o pagamento do cartão. Os ingressos ficam disponíveis após a aprovação.':'Os ingressos ficam disponíveis após a confirmação do pagamento.'}</p>
    </div>}
    {remaining!==null && <div className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${expired?'border-amber-400 bg-amber-50 text-amber-950':'bg-muted/20'}`}>
      <Clock3 className="h-5 w-5 shrink-0" aria-hidden="true"/><p>{expired?'O prazo exibido da reserva terminou. Confira a situação do pedido antes de continuar.':<>Tempo para concluir: <strong className="tabular-nums">{Math.floor(remaining/60)}min {String(remaining%60).padStart(2,'0')}s</strong>.</>}</p>
    </div>}
    {!pickingMethod && !showPix && (waiting || cancellingOrder || switching || payment?.status==='failed') && <div role="status" className="space-y-2 rounded-xl border p-4">
      <h3 className="font-semibold">{switching?'Trocando meio de pagamento':cancellingOrder?'Cancelamento em andamento':payment?.status==='failed'?'Pagamento não iniciado':uncertain?uncertainTitle:preparing?'Preparando seu pagamento':cardPending?'Confirmando pagamento no cartão':'Aguardando confirmação do pagamento'}</h3>
      <p className="text-sm text-muted-foreground">{switching?'A cobrança atual será abandonada. A reserva do pedido permanece para você escolher outro meio.':cancellingOrder?'Aguarde a conferência. As reservas serão liberadas quando o cancelamento for confirmado.':uncertain?uncertainCopy:payment?.status==='failed'?'A tentativa anterior foi rejeitada. Você pode escolher o meio de pagamento e tentar novamente.':preparing && payment?.method==='CREDIT_CARD'?'A tentativa ficou incompleta. Reenvie o formulário do cartão abaixo — os dados são tokenizados antes da cobrança.':preparing?'A preparação ainda não terminou. Você pode retomar a mesma tentativa abaixo.':cardPending?'Se o cartão for aprovado, o pedido confirma automaticamente.':'Se você já pagou, aguarde a confirmação nesta tela. Voltar a esta página não gera outra cobrança.'}</p>
    </div>}
    {payment?.issue && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950">{payment.issue}</p>}
    {resuming && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950">Uma tentativa já foi iniciada nesta aba. Retome a mesma tentativa com o meio de pagamento escolhido.</p>}
    {showMethodPicker && <fieldset disabled={busy || expired || (locked && !pickingMethod && !canStart)} className="space-y-3">
      <legend className="mb-3 text-base font-semibold">Como deseja pagar?</legend>
      <div className="grid gap-3 sm:grid-cols-2">{(['PIX','CREDIT_CARD'] as const).map(value=> {
        const Icon=value==='PIX'?QrCode:CreditCard;
        return <label key={value} className="relative min-w-0 cursor-pointer">
          <input className="peer sr-only" type="radio" name="group-payment-method" aria-label={value==='PIX'?'Pix':'Cartão de crédito'} value={value}
            checked={activeMethod===value} disabled={!available(value)}
            onChange={()=>{
              if(pickingMethod) setPickerMethod(value);
              else onMethod(value);
            }}/>
          <span className="flex h-full min-h-28 gap-3 rounded-xl border-2 border-transparent bg-muted/30 p-4 ring-1 ring-border peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:ring-transparent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary peer-disabled:cursor-not-allowed peer-disabled:opacity-50">
            <Icon className="h-6 w-6 shrink-0 text-primary" aria-hidden="true"/><span className="min-w-0"><span className="block font-semibold">{value==='PIX'?'Pix':'Cartão de crédito'}</span><span className="mt-1 block text-sm text-muted-foreground">{!available(value)?'Indisponível para este evento':value==='PIX'?(resumablePix && pickingMethod?'Reabre o mesmo QR Code gerado anteriormente.':'QR Code e chave Pix aparecem nesta tela após gerar o pagamento.'):'Preencha os dados do cartão nesta tela.'}</span></span>
          </span>
        </label>;
      })}</div>
      {!available('PIX') && !available('CREDIT_CARD') && <p role="status" className="text-sm text-amber-800">Nenhum meio de pagamento está disponível neste momento.</p>}
    </fieldset>}
    {!pickingMethod && waiting && payment && !['cancelled','failed'].includes(payment.status) && <p className="text-sm text-muted-foreground">Meio escolhido: <strong>{payment.method==='PIX'?'Pix':payment.method==='CREDIT_CARD'?'Cartão de crédito':'Gratuito'}</strong></p>}
    {showPix && payment!.pix_qr_code && (
      <div className="rounded-2xl border bg-background p-4" aria-label="QR Code Pix do pedido">
        <PixQrCode pixQrCode={payment!.pix_qr_code} value={payment!.amount_cents/100} dueDate={pixDueDate(payment!.expires_at)} hideHeader hideCopy/>
      </div>
    )}
    {!pickingMethod && waiting && payment?.status==='pending' && payment.method==='PIX' && !payment.pix_qr_code && !payment.cancel_requested && !expired && (
      <p role="status" className="rounded-xl border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950">
        O QR Code ainda está sendo preparado. Aguarde alguns segundos nesta tela.
      </p>
    )}
    {showCardForm && (
      <div className="rounded-2xl border bg-background p-4" aria-label="Pagamento com cartão de crédito">
        <CreditCardForm
          isLoading={busy}
          onSubmit={(data)=>onPay('CREDIT_CARD',data)}
        />
      </div>
    )}
    {(()=> {
      const showStartCta=(canStart && (free || activeMethod!=='CREDIT_CARD')) || (pickingMethod && (activeMethod==='PIX' || activeMethod==='CREDIT_CARD'));
      const actions=<CheckoutActionBar total={order.total_cents} flush={!embedActionBar}>
        {showStartCta && <div className="flex gap-2">
          {onBackToReview && (canStart || pickingMethod) && <Button type="button" variant="outline" className="h-auto min-h-12 shrink-0 whitespace-normal px-4 sm:min-w-[7.5rem]" disabled={busy || expired || switching || cancellingOrder} onClick={onBackToReview}>
            <ChevronLeft className="mr-1 h-4 w-4 shrink-0" aria-hidden="true"/>Revisão
          </Button>}
          <Button className="h-auto min-h-12 min-w-0 flex-1 whitespace-normal" disabled={busy || expired || switching || cancellingOrder || !free && !available(activeMethod)} onClick={onPrimaryAction}>
            {primaryLabel()}
          </Button>
        </div>}
        {preparing && payment?.method==='PIX' && !payment?.cancel_requested && !expired && !pickingMethod && <Button className="h-auto min-h-12 w-full whitespace-normal" disabled={busy} onClick={()=>onPay('PIX')}>Tentar preparar pagamento novamente</Button>}
        {preparing && payment?.method==='CREDIT_CARD' && !payment?.cancel_requested && !expired && !showCardForm && !pickingMethod && (
          <p className="text-sm text-muted-foreground">Selecione cartão de crédito para reenviar o formulário tokenizado.</p>
        )}
        {showPix && <Button type="button" className="h-auto min-h-12 w-full whitespace-normal" disabled={busy || copiedPix} onClick={()=>void copyPixKey()}>
          {copiedPix?<><CheckCircle2 className="mr-2 h-4 w-4 shrink-0" aria-hidden="true"/>Chave Pix copiada!</>:<><Copy className="mr-2 h-4 w-4 shrink-0" aria-hidden="true"/>Copiar chave Pix</>}
        </Button>}
        {canGoBack && <Button type="button" variant="outline" className="h-auto min-h-12 w-full whitespace-normal" disabled={busy} onClick={()=>{
          setPickerMethod(activeMethod);
          setPickingMethod(true);
          if(showCardForm && canStart) onMethod(activeMethod);
        }}>Voltar</Button>}
      </CheckoutActionBar>;
      if(!embedActionBar && actionBarHost) return createPortal(actions,actionBarHost);
      if(!embedActionBar) return null;
      return actions;
    })()}
  </section>;
}
