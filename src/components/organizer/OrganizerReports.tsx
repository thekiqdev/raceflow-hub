import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { 
  DollarSign, 
  CreditCard, 
  Smartphone, 
  Package, 
  FileText,
  TrendingUp,
  Calendar
} from "lucide-react";
import { toast } from "sonner";
import EventDetailedReport from "./EventDetailedReport";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
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

interface FinancialSummary {
  totalRevenue: number;
  pixRevenue: number;
  creditCardRevenue: number;
  boletoRevenue: number;
  kitRevenue: number;
  totalRegistrations: number;
  paidRegistrations: number;
}

interface EventRevenue {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  totalRevenue: number;
  registrations: number;
}

const OrganizerReports = () => {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<FinancialSummary>({
    totalRevenue: 0,
    pixRevenue: 0,
    creditCardRevenue: 0,
    boletoRevenue: 0,
    kitRevenue: 0,
    totalRegistrations: 0,
    paidRegistrations: 0,
  });
  const [eventRevenues, setEventRevenues] = useState<EventRevenue[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  useEffect(() => {
    loadFinancialData();
  }, []);

  const loadFinancialData = async () => {
    try {
      setLoading(true);
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get organizer's events
      const { data: events, error: eventsError } = await supabase
        .from("events")
        .select("id, title, event_date")
        .eq("organizer_id", user.id);

      if (eventsError) throw eventsError;

      const eventIds = events?.map(e => e.id) || [];

      // Get all registrations for organizer's events
      const { data: registrations, error: registrationsError } = await supabase
        .from("registrations")
        .select("*, kit_id, payment_method, payment_status, total_amount, event_id")
        .in("event_id", eventIds);

      if (registrationsError) throw registrationsError;

      // Calculate summary
      let totalRevenue = 0;
      let pixRevenue = 0;
      let creditCardRevenue = 0;
      let boletoRevenue = 0;
      let kitRevenue = 0;
      let paidRegistrations = 0;

      registrations?.forEach(reg => {
        if (reg.payment_status === "paid") {
          paidRegistrations++;
          totalRevenue += Number(reg.total_amount);

          if (reg.payment_method === "pix") {
            pixRevenue += Number(reg.total_amount);
          } else if (reg.payment_method === "credit_card") {
            creditCardRevenue += Number(reg.total_amount);
          } else if (reg.payment_method === "boleto") {
            boletoRevenue += Number(reg.total_amount);
          }

          if (reg.kit_id) {
            kitRevenue += Number(reg.total_amount);
          }
        }
      });

      setSummary({
        totalRevenue,
        pixRevenue,
        creditCardRevenue,
        boletoRevenue,
        kitRevenue,
        totalRegistrations: registrations?.length || 0,
        paidRegistrations,
      });

      // Calculate revenue by event
      const eventRevenueMap = new Map<string, EventRevenue>();
      
      registrations?.forEach(reg => {
        if (reg.payment_status === "paid") {
          const event = events?.find(e => e.id === reg.event_id);
          if (event) {
            const existing = eventRevenueMap.get(reg.event_id);
            if (existing) {
              existing.totalRevenue += Number(reg.total_amount);
              existing.registrations += 1;
            } else {
              eventRevenueMap.set(reg.event_id, {
                eventId: reg.event_id,
                eventTitle: event.title,
                eventDate: event.event_date,
                totalRevenue: Number(reg.total_amount),
                registrations: 1,
              });
            }
          }
        }
      });

      setEventRevenues(Array.from(eventRevenueMap.values()));

    } catch (error) {
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
        <div className="text-muted-foreground">Carregando relatórios...</div>
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
                {((summary.pixRevenue / summary.totalRevenue) * 100).toFixed(1)}% do total
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
                {((summary.creditCardRevenue / summary.totalRevenue) * 100).toFixed(1)}% do total
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
                          {formatCurrency(event.totalRevenue / event.registrations)}
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