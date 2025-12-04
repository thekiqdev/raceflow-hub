import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Calendar, MapPin, User, Loader2, AlertCircle, Download } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getRegistrationById, type Registration } from "@/lib/api/registrations";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

export default function RegistrationQRCode() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        setError(response.error || "Erro ao carregar inscrição");
        toast.error(response.error || "Erro ao carregar inscrição");
      }
    } catch (error: any) {
      console.error("Error loading registration:", error);
      setError(error.message || "Erro ao carregar inscrição");
      toast.error(error.message || "Erro ao carregar inscrição");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadReceipt = async () => {
    if (!id) return;

    try {
      // For now, we'll create a simple text receipt
      // In the future, this can be a PDF download
      const receiptText = `
COMPROVANTE DE INSCRIÇÃO
${registration?.event_title || 'Evento'}

Código: ${registration?.confirmation_code || id}
Data da Inscrição: ${registration?.created_at ? format(new Date(registration.created_at), "dd/MM/yyyy", { locale: ptBR }) : 'N/A'}

DADOS DO EVENTO:
${registration?.event_title || 'Evento'}
Data: ${registration?.event_date ? format(new Date(registration.event_date), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR }) : 'N/A'}
Local: ${registration?.location || `${registration?.city || ''}, ${registration?.state || ''}`}

DADOS DO CORREDOR:
Nome: ${registration?.runner_name || 'N/A'}
CPF: ${registration?.runner_cpf || 'N/A'}

DADOS DA INSCRIÇÃO:
Categoria: ${registration?.category_name || 'N/A'} ${registration?.category_distance ? `(${registration.category_distance})` : ''}
Kit: ${registration?.kit_name || 'Sem kit'}
Valor: R$ ${registration?.total_amount.toFixed(2).replace('.', ',') || '0,00'}
Método de Pagamento: ${registration?.payment_method === 'pix' ? 'PIX' : registration?.payment_method === 'credit_card' ? 'Cartão de Crédito' : registration?.payment_method === 'boleto' ? 'Boleto' : 'N/A'}
Status: ${registration?.status === 'confirmed' ? 'Confirmada' : registration?.status || 'Pendente'}
Status do Pagamento: ${registration?.payment_status === 'paid' ? 'Pago' : registration?.payment_status || 'Pendente'}
      `.trim();

      const blob = new Blob([receiptText], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `comprovante_${registration?.confirmation_code || id}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success("Comprovante baixado com sucesso!");
    } catch (error: any) {
      console.error("Error downloading receipt:", error);
      toast.error("Erro ao baixar comprovante");
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
            <h1 className="text-xl font-bold text-white">Minha Inscrição</h1>
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
            <h1 className="text-xl font-bold text-white">Minha Inscrição</h1>
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

  // Only show QR code if registration is confirmed and paid
  const isConfirmed = registration.status === "confirmed" && registration.payment_status === "paid";
  const validationUrl = `${window.location.origin}/registration/validate/${registration.id}`;
  const locationText = registration.location || `${registration.city || ''}, ${registration.state || ''}`.trim() || 'Local não informado';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-hero p-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white hover:bg-white/20">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold text-white">Minha Inscrição</h1>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 max-w-md mx-auto space-y-4">
        {/* QR Code Card - Only show if confirmed */}
        {isConfirmed ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-center">QR Code da Inscrição</CardTitle>
              <p className="text-sm text-muted-foreground text-center">
                Apresente este código no dia do evento
              </p>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <div className="bg-white p-4 rounded-lg">
                <QRCodeSVG value={validationUrl} size={256} level="H" includeMargin={true} />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Código: {registration.confirmation_code || registration.id.substring(0, 8).toUpperCase()}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-yellow-500 bg-yellow-50">
            <CardContent className="pt-6">
              <div className="text-center">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 text-yellow-600" />
                <h3 className="font-semibold text-yellow-800 mb-2">Inscrição Pendente</h3>
                <p className="text-sm text-yellow-700">
                  O QR Code estará disponível após a confirmação do pagamento
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Event Details Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{registration.event_title || 'Evento'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
            <div className="pt-3 border-t">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Categoria:</span>
                <span className="font-medium">
                  {registration.category_name || 'N/A'} {registration.category_distance ? `(${registration.category_distance})` : ''}
                </span>
              </div>
              {registration.kit_name && (
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Kit:</span>
                  <span className="font-medium">{registration.kit_name}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Status:</span>
                <span className={`font-medium ${
                  isConfirmed ? 'text-green-600' : 'text-yellow-600'
                }`}>
                  {isConfirmed ? 'Confirmada' : 'Pendente'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Runner Details Card */}
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
            {registration.confirmation_code && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Código:</span>
                <span className="font-mono font-medium text-primary">{registration.confirmation_code}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pagamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Valor:</span>
              <span className="font-semibold text-primary">
                R$ {registration.total_amount.toFixed(2).replace('.', ',')}
              </span>
            </div>
            {registration.payment_method && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Método:</span>
                <span className="font-medium">
                  {registration.payment_method === 'pix' ? 'PIX' : 
                   registration.payment_method === 'credit_card' ? 'Cartão de Crédito' : 
                   registration.payment_method === 'boleto' ? 'Boleto' : 
                   registration.payment_method}
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Status:</span>
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

        {/* Download Receipt Button */}
        {isConfirmed && (
          <Button 
            className="w-full" 
            onClick={handleDownloadReceipt}
            variant="outline"
          >
            <Download className="h-4 w-4 mr-2" />
            Baixar Comprovante
          </Button>
        )}

        {/* Instructions */}
        {isConfirmed && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground text-center">
                💡 Salve uma captura de tela deste código ou mantenha este aplicativo aberto
                para apresentar no momento da retirada do kit
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
