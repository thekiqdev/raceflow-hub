import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Calendar, MapPin, QrCode, RefreshCw, X, Loader2, AlertCircle, Download, CreditCard, Eye, CheckCircle2 } from "lucide-react";
import { format, isFuture } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatDateOnlyBrasilia } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { getRegistrations, transferRegistration, cancelRegistration, getPaymentStatus, generatePayment, getPendingDifferencePayment, verifyPayment, type Registration } from "@/lib/api/registrations";
import { getEnabledModules } from "@/lib/api/systemSettings";
import { createTransferRequest, generateTransferPayment, getTransferRequestById, type TransferRequest } from "@/lib/api/transferRequests";
import { toast } from "sonner";
import { PixQrCode } from "@/components/payment/PixQrCode";
import { MissingAttributesModal } from "@/components/runner/MissingAttributesModal";
import { CompleteInvitationModal } from "@/components/runner/CompleteInvitationModal";

export function MyRegistrations() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [transfersEnabled, setTransfersEnabled] = useState(false);
  
  // Get initial tab from URL parameter, default to "active"
  const initialTab = searchParams.get("subtab") || "active";
  const [activeSubTab, setActiveSubTab] = useState(initialTab);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
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
    if (user) {
      loadRegistrations();
    }
  }, [user]);

  // Update active tab when URL parameter changes
  useEffect(() => {
    const subtabFromUrl = searchParams.get("subtab");
    if (subtabFromUrl && ["active", "pending", "cancelled"].includes(subtabFromUrl)) {
      setActiveSubTab(subtabFromUrl);
    }
  }, [searchParams]);

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
  }, []);

  const loadRegistrations = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const [registrationsResponse, settingsResponse] = await Promise.all([
        getRegistrations({ runner_id: user.id }),
        getEnabledModules(),
      ]);

      if (registrationsResponse.success && registrationsResponse.data) {
        setRegistrations(registrationsResponse.data);
      } else {
        toast.error(registrationsResponse.error || "Erro ao carregar inscrições");
      }

      if (settingsResponse.success && settingsResponse.data) {
        setTransfersEnabled(settingsResponse.data.enabled_modules?.transfers || false);
        setTransferFee(settingsResponse.data.transfer_fee || 0);
      }
    } catch (error: any) {
      console.error("Error loading registrations:", error);
      toast.error(error.message || "Erro ao carregar inscrições");
    } finally {
      setLoading(false);
    }
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
      if (response.success && response.payment_verified) {
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
            value: typeof registration.total_amount === 'number' 
              ? registration.total_amount 
              : parseFloat(registration.total_amount?.toString() || '0') || 0,
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
            value: typeof registration.total_amount === 'number' 
              ? registration.total_amount 
              : parseFloat(registration.total_amount?.toString() || '0') || 0,
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

  const activeRegistrations = registrations.filter((r) =>
    r.status === "confirmed" &&
    (r.payment_status === "paid" ||
      r.payment_status === "partially_paid" ||
      r.payment_status === "convidado")
  );
  const pendingRegistrations = registrations.filter((r) => 
    r.status !== "cancelled" && r.status !== "transferred" && (r.status === "pending" || r.payment_status === "pending")
  );
  const transferredRegistrations = registrations.filter((r) => 
    r.status === "transferred"
  );

  const getStatusBadge = (status: string | undefined, paymentStatus: string | undefined) => {
    // Verificar cancelado primeiro (prioridade máxima)
    if (status === "cancelled") {
      return <Badge variant="destructive">Cancelada</Badge>;
    }
    // Verificar transferido
    if (status === "transferred") {
      return <Badge variant="secondary" className="bg-purple-500 hover:bg-purple-600">Transferido</Badge>;
    }
    // Verificar confirmado e convidado (convite)
    if (status === "confirmed" && paymentStatus === "convidado") {
      return <Badge className="bg-blue-500">Convite</Badge>;
    }
    // Verificar confirmado e pago
    if (status === "confirmed" && paymentStatus === "paid") {
      return <Badge className="bg-accent">Confirmada</Badge>;
    }
    if (status === "confirmed" && paymentStatus === "partially_paid") {
      return <Badge className="bg-amber-500">Pago parcialmente</Badge>;
    }
    if (status === "pending" || paymentStatus === "pending") {
      return <Badge variant="secondary">Pendente</Badge>;
    }
    if (paymentStatus === "refunded") {
      return <Badge variant="outline">Reembolsado</Badge>;
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

  const formatCpf = (cpf: string | undefined) => {
    if (!cpf) return "N/A";
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  };

  // Mostrar "Completar convite" só quando a inscrição é por convite e ainda não tem categoria (corredor não completou)
  const needsCompleteInvitation = (reg: Registration) =>
    reg.payment_status === "convidado" && !reg.category_id;

  const RegistrationCard = ({ registration }: { registration: Registration }) => {
    const isUpcoming = registration.event_date && isFuture(new Date(registration.event_date));
    const eventAllowsTransfers = registration.event_transfers_enabled !== false; // Default to true if null/undefined
    const canTransfer = transfersEnabled &&
                       eventAllowsTransfers &&
                       registration.status === "confirmed" &&
                       (registration.payment_status === "paid" || registration.payment_status === "convidado") &&
                       registration.status !== "transferred" &&
                       isUpcoming;
    const canCancel = (registration.status === "pending" ||
                      (registration.status === "confirmed" && registration.payment_status === "paid")) &&
                      isUpcoming;
    const canCompleteInvitation = needsCompleteInvitation(registration);

    return (
      <Card className="overflow-hidden hover:shadow-md transition-shadow">
        {registration.event_banner_url && (
          <div className="relative w-full h-32 overflow-hidden bg-muted">
            <img
              src={registration.event_banner_url}
              alt={registration.event_title || 'Evento'}
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
              }}
            />
          </div>
        )}
        <CardContent className="p-4">
          <div className="flex justify-between items-start mb-3">
            <h3 className="font-semibold text-sm flex-1 pr-2">{registration.event_title || 'Evento'}</h3>
            {getStatusBadge(registration.status, registration.payment_status)}
          </div>

          <div className="space-y-2 text-xs text-muted-foreground mb-4">
            {registration.event_date && (
              <div className="flex items-center gap-2">
                <Calendar className="h-3 w-3" />
                <span>{formatDateOnlyBrasilia(registration.event_date)}</span>
              </div>
            )}
            {(registration.modality_name != null && registration.modality_name !== "") && (
              <div className="flex items-center gap-2">
                <MapPin className="h-3 w-3" />
                <span>{registration.modality_name}</span>
              </div>
            )}
            {registration.category_name && (
              <div className="flex items-center gap-2">
                <MapPin className="h-3 w-3" />
                <span>{registration.category_name} {registration.category_distance ? `(${registration.category_distance})` : ''}</span>
              </div>
            )}
            {registration.confirmation_code && (
              <div className="text-xs font-mono text-primary">
                Código: {registration.confirmation_code}
              </div>
            )}
          </div>

          <div className="bg-muted/50 rounded-lg p-3 mb-3 space-y-1">
            {(registration.modality_name != null && registration.modality_name !== "") && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Modalidade:</span>
                <span className="font-medium">{registration.modality_name}</span>
              </div>
            )}
            {registration.category_name && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Categoria:</span>
                <span className="font-medium">{registration.category_name}</span>
              </div>
            )}
            {registration.category_distance && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Distância:</span>
                <span className="font-medium">{registration.category_distance}</span>
              </div>
            )}
            {registration.kit_name && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Kit:</span>
                <span className="font-medium">{registration.kit_name}</span>
              </div>
            )}
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Valor:</span>
              <span className="font-medium">{formatCurrency(registration.total_amount)}</span>
            </div>
            {registration.payment_method && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Pagamento:</span>
                <span className="font-medium">
                  {registration.payment_method === 'pix' ? 'PIX' : 
                   registration.payment_method === 'credit_card' ? 'Cartão' : 
                   registration.payment_method === 'boleto' ? 'Boleto' : 
                   registration.payment_method === 'free_bonus' ? 'Convite' : 
                   registration.payment_method}
                </span>
              </div>
            )}
          </div>

          {/* Resumo financeiro quando há diferença a pagar */}
          {(registration.has_pending_difference || (registration.pending_difference_amount ?? 0) > 0) &&
           registration.payment_status !== 'paid' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/30 p-3 mb-3 space-y-2 text-xs">
              <div className="font-medium text-amber-800 dark:text-amber-200 mb-1.5">Resumo do pagamento</div>
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
              <div className="flex justify-between pt-1 border-t border-amber-200 dark:border-amber-800">
                <span className="font-medium text-amber-800 dark:text-amber-200">Valor total:</span>
                <span className="font-semibold">{formatCurrency(registration.total_amount ?? 0)}</span>
              </div>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            {/* Pagar diferença - apenas quando há cobrança pendente e inscrição ainda não está paga (não mostrar após confirmação manual pelo admin) */}
            {(registration.has_pending_difference || (registration.pending_difference_amount ?? 0) > 0) &&
             registration.payment_status !== 'paid' && (
              <>
                <Button 
                  variant="default" 
                  size="sm" 
                  className="flex-1"
                  onClick={() => handlePayDifference(registration)}
                >
                  <QrCode className="h-3 w-3 mr-1" />
                  Pagar diferença
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1"
                  onClick={() => handleVerifyPayment(registration)}
                  disabled={verifyingPaymentId === registration.id}
                >
                  {verifyingPaymentId === registration.id ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                  )}
                  Confirmar pagamento
                </Button>
              </>
            )}
            {/* Botão Visualizar PIX - apenas para inscrições pendentes (pagamento inicial) */}
            {(registration.status === "pending" || registration.payment_status === "pending") && !registration.has_pending_difference && (
              <>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1"
                  onClick={() => handleViewPix(registration)}
                >
                  <CreditCard className="h-3 w-3 mr-1" />
                  Visualizar PIX
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1"
                  onClick={() => handleVerifyPayment(registration)}
                  disabled={verifyingPaymentId === registration.id}
                >
                  {verifyingPaymentId === registration.id ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                  )}
                  Confirmar pagamento
                </Button>
              </>
            )}
            
            {/* Botão para completar convite (categoria/modalidade/kit) */}
            {canCompleteInvitation && (
              <Button
                variant="default"
                size="sm"
                className="w-full mb-2"
                onClick={() => {
                  setCompleteInvitationRegistration(registration);
                  setShowCompleteInvitationModal(true);
                }}
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Completar convite (escolher categoria, modalidade e kit)
              </Button>
            )}
            {/* Botões para inscrições confirmadas (pagas ou por convite) */}
            {registration.status === "confirmed" &&
              (registration.payment_status === "paid" || registration.payment_status === "convidado") && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => navigate(`/registration/validate/${registration.id}`)}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  Visualizar Inscrição
                </Button>
                {canTransfer && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setSelectedRegistration(registration);
                      setIsTransferDialogOpen(true);
                    }}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Transferir
                  </Button>
                )}
              </>
            )}

            {/* Botões para outras situações (não confirmadas) */}
            {!(
              registration.status === "confirmed" &&
              (registration.payment_status === "paid" || registration.payment_status === "convidado")
            ) && (
              <>
                {canTransfer && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1"
                    onClick={() => {
                      setSelectedRegistration(registration);
                      setIsTransferDialogOpen(true);
                    }}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Transferir
                  </Button>
                )}
                {canCancel && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setSelectedRegistration(registration);
                      setIsCancelDialogOpen(true);
                    }}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Cancelar
                  </Button>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="pb-20">
        <div className="bg-gradient-hero p-6">
          <h1 className="text-2xl font-bold text-white">Minhas Inscrições</h1>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

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
          {registrations.length} {registrations.length === 1 ? 'inscrição' : 'inscrições'} total
        </p>
      </div>

      {/* Tabs */}
      <div className="px-4 mt-6">
        <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="active">
              Ativas ({activeRegistrations.length})
            </TabsTrigger>
            <TabsTrigger value="pending">
              Pendentes ({pendingRegistrations.length})
            </TabsTrigger>
            <TabsTrigger value="cancelled">
              Transferidas ({transferredRegistrations.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4">
            {activeRegistrations.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground mb-4">Nenhuma inscrição ativa</p>
                  <Button onClick={() => navigate("/corredor/inicio")}>
                    Explorar Corridas
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeRegistrations.map((reg) => (
                  <RegistrationCard key={reg.id} registration={reg} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="pending" className="space-y-4">
            {pendingRegistrations.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Nenhuma inscrição pendente</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingRegistrations.map((reg) => (
                  <RegistrationCard key={reg.id} registration={reg} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="cancelled" className="space-y-4">
            {transferredRegistrations.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <RefreshCw className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Nenhuma inscrição transferida</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {transferredRegistrations.map((reg) => (
                  <RegistrationCard key={reg.id} registration={reg} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

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
