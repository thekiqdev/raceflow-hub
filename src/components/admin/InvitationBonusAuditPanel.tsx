import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  FileSearch,
  Loader2,
  Download,
  CheckCircle2,
  ChevronsUpDown,
  CalendarDays,
  Building2,
  Users,
  Ticket,
  Gift,
  Mail,
  ChevronDown,
  Send,
} from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getEvents, type Event } from "@/lib/api/events";
import {
  getInvitationBonusAuditContext,
  runInvitationBonusSimulator,
  runInvitationBonusReconciliation,
  runMissingInvitationDeliveryApi,
  newAssistedIdempotencyKey,
  type InvitationBonusAuditPayload,
  type InvitationBonusReconciliationPayload,
  type MissingInvitationDeliveryPayload,
  type InvitationBonusAuditContextResult,
  type AuditContextLinkType,
} from "@/lib/api/invitationBonusAudit";

function formatEventDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
    return format(d, "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return "—";
  }
}

function statusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  const map: Record<string, string> = {
    draft: "Rascunho",
    published: "Publicado",
    ongoing: "Em andamento",
    finished: "Encerrado",
    cancelled: "Cancelado",
  };
  return map[status] || status;
}

function regStatusLabel(s: string | null | undefined): string {
  if (!s) return "—";
  const map: Record<string, string> = {
    not_open: "Não aberta",
    open: "Aberta",
    closed: "Encerrada",
  };
  return map[s] || s;
}

function linkTypeBadge(t: AuditContextLinkType) {
  const cfg: Record<AuditContextLinkType, { label: string; className: string }> = {
    cupom: { label: "Cupom", className: "bg-amber-500/15 text-amber-900 dark:text-amber-100 border-amber-500/30" },
    comissão: { label: "Comissão", className: "bg-blue-500/15 text-blue-900 dark:text-blue-100 border-blue-500/30" },
    convite: { label: "Convite", className: "bg-emerald-500/15 text-emerald-900 dark:text-emerald-100 border-emerald-500/30" },
  };
  const c = cfg[t];
  return (
    <Badge key={t} variant="outline" className={cn("text-xs font-normal", c.className)}>
      {c.label}
    </Badge>
  );
}

const LEADER_ALL = "__all__";

function leaderNameFromContext(
  leaderId: string,
  context: InvitationBonusAuditContextResult | null
): string {
  const leader = context?.leaders?.find((l) => l.leader_id === leaderId);
  return leader?.leader_name || leader?.referral_code || leaderId;
}

