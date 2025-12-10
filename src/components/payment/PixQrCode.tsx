import { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Copy, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PixQrCodeProps {
  pixQrCode: string;
  value: number;
  dueDate: string; // YYYY-MM-DD
  registrationId?: string;
  hideHeader?: boolean; // Para ocultar o header quando usado dentro de um dialog
}

export function PixQrCode({ pixQrCode, value, dueDate, registrationId, hideHeader = false }: PixQrCodeProps) {
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(true);

  useEffect(() => {
    // Simulate QR Code generation (usually instant)
    const timer = setTimeout(() => {
      setIsGenerating(false);
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(pixQrCode);
      setCopied(true);
      toast.success('Código PIX copiado!');
      
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error('Erro ao copiar código:', error);
      toast.error('Erro ao copiar código PIX');
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString + 'T00:00:00');
      return format(date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    } catch {
      return dateString;
    }
  };

  const formatPrice = (price: number | string | undefined): string => {
    const numPrice = typeof price === 'number' ? price : parseFloat(String(price || '0')) || 0;
    return `R$ ${numPrice.toFixed(2).replace('.', ',')}`;
  };

  if (isGenerating) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Gerando QR Code PIX...</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-sm text-muted-foreground">
            Aguarde enquanto geramos o QR Code para pagamento
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto border-0 shadow-none">
      {!hideHeader && (
        <CardHeader>
          <CardTitle className="text-center">Pagamento via PIX</CardTitle>
          <CardDescription className="text-center">
            Escaneie o QR Code ou copie o código para pagar
          </CardDescription>
        </CardHeader>
      )}
      <CardContent className={`space-y-4 ${hideHeader ? 'pt-0' : ''}`}>
        {/* QR Code */}
        <div className="flex justify-center p-4 bg-white rounded-lg border-2 border-dashed">
          <QRCode
            value={pixQrCode}
            size={hideHeader ? 200 : 256}
            level="M"
            className={`w-full h-auto ${hideHeader ? 'max-w-[200px]' : 'max-w-[256px]'}`}
          />
        </div>

        {/* Payment Info */}
        <div className="space-y-2 text-center">
          <div>
            <p className="text-sm text-muted-foreground">Valor a pagar</p>
            <p className="text-2xl font-bold text-primary">{formatPrice(value)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Vencimento</p>
            <p className="text-base font-medium">{formatDate(dueDate)}</p>
          </div>
        </div>

        {/* Copy Code Button */}
        <Button
          onClick={handleCopyCode}
          variant="outline"
          className="w-full"
          disabled={copied}
        >
          {copied ? (
            <>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Código copiado!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 mr-2" />
              Copiar código PIX
            </>
          )}
        </Button>

        {/* Instructions */}
        <div className="space-y-2 pt-4 border-t">
          <p className="text-sm font-medium">Como pagar:</p>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Abra o app do seu banco</li>
            <li>Escaneie o QR Code acima ou</li>
            <li>Cole o código PIX copiado</li>
            <li>Confirme o pagamento</li>
          </ol>
        </div>

        {/* Status Message */}
        <div className="bg-muted p-3 rounded-md">
          <p className="text-xs text-center text-muted-foreground">
            ⏳ Aguardando confirmação do pagamento. Você será notificado automaticamente quando o pagamento for confirmado.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

