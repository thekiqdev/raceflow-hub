import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getEventById } from "@/lib/api/events";
import { getRegistrations } from "@/lib/api/registrations";
import { ArrowLeft, Users, DollarSign, Package, CreditCard, Smartphone } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface EventDetailedReportProps {
  eventId: string;
  onBack: () => void;
}

interface RegistrationDetail {
  id: string;
  runner_id: string;
  category_id: string;
  kit_id?: string | null;
  payment_method?: string | null;
  payment_status?: string | null;
  total_amount: number;
  created_at?: string;
  runner_name?: string;
  category_name?: string;
  // Para compatibilidade com código existente
  profiles?: {
    full_name: string;
    cpf: string;
  };
  event_categories?: {
    name: string;
    distance: string;
  };
  event_kits?: {
    name: string;
  } | null;
}

interface CategoryRevenue {
  categoryName: string;
  count: number;
  revenue: number;
}

interface KitRevenue {
  kitName: string;
  count: number;
  revenue: number;
}

const EventDetailedReport = ({ eventId, onBack }: EventDetailedReportProps) => {
  const [loading, setLoading] = useState(true);
  const [eventTitle, setEventTitle] = useState("");
  const [registrations, setRegistrations] = useState<RegistrationDetail[]>([]);
  const [categoryRevenues, setCategoryRevenues] = useState<CategoryRevenue[]>([]);
  const [kitRevenues, setKitRevenues] = useState<KitRevenue[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [paidCount, setPaidCount] = useState(0);
  const [pixRevenue, setPixRevenue] = useState(0);
  const [creditCardRevenue, setCreditCardRevenue] = useState(0);

  useEffect(() => {
    loadEventDetails();
  }, [eventId]);

  const loadEventDetails = async () => {
    try {
      setLoading(true);

      // Get event info
      const eventResponse = await getEventById(eventId);
      
      if (!eventResponse.success || !eventResponse.data) {
        throw new Error("Erro ao carregar evento");
      }
      
      setEventTitle(eventResponse.data.title);

      // Get registrations
      const regsResponse = await getRegistrations({ event_id: eventId });
      
      if (!regsResponse.success || !regsResponse.data) {
        throw new Error("Erro ao carregar inscrições");
      }

      // Transform API response to match expected format
      const regs: RegistrationDetail[] = regsResponse.data.map((reg: any) => ({
        id: reg.id,
        runner_id: reg.runner_id,
        category_id: reg.category_id,
        kit_id: reg.kit_id || null,
        payment_method: reg.payment_method || null,
        payment_status: reg.payment_status || null,
        total_amount: reg.total_amount,
        created_at: reg.created_at,
        runner_name: reg.runner_name,
        category_name: reg.category_name,
        // Para compatibilidade com código existente
        profiles: reg.runner_name ? {
          full_name: reg.runner_name,
          cpf: "", // CPF não vem na API por segurança
        } : undefined,
        event_categories: reg.category_name ? {
          name: reg.category_name,
          distance: "", // Distance não vem na resposta atual
        } : undefined,
        event_kits: null, // Kits não vêm na resposta atual
      }));

      setRegistrations(regs);

      // Calculate metrics
      let total = 0;
      let paid = 0;
      let pixTotal = 0;
      let creditCardTotal = 0;
      const categoryMap = new Map<string, { count: number; revenue: number }>();
      const kitMap = new Map<string, { count: number; revenue: number }>();

      regs?.forEach((reg) => {
        if (reg.payment_status === "paid") {
          paid++;
          const amount = Number(reg.total_amount);
          total += amount;

          // Calculate revenue by payment method
          if (reg.payment_method === "pix") {
            pixTotal += amount;
          } else if (reg.payment_method === "credit_card") {
            creditCardTotal += amount;
          }

          // Category revenue
          const categoryKey = reg.event_categories?.name || reg.category_name || "Sem categoria";
          const existing = categoryMap.get(categoryKey);
          if (existing) {
            existing.count++;
            existing.revenue += Number(reg.total_amount);
          } else {
            categoryMap.set(categoryKey, {
              count: 1,
              revenue: Number(reg.total_amount),
            });
          }

          // Kit revenue
          if (reg.event_kits || reg.kit_id) {
            const kitKey = reg.event_kits?.name || "Kit";
            const existingKit = kitMap.get(kitKey);
            if (existingKit) {
              existingKit.count++;
              existingKit.revenue += Number(reg.total_amount);
            } else {
              kitMap.set(kitKey, {
                count: 1,
                revenue: Number(reg.total_amount),
              });
            }
          }
        }
      });

      setTotalRevenue(total);
      setPaidCount(paid);
      setPixRevenue(pixTotal);
      setCreditCardRevenue(creditCardTotal);

      setCategoryRevenues(
        Array.from(categoryMap.entries()).map(([name, data]) => ({
          categoryName: name,
          count: data.count,
          revenue: data.revenue,
        }))
      );

      setKitRevenues(
        Array.from(kitMap.entries()).map(([name, data]) => ({
          kitName: name,
          count: data.count,
          revenue: data.revenue,
        }))
      );
    } catch (error) {
      console.error("Error loading event details:", error);
      toast.error("Erro ao carregar detalhes do evento");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getPaymentStatusBadge = (status: string | null) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      paid: "default",
      pending: "secondary",
      failed: "destructive",
    };
    return (
      <Badge variant={variants[status || "pending"] || "outline"}>
        {status === "paid" ? "Pago" : status === "pending" ? "Pendente" : "Falhou"}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Carregando detalhes...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <div>
          <h2 className="text-2xl font-bold">{eventTitle}</h2>
          <p className="text-muted-foreground">Relatório Detalhado</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Total de Inscrições
              </p>
              <p className="text-3xl font-bold">{registrations.length}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {paidCount} pagas
              </p>
            </div>
            <Users className="h-8 w-8 text-primary" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Receita Total
              </p>
              <p className="text-3xl font-bold text-green-600">
                {formatCurrency(totalRevenue)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Ticket médio: {formatCurrency(paidCount > 0 ? totalRevenue / paidCount : 0)}
              </p>
            </div>
            <DollarSign className="h-8 w-8 text-green-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Inscrições com Kit
              </p>
              <p className="text-3xl font-bold text-orange-600">
                {kitRevenues.reduce((sum, k) => sum + k.count, 0)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {formatCurrency(kitRevenues.reduce((sum, k) => sum + k.revenue, 0))}
              </p>
            </div>
            <Package className="h-8 w-8 text-orange-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Receita PIX
              </p>
              <p className="text-3xl font-bold text-blue-600">
                {formatCurrency(pixRevenue)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {pixRevenue > 0 ? `${((pixRevenue / totalRevenue) * 100).toFixed(1)}% do total` : '-'}
              </p>
            </div>
            <Smartphone className="h-8 w-8 text-blue-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Receita Cartão
              </p>
              <p className="text-3xl font-bold text-purple-600">
                {formatCurrency(creditCardRevenue)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {creditCardRevenue > 0 ? `${((creditCardRevenue / totalRevenue) * 100).toFixed(1)}% do total` : '-'}
              </p>
            </div>
            <CreditCard className="h-8 w-8 text-purple-600" />
          </div>
        </Card>
      </div>

      {/* Revenue by Category */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Receita por Categoria</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Categoria</TableHead>
              <TableHead className="text-right">Inscrições</TableHead>
              <TableHead className="text-right">Receita Total</TableHead>
              <TableHead className="text-right">Valor Médio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categoryRevenues.map((cat) => (
              <TableRow key={cat.categoryName}>
                <TableCell className="font-medium">{cat.categoryName}</TableCell>
                <TableCell className="text-right">{cat.count}</TableCell>
                <TableCell className="text-right font-semibold text-green-600">
                  {formatCurrency(cat.revenue)}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(cat.revenue / cat.count)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Revenue by Kit */}
      {kitRevenues.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Receita por Kit</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kit</TableHead>
                <TableHead className="text-right">Inscrições</TableHead>
                <TableHead className="text-right">Receita Total</TableHead>
                <TableHead className="text-right">Valor Médio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {kitRevenues.map((kit) => (
                <TableRow key={kit.kitName}>
                  <TableCell className="font-medium">{kit.kitName}</TableCell>
                  <TableCell className="text-right">{kit.count}</TableCell>
                  <TableCell className="text-right font-semibold text-orange-600">
                    {formatCurrency(kit.revenue)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(kit.revenue / kit.count)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* All Registrations */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Todas as Inscrições</h3>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Corredor</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Kit</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registrations.map((reg) => (
                <TableRow key={reg.id}>
                  <TableCell className="font-medium">
                    {reg.profiles?.full_name || reg.runner_name || "N/A"}
                  </TableCell>
                  <TableCell className="text-sm">{reg.profiles?.cpf || "-"}</TableCell>
                  <TableCell>
                    {reg.event_categories?.name || reg.category_name || "N/A"}
                    {reg.event_categories?.distance && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({reg.event_categories.distance})
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {reg.event_kits?.name || (reg.kit_id ? "Kit" : "-")}
                  </TableCell>
                  <TableCell>
                    {reg.payment_method === "pix" && (
                      <Badge variant="outline" className="gap-1">
                        PIX
                      </Badge>
                    )}
                    {reg.payment_method === "credit_card" && (
                      <Badge variant="outline" className="gap-1">
                        <CreditCard className="h-3 w-3" />
                        Cartão
                      </Badge>
                    )}
                    {reg.payment_method === "boleto" && (
                      <Badge variant="outline">Boleto</Badge>
                    )}
                  </TableCell>
                  <TableCell>{getPaymentStatusBadge(reg.payment_status)}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(Number(reg.total_amount))}
                  </TableCell>
                  <TableCell className="text-sm">
                    {format(new Date(reg.created_at), "dd/MM/yyyy HH:mm", {
                      locale: ptBR,
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
};

export default EventDetailedReport;
