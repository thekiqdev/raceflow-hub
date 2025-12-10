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
import { Calendar, MapPin, QrCode, RefreshCw, X, Loader2, AlertCircle, Download, CreditCard, Eye } from "lucide-react";
import { format, isFuture } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { getRegistrations, transferRegistration, cancelRegistration, getPaymentStatus, type Registration } from "@/lib/api/registrations";
import { toast } from "sonner";
import { PixQrCode } from "@/components/payment/PixQrCode";

export function MyRegistrations() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  
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

  const loadRegistrations = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const response = await getRegistrations({ runner_id: user.id });

      if (response.success && response.data) {
        setRegistrations(response.data);
      } else {
        toast.error(response.error || "Erro ao carregar inscrições");
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
      const response = await transferRegistration(
        selectedRegistration.id, 
        transferCpf.trim() || undefined,
        transferEmail.trim() || undefined
      );

      if (response.success) {
        toast.success(response.message || "Inscrição transferida com sucesso!");
        setIsTransferDialogOpen(false);
        setTransferCpf("");
        setTransferEmail("");
        setSelectedRegistration(null);
        loadRegistrations();
      } else {
        toast.error(response.error || response.message || "Erro ao transferir inscrição");
      }
    } catch (error: any) {
      console.error("Error transferring registration:", error);
      toast.error(error.message || "Erro ao transferir inscrição");
    } finally {
      setIsTransferring(false);
    }
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

  const handleViewPix = async (registration: Registration) => {
    setSelectedRegistration(registration);
    setLoadingPix(true);
    setIsPixDialogOpen(true);
    
    try {
      const response = await getPaymentStatus(registration.id);
      
      if (response.success && response.data) {
        const paymentData = response.data;
        
        if (paymentData.pix_qr_code) {
          // Use payment due date if available, otherwise calculate (3 days from now)
          let dueDateString: string;
          if (paymentData.due_date) {
            dueDateString = paymentData.due_date.split('T')[0]; // Get only date part if it includes time
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
        } else {
          toast.error("QR Code PIX ainda não está disponível. Tente novamente em alguns instantes.");
          setIsPixDialogOpen(false);
        }
      } else {
        toast.error(response.error || "Erro ao buscar QR Code PIX");
        setIsPixDialogOpen(false);
      }
    } catch (error: any) {
      console.error("Error fetching payment status:", error);
      toast.error(error.message || "Erro ao buscar QR Code PIX");
      setIsPixDialogOpen(false);
    } finally {
      setLoadingPix(false);
    }
  };

  const activeRegistrations = registrations.filter((r) => 
    r.status === "confirmed" && r.payment_status === "paid"
  );
  const pendingRegistrations = registrations.filter((r) => 
    r.status !== "cancelled" && (r.status === "pending" || r.payment_status === "pending")
  );
  const cancelledRegistrations = registrations.filter((r) => 
    r.status === "cancelled"
  );

  const getStatusBadge = (status: string | undefined, paymentStatus: string | undefined) => {
    // Verificar cancelado primeiro (prioridade máxima)
    if (status === "cancelled") {
      return <Badge variant="destructive">Cancelado</Badge>;
    }
    if (status === "confirmed" && paymentStatus === "paid") {
      return <Badge className="bg-accent">Confirmada</Badge>;
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

  const RegistrationCard = ({ registration }: { registration: Registration }) => {
    const isUpcoming = registration.event_date && isFuture(new Date(registration.event_date));
    const canTransfer = registration.status === "confirmed" && 
                       registration.payment_status === "paid" && 
                       isUpcoming;
    const canCancel = (registration.status === "pending" || 
                      (registration.status === "confirmed" && registration.payment_status === "paid")) &&
                      isUpcoming;

    return (
      <Card className="overflow-hidden hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex justify-between items-start mb-3">
            <h3 className="font-semibold text-sm flex-1 pr-2">{registration.event_title || 'Evento'}</h3>
            {getStatusBadge(registration.status, registration.payment_status)}
          </div>

          <div className="space-y-2 text-xs text-muted-foreground mb-4">
            {registration.event_date && (
              <div className="flex items-center gap-2">
                <Calendar className="h-3 w-3" />
                <span>{format(new Date(registration.event_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
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
                   registration.payment_method}
                </span>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            {/* Botão Visualizar PIX - apenas para inscrições pendentes */}
            {(registration.status === "pending" || registration.payment_status === "pending") && (
              <Button 
                variant="outline" 
                size="sm" 
                className="flex-1"
                onClick={() => handleViewPix(registration)}
              >
                <CreditCard className="h-3 w-3 mr-1" />
                Visualizar PIX
              </Button>
            )}
            
            {/* Botões para inscrições confirmadas */}
            {registration.status === "confirmed" && registration.payment_status === "paid" && (
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
            {!(registration.status === "confirmed" && registration.payment_status === "paid") && (
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
              Canceladas ({cancelledRegistrations.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4">
            {activeRegistrations.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground mb-4">Nenhuma inscrição ativa</p>
                  <Button onClick={() => navigate("/runner/dashboard?tab=home")}>
                    Explorar Corridas
                  </Button>
                </CardContent>
              </Card>
            ) : (
              activeRegistrations.map((reg) => (
                <RegistrationCard key={reg.id} registration={reg} />
              ))
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
              pendingRegistrations.map((reg) => (
                <RegistrationCard key={reg.id} registration={reg} />
              ))
            )}
          </TabsContent>

          <TabsContent value="cancelled" className="space-y-4">
            {cancelledRegistrations.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <X className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Nenhuma inscrição cancelada</p>
                </CardContent>
              </Card>
            ) : (
              cancelledRegistrations.map((reg) => (
                <RegistrationCard key={reg.id} registration={reg} />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Transfer Dialog */}
      <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir Inscrição</DialogTitle>
            <DialogDescription>
              Informe o email e CPF da pessoa que irá receber a inscrição de {selectedRegistration?.event_title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email do novo titular</Label>
              <Input
                id="email"
                type="email"
                placeholder="email@exemplo.com"
                value={transferEmail}
                onChange={(e) => setTransferEmail(e.target.value)}
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
              />
              <p className="text-xs text-muted-foreground">
                Informe pelo menos o email ou CPF. A pessoa deve estar cadastrada na plataforma.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsTransferDialogOpen(false);
                setTransferCpf("");
                setTransferEmail("");
                setSelectedRegistration(null);
              }}
              disabled={isTransferring}
            >
              Cancelar
            </Button>
            <Button onClick={handleTransfer} disabled={isTransferring}>
              {isTransferring ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Transferindo...
                </>
              ) : (
                "Confirmar Transferência"
              )}
            </Button>
          </DialogFooter>
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
                <PixQrCode
                  pixQrCode={pixData.qrCode}
                  value={pixData.value}
                  dueDate={pixData.dueDate}
                  registrationId={selectedRegistration?.confirmation_code}
                  hideHeader={true}
                />
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
    </div>
  );
}
