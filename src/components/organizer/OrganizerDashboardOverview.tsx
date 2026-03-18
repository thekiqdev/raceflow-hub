import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, DollarSign, TrendingUp, Calendar, BarChart3, Plus, Send, Loader2 } from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  getOrganizerDashboardStats,
  getOrganizerDashboardCharts,
  type OrganizerDashboardStats,
  type OrganizerChartData,
} from "@/lib/api/organizer";

const OrganizerDashboardOverview = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<OrganizerDashboardStats | null>(null);
  const [chartData, setChartData] = useState<OrganizerChartData | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // Load stats and charts in parallel
      const [statsResponse, chartsResponse] = await Promise.all([
        getOrganizerDashboardStats(),
        getOrganizerDashboardCharts(30),
      ]);

      if (statsResponse.success && statsResponse.data) {
        setStats(statsResponse.data);
      } else {
        toast.error(statsResponse.error || "Erro ao carregar estatísticas");
      }

      if (chartsResponse.success && chartsResponse.data) {
        setChartData(chartsResponse.data);
      } else {
        toast.error(chartsResponse.error || "Erro ao carregar gráficos");
      }
    } catch (error) {
      console.error("Error loading dashboard data:", error);
      toast.error("Erro ao carregar dados do dashboard");
    } finally {
      setLoading(false);
    }
  };

  const COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))"];

  // Format chart data for display
  const formattedRegistrationsByDay = chartData?.registrationsByDay.map((item) => {
    try {
      const date = typeof item.date === 'string' ? new Date(item.date) : item.date;
      return {
        date: format(date, "dd/MM", { locale: ptBR }),
        count: item.count || 0,
      };
    } catch (error) {
      console.error('Error formatting date:', error, item);
      return {
        date: String(item.date),
        count: item.count || 0,
      };
    }
  }) || [];

  const formattedRevenueByDay = chartData?.revenueByDay.map((item) => {
    try {
      const date = typeof item.date === 'string' ? new Date(item.date) : item.date;
      return {
        date: format(date, "dd/MM", { locale: ptBR }),
        value: item.value || 0,
      };
    } catch (error) {
      console.error('Error formatting date:', error, item);
      return {
        date: String(item.date),
        value: item.value || 0,
      };
    }
  }) || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold mb-2">Dashboard</h2>
        <p className="text-muted-foreground">Visão geral dos seus eventos e atividades</p>
      </div>

      {/* Main Metrics */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gradient-card shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Eventos Ativos</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats?.active_events || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Publicados e ativos</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-card shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Inscrições</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats?.total_registrations || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-success">+{stats?.registrations_today || 0}</span> hoje
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-card shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Faturamento Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-secondary">
              R$ {stats?.total_revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0,00'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Bruto acumulado</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-card shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inscrições Hoje</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-accent">{stats?.registrations_today || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Últimas 24 horas</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Ações Rápidas</CardTitle>
          <CardDescription>Acesso rápido às principais funcionalidades</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <Button
            onClick={() => {
              // Marcar no sessionStorage que o dialog deve ser aberto
              sessionStorage.setItem('organizer:should-open-create-dialog', 'true');
              // Navegar para a seção de eventos
              window.dispatchEvent(new CustomEvent('organizer:navigate-to-section', { detail: 'events' }));
              // Também disparar o evento imediatamente (caso o componente já esteja montado)
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent('organizer:open-create-event'));
              }, 150);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Criar Novo Evento
          </Button>
          <Button variant="outline">
            <Send className="mr-2 h-4 w-4" />
            Enviar Comunicado
          </Button>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Inscrições por Dia</CardTitle>
            <CardDescription>Últimos 30 dias</CardDescription>
          </CardHeader>
          <CardContent>
            {formattedRegistrationsByDay.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={formattedRegistrationsByDay}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="count"
                    name="Inscrições"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                Nenhum dado disponível
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Faturamento por Dia</CardTitle>
            <CardDescription>Últimos 30 dias</CardDescription>
          </CardHeader>
          <CardContent>
            {formattedRevenueByDay.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={formattedRevenueByDay}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="value" name="Faturamento (R$)" fill="hsl(var(--secondary))" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                Nenhum dado disponível
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inscrições por Gênero</CardTitle>
            <CardDescription>Distribuição dos atletas</CardDescription>
          </CardHeader>
          <CardContent>
            {chartData?.genderData && chartData.genderData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={chartData.genderData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ gender, percent }) => `${gender}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {chartData.genderData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                Nenhum dado disponível
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Modalidades Mais Populares</CardTitle>
            <CardDescription>Distribuição por distância</CardDescription>
          </CardHeader>
          <CardContent>
            {chartData?.modalityData && chartData.modalityData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData.modalityData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" fontSize={12} />
                  <YAxis dataKey="name" type="category" fontSize={12} width={80} />
                  <Tooltip />
                  <Bar dataKey="count" name="Inscrições" fill="hsl(var(--accent))" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                Nenhum dado disponível
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Events */}
      <Card>
        <CardHeader>
          <CardTitle>Top 3 Corridas com Mais Inscrições</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData?.topEvents && chartData.topEvents.length > 0 ? (
            <div className="space-y-4">
              {chartData.topEvents.map((event, index) => (
                <div key={event.event_id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium">{event.title}</p>
                      <p className="text-sm text-muted-foreground">{event.registrations} inscrições</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-secondary">
                      R$ {event.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum evento com inscrições ainda
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default OrganizerDashboardOverview;
