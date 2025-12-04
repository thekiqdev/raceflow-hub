import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DollarSign, TrendingUp, TrendingDown, Wallet, Download, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import {
  getOrganizerFinancialOverview,
  getOrganizerWithdrawals,
  createWithdrawRequest,
  type OrganizerFinancialOverview,
  type WithdrawRequest,
} from "@/lib/api/organizerFinancial";
import { toast } from "sonner";

const OrganizerFinancial = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<OrganizerFinancialOverview | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawRequest[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Withdrawal form state
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"PIX" | "TED" | "BANK_TRANSFER">("PIX");
  const [pixKey, setPixKey] = useState("");

  useEffect(() => {
    if (user) {
      loadFinancialData();
    }
  }, [user]);

  const loadFinancialData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const [overviewResponse, withdrawalsResponse] = await Promise.all([
        getOrganizerFinancialOverview(),
        getOrganizerWithdrawals(),
      ]);

      if (overviewResponse.success && overviewResponse.data) {
        setOverview(overviewResponse.data);
      } else {
        toast.error(overviewResponse.error || "Erro ao carregar resumo financeiro");
      }

      if (withdrawalsResponse.success && withdrawalsResponse.data) {
        setWithdrawals(withdrawalsResponse.data);
      } else {
        toast.error(withdrawalsResponse.error || "Erro ao carregar saques");
      }
    } catch (error: any) {
      console.error("Error loading financial data:", error);
      toast.error("Erro ao carregar dados financeiros");
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!user) return;

    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) {
      toast.error("Valor inválido");
      return;
    }

    if (!overview) {
      toast.error("Dados financeiros não carregados");
      return;
    }

    if (amount > overview.available_balance) {
      toast.error("Saldo insuficiente");
      return;
    }

    if (paymentMethod === "PIX" && !pixKey) {
      toast.error("Informe a chave PIX");
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await createWithdrawRequest({
        amount,
        payment_method: paymentMethod,
        pix_key: paymentMethod === "PIX" ? pixKey : undefined,
      });

      if (response.success) {
        toast.success("Solicitação de saque criada com sucesso!");
        setWithdrawAmount("");
        setPixKey("");
        loadFinancialData();
      } else {
        toast.error(response.error || "Erro ao criar solicitação de saque");
      }
    } catch (error: any) {
      console.error("Error creating withdrawal:", error);
      toast.error(error.message || "Erro ao criar solicitação de saque");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
      case "approved":
        return <Badge variant="default">Aprovado</Badge>;
      case "pending":
        return <Badge variant="secondary">Em Análise</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejeitado</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const calculateWithdrawFee = (amount: number) => {
    return amount * 0.01; // 1% fee
  };

  const calculateNetAmount = (amount: number) => {
    return amount - calculateWithdrawFee(amount);
  };

  const withdrawAmountNum = parseFloat(withdrawAmount) || 0;
  const withdrawFee = calculateWithdrawFee(withdrawAmountNum);
  const withdrawNet = calculateNetAmount(withdrawAmountNum);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">Painel Financeiro</h2>
        <p className="text-muted-foreground">Gerencie seus recebimentos e saques</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Financial Summary */}
          <div className="grid gap-6 md:grid-cols-4">
            <Card className="bg-gradient-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Arrecadado</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">
                  {overview ? formatCurrency(overview.total_revenue) : "R$ 0,00"}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Receita bruta</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Líquido</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-secondary">
                  {overview ? formatCurrency(overview.total_revenue - overview.platform_commissions) : "R$ 0,00"}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Após taxas ({overview ? ((overview.platform_commissions / overview.total_revenue) * 100).toFixed(1) : 0}%)
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Saldo Disponível</CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {overview ? formatCurrency(overview.available_balance) : "R$ 0,00"}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Disponível para saque</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Taxas da Plataforma</CardTitle>
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-muted-foreground">
                  {overview ? formatCurrency(overview.platform_commissions) : "R$ 0,00"}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {overview ? ((overview.platform_commissions / overview.total_revenue) * 100).toFixed(1) : 0}% do total
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="withdrawals" className="space-y-6">
            <TabsList>
              <TabsTrigger value="withdrawals">Solicitações de Saque</TabsTrigger>
              <TabsTrigger value="settings">Configurações</TabsTrigger>
            </TabsList>

            <TabsContent value="withdrawals" className="space-y-6">
              {/* Request Withdrawal */}
              <Card>
                <CardHeader>
                  <CardTitle>Solicitar Saque</CardTitle>
                  <CardDescription>
                    Transfira seu saldo disponível para sua conta
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="amount">Valor do Saque</Label>
                      <Input
                        id="amount"
                        type="number"
                        placeholder="0,00"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        max={overview?.available_balance || 0}
                        step="0.01"
                      />
                      <p className="text-xs text-muted-foreground">
                        Saldo disponível: {overview ? formatCurrency(overview.available_balance) : "R$ 0,00"}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="payment-method">Método de Pagamento</Label>
                      <Select value={paymentMethod} onValueChange={(value: "PIX" | "TED" | "BANK_TRANSFER") => setPaymentMethod(value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PIX">PIX</SelectItem>
                          <SelectItem value="TED">TED</SelectItem>
                          <SelectItem value="BANK_TRANSFER">Transferência Bancária</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {paymentMethod === "PIX" && (
                    <div className="space-y-2">
                      <Label htmlFor="pix">Chave PIX</Label>
                      <Input
                        id="pix"
                        placeholder="email@exemplo.com ou CPF"
                        value={pixKey}
                        onChange={(e) => setPixKey(e.target.value)}
                      />
                    </div>
                  )}

                  {withdrawAmountNum > 0 && (
                    <div className="p-4 bg-muted rounded-lg space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Valor solicitado:</span>
                        <span className="font-medium">{formatCurrency(withdrawAmountNum)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Taxa de saque (1%):</span>
                        <span className="font-medium">-{formatCurrency(withdrawFee)}</span>
                      </div>
                      <div className="flex justify-between text-base font-bold pt-2 border-t">
                        <span>Valor a receber:</span>
                        <span className="text-secondary">{formatCurrency(withdrawNet)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground pt-2">
                        Prazo estimado: 2-3 dias úteis
                      </p>
                    </div>
                  )}

                  <Button 
                    className="w-full" 
                    onClick={handleWithdraw}
                    disabled={isSubmitting || !withdrawAmountNum || withdrawAmountNum > (overview?.available_balance || 0)}
                  >
                    {isSubmitting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    Solicitar Saque
                  </Button>
                </CardContent>
              </Card>

              {/* Withdrawal History */}
              <Card>
                <CardHeader>
                  <CardTitle>Histórico de Saques</CardTitle>
                  <CardDescription>Suas solicitações anteriores</CardDescription>
                </CardHeader>
                <CardContent>
                  {withdrawals.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhum saque encontrado
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Valor Bruto</TableHead>
                          <TableHead>Taxa</TableHead>
                          <TableHead>Valor Líquido</TableHead>
                          <TableHead>Método</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {withdrawals.map((withdrawal) => (
                          <TableRow key={withdrawal.id}>
                            <TableCell>
                              {format(new Date(withdrawal.requested_at), "dd/MM/yyyy", { locale: ptBR })}
                            </TableCell>
                            <TableCell>{formatCurrency(withdrawal.amount)}</TableCell>
                            <TableCell className="text-muted-foreground">
                              -{formatCurrency(withdrawal.fee)}
                            </TableCell>
                            <TableCell className="font-semibold text-secondary">
                              {formatCurrency(withdrawal.net_amount)}
                            </TableCell>
                            <TableCell>{withdrawal.payment_method}</TableCell>
                            <TableCell>{getStatusBadge(withdrawal.status)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="settings" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Dados Bancários</CardTitle>
                  <CardDescription>Configure sua conta para recebimentos</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="bank">Banco</Label>
                      <Input id="bank" placeholder="Nome do banco" />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="account">Agência e Conta</Label>
                      <Input id="account" placeholder="0000-0 / 00000-0" />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="pix-key">Chave PIX Padrão</Label>
                      <Input id="pix-key" placeholder="Chave PIX cadastrada" />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="holder">Titular da Conta</Label>
                      <Input id="holder" placeholder="Nome completo" />
                    </div>
                  </div>

                  <Button>Salvar Configurações</Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Política de Reembolso</CardTitle>
                  <CardDescription>Configure as regras de devolução</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="refund-days">Prazo para Reembolso</Label>
                      <Input
                        id="refund-days"
                        type="number"
                        placeholder="Dias antes do evento"
                        defaultValue={7}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="refund-fee">Taxa de Reembolso (%)</Label>
                      <Input
                        id="refund-fee"
                        type="number"
                        placeholder="Porcentagem"
                        defaultValue={10}
                      />
                    </div>
                  </div>

                  <Button>Salvar Política</Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
};

export default OrganizerFinancial;
