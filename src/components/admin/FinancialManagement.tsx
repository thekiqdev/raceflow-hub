import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, TrendingUp, TrendingDown, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getFinancialOverview,
  getWithdrawRequests,
  getRefundRequests,
  approveWithdrawal,
  rejectWithdrawal,
  approveRefund,
  rejectRefund,
  getFinancialSettings,
  updateFinancialSettings,
  type FinancialOverview as FinancialOverviewType,
  type WithdrawRequest,
  type RefundRequest,
  type FinancialSettings,
} from "@/lib/api/financial";

const FinancialManagement = () => {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<FinancialOverviewType | null>(null);
  const [withdrawRequests, setWithdrawRequests] = useState<WithdrawRequest[]>([]);
  const [refundRequests, setRefundRequests] = useState<RefundRequest[]>([]);
  const [settings, setSettings] = useState<FinancialSettings | null>(null);
  const [activeTab, setActiveTab] = useState("withdrawals");
  const [settingsForm, setSettingsForm] = useState({
    commission_percentage: 5,
    min_withdraw_amount: 100,
  });

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [overviewRes, withdrawalsRes, refundsRes, settingsRes] = await Promise.all([
        getFinancialOverview(),
        getWithdrawRequests(),
        getRefundRequests(),
        activeTab === "settings" ? getFinancialSettings() : Promise.resolve({ success: false }),
      ]);

      if (overviewRes.success && overviewRes.data) {
        setOverview(overviewRes.data);
      }

      if (withdrawalsRes.success && withdrawalsRes.data) {
        setWithdrawRequests(withdrawalsRes.data);
      }

      if (refundsRes.success && refundsRes.data) {
        setRefundRequests(refundsRes.data);
      }

      if (activeTab === "settings" && settingsRes.success && settingsRes.data) {
        setSettings(settingsRes.data);
        setSettingsForm({
          commission_percentage: settingsRes.data.commission_percentage,
          min_withdraw_amount: settingsRes.data.min_withdraw_amount,
        });
      }
    } catch (error) {
      console.error("Erro ao carregar dados financeiros:", error);
      toast.error("Erro ao carregar dados financeiros");
    } finally {
      setLoading(false);
    }
  };

  const handleApproveWithdrawal = async (requestId: string) => {
    try {
      const response = await approveWithdrawal(requestId);
      if (response.success) {
        toast.success("Saque aprovado com sucesso!");
        loadData();
      } else {
        toast.error(response.error || "Erro ao aprovar saque");
      }
    } catch (error) {
      toast.error("Erro ao aprovar saque");
    }
  };

  const handleRejectWithdrawal = async (requestId: string) => {
    try {
      const response = await rejectWithdrawal(requestId);
      if (response.success) {
        toast.success("Saque rejeitado com sucesso!");
        loadData();
      } else {
        toast.error(response.error || "Erro ao rejeitar saque");
      }
    } catch (error) {
      toast.error("Erro ao rejeitar saque");
    }
  };

  const handleApproveRefund = async (requestId: string) => {
    try {
      const response = await approveRefund(requestId);
      if (response.success) {
        toast.success("Reembolso aprovado com sucesso!");
        loadData();
      } else {
        toast.error(response.error || "Erro ao aprovar reembolso");
      }
    } catch (error) {
      toast.error("Erro ao aprovar reembolso");
    }
  };

  const handleRejectRefund = async (requestId: string) => {
    try {
      const response = await rejectRefund(requestId);
      if (response.success) {
        toast.success("Reembolso rejeitado com sucesso!");
        loadData();
      } else {
        toast.error(response.error || "Erro ao rejeitar reembolso");
      }
    } catch (error) {
      toast.error("Erro ao rejeitar reembolso");
    }
  };

  const handleSaveSettings = async () => {
    try {
      const response = await updateFinancialSettings(settingsForm);
      if (response.success && response.data) {
        setSettings(response.data);
        toast.success("Configurações salvas com sucesso!");
      } else {
        toast.error(response.error || "Erro ao salvar configurações");
      }
    } catch (error) {
      toast.error("Erro ao salvar configurações");
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      pending: 'pendente',
      approved: 'aprovado',
      rejected: 'rejeitado',
      em_analise: 'em análise',
      aprovado: 'aprovado',
      rejeitado: 'rejeitado',
    };
    return statusMap[status] || status;
  };
  if (loading && !overview) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Carregando dados financeiros...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">Gestão Financeira</h2>
        <p className="text-muted-foreground">Controle de receitas, saques e reembolsos</p>
      </div>

      {/* Visão Geral */}
      {overview && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Arrecadado</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(overview.total_revenue)}</div>
              <p className="text-xs text-muted-foreground">
                Receita total da plataforma
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Comissões da Plataforma</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(overview.platform_commissions)}</div>
              <p className="text-xs text-muted-foreground">
                {settings ? `${settings.commission_percentage}%` : '5%'} das transações
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Saques Realizados</CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(overview.total_withdrawals)}</div>
              <p className="text-xs text-muted-foreground">
                Total de saques aprovados
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Saldo Disponível</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(overview.available_balance)}</div>
              <p className="text-xs text-muted-foreground">
                {overview.pending_withdrawals > 0 && `${formatCurrency(overview.pending_withdrawals)} pendentes`}
                {overview.pending_withdrawals === 0 && 'Aguardando saque'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="withdrawals">Solicitações de Saque</TabsTrigger>
          <TabsTrigger value="refunds">Reembolsos</TabsTrigger>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
        </TabsList>

        {/* Saques */}
        <TabsContent value="withdrawals">
          <Card>
            <CardHeader>
              <CardTitle>Solicitações de Saque</CardTitle>
              <CardDescription>Aprovar e gerenciar saques dos organizadores</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organizador</TableHead>
                    <TableHead>Valor Solicitado</TableHead>
                    <TableHead>Taxa (5%)</TableHead>
                    <TableHead>Valor Líquido</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : withdrawRequests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        Nenhuma solicitação de saque encontrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    withdrawRequests.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell className="font-medium">{request.organizer_name || 'N/A'}</TableCell>
                        <TableCell>{formatCurrency(request.amount)}</TableCell>
                        <TableCell>{formatCurrency(request.fee)}</TableCell>
                        <TableCell className="font-bold">{formatCurrency(request.net_amount)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{request.payment_method}</Badge>
                        </TableCell>
                        <TableCell>{new Date(request.requested_at).toLocaleDateString('pt-BR')}</TableCell>
                        <TableCell>
                          <Badge variant={request.status === "approved" ? "default" : request.status === "pending" ? "secondary" : "destructive"}>
                            {getStatusLabel(request.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {request.status === "pending" && (
                            <div className="flex gap-1">
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                title="Aprovar"
                                onClick={() => handleApproveWithdrawal(request.id)}
                              >
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              </Button>
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                title="Rejeitar"
                                onClick={() => handleRejectWithdrawal(request.id)}
                              >
                                <XCircle className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reembolsos */}
        <TabsContent value="refunds">
          <Card>
            <CardHeader>
              <CardTitle>Solicitações de Reembolso</CardTitle>
              <CardDescription>Analisar e processar reembolsos de atletas</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Atleta</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : refundRequests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Nenhuma solicitação de reembolso encontrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    refundRequests.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell className="font-medium">{request.athlete_name || 'N/A'}</TableCell>
                        <TableCell>{request.event_title || 'N/A'}</TableCell>
                        <TableCell>{formatCurrency(request.amount)}</TableCell>
                        <TableCell>{request.reason}</TableCell>
                        <TableCell>{new Date(request.requested_at).toLocaleDateString('pt-BR')}</TableCell>
                        <TableCell>
                          <Badge variant={request.status === "aprovado" ? "default" : request.status === "em_analise" ? "secondary" : "destructive"}>
                            {getStatusLabel(request.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {request.status === "em_analise" && (
                            <div className="flex gap-1">
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                title="Aprovar"
                                onClick={() => handleApproveRefund(request.id)}
                              >
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              </Button>
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                title="Recusar"
                                onClick={() => handleRejectRefund(request.id)}
                              >
                                <XCircle className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Configurações */}
        <TabsContent value="settings">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Taxas da Plataforma</CardTitle>
                <CardDescription>Configurar comissões e taxas</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Percentual de Comissão</label>
                  <Input 
                    type="number" 
                    value={settingsForm.commission_percentage}
                    onChange={(e) => setSettingsForm({ ...settingsForm, commission_percentage: parseFloat(e.target.value) || 0 })}
                    className="mt-2" 
                  />
                  <p className="text-xs text-muted-foreground mt-1">Percentual sobre cada inscrição</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Valor Mínimo para Saque</label>
                  <Input 
                    type="number" 
                    value={settingsForm.min_withdraw_amount}
                    onChange={(e) => setSettingsForm({ ...settingsForm, min_withdraw_amount: parseFloat(e.target.value) || 0 })}
                    className="mt-2" 
                  />
                  <p className="text-xs text-muted-foreground mt-1">Valor mínimo em reais</p>
                </div>
                
                <Button onClick={handleSaveSettings}>Salvar Configurações</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Relatórios Rápidos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start">
                  <DollarSign className="mr-2 h-4 w-4" />
                  Relatório de Comissões
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <TrendingDown className="mr-2 h-4 w-4" />
                  Histórico de Saques
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <Clock className="mr-2 h-4 w-4" />
                  Fluxo de Caixa Mensal
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FinancialManagement;