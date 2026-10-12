import type {ReactNode} from 'react';
import type {Registration} from '@/lib/api/registrations';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {Alert,AlertDescription} from '@/components/ui/alert';
import {Award,QrCode,RefreshCw,X,Loader2,AlertCircle,CreditCard,Eye,CheckCircle2,Download} from 'lucide-react';
import {isFuture} from 'date-fns';
import {isPublicTransferDeadlinePassed,formatTransferDeadlineClosedMessagePtBr} from '@/lib/utils/eventTransferDeadline';
import { openPublishedResults } from '@/lib/utils/resolveEventDestination';

interface RegistrationCardProps {
 registration:Registration; actions?:ReactNode; participant?:ReactNode;statusBadge?:ReactNode;totalLabel?:string; transfersEnabled:boolean;verifyingPaymentId:string|null;
 batchName?:string|null; resultUrl?:string|null;
 onDownload:(r:Registration)=>void;downloadBusy:boolean;
 navigate:(path:string)=>void;handlePayDifference:(r:Registration)=>void;handleVerifyPayment:(r:Registration)=>void;handleViewPix:(r:Registration)=>void;
 setCompleteInvitationRegistration:(r:Registration)=>void;setShowCompleteInvitationModal:(v:boolean)=>void;setSelectedRegistration:(r:Registration)=>void;
 setIsTransferDialogOpen:(v:boolean)=>void;setIsCancelDialogOpen:(v:boolean)=>void;
}

function TicketField({label,value}:{label:string;value:string}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">{label}</p>
      <p className="mt-0.5 text-sm font-semibold leading-snug break-words text-white sm:text-base">{value}</p>
    </div>
  );
}

function Perforation() {
  return (
    <div className="relative my-3.5 h-px" aria-hidden="true">
      <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-white/30"/>
      <div className="absolute -left-7 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-background"/>
      <div className="absolute -right-7 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-background"/>
    </div>
  );
}

