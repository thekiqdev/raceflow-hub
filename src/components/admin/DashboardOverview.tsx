import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Calendar, DollarSign, TrendingUp, CheckCircle, MessageSquare, Loader2 } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { getDashboardStats, getDashboardCharts, type DashboardStats } from "@/lib/api/admin";
import { getSupportTickets } from "@/lib/api/support";
import { toast } from "sonner";

const DashboardOverview = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [registrationsByMonth, setRegistrationsByMonth] = useState<Array<{ month: string; inscrições: number }>>([]);
  const [revenueByMonth, setRevenueByMonth] = useState<Array<{ month: string; faturamento: number }>>([]);
  const [newTicketsCount, setNewTicketsCount] = useState<number>(0);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [statsResponse, chartsResponse, ticketsResponse] = await Promise.all([
        getDashboardStats(),
        getDashboardCharts(6),
        getSupportTickets({ status: 'aberto' }).catch(() => ({ success: false, data: [] })),
      ]);

      if (statsResponse.success && statsResponse.data) {
        setStats(statsResponse.data);
      } else {
        toast.error("Erro ao carregar estatísticas do dashboard");
      }

      if (chartsResponse.success && chartsResponse.data) {
        // Transformar dados para o formato esperado pelos gráficos
        setRegistrationsByMonth(
          chartsResponse.data.registrations.map((item) => ({
            month: item.month,
            inscrições: Number(item.value),
          }))
        );
        setRevenueByMonth(
          chartsResponse.data.revenue.map((item) => ({
            month: item.month,
            faturamento: Number(item.value),
          }))
        );
      } else {
        toast.error("Erro ao carregar dados dos gráficos");
      }

      // Contar tickets abertos
      if (ticketsResponse.success && ticketsResponse.data) {
        setNewTicketsCount(ticketsResponse.data.length);
      }
    } catch (error) {
      console.error("Erro ao carregar dados do dashboard:", error);
      toast.error("Erro ao carregar dados do dashboard");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('pt-BR').format(value);
  };

  const chartConfig = {
    inscrições: {
      label: "Inscrições",
      color: "hsl(var(--primary))",
    },
    faturamento: {
      label: "Faturamento",
      color: "hsl(var(--primary))",
    },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Carregando dashboard...</span>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Erro ao carregar dados do dashboard</p>
        <Button onClick={loadDashboardData} className="mt-4">
          Tentar novamente
        </Button>
      </div>
    );
  }

  const revenueChange = stats.revenue_change_percentage || 0;
  const revenueChangeColor = revenueChange >= 0 ? "text-green-500" : "text-red-500";
  const revenueChangeSign = revenueChange >= 0 ? "+" : "";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">Dashboard Geral</h2>
        <p className="text-muted-foreground">Visão global do sistema</p>
      </div>

      {/* Métricas principais */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Eventos Ativos</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(stats.active_events)}</div>
            <p className="text-xs text-muted-foreground">
              {stats.pending_events > 0 && (
                <span className="text-yellow-500">+{formatNumber(stats.pending_events)}</span>
              )}
              {stats.pending_events === 0 && <span className="text-muted-foreground">Nenhum pendente</span>}
              {stats.pending_events > 0 && " pendentes"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Atletas</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(stats.total_runners)}</div>
            <p className="text-xs text-muted-foreground">
              {stats.new_runners_this_month > 0 && (
                <span className="text-green-500">+{formatNumber(stats.new_runners_this_month)}</span>
              )}
              {stats.new_runners_this_month === 0 && <span className="text-muted-foreground">Nenhum novo</span>}
              {stats.new_runners_this_month > 0 && " este mês"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Organizadores Ativos</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(stats.active_organizers)}</div>
            <p className="text-xs text-muted-foreground">
              {stats.pending_organizers > 0 && (
                <span className="text-yellow-500">{formatNumber(stats.pending_organizers)}</span>
              )}
              {stats.pending_organizers === 0 && <span className="text-muted-foreground">Nenhum pendente</span>}
              {stats.pending_organizers > 0 && " aguardando aprovação"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Faturamento Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.total_revenue)}</div>
            <p className="text-xs text-muted-foreground">
              {revenueChange !== 0 && (
                <span className={revenueChangeColor}>
                  {revenueChangeSign}{revenueChange.toFixed(1)}%
                </span>
              )}
              {revenueChange === 0 && <span className="text-muted-foreground">Sem variação</span>}
              {revenueChange !== 0 && " vs mês anterior"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Métricas secundárias */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inscrições Totais</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(stats.total_registrations)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Comissões Arrecadadas</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.total_commissions)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Eventos Finalizados</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(stats.finished_events)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Ações rápidas */}
      <Card>
        <CardHeader>
          <CardTitle>Ações Rápidas</CardTitle>
          <CardDescription>Acesse rapidamente as principais funcionalidades</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button 
            variant="outline"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('admin:navigate-to-section', { detail: 'events' }));
            }}
          >
            <Calendar className="mr-2 h-4 w-4" />
            Eventos {stats.pending_events > 0 && `(${stats.pending_events})`}
          </Button>
          <Button 
            variant="outline"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('admin:navigate-to-section', { detail: 'support' }));
            }}
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            Suporte {newTicketsCount > 0 && `(${newTicketsCount})`}
          </Button>
          <Button variant="outline">
            <MessageSquare className="mr-2 h-4 w-4" />
            Enviar Comunicado
          </Button>
        </CardContent>
      </Card>

      {/* Gráficos */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Inscrições por Mês</CardTitle>
            <CardDescription>Evolução de inscrições nos últimos 6 meses</CardDescription>
          </CardHeader>
          <CardContent>
            {registrationsByMonth.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={registrationsByMonth}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line type="monotone" dataKey="inscrições" stroke="hsl(var(--primary))" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                Nenhum dado disponível
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Faturamento Mensal</CardTitle>
            <CardDescription>Receita gerada nos últimos 6 meses</CardDescription>
          </CardHeader>
          <CardContent>
            {revenueByMonth.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueByMonth}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="faturamento" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                Nenhum dado disponível
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DashboardOverview;