export function InvitationBonusAuditPanel() {
  const [eventOpen, setEventOpen] = useState(false);
  const [eventSearch, setEventSearch] = useState("");
  const [eventsLoading, setEventsLoading] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  const [context, setContext] = useState<InvitationBonusAuditContextResult | null>(null);
  const [contextLoading, setContextLoading] = useState(false);

  const [leaderScope, setLeaderScope] = useState<string>(LEADER_ALL);

  const [isAuditRunning, setIsAuditRunning] = useState(false);
  const [auditPayload, setAuditPayload] = useState<InvitationBonusAuditPayload | null>(null);
  const [showReconciliation, setShowReconciliation] = useState(false);
  const [reconcileLeaderScope, setReconcileLeaderScope] = useState<string>(LEADER_ALL);
  const [isReconciliationRunning, setIsReconciliationRunning] = useState(false);
  const [reconciliationResult, setReconciliationResult] = useState<InvitationBonusReconciliationPayload | null>(null);

  const [showMissingDelivery, setShowMissingDelivery] = useState(false);
  const [missingDeliveryLeaderScope, setMissingDeliveryLeaderScope] = useState<string>(LEADER_ALL);
  const [missingDeliveryResult, setMissingDeliveryResult] = useState<MissingInvitationDeliveryPayload | null>(null);
  const [isMissingDeliveryRunning, setIsMissingDeliveryRunning] = useState(false);

  const loadEvents = useCallback(async (search: string) => {
    setEventsLoading(true);
    const res = await getEvents({
      order_by_date: "desc",
      search: search.trim() || undefined,
    });
    setEventsLoading(false);
    if (res.success && res.data) {
      setEvents(res.data.slice(0, 100));
    } else {
      toast.error(res.error || "Não foi possível carregar eventos.");
      setEvents([]);
    }
  }, []);

  useEffect(() => {
    if (!eventOpen) return;
    const t = window.setTimeout(() => {
      void loadEvents(eventSearch);
    }, 280);
    return () => window.clearTimeout(t);
  }, [eventOpen, eventSearch, loadEvents]);

  const loadContext = useCallback(async (eventId: string) => {
    setContextLoading(true);
    setContext(null);
    const res = await getInvitationBonusAuditContext(eventId);
    setContextLoading(false);
    if (res.success && res.data) {
      setContext(res.data);
    } else {
      toast.error(res.error || res.message || "Falha ao carregar resumo do evento.");
    }
  }, []);

  const handlePickEvent = (ev: Event) => {
    setSelectedEvent(ev);
    setEventOpen(false);
    setLeaderScope(LEADER_ALL);
    setAuditPayload(null);
    setShowReconciliation(false);
    setReconcileLeaderScope(LEADER_ALL);
    setReconciliationResult(null);
    setShowMissingDelivery(false);
    setMissingDeliveryLeaderScope(LEADER_ALL);
    setMissingDeliveryResult(null);
    void loadContext(ev.id);
  };

  const handleClearEvent = () => {
    setSelectedEvent(null);
    setContext(null);
    setLeaderScope(LEADER_ALL);
    setAuditPayload(null);
    setShowReconciliation(false);
    setReconcileLeaderScope(LEADER_ALL);
    setReconciliationResult(null);
    setShowMissingDelivery(false);
    setMissingDeliveryLeaderScope(LEADER_ALL);
    setMissingDeliveryResult(null);
  };

  const handleRunAudit = async () => {
    if (!selectedEvent) {
      toast.error("Selecione um evento.");
      return;
    }
    setIsAuditRunning(true);
    setAuditPayload(null);
    const res = await runInvitationBonusSimulator({
      event_id: selectedEvent.id,
      leader_id: leaderScope === LEADER_ALL ? undefined : leaderScope,
    });
    setIsAuditRunning(false);
    if (res.success && res.data) {
      setAuditPayload(res.data);
      setShowReconciliation(false);
      setReconcileLeaderScope(leaderScope);
      setReconciliationResult(null);
      setMissingDeliveryLeaderScope(leaderScope);
      setMissingDeliveryResult(null);
      toast.success("Auditoria concluída (somente leitura).");
    } else {
      toast.error(res.error || res.message || "Falha ao executar auditoria.");
    }
  };

  const handleDownloadAuditMarkdown = () => {
    if (!auditPayload?.functional_report_markdown) return;
    const blob = new Blob([auditPayload.functional_report_markdown], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invitation-bonus-audit-${auditPayload.event_id}-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Relatório (.md) baixado.");
  };

  const handleDownloadAuditTechnicalJson = () => {
    if (!auditPayload?.technical_log) return;
    const blob = new Blob([JSON.stringify(auditPayload.technical_log, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invitation-bonus-audit-technical-${auditPayload.event_id}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Log técnico (.json) baixado.");
  };

  const handleRunReconciliationDryRun = async () => {
    if (!selectedEvent || !auditPayload) {
      toast.error("Execute a auditoria antes de iniciar a correção controlada.");
      return;
    }
    setIsReconciliationRunning(true);
    setReconciliationResult(null);
    const res = await runInvitationBonusReconciliation({
      event_id: selectedEvent.id,
      leader_id: reconcileLeaderScope === LEADER_ALL ? undefined : reconcileLeaderScope,
      mode: "dry_run",
      reason: "Reconciliação assistida dry_run — painel auditoria convites (Frente 2)",
      idempotency_key: newAssistedIdempotencyKey("reconcile-dry"),
    });
    setIsReconciliationRunning(false);
    if (res.success && res.data?.payload) {
      setReconciliationResult(res.data.payload);
      toast.success("Dry run da Frente 2 concluído.");
    } else if (res.success && res.data) {
      toast.error(
        res.data.command_result?.detail || "Resposta sem payload de reconciliação (ver logs / idempotência)."
      );
    } else {
      toast.error(res.error || res.message || "Falha no dry run da correção controlada.");
    }
  };

  const handleRunReconciliationApply = async () => {
    if (!selectedEvent || !reconciliationResult) {
      toast.error("Execute e revise o dry run antes do apply.");
      return;
    }
    if (!reconciliationResult.consistency_guard.can_apply) {
      toast.error("Apply bloqueado pelo guard de consistência.");
      return;
    }

    const confirm = window.confirm(
      "Confirma o apply (DELETE físico controlado) no contexto validado pelo dry_run? Essa ação remove registrations free_bonus elegíveis e cria backup obrigatório."
    );
    if (!confirm) {
      toast.error("Apply cancelado pelo usuário.");
      return;
    }

    setIsReconciliationRunning(true);
    const res = await runInvitationBonusReconciliation({
      event_id: selectedEvent.id,
      leader_id: reconcileLeaderScope === LEADER_ALL ? undefined : reconcileLeaderScope,
      mode: "apply",
      apply_confirmed: true,
      audit_snapshot_hash: reconciliationResult.audit_snapshot_hash,
      dry_run_hash: reconciliationResult.dry_run_hash,
      reason: "Reconciliação assistida apply — painel auditoria convites (Frente 2)",
      idempotency_key: newAssistedIdempotencyKey("reconcile-apply"),
    });
    setIsReconciliationRunning(false);
    if (res.success && res.data?.payload) {
      setReconciliationResult(res.data.payload);
      toast.success("Apply executado com segurança no contexto validado.");
    } else if (res.success && res.data) {
      toast.error(
        res.data.command_result?.detail || "Resposta sem payload de reconciliação após apply."
      );
    } else {
      toast.error(res.error || res.message || "Apply bloqueado/falhou.");
    }
  };

  const handleMissingDeliveryDryRun = async () => {
    if (!selectedEvent || !auditPayload) {
      toast.error("Execute a auditoria antes deste fluxo (evento + escopo auditado).");
      return;
    }
    setIsMissingDeliveryRunning(true);
    setMissingDeliveryResult(null);
    const res = await runMissingInvitationDeliveryApi({
      event_id: selectedEvent.id,
      leader_id: missingDeliveryLeaderScope === LEADER_ALL ? undefined : missingDeliveryLeaderScope,
      mode: "dry_run",
      reason: "Missing invitation delivery dry_run — painel auditoria (faltantes canônicos)",
      idempotency_key: newAssistedIdempotencyKey("missing-dry"),
    });
    setIsMissingDeliveryRunning(false);
    if (res.success && res.data?.payload) {
      setMissingDeliveryResult(res.data.payload);
      toast.success("Dry run — convites não entregues concluído.");
    } else if (res.success && res.data) {
      toast.error(
        res.data.command_result?.detail || "Resposta sem payload de missing delivery (idempotência ou guard)."
      );
    } else {
      toast.error(res.error || res.message || "Falha no dry run.");
    }
  };

  const handleMissingDeliveryApply = async () => {
    if (!selectedEvent || !missingDeliveryResult) {
      toast.error("Execute e revise o dry run antes do apply.");
      return;
    }
    if (!missingDeliveryResult.consistency_guard.can_apply) {
      toast.error("Apply bloqueado: nenhuma comissão apta ou guard de consistência.");
      return;
    }
    const confirm = window.confirm(
      "Confirma o APPLY para gerar apenas os convites FALTANTES listados no bloco apto? " +
        "Serão criadas inscrições free_bonus e leader_invitations até o expected canônico (sem usar a rotina automática antiga)."
    );
    if (!confirm) {
      toast.error("Apply cancelado.");
      return;
    }
    setIsMissingDeliveryRunning(true);
    const res = await runMissingInvitationDeliveryApi({
      event_id: selectedEvent.id,
      leader_id: missingDeliveryLeaderScope === LEADER_ALL ? undefined : missingDeliveryLeaderScope,
      mode: "apply",
      apply_confirmed: true,
      audit_snapshot_hash: missingDeliveryResult.audit_snapshot_hash,
      dry_run_hash: missingDeliveryResult.dry_run_hash,
      reason: "Missing invitation delivery apply — painel auditoria (faltantes canônicos)",
      idempotency_key: newAssistedIdempotencyKey("missing-apply"),
    });
    setIsMissingDeliveryRunning(false);
    if (res.success && res.data?.payload) {
      setMissingDeliveryResult(res.data.payload);
      toast.success("Apply executado: convites faltantes gerados conforme plano.");
    } else if (res.success && res.data) {
      toast.error(
        res.data.command_result?.detail || "Resposta sem payload após apply de missing delivery."
      );
    } else {
      toast.error(res.error || res.message || "Apply falhou.");
    }
  };

  const summary = context?.summary;
  const divergingRows =
    auditPayload?.technical_log.rows.filter(
      (r) => r.divergencia_paid_count !== 0 || r.divergencia_expected_bonuses !== 0
    ) ?? [];
  const selectedLeaderLabel =
    leaderScope === LEADER_ALL
      ? "Todos os líderes (escopo da auditoria)"
      : context?.leaders.find((l) => l.leader_id === leaderScope)?.leader_name ||
        context?.leaders.find((l) => l.leader_id === leaderScope)?.referral_code ||
        "Líder selecionado";

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <FileSearch className="h-5 w-5 shrink-0" />
          Auditoria / simulador — bônus de convite (Fase 1)
        </CardTitle>
        <CardDescription className="text-base leading-relaxed">
          Ferramenta guiada para administradores: escolha o evento e o escopo de líder, confira o resumo e a tabela de
          vínculos antes de rodar a auditoria. <strong>Somente leitura</strong> — nenhum dado é alterado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* 1 — Evento */}
        <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            Passo 1 — Selecionar evento
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label>Evento</Label>
              <Popover open={eventOpen} onOpenChange={setEventOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={eventOpen}
                    className="h-auto min-h-11 w-full justify-between py-2 text-left font-normal"
                  >
                    {selectedEvent ? (
                      <span className="line-clamp-2 pr-2">
                        <span className="font-medium">{selectedEvent.title}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {formatEventDate(selectedEvent.event_date)} · {statusLabel(selectedEvent.status)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Buscar por nome do evento…</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[min(100vw-2rem,520px)] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Digite para filtrar eventos…"
                      value={eventSearch}
                      onValueChange={setEventSearch}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {eventsLoading ? "Carregando…" : "Nenhum evento encontrado."}
                      </CommandEmpty>
                      <CommandGroup heading="Eventos (mais recentes primeiro)">
                        {events.map((ev) => (
                          <CommandItem
                            key={ev.id}
                            value={ev.id}
                            onSelect={() => handlePickEvent(ev)}
                            className="flex flex-col items-start gap-0.5 py-3"
                          >
                            <span className="font-medium">{ev.title}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatEventDate(ev.event_date)}
                              {ev.organizer_name || ev.organizer_organization_name
                                ? ` · Org.: ${ev.organizer_name || ev.organizer_organization_name}`
                                : ""}
                              {" · "}
                              {statusLabel(ev.status)}
                              {ev.registration_status ? ` · Inscr.: ${regStatusLabel(ev.registration_status)}` : ""}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            {selectedEvent && (
              <Button type="button" variant="ghost" size="sm" onClick={handleClearEvent}>
                Limpar seleção
              </Button>
            )}
          </div>
        </section>

        {/* 2 — Resumo do evento */}
        {selectedEvent && (
          <section className="space-y-3 rounded-lg border bg-muted/20 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Passo 2 — Contexto do evento
            </div>
            {contextLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando indicadores…
              </div>
            )}
            {!contextLoading && context && (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-md border bg-background p-3">
                    <p className="text-xs text-muted-foreground">Nome do evento</p>
                    <p className="font-medium leading-snug">{context.event.title || "—"}</p>
                  </div>
                  <div className="rounded-md border bg-background p-3">
                    <p className="text-xs text-muted-foreground">Organizador atual</p>
                    <p className="font-medium leading-snug">
                      {context.event.organizer_name || "—"}
                    </p>
                  </div>
                  <div className="rounded-md border bg-background p-3">
                    <p className="text-xs text-muted-foreground">Data do evento</p>
                    <p className="font-medium">{formatEventDate(context.event.event_date)}</p>
                  </div>
                  <div className="rounded-md border bg-background p-3">
                    <p className="text-xs text-muted-foreground">Status / inscrições</p>
                    <p className="font-medium">
                      {statusLabel(context.event.status)} · {regStatusLabel(context.event.registration_status)}
                    </p>
                  </div>
                </div>
                {summary && (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="flex items-start gap-2 rounded-md border bg-background p-3">
                      <Users className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Líderes com vínculo ao evento</p>
                        <p className="text-lg font-semibold tabular-nums">{summary.total_leaders_impacted}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 rounded-md border bg-background p-3">
                      <Ticket className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Líderes com cupom neste evento</p>
                        <p className="text-lg font-semibold tabular-nums">{summary.leaders_with_coupon}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 rounded-md border bg-background p-3">
                      <Gift className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Líderes com comissão no evento</p>
                        <p className="text-lg font-semibold tabular-nums">{summary.leaders_with_commission}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 rounded-md border bg-background p-3">
                      <Mail className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Líderes com convites (registros)</p>
                        <p className="text-lg font-semibold tabular-nums">{summary.leaders_with_invitations}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 rounded-md border bg-background p-3 sm:col-span-2">
                      <FileSearch className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">No escopo da auditoria Fase 1</p>
                        <p className="text-lg font-semibold tabular-nums">{summary.leaders_in_audit_scope}</p>
                        <p className="text-xs text-muted-foreground">
                          Comissão convite/both ou convites em <code className="text-[10px]">leader_invitations</code>{" "}
                          neste evento (mesmo critério do backend).
                        </p>
                      </div>
                    </div>
                    <div className="rounded-md border bg-background p-3">
                      <p className="text-xs text-muted-foreground">Total de cupons (evento)</p>
                      <p className="text-lg font-semibold tabular-nums">{summary.total_coupons_for_event}</p>
                    </div>
                    <div className="rounded-md border bg-background p-3">
                      <p className="text-xs text-muted-foreground">Total de convites (registros no evento)</p>
                      <p className="text-lg font-semibold tabular-nums">
                        {summary.total_invitation_records_for_event}
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* 3 — Tabela líderes + filtro */}
        {selectedEvent && context && !contextLoading && (
          <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <Users className="h-4 w-4 text-muted-foreground" />
              Passo 3 — Líderes vinculados (validação antes da auditoria)
            </div>
            <p className="text-sm text-muted-foreground">
              Confira cupons, comissões e convites por líder. A coluna &quot;Escopo auditoria&quot; indica se o líder entra
              no laço padrão da Fase 1 quando nenhum líder específico é escolhido.
            </p>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[160px]">Líder</TableHead>
                    <TableHead>Tipo de vínculo</TableHead>
                    <TableHead className="text-center tabular-nums">Cupons</TableHead>
                    <TableHead className="text-center tabular-nums">Comissões</TableHead>
                    <TableHead className="text-center tabular-nums">Convites</TableHead>
                    <TableHead className="text-center">Escopo auditoria</TableHead>
                    <TableHead className="min-w-[200px]">Observações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {context.leaders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        Nenhum líder com cupom, comissão ou convite associado a este evento.
                      </TableCell>
                    </TableRow>
                  ) : (
                    context.leaders.map((row) => (
                      <TableRow key={row.leader_id}>
                        <TableCell>
                          <div className="font-medium">{row.leader_name || "—"}</div>
                          {row.referral_code && (
                            <div className="text-xs text-muted-foreground">Código: {row.referral_code}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {row.link_types.length === 0 ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              row.link_types.map((t) => linkTypeBadge(t))
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center tabular-nums">{row.coupon_count}</TableCell>
                        <TableCell className="text-center tabular-nums">{row.commission_count}</TableCell>
                        <TableCell className="text-center tabular-nums">{row.invitation_count}</TableCell>
                        <TableCell className="text-center">
                          {row.included_in_audit_scope ? (
                            <Badge className="bg-emerald-600 hover:bg-emerald-600">Sim</Badge>
                          ) : (
                            <Badge variant="secondary">Não</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.notes.length ? (
                            <ul className="list-inside list-disc space-y-0.5">
                              {row.notes.map((n, i) => (
                                <li key={i}>{n}</li>
                              ))}
                            </ul>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-4 pt-2 sm:max-w-md">
              <div className="space-y-2">
                <Label htmlFor="leader-scope">Escopo da auditoria</Label>
                <Select value={leaderScope} onValueChange={setLeaderScope} disabled={isAuditRunning}>
                  <SelectTrigger id="leader-scope">
                    <SelectValue placeholder="Escolha o escopo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={LEADER_ALL}>Todos os líderes do evento (padrão da Fase 1)</SelectItem>
                    {context.leaders.map((l) => (
                      <SelectItem key={l.leader_id} value={l.leader_id}>
                        {l.leader_name || l.referral_code || l.leader_id.slice(0, 8) + "…"}
                        {!l.included_in_audit_scope ? " (fora do escopo padrão)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Ao escolher um líder específico, a auditoria roda só para ele (útil para suporte), mesmo que esteja
                  fora do escopo padrão.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* 4 — Executar */}
        {selectedEvent && context && !contextLoading && (
          <section className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button
              type="button"
              onClick={handleRunAudit}
              disabled={isAuditRunning}
              size="lg"
              className="gap-2"
            >
              {isAuditRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Executando auditoria…
                </>
              ) : (
                <>
                  <FileSearch className="h-4 w-4" />
                  Executar auditoria
                </>
              )}
            </Button>
            {auditPayload && (
              <>
                <Button type="button" variant="outline" onClick={handleDownloadAuditMarkdown} className="gap-2">
                  <Download className="h-4 w-4" />
                  Relatório (.md)
                </Button>
                <Button type="button" variant="outline" onClick={handleDownloadAuditTechnicalJson} className="gap-2">
                  <Download className="h-4 w-4" />
                  Log técnico (.json)
                </Button>
              </>
            )}
          </section>
        )}

        {/* 5 — Resultado resumido */}
        {auditPayload && (
          <section className="space-y-3 rounded-lg border border-dashed bg-muted/10 p-4">
            <div className="text-sm font-semibold">Resultado resumido</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border bg-background p-3">
                <p className="text-xs text-muted-foreground">Escopo executado</p>
                <p className="text-sm font-medium">{selectedLeaderLabel}</p>
              </div>
              <div className="rounded-md border bg-background p-3">
                <p className="text-xs text-muted-foreground">Linhas (comissões) analisadas</p>
                <p className="text-lg font-semibold tabular-nums">{auditPayload.technical_log.rows.length}</p>
              </div>
              <div className="rounded-md border bg-background p-3">
                <p className="text-xs text-muted-foreground">Linhas com divergência</p>
                <p className="text-lg font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                  {divergingRows.length}
                </p>
              </div>
              <div className="rounded-md border bg-background p-3">
                <p className="text-xs text-muted-foreground">Líderes no log técnico</p>
                <p className="text-lg font-semibold tabular-nums">
                  {auditPayload.technical_log.leaders_scope.length}
                </p>
              </div>
            </div>
            {auditPayload.technical_log.error_classification_aggregate.length > 0 && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  <span className="font-medium">Classificações detectadas: </span>
                  {auditPayload.technical_log.error_classification_aggregate.join(", ")}
                </AlertDescription>
              </Alert>
            )}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Relatório funcional (Markdown)</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[min(55vh,480px)] w-full rounded-md border bg-muted/30 p-4 font-mono text-xs whitespace-pre-wrap">
                  {auditPayload.functional_report_markdown}
                </ScrollArea>
              </CardContent>
            </Card>
          </section>
        )}

        {/* 6 — Frente 2 integrada ao resultado da Frente 1 */}
        {auditPayload && selectedEvent && (
          <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Frente 2 — Correção controlada (integrada)</p>
                <p className="text-xs text-muted-foreground">
                  Fluxo acoplado ao resultado da auditoria. Sem contexto auditado, não há execução de correção.
                </p>
              </div>
              {!showReconciliation ? (
                <Button type="button" onClick={() => setShowReconciliation(true)}>
                  Iniciar correção controlada
                </Button>
              ) : (
                <Button type="button" variant="ghost" onClick={() => setShowReconciliation(false)}>
                  Ocultar
                </Button>
              )}
            </div>

            {showReconciliation && (
              <div className="space-y-4 rounded-md border bg-muted/20 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md border bg-background p-3 text-sm">
                    <p className="text-xs text-muted-foreground">event_id (herdado da auditoria, não editável)</p>
                    <p className="font-mono text-xs">{selectedEvent.id}</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Escopo da correção controlada</Label>
                    <Select
                      value={reconcileLeaderScope}
                      onValueChange={(v) => {
                        setReconcileLeaderScope(v);
                        setReconciliationResult(null);
                      }}
                      disabled={isReconciliationRunning}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={LEADER_ALL}>Evento inteiro (recomendado só depois de validar 1 líder)</SelectItem>
                        {context?.leaders.map((l) => (
                          <SelectItem key={l.leader_id} value={l.leader_id}>
                            {l.leader_name || l.referral_code || l.leader_id.slice(0, 8) + "…"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {reconcileLeaderScope === LEADER_ALL && (
                  <Alert>
                    <AlertDescription>
                      Recomendação operacional: rode primeiro por <strong>1 líder problemático</strong>. Depois, se validado,
                      execute no evento inteiro.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={handleRunReconciliationDryRun} disabled={isReconciliationRunning}>
                    {isReconciliationRunning ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Executando dry_run...
                      </>
                    ) : (
                      "Executar dry_run"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleRunReconciliationApply}
                    disabled={
                      isReconciliationRunning ||
                      !reconciliationResult ||
                      !reconciliationResult.consistency_guard.can_apply
                    }
                  >
                    Executar apply
                  </Button>
                </div>

                {reconciliationResult && (
                  <div className="space-y-3">
                    <Alert>
                      <AlertDescription className="space-y-1 text-sm">
                        <p>
                          <strong>Guard de consistência:</strong>{" "}
                          {reconciliationResult.consistency_guard.can_apply ? "OK" : "BLOQUEADO"} ·{" "}
                          {reconciliationResult.consistency_guard.reason}
                        </p>
                        <p>
                          <strong>audit_snapshot_hash:</strong>{" "}
                          <span className="font-mono text-xs">{reconciliationResult.audit_snapshot_hash}</span>
                        </p>
                        <p>
                          <strong>dry_run_hash:</strong>{" "}
                          <span className="font-mono text-xs">{reconciliationResult.dry_run_hash}</span>
                        </p>
                      </AlertDescription>
                    </Alert>

                    <Alert>
                      <AlertDescription className="text-sm space-y-1">
                        <p className="font-medium">
                          Exclusão física habilitada apenas para registrations free_bonus órfãs sem_convite_correspondente
                        </p>
                        <p className="text-xs text-muted-foreground">
                          O deficit/faltantes (Seção A) é apenas diagnóstico. A exclusão física (DELETE) acontece somente no
                          recorte elegível mostrado na Seção C.
                        </p>
                      </AlertDescription>
                    </Alert>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                      <div className="rounded-md border bg-background p-3">
                        <p className="text-xs text-muted-foreground">Convites available (antes)</p>
                        <p className="text-lg font-semibold tabular-nums">
                          {reconciliationResult.reports.before.invitations_available}
                        </p>
                      </div>
                      <div className="rounded-md border bg-background p-3">
                        <p className="text-xs text-muted-foreground">Convites a ajustar (Bloco A)</p>
                        <p className="text-lg font-semibold tabular-nums">
                          {reconciliationResult.reports.change_plan.summary.invitations_to_change}
                        </p>
                      </div>
                      <div className="rounded-md border bg-background p-3">
                        <p className="text-xs text-muted-foreground">Bloco B detectados (escopo)</p>
                        <p className="text-lg font-semibold tabular-nums">
                          {
                            reconciliationResult.reports.change_plan.bloco_b_registrations_free_bonus.summary
                              .detected_in_scope
                          }
                        </p>
                      </div>
                      <div className="rounded-md border bg-background p-3">
                        <p className="text-xs text-muted-foreground">Bloco B executável / dry_run-only</p>
                        <p className="text-sm font-medium tabular-nums">
                          {reconciliationResult.reports.change_plan.bloco_b_registrations_free_bonus.summary
                            .executable_count}{" "}
                          /{" "}
                          {
                            reconciliationResult.reports.change_plan.bloco_b_registrations_free_bonus.summary
                              .dry_run_only_count
                          }
                        </p>
                      </div>
                      <div className="rounded-md border bg-background p-3">
                        <p className="text-xs text-muted-foreground">Fora escopo líder / ignorados</p>
                        <p className="text-sm font-medium tabular-nums">
                          {reconciliationResult.reports.change_plan.bloco_b_registrations_free_bonus.summary
                            .excluded_by_leader_scope_count}{" "}
                          /{" "}
                          {
                            reconciliationResult.reports.change_plan.bloco_b_registrations_free_bonus.summary
                              .ignored_valid_or_neutral_count
                          }
                        </p>
                      </div>
                      <div className="rounded-md border bg-background p-3">
                        <p className="text-xs text-muted-foreground">Status bloco B (política)</p>
                        <p className="text-sm font-medium">{reconciliationResult.free_bonus_block_status}</p>
                      </div>
                    </div>

                    <Alert>
                      <AlertDescription className="text-sm">
                        <p className="font-medium">Escopo Bloco B (alinhado à Fase 1)</p>
                        <p>{reconciliationResult.bloco_b_scope.note}</p>
                        {reconciliationResult.bloco_b_scope.leader_filter_applied && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Excluídos por escopo — sem leader_id:{" "}
                            <span className="font-mono tabular-nums">
                              {reconciliationResult.bloco_b_scope.excluded_count_orphan_no_leader}
                            </span>
                            {" · "}
                            outro(s) líder(es):{" "}
                            <span className="font-mono tabular-nums">
                              {reconciliationResult.bloco_b_scope.excluded_count_other_leader}
                            </span>
                          </p>
                        )}
                      </AlertDescription>
                    </Alert>

                    {reconciliationResult.mode === 'apply' &&
                      reconciliationResult.reports.after_apply?.physical_delete && (
                        <Alert>
                          <AlertDescription className="text-sm space-y-1">
                            <p className="font-medium">Resultado do apply — DELETE físico (Bloco B / free_bonus)</p>
                            <p>
                              deletados: <span className="font-mono">{reconciliationResult.reports.after_apply.physical_delete.deleted_count}</span> ·
                              remaining no evento:{" "}
                              <span className="font-mono">
                                {reconciliationResult.reports.after_apply.physical_delete.remaining_free_bonus_registrations_in_event}
                              </span>
                            </p>
                            {reconciliationResult.reports.after_apply.physical_delete.backup_saved_ids.length > 0 && (
                              <p className="text-xs text-muted-foreground">
                                IDs no backup:{" "}
                                {reconciliationResult.reports.after_apply.physical_delete.backup_saved_ids
                                  .slice(0, 20)
                                  .join(", ")}
                                {reconciliationResult.reports.after_apply.physical_delete.backup_saved_ids.length > 20
                                  ? " ..."
                                  : ""}
                              </p>
                            )}
                            {reconciliationResult.reports.after_apply.physical_delete.deleted_ids.length > 0 && (
                              <p className="text-xs text-muted-foreground">
                                IDs deletados:{" "}
                                {reconciliationResult.reports.after_apply.physical_delete.deleted_ids
                                  .slice(0, 20)
                                  .join(", ")}
                                {reconciliationResult.reports.after_apply.physical_delete.deleted_ids.length > 20
                                  ? " ..."
                                  : ""}
                              </p>
                            )}
                          </AlertDescription>
                        </Alert>
                      )}

                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">
                          Seção A — Saldo de convites por líder/comissão (déficit de convites)
                        </CardTitle>
                        <CardDescription>
                          Reutiliza required_purchases/paidCount_canonical/expectedBonuses_canonical/times_granted_db da auditoria
                          da Fase 1 (cálculo canônico). Aqui, <strong>faltantes/excesso</strong> representam somente saldo de
                          convites (déficit/sobra) e <strong>não</strong> indicam quais `registrations free_bonus` seriam
                          excluídos.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="rounded-md border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Convites faltantes</p>
                            <p className="text-lg font-semibold tabular-nums">
                              {reconciliationResult.diagnostics_missing_excess.totals.missing_invitations}
                            </p>
                          </div>
                          <div className="rounded-md border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Convites corretos</p>
                            <p className="text-lg font-semibold tabular-nums">
                              {reconciliationResult.diagnostics_missing_excess.totals.correct_invitations}
                            </p>
                          </div>
                          <div className="rounded-md border bg-background p-3">
                            <p className="text-xs text-muted-foreground">Convites em excesso</p>
                            <p className="text-lg font-semibold tabular-nums">
                              {reconciliationResult.diagnostics_missing_excess.totals.excess_invitations}
                            </p>
                          </div>
                        </div>

                        <div className="overflow-x-auto rounded-md border">
                          <ScrollArea className="h-60">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Líder</TableHead>
                                  <TableHead>Comissão</TableHead>
                                  <TableHead className="text-center tabular-nums">req</TableHead>
                                  <TableHead className="text-center tabular-nums">paid (correto)</TableHead>
                                  <TableHead className="text-center tabular-nums">expected</TableHead>
                                  <TableHead className="text-center tabular-nums">timesGranted</TableHead>
                                  <TableHead className="text-center tabular-nums">faltantes</TableHead>
                                  <TableHead className="text-center tabular-nums">corretos</TableHead>
                                  <TableHead className="text-center tabular-nums">excesso</TableHead>
                                  <TableHead>Regra</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {reconciliationResult.diagnostics_missing_excess.rows.length === 0 ? (
                                  <TableRow>
                                    <TableCell colSpan={10} className="text-center text-muted-foreground">
                                      Nenhuma linha de comissão disponível no escopo.
                                    </TableCell>
                                  </TableRow>
                                ) : (
                                  reconciliationResult.diagnostics_missing_excess.rows.map((d) => (
                                    <TableRow key={`${d.leader_id}:${d.commission_id}`}>
                                      <TableCell className="text-xs">
                                        {leaderNameFromContext(d.leader_id, context)}
                                      </TableCell>
                                      <TableCell className="font-mono text-xs">{d.commission_id}</TableCell>
                                      <TableCell className="text-center tabular-nums">{d.required_purchases}</TableCell>
                                      <TableCell className="text-center tabular-nums">{d.paidCount_correto}</TableCell>
                                      <TableCell className="text-center tabular-nums">{d.expectedBonuses_correto}</TableCell>
                                      <TableCell className="text-center tabular-nums">{d.timesGranted_db}</TableCell>
                                      <TableCell className="text-center tabular-nums">{d.missing_invitations_count}</TableCell>
                                      <TableCell className="text-center tabular-nums">{d.correct_invitations_count}</TableCell>
                                      <TableCell className="text-center tabular-nums">{d.excess_invitations_count}</TableCell>
                                      <TableCell className="text-xs">{d.bonus_rule_legible}</TableCell>
                                    </TableRow>
                                  ))
                                )}
                              </TableBody>
                            </Table>
                          </ScrollArea>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Exclusao fisica controlada (Bloco B / free_bonus) */}
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">
                          Seção B — Exclusão física controlada (dry_run)
                        </CardTitle>
                        <CardDescription>
                          <strong>Exclusão física habilitada apenas para registrations free_bonus órfãs sem_convite_correspondente</strong>.
                          Aqui, “candidatas” e “bloqueadas” são separadas: saldo de convites (déficit/faltantes) é apenas diagnóstico na Seção A.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <div className="rounded-md border bg-background p-3">
                            <p className="text-xs text-muted-foreground">total_free_bonus_analisadas</p>
                            <p className="text-lg font-semibold tabular-nums">
                              {
                                reconciliationResult.reports.change_plan.bloco_b_registrations_free_bonus
                                  .physical_delete_plan.totals.total_free_bonus_analisadas
                              }
                            </p>
                          </div>
                          <div className="rounded-md border bg-background p-3">
                            <p className="text-xs text-muted-foreground">total_candidatas_exclusao_fisica</p>
                            <p className="text-lg font-semibold tabular-nums">
                              {
                                reconciliationResult.reports.change_plan.bloco_b_registrations_free_bonus
                                  .physical_delete_plan.totals.total_candidatas_exclusao_fisica
                              }
                            </p>
                          </div>
                          <div className="rounded-md border bg-background p-3">
                            <p className="text-xs text-muted-foreground">total_elegiveis_para_delete_fisico</p>
                            <p className="text-lg font-semibold tabular-nums">
                              {
                                reconciliationResult.reports.change_plan.bloco_b_registrations_free_bonus
                                  .physical_delete_plan.totals.total_elegiveis_para_delete_fisico
                              }
                            </p>
                          </div>
                          <div className="rounded-md border bg-background p-3">
                            <p className="text-xs text-muted-foreground">total_excluidas_do_escopo_por_seguranca</p>
                            <p className="text-lg font-semibold tabular-nums">
                              {
                                reconciliationResult.reports.change_plan.bloco_b_registrations_free_bonus
                                  .physical_delete_plan.totals.total_excluidas_do_escopo_por_seguranca
                              }
                            </p>
                          </div>
                        </div>

                        <p className="mt-3 text-xs text-muted-foreground">
                          Recorte do dry_run (para elegibilidade de DELETE físico): classification=<strong>sem_convite_correspondente</strong> + leader_invitation_id ausente (null) + leader_id=null + commission_id=null.
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">
                          Seção C — IDs do DELETE físico (elegíveis vs bloqueadas)
                        </CardTitle>
                        <CardDescription>
                          No dry_run, a lista abaixo mostra quais `registration_id` seriam deletados <strong>apenas</strong> se o apply confirmasse o mesmo contexto (hash do dry_run).
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div className="space-y-2">
                          <p className="text-sm font-semibold">
                            Elegíveis para delete físico ({reconciliationResult.reports.change_plan.bloco_b_registrations_free_bonus.physical_delete_plan.elegiveis_para_delete_fisico.length})
                          </p>
                          <div className="overflow-x-auto rounded-md border">
                            <ScrollArea className="h-48">
                              <Table className="min-w-[760px]">
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>registration_id</TableHead>
                                    <TableHead>motivo operacional</TableHead>
                                    <TableHead>classification</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {reconciliationResult.reports.change_plan.bloco_b_registrations_free_bonus.physical_delete_plan.elegiveis_para_delete_fisico.length === 0 ? (
                                    <TableRow>
                                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                                        Nenhum registro elegível.
                                      </TableCell>
                                    </TableRow>
                                  ) : (
                                    reconciliationResult.reports.change_plan.bloco_b_registrations_free_bonus.physical_delete_plan.elegiveis_para_delete_fisico.map((it) => (
                                      <TableRow key={it.registration_id}>
                                        <TableCell className="font-mono text-xs">{it.registration_id}</TableCell>
                                        <TableCell className="text-xs">{it.motivo_operacional}</TableCell>
                                        <TableCell className="text-xs">{it.classification.join(", ")}</TableCell>
                                      </TableRow>
                                    ))
                                  )}
                                </TableBody>
                              </Table>
                            </ScrollArea>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-sm font-semibold">
                            Bloqueadas por segurança ({reconciliationResult.reports.change_plan.bloco_b_registrations_free_bonus.physical_delete_plan.bloqueadas_por_seguranca.length})
                          </p>
                          <div className="overflow-x-auto rounded-md border">
                            <ScrollArea className="h-48">
                              <Table className="min-w-[760px]">
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>registration_id</TableHead>
                                    <TableHead>motivo operacional</TableHead>
                                    <TableHead>classification</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {reconciliationResult.reports.change_plan.bloco_b_registrations_free_bonus.physical_delete_plan.bloqueadas_por_seguranca.length === 0 ? (
                                    <TableRow>
                                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                                        Nenhum registro bloqueado.
                                      </TableCell>
                                    </TableRow>
                                  ) : (
                                    reconciliationResult.reports.change_plan.bloco_b_registrations_free_bonus.physical_delete_plan.bloqueadas_por_seguranca.map((it) => (
                                      <TableRow key={it.registration_id}>
                                        <TableCell className="font-mono text-xs">{it.registration_id}</TableCell>
                                        <TableCell className="text-xs">{it.motivo_operacional}</TableCell>
                                        <TableCell className="text-xs">{it.classification.join(", ")}</TableCell>
                                      </TableRow>
                                    ))
                                  )}
                                </TableBody>
                              </Table>
                            </ScrollArea>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">
                          Plano de alteração — Bloco A (leader_invitations)
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-44 rounded-md border p-2">
                          <div className="space-y-2 text-xs">
                            {reconciliationResult.reports.change_plan.bloco_a_leader_invitations.items.length === 0 ? (
                              <p className="text-muted-foreground">Nenhum leader_invitation em excesso.</p>
                            ) : (
                              reconciliationResult.reports.change_plan.bloco_a_leader_invitations.items.map((x) => (
                                <div key={x.leader_invitation_id} className="rounded border p-2">
                                  <p className="font-mono">{x.leader_invitation_id}</p>
                                  <p>{x.justification}</p>
                                  <p className="text-muted-foreground">
                                    ação: {x.action_proposed} · reversibilidade: {x.reversibility_note}
                                  </p>
                                </div>
                              ))
                            )}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">
                          Plano de alteração — Bloco B (registrations free_bonus)
                        </CardTitle>
                        <CardDescription>{reconciliationResult.free_bonus_block_reason}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <ScrollArea className="h-[min(50vh,420px)] rounded-md border p-2">
                          <div className="space-y-2 text-xs">
                            {reconciliationResult.reports.change_plan.bloco_b_registrations_free_bonus.items
                              .length === 0 ? (
                              <p className="text-muted-foreground">
                                Nenhum registration free_bonus com flags de plano no escopo (veja excluídos/ignorados
                                abaixo).
                              </p>
                            ) : (
                              reconciliationResult.reports.change_plan.bloco_b_registrations_free_bonus.items.map(
                                (x) => (
                                  <div key={x.registration_id} className="rounded border p-2 space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Badge
                                        variant={x.item_executability === "executável" ? "default" : "secondary"}
                                      >
                                        {x.item_executability}
                                      </Badge>
                                      <span className="font-mono text-[11px]">{x.registration_id}</span>
                                    </div>
                                    <p className="text-muted-foreground">
                                      leader_id:{" "}
                                      <span className="font-mono">{x.leader_id ?? "—"}</span>
                                      {" · "}commission_id:{" "}
                                      <span className="font-mono">{x.commission_id ?? "—"}</span>
                                      {" · "}event_id: <span className="font-mono">{x.event_id}</span>
                                    </p>
                                    <p>
                                      <span className="font-medium">Flags (plano):</span>{" "}
                                      {x.classification.join(", ")}
                                    </p>
                                    <p className="text-muted-foreground">
                                      <span className="font-medium text-foreground">Fase 1 (completo):</span>{" "}
                                      {x.classification_full.join(", ")}
                                    </p>
                                    <p>{x.justification}</p>
                                    <p className="text-muted-foreground">
                                      <span className="font-medium text-foreground">Ação:</span>{" "}
                                      {x.action_proposed_human} ({x.action_proposed})
                                    </p>
                                    <p className="text-muted-foreground">
                                      <span className="font-medium text-foreground">Reversibilidade:</span>{" "}
                                      {x.reversibility_note}
                                    </p>
                                    <p className="text-muted-foreground">
                                      leader_invitation_id:{" "}
                                      <span className="font-mono">{x.leader_invitation_id ?? "—"}</span>
                                      {" · "}status / pagamento: {x.current_status ?? "—"} /{" "}
                                      {x.payment_status ?? "—"}
                                    </p>
                                  </div>
                                )
                              )
                            )}
                          </div>
                        </ScrollArea>

                        {reconciliationResult.reports.change_plan.bloco_b_registrations_free_bonus
                          .excluded_by_leader_scope.length > 0 && (
                          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                            <p className="font-semibold text-amber-900 dark:text-amber-100">
                              Fora do escopo (filtro de líder) — {reconciliationResult.reports.change_plan.bloco_b_registrations_free_bonus.excluded_by_leader_scope.length}
                            </p>
                            <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-y-auto pl-4 text-muted-foreground">
                              {reconciliationResult.reports.change_plan.bloco_b_registrations_free_bonus.excluded_by_leader_scope.map(
                                (ex) => (
                                  <li key={ex.registration_id}>
                                    <span className="font-mono">{ex.registration_id}</span> — {ex.reason}
                                  </li>
                                )
                              )}
                            </ul>
                          </div>
                        )}

                        {reconciliationResult.reports.change_plan.bloco_b_registrations_free_bonus.ignored_not_in_plan
                          .length > 0 && (
                          <div className="rounded-md border bg-muted/30 p-3 text-xs">
                            <p className="font-semibold">
                              Ignorados (sem flags de plano / apenas válidos) —{" "}
                              {
                                reconciliationResult.reports.change_plan.bloco_b_registrations_free_bonus
                                  .ignored_not_in_plan.length
                              }
                            </p>
                            <ul className="mt-2 max-h-32 list-disc space-y-1 overflow-y-auto pl-4 text-muted-foreground">
                              {reconciliationResult.reports.change_plan.bloco_b_registrations_free_bonus.ignored_not_in_plan
                                .slice(0, 80)
                                .map((ig) => (
                                  <li key={ig.registration_id}>
                                    <span className="font-mono">{ig.registration_id}</span> — {ig.reason}
                                  </li>
                                ))}
                            </ul>
                            {reconciliationResult.reports.change_plan.bloco_b_registrations_free_bonus.ignored_not_in_plan
                              .length > 80 && (
                              <p className="mt-1 text-muted-foreground">
                                Lista truncada na UI (primeiros 80); use o payload JSON completo se necessário.
                              </p>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* 7 — Corrigir convites não entregues (fluxo separado da Frente 2 / exclusão) */}
        {auditPayload && selectedEvent && (
          <section className="space-y-3 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold flex items-center gap-2">
                  <Send className="h-4 w-4 text-emerald-600" />
                  Corrigir convites não entregues
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[52rem]">
                  Fluxo <strong>separado</strong> da correção de excesso/DELETE acima. Usa apenas o resultado{" "}
                  <strong>canônico</strong> da auditoria (Fase 1), gera somente <code className="text-[10px]">faltantes</code>{" "}
                  (expectedBonuses_correto − timesGranted) com inscrição <code className="text-[10px]">free_bonus</code> +{" "}
                  <code className="text-[10px]">leader_invitations</code>. Não altera cupons.{" "}
                  <strong>Modo padrão: dry_run</strong>; apply só com confirmação explícita.
                </p>
              </div>
              {!showMissingDelivery ? (
                <Button type="button" variant="secondary" onClick={() => setShowMissingDelivery(true)}>
                  Abrir fluxo
                </Button>
              ) : (
                <Button type="button" variant="ghost" onClick={() => setShowMissingDelivery(false)}>
                  Ocultar
                </Button>
              )}
            </div>

            {showMissingDelivery && (
              <div className="space-y-4 rounded-md border bg-background p-4">
                <Alert>
                  <AlertDescription className="text-sm">
                    <strong>event_id</strong> fixo:{" "}
                    <span className="font-mono text-xs">{selectedEvent.id}</span> (herdado da auditoria). Escopo opcional
                    de líder abaixo — mesmo padrão da correção de excesso, mas <strong>sem</strong> multi-evento e{" "}
                    <strong>sem</strong> mistura com exclusão de free_bonus.
                  </AlertDescription>
                </Alert>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Escopo (leader_id opcional)</Label>
                    <Select
                      value={missingDeliveryLeaderScope}
                      onValueChange={(v) => {
                        setMissingDeliveryLeaderScope(v);
                        setMissingDeliveryResult(null);
                      }}
                      disabled={isMissingDeliveryRunning}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={LEADER_ALL}>Todos os líderes do evento</SelectItem>
                        {context?.leaders.map((l) => (
                          <SelectItem key={l.leader_id} value={l.leader_id}>
                            {l.leader_name || l.referral_code || l.leader_id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={handleMissingDeliveryDryRun}
                    disabled={isMissingDeliveryRunning}
                    className="gap-2"
                  >
                    {isMissingDeliveryRunning ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Executando dry_run…
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Executar dry_run (padrão)
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    className="bg-emerald-700 hover:bg-emerald-800 text-white"
                    onClick={handleMissingDeliveryApply}
                    disabled={
                      isMissingDeliveryRunning ||
                      !missingDeliveryResult ||
                      !missingDeliveryResult.consistency_guard.can_apply
                    }
                  >
                    Aplicar geração (apply)
                  </Button>
                </div>

                {missingDeliveryResult && (
                  <div className="space-y-4">
                    <Alert>
                      <AlertDescription className="space-y-1 text-sm">
                        <p>
                          <strong>Guard:</strong>{" "}
                          {missingDeliveryResult.consistency_guard.can_apply ? "pode aplicar" : "bloqueado"} ·{" "}
                          {missingDeliveryResult.consistency_guard.reason}
                        </p>
                        <p className="font-mono text-[11px] break-all">
                          audit_snapshot_hash: {missingDeliveryResult.audit_snapshot_hash}
                        </p>
                        <p className="font-mono text-[11px] break-all">
                          dry_run_hash: {missingDeliveryResult.dry_run_hash}
                        </p>
                      </AlertDescription>
                    </Alert>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">1 — Relatório antes (resumo)</p>
                        <p className="text-sm">
                          Linhas comissão:{" "}
                          <span className="font-semibold tabular-nums">
                            {missingDeliveryResult.relatorio_antes.total_linhas_comissao_escopo}
                          </span>
                        </p>
                        <p className="text-sm">
                          Faltantes (soma):{" "}
                          <span className="font-semibold tabular-nums">
                            {missingDeliveryResult.relatorio_antes.total_faltantes_somado}
                          </span>
                        </p>
                        <p className="text-sm">
                          Aptos / bloqueados:{" "}
                          <span className="font-semibold tabular-nums">
                            {missingDeliveryResult.relatorio_antes.total_aptos_gerar}
                          </span>{" "}
                          /{" "}
                          <span className="font-semibold tabular-nums">
                            {missingDeliveryResult.relatorio_antes.total_bloqueados}
                          </span>
                        </p>
                      </div>
                      <div className="rounded-md border p-3 sm:col-span-3">
                        <p className="text-xs text-muted-foreground">2 — Plano de geração</p>
                        <p className="text-sm text-muted-foreground">
                          Bloco A = aptos; Bloco B = bloqueados (segurança). Cada item inclui ação proposta e observação
                          de reversibilidade.
                        </p>
                      </div>
                    </div>

                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm text-emerald-800 dark:text-emerald-200">
                          Bloco A — Aptos para geração
                        </CardTitle>
                        <CardDescription>
                          {missingDeliveryResult.plano_geracao.bloco_a_aptos.length} comissão(ões) com faltantes e
                          segurança OK.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Líder</TableHead>
                                <TableHead>Comissão</TableHead>
                                <TableHead className="text-center tabular-nums">req</TableHead>
                                <TableHead className="text-center tabular-nums">paid ✓</TableHead>
                                <TableHead className="text-center tabular-nums">expected</TableHead>
                                <TableHead className="text-center tabular-nums">granted</TableHead>
                                <TableHead className="text-center tabular-nums">vál.</TableHead>
                                <TableHead className="text-center tabular-nums">inc.</TableHead>
                                <TableHead className="text-center tabular-nums">faltantes</TableHead>
                                <TableHead className="text-[10px]">warnings</TableHead>
                                <TableHead className="text-center tabular-nums">gerar</TableHead>
                                <TableHead>Segurança / ação</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {missingDeliveryResult.plano_geracao.bloco_a_aptos.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={12} className="text-center text-muted-foreground">
                                    Nenhuma linha apta no escopo.
                                  </TableCell>
                                </TableRow>
                              ) : (
                                missingDeliveryResult.plano_geracao.bloco_a_aptos.map((row) => (
                                  <TableRow key={`${row.leader_id}:${row.commission_id}`}>
                                    <TableCell className="text-xs">
                                      {leaderNameFromContext(row.leader_id, context)}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">{row.commission_id}</TableCell>
                                    <TableCell className="text-center tabular-nums">{row.required_purchases}</TableCell>
                                    <TableCell className="text-center tabular-nums">{row.paidCount_correto}</TableCell>
                                    <TableCell className="text-center tabular-nums">{row.expectedBonuses_correto}</TableCell>
                                    <TableCell className="text-center tabular-nums">{row.timesGranted_db}</TableCell>
                                    <TableCell className="text-center tabular-nums">
                                      {row.prova_expandida?.timesGranted_validos ?? "—"}
                                    </TableCell>
                                    <TableCell className="text-center tabular-nums">
                                      {row.prova_expandida?.timesGranted_inconsistentes ?? "—"}
                                    </TableCell>
                                    <TableCell className="text-center tabular-nums font-medium">{row.faltantes}</TableCell>
                                    <TableCell className="text-[10px] font-mono text-sky-800 dark:text-sky-200 max-w-[120px]">
                                      {(row.warning_codes ?? []).join(", ") || "—"}
                                    </TableCell>
                                    <TableCell className="text-center tabular-nums font-semibold">
                                      {row.eligible_to_generate_missing_invitations ?? row.faltantes}
                                    </TableCell>
                                    <TableCell className="text-xs max-w-[280px]">
                                      <div>{row.observacao_seguranca}</div>
                                      <div className="text-muted-foreground mt-1">{row.acao_proposta}</div>
                                    </TableCell>
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm text-amber-900 dark:text-amber-100">
                          Bloco B — Bloqueados
                        </CardTitle>
                        <CardDescription>
                          Comissões com faltantes mas bloqueadas por segurança (cupom, divergência, duplicidade, etc.).
                          Abaixo, o <strong>dry_run expandido de prova</strong> (somente leitura) detalha convites válidos
                          vs inconsistentes e a decisão operacional antes de qualquer apply.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Líder</TableHead>
                                <TableHead>Comissão</TableHead>
                                <TableHead className="text-center tabular-nums">faltantes</TableHead>
                                <TableHead className="text-center tabular-nums">válidos</TableHead>
                                <TableHead className="text-center tabular-nums">inc.</TableHead>
                                <TableHead className="text-center tabular-nums text-[10px]">evid.</TableHead>
                                <TableHead className="text-xs">blockers</TableHead>
                                <TableHead className="text-xs">warnings</TableHead>
                                <TableHead>Motivos bloqueio</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {missingDeliveryResult.plano_geracao.bloco_b_bloqueados.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                                    Nenhuma linha bloqueada com faltantes.
                                  </TableCell>
                                </TableRow>
                              ) : (
                                missingDeliveryResult.plano_geracao.bloco_b_bloqueados.map((row) => (
                                  <TableRow key={`b-${row.leader_id}:${row.commission_id}`}>
                                    <TableCell className="text-xs">
                                      {leaderNameFromContext(row.leader_id, context)}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">{row.commission_id}</TableCell>
                                    <TableCell className="text-center tabular-nums">{row.faltantes}</TableCell>
                                    <TableCell className="text-center tabular-nums">
                                      {row.prova_expandida?.timesGranted_validos ?? "—"}
                                    </TableCell>
                                    <TableCell className="text-center tabular-nums">
                                      {row.prova_expandida?.timesGranted_inconsistentes ?? "—"}
                                    </TableCell>
                                    <TableCell className="text-center tabular-nums text-[10px]">
                                      {row.blocking_evidence_count ?? "—"}
                                    </TableCell>
                                    <TableCell className="text-[10px] font-mono">
                                      {(row.block_reason_codes ?? []).join(", ") || "—"}
                                    </TableCell>
                                    <TableCell className="text-[10px] font-mono text-sky-800 dark:text-sky-200">
                                      {(row.warning_codes ?? []).join(", ") || "—"}
                                    </TableCell>
                                    <TableCell className="text-xs">
                                      <ul className="list-disc pl-4 space-y-1">
                                        {row.bloqueio_motivos.map((m, i) => (
                                          <li key={i}>{m}</li>
                                        ))}
                                      </ul>
                                    </TableCell>
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </div>

                        {missingDeliveryResult.plano_geracao.bloco_b_bloqueados.length > 0 && (
                          <div className="mt-6 space-y-4">
                            <p className="text-sm font-semibold">
                              Dry-run expandido de prova — Blocos A a D (auditável, sem apply)
                            </p>
                            {missingDeliveryResult.plano_geracao.bloco_b_bloqueados.map((comm) => {
                              const p = comm.prova_expandida;
                              if (!p) return null;
                              return (
                                <div
                                  key={`proof-${comm.leader_id}-${comm.commission_id}`}
                                  className="rounded-lg border bg-muted/20 p-4 space-y-4"
                                >
                                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <p className="font-medium text-sm">
                                      {leaderNameFromContext(comm.leader_id, context)}{" "}
                                      <span className="text-muted-foreground font-normal">·</span>{" "}
                                      <span className="font-mono text-xs">{comm.commission_id}</span>
                                    </p>
                                    <Badge variant="outline" className="text-amber-800 border-amber-500/40">
                                      BLOQUEADO
                                    </Badge>
                                  </div>

                                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                                    <div className="rounded border bg-background p-2">
                                      <p className="text-[10px] text-muted-foreground uppercase tracking-tight">
                                        Bloco C — Resumo matemático
                                      </p>
                                      <p>paid ✓: {p.bloco_c_resumo.paidCount_correto}</p>
                                      <p>expected: {p.bloco_c_resumo.expectedBonuses_correto}</p>
                                      <p>granted válidos: {p.bloco_c_resumo.timesGranted_validos}</p>
                                      <p>granted inconsistentes: {p.bloco_c_resumo.timesGranted_inconsistentes}</p>
                                      <p className="mt-1 font-medium">
                                        faltantes teóricos: {p.bloco_c_resumo.faltantes_teoricos}
                                      </p>
                                      <p>
                                        gap só válidos vs expected: {p.bloco_c_resumo.faltantes_vs_apenas_validos}
                                      </p>
                                      <p>
                                        liberados p/ apply (regra atual):{" "}
                                        <span className="tabular-nums font-semibold">
                                          {p.bloco_c_resumo.faltantes_liberados_para_apply}
                                        </span>
                                      </p>
                                    </div>
                                    <div className="rounded border bg-background p-2 sm:col-span-3 space-y-2">
                                      <p className="text-[10px] text-muted-foreground uppercase tracking-tight">
                                        Bloco D — Decisão operacional
                                      </p>
                                      <p className="text-xs">
                                        <span className="text-muted-foreground">blocking_evidence_count:</span>{" "}
                                        <span className="font-mono tabular-nums">{p.blocking_evidence_count}</span>
                                        {" · "}
                                        <span className="text-muted-foreground">eligible_to_generate:</span>{" "}
                                        <span className="font-mono tabular-nums">
                                          {p.eligible_to_generate_missing_invitations}
                                        </span>
                                      </p>
                                      <p>
                                        apto_para_apply:{" "}
                                        <strong>{p.bloco_d_decisao.apto_para_apply ? "sim" : "não"}</strong>
                                      </p>
                                      <p>
                                        quantos seriam gerados (se apto):{" "}
                                        {p.bloco_d_decisao.quantos_convites_seriam_gerados_se_apto}
                                      </p>
                                      {p.warning_codes.length > 0 && (
                                        <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-2 text-xs">
                                          <p className="font-semibold text-sky-900 dark:text-sky-100">
                                            Avisos (não bloqueantes)
                                          </p>
                                          <p className="font-mono text-[10px]">{p.warning_codes.join(", ")}</p>
                                          <ul className="mt-1 list-disc pl-4">
                                            {p.warning_human_readable.map((m, i) => (
                                              <li key={i}>{m}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                      {p.bloco_d_decisao.motivos_bloqueio.length > 0 && (
                                        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2">
                                          <p className="text-xs font-semibold text-destructive">Bloqueios (reais)</p>
                                          <ul className="mt-1 list-disc pl-4 text-xs">
                                            {p.bloco_d_decisao.motivos_bloqueio.map((m, i) => (
                                              <li key={i}>{m}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                      {p.bloco_d_decisao.blocking_ids_snapshot &&
                                        p.bloco_d_decisao.blocking_ids_snapshot.leader_invitation_ids.length > 0 && (
                                          <div className="text-[10px] font-mono break-all">
                                            <span className="text-muted-foreground">IDs que sustentam bloqueio:</span>{" "}
                                            li: {p.bloco_d_decisao.blocking_ids_snapshot.leader_invitation_ids.join(", ")}
                                            {p.bloco_d_decisao.blocking_ids_snapshot.bonus_registration_ids.length > 0 && (
                                              <> · bonus_reg: {p.bloco_d_decisao.blocking_ids_snapshot.bonus_registration_ids.join(", ")}</>
                                            )}
                                          </div>
                                        )}
                                      {p.bloco_d_decisao.saneamento_sugerido.length > 0 && (
                                        <div className="mt-2">
                                          <p className="text-xs font-medium text-amber-900 dark:text-amber-100">
                                            Saneamento sugerido
                                          </p>
                                          <ul className="list-decimal pl-4 text-xs text-muted-foreground">
                                            {p.bloco_d_decisao.saneamento_sugerido.map((s, i) => (
                                              <li key={i}>{s}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <div>
                                    <p className="text-xs font-semibold mb-2">
                                      Bloco A — Convites válidos já concedidos (available | sent | used)
                                    </p>
                                    <div className="overflow-x-auto rounded border max-h-48">
                                      <Table className="text-xs">
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead>leader_invitation_id</TableHead>
                                            <TableHead>bonus_registration_id</TableHead>
                                            <TableHead>status</TableHead>
                                            <TableHead>created_at</TableHead>
                                            <TableHead>motivo</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {p.bloco_a_convites_validos.length === 0 ? (
                                            <TableRow>
                                              <TableCell colSpan={5} className="text-muted-foreground">
                                                Nenhum convite classificado como válido nesta comissão.
                                              </TableCell>
                                            </TableRow>
                                          ) : (
                                            p.bloco_a_convites_validos.map((a) => (
                                              <TableRow key={a.leader_invitation_id}>
                                                <TableCell className="font-mono">{a.leader_invitation_id}</TableCell>
                                                <TableCell className="font-mono">{a.bonus_registration_id ?? "—"}</TableCell>
                                                <TableCell>{a.status}</TableCell>
                                                <TableCell className="whitespace-nowrap">
                                                  {a.created_at?.slice(0, 19) ?? "—"}
                                                </TableCell>
                                                <TableCell className="max-w-[200px]">{a.motivo_validade}</TableCell>
                                              </TableRow>
                                            ))
                                          )}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </div>

                                  <div>
                                    <p className="text-xs font-semibold mb-2">
                                      Bloco B — Registros inconsistentes / fora do canônico
                                    </p>
                                    <div className="overflow-x-auto rounded border max-h-56">
                                      <Table className="text-xs">
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead>leader_invitation_id</TableHead>
                                            <TableHead>bonus_registration_id</TableHead>
                                            <TableHead>tipo</TableHead>
                                            <TableHead>impacta bloqueio</TableHead>
                                            <TableHead>detalhe</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {p.bloco_b_inconsistentes.length === 0 ? (
                                            <TableRow>
                                              <TableCell colSpan={5} className="text-muted-foreground">
                                                Nenhum item inconsistente listado.
                                              </TableCell>
                                            </TableRow>
                                          ) : (
                                            p.bloco_b_inconsistentes.map((b, idx) => (
                                              <TableRow key={`${b.leader_invitation_id ?? "x"}-${idx}`}>
                                                <TableCell className="font-mono">{b.leader_invitation_id ?? "—"}</TableCell>
                                                <TableCell className="font-mono">{b.bonus_registration_id ?? "—"}</TableCell>
                                                <TableCell>{b.tipo_inconsistencia}</TableCell>
                                                <TableCell>{b.impacta_bloqueio_geracao_futura ? "sim" : "não"}</TableCell>
                                                <TableCell className="max-w-[280px]">{b.motivo_detalhado}</TableCell>
                                              </TableRow>
                                            ))
                                          )}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {missingDeliveryResult.mode === "apply" && missingDeliveryResult.relatorio_depois && (
                      <Card>
                        <CardHeader className="py-3">
                          <CardTitle className="text-sm">3 — Relatório depois (apply)</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                          <p>
                            Convites criados:{" "}
                            <span className="font-semibold tabular-nums">
                              {missingDeliveryResult.relatorio_depois.convites_criados_total}
                            </span>
                          </p>
                          <p className="text-xs text-muted-foreground">{missingDeliveryResult.relatorio_depois.nota}</p>
                          {missingDeliveryResult.relatorio_depois.equivalencia_logica && (
                            <div className="rounded border bg-muted/30 p-2 text-xs space-y-1">
                              <p className="font-medium text-foreground">Equivalência (chaves lógicas)</p>
                              <p className="text-muted-foreground">
                                leader_invitations:{" "}
                                {missingDeliveryResult.relatorio_depois.equivalencia_logica.leader_invitations}
                              </p>
                              <p className="text-muted-foreground">
                                registrations:{" "}
                                {missingDeliveryResult.relatorio_depois.equivalencia_logica.registrations_free_bonus}
                              </p>
                            </div>
                          )}
                          <div className="grid gap-2 sm:grid-cols-2 text-xs">
                            <div>
                              <span className="font-medium">created</span>:{" "}
                              {missingDeliveryResult.relatorio_depois.created?.length ?? 0}
                            </div>
                            <div>
                              <span className="font-medium">skipped_existing</span>:{" "}
                              {missingDeliveryResult.relatorio_depois.skipped_existing?.length ?? 0}
                            </div>
                            <div>
                              <span className="font-medium">blocked</span>:{" "}
                              {missingDeliveryResult.relatorio_depois.blocked?.length ?? 0}
                            </div>
                            <div>
                              <span className="font-medium">failed</span>:{" "}
                              {missingDeliveryResult.relatorio_depois.failed?.length ?? 0}
                            </div>
                          </div>
                          {(missingDeliveryResult.relatorio_depois.skipped_existing?.length ?? 0) > 0 && (
                            <div className="max-h-40 overflow-auto rounded border p-2 text-xs font-mono">
                              {missingDeliveryResult.relatorio_depois.skipped_existing?.map((s, i) => (
                                <div key={i} className="mb-1 border-b border-dotted pb-1 last:border-0">
                                  {s.skip_reason_code} | commission {s.commission_id.slice(0, 8)}… | matched{" "}
                                  {s.matched_existing_id ?? "—"} | {s.constraint_name ?? "—"}
                                </div>
                              ))}
                            </div>
                          )}
                          {(missingDeliveryResult.relatorio_depois.blocked?.length ?? 0) > 0 && (
                            <div className="max-h-32 overflow-auto rounded border border-amber-500/30 p-2 text-xs">
                              {missingDeliveryResult.relatorio_depois.blocked?.map((b, i) => (
                                <div key={i} className="mb-1">
                                  {b.motivo_code}: {b.motivo}
                                </div>
                              ))}
                            </div>
                          )}
                          {(missingDeliveryResult.relatorio_depois.failed?.length ?? 0) > 0 && (
                            <div className="max-h-32 overflow-auto rounded border border-destructive/40 p-2 text-xs text-destructive">
                              {missingDeliveryResult.relatorio_depois.failed?.map((f, i) => (
                                <div key={i} className="mb-1">
                                  {f.error_message} {f.pg_code ? `(${f.pg_code})` : ""}
                                </div>
                              ))}
                            </div>
                          )}
                          <p className="text-xs font-mono break-all">
                            leader_invitation_ids:{" "}
                            {missingDeliveryResult.relatorio_depois.leader_invitation_ids_criados.slice(0, 15).join(", ")}
                            {missingDeliveryResult.relatorio_depois.leader_invitation_ids_criados.length > 15
                              ? " …"
                              : ""}
                          </p>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Detalhes técnicos */}
        {selectedEvent && (
          <Collapsible className="rounded-lg border bg-muted/5 px-4 py-2">
            <CollapsibleTrigger className="flex w-full items-center justify-between py-2 text-sm text-muted-foreground hover:text-foreground">
              Detalhes técnicos (IDs)
              <ChevronDown className="h-4 w-4" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pb-3 font-mono text-xs text-muted-foreground">
              <div>
                <span className="font-sans font-medium text-foreground">event_id:</span> {selectedEvent.id}
              </div>
              {leaderScope !== LEADER_ALL && (
                <div>
                  <span className="font-sans font-medium text-foreground">leader_id (filtro):</span> {leaderScope}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
