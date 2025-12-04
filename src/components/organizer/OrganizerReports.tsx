import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { 
  DollarSign, 
  CreditCard, 
  Smartphone, 
  Package, 
  FileText,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import EventDetailedReport from "./EventDetailedReport";
import {
  Bar,
  BarChart,
  Pie,
  PieChart,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  getOrganizerFinancialSummary,
  getOrganizerEventRevenues,
  type OrganizerFinancialSummary,
  type OrganizerEventRevenue,
} from "@/lib/api/organizer";

const OrganizerReports = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<OrganizerFinancialSummary>({
    totalRevenue: 0,
    pixRevenue: 0,
    creditCardRevenue: 0,
    boletoRevenue: 0,
    kitRevenue: 0,
    totalRegistrations: 0,
    paidRegistrations: 0,
  });
  const [eventRevenues, setEventRevenues] = useState<OrganizerEventRevenue[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadFinancialData();
    }
  }, [user]);

  const loadFinancialData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      const [summaryResponse, revenuesResponse] = await Promise.all([
        getOrganizerFinancialSummary(),
        getOrganizerEventRevenues(),
      ]);

      if (summaryResponse.success && summaryResponse.data) {
        setSummary(summaryResponse.data);
      } else {
        toast.error(summaryResponse.error || "Erro ao carregar resumo financeiro");
      }

      if (revenuesResponse.success && revenuesResponse.data) {
        setEventRevenues(revenuesResponse.data);
      } else {
        toast.error(revenuesResponse.error || "Erro ao carregar receitas por evento");
      }
    } catch (error: any) {
      console.error("Error loading financial data:", error);
      toast.error("Erro ao carregar dados financeiros");
    } finally {
      setLoading(false);
    }
  };

  const paymentMethodData = [
    { name: "PIX", value: summary.pixRevenue, color: "#10b981" },
    { name: "Cartão", value: summary.creditCardRevenue, color: "#3b82f6" },
    { name: "Boleto", value: summary.boletoRevenue, color: "#f59e0b" },
  ].filter(item => item.value > 0);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (selectedEventId) {
    return (
      <EventDetailedReport
        eventId={selectedEventId}
        onBack={() => setSelectedEventId(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-hero bg-clip-text text-transparent">
          Relatórios Financeiros
        </h1>
        <p className="text-muted-foreground mt-2">
          Resumo completo das suas receitas e transações
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="p-6 border-l-4 border-l-primary">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Receita Total
              </p>
              <p className="text-2xl font-bold text-primary">
                {formatCurrency(summary.totalRevenue)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {summary.paidRegistrations} inscrições pagas
              </p>
            </div>
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <DollarSign className="h-6 w-6 text-primary" />
            </div>
          </div>
        </Card>

        <Card className="p-6 border-l-4 border-l-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Receita PIX
              </p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(summary.pixRevenue)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {summary.totalRevenue > 0 
                  ? `${((summary.pixRevenue / summary.totalRevenue) * 100).toFixed(1)}% do total`
                  : '0% do total'}
              </p>
            </div>
            <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
              <Smartphone className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </Card>

        <Card className="p-6 border-l-4 border-l-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Receita Cartão
              </p>
              <p className="text-2xl font-bold text-blue-600">
                {formatCurrency(summary.creditCardRevenue)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {summary.totalRevenue > 0 
                  ? `${((summary.creditCardRevenue / summary.totalRevenue) * 100).toFixed(1)}% do total`
                  : '0% do total'}
              </p>
            </div>
            <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
              <CreditCard className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </Card>

        <Card className="p-6 border-l-4 border-l-orange-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Receita Kits
              </p>
              <p className="text-2xl font-bold text-orange-600">
                {formatCurrency(summary.kitRevenue)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Inscrições com kit
              </p>
            </div>
            <div className="h-12 w-12 rounded-full bg-orange-500/10 flex items-center justify-center">
              <Package className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Charts and Details */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="events">Por Evento</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Payment Method Distribution */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Distribuição por Método</h3>
              {paymentMethodData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={paymentMethodData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.name}: ${formatCurrency(entry.value)}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {paymentMethodData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  Nenhum dado disponível
                </div>
              )}
            </Card>

            {/* Revenue by Event Bar Chart */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Receita por Evento</h3>
              {eventRevenues.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={eventRevenues}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="eventTitle" 
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis />
                    <Tooltip 
                      formatter={(value: number) => formatCurrency(value)}
                      labelFormatter={(label) => `Evento: ${label}`}
                    />
                    <Bar dataKey="totalRevenue" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  Nenhum evento com receita
                </div>
              )}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="events" className="space-y-4">
          <Card>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Detalhes por Evento</h3>
                <Button variant="outline" size="sm">
                  <FileText className="mr-2 h-4 w-4" />
                  Exportar
                </Button>
              </div>
              
              {eventRevenues.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Evento</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Inscrições</TableHead>
                      <TableHead className="text-right">Receita Total</TableHead>
                      <TableHead className="text-right">Ticket Médio</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eventRevenues.map((event) => (
                      <TableRow key={event.eventId}>
                        <TableCell className="font-medium">
                          {event.eventTitle}
                        </TableCell>
                        <TableCell>
                          {format(new Date(event.eventDate), "dd/MM/yyyy", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-right">
                          {event.registrations}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-green-600">
                          {formatCurrency(event.totalRevenue)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(event.avgTicket)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedEventId(event.eventId)}
                          >
                            Ver Detalhes
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum evento com receita registrada
                </div>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default OrganizerReports;
