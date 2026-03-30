import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getEventById, getAttributeSelectionStats, AttributeSelectionStats } from "@/lib/api/events";
import { getRegistrations } from "@/lib/api/registrations";
import { getModalities, type Modality } from "@/lib/api/modalities";
import { getEnabledModules } from "@/lib/api/systemSettings";
import {
  getLeadersInvitationsGrantedByEvent,
  getOrganizerLeadersInvitationsGrantedByEvent,
} from "@/lib/api/reports";
import { calculateValueWithoutFee } from "@/lib/utils/feeCalculations";
import { ArrowLeft, Users, DollarSign, Package, CreditCard, Smartphone, MapPin } from "lucide-react";
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
import { useAuth } from "@/contexts/AuthContext";

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
  runner_birth_date?: string;
  runner_city?: string;
  runner_state?: string;
  category_name?: string;
  modality_names?: string[]; // Modalidades associadas à categoria
  /** Modalidade escolhida na inscrição (uma por inscrição). */
  modality_id?: string | null;
  modality_name?: string | null;
  /** Cupom utilizado na inscrição (se houver). */
  coupon_code?: string | null;
  /** Leader associado ao cupom (se houver). */
  leader_id?: string | null;
  leader_name?: string | null;
  /** OK Etapa 1: Taxa da plataforma na inscrição inicial (R$). */
  platform_fee_amount?: number;
  /** OK Etapa 1: Taxa de atualização na edição (R$). */
  registration_edit_fee_amount?: number;
  /** OK Etapa 1: Nome do kit (API retorna ek.name as kit_name). */
  kit_name?: string | null;
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

interface LeaderCouponSalesRow {
  leader_id: string;
  leader_name: string | null;
  sales_paid_count: number;
  coupons_total_count: number;
  coupons_sent_count: number;
  coupons_total_codes: string[];
  coupons_sent_codes: string[];
}

interface AttributeSelectionInfo {
  kitName: string;
  productName: string;
  attributeName: string;
  attributeValue: string;
  selectionCount: number;
  variantPrice?: number | null;
}

