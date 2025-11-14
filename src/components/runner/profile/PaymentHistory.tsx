import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Download, CreditCard, MapPin } from "lucide-react";
import { toast } from "sonner";

interface Payment {
  id: number;
  eventName: string;
  date: string;
  amount: number;
  method: string;
  status: "paid" | "pending";
  location: string;
}

interface PaymentHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PaymentHistory({ open, onOpenChange }: PaymentHistoryProps) {
  const [payments] = useState<Payment[]>([
    {
      id: 1,
      eventName: "Maratona do Rio 2024",
      date: "2024-03-15",
      amount: 150.0,
      method: "Cartão de Crédito",
      status: "paid",
      location: "Rio de Janeiro, RJ",
    },
    {
      id: 2,
      eventName: "Corrida de São Silvestre 2023",
      date: "2023-12-20",
      amount: 120.0,
      method: "PIX",
      status: "paid",
      location: "São Paulo, SP",
    },
    {
      id: 3,
      eventName: "Meia Maratona de Floripa",
      date: "2024-02-10",
      amount: 180.0,
      method: "Boleto",
      status: "paid",
      location: "Florianópolis, SC",
    },
  ]);

  const handleDownloadReceipt = (payment: Payment) => {
    toast.success(`Recibo de ${payment.eventName} baixado com sucesso!`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Histórico de Pagamentos</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div>
              <div className="text-sm text-muted-foreground">Total Investido</div>
              <div className="text-2xl font-bold text-primary">
                R$ {payments.reduce((sum, p) => sum + p.amount, 0).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Total de Provas</div>
              <div className="text-2xl font-bold">{payments.length}</div>
            </div>
          </div>

          <div className="space-y-3">
            {payments.map((payment) => (
              <Card key={payment.id}>
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <h3 className="font-semibold">{payment.eventName}</h3>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="w-3 h-3" />
                          {payment.location}
                        </div>
                      </div>
                      <Badge variant="default" className="bg-green-500">
                        Pago
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex gap-4 text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(payment.date).toLocaleDateString("pt-BR")}
                        </span>
                        <span className="flex items-center gap-1">
                          <CreditCard className="w-3 h-3" />
                          {payment.method}
                        </span>
                      </div>
                      <div className="font-semibold text-primary">
                        R$ {payment.amount.toFixed(2)}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
