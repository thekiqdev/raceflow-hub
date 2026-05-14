import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowLeft,
  Download,
  Loader2,
  Plus,
  Search,
  CheckCircle,
  Ban,
  Trash2,
  MoreHorizontal,
  Eye,
  Pencil,
  X,
  ClipboardList,
  ArrowRightLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/useDebounce";
import { getEventById, type Event } from "@/lib/api/events";
import { getModalities, type Modality } from "@/lib/api/modalities";
import { getCategories, type Category } from "@/lib/api/categories";
import { getEventKits, type EventKit } from "@/lib/api/eventKits";
import {
  getRegistrations,
  exportRegistrations,
  getAuditMissingKitProductSelections,
  updateRegistration,
  cancelRegistration,
  deleteRegistration,
  type Registration,
  type GetRegistrationsFilters,
  type PaginatedRegistrationsData,
  type RegistrationSegmentTotals,
  type MissingKitProductSelectionAuditPayload,
} from "@/lib/api/registrations";
import { RegisterAthleteStaffDialog } from "@/components/registration/RegisterAthleteStaffDialog";
import { maskCpf } from "@/lib/utils/masks";
import { getRegistrationListTypeBadge } from "@/lib/utils/registrationOrigin";
import { getAdminPath, getOrganizerPath } from "@/lib/utils/navigation";
import { EventRegistrationDetailSheet } from "./EventRegistrationDetailSheet";
import { TransferRegistrationAdminDialog, canAdminTransferRegistration } from "@/components/admin/TransferRegistrationAdminDialog";
import { cn } from "@/lib/utils";

export type EventRegistrationsRolePage = "admin" | "organizer";

export interface EventRegistrationsPanelProps {
  eventId: string;
  rolePage: EventRegistrationsRolePage;
  backPath: string;
}

const EMPTY_SEGMENT_TOTALS: RegistrationSegmentTotals = {
  total: 0,
  paid: 0,
  pending: 0,
  partially_paid: 0,
  courtesy: 0,
  cancelled: 0,
  refunded: 0,
  transferred: 0,
};

type SegmentCardKey =
  | "total"
  | "paid"
  | "pending"
  | "partially_paid"
  | "courtesy"
  | "cancelled"
  | "refunded"
  | "transferred";

function formatMoney(n: number): string {
  return `R$ ${Number(n || 0).toFixed(2).replace(".", ",")}`;
}

function paymentStatusLabel(ps: string | undefined): string {
  const m: Record<string, string> = {
    paid: "Pago",
    pending: "Pendente",
    partially_paid: "Parcial",
    refunded: "Reembolsado",
    failed: "Falhou",
    convidado: "Convidado",
  };
  return m[ps || ""] || ps || "—";
}

function registrationStatusLabel(st: string | undefined): string {
  const m: Record<string, string> = {
    confirmed: "Confirmada",
    pending: "Pendente",
    cancelled: "Cancelada",
    refund_requested: "Reembolso solicitado",
    refunded: "Reembolsada",
    transferred: "Transferida",
  };
  return m[st || ""] || st || "—";
}

function deriveActiveSegment(
  statusFilter: string,
  paymentFilter: string,
  originFilter: string
): SegmentCardKey | null {
  if (statusFilter === "all" && paymentFilter === "all" && originFilter === "all") return "total";
  if (statusFilter === "cancelled" && paymentFilter === "all" && originFilter === "all") return "cancelled";
  if (statusFilter === "transferred" && paymentFilter === "all" && originFilter === "all") return "transferred";
  if (paymentFilter === "refunded" && statusFilter === "all" && originFilter === "all") return "refunded";
  if (originFilter === "courtesy" && statusFilter === "all" && paymentFilter === "all") return "courtesy";
  if (paymentFilter === "paid" && statusFilter === "all" && originFilter === "all") return "paid";
  if (paymentFilter === "pending" && statusFilter === "all" && originFilter === "all") return "pending";
  if (paymentFilter === "partially_paid" && statusFilter === "all" && originFilter === "all") return "partially_paid";
  return null;
}