const EventDetailedReport = ({ eventId, onBack }: EventDetailedReportProps) => {
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const isAdmin = (user?.roles || []).includes('admin');
  const isOrganizer = (user?.roles || []).includes('organizer');
  const [eventTitle, setEventTitle] = useState("");
  const [registrations, setRegistrations] = useState<RegistrationDetail[]>([]);
  const [categoryRevenues, setCategoryRevenues] = useState<CategoryRevenue[]>([]);
  const [kitRevenues, setKitRevenues] = useState<KitRevenue[]>([]);
  const [attributeSelections, setAttributeSelections] = useState<AttributeSelectionInfo[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [paidCount, setPaidCount] = useState(0);
  const [pixRevenue, setPixRevenue] = useState(0);
  const [creditCardRevenue, setCreditCardRevenue] = useState(0);
  const [stateStats, setStateStats] = useState<Map<string, number>>(new Map());
  const [cityStats, setCityStats] = useState<Map<string, number>>(new Map());
  const [ageStats, setAgeStats] = useState<{ min: number; max: number; avg: number } | null>(null);
  const [modalities, setModalities] = useState<Modality[]>([]);
  const [modalityStats, setModalityStats] = useState<Map<string, { count: number; revenue: number }>>(new Map());
  const [platformFee, setPlatformFee] = useState<number>(0);
  const [platformFeeType, setPlatformFeeType] = useState<'fixed' | 'percentage'>('fixed');
  const [leaderCouponSales, setLeaderCouponSales] = useState<LeaderCouponSalesRow[]>([]);
  const [leaderInvitationsGranted, setLeaderInvitationsGranted] = useState<Record<string, number>>({});

  useEffect(() => {
    loadEventDetails();
  }, [eventId]);

  const loadEventDetails = async () => {
    // Load platform fee settings first
    let currentPlatformFee = 0;
    let currentPlatformFeeType: 'fixed' | 'percentage' = 'fixed';
    try {
      const feeResponse = await getEnabledModules();
      if (feeResponse.success && feeResponse.data) {
        currentPlatformFee = feeResponse.data.platform_fee || 0;
        currentPlatformFeeType = feeResponse.data.platform_fee_type || 'fixed';
        setPlatformFee(currentPlatformFee);
        setPlatformFeeType(currentPlatformFeeType);
      }
    } catch (error) {
      console.error("Error loading platform fee settings:", error);
    }
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

      // Transform API response to match expected format (OK Etapa 1: platform_fee_amount, registration_edit_fee_amount, kit_name)
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
        runner_birth_date: reg.runner_birth_date,
        runner_city: reg.runner_city,
        runner_state: reg.runner_state,
        category_name: reg.category_name,
        modality_names: reg.modality_names || [],
        modality_id: reg.modality_id ?? null,
        modality_name: reg.modality_name ?? null,
        coupon_code: reg.coupon_code ?? null,
        leader_id: reg.leader_id ?? null,
        leader_name: reg.leader_name ?? null,
        platform_fee_amount: reg.platform_fee_amount != null ? Number(reg.platform_fee_amount) : undefined,
        registration_edit_fee_amount: reg.registration_edit_fee_amount != null ? Number(reg.registration_edit_fee_amount) : undefined,
        kit_name: reg.kit_name ?? null,
        profiles: reg.runner_name ? {
          full_name: reg.runner_name,
          cpf: "", // CPF não vem na API por segurança
        } : undefined,
        event_categories: reg.category_name ? {
          name: reg.category_name,
          distance: "", // Distance não vem na resposta atual
        } : undefined,
        event_kits: reg.kit_name ? { name: reg.kit_name } : null,
      }));

      setRegistrations(regs);

      // Relatório de líderes (sessão operacional):
      // - Vendas: inscrições pagas do evento (payment_status === "paid") associadas ao líder via cupom
      // - Cupons (tem): códigos de cupom que aparecem nas inscrições do evento para este líder (paid + demais)
      // - Cupons (enviou/usou): códigos de cupom que aparecem nas inscrições pagas para este líder
      const leaderMap = new Map<
        string,
        {
          leader_name: string | null;
          sales_paid_count: number;
          coupons_total_codes: Set<string>;
          coupons_sent_codes: Set<string>;
        }
      >();

      regs.forEach((reg) => {
        const leaderId = reg.leader_id ?? null;
        const couponCode = reg.coupon_code ?? null;
        if (!leaderId || !couponCode) return;

        if (!leaderMap.has(leaderId)) {
          leaderMap.set(leaderId, {
            leader_name: reg.leader_name ?? null,
            sales_paid_count: 0,
            coupons_total_codes: new Set<string>(),
            coupons_sent_codes: new Set<string>(),
          });
        }

        const entry = leaderMap.get(leaderId)!;
        entry.coupons_total_codes.add(couponCode);

        if (reg.payment_status === "paid") {
          entry.sales_paid_count += 1;
          entry.coupons_sent_codes.add(couponCode);
        }
      });

      const leaderRows: LeaderCouponSalesRow[] = Array.from(leaderMap.entries())
        .map(([leader_id, entry]) => {
          const coupons_total_codes = Array.from(entry.coupons_total_codes.values()).sort();
          const coupons_sent_codes = Array.from(entry.coupons_sent_codes.values()).sort();
          return {
            leader_id,
            leader_name: entry.leader_name,
            sales_paid_count: entry.sales_paid_count,
            coupons_total_count: coupons_total_codes.length,
            coupons_sent_count: coupons_sent_codes.length,
            coupons_total_codes,
            coupons_sent_codes,
          };
        })
        .sort(
          (a, b) =>
            b.sales_paid_count - a.sales_paid_count ||
            (a.leader_name || a.leader_id).localeCompare(b.leader_name || b.leader_id)
        );

      setLeaderCouponSales(leaderRows);

      // Convites ganhos: count de leader_invitations válidos (available/sent/used) por líder no evento.
      // Para /admin/eventos, isso deve estar disponível via endpoint read-only.
      if (isAdmin || isOrganizer) {
        try {
          const invRes = isAdmin
            ? await getLeadersInvitationsGrantedByEvent(eventId)
            : await getOrganizerLeadersInvitationsGrantedByEvent(eventId);
          if (invRes?.success && invRes.data) {
            const map: Record<string, number> = {};
            for (const r of invRes.data) {
              map[r.leader_id] = r.invitations_granted;
            }
            setLeaderInvitationsGranted(map);
          } else {
            setLeaderInvitationsGranted({});
          }
        } catch (e) {
          setLeaderInvitationsGranted({});
        }
      } else {
        setLeaderInvitationsGranted({});
      }

      // OK Etapa 3: Receita só com "paid"; valor líquido (getValorLiquido). Convidado não entra na receita.
      const getValorLiquidoHere = (r: RegistrationDetail): number => {
        const t = Number(r.total_amount) || 0;
        const pf = Number(r.platform_fee_amount) || 0;
        const ef = Number(r.registration_edit_fee_amount) || 0;
        if (pf > 0 || ef > 0) return Math.round((t - pf - ef) * 100) / 100;
        return calculateValueWithoutFee(t, currentPlatformFee, currentPlatformFeeType);
      };

      let total = 0;
      let paid = 0;
      let pixTotal = 0;
      let creditCardTotal = 0;
      const categoryMap = new Map<string, { count: number; revenue: number }>();
      const kitMap = new Map<string, { count: number; revenue: number }>();

      regs?.forEach((reg) => {
        const isPaid = reg.payment_status === "paid";
        const regAmount = Number(reg.total_amount) || 0;

        if (isPaid && regAmount > 0) {
          paid++;
          const valorLiquido = getValorLiquidoHere(reg);
          total += valorLiquido;

          if (reg.payment_method === "pix") {
            pixTotal += valorLiquido;
          } else if (reg.payment_method === "credit_card") {
            creditCardTotal += valorLiquido;
          }

          const categoryKey = reg.event_categories?.name || reg.category_name || "Sem categoria";
          const existing = categoryMap.get(categoryKey);
          if (existing) {
            existing.count++;
            existing.revenue += valorLiquido;
          } else {
            categoryMap.set(categoryKey, { count: 1, revenue: valorLiquido });
          }

          // OK Etapa 4: agrupar por nome real do kit (só incluir quando houver kit)
          if (reg.kit_id || reg.kit_name) {
            const kitKey = reg.kit_name || reg.event_kits?.name || "Kit";
            const existingKit = kitMap.get(kitKey);
            if (existingKit) {
              existingKit.count++;
              existingKit.revenue += valorLiquido;
            } else {
              kitMap.set(kitKey, { count: 1, revenue: valorLiquido });
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

      // Calculate state statistics
      const stateMap = new Map<string, number>();
      regs.forEach((reg) => {
        if (reg.runner_state) {
          const count = stateMap.get(reg.runner_state) || 0;
          stateMap.set(reg.runner_state, count + 1);
        }
      });
      setStateStats(stateMap);

      // Calculate city statistics
      const cityMap = new Map<string, number>();
      regs.forEach((reg) => {
        if (reg.runner_city) {
          const count = cityMap.get(reg.runner_city) || 0;
          cityMap.set(reg.runner_city, count + 1);
        }
      });
      setCityStats(cityMap);

      // Calculate age statistics
      const ages: number[] = [];
      regs.forEach((reg) => {
        if (reg.runner_birth_date) {
          const birthDate = new Date(reg.runner_birth_date);
          const today = new Date();
          let age = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
          }
          if (age > 0 && age < 150) { // Validação básica
            ages.push(age);
          }
        }
      });
      
      if (ages.length > 0) {
        const minAge = Math.min(...ages);
        const maxAge = Math.max(...ages);
        const avgAge = ages.reduce((sum, age) => sum + age, 0) / ages.length;
        setAgeStats({ min: minAge, max: maxAge, avg: Math.round(avgAge * 10) / 10 });
      }

      // Load attribute selection statistics
      const statsResponse = await getAttributeSelectionStats(eventId);
      if (statsResponse.success && statsResponse.data) {
        const selectionsInfo: AttributeSelectionInfo[] = statsResponse.data.map((stat: AttributeSelectionStats) => ({
          kitName: stat.kit_name,
          productName: stat.product_name,
          attributeName: stat.attribute_name,
          attributeValue: stat.attribute_value,
          selectionCount: stat.selection_count,
          variantPrice: stat.variant_price,
        }));
        setAttributeSelections(selectionsInfo);
      }

      // Load modalities
      const modalitiesResponse = await getModalities(eventId);
      if (modalitiesResponse.success && modalitiesResponse.data) {
        setModalities(modalitiesResponse.data);

        // Calculate participants and revenue per modality
        // Count registrations where the category has each modality associated
        const modalityStatsMap = new Map<string, { count: number; revenue: number }>();
        
        modalitiesResponse.data.forEach((modality) => {
          // Contar inscrição apenas na modalidade em que está (modality_id), não em todas as modalidades da categoria
          const modalityRegs = regs.filter((reg) => reg.modality_id === modality.id);
          
          // OK Etapa 3: só "paid"; valor líquido (convidado não entra na receita)
          const paidRegs = modalityRegs.filter((reg) => reg.payment_status === "paid" && (Number(reg.total_amount) || 0) > 0);
          const count = paidRegs.length;
          const revenue = paidRegs.reduce((sum, reg) => sum + getValorLiquidoHere(reg), 0);
          
          modalityStatsMap.set(modality.id, { count, revenue });
        });
        
        setModalityStats(modalityStatsMap);
      }
    } catch (error) {
      console.error("Error loading event details:", error);
      toast.error("Erro ao carregar detalhes do evento");
    } finally {
      setLoading(false);
    }
  };

  /** OK Etapa 2: Valor líquido do organizador (total - taxas). Alinhado ao backend. */
  const getValorLiquido = (
    reg: RegistrationDetail,
    platformFee: number,
    platformFeeType: 'fixed' | 'percentage'
  ): number => {
    const total = Number(reg.total_amount) || 0;
    const pf = Number(reg.platform_fee_amount) || 0;
    const ef = Number(reg.registration_edit_fee_amount) || 0;
    if (pf > 0 || ef > 0) {
      return Math.round((total - pf - ef) * 100) / 100;
    }
    return calculateValueWithoutFee(total, platformFee, platformFeeType);
  };

  const formatCurrency = (value: number) => {
    if (value === 0 || !value) {
      return ''; // Retorna espaço em branco ao invés de "Grátis" ou "R$ 0,00"
    }
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const calculateAge = (birthDate: string | undefined): number | null => {
    if (!birthDate) return null;
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age > 0 && age < 150 ? age : null;
  };

  const getPaymentStatusBadge = (status: string | null) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      paid: "default",
      convidado: "default",
      pending: "secondary",
      failed: "destructive",
    };
    const labels: Record<string, string> = {
      paid: "Pago",
      convidado: "Convite",
      pending: "Pendente",
      failed: "Falhou",
    };
    return (
      <Badge 
        variant={variants[status || "pending"] || "outline"}
        className={status === "convidado" ? "bg-blue-500" : ""}
      >
        {labels[status || ""] || status || "Pendente"}
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

      {/* Relatório de líderes */}
      {leaderCouponSales.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Relatório de líderes (vendas e cupons)</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Líder</TableHead>
                <TableHead className="text-right tabular-nums">Vendas (pagas)</TableHead>
                <TableHead className="text-right tabular-nums">Cupons (tem)</TableHead>
                <TableHead className="text-right tabular-nums">Cupons (enviou/usou)</TableHead>
                <TableHead className="text-right tabular-nums">Convites ganhos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaderCouponSales.map((row) => (
                <TableRow key={row.leader_id}>
                  <TableCell className="font-medium">{row.leader_name || row.leader_id}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.sales_paid_count}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end">
                      <span className="tabular-nums">{row.coupons_total_count}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {row.coupons_total_codes.length === 0
                          ? "—"
                          : `${row.coupons_total_codes.slice(0, 3).join(", ")}${
                              row.coupons_total_codes.length > 3
                                ? ` +${row.coupons_total_codes.length - 3}`
                                : ""
                            }`}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end">
                      <span className="tabular-nums">{row.coupons_sent_count}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {row.coupons_sent_codes.length === 0
                          ? "—"
                          : `${row.coupons_sent_codes.slice(0, 3).join(", ")}${
                              row.coupons_sent_codes.length > 3
                                ? ` +${row.coupons_sent_codes.length - 3}`
                                : ""
                            }`}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {isAdmin || isOrganizer ? leaderInvitationsGranted[row.leader_id] ?? 0 : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            “Cupons (tem)” e “Cupons (enviou/usou)” são derivados dos cupons presentes nas inscrições do evento
            (sem consulta independente à tabela de cupons).
          </p>
        </Card>
      )}

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

      {/* Modalidades */}
      {modalities.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Modalidades</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Distância</TableHead>
                <TableHead className="text-right">Inscritos</TableHead>
                <TableHead className="text-right">Limite Máximo</TableHead>
                <TableHead className="text-right">Disponibilidade</TableHead>
                <TableHead className="text-right">Receita Total</TableHead>
                <TableHead className="text-right">Ticket Médio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {modalities
                .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
                .map((modality) => {
                  const stats = modalityStats.get(modality.id) || { count: 0, revenue: 0 };
                  const participantsCount = stats.count;
                  const revenue = stats.revenue;
                  const avgTicket = participantsCount > 0 ? revenue / participantsCount : 0;
                  const maxParticipants = modality.max_participants;
                  const availability = maxParticipants 
                    ? maxParticipants - participantsCount 
                    : null;
                  const isFull = maxParticipants !== null && participantsCount >= maxParticipants;
                  
                  return (
                    <TableRow key={modality.id}>
                      <TableCell className="font-medium">{modality.name}</TableCell>
                      <TableCell>{modality.distance}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {participantsCount}
                      </TableCell>
                      <TableCell className="text-right">
                        {maxParticipants !== null ? maxParticipants : 'Sem limite'}
                      </TableCell>
                      <TableCell className="text-right">
                        {maxParticipants !== null ? (
                          <Badge variant={isFull ? 'destructive' : 'default'}>
                            {isFull ? 'Lotada' : `${availability} vagas`}
                          </Badge>
                        ) : (
                          <Badge variant="outline">Ilimitado</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        {formatCurrency(revenue)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(avgTicket)}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Estatísticas de Seleção de Atributos */}
      {attributeSelections.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Estatísticas de Seleção de Atributos</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kit</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Atributo</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead className="text-right">Quantidade Escolhida</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attributeSelections.map((item, index) => (
                <TableRow key={`${item.kitName}-${item.productName}-${item.attributeName}-${item.attributeValue}-${index}`}>
                  <TableCell className="font-medium">{item.kitName}</TableCell>
                  <TableCell>{item.productName}</TableCell>
                  <TableCell>{item.attributeName}</TableCell>
                  <TableCell>{item.attributeValue}</TableCell>
                  <TableCell className="text-right font-semibold">{item.selectionCount}</TableCell>
                  <TableCell className="text-right">
                    {item.variantPrice !== null && item.variantPrice !== undefined
                      ? formatCurrency(item.variantPrice)
                      : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Statistics by State and City */}
      {(stateStats.size > 0 || cityStats.size > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Statistics by State */}
          {stateStats.size > 0 && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Participantes por Estado</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Array.from(stateStats.entries())
                  .sort((a, b) => b[1] - a[1])
                  .map(([state, count]) => (
                    <div key={state} className="flex items-center justify-between p-3 border rounded-lg">
                      <span className="font-medium">{state}</span>
                      <span className="text-lg font-bold text-primary">{count}</span>
                    </div>
                  ))}
              </div>
            </Card>
          )}

          {/* Statistics by City */}
          {cityStats.size > 0 && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Participantes por Cidade</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Array.from(cityStats.entries())
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 20) // Mostrar apenas as 20 cidades com mais participantes
                  .map(([city, count]) => (
                    <div key={city} className="flex items-center justify-between p-3 border rounded-lg">
                      <span className="font-medium">{city}</span>
                      <span className="text-lg font-bold text-primary">{count}</span>
                    </div>
                  ))}
              </div>
              {cityStats.size > 20 && (
                <p className="text-sm text-muted-foreground mt-4">
                  Mostrando as 20 cidades com mais participantes de um total de {cityStats.size} cidades
                </p>
              )}
            </Card>
          )}
        </div>
      )}

      {/* Age Statistics */}
      {ageStats && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Estatísticas de Idade dos Participantes</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Idade Mínima</p>
              <p className="text-2xl font-bold text-primary">{ageStats.min} anos</p>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Idade Média</p>
              <p className="text-2xl font-bold text-primary">{ageStats.avg} anos</p>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Idade Máxima</p>
              <p className="text-2xl font-bold text-primary">{ageStats.max} anos</p>
            </div>
          </div>
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
                <TableHead>Idade</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Kit</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registrations.map((reg) => {
                const age = calculateAge(reg.runner_birth_date);
                return (
                <TableRow key={reg.id}>
                  <TableCell className="font-medium">
                    {reg.profiles?.full_name || reg.runner_name || "N/A"}
                  </TableCell>
                  <TableCell className="text-sm">{reg.profiles?.cpf || "-"}</TableCell>
                    <TableCell className="text-sm">
                      {age !== null ? `${age} anos` : "-"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {reg.runner_city || "-"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {reg.runner_state || "-"}
                    </TableCell>
                  <TableCell>
                    {reg.event_categories?.name || reg.category_name || "N/A"}
                    {reg.event_categories?.distance && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({reg.event_categories.distance})
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {reg.kit_name || reg.event_kits?.name || (reg.kit_id ? "Kit" : "-")}
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
                    {(() => {
                      if (reg.payment_status === "convidado") return "R$ 0,00";
                      const v = getValorLiquido(reg, platformFee, platformFeeType);
                      return v === 0 ? "R$ 0,00" : formatCurrency(v);
                    })()}
                  </TableCell>
                  <TableCell className="text-sm">
                    {format(new Date(reg.created_at), "dd/MM/yyyy HH:mm", {
                      locale: ptBR,
                    })}
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
};

export default EventDetailedReport;
