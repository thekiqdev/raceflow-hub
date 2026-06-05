import { useState, useEffect, useRef, useMemo, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getEventById, getAttributeSelectionStats, AttributeSelectionStats } from "@/lib/api/events";
import { getRegistrations } from "@/lib/api/registrations";
import { getModalities, type Modality } from "@/lib/api/modalities";
import { getEnabledModules } from "@/lib/api/systemSettings";
import {
  getLeadersInvitationsGrantedByEvent,
  getOrganizerLeadersInvitationsGrantedByEvent,
  getEventInvitationStats,
  getOrganizerEventInvitationStats,
  getEventGeneralStats,
  getOrganizerEventGeneralStats,
  getEventProductStockReport,
  getOrganizerEventProductStockReport,
  downloadEventFinancialReportPdf,
  EventFinancialReportDownloadError,
  type EventFinancialReportPdfContext,
  type EventInvitationStats,
  type EventGeneralStats,
  type EventProductStockReport,
  type EventProductStockStatus,
  type EventProductStockVariationRow,
} from "@/lib/api/reports";
import { getCanonicalRegistrationDisplayValue } from "@/lib/utils/feeCalculations";
import { ArrowLeft, Users, DollarSign, Package, CreditCard, Smartphone, Gift, AlertTriangle, LayoutGrid, Warehouse, CheckCircle2, Flame, FileDown, ChevronDown, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { EventKitPerformanceSection } from "@/components/organizer/EventKitPerformanceSection";
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
  status?: string | null;
  transferred_to_registration_id?: string | null;
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

function isTransferredOutShellForReport(reg: {
  status?: string | null;
  transferred_to_registration_id?: string | null;
}): boolean {
  return reg.status === "transferred" && Boolean(reg.transferred_to_registration_id);
}

/** Inscrição paga que entra em receita / contagem ativa (exclui casca de split admin). */
function countsAsPaidForReport(reg: RegistrationDetail): boolean {
  return reg.payment_status === "paid" && !isTransferredOutShellForReport(reg);
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

type RegistrationTableFilter = "all" | "paid" | "convidado" | "transferred" | "free_bonus";

const pillBadgeBase = "px-2 py-1 rounded-full text-xs font-medium inline-block";

function getStockStatusLabel(status: EventProductStockStatus): string {
  switch (status) {
    case "available":
      return "Disponível";
    case "low":
      return "Baixo estoque";
    case "exhausted":
      return "Esgotado";
    case "unlimited":
      return "Ilimitado";
    default:
      return status;
  }
}

function getStockStatusBadgeClass(status: EventProductStockStatus): string {
  switch (status) {
    case "available":
      return "bg-green-100 text-green-700";
    case "low":
      return "bg-yellow-100 text-yellow-700";
    case "exhausted":
      return "bg-red-100 text-red-700";
    case "unlimited":
      return "bg-gray-100 text-gray-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function formatStockQuantity(value: number | null): string {
  if (value === null) return "Ilimitado";
  return String(value);
}

interface StockProductGroup {
  product_id: string;
  product_name: string;
  variations: EventProductStockVariationRow[];
}

interface StockKitGroup {
  kit_id: string;
  kit_name: string;
  products_count: number;
  variations_count: number;
  total_consumed: number;
  products: StockProductGroup[];
}

function groupStockVariationsByKit(variations: EventProductStockVariationRow[]): StockKitGroup[] {
  const kitMap = new Map<string, StockKitGroup & { productMap: Map<string, StockProductGroup> }>();

  for (const row of variations) {
    let kitEntry = kitMap.get(row.kit_id);
    if (!kitEntry) {
      kitEntry = {
        kit_id: row.kit_id,
        kit_name: row.kit_name,
        products_count: 0,
        variations_count: 0,
        total_consumed: 0,
        products: [],
        productMap: new Map(),
      };
      kitMap.set(row.kit_id, kitEntry);
    }

    kitEntry.variations_count += 1;
    kitEntry.total_consumed += row.stock_used;

    let productEntry = kitEntry.productMap.get(row.product_id);
    if (!productEntry) {
      productEntry = {
        product_id: row.product_id,
        product_name: row.product_name,
        variations: [],
      };
      kitEntry.productMap.set(row.product_id, productEntry);
      kitEntry.products.push(productEntry);
    }
    productEntry.variations.push(row);
  }

  const kits = Array.from(kitMap.values()).map(({ productMap: _productMap, ...kit }) => {
    const products = kit.products
      .sort((a, b) => a.product_name.localeCompare(b.product_name, "pt-BR"))
      .map((product) => ({
        ...product,
        variations: [...product.variations].sort((a, b) =>
          a.variation_name.localeCompare(b.variation_name, "pt-BR")
        ),
      }));

    return {
      ...kit,
      products_count: products.length,
      products,
    };
  });

  return kits.sort((a, b) => a.kit_name.localeCompare(b.kit_name, "pt-BR"));
}

function StockStatusBadge({ status }: { status: EventProductStockStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn("border-0 font-medium", getStockStatusBadgeClass(status))}
    >
      {getStockStatusLabel(status)}
    </Badge>
  );
}

type OperationalStockLevel = "critical" | "low" | "normal" | "unlimited";

function getOperationalStockLevel(item: EventProductStockVariationRow): OperationalStockLevel {
  if (item.stock_initial === null) return "unlimited";
  if (item.stock_available === null) return "unlimited";
  if (item.stock_available <= 5) return "critical";
  if (item.stock_available <= 10) return "low";
  return "normal";
}

function getOperationalStockLabel(level: OperationalStockLevel): string {
  switch (level) {
    case "critical":
      return "Crítico";
    case "low":
      return "Baixo Estoque";
    case "normal":
      return "Normal";
    case "unlimited":
      return "Ilimitado";
    default:
      return level;
  }
}

function getOperationalStockBadgeClass(level: OperationalStockLevel): string {
  switch (level) {
    case "critical":
      return "bg-red-100 text-red-700 ring-1 ring-red-200";
    case "low":
      return "bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200";
    case "normal":
      return "bg-green-100 text-green-700 ring-1 ring-green-200";
    case "unlimited":
      return "bg-blue-100 text-blue-700 ring-1 ring-blue-200";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function OperationalStockBadge({ item }: { item: EventProductStockVariationRow }) {
  const level = getOperationalStockLevel(item);
  return (
    <Badge
      variant="outline"
      className={cn("border-0 font-semibold", getOperationalStockBadgeClass(level))}
    >
      {getOperationalStockLabel(level)}
    </Badge>
  );
}

function sortAttentionStockItems(
  items: EventProductStockVariationRow[]
): EventProductStockVariationRow[] {
  return [...items].sort((a, b) => {
    const aAvail = a.stock_available ?? Number.MAX_SAFE_INTEGER;
    const bAvail = b.stock_available ?? Number.MAX_SAFE_INTEGER;
    const aExhausted = aAvail === 0 ? 0 : 1;
    const bExhausted = bAvail === 0 ? 0 : 1;
    if (aExhausted !== bExhausted) return aExhausted - bExhausted;
    if (aAvail !== bAvail) return aAvail - bAvail;
    return a.kit_name.localeCompare(b.kit_name, "pt-BR");
  });
}

function computeStockOperationalSummary(variations: EventProductStockVariationRow[]) {
  let criticalCount = 0;
  let lowCount = 0;
  let exhaustedCount = 0;

  for (const item of variations) {
    if (item.stock_available === null) continue;
    if (item.stock_available === 0) exhaustedCount += 1;
    if (item.stock_available <= 5) criticalCount += 1;
    else if (item.stock_available <= 10) lowCount += 1;
  }

  return { criticalCount, lowCount, exhaustedCount };
}

function computeKitCriticalCounts(variations: EventProductStockVariationRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of variations) {
    if (item.stock_available !== null && item.stock_available <= 5) {
      map.set(item.kit_id, (map.get(item.kit_id) ?? 0) + 1);
    }
  }
  return map;
}

function matchesAttentionStock(item: EventProductStockVariationRow): boolean {
  return item.stock_available !== null && item.stock_available <= 10;
}

function matchesCriticalStock(item: EventProductStockVariationRow): boolean {
  return item.stock_available !== null && item.stock_available <= 5;
}

function matchesLowOperationalStock(item: EventProductStockVariationRow): boolean {
  return (
    item.stock_available !== null &&
    item.stock_available > 5 &&
    item.stock_available <= 10
  );
}

function matchesRegistrationFilter(
  reg: RegistrationDetail,
  filter: RegistrationTableFilter
): boolean {
  switch (filter) {
    case "paid":
      return reg.payment_status === "paid";
    case "convidado":
      return reg.payment_status === "convidado";
    case "transferred":
      return reg.status === "transferred";
    case "free_bonus":
      return reg.payment_method === "free_bonus";
    default:
      return true;
  }
}

function KpiCard({
  label,
  value,
  sublabel,
  icon: Icon,
  iconWrapClass,
  iconClass,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  sublabel?: string;
  icon: typeof Users;
  iconWrapClass: string;
  iconClass: string;
  valueClassName?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border shadow-sm p-5 md:p-6">
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide leading-tight min-w-0 pr-1">
          {label}
        </p>
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            iconWrapClass
          )}
        >
          <Icon className={cn("h-4 w-4", iconClass)} />
        </div>
      </div>
      <p
        className={cn(
          "text-2xl lg:text-3xl font-bold tabular-nums leading-tight break-words",
          valueClassName
        )}
      >
        {value}
      </p>
      {sublabel ? (
        <p className="text-xs text-gray-500 mt-2 leading-snug">{sublabel}</p>
      ) : null}
    </div>
  );
}

function SummaryStatCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border p-5 shadow-sm">
      <h4 className="text-sm font-semibold text-gray-600 mb-3">{title}</h4>
      <div className="space-y-0">{children}</div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between text-sm py-1 gap-4">
      <span className="text-gray-600">{label}</span>
      <span className="font-semibold tabular-nums text-gray-900">{value}</span>
    </div>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="text-lg font-semibold text-gray-900 mb-3 mt-6 first:mt-0">{children}</h2>;
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
  const [invitationStats, setInvitationStats] = useState<EventInvitationStats | null>(null);
  const [generalStats, setGeneralStats] = useState<EventGeneralStats | null>(null);
  const [productStockReport, setProductStockReport] = useState<EventProductStockReport | null>(null);
  const [registrationFilter, setRegistrationFilter] = useState<RegistrationTableFilter>("all");
  const [financialReportDownloading, setFinancialReportDownloading] = useState(false);
  const registrationsSectionRef = useRef<HTMLDivElement>(null);

  const handleDownloadFinancialReport = async (context: EventFinancialReportPdfContext) => {
    if (financialReportDownloading) return;
    setFinancialReportDownloading(true);
    try {
      await downloadEventFinancialReportPdf(eventId, context);
    } catch (error) {
      if (error instanceof EventFinancialReportDownloadError) {
        toast.error(error.message);
      } else {
        toast.error("Falha ao gerar relatório financeiro.");
      }
    } finally {
      setFinancialReportDownloading(false);
    }
  };

  const scrollToRegistrations = (filter?: RegistrationTableFilter) => {
    if (filter) setRegistrationFilter(filter);
    registrationsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const filteredRegistrations = registrations.filter((reg) =>
    matchesRegistrationFilter(reg, registrationFilter)
  );

  const stockKitGroups = useMemo(
    () =>
      productStockReport?.variations?.length
        ? groupStockVariationsByKit(productStockReport.variations)
        : [],
    [productStockReport]
  );

  const stockSummary = useMemo(
    () =>
      productStockReport?.variations?.length
        ? computeStockOperationalSummary(productStockReport.variations)
        : { criticalCount: 0, lowCount: 0, exhaustedCount: 0 },
    [productStockReport]
  );

  const criticalStockItems = useMemo(
    () => productStockReport?.variations?.filter(matchesCriticalStock) ?? [],
    [productStockReport]
  );

  const lowStockItems = useMemo(
    () => productStockReport?.variations?.filter(matchesLowOperationalStock) ?? [],
    [productStockReport]
  );

  const attentionStockItems = useMemo(
    () =>
      sortAttentionStockItems(
        productStockReport?.variations?.filter(matchesAttentionStock) ?? []
      ),
    [productStockReport]
  );

  const kitCriticalCounts = useMemo(
    () =>
      productStockReport?.variations?.length
        ? computeKitCriticalCounts(productStockReport.variations)
        : new Map<string, number>(),
    [productStockReport]
  );

  const getCanonicalDisplayValue = (
    reg: RegistrationDetail,
    currentPlatformFee: number,
    currentPlatformFeeType: 'fixed' | 'percentage'
  ): number =>
    getCanonicalRegistrationDisplayValue(reg, currentPlatformFee, currentPlatformFeeType);

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
        status: reg.status ?? null,
        transferred_to_registration_id: reg.transferred_to_registration_id ?? null,
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

        if (countsAsPaidForReport(reg)) {
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
          const generalRes = isAdmin
            ? await getEventGeneralStats(eventId)
            : await getOrganizerEventGeneralStats(eventId);
          if (generalRes?.success && generalRes.data) {
            setGeneralStats(generalRes.data);
          } else {
            setGeneralStats(null);
            toast.error(generalRes?.message || generalRes?.error || "Erro ao carregar resumo geral do evento");
          }
        } catch {
          setGeneralStats(null);
          toast.error("Erro ao carregar resumo geral do evento");
        }

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

        try {
          const statsRes = isAdmin
            ? await getEventInvitationStats(eventId)
            : await getOrganizerEventInvitationStats(eventId);
          if (statsRes?.success && statsRes.data) {
            setInvitationStats(statsRes.data);
          } else {
            setInvitationStats(null);
            toast.error(statsRes?.message || statsRes?.error || "Erro ao carregar estatísticas de convites");
          }
        } catch {
          setInvitationStats(null);
          toast.error("Erro ao carregar estatísticas de convites");
        }
      } else {
        setLeaderInvitationsGranted({});
        setInvitationStats(null);
        setGeneralStats(null);
      }

      let total = 0;
      let paid = 0;
      let pixTotal = 0;
      let creditCardTotal = 0;
      const categoryMap = new Map<string, { count: number; revenue: number }>();
      const kitMap = new Map<string, { count: number; revenue: number }>();

      regs?.forEach((reg) => {
        const isPaid = countsAsPaidForReport(reg);
        const regAmount = Number(reg.total_amount) || 0;

        if (isPaid && regAmount > 0) {
          paid++;
          const valorLiquido = getCanonicalDisplayValue(reg, currentPlatformFee, currentPlatformFeeType);
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
        if (isTransferredOutShellForReport(reg)) return;
        if (reg.runner_state) {
          const count = stateMap.get(reg.runner_state) || 0;
          stateMap.set(reg.runner_state, count + 1);
        }
      });
      setStateStats(stateMap);

      // Calculate city statistics
      const cityMap = new Map<string, number>();
      regs.forEach((reg) => {
        if (isTransferredOutShellForReport(reg)) return;
        if (reg.runner_city) {
          const count = cityMap.get(reg.runner_city) || 0;
          cityMap.set(reg.runner_city, count + 1);
        }
      });
      setCityStats(cityMap);

      // Calculate age statistics
      const ages: number[] = [];
      regs.forEach((reg) => {
        if (isTransferredOutShellForReport(reg)) return;
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

      // Load product stock report (read-only, computed on backend)
      try {
        const stockRes = isAdmin
          ? await getEventProductStockReport(eventId)
          : await getOrganizerEventProductStockReport(eventId);
        if (stockRes?.success && stockRes.data) {
          setProductStockReport(stockRes.data);
        } else {
          setProductStockReport(null);
        }
      } catch {
        setProductStockReport(null);
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
          const paidRegs = modalityRegs.filter(
            (reg) => countsAsPaidForReport(reg) && (Number(reg.total_amount) || 0) > 0
          );
          const count = paidRegs.length;
          const revenue = paidRegs.reduce(
            (sum, reg) => sum + getCanonicalDisplayValue(reg, currentPlatformFee, currentPlatformFeeType),
            0
          );
          
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

  /** Valor de exibição canônico da inscrição (alinhado ao backend da Etapa 1). */
  const getValorLiquido = (
    reg: RegistrationDetail,
    platformFee: number,
    platformFeeType: 'fixed' | 'percentage'
  ): number => {
    return getCanonicalDisplayValue(reg, platformFee, platformFeeType);
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

  const getRegistrationStatusPill = (reg: RegistrationDetail) => {
    if (reg.status === "transferred") {
      return (
        <span className={cn(pillBadgeBase, "bg-blue-100 text-blue-700")}>Transferido</span>
      );
    }
    if (reg.payment_method === "free_bonus") {
      return (
        <span className={cn(pillBadgeBase, "bg-gray-100 text-gray-700")}>Free bonus</span>
      );
    }
    if (reg.payment_status === "convidado") {
      return (
        <span className={cn(pillBadgeBase, "bg-yellow-100 text-yellow-700")}>Convidado</span>
      );
    }
    if (reg.payment_status === "paid") {
      return <span className={cn(pillBadgeBase, "bg-green-100 text-green-700")}>Pago</span>;
    }
    const labels: Record<string, string> = {
      pending: "Pendente",
      failed: "Falhou",
    };
    const label = labels[reg.payment_status || ""] || reg.payment_status || "Pendente";
    return (
      <span className={cn(pillBadgeBase, "bg-gray-100 text-gray-600")}>{label}</span>
    );
  };

  const registrationFilterButtons: { id: RegistrationTableFilter; label: string }[] = [
    { id: "all", label: "Todos" },
    { id: "paid", label: "Pagos" },
    { id: "convidado", label: "Convidado" },
    { id: "transferred", label: "Transferido" },
    { id: "free_bonus", label: "Free bonus" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Carregando detalhes...</div>
      </div>
    );
  }

  const activeRegistrationCount = registrations.filter(
    (r) => !isTransferredOutShellForReport(r)
  ).length;

  return (
    <div className="space-y-6 bg-gray-50 rounded-2xl p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{eventTitle}</h2>
            <p className="text-sm text-gray-500">Relatório detalhado · dashboard do evento</p>
          </div>
        </div>

        {(isAdmin || isOrganizer) && (
          isAdmin ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button disabled={financialReportDownloading} className="shrink-0">
                  {financialReportDownloading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <FileDown className="h-4 w-4 mr-2" />
                  )}
                  {financialReportDownloading ? "Gerando relatório financeiro..." : "Gerar Relatório Financeiro"}
                  {!financialReportDownloading && <ChevronDown className="h-4 w-4 ml-2" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuItem
                  disabled={financialReportDownloading}
                  onClick={() => void handleDownloadFinancialReport("organizer")}
                >
                  Relatório Financeiro (Organizador)
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={financialReportDownloading}
                  onClick={() => void handleDownloadFinancialReport("admin")}
                >
                  Relatório Financeiro (Administrativo)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              disabled={financialReportDownloading}
              onClick={() => void handleDownloadFinancialReport("organizer")}
              className="shrink-0"
            >
              {financialReportDownloading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4 mr-2" />
              )}
              {financialReportDownloading ? "Gerando relatório financeiro..." : "Gerar Relatório Financeiro"}
            </Button>
          )
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          label="Total de Inscrições"
          value={activeRegistrationCount}
          sublabel={`${paidCount} pagas`}
          icon={Users}
          iconWrapClass="bg-primary/10"
          iconClass="text-primary"
        />
        <KpiCard
          label="Receita Total"
          value={formatCurrency(totalRevenue) || "—"}
          sublabel={`Ticket médio: ${formatCurrency(paidCount > 0 ? totalRevenue / paidCount : 0) || "—"}`}
          icon={DollarSign}
          iconWrapClass="bg-green-100"
          iconClass="text-green-600"
          valueClassName="text-green-600"
        />
        <KpiCard
          label="Inscrições com Kit"
          value={kitRevenues.reduce((sum, k) => sum + k.count, 0)}
          sublabel={formatCurrency(kitRevenues.reduce((sum, k) => sum + k.revenue, 0)) || "Receita de kits"}
          icon={Package}
          iconWrapClass="bg-orange-100"
          iconClass="text-orange-600"
          valueClassName="text-orange-600"
        />
        <KpiCard
          label="Receita PIX"
          value={formatCurrency(pixRevenue) || "—"}
          sublabel={
            pixRevenue > 0 && totalRevenue > 0
              ? `${((pixRevenue / totalRevenue) * 100).toFixed(1)}% do total`
              : "—"
          }
          icon={Smartphone}
          iconWrapClass="bg-blue-100"
          iconClass="text-blue-600"
          valueClassName="text-blue-600"
        />
        <KpiCard
          label="Receita Cartão"
          value={formatCurrency(creditCardRevenue) || "—"}
          sublabel={
            creditCardRevenue > 0 && totalRevenue > 0
              ? `${((creditCardRevenue / totalRevenue) * 100).toFixed(1)}% do total`
              : "—"
          }
          icon={CreditCard}
          iconWrapClass="bg-purple-100"
          iconClass="text-purple-600"
          valueClassName="text-purple-600"
        />
      </div>

      {generalStats && (
        <section className="mb-6 space-y-4">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-gray-900">Resumo Geral do Evento</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <SummaryStatCard title="Inscrições">
              <StatRow label="Total" value={generalStats.total_registrations} />
              <StatRow label="Confirmadas" value={generalStats.confirmed_registrations} />
              <StatRow label="Transferidas" value={generalStats.transferred_registrations} />
              <StatRow label="Canceladas" value={generalStats.cancelled_registrations} />
            </SummaryStatCard>

            <SummaryStatCard title="Pagamentos">
              <StatRow label="Pagas" value={generalStats.paid_registrations} />
              <StatRow label="PIX" value={generalStats.pix_count} />
              <StatRow label="Cartão" value={generalStats.card_count} />
              <StatRow label="Free bonus" value={generalStats.free_bonus_count} />
              <StatRow label="Convidado" value={generalStats.invited_count} />
            </SummaryStatCard>

            <SummaryStatCard title="Convites">
              {invitationStats ? (
                <>
                  <StatRow label="Total concedidos" value={invitationStats.total_invitations} />
                  <StatRow label="Disponíveis" value={invitationStats.available_invitations} />
                  <StatRow label="Enviados" value={invitationStats.sent_invitations} />
                  <StatRow label="Usados" value={invitationStats.used_invitations} />
                  <StatRow
                    label="Taxa de conversão"
                    value={
                      invitationStats.conversion_rate != null
                        ? `${(invitationStats.conversion_rate * 100).toFixed(1)}%`
                        : "—"
                    }
                  />
                </>
              ) : (
                <p className="text-sm text-gray-500 py-2">Carregando estatísticas de convites…</p>
              )}
            </SummaryStatCard>

            <SummaryStatCard title="Origem das inscrições">
              <StatRow label="Pagas normais" value={generalStats.normal_paid_count} />
              <StatRow label="Via convite" value={generalStats.from_invitation_count} />
              <StatRow label="Free bonus admin" value={generalStats.free_bonus_admin_count} />
            </SummaryStatCard>
          </div>
        </section>
      )}

      <section className="mb-6 space-y-4">
        <SectionHeading>Financeiro</SectionHeading>
        <Card className="bg-white rounded-2xl p-6 shadow-sm border-0">
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
        <Card className="bg-white rounded-2xl p-6 shadow-sm border-0">
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

      </section>

      <section className="mb-6 space-y-4">
        <SectionHeading>Participação</SectionHeading>

      {/* Modalidades */}
      {modalities.length > 0 && (
        <Card className="bg-white rounded-2xl p-6 shadow-sm border-0">
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
        <Card className="bg-white rounded-2xl p-6 shadow-sm border-0">
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

      {/* Performance dos Kits — acima do estoque */}
      <EventKitPerformanceSection
        registrations={registrations}
        kitRevenues={kitRevenues}
        stockKitGroups={stockKitGroups}
        kitCriticalCounts={kitCriticalCounts}
        formatCurrency={formatCurrency}
      />

      {/* Estoque dos Produtos */}
      {productStockReport && (
        <div className="space-y-6">
          <Card className="bg-white rounded-2xl p-6 shadow-sm border-0">
            <h3 className="text-lg font-semibold mb-4">📦 Estoque dos Produtos</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
              <KpiCard
                label="Produtos cadastrados"
                value={productStockReport.summary.products_count}
                icon={Package}
                iconWrapClass="bg-blue-100"
                iconClass="text-blue-600"
              />
              <KpiCard
                label="Estoque inicial total"
                value={productStockReport.summary.stock_initial_total}
                icon={Warehouse}
                iconWrapClass="bg-indigo-100"
                iconClass="text-indigo-600"
              />
              <KpiCard
                label="Estoque utilizado"
                value={productStockReport.summary.stock_used_total}
                icon={LayoutGrid}
                iconWrapClass="bg-orange-100"
                iconClass="text-orange-600"
                valueClassName="text-orange-600"
              />
              <KpiCard
                label="Estoque disponível"
                value={productStockReport.summary.stock_available_total}
                icon={Warehouse}
                iconWrapClass="bg-green-100"
                iconClass="text-green-600"
                valueClassName="text-green-600"
              />
              <KpiCard
                label="Produtos esgotados"
                value={productStockReport.summary.exhausted_variations_count}
                icon={AlertTriangle}
                iconWrapClass="bg-red-100"
                iconClass="text-red-600"
                valueClassName="text-red-600"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <KpiCard
                label="Variações Críticas"
                value={stockSummary.criticalCount}
                sublabel="Disponível ≤ 5"
                icon={Flame}
                iconWrapClass="bg-red-100"
                iconClass="text-red-600"
                valueClassName="text-red-600"
              />
              <KpiCard
                label="Baixo Estoque"
                value={stockSummary.lowCount}
                sublabel="Disponível 6–10"
                icon={AlertTriangle}
                iconWrapClass="bg-yellow-100"
                iconClass="text-yellow-600"
                valueClassName="text-yellow-600"
              />
              <KpiCard
                label="Esgotadas"
                value={stockSummary.exhaustedCount}
                sublabel="Disponível = 0"
                icon={AlertTriangle}
                iconWrapClass="bg-red-100"
                iconClass="text-red-700"
                valueClassName="text-red-700"
              />
            </div>

            {productStockReport.variations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum produto com controle de estoque encontrado.
              </p>
            ) : (
              <>
                {criticalStockItems.length === 0 ? (
                  <div className="mb-6 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span className="font-medium">Nenhuma variação com estoque crítico.</span>
                  </div>
                ) : (
                  <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
                    <Flame className="h-4 w-4 shrink-0" />
                    <span className="font-semibold">
                      {stockSummary.criticalCount} variação(ões) crítica(s) — revise o estoque abaixo.
                    </span>
                  </div>
                )}

                {attentionStockItems.length > 0 && (
                  <Card
                    className={cn(
                      "mb-6 rounded-xl border-2 shadow-sm",
                      criticalStockItems.length > 0
                        ? "border-red-300 bg-red-50/40"
                        : "border-yellow-300 bg-yellow-50/40"
                    )}
                  >
                    <div className="px-4 py-4 md:px-5">
                      <h4 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <AlertTriangle
                          className={cn(
                            "h-5 w-5 shrink-0",
                            criticalStockItems.length > 0 ? "text-red-600" : "text-yellow-600"
                          )}
                        />
                        Atenção ao Estoque
                      </h4>
                      <div className="space-y-3">
                        {attentionStockItems.map((item) => {
                          const level = getOperationalStockLevel(item);
                          return (
                            <div
                              key={`attention-${item.variation_id}`}
                              className={cn(
                                "flex flex-col gap-2 rounded-lg border bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
                                level === "critical"
                                  ? "border-red-200"
                                  : "border-yellow-200"
                              )}
                            >
                              <div className="min-w-0 space-y-0.5">
                                <p className="text-sm font-semibold text-gray-900">{item.kit_name}</p>
                                <p className="text-sm text-gray-700">
                                  {item.product_name}{" "}
                                  <span className="font-medium">{item.variation_name}</span>
                                </p>
                                <p className="text-sm tabular-nums">
                                  Disponível:{" "}
                                  <span
                                    className={cn(
                                      "font-bold",
                                      level === "critical" ? "text-red-600" : "text-yellow-700"
                                    )}
                                  >
                                    {item.stock_available}
                                  </span>
                                </p>
                              </div>
                              <OperationalStockBadge item={item} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </Card>
                )}

                <div className="space-y-6">
                  {stockKitGroups.map((kit) => {
                    const kitCriticalCount = kitCriticalCounts.get(kit.kit_id) ?? 0;
                    return (
                      <div
                        key={kit.kit_id}
                        className={cn(
                          "rounded-xl border overflow-hidden",
                          kitCriticalCount > 0
                            ? "border-red-200 bg-red-50/20"
                            : "border-gray-100 bg-gray-50/50"
                        )}
                      >
                        <div className="px-4 py-4 md:px-5 md:py-5 border-b border-gray-100 bg-white">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <h4 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                              <Package className="h-4 w-4 text-primary shrink-0" />
                              {kit.kit_name}
                              {kitCriticalCount > 0 && (
                                <Badge className="bg-red-100 text-red-700 border-0 hover:bg-red-100">
                                  {kitCriticalCount} crítico(s)
                                </Badge>
                              )}
                            </h4>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                              <span>
                                Produtos:{" "}
                                <span className="font-semibold text-gray-900 tabular-nums">
                                  {kit.products_count}
                                </span>
                              </span>
                              <span>
                                Variações:{" "}
                                <span className="font-semibold text-gray-900 tabular-nums">
                                  {kit.variations_count}
                                </span>
                              </span>
                              <span>
                                Consumidos:{" "}
                                <span className="font-semibold text-orange-600 tabular-nums">
                                  {kit.total_consumed}
                                </span>
                              </span>
                              <span>
                                Críticos:{" "}
                                <span
                                  className={cn(
                                    "font-semibold tabular-nums",
                                    kitCriticalCount > 0 ? "text-red-600" : "text-gray-900"
                                  )}
                                >
                                  {kitCriticalCount}
                                </span>
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Produto</TableHead>
                                <TableHead>Variação</TableHead>
                                <TableHead className="text-right">Estoque Inicial</TableHead>
                                <TableHead className="text-right">Utilizado</TableHead>
                                <TableHead className="text-right">Disponível</TableHead>
                                <TableHead>Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {kit.products.map((product) =>
                                product.variations.map((item) => (
                                  <TableRow key={item.variation_id}>
                                    <TableCell className="font-medium">{product.product_name}</TableCell>
                                    <TableCell>{item.variation_name}</TableCell>
                                    <TableCell className="text-right tabular-nums">
                                      {formatStockQuantity(item.stock_initial)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                      {item.stock_used}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                      {formatStockQuantity(item.stock_available)}
                                    </TableCell>
                                    <TableCell>
                                      <StockStatusBadge status={item.status} />
                                    </TableCell>
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      {/* Statistics by State and City */}
      {(stateStats.size > 0 || cityStats.size > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Statistics by State */}
          {stateStats.size > 0 && (
            <Card className="bg-white rounded-2xl p-6 shadow-sm border-0">
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
            <Card className="bg-white rounded-2xl p-6 shadow-sm border-0">
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
        <Card className="bg-white rounded-2xl p-6 shadow-sm border-0">
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

      </section>

      <section className="mb-6 space-y-4">
        <SectionHeading>Operacional</SectionHeading>
        {/* Relatório de líderes */}
        {leaderCouponSales.length > 0 && (
          <Card className="bg-white rounded-2xl p-6 shadow-sm border-0">
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

        {(isAdmin || isOrganizer) && invitationStats && (
          <Card className="bg-white rounded-2xl p-6 shadow-sm border-0">
            <div className="flex items-center gap-2 mb-4">
              <Gift className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Convites</h3>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Convites gerados a partir de metas de líderes. Receita considera apenas inscrições pagas.
            </p>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-6">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-muted-foreground">Total de convites</p>
                <p className="text-2xl font-bold tabular-nums">{invitationStats.total_invitations}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-muted-foreground">Disponíveis</p>
                <p className="text-2xl font-bold tabular-nums">{invitationStats.available_invitations}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-muted-foreground">Enviados</p>
                <p className="text-2xl font-bold tabular-nums">{invitationStats.sent_invitations}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-muted-foreground">Usados</p>
                <p className="text-2xl font-bold tabular-nums">{invitationStats.used_invitations}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-muted-foreground">Taxa de conversão</p>
                <p className="text-2xl font-bold tabular-nums">
                  {invitationStats.conversion_rate != null
                    ? `${(invitationStats.conversion_rate * 100).toFixed(1)}%`
                    : "—"}
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 mb-4">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-muted-foreground">Receita (apenas pagas)</p>
                <p className="text-xl font-semibold text-green-600 tabular-nums">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                    invitationStats.revenue_from_invitations
                  )}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-muted-foreground">Inscrições pagas via convite</p>
                <p className="text-xl font-semibold tabular-nums">
                  {invitationStats.paid_registrations_from_invitations}
                </p>
              </div>
            </div>

            {invitationStats.expired_invitations > 0 && (
              <p className="text-xs text-muted-foreground mb-3">
                Expirados (fora do total): {invitationStats.expired_invitations}
              </p>
            )}

            {invitationStats.orphan_free_bonus_count > 0 && (
              <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-yellow-800">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-yellow-700" />
                  <p className="text-sm">
                    Existem inscrições bônus sem convite associado ({invitationStats.orphan_free_bonus_count}).
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 border-yellow-300 bg-white hover:bg-yellow-100 text-yellow-900"
                  onClick={() => scrollToRegistrations("free_bonus")}
                >
                  Ver inscrições
                </Button>
              </div>
            )}

            {invitationStats.inconsistent_invitations > 0 && (
              <Alert className="border-destructive/50 bg-destructive/5">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <AlertDescription>
                  Existem inconsistências nos convites ({invitationStats.inconsistent_invitations} convite(s) sem
                  inscrição lastro).
                </AlertDescription>
              </Alert>
            )}
          </Card>
        )}


        {generalStats && (
          <Card className="bg-white rounded-2xl p-6 shadow-sm border-0">
            <h3 className="text-base font-semibold text-gray-900 mb-3">Transferências</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs text-gray-500">Transferidas</p>
                <p className="text-2xl font-bold tabular-nums text-blue-600">
                  {generalStats.transferred_registrations}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs text-gray-500">Confirmadas</p>
                <p className="text-2xl font-bold tabular-nums">{generalStats.confirmed_registrations}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs text-gray-500">Canceladas</p>
                <p className="text-2xl font-bold tabular-nums text-gray-700">
                  {generalStats.cancelled_registrations}
                </p>
              </div>
            </div>
          </Card>
        )}
      </section>

      <section ref={registrationsSectionRef} className="mb-6">
        <Card className="bg-white rounded-2xl p-6 shadow-sm border-0">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Todas as Inscrições</h3>
              <p className="text-xs text-gray-500 mt-1">
                {filteredRegistrations.length} de {registrations.length} exibidas
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {registrationFilterButtons.map((btn) => (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => setRegistrationFilter(btn.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg border text-sm transition-colors",
                    registrationFilter === btn.id
                      ? "bg-black text-white border-black"
                      : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                  )}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
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
              {filteredRegistrations.map((reg) => {
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
                  <TableCell>{getRegistrationStatusPill(reg)}</TableCell>
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
      </section>
    </div>
  );
};

export default EventDetailedReport;
