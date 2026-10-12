import { useState, useEffect, useRef } from "react";
import {RegistrationCard} from './RegistrationCard';
import {downloadLegacyTicket} from './downloadLegacyTicket';
import {OrderTicketActions} from './OrderTicketActions';
import {CheckoutTransferDialog} from './CheckoutTransferDialog';
import {ticketCardRegistration} from './ticketCardModel';
import {getMyTicketEvents,getMyTickets,type EventTimeline,type MyTicket,type MyTicketEvent,type MyTicketEventsPage,type MyTicketsPage} from '@/lib/api/myTickets';
import { useDebounce } from "@/hooks/useDebounce";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertCircle,Award,CheckCircle2,ChevronLeft,Clock,MapPin,Ticket } from "lucide-react";
import { formatTimeBrasilia } from "@/lib/utils";
import { openPublishedResults } from "@/lib/utils/resolveEventDestination";
import { useAuth } from "@/contexts/AuthContext";
import { cancelRegistration, getPaymentStatus, generatePayment, getPendingDifferencePayment, verifyPayment, type Registration } from "@/lib/api/registrations";
import { getEnabledModules } from "@/lib/api/systemSettings";
import { createTransferRequest, generateTransferPayment, getTransferRequestById, type TransferRequest } from "@/lib/api/transferRequests";
import { toast } from "sonner";
import { PixQrCode } from "@/components/payment/PixQrCode";
import { MissingAttributesModal } from "@/components/runner/MissingAttributesModal";
import { CompleteInvitationModal } from "@/components/runner/CompleteInvitationModal";
import { Alert, AlertDescription } from "@/components/ui/alert";

function eventDateParts(iso:string|null|undefined) {
  if(!iso) return null;
  const date=typeof iso==='string'?new Date(iso):iso;
  if(Number.isNaN(date.getTime())) return null;
  const day=date.toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',day:'numeric'});
  const month=date.toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',month:'long'});
  return {day,month:month.charAt(0).toUpperCase()+month.slice(1)};
}

