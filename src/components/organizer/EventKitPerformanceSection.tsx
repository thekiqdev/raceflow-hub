import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Trophy, TrendingUp, Package, Flame, DollarSign, Users } from "lucide-react";

/** Entrada de receita por kit (já calculada no carregamento do relatório). */
export interface KitRevenueInput {
  kitName: string;
  count: number;
  revenue: number;
}

/** Grupo de estoque por kit (Sprint 2). */
export interface StockKitGroupInput {
  kit_id: string;
  kit_name: string;
  total_consumed: number;
  products_count: number;
  variations_count: number;
  products: Array<{
    variations: Array<{ stock_used: number }>;
  }>;
}

export interface KitRegistrationInput {
  kit_id?: string | null;
  kit_name?: string | null;
  event_kits?: { name: string } | null;
  status?: string | null;
  transferred_to_registration_id?: string | null;
}

export type KitPerformanceBadge =
  | "best_seller"
  | "top_revenue"
  | "top_stock_consumption"
  | "critical_stock";

export interface KitPerformanceRow {
  kit_id: string;
  kit_name: string;
  registration_count: number;
  participation_pct: number;
  /** Receita líquida canônica (pré-calculada em loadEventDetails). */
  revenue: number;
  paid_registration_count: number;
  stock_units_consumed: number;
  variations_with_consumption: number;
  critical_stock_count: number;
  badges: KitPerformanceBadge[];
  /** Preparado para Sprint futura: ticket médio por kit. */
  avg_ticket: number | null;
}

function isTransferredOutShell(reg: KitRegistrationInput): boolean {
  return reg.status === "transferred" && Boolean(reg.transferred_to_registration_id);
}

function kitRowKey(kitId: string | null | undefined, kitName: string): string {
  if (kitId) return kitId;
  return `name:${kitName.toLowerCase().trim()}`;
}

function countVariationsWithConsumption(group: StockKitGroupInput): number {
  return group.products.reduce(
    (sum, product) => sum + product.variations.filter((v) => v.stock_used > 0).length,
    0
  );
}

export function buildKitPerformanceRows(
  registrations: KitRegistrationInput[],
  kitRevenues: KitRevenueInput[],
  stockKitGroups: StockKitGroupInput[],
  kitCriticalCounts: Map<string, number>
): KitPerformanceRow[] {
  type MutableRow = Omit<KitPerformanceRow, "badges" | "participation_pct" | "avg_ticket"> & {
    badges: Set<KitPerformanceBadge>;
  };

  const rowsMap = new Map<string, MutableRow>();

  const ensureRow = (key: string, kitId: string, kitName: string): MutableRow => {
    const existing = rowsMap.get(key);
    if (existing) {
      if (!existing.kit_id.startsWith("name:") && kitId.startsWith("name:")) {
        // mantém kit_id real
      } else if (existing.kit_id.startsWith("name:") && !kitId.startsWith("name:")) {
        existing.kit_id = kitId;
      }
      if (kitName) existing.kit_name = kitName;
      return existing;
    }
    const row: MutableRow = {
      kit_id: kitId,
      kit_name: kitName,
      registration_count: 0,
      revenue: 0,
      paid_registration_count: 0,
      stock_units_consumed: 0,
      variations_with_consumption: 0,
      critical_stock_count: 0,
      badges: new Set(),
    };
    rowsMap.set(key, row);
    return row;
  };

  let totalRegistrationsWithKit = 0;

  for (const reg of registrations) {
    if (isTransferredOutShell(reg)) continue;
    if (!reg.kit_id && !reg.kit_name) continue;

    const kitName = reg.kit_name || reg.event_kits?.name || "Kit";
    const key = kitRowKey(reg.kit_id, kitName);
    const kitId = reg.kit_id || key;
    const row = ensureRow(key, kitId, kitName);
    row.registration_count += 1;
    totalRegistrationsWithKit += 1;
  }

  for (const kr of kitRevenues) {
    const key = kitRowKey(null, kr.kitName);
    const row = ensureRow(key, key, kr.kitName);
    row.revenue = kr.revenue;
    row.paid_registration_count = kr.count;
  }

  for (const stockKit of stockKitGroups) {
    const key = kitRowKey(stockKit.kit_id, stockKit.kit_name);
    const row = ensureRow(key, stockKit.kit_id, stockKit.kit_name);
    row.stock_units_consumed = stockKit.total_consumed;
    row.variations_with_consumption = countVariationsWithConsumption(stockKit);
    row.critical_stock_count = kitCriticalCounts.get(stockKit.kit_id) ?? 0;
  }

  for (const [kitId, count] of kitCriticalCounts.entries()) {
    if (stockKitGroups.some((k) => k.kit_id === kitId)) continue;
    const row = ensureRow(kitId, kitId, "Kit");
    row.critical_stock_count = count;
  }

  const rows = Array.from(rowsMap.values()).map((row) => ({
    ...row,
    participation_pct:
      totalRegistrationsWithKit > 0
        ? Math.round((row.registration_count / totalRegistrationsWithKit) * 1000) / 10
        : 0,
    avg_ticket:
      row.paid_registration_count > 0 ? row.revenue / row.paid_registration_count : null,
    badges: [] as KitPerformanceBadge[],
  }));

  if (rows.length === 0) return [];

  const maxRegistrations = Math.max(...rows.map((r) => r.registration_count));
  const maxRevenue = Math.max(...rows.map((r) => r.revenue));
  const maxStock = Math.max(...rows.map((r) => r.stock_units_consumed));

  for (const row of rows) {
    const badges: KitPerformanceBadge[] = [];
    if (row.registration_count > 0 && row.registration_count === maxRegistrations) {
      badges.push("best_seller");
    }
    if (row.revenue > 0 && row.revenue === maxRevenue) {
      badges.push("top_revenue");
    }
    if (row.stock_units_consumed > 0 && row.stock_units_consumed === maxStock) {
      badges.push("top_stock_consumption");
    }
    if (row.critical_stock_count > 0) {
      badges.push("critical_stock");
    }
    row.badges = badges;
  }

  return rows.sort((a, b) => {
    if (b.registration_count !== a.registration_count) {
      return b.registration_count - a.registration_count;
    }
    if (b.revenue !== a.revenue) return b.revenue - a.revenue;
    return a.kit_name.localeCompare(b.kit_name, "pt-BR");
  });
}

