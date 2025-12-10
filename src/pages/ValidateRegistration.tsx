import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Calendar, MapPin, User, CheckCircle, XCircle, AlertCircle, Loader2, ArrowRightLeft } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getRegistrationById, transferRegistration, type Registration } from "@/lib/api/registrations";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

// Helper function to format price
const formatPrice = (price: number): string => {
  if (price === 0) return "Grátis";
  return `R$ ${price.toFixed(2).replace('.', ',')}`;
};

export default function ValidateRegistration() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferEmail, setTransferEmail] = useState("");
  const [transferCpf, setTransferCpf] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);

  useEffect(() => {
    if (id) {
      loadRegistration();
    }
  }, [id]);

  const loadRegistration = async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError(null);
      const response = await getRegistrationById(id);

      if (response.success && response.data) {
        setRegistration(response.data);
      } else {
        setError(response.error || "Inscrição não encontrada");
        toast.error(response.error || "Inscrição não encontrada");
      }
    } catch (error: any) {
      console.error("Error loading registration:", error);
      setError(error.message || "Erro ao carregar inscrição");
      toast.error(error.message || "Erro ao carregar inscrição");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-gradient-hero p-4 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white hover:bg-white/20">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold text-white">Validação de Inscrição</h1>
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (error || !registration) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-gradient-hero p-4 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white hover:bg-white/20">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold text-white">Validação de Inscrição</h1>
          </div>
        </div>
        <div className="p-4 max-w-md mx-auto">
          <Card>
            <CardContent className="py-12 text-center">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
              <p className="text-muted-foreground mb-4">{error || "Inscrição não encontrada"}</p>
              <Button onClick={loadRegistration}>Tentar Novamente</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const isConfirmed = registration.status === "confirmed" && registration.payment_status === "paid";
  const locationText = registration.location || `${registration.city || ''}, ${registration.state || ''}`.trim() || 'Local não informado';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-hero p-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white hover:bg-white/20">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold text-white">Validação de Inscrição</h1>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 max-w-md mx-auto space-y-4">
        {/* Status Card */}
        <Card className={isConfirmed ? "border-green-500 bg-green-50" : "border-yellow-500 bg-yellow-50"}>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-3">
              {isConfirmed ? (
                <>
                  <CheckCircle className="h-16 w-16 text-green-600" />
                  <div className="text-center">
                    <h2 className="text-xl font-bold text-green-800">Inscrição Confirmada</h2>
                    <p className="text-sm text-green-700 mt-1">
                      Pagamento aprovado e inscrição válida
                    </p>
                  </div>
                  <Badge className="bg-green-600 text-white text-base px-4 py-1">
                    Status: CONFIRMADA
                  </Badge>
                </>
              ) : (
                <>
                  <AlertCircle className="h-16 w-16 text-yellow-600" />
                  <div className="text-center">
                    <h2 className="text-xl font-bold text-yellow-800">Inscrição Pendente</h2>
                    <p className="text-sm text-yellow-700 mt-1">
                      Aguardando confirmação de pagamento
                    </p>
                  </div>
                  <Badge className="bg-yellow-600 text-white text-base px-4 py-1">
                    Status: PENDENTE
                  </Badge>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Event Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Detalhes do Evento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <h3 className="font-semibold text-primary">{registration.event_title || 'Evento'}</h3>
            {registration.event_date && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>
                  {format(new Date(registration.event_date), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", {
                    locale: ptBR
                  })}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>{locationText}</span>
            </div>
          </CardContent>
        </Card>

        {/* Registration Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Detalhes da Inscrição</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {registration.confirmation_code && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Código:</span>
                <span className="font-mono font-medium text-primary">{registration.confirmation_code}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Categoria:</span>
              <span className="font-medium">
                {registration.category_name || 'N/A'} {registration.category_distance ? `(${registration.category_distance})` : ''}
              </span>
            </div>
            {registration.kit_name && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Kit:</span>
                <span className="font-medium">{registration.kit_name}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Valor:</span>
              <span className="font-medium">{formatPrice(registration.total_amount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Status:</span>
              <span className={`font-medium ${
                registration.status === 'confirmed' ? 'text-green-600' : 
                registration.status === 'pending' ? 'text-yellow-600' : 
                'text-red-600'
              }`}>
                {registration.status === 'confirmed' ? 'Confirmada' : 
                 registration.status === 'pending' ? 'Pendente' : 
                 registration.status === 'cancelled' ? 'Cancelada' : 
                 registration.status || 'N/A'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Pagamento:</span>
              <span className={`font-medium ${
                registration.payment_status === 'paid' ? 'text-green-600' : 
                registration.payment_status === 'pending' ? 'text-yellow-600' : 
                'text-red-600'
              }`}>
                {registration.payment_status === 'paid' ? 'Pago' : 
                 registration.payment_status === 'pending' ? 'Pendente' : 
                 registration.payment_status === 'refunded' ? 'Reembolsado' : 
                 registration.payment_status === 'failed' ? 'Falhou' : 
                 registration.payment_status || 'N/A'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Runner Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5" />
              Dados do Corredor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Nome:</span>
              <span className="font-medium">{registration.runner_name || 'N/A'}</span>
            </div>
            {registration.runner_cpf && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">CPF:</span>
                <span className="font-medium">
                  {registration.runner_cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Botões de ação - apenas para inscrições confirmadas e se o usuário for o dono */}
        {isConfirmed && registration && user && (registration.runner_id === user.id || registration.registered_by === user.id) && (
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setTransferDialogOpen(true)}
            >
              <ArrowRightLeft className="h-4 w-4 mr-2" />
              Transferir
            </Button>
          </div>
        )}
      </div>

      {/* Modal de Transferência */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir Inscrição</DialogTitle>
            <DialogDescription>
              Digite o email ou CPF da pessoa que receberá esta inscrição.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="transfer-email">Email</Label>
              <Input
                id="transfer-email"
                type="email"
                placeholder="email@exemplo.com"
                value={transferEmail}
                onChange={(e) => {
                  setTransferEmail(e.target.value);
                  setTransferCpf(""); // Limpar CPF quando email for preenchido
                }}
                disabled={isTransferring}
              />
            </div>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">ou</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="transfer-cpf">CPF</Label>
              <Input
                id="transfer-cpf"
                type="text"
                placeholder="000.000.000-00"
                value={transferCpf}
                onChange={(e) => {
                  // Formatar CPF enquanto digita
                  const value = e.target.value.replace(/\D/g, "");
                  const formatted = value
                    .replace(/(\d{3})(\d)/, "$1.$2")
                    .replace(/(\d{3})(\d)/, "$1.$2")
                    .replace(/(\d{3})(\d{2})$/, "$1-$2");
                  setTransferCpf(formatted);
                  setTransferEmail(""); // Limpar email quando CPF for preenchido
                }}
                maxLength={14}
                disabled={isTransferring}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setTransferDialogOpen(false);
                setTransferEmail("");
                setTransferCpf("");
              }}
              disabled={isTransferring}
            >
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                if (!transferEmail && !transferCpf) {
                  toast.error("Por favor, informe o email ou CPF");
                  return;
                }

                if (!id) {
                  toast.error("ID da inscrição não encontrado");
                  return;
                }

                setIsTransferring(true);
                try {
                  const response = await transferRegistration(id, {
                    email: transferEmail || undefined,
                    cpf: transferCpf ? transferCpf.replace(/\D/g, "") : undefined,
                  });

                  if (response.success) {
                    toast.success(response.message || "Inscrição transferida com sucesso!");
                    setTransferDialogOpen(false);
                    setTransferEmail("");
                    setTransferCpf("");
                    // Recarregar a inscrição para atualizar os dados
                    loadRegistration();
                  } else {
                    toast.error(response.error || "Erro ao transferir inscrição");
                  }
                } catch (error: any) {
                  console.error("Error transferring registration:", error);
                  toast.error(error.message || "Erro ao transferir inscrição");
                } finally {
                  setIsTransferring(false);
                }
              }}
              disabled={isTransferring || (!transferEmail && !transferCpf)}
            >
              {isTransferring ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Transferindo...
                </>
              ) : (
                "Transferir"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