export function MyRegistrations() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [transfersEnabled, setTransfersEnabled] = useState(false);
  
  const [ticketPage,setTicketPage]=useState<MyTicketsPage|null>(null);
  const [eventPage,setEventPage]=useState<MyTicketEventsPage|null>(null);
  const [selectedEvent,setSelectedEvent]=useState<MyTicketEvent|null>(null);
  const [page,setPage]=useState(1),[searchInput,setSearchInput]=useState(''),[loadError,setLoadError]=useState('');
  const [timeline,setTimeline]=useState<EventTimeline>('all');
  const debouncedSearch=useDebounce(searchInput,400);
  // Limpar o campo aplica na hora; digitar continua com debounce.
  const search=searchInput.trim()===''?'':debouncedSearch.trim();
  const [groupTransfer,setGroupTransfer]=useState<MyTicket|null>(null);
  const requestSequence=useRef(0);
  const showEventList=!selectedEvent;
  const statusCounts=ticketPage?.counts ?? eventPage?.counts;
  function openEvent(event:MyTicketEvent) {setSelectedEvent(event);setPage(1);setSearchInput('');}
  function clearSearch() {setSearchInput('');setPage(1);}
  function setEventTimeline(next:EventTimeline) {setTimeline(next);setPage(1);}
  const downloading=useRef(false),[downloadBusy,setDownloadBusy]=useState(false);
  async function handleDownload(registration:Registration) {
    if(!user || downloading.current)return;downloading.current=true;setDownloadBusy(true);
    try {await downloadLegacyTicket(registration.id,user.id);}catch(e){toast.error(e instanceof Error?e.message:'Não foi possível baixar o ingresso.');}
    finally{downloading.current=false;setDownloadBusy(false);}
  }
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [transferCpf, setTransferCpf] = useState("");
  const [transferEmail, setTransferEmail] = useState("");
  const [selectedRegistration, setSelectedRegistration] = useState<Registration | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isPixDialogOpen, setIsPixDialogOpen] = useState(false);
  const [pixData, setPixData] = useState<{
    qrCode: string;
    value: number;
    dueDate: string;
  } | null>(null);
  const [loadingPix, setLoadingPix] = useState(false);
  const [transferStep, setTransferStep] = useState<1 | 2>(1);
  const [currentTransferRequest, setCurrentTransferRequest] = useState<TransferRequest | null>(null);
  const [transferFee, setTransferFee] = useState<number>(0);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [showMissingAttributesModal, setShowMissingAttributesModal] = useState(false);
  const [verifyingPaymentId, setVerifyingPaymentId] = useState<string | null>(null);
  const [completeInvitationRegistration, setCompleteInvitationRegistration] = useState<Registration | null>(null);
  const [showCompleteInvitationModal, setShowCompleteInvitationModal] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [search, selectedEvent?.event_id]);

  useEffect(() => {
    if (user) {
      loadRegistrations();
    }
    return()=>{requestSequence.current++;};
  }, [user,page,search,timeline,selectedEvent?.event_id]);

  // Etapa 6: ao vir do completar-cadastro, abrir modal de atributos faltantes
  useEffect(() => {
    if (!user) return;
    const openMissing = searchParams.get("openMissingAttributes");
    if (openMissing === "1") {
      localStorage.removeItem("missingAttributesAlertDismissed");
      setShowMissingAttributesModal(true);
      navigate("/corredor/minhas-inscricoes", { replace: true });
    }
  }, [user, searchParams, navigate]);

  // Listen for settings updates
  useEffect(() => {
    const handleSettingsUpdate = () => {
      loadRegistrations();
    };

    window.addEventListener('admin-settings-updated', handleSettingsUpdate);
    return () => {
      window.removeEventListener('admin-settings-updated', handleSettingsUpdate);
    };
  }, [user,page,search,timeline,selectedEvent?.event_id]);

  const loadRegistrations = async () => {
    if(!user) return;
    const listingEvents=!selectedEvent;
    const sequence=++requestSequence.current;setLoading(true);setLoadError('');
    try {
      const settingsPromise=getEnabledModules();
      if(listingEvents) {
        const [result,settings]=await Promise.all([getMyTicketEvents({page,page_size:20,search,timeline}),settingsPromise]);
        if(sequence!==requestSequence.current) return;
        if(!result.success || !result.data) throw new Error(result.error || 'Não foi possível carregar os eventos.');
        setEventPage(result.data);setTicketPage(null);
        const last=Math.max(1,Math.ceil(result.data.total/result.data.page_size));if(page>last)setPage(last);
        setTransfersEnabled(!!settings.data?.enabled_modules?.transfers);setTransferFee(settings.data?.transfer_fee || 0);
      } else {
        // Detalhe do evento: ingressos não cancelados (confirmados + pendentes).
        const [result,settings]=await Promise.all([getMyTickets({page,page_size:20,status:'all',search,event_id:selectedEvent!.event_id}),settingsPromise]);
        if(sequence!==requestSequence.current) return;
        if(!result.success || !result.data) throw new Error(result.error || 'Não foi possível carregar as inscrições.');
        setTicketPage(result.data);
        setEventPage(prev=>prev?{...prev,counts:result.data!.counts}:prev);
        const last=Math.max(1,Math.ceil(result.data.total/result.data.page_size));if(page>last)setPage(last);
        setTransfersEnabled(!!settings.data?.enabled_modules?.transfers);setTransferFee(settings.data?.transfer_fee || 0);
      }
    } catch(error) {if(sequence===requestSequence.current){setTicketPage(null);if(listingEvents)setEventPage(null);setLoadError(error instanceof Error?error.message:'Não foi possível carregar as inscrições.');}}
    finally {if(sequence===requestSequence.current)setLoading(false);}
  };

  const handleTransfer = async () => {
    if ((!transferCpf.trim() && !transferEmail.trim()) || !selectedRegistration) {
      toast.error("Por favor, informe o CPF ou email do novo titular");
      return;
    }

    setIsTransferring(true);
    try {
      // Step 1: Create transfer request
      const response = await createTransferRequest({
        registration_id: selectedRegistration.id,
        new_runner_cpf: transferCpf.trim() || undefined,
        new_runner_email: transferEmail.trim() || undefined,
      });

      if (response.success && response.data) {
        setCurrentTransferRequest(response.data);
        
        // If there's a fee, go to step 2 (payment)
        if (response.data.transfer_fee > 0) {
          setTransferStep(2);
          // Generate payment
          await handleGeneratePayment(response.data.id);
        } else {
          // No fee, transfer completed
          toast.success(response.message || "Solicitação de transferência criada com sucesso!");
          setIsTransferDialogOpen(false);
          resetTransferDialog();
          loadRegistrations();
        }
      } else {
        toast.error(response.error || response.message || "Erro ao criar solicitação de transferência");
      }
    } catch (error: any) {
      console.error("Error creating transfer request:", error);
      toast.error(error.message || "Erro ao criar solicitação de transferência");
    } finally {
      setIsTransferring(false);
    }
  };

  const handleGeneratePayment = async (transferRequestId: string) => {
    setLoadingPix(true);
    setPaymentConfirmed(false);
    try {
      const response = await generateTransferPayment(transferRequestId);

      if (response.success && response.data) {
        if (!response.data.pix_qr_code) {
          toast.error("QR Code PIX não foi gerado. Tente novamente.");
          return;
        }
        setPixData({
          qrCode: response.data.pix_qr_code,
          value: response.data.value,
          dueDate: response.data.due_date,
        });
        
        // Start polling for payment status
        startPaymentStatusPolling(transferRequestId);
      } else {
        toast.error(response.error || "Erro ao gerar pagamento");
      }
    } catch (error: any) {
      console.error("Error generating payment:", error);
      toast.error(error.message || "Erro ao gerar pagamento");
    } finally {
      setLoadingPix(false);
    }
  };

  const startPaymentStatusPolling = (transferRequestId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await getTransferRequestById(transferRequestId);
        if (response.success && response.data) {
          if (response.data.payment_status === 'paid') {
            setPaymentConfirmed(true);
            clearInterval(interval);
            toast.success("Pagamento confirmado! Sua solicitação será analisada pelo administrador.");
            // Reload registrations after a short delay
            setTimeout(() => {
              loadRegistrations();
            }, 2000);
          }
        }
      } catch (error) {
        console.error("Error checking payment status:", error);
      }
    }, 5000); // Check every 5 seconds

    // Stop polling after 10 minutes
    setTimeout(() => {
      clearInterval(interval);
    }, 600000);
  };

  const resetTransferDialog = () => {
    setTransferStep(1);
    setCurrentTransferRequest(null);
    setTransferCpf("");
    setTransferEmail("");
    setSelectedRegistration(null);
    setPixData(null);
    setPaymentConfirmed(false);
  };

  const handleCancel = async () => {
    if (!selectedRegistration) return;

    setIsCancelling(true);
    try {
      const response = await cancelRegistration(selectedRegistration.id);

      if (response.success) {
        toast.success(response.message || "Inscrição cancelada com sucesso!");
        setIsCancelDialogOpen(false);
        setSelectedRegistration(null);
        loadRegistrations();
      } else {
        toast.error(response.error || response.message || "Erro ao cancelar inscrição");
      }
    } catch (error: any) {
      console.error("Error cancelling registration:", error);
      toast.error(error.message || "Erro ao cancelar inscrição");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleVerifyPayment = async (registration: Registration) => {
    setVerifyingPaymentId(registration.id);
    try {
      const response = await verifyPayment(registration.id);
      if (response.success && ((response as typeof response & {payment_verified?:boolean}).payment_verified ?? response.data?.payment_verified)) {
        toast.success(response.message || "Pagamento confirmado. Atualizando lista.");
        loadRegistrations();
      } else {
        toast.info(response.message || "Pagamento ainda não identificado. Tente novamente em instantes.");
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao verificar pagamento.");
    } finally {
      setVerifyingPaymentId(null);
    }
  };

  const handlePayDifference = async (registration: Registration) => {
    setSelectedRegistration(registration);
    setLoadingPix(true);
    setIsPixDialogOpen(true);
    setPixData(null);
    try {
      const response = await getPendingDifferencePayment(registration.id);
      if (response.success && response.data) {
        const d = response.data as { already_paid?: boolean; pix_qr_code?: string | null; value?: number; due_date?: string };
        if (d.already_paid) {
          toast.success("Pagamento já foi confirmado. Atualizando lista.");
          setIsPixDialogOpen(false);
          loadRegistrations();
          return;
        }
        if (d.pix_qr_code) {
          setPixData({
            qrCode: d.pix_qr_code,
            value: d.value ?? 0,
            dueDate: d.due_date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
          });
        } else {
          toast.error("QR Code PIX da diferença não disponível.");
          setIsPixDialogOpen(false);
        }
      } else {
        toast.error(response.error || "Erro ao carregar pagamento da diferença");
        setIsPixDialogOpen(false);
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao carregar pagamento da diferença");
      setIsPixDialogOpen(false);
    } finally {
      setLoadingPix(false);
    }
  };

  const handleViewPix = async (registration: Registration) => {
    setSelectedRegistration(registration);
    setLoadingPix(true);
    setIsPixDialogOpen(true);
    setPixData(null);
    try {
      // First, try to get existing payment status (o backend já verifica no Asaas e atualiza se pago)
      let response = await getPaymentStatus(registration.id);
      
      if (response.success && response.data) {
        const paymentData = response.data;
        if (paymentData.status === 'paid' || paymentData.status === 'confirmed') {
          toast.success("Pagamento já foi confirmado. Atualizando lista.");
          setIsPixDialogOpen(false);
          loadRegistrations();
          return;
        }
        // If QR Code exists, use it
        if (paymentData.pix_qr_code) {
          let dueDateString: string;
          if (paymentData.due_date) {
            dueDateString = paymentData.due_date.split('T')[0];
          } else {
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 3);
            dueDateString = dueDate.toISOString().split('T')[0];
          }
          
          setPixData({
            qrCode: paymentData.pix_qr_code,
            value: Number(registration.total_amount) || 0,
            dueDate: dueDateString,
          });
          return;
        }
      }
      
      // If no QR Code found, try to generate payment
      console.log('QR Code não encontrado, tentando gerar pagamento...');
      response = await generatePayment(registration.id);
      
      if (response.success && response.data) {
        const paymentData = response.data;
        
        if (paymentData.pix_qr_code) {
          let dueDateString: string;
          if (paymentData.due_date) {
            dueDateString = paymentData.due_date.split('T')[0];
          } else {
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 3);
            dueDateString = dueDate.toISOString().split('T')[0];
          }
          
          setPixData({
            qrCode: paymentData.pix_qr_code,
            value: Number(registration.total_amount) || 0,
            dueDate: dueDateString,
          });
          toast.success("QR Code PIX gerado com sucesso!");
        } else {
          toast.error("QR Code PIX ainda não está disponível. Tente novamente em alguns instantes.");
          setIsPixDialogOpen(false);
        }
      } else {
        toast.error(response.error || "Erro ao gerar QR Code PIX");
        setIsPixDialogOpen(false);
      }
    } catch (error: any) {
      console.error("Error fetching/generating payment:", error);
      toast.error(error.message || "Erro ao buscar/gerar QR Code PIX");
      setIsPixDialogOpen(false);
    } finally {
      setLoadingPix(false);
    }
  };

  const handleSelectAttributes = () => {
    setShowMissingAttributesModal(true);
  };

  const handleAttributesSaved = () => {
    // Limpar flag de descarte do alerta
    localStorage.removeItem("missingAttributesAlertDismissed");
    // Recarregar dados
    loadRegistrations();
  };

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="bg-gradient-hero p-6">
        <h1 className="text-2xl font-bold text-white mb-2">Minhas Inscrições</h1>
        <p className="text-white/80 text-sm">
          {statusCounts?Object.entries(statusCounts).reduce((sum,[group,n])=>group==='cancelled'?sum:sum+n,0):'…'} inscrições
        </p>
      </div>

      <div className="px-4 mt-6 space-y-5 sm:px-6">
        {showEventList && <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="ticket-search">Buscar evento</Label>
            <Input
              id="ticket-search"
              className="min-h-11"
              value={searchInput}
              maxLength={120}
              onChange={e=>{setSearchInput(e.target.value);}}
              placeholder="Nome do evento"
              autoComplete="off"
            />
          </div>
          <div role="group" aria-label="Filtrar por período" className="grid grid-cols-3 gap-2">
            {([['all','Todos'],['upcoming','Próximos'],['past','Encerrados']] as const).map(([value,label])=>(
              <Button
                key={value}
                type="button"
                variant={timeline===value?'default':'outline'}
                className="min-h-11"
                aria-pressed={timeline===value}
                onClick={()=>setEventTimeline(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>}
        {selectedEvent && <div className="sticky top-0 z-10 -mx-4 space-y-3 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Button type="button" variant="outline" className="min-h-11 w-full shrink-0 sm:w-auto" onClick={()=>{setSelectedEvent(null);setPage(1);setSearchInput('');}}>
              <ChevronLeft className="mr-1 h-4 w-4"/>Voltar aos eventos
            </Button>
            <div className="min-w-0 flex-1">
              <Label htmlFor="ticket-search" className="sr-only">Buscar participante</Label>
              <Input
                id="ticket-search"
                className="min-h-11"
                value={searchInput}
                maxLength={120}
                onChange={e=>{setSearchInput(e.target.value);}}
                placeholder="Buscar participante"
                autoComplete="off"
              />
            </div>
          </div>
          <div>
            <h2 className="text-lg font-semibold break-words sm:text-xl">{selectedEvent.title}</h2>
            <p className="text-sm text-muted-foreground">
              {selectedEvent.confirmed_count} {selectedEvent.confirmed_count===1?'confirmado':'confirmados'}
              {selectedEvent.pending_count>0?` · ${selectedEvent.pending_count} ${selectedEvent.pending_count===1?'pendente':'pendentes'}`:''}
              {(selectedEvent.transferred_count ?? 0)>0?` · ${selectedEvent.transferred_count} ${selectedEvent.transferred_count===1?'transferido':'transferidos'}`:''}
            </p>
          </div>
        </div>}
        {loading && <p role="status">Consultando suas inscrições…</p>}
        {loadError && <Alert variant="destructive"><AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">{loadError} <Button variant="outline" className="min-h-11 shrink-0" onClick={()=>void loadRegistrations()}>Tentar novamente</Button></AlertDescription></Alert>}
        {!loading && !loadError && showEventList && eventPage && !eventPage.items.length && (
          <Card><CardContent className="space-y-4 py-10 text-center">
            <p>{search?'Nenhum evento encontrado para essa busca.':timeline==='upcoming'?'Nenhuma corrida próxima com ingresso confirmado.':timeline==='past'?'Nenhuma corrida encerrada com ingresso confirmado.':'Nenhum evento com ingresso confirmado.'}</p>
            <div className="flex flex-col justify-center gap-2 sm:flex-row">
              {(search || timeline!=='all') && <Button type="button" variant="outline" className="min-h-11" onClick={()=>{clearSearch();setEventTimeline('all');}}>Limpar filtros</Button>}
              <Button className="min-h-11" onClick={()=>navigate('/corredor/inicio')}>Explorar corridas</Button>
            </div>
          </CardContent></Card>
        )}
        {!loading && !loadError && !showEventList && ticketPage && !ticketPage.items.length && (
          <Card><CardContent className="space-y-4 py-10 text-center">
            <p>{search?'Nenhuma inscrição encontrada para essa busca.':'Nenhuma inscrição disponível neste evento.'}</p>
            <div className="flex flex-col justify-center gap-2 sm:flex-row">
              {search && <Button type="button" variant="outline" className="min-h-11" onClick={clearSearch}>Limpar busca</Button>}
              <Button className="min-h-11" onClick={()=>setSelectedEvent(null)}>Voltar aos eventos</Button>
            </div>
          </CardContent></Card>
        )}
        {!loading && !loadError && showEventList && !!eventPage?.items.length && <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{eventPage.items.map(event=>{
          const ticketTotal=event.confirmed_count+event.pending_count+(event.transferred_count ?? 0);
          const dateParts=eventDateParts(event.date);
          const timeLabel=formatTimeBrasilia(event.date);
          const ended=Boolean(event.ended);
          const hasResults=Boolean(event.has_results && event.result_url);
          return (
          <article
            key={event.event_id}
            data-event-id={event.event_id}
            data-ended={ended?'true':'false'}
            role="button"
            tabIndex={0}
            aria-label={`Ver inscrições de ${event.title}${ended?' (encerrado)':''}`}
            className={`group relative aspect-[4/3] min-h-[220px] cursor-pointer overflow-hidden rounded-[1.35rem] bg-zinc-800 shadow-md outline-none transition-transform hover:scale-[1.01] focus-visible:ring-2 focus-visible:ring-ring sm:min-h-[260px] ${ended?'opacity-95':''}`}
            onClick={()=>openEvent(event)}
            onKeyDown={e=>{if(e.key==='Enter' || e.key===' '){e.preventDefault();openEvent(event);}}}
          >
            {event.banner_url
              ? <img src={event.banner_url} alt="" className={`absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 ${ended?'grayscale-[35%]':''}`}/>
              : <div className="absolute inset-0 bg-gradient-to-br from-zinc-700 to-zinc-900" aria-hidden="true"/>}
            <div className={`absolute inset-0 bg-gradient-to-t ${ended?'from-black/85 via-black/40 to-black/25':'from-black/75 via-black/20 to-black/10'}`} aria-hidden="true"/>
            <div className="pointer-events-none absolute left-1/2 top-0 z-20 h-3.5 w-10 -translate-x-1/2 rounded-b-full bg-background shadow-sm" aria-hidden="true"/>
            <div className="absolute left-3 right-3 top-4 z-10 flex flex-wrap items-center gap-2 sm:left-4 sm:right-4">
              {ended && (
                <span className="inline-flex items-center rounded-full bg-zinc-950/75 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
                  Encerrado
                </span>
              )}
              {hasResults && (
                <span className="inline-flex items-center rounded-full bg-amber-500/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-950 backdrop-blur-sm">
                  Resultado
                </span>
              )}
            </div>
            <div className="absolute left-3 top-[40%] z-10 flex flex-col items-start gap-2 sm:left-4">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm sm:text-sm">
                <Ticket className="h-3.5 w-3.5 shrink-0" aria-hidden="true"/>
                {ticketTotal} {ticketTotal===1?'ingresso':'ingressos'}
              </span>
              {hasResults && (
                <Button
                  type="button"
                  size="sm"
                  className="min-h-9 rounded-full bg-white text-zinc-900 hover:bg-white/90"
                  onClick={e=>{e.stopPropagation();openPublishedResults({result_url:event.result_url});}}
                  onKeyDown={e=>e.stopPropagation()}
                >
                  <Award className="mr-1.5 h-3.5 w-3.5" aria-hidden="true"/>
                  Ver resultado
                </Button>
              )}
            </div>
            <div className="absolute inset-x-0 bottom-0 z-10 p-3 sm:p-3.5">
              <div className="flex items-stretch gap-3 rounded-2xl bg-black/60 p-3 text-white backdrop-blur-md sm:gap-3.5 sm:p-3.5">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <h3 className="text-base font-semibold leading-snug break-words sm:text-lg">{event.title}</h3>
                  {!!event.location && (
                    <p className="flex items-start gap-1.5 text-xs text-white/85 sm:text-sm">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true"/>
                      <span className="min-w-0 break-words">{event.location}</span>
                    </p>
                  )}
                  {timeLabel && !ended && (
                    <p className="flex items-center gap-1.5 text-xs text-white/85 sm:text-sm">
                      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true"/>
                      {timeLabel}
                    </p>
                  )}
                  {ended && !hasResults && (
                    <p className="text-xs text-white/75 sm:text-sm">Corrida já realizada</p>
                  )}
                </div>
                {dateParts && (
                  <div className="flex w-[4.75rem] shrink-0 flex-col items-center justify-center rounded-xl bg-black/50 px-2 py-2.5 text-center sm:w-[5.25rem]">
                    <span className="text-xl font-bold leading-none tracking-tight sm:text-2xl">{dateParts.day}</span>
                    <span className="mt-1 text-[10px] font-medium capitalize text-white/85 sm:text-xs">{dateParts.month}</span>
                  </div>
                )}
              </div>
            </div>
          </article>
          );
        })}</div>}
        {!loading && !loadError && !showEventList && !!ticketPage?.items.length && <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{ticketPage.items.map(ticket=><RegistrationCard key={ticket.registration_id}
          registration={ticketCardRegistration(ticket)} transfersEnabled={transfersEnabled} verifyingPaymentId={verifyingPaymentId} navigate={navigate}
          totalLabel={ticket.amounts.total_cents===null?'Valor não informado':undefined}
          batchName={ticket.selection.batch}
          resultUrl={ticket.event.result_url || selectedEvent?.result_url || null}
          onDownload={handleDownload} downloadBusy={downloadBusy}
          handlePayDifference={handlePayDifference} handleVerifyPayment={handleVerifyPayment} handleViewPix={handleViewPix}
          setCompleteInvitationRegistration={setCompleteInvitationRegistration} setShowCompleteInvitationModal={setShowCompleteInvitationModal}
          setSelectedRegistration={setSelectedRegistration} setIsTransferDialogOpen={setIsTransferDialogOpen} setIsCancelDialogOpen={setIsCancelDialogOpen}
          participant={<div><p className="font-semibold break-words">{ticket.participant.name || 'Participante cadastrado'}</p>{ticket.state.group!=='transferred' && <p className="mt-1 text-xs">{ticket.relationship.runner?'Seu ingresso':ticket.relationship.buyer?'Comprado por você':'Histórico de inscrição'}{ticket.participant.cpf_masked?' · '+ticket.participant.cpf_masked:''}</p>}</div>}
          statusBadge={ticket.state.group==='refunded'?<Badge variant="outline" className="border-white/40 bg-white/10 text-white">Reembolsado</Badge>:ticket.state.group==='cancelled'?<Badge variant="destructive">Cancelada</Badge>:ticket.state.group==='transferred'?<Badge variant="outline" className="border-white/40 bg-white/10 text-white">Transferido</Badge>:ticket.source==='order' && !ticket.ticket.released?<Badge variant="secondary">{ticket.state.order==='needs_review'?'Em revisão':'Aguardando confirmação'}</Badge>:undefined}
          actions={ticket.source==='order'?<OrderTicketActions ticket={ticket} transfersEnabled={transfersEnabled} onTransfer={()=>setGroupTransfer(ticket)}/>:undefined}
        />)}</div>}
        {(()=>{
          const list=showEventList?eventPage:ticketPage;
          if(!list || list.total<=list.page_size) return null;
          return <nav aria-label="Páginas de inscrições" className="flex flex-wrap items-center justify-between gap-3 pt-1"><Button variant="outline" className="min-h-11 flex-1 sm:flex-none" disabled={loading || page===1} onClick={()=>setPage(p=>p-1)}>Anterior</Button><span className="order-first w-full text-center text-sm sm:order-none sm:w-auto">Página {page} de {Math.ceil(list.total/list.page_size)}</span><Button variant="outline" className="min-h-11 flex-1 sm:flex-none" disabled={loading || page*list.page_size>=list.total} onClick={()=>setPage(p=>p+1)}>Próxima</Button></nav>;
        })()}
      </div>
      {groupTransfer && user && <CheckoutTransferDialog key={groupTransfer.registration_id} ticket={groupTransfer} userId={user.id} fee={transferFee} onClose={()=>{setGroupTransfer(null);void loadRegistrations();}} onComplete={()=>void loadRegistrations()}/>}

      {/* Transfer Dialog */}
      <Dialog open={isTransferDialogOpen} onOpenChange={(open) => {
        setIsTransferDialogOpen(open);
        if (!open) {
          resetTransferDialog();
        }
      }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {transferStep === 1 ? "Transferir Inscrição" : "Pagamento da Taxa"}
            </DialogTitle>
            <DialogDescription>
              {transferStep === 1 
                ? `Informe o email e CPF da pessoa que irá receber a inscrição de ${selectedRegistration?.event_title}`
                : `Complete o pagamento da taxa de transferência para finalizar a solicitação`
              }
            </DialogDescription>
          </DialogHeader>
          
          {transferStep === 1 ? (
            <>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email do novo titular</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@exemplo.com"
                    value={transferEmail}
                    onChange={(e) => setTransferEmail(e.target.value)}
                    disabled={isTransferring}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cpf">CPF do novo titular</Label>
                  <Input
                    id="cpf"
                    placeholder="000.000.000-00"
                    value={transferCpf}
                    onChange={(e) => setTransferCpf(e.target.value)}
                    maxLength={14}
                    disabled={isTransferring}
                  />
                  <p className="text-xs text-muted-foreground">
                    Informe pelo menos o email ou CPF. A pessoa deve estar cadastrada na plataforma.
                  </p>
                  {transferFee > 0 && (
                    <p className="text-sm font-medium text-primary mt-2">
                      Taxa de transferência: R$ {transferFee.toFixed(2).replace('.', ',')}
                    </p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setIsTransferDialogOpen(false);
                    resetTransferDialog();
                  }}
                  disabled={isTransferring}
                >
                  Cancelar
                </Button>
                <Button onClick={handleTransfer} disabled={isTransferring}>
                  {isTransferring ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Criando solicitação...
                    </>
                  ) : (
                    "Próximo"
                  )}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="space-y-4 py-4">
                {loadingPix ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : pixData && pixData.qrCode ? (
                  <div className="space-y-4">
                    {paymentConfirmed ? (
                      <div className="space-y-4 text-center py-4">
                        <CheckCircle2 className="h-16 w-16 mx-auto text-green-500" />
                        <div>
                          <h3 className="text-lg font-semibold text-green-600 mb-2">
                            Pagamento Confirmado!
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Sua solicitação de transferência foi recebida e será analisada pelo administrador.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <PixQrCode
                          pixQrCode={pixData.qrCode}
                          value={pixData.value}
                          dueDate={pixData.dueDate}
                          hideHeader={true}
                        />
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <p className="text-sm text-blue-800 text-center">
                            Aguardando confirmação do pagamento. Você será notificado automaticamente quando o pagamento for confirmado.
                          </p>
                        </div>
                        <p className="text-sm text-muted-foreground text-center">
                          Após o pagamento, sua solicitação será enviada para aprovação do administrador.
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 text-destructive" />
                    <p className="text-sm text-muted-foreground">
                      Erro ao gerar pagamento. Tente novamente.
                    </p>
                  </div>
                )}
              </div>
              <DialogFooter>
                {!paymentConfirmed && (
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setTransferStep(1);
                      setPixData(null);
                      setPaymentConfirmed(false);
                    }}
                    disabled={loadingPix}
                  >
                    Voltar
                  </Button>
                )}
                <Button 
                  onClick={() => {
                    setIsTransferDialogOpen(false);
                    resetTransferDialog();
                    if (paymentConfirmed) {
                      loadRegistrations();
                    }
                  }}
                  disabled={loadingPix}
                >
                  {paymentConfirmed ? "Fechar" : "Fechar"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Inscrição</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja cancelar a inscrição em {selectedRegistration?.event_title}?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Esta ação não pode ser desfeita. O reembolso será processado de acordo com a política do evento.
            </p>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsCancelDialogOpen(false);
                setSelectedRegistration(null);
              }}
              disabled={isCancelling}
            >
              Não, manter inscrição
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={isCancelling}>
              {isCancelling ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelando...
                </>
              ) : (
                "Sim, cancelar inscrição"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PIX QR Code Dialog */}
      <Dialog open={isPixDialogOpen} onOpenChange={setIsPixDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pagamento via PIX</DialogTitle>
            <DialogDescription>
              {selectedRegistration?.event_title}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {loadingPix ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="mt-4 text-sm text-muted-foreground">
                  Carregando QR Code PIX...
                </p>
              </div>
            ) : pixData ? (
              <div className="w-full">
                {pixData.qrCode ? (
                  <PixQrCode
                    pixQrCode={pixData.qrCode}
                    value={pixData.value}
                    dueDate={pixData.dueDate}
                    registrationId={selectedRegistration?.confirmation_code}
                    hideHeader={true}
                  />
                ) : (
                  <div className="text-center py-8">
                    <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      QR Code PIX não disponível no momento
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  QR Code PIX não disponível no momento
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsPixDialogOpen(false);
                setPixData(null);
                setSelectedRegistration(null);
              }}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de seleção de atributos pendentes */}
      <MissingAttributesModal
        open={showMissingAttributesModal}
        onOpenChange={setShowMissingAttributesModal}
        onSuccess={handleAttributesSaved}
      />
      {/* Modal para completar convite (categoria, modalidade, kit) */}
      <CompleteInvitationModal
        open={showCompleteInvitationModal}
        onOpenChange={(open) => {
          setShowCompleteInvitationModal(open);
          if (!open) setCompleteInvitationRegistration(null);
        }}
        registration={completeInvitationRegistration}
        onSuccess={handleAttributesSaved}
      />
    </div>
  );
}