const BADGE_CONFIG: Record<
  KitPerformanceBadge,
  { label: string; className: string }
> = {
  best_seller: { label: "Mais Vendido", className: "bg-amber-100 text-amber-800" },
  top_revenue: { label: "Maior Receita", className: "bg-green-100 text-green-800" },
  top_stock_consumption: {
    label: "Maior Consumo de Estoque",
    className: "bg-orange-100 text-orange-800",
  },
  critical_stock: { label: "Estoque Crítico", className: "bg-red-100 text-red-800" },
};

const MEDAL = ["🥇", "🥈", "🥉"] as const;

function KitPerformanceBadges({ badges }: { badges: KitPerformanceBadge[] }) {
  if (badges.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map((badge) => (
        <Badge
          key={badge}
          variant="outline"
          className={cn("border-0 text-xs font-semibold", BADGE_CONFIG[badge].className)}
        >
          {BADGE_CONFIG[badge].label}
        </Badge>
      ))}
    </div>
  );
}

export interface EventKitPerformanceSectionProps {
  registrations: KitRegistrationInput[];
  kitRevenues: KitRevenueInput[];
  stockKitGroups: StockKitGroupInput[];
  kitCriticalCounts: Map<string, number>;
  formatCurrency: (value: number) => string;
}

export function EventKitPerformanceSection({
  registrations,
  kitRevenues,
  stockKitGroups,
  kitCriticalCounts,
  formatCurrency,
}: EventKitPerformanceSectionProps) {
  const kitPerformanceRows = useMemo(
    () =>
      buildKitPerformanceRows(
        registrations,
        kitRevenues,
        stockKitGroups,
        kitCriticalCounts
      ),
    [registrations, kitRevenues, stockKitGroups, kitCriticalCounts]
  );

  if (kitPerformanceRows.length === 0) return null;

  const topThree = kitPerformanceRows.slice(0, 3);

  return (
    <Card className="bg-white rounded-2xl p-6 shadow-sm border-0 mb-6">
      <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
        <Trophy className="h-5 w-5 text-amber-500" />
        Performance dos Kits
      </h3>

      {topThree.length > 0 && (
        <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {topThree.map((kit, index) => (
            <div
              key={kit.kit_id}
              className={cn(
                "rounded-xl border px-4 py-3",
                index === 0 ? "border-amber-200 bg-amber-50/60" : "border-gray-100 bg-gray-50/50"
              )}
            >
              <p className="text-2xl leading-none mb-1">{MEDAL[index] ?? "🏅"}</p>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">
                {index === 0
                  ? "Kit mais vendido"
                  : index === 1
                    ? "Segundo mais vendido"
                    : "Terceiro mais vendido"}
              </p>
              <p className="font-semibold text-gray-900 truncate">{kit.kit_name}</p>
              <p className="text-sm text-gray-600 tabular-nums mt-1">
                {kit.registration_count} inscrições
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {kitPerformanceRows.map((kit) => (
          <div
            key={kit.kit_id}
            className={cn(
              "rounded-xl border overflow-hidden",
              kit.badges.includes("critical_stock")
                ? "border-red-200 bg-red-50/20"
                : "border-gray-100 bg-gray-50/30"
            )}
          >
            <div className="px-4 py-4 md:px-5 bg-white border-b border-gray-100">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-2">
                  <h4 className="text-base font-semibold text-gray-900">{kit.kit_name}</h4>
                  <KitPerformanceBadges badges={kit.badges} />
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                  <span className="flex items-center gap-1.5 text-gray-600">
                    <Users className="h-3.5 w-3.5 shrink-0" />
                    Inscrições:{" "}
                    <span className="font-semibold text-gray-900 tabular-nums">
                      {kit.registration_count}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 text-gray-600">
                    <TrendingUp className="h-3.5 w-3.5 shrink-0" />
                    Participação:{" "}
                    <span className="font-semibold text-primary tabular-nums">
                      {kit.participation_pct.toFixed(1)}%
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <div className="px-4 py-4 md:px-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                  Receita Gerada
                </p>
                <p className="font-semibold text-green-600 tabular-nums flex items-center gap-1">
                  <DollarSign className="h-3.5 w-3.5 shrink-0" />
                  {kit.revenue > 0 ? formatCurrency(kit.revenue) || "—" : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                  Produtos Consumidos
                </p>
                <p className="font-semibold text-orange-600 tabular-nums flex items-center gap-1">
                  <Package className="h-3.5 w-3.5 shrink-0" />
                  {kit.stock_units_consumed}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                  Variações Consumidas
                </p>
                <p className="font-semibold text-gray-900 tabular-nums">
                  {kit.variations_with_consumption}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                  Estoque Crítico
                </p>
                <p
                  className={cn(
                    "font-semibold tabular-nums",
                    kit.critical_stock_count > 0 ? "text-red-600" : "text-gray-900"
                  )}
                >
                  {kit.critical_stock_count}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                  Inscrições Pagas
                </p>
                <p className="font-semibold text-gray-900 tabular-nums">
                  {kit.paid_registration_count}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
