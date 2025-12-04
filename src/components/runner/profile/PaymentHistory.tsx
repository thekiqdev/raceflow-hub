import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Download, CreditCard, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getRunnerPayments, type RunnerPayment } from "@/lib/api/runnerPayments";

interface PaymentHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PaymentHistory({ open, onOpenChange }: PaymentHistoryProps) {
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<RunnerPayment[]>([]);

  useEffect(() => {
    if (open) {
      loadPayments();
    }
  }, [open]);

  const loadPayments = async () => {
    try {
      setLoading(true);
      const response = await getRunnerPayments();

      if (response.success && response.data) {
        setPayments(response.data);
      } else {
        toast.error(response.error || "Erro ao carregar histórico de pagamentos");
      }
    } catch (error: any) {
      console.error("Error loading payments:", error);
      toast.error(error.message || "Erro ao carregar histórico de pagamentos");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadReceipt = async (payment: RunnerPayment) => {
    try {
      // Create receipt text
      const receiptText = `
COMPROVANTE DE PAGAMENTO
${payment.event_title || 'Evento'}

Código: ${payment.confirmation_code || payment.id}
Data do Pagamento: ${payment.created_at ? format(new Date(payment.created_at), "dd/MM/yyyy", { locale: ptBR }) : 'N/A'}

DADOS DO EVENTO:
${payment.event_title || 'Evento'}
Data: ${payment.event_date ? format(new Date(payment.event_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : 'N/A'}

DADOS DO PAGAMENTO:
Valor: R$ ${payment.total_amount.toFixed(2).replace('.', ',')}
Método: ${getPaymentMethodLabel(payment.payment_method)}
Status: ${payment.payment_status === 'paid' ? 'Pago' : payment.payment_status === 'refunded' ? 'Reembolsado' : payment.payment_status}
Código de Confirmação: ${payment.confirmation_code || 'N/A'}
      `.trim();

      const blob = new Blob([receiptText], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `comprovante_${payment.confirmation_code || payment.id}.txt`;
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case 'pix':
        return 'PIX';
      case 'credit_card':
        return 'Cartão de Crédito';
      case 'boleto':
        return 'Boleto';
      default:
        return method;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge variant="default" className="bg-green-500">Pago</Badge>;
      case 'refunded':
        return <Badge variant="outline">Reembolsado</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const totalSpent = payments
    .filter(p => p.payment_status === 'paid')
    .reduce((sum, p) => sum + p.total_amount, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Histórico de Pagamentos</DialogTitle>
        </DialogHeader>
        
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div>
                <div className="text-sm text-muted-foreground">Total Investido</div>
                <div className="text-2xl font-bold text-primary">
                  {formatCurrency(totalSpent)}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Total de Pagamentos</div>
                <div className="text-2xl font-bold">{payments.length}</div>
              </div>
            </div>

            {payments.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Nenhum pagamento encontrado</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {payments.map((payment) => (
                  <Card key={payment.id}>
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <h3 className="font-semibold">{payment.event_title || 'Evento'}</h3>
                            {payment.event_date && (
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <Calendar className="w-3 h-3" />
                                {format(new Date(payment.event_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                              </div>
                            )}
                          </div>
                          {getStatusBadge(payment.payment_status)}
                        </div>
                        
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex gap-4 text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <CreditCard className="w-3 h-3" />
                              {getPaymentMethodLabel(payment.payment_method)}
                            </span>
                            {payment.confirmation_code && (
                              <span className="font-mono text-xs">
                                {payment.confirmation_code}
                              </span>
                            )}
                          </div>
                          <div className="font-semibold text-primary">
                            {formatCurrency(payment.total_amount)}
                          </div>
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => handleDownloadReceipt(payment)}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Baixar Recibo
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