export function EventRegistrationsPanel({ eventId, rolePage, backPath }: EventRegistrationsPanelProps) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [eventTitle, setEventTitle] = useState("");
  const [eventRecord, setEventRecord] = useState<Event | null>(null);
  const [modalities, setModalities] = useState<Modality[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [kits, setKits] = useState<EventKit[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 400);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [modalityFilter, setModalityFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [kitFilter, setKitFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [originFilter, setOriginFilter] = useState<string>("all");

  const [page, setPage] = useState(1);
  const pageSize = 50 as const;
  const [listData, setListData] = useState<PaginatedRegistrationsData | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRegistrationId, setDetailRegistrationId] = useState<string | null>(null);
  const [detailRefreshToken, setDetailRefreshToken] = useState(0);

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [registrationToTransfer, setRegistrationToTransfer] = useState<Registration | null>(null);

  const [kitAuditOpen, setKitAuditOpen] = useState(false);
  const [kitAuditLoading, setKitAuditLoading] = useState(false);
  const [kitAuditResult, setKitAuditResult] = useState<MissingKitProductSelectionAuditPayload | null>(null);

  const fullEditHref = rolePage === "admin" ? getAdminPath("registrations") : getOrganizerPath("registrations");

  const apiFilters: GetRegistrationsFilters = useMemo(() => {
    const f: GetRegistrationsFilters = { event_id: eventId };
    if (debouncedSearch.trim()) f.search = debouncedSearch.trim();
    if (statusFilter !== "all") f.status = statusFilter;
    if (paymentFilter !== "all") f.payment_status = paymentFilter;
    if (modalityFilter !== "all") f.modality_id = modalityFilter;
    if (categoryFilter !== "all") f.category_id = categoryFilter;
    if (kitFilter !== "all") f.kit_id = kitFilter;
    if (dateFrom) f.created_at_from = dateFrom;
    if (dateTo) f.created_at_to = dateTo;
    if (originFilter !== "all") f.registration_kind = originFilter;
    return f;
  }, [
    eventId,
    debouncedSearch,
    statusFilter,
    paymentFilter,
    modalityFilter,
    categoryFilter,
    kitFilter,
    dateFrom,
    dateTo,
    originFilter,
  ]);

  const loadMeta = useCallback(async () => {
    if (!eventId) return;
    setLoadingMeta(true);
    try {
      const [evRes, modRes, catRes, kitRes] = await Promise.all([
        getEventById(eventId),
        getModalities(eventId).catch(() => ({ success: false as const, data: [] as Modality[] })),
        getCategories(eventId).catch(() => ({ success: false as const, data: [] as Category[] })),
        getEventKits(eventId).catch(() => ({ success: false as const, data: [] as EventKit[] })),
      ]);
      if (evRes.success && evRes.data) {
        setEventTitle(evRes.data.title || "");
        setEventRecord(evRes.data);
      }
      if (modRes.success && modRes.data) {
        setModalities([...modRes.data].sort((a, b) => a.display_order - b.display_order));
      } else setModalities([]);
      if (catRes.success && catRes.data) setCategories(catRes.data);
      else setCategories([]);
      if (kitRes.success && kitRes.data) setKits(kitRes.data);
      else setKits([]);
    } catch (e) {
      console.error(e);
      toast({ title: "Erro", description: "Não foi possível carregar dados do evento.", variant: "destructive" });
    } finally {
      setLoadingMeta(false);
    }
  }, [eventId, toast]);

  const loadList = useCallback(async () => {
    if (!eventId) return;
    setLoadingList(true);
    try {
      const res = await getRegistrations(apiFilters, { page, page_size: pageSize });
      if (res.success && res.data && "items" in res.data) {
        setListData(res.data);
      } else {
        setListData(null);
        toast({
          title: "Erro",
          description: (res as { error?: string }).error || "Falha ao carregar inscrições",
          variant: "destructive",
        });
      }
    } catch (e: unknown) {
      console.error(e);
      setListData(null);
      toast({
        title: "Erro",
        description: e instanceof Error ? e.message : "Falha ao carregar inscrições",
        variant: "destructive",
      });
    } finally {
      setLoadingList(false);
    }
  }, [apiFilters, eventId, page, toast]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const safeName = (eventTitle || "evento").replace(/[^\w\-]+/g, "_").slice(0, 60);
      await exportRegistrations(apiFilters, `inscricoes_${safeName}_${new Date().toISOString().split("T")[0]}.csv`);
      toast({ title: "Exportação concluída", description: "O arquivo CSV foi baixado com os filtros atuais." });
    } catch (e: unknown) {
      toast({
        title: "Erro ao exportar",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  const runKitSelectionAudit = async () => {
    setKitAuditLoading(true);
    setKitAuditResult(null);
    try {
      const res = await getAuditMissingKitProductSelections({ event_id: eventId, limit: 500 });
      if (res.success && res.data) {
        setKitAuditResult(res.data);
        setKitAuditOpen(true);
        toast({
          title: "Auditoria concluída",
          description:
            res.data.count === 0
              ? "Nenhuma ocorrência com os critérios atuais neste evento."
              : `${res.data.count} inscrição(ões) listadas no diálogo (limite da consulta: 500).`,
        });
      } else {
        toast({
          title: "Auditoria indisponível",
          description: res.error || res.message || "Sem permissão ou erro no servidor.",
          variant: "destructive",
        });
      }
    } catch (e: unknown) {
      toast({
        title: "Erro",
        description: e instanceof Error ? e.message : "Falha ao executar auditoria.",
        variant: "destructive",
      });
    } finally {
      setKitAuditLoading(false);
    }
  };

  const handleConfirm = async (id: string) => {
    if (!confirm("Deseja confirmar esta inscrição e o pagamento manualmente?")) return;
    setConfirmingId(id);
    try {
      const res = await updateRegistration(id, { status: "confirmed", payment_status: "paid" });
      if (res.success) {
        toast({ title: "Inscrição confirmada" });
        setDetailRefreshToken((t) => t + 1);
        void loadList();
      } else {
        toast({ title: "Erro", description: res.error || "Falha ao confirmar", variant: "destructive" });
      }
    } catch (e: unknown) {
      toast({
        title: "Erro",
        description: e instanceof Error ? e.message : "Erro",
        variant: "destructive",
      });
    } finally {
      setConfirmingId(null);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm("Deseja cancelar esta inscrição?")) return;
    setCancellingId(id);
    try {
      const res = await cancelRegistration(id);
      if (res.success) {
        toast({ title: "Inscrição cancelada" });
        setDetailRefreshToken((t) => t + 1);
        void loadList();
      } else {
        toast({ title: "Erro", description: res.error || "Falha ao cancelar", variant: "destructive" });
      }
    } catch (e: unknown) {
      toast({
        title: "Erro",
        description: e instanceof Error ? e.message : "Erro",
        variant: "destructive",
      });
    } finally {
      setCancellingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (rolePage !== "admin") return;
    if (!confirm("ATENÇÃO: excluir permanentemente esta inscrição?")) return;
    if (!confirm("Confirma exclusão definitiva? Esta ação não pode ser desfeita.")) return;
    setDeletingId(id);
    try {
      const res = await deleteRegistration(id);
      if (res.success) {
        toast({ title: "Inscrição excluída" });
        setDetailOpen(false);
        setDetailRegistrationId(null);
        setDetailRefreshToken((t) => t + 1);
        void loadList();
      } else {
        toast({ title: "Erro", description: res.error || "Falha ao excluir", variant: "destructive" });
      }
    } catch (e: unknown) {
      toast({
        title: "Erro",
        description: e instanceof Error ? e.message : "Erro",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const openDetail = (id: string) => {
    setDetailRegistrationId(id);
    setDetailOpen(true);
  };

  const clearStructuralFilters = () => {
    setSearchInput("");
    setModalityFilter("all");
    setCategoryFilter("all");
    setKitFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const clearSegmentFilters = () => {
    setStatusFilter("all");
    setPaymentFilter("all");
    setOriginFilter("all");
  };

  const clearAllFilters = () => {
    clearStructuralFilters();
    clearSegmentFilters();
  };

  const applySegmentCard = (key: SegmentCardKey) => {
    if (key === "total") {
      clearSegmentFilters();
      setPage(1);
      return;
    }
    setStatusFilter("all");
    setPaymentFilter("all");
    setOriginFilter("all");
    if (key === "paid") setPaymentFilter("paid");
    else if (key === "pending") setPaymentFilter("pending");
    else if (key === "partially_paid") setPaymentFilter("partially_paid");
    else if (key === "courtesy") setOriginFilter("courtesy");
    else if (key === "cancelled") setStatusFilter("cancelled");
    else if (key === "refunded") setPaymentFilter("refunded");
    else if (key === "transferred") setStatusFilter("transferred");
    setPage(1);
  };

  const segmentTotals = listData?.segment_totals ?? EMPTY_SEGMENT_TOTALS;
  const activeSegment = deriveActiveSegment(statusFilter, paymentFilter, originFilter);

  const filterChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];
    if (debouncedSearch.trim()) {
      chips.push({
        key: "search",
        label: `Busca: ${debouncedSearch.trim()}`,
        onRemove: () => setSearchInput(""),
      });
    }
    if (statusFilter !== "all") {
      chips.push({
        key: "status",
        label: `Inscrição: ${registrationStatusLabel(statusFilter)}`,
        onRemove: () => setStatusFilter("all"),
      });
    }
    if (paymentFilter !== "all") {
      chips.push({
        key: "payment",
        label: `Pagamento: ${paymentStatusLabel(paymentFilter)}`,
        onRemove: () => setPaymentFilter("all"),
      });
    }
    if (originFilter !== "all") {
      const originLabels: Record<string, string> = {
        commercial: "Comercial",
        courtesy: "Cortesia / convidado",
        leader_coupon: "Cupom de líder",
      };
      chips.push({
        key: "origin",
        label: `Origem: ${originLabels[originFilter] || originFilter}`,
        onRemove: () => setOriginFilter("all"),
      });
    }
    if (modalityFilter !== "all") {
      const m = modalities.find((x) => x.id === modalityFilter);
      chips.push({
        key: "modality",
        label: `Modalidade: ${m?.name || modalityFilter}`,
        onRemove: () => setModalityFilter("all"),
      });
    }
    if (categoryFilter !== "all") {
      const c = categories.find((x) => x.id === categoryFilter);
      chips.push({
        key: "category",
        label: `Categoria: ${c?.name || categoryFilter}`,
        onRemove: () => setCategoryFilter("all"),
      });
    }
    if (kitFilter !== "all") {
      const k = kits.find((x) => x.id === kitFilter);
      chips.push({
        key: "kit",
        label: `Kit: ${k?.name || kitFilter}`,
        onRemove: () => setKitFilter("all"),
      });
    }
    if (dateFrom) {
      chips.push({
        key: "from",
        label: `De: ${dateFrom}`,
        onRemove: () => setDateFrom(""),
      });
    }
    if (dateTo) {
      chips.push({
        key: "to",
        label: `Até: ${dateTo}`,
        onRemove: () => setDateTo(""),
      });
    }
    return chips;
  }, [
    debouncedSearch,
    statusFilter,
    paymentFilter,
    originFilter,
    modalityFilter,
    categoryFilter,
    kitFilter,
    dateFrom,
    dateTo,
    modalities,
    categories,
    kits,
  ]);

  const items = listData?.items ?? [];
  const total = listData?.total ?? 0;
  const totalPages = listData?.total_pages ?? 0;

  const segmentCards: {
    key: SegmentCardKey;
    label: string;
    count: number;
    sub?: string;
  }[] = [
    { key: "total", label: "Total", count: segmentTotals.total, sub: "no recorte estrutural" },
    { key: "paid", label: "Pagas", count: segmentTotals.paid },
    { key: "pending", label: "Pendentes", count: segmentTotals.pending },
    { key: "partially_paid", label: "Parciais", count: segmentTotals.partially_paid },
    { key: "courtesy", label: "Cortesias", count: segmentTotals.courtesy, sub: "convites / free_bonus" },
    { key: "cancelled", label: "Canceladas", count: segmentTotals.cancelled },
    { key: "refunded", label: "Reembolsadas", count: segmentTotals.refunded },
    { key: "transferred", label: "Transferidas", count: segmentTotals.transferred },
  ];

  if (loadingMeta && !eventTitle) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1400px] space-y-6">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <Button variant="ghost" size="sm" className="w-fit -ml-2 text-muted-foreground" onClick={() => navigate(backPath)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Inscrições do evento</h1>
          <p className="text-muted-foreground">{eventTitle || "—"}</p>
          <p className="break-words text-sm text-muted-foreground">
            Listagem operacional com filtros e exportação. Resultados no filtro completo:{" "}
            <span className="font-medium text-foreground">{total}</span>
            {listData?.summary != null && (
              <span className="ml-2">
                (pagas: {listData.summary.confirmed_payments} · pendentes: {listData.summary.pending_payments})
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {rolePage === "admin" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void runKitSelectionAudit()}
              disabled={kitAuditLoading}
              title="Somente leitura: kit com produto variável e sem linhas em registration_product_selections"
            >
              {kitAuditLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ClipboardList className="mr-2 h-4 w-4" />
              )}
              Auditoria kit
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => void handleExport()} disabled={exporting}>
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Exportar CSV
          </Button>
          <Button size="sm" onClick={() => setRegisterOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Inscrever atleta
          </Button>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
        {segmentCards.map((c) => {
          const isActive = activeSegment === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => applySegmentCard(c.key)}
              className={cn(
                "min-w-0 overflow-hidden rounded-xl border bg-card p-3 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4",
                isActive && "border-primary ring-1 ring-primary/30 bg-primary/5"
              )}
            >
              <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{c.count}</p>
              {c.sub && (
                <p className="mt-0.5 break-words text-[10px] leading-tight text-muted-foreground">{c.sub}</p>
              )}
            </button>
          );
        })}
      </div>
      <p className="-mt-2 break-words text-xs text-muted-foreground">
        Os números dos cards refletem o recorte estrutural (busca, modalidade, categoria, kit, período), sem o filtro de
        status/pagamento/tipo — útil para atalhos operacionais.
      </p>

      <Card className="min-w-0">
        <CardHeader className="pb-3">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">Filtros</CardTitle>
              <CardDescription>Refinam a tabela e o CSV exportado.</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={clearAllFilters}>
              Limpar filtros
            </Button>
          </div>
        </CardHeader>
        <CardContent className="min-w-0 space-y-4">
          <div className="min-w-0 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Busca principal</p>
            <div className="relative max-w-2xl min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-11 text-base"
                placeholder="Nome, CPF ou e-mail…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
          </div>

          {filterChips.length > 0 && (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Filtros ativos:</span>
              {filterChips.map((ch) => (
                <Badge key={ch.key} variant="secondary" className="gap-1 pr-1 font-normal">
                  {ch.label}
                  <button
                    type="button"
                    className="rounded-full p-0.5 hover:bg-background/80"
                    aria-label={`Remover ${ch.label}`}
                    onClick={ch.onRemove}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          <div className="min-w-0 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filtros operacionais</p>
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <div className="min-w-0 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Status da inscrição</p>
                <Select
                  value={statusFilter}
                  onValueChange={(v) => {
                    setStatusFilter(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="confirmed">Confirmada</SelectItem>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="cancelled">Cancelada</SelectItem>
                    <SelectItem value="refund_requested">Reembolso solicitado</SelectItem>
                    <SelectItem value="refunded">Reembolsada</SelectItem>
                    <SelectItem value="transferred">Transferida</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Status do pagamento</p>
                <Select
                  value={paymentFilter}
                  onValueChange={(v) => {
                    setPaymentFilter(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="paid">Pago</SelectItem>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="partially_paid">Parcial</SelectItem>
                    <SelectItem value="convidado">Convidado</SelectItem>
                    <SelectItem value="refunded">Reembolsado</SelectItem>
                    <SelectItem value="failed">Falhou</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Tipo / origem</p>
                <Select
                  value={originFilter}
                  onValueChange={(v) => {
                    setOriginFilter(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="commercial">Paga (fluxo comercial)</SelectItem>
                    <SelectItem value="courtesy">Cortesia / convidado</SelectItem>
                    <SelectItem value="leader_coupon">Cupom de líder</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Modalidade</p>
                <Select
                  value={modalityFilter}
                  onValueChange={(v) => {
                    setModalityFilter(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {modalities.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name} {m.distance ? `— ${m.distance}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Categoria</p>
                <Select
                  value={categoryFilter}
                  onValueChange={(v) => {
                    setCategoryFilter(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Kit</p>
                <Select
                  value={kitFilter}
                  onValueChange={(v) => {
                    setKitFilter(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {kits.map((k) => (
                      <SelectItem key={k.id} value={k.id}>
                        {k.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Inscrito a partir de</p>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <div className="min-w-0 space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Inscrito até</p>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardContent className="min-w-0 p-0">
          {loadingList ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma inscrição com os filtros atuais.</p>
          ) : (
            <div className="min-w-0 max-w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[120px]">Nome</TableHead>
                    <TableHead className="min-w-[104px] whitespace-nowrap">CPF</TableHead>
                    <TableHead className="min-w-[140px]">E-mail</TableHead>
                    <TableHead className="whitespace-nowrap">Data</TableHead>
                    <TableHead className="whitespace-nowrap">Valor</TableHead>
                    <TableHead className="whitespace-nowrap">Inscrição</TableHead>
                    <TableHead className="whitespace-nowrap">Pagamento</TableHead>
                    <TableHead className="min-w-[108px]">Tipo</TableHead>
                    <TableHead className="min-w-[152px]">Mod. / cat. / kit</TableHead>
                    <TableHead className="w-[52px] text-right pr-2">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((reg: Registration) => {
                    const typeBadge = getRegistrationListTypeBadge(reg);
                    let created = "—";
                    if (reg.created_at) {
                      try {
                        created = format(parseISO(reg.created_at), "dd/MM/yy HH:mm", { locale: ptBR });
                      } catch {
                        created = reg.created_at;
                      }
                    }
                    return (
                      <TableRow
                        key={reg.id}
                        className={cn("text-sm cursor-pointer hover:bg-muted/60")}
                        onClick={() => openDetail(reg.id)}
                      >
                        <TableCell className="font-medium max-w-[200px]">
                          <span className="line-clamp-2" title={reg.runner_name || ""}>
                            {reg.runner_name || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {reg.runner_cpf ? maskCpf(reg.runner_cpf) : "—"}
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <span className="line-clamp-2 text-muted-foreground" title={reg.runner_email || ""}>
                            {reg.runner_email || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground text-xs">{created}</TableCell>
                        <TableCell className="whitespace-nowrap font-medium">{formatMoney(Number(reg.total_amount))}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal">
                            {registrationStatusLabel(reg.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={reg.payment_status === "paid" ? "default" : "secondary"}
                            className="font-normal"
                          >
                            {paymentStatusLabel(reg.payment_status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("font-normal border", typeBadge.className)} title={typeBadge.hint}>
                            {typeBadge.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground align-top">
                          <div className="space-y-0.5 max-w-[220px]">
                            <div className="truncate" title={reg.modality_name || ""}>
                              {reg.modality_name || "—"}
                            </div>
                            <div className="truncate font-medium text-foreground/90" title={reg.category_name || ""}>
                              {reg.category_name || "—"}
                            </div>
                            <div className="truncate" title={reg.kit_name || ""}>
                              {reg.kit_name || "—"}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right p-1" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="Ações">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                onClick={() => {
                                  openDetail(reg.id);
                                }}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                Ver detalhes
                              </DropdownMenuItem>
                              {rolePage === "admin" && canAdminTransferRegistration(reg) && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setRegistrationToTransfer(reg);
                                    setTransferDialogOpen(true);
                                  }}
                                >
                                  <ArrowRightLeft className="mr-2 h-4 w-4" />
                                  Transferir inscrição
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => {
                                  openDetail(reg.id);
                                }}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                Editar no painel
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  navigate(fullEditHref);
                                }}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                Central de inscrições
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {reg.status !== "confirmed" && (
                                <DropdownMenuItem
                                  disabled={confirmingId === reg.id}
                                  onClick={() => void handleConfirm(reg.id)}
                                >
                                  <CheckCircle className="mr-2 h-4 w-4" />
                                  Confirmar + pago
                                </DropdownMenuItem>
                              )}
                              {reg.status !== "cancelled" && (
                                <DropdownMenuItem
                                  disabled={cancellingId === reg.id}
                                  onClick={() => void handleCancel(reg.id)}
                                  className="text-orange-600 focus:text-orange-600"
                                >
                                  <Ban className="mr-2 h-4 w-4" />
                                  Cancelar
                                </DropdownMenuItem>
                              )}
                              {rolePage === "admin" && (
                                <DropdownMenuItem
                                  disabled={deletingId === reg.id}
                                  onClick={() => void handleDelete(reg.id)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Excluir
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Página {page} de {totalPages}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <TransferRegistrationAdminDialog
        open={transferDialogOpen}
        onOpenChange={(open) => {
          setTransferDialogOpen(open);
          if (!open) setRegistrationToTransfer(null);
        }}
        registrationId={registrationToTransfer?.id ?? null}
        subtitle={
          registrationToTransfer
            ? `${registrationToTransfer.runner_name || "—"} • ${registrationToTransfer.confirmation_code || registrationToTransfer.id}`
            : undefined
        }
        onSuccess={() => {
          setDetailRefreshToken((t) => t + 1);
          void loadList();
        }}
      />

      <RegisterAthleteStaffDialog
        mode={rolePage === "admin" ? "super_admin" : "organizer"}
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        events={eventRecord ? [eventRecord] : []}
        lockedEventId={eventId}
        onSuccess={() => {
          setDetailRefreshToken((t) => t + 1);
          void loadList();
        }}
      />

      <EventRegistrationDetailSheet
        open={detailOpen}
        onOpenChange={(o) => {
          setDetailOpen(o);
          if (!o) setDetailRegistrationId(null);
        }}
        registrationId={detailRegistrationId}
        eventId={eventId}
        rolePage={rolePage}
        fullEditHref={fullEditHref}
        onRefreshList={() => {
          setDetailRefreshToken((t) => t + 1);
          void loadList();
        }}
        onConfirmRegistration={(id) => void handleConfirm(id)}
        onCancelRegistration={(id) => void handleCancel(id)}
        onDeleteRegistration={rolePage === "admin" ? (id) => void handleDelete(id) : undefined}
        confirmingId={confirmingId}
        cancellingId={cancellingId}
        deletingId={deletingId}
        detailRefreshToken={detailRefreshToken}
      />

      <Dialog open={kitAuditOpen} onOpenChange={setKitAuditOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle>Auditoria: seleções de produto ausentes</DialogTitle>
            <DialogDescription className="text-left text-xs sm:text-sm whitespace-pre-wrap">
              {kitAuditResult?.criteria ?? ""}
            </DialogDescription>
          </DialogHeader>
          {kitAuditResult != null && (
            <p className="text-sm">
              <span className="text-muted-foreground">Ocorrências retornadas: </span>
              <span className="font-medium tabular-nums">{kitAuditResult.count}</span>
            </p>
          )}
          <div className="min-h-0 flex-1 overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Inscrição</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Corredor</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Criada em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(kitAuditResult?.items ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground text-sm">
                      Nenhuma linha (ou auditoria ainda não executada).
                    </TableCell>
                  </TableRow>
                ) : (
                  kitAuditResult!.items.map((row) => (
                    <TableRow key={row.registration_id}>
                      <TableCell className="font-mono text-xs">{row.registration_id}</TableCell>
                      <TableCell>{row.status}</TableCell>
                      <TableCell>{row.runner_name ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{row.confirmation_code ?? "—"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{row.created_at}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
