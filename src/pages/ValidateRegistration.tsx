import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Calendar, MapPin, User, CheckCircle, AlertCircle, Loader2, QrCode } from "lucide-react";
import { formatDateTimeBrasilia } from "@/lib/utils";
import { getRegistrationById, getRegistrationForValidation, getPendingDifferencePayment, verifyPayment, type Registration } from "@/lib/api/registrations";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { List } from "lucide-react";
import { PixQrCode } from "@/components/payment/PixQrCode";

// Helper function to format price
const formatPrice = (price: number | string | undefined): string => {
  if (!price) return ""; // Retorna espaço em branco ao invés de "Grátis"
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(numPrice) || numPrice === 0) return ""; // Retorna espaço em branco ao invés de "Grátis"
  return `R$ ${numPrice.toFixed(2).replace('.', ',')}`;
};

export default function ValidateRegistration() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPixDiffDialogOpen, setIsPixDiffDialogOpen] = useState(false);
  const [pixDiffData, setPixDiffData] = useState<{ qrCode: string; value: number; dueDate: string } | null>(null);
  const [loadingPixDiff, setLoadingPixDiff] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);

  useEffect(() => {
    if (id) {
      loadRegistration();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id]);

  const loadRegistration = async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError(null);
      
      // If user is logged in, try authenticated endpoint first (to get runner_id)
      // Otherwise, use public endpoint
      let response;
      if (user) {
        try {
          response = await getRegistrationById(id);
        } catch (authError: any) {
          // If authenticated endpoint fails, fallback to public endpoint
          try {
            response = await getRegistrationForValidation(id);
          } catch (publicError: any) {
            throw authError; // Use auth error message
          }
        }
      } else {
        // User not logged in, use public endpoint
        response = await getRegistrationForValidation(id);
      }

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

  // Inscrição confirmada: paga ou por convite (organizador inscreveu sem cobrança)
  const isConfirmed = registration.status === "confirmed" && (registration.payment_status === "paid" || registration.payment_status === "convidado");
  const locationText = registration.location || `${registration.city || ''}, ${registration.state || ''}`.trim() || 'Local não informado';
  
  // Generate validation URL only if registration and id are available
  const validationUrl = registration?.id 
    ? `${window.location.origin}/registration/validate/${registration.id}`
    : '';
  
  // Check if current user is the owner of the registration
  const isOwner = user && registration && (registration.runner_id === user.id || registration.registered_by === user.id);
  // Não exibir "Pagar diferença" quando a inscrição já está paga ou é por convite
  const hasPendingDiff = registration && (registration.has_pending_difference || (registration.pending_difference_amount ?? 0) > 0) && registration.payment_status !== 'paid' && registration.payment_status !== 'convidado';

  const handlePayDifference = async () => {
    if (!registration?.id) return;
    setLoadingPixDiff(true);
    setIsPixDiffDialogOpen(true);
    setPixDiffData(null);
    try {
      const response = await getPendingDifferencePayment(registration.id);
      if (response.success && response.data) {
        const d = response.data as { already_paid?: boolean; pix_qr_code?: string | null; value?: number; due_date?: string };
        if (d.already_paid) {
          toast.success("Pagamento já foi confirmado.");
          setIsPixDiffDialogOpen(false);
          loadRegistration();
          return;
        }
        if (d.pix_qr_code) {
          setPixDiffData({
            qrCode: d.pix_qr_code,
            value: d.value ?? 0,
            dueDate: d.due_date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
          });
        } else {
          toast.error("QR Code PIX da diferença não disponível.");
          setIsPixDiffDialogOpen(false);
        }
      } else {
        toast.error(response.error || "Erro ao carregar pagamento da diferença");
        setIsPixDiffDialogOpen(false);
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao carregar pagamento da diferença");
      setIsPixDiffDialogOpen(false);
    } finally {
      setLoadingPixDiff(false);
    }
  };

  const handleVerifyPayment = async () => {
    if (!registration?.id) return;
    setVerifyingPayment(true);
    try {
      const response = await verifyPayment(registration.id);
      if (response.success && response.payment_verified) {
        toast.success(response.message || "Pagamento confirmado.");
        loadRegistration();
      } else {
        toast.info(response.message || "Pagamento ainda não identificado. Tente novamente em instantes.");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao verificar pagamento.");
    } finally {
      setVerifyingPayment(false);
    }
  };
  
  // Debug log
  if (user && registration) {
    console.log('🔍 Debug - Verificação de propriedade:', {
      userId: user.id,
      runnerId: registration.runner_id,
      registeredBy: registration.registered_by,
      isOwner
    });
  }

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
                      {registration.payment_status === "convidado"
                        ? "Inscrição por convite — válida"
                        : "Pagamento aprovado e inscrição válida"}
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
                <span>{formatDateTimeBrasilia(registration.event_date)}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>{locationText}</span>
            </div>
          </CardContent>
        </Card>

        {/* QR Code Card - Only show if confirmed */}
        {isConfirmed && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-center gap-2">
                <QrCode className="h-5 w-5" />
                QR Code de Validação
              </CardTitle>
              <p className="text-sm text-muted-foreground text-center">
                Apresente este código para validar sua inscrição
              </p>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              {validationUrl ? (
                <>
                  <div className="bg-white p-4 rounded-lg border-2 border-dashed">
                    <QRCodeSVG 
                      value={validationUrl} 
                      size={256} 
                      level="H" 
                      includeMargin={true}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Escaneie este código para verificar a validade da inscrição
                  </p>
                </>
              ) : (
                <div className="text-center py-4">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Carregando QR Code...
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

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
              <span className="text-muted-foreground">Modalidade:</span>
              <span className="font-medium">{registration.modality_name || "Não definida"}</span>
            </div>
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
            {/* Product Attributes */}
            {registration.product_selections && registration.product_selections.length > 0 && (() => {
              // Group by product
              const productGroups = new Map<string, {
                product_name: string;
                attributes: Array<{ attribute_name: string; attribute_value: string }>;
              }>();
              
              registration.product_selections.forEach((sel: any) => {
                const productKey = sel.product_id;
                if (!productGroups.has(productKey)) {
                  productGroups.set(productKey, {
                    product_name: sel.product_name || 'Produto',
                    attributes: [],
                  });
                }
                productGroups.get(productKey)!.attributes.push({
                  attribute_name: sel.attribute_name,
                  attribute_value: sel.attribute_value,
                });
              });

              return Array.from(productGroups.entries()).map(([productId, productData]) => (
                <div key={productId} className="space-y-1">
                  {productData.attributes.map((attr, index) => (
                    <div key={index} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{attr.attribute_name}:</span>
                      <span className="font-medium">{attr.attribute_value}</span>
                    </div>
                  ))}
                </div>
              ));
            })()}
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
                registration.payment_status === 'convidado' ? 'text-blue-600' : 
                registration.payment_status === 'pending' ? 'text-yellow-600' : 
                'text-red-600'
              }`}>
                {registration.payment_status === 'paid' ? 'Pago' : 
                 registration.payment_status === 'partially_paid' ? 'Pago parcialmente' : 
                 registration.payment_status === 'convidado' ? 'Convite' : 
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

        {/* Resumo financeiro quando há diferença a pagar */}
        {isOwner && hasPendingDiff && registration && (
          <Card className="border-amber-200 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/30">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Resumo do pagamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm pb-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground" title="Total que você já pagou (inclui taxas da plataforma)">Valor já pago (incl. taxas):</span>
                <span className="font-medium">{formatPrice(registration.amount_paid ?? (Number(registration.total_amount ?? 0) - Number(registration.pending_difference_amount ?? 0))) || "R$ 0,00"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Taxa de atualização:</span>
                <span className="font-medium">{formatPrice(registration.registration_edit_fee ?? 0) || "R$ 0,00"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor restante:</span>
                <span className="font-semibold text-amber-700 dark:text-amber-300">{formatPrice(registration.pending_difference_amount) || "R$ 0,00"}</span>
              </div>
              <div className="flex justify-between pt-2 mt-2 border-t border-amber-200 dark:border-amber-800">
                <span className="font-medium text-amber-800 dark:text-amber-200">Valor total:</span>
                <span className="font-semibold">{formatPrice(registration.total_amount) || "R$ 0,00"}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pagar diferença - apenas para o dono quando há cobrança pendente */}
        {isOwner && hasPendingDiff && (
          <>
            <Button
              className="w-full"
              variant="default"
              onClick={handlePayDifference}
            >
              <QrCode className="w-4 h-4 mr-2" />
              Pagar diferença (R$ {(registration.pending_difference_amount ?? 0).toFixed(2).replace(".", ",")})
            </Button>
            <Button
              className="w-full mt-2"
              variant="outline"
              onClick={handleVerifyPayment}
              disabled={verifyingPayment}
            >
              {verifyingPayment ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              Confirmar pagamento
            </Button>
          </>
        )}

        {/* Botão Minhas Inscrições - apenas para o dono da inscrição */}
        {isOwner && (
          <div className="pt-4">
            <Button 
              className="w-full" 
              variant={hasPendingDiff ? "outline" : "default"}
              onClick={() => navigate("/corredor/minhas-inscricoes")}
            >
              <List className="w-4 h-4 mr-2" />
              Minhas Inscrições
            </Button>
          </div>
        )}
      </div>

      {/* Modal PIX – Pagar diferença */}
      <Dialog open={isPixDiffDialogOpen} onOpenChange={setIsPixDiffDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pagamento da diferença via PIX</DialogTitle>
            <DialogDescription>
              {registration?.event_title}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {loadingPixDiff ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="mt-4 text-sm text-muted-foreground">Carregando QR Code PIX...</p>
              </div>
            ) : pixDiffData?.qrCode ? (
              <PixQrCode
                pixQrCode={pixDiffData.qrCode}
                value={pixDiffData.value}
                dueDate={pixDiffData.dueDate}
                registrationId={registration?.confirmation_code}
                hideHeader={true}
              />
            ) : pixDiffData === null && !loadingPixDiff ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                QR Code não disponível
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsPixDiffDialogOpen(false);
                setPixDiffData(null);
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