const getStatusBadge = (status: string | undefined, paymentStatus: string | undefined) => {
    if (status === "cancelled") {
      return <Badge variant="destructive">Cancelada</Badge>;
    }
    if (status === "transferred") {
      return <Badge variant="secondary" className="bg-purple-500 hover:bg-purple-600">Transferido</Badge>;
    }
    if (status === "confirmed" && paymentStatus === "convidado") {
      return <Badge className="bg-blue-500">Convite</Badge>;
    }
    if (status === "confirmed" && paymentStatus === "paid") {
      return <Badge className="bg-accent">Confirmada</Badge>;
    }
    if (status === "confirmed" && paymentStatus === "transferred") {
      return <Badge className="bg-accent">Confirmada</Badge>;
    }
    if (status === "confirmed" && paymentStatus === "partially_paid") {
      return <Badge className="bg-amber-500">Pago parcialmente</Badge>;
    }
    if (status === "pending" || paymentStatus === "pending") {
      return <Badge variant="secondary">Pendente</Badge>;
    }
    if (paymentStatus === "refunded") {
      return <Badge variant="outline" className="border-white/40 bg-white/10 text-white">Reembolsado</Badge>;
    }
    if (paymentStatus === "failed") {
      return <Badge variant="destructive">Falhou</Badge>;
    }
    return null;
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const needsCompleteInvitation = (reg: Registration) =>
    reg.payment_status === "convidado" && !reg.category_id;

export function RegistrationCard({registration,actions,participant,statusBadge,totalLabel,batchName,resultUrl,transfersEnabled,verifyingPaymentId,onDownload,downloadBusy,navigate,handlePayDifference,handleVerifyPayment,handleViewPix,setCompleteInvitationRegistration,setShowCompleteInvitationModal,setSelectedRegistration,setIsTransferDialogOpen,setIsCancelDialogOpen}: RegistrationCardProps) {
    const isUpcoming = registration.event_date && isFuture(new Date(registration.event_date));
    const eventAllowsTransfers = registration.event_transfers_enabled !== false;
    const transferDeadlinePassed =
      eventAllowsTransfers &&
      !!registration.event_transfer_until &&
      isPublicTransferDeadlinePassed(registration.event_transfer_until);
    const canTransfer = transfersEnabled &&
                       eventAllowsTransfers &&
                       !transferDeadlinePassed &&
                       registration.status === "confirmed" &&
                       (registration.payment_status === "paid" || registration.payment_status === "convidado") &&
                       isUpcoming;
    const canCancel = (registration.status === "pending" ||
                      (registration.status === "confirmed" && registration.payment_status === "paid")) &&
                      isUpcoming;
    const canCompleteInvitation = needsCompleteInvitation(registration);
    const hasPublishedResults = !!resultUrl?.trim();
    const categoryLabel = [registration.category_name, registration.category_distance].filter(Boolean).join(' · ');
    const productFields = (registration.product_selections ?? []).filter(p => p.product_name);
    const paymentLabel = registration.payment_method === 'pix' ? 'PIX'
      : registration.payment_method === 'credit_card' ? 'Cartão'
      : registration.payment_method === 'boleto' ? 'Boleto'
      : registration.payment_method === 'free_bonus' ? 'Convite'
      : registration.payment_method || null;

    return (
      <article
        data-registration-id={registration.id}
        className="min-w-0 overflow-hidden rounded-[1.35rem] bg-zinc-900 shadow-md"
      >
        <div className="relative overflow-hidden text-white">
          {registration.event_banner_url ? (
            <img
              src={registration.event_banner_url}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover opacity-35"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
              }}
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-700 to-zinc-950" aria-hidden="true"/>
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/65 to-black/80" aria-hidden="true"/>
          <div className="pointer-events-none absolute left-1/2 top-0 z-20 h-3.5 w-10 -translate-x-1/2 rounded-b-full bg-background shadow-sm" aria-hidden="true"/>

          <div className="relative z-10 px-4 pb-4 pt-5 sm:px-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">Ingresso</p>
              <div className="shrink-0">{statusBadge ?? getStatusBadge(registration.status, registration.payment_status)}</div>
            </div>

            <div className="mb-1 [&_p]:text-white/75 [&_.font-semibold]:text-base [&_.font-semibold]:font-bold [&_.font-semibold]:leading-snug [&_.font-semibold]:text-white sm:[&_.font-semibold]:text-xl">
              {participant ?? (
                <div>
                  <p className="font-semibold break-words">{registration.runner_name || 'Participante cadastrado'}</p>
                </div>
              )}
            </div>

            <Perforation />

            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {categoryLabel && <TicketField label="Categoria" value={categoryLabel}/>}
              {!!registration.modality_name && <TicketField label="Modalidade" value={registration.modality_name}/>}
              {!!registration.kit_name && <TicketField label="Kit" value={registration.kit_name}/>}
              {!!batchName && <TicketField label="Lote" value={batchName}/>}
              {productFields.map((p) => (
                <TicketField
                  key={`${p.product_id}-${p.variant_id ?? p.variant_name ?? ''}`}
                  label={p.product_name}
                  value={p.variant_name || p.attribute_value || '—'}
                />
              ))}
              {!categoryLabel && !registration.modality_name && !registration.kit_name && !batchName && productFields.length === 0 && (
                <TicketField label="Escolhas" value="Ainda não definidas"/>
              )}
            </div>

            <Perforation />

            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                {registration.confirmation_code ? (
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">Código</p>
                    <p className="mt-0.5 font-mono text-sm font-semibold tracking-wide text-white">{registration.confirmation_code}</p>
                  </>
                ) : (
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">Valor</p>
                    <p className="mt-0.5 text-sm font-semibold text-white">{totalLabel ?? formatCurrency(registration.total_amount)}</p>
                  </>
                )}
              </div>
              <div className="shrink-0 text-right">
                {registration.confirmation_code && (
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">Valor</p>
                    <p className="mt-0.5 text-sm font-semibold text-white">{totalLabel ?? formatCurrency(registration.total_amount)}</p>
                  </>
                )}
                {paymentLabel && (
                  <p className="mt-1 text-[11px] text-white/65">{paymentLabel}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3 bg-card px-4 py-4 text-card-foreground sm:px-5">
          {hasPublishedResults && (
            <Button
              type="button"
              className="min-h-11 w-full"
              onClick={() => openPublishedResults({ result_url: resultUrl })}
            >
              <Award className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Ver resultado
            </Button>
          )}
          {!hasPublishedResults && (registration.has_pending_difference || (registration.pending_difference_amount ?? 0) > 0) &&
           registration.payment_status !== 'paid' && (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-xs dark:border-amber-800 dark:bg-amber-950/30">
              <div className="mb-1.5 font-medium text-amber-800 dark:text-amber-200">Resumo do pagamento</div>
              <div className="flex justify-between">
                <span className="text-muted-foreground" title="Total que você já pagou (inclui taxas da plataforma)">Valor já pago (incl. taxas):</span>
                <span className="font-medium">{formatCurrency(registration.amount_paid ?? (registration.total_amount ?? 0) - (registration.pending_difference_amount ?? 0))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Taxa de atualização:</span>
                <span className="font-medium">{formatCurrency(registration.registration_edit_fee ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor restante:</span>
                <span className="font-semibold text-amber-700 dark:text-amber-300">{formatCurrency(registration.pending_difference_amount ?? 0)}</span>
              </div>
              <div className="flex justify-between border-t border-amber-200 pt-1 dark:border-amber-800">
                <span className="font-medium text-amber-800 dark:text-amber-200">Valor total:</span>
                <span className="font-semibold">{formatCurrency(registration.total_amount ?? 0)}</span>
              </div>
            </div>
          )}

          {!hasPublishedResults && (actions ?? <div className="space-y-2 [&_button]:min-h-11 [&_button]:whitespace-normal">
            {(registration.has_pending_difference || (registration.pending_difference_amount ?? 0) > 0) &&
             registration.payment_status !== 'paid' && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => handlePayDifference(registration)}
                >
                  <QrCode className="mr-1 h-3 w-3" />
                  Pagar diferença
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleVerifyPayment(registration)}
                  disabled={verifyingPaymentId === registration.id}
                >
                  {verifyingPaymentId === registration.id ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                  )}
                  Confirmar pagamento
                </Button>
              </div>
            )}
            {(registration.status === "pending" || registration.payment_status === "pending") && !registration.has_pending_difference && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleViewPix(registration)}
                >
                  <CreditCard className="mr-1 h-3 w-3" />
                  Visualizar PIX
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleVerifyPayment(registration)}
                  disabled={verifyingPaymentId === registration.id}
                >
                  {verifyingPaymentId === registration.id ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                  )}
                  Confirmar pagamento
                </Button>
              </div>
            )}

            {canCompleteInvitation && (
              <Button
                variant="default"
                size="sm"
                className="w-full"
                onClick={() => {
                  setCompleteInvitationRegistration(registration);
                  setShowCompleteInvitationModal(true);
                }}
              >
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Completar convite (escolher categoria, modalidade e kit)
              </Button>
            )}
            {registration.status === "confirmed" &&
              (registration.payment_status === "paid" || registration.payment_status === "convidado" || registration.payment_status === "transferred") && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/registration/validate/${registration.id}`)}
                >
                  <Eye className="mr-1 h-3 w-3" />
                  Visualizar Inscrição
                </Button>
                <Button variant="outline" size="sm" disabled={downloadBusy} onClick={()=>onDownload(registration)}><Download className="mr-1 h-3 w-3"/>Baixar ingresso</Button>
                {canTransfer && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedRegistration(registration);
                      setIsTransferDialogOpen(true);
                    }}
                  >
                    <RefreshCw className="mr-1 h-3 w-3" />
                    Transferir
                  </Button>
                )}
              </div>
            )}

            {!(
              registration.status === "confirmed" &&
              (registration.payment_status === "paid" || registration.payment_status === "convidado")
            ) && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {canTransfer && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedRegistration(registration);
                      setIsTransferDialogOpen(true);
                    }}
                  >
                    <RefreshCw className="mr-1 h-3 w-3" />
                    Transferir
                  </Button>
                )}
                {canCancel && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedRegistration(registration);
                      setIsCancelDialogOpen(true);
                    }}
                  >
                    <X className="mr-1 h-3 w-3" />
                    Cancelar
                  </Button>
                )}
              </div>
            )}
          </div>)}
          {!hasPublishedResults && transfersEnabled &&
            transferDeadlinePassed &&
            isUpcoming &&
            registration.status === "confirmed" &&
            (registration.payment_status === "paid" || registration.payment_status === "convidado") &&
            registration.event_transfer_until && (
              <Alert className="border-muted-foreground/30 bg-muted/30">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  {formatTransferDeadlineClosedMessagePtBr(registration.event_transfer_until)}
                </AlertDescription>
              </Alert>
            )}
        </div>
      </article>
    );
  };
