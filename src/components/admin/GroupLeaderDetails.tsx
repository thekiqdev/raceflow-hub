import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Copy, ExternalLink, Loader2, CheckCircle, XCircle, Search, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { 
  type GroupLeader, 
  getReferralsByLeader, 
  getCommissionsByLeader,
  getOrganizerReferralsByLeader,
  getOrganizerCommissionsByLeader,
  getLeaderInvitationProgress,
  type UserReferral, 
  type LeaderCommission,
  type LeaderInvitationProgressItem,
} from "@/lib/api/groupLeaders";
import { getLeaderCouponRegistrations, getAdminLeaderCouponRegistrations } from "@/lib/api/leaderRegistrations";
import type { LeaderRegistration } from "@/lib/api/leaderRegistrations";
import { getEventCommissionsByEvent, type EventCommissionOption } from "@/lib/api/leaderEventCommissions";
import { changeRegistrationCommission } from "@/lib/api/registrations";
import { LeaderEventCommissions } from "@/components/organizer/LeaderEventCommissions";
import { LeaderCoupons } from "@/components/organizer/LeaderCoupons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface GroupLeaderDetailsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leader: GroupLeader | null;
  onCopyCode: (code: string) => void;
  onCopyLink: (code: string) => void;
  isOrganizer?: boolean; // Indica se está sendo usado no contexto do organizador
}

export function GroupLeaderDetails({
  open,
  onOpenChange,
  leader,
  onCopyCode,
  onCopyLink,
  isOrganizer = false,
}: GroupLeaderDetailsProps) {
  const [referrals, setReferrals] = useState<UserReferral[]>([]);
  const [commissions, setCommissions] = useState<LeaderCommission[]>([]);
  const [invitationProgress, setInvitationProgress] = useState<LeaderInvitationProgressItem[]>([]);
  const [purchases, setPurchases] = useState<LeaderRegistration[]>([]);
  const [loadingReferrals, setLoadingReferrals] = useState(false);
  const [loadingCommissions, setLoadingCommissions] = useState(false);
  const [loadingInvitationProgress, setLoadingInvitationProgress] = useState(false);
  const [loadingPurchases, setLoadingPurchases] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [eventSearchTerm, setEventSearchTerm] = useState("");
  const [userSearchTerm, setUserSearchTerm] = useState<Record<string, string>>({});
  const [referralSearchTerm, setReferralSearchTerm] = useState("");
  const [invitationSearchTerm, setInvitationSearchTerm] = useState("");
  const [purchaseSearchTerm, setPurchaseSearchTerm] = useState("");
  const [registrationForChangeCoupon, setRegistrationForChangeCoupon] = useState<LeaderRegistration | null>(null);
  const [eventCommissionsForCoupon, setEventCommissionsForCoupon] = useState<EventCommissionOption[]>([]);
  const [selectedCommissionIdForChange, setSelectedCommissionIdForChange] = useState<string>("");
  const [changingCoupon, setChangingCoupon] = useState(false);

  useEffect(() => {
    if (open && leader) {
      loadReferrals();
      loadCommissions();
      loadInvitationProgress();
      loadPurchases();
    }
  }, [open, leader]);

  // Listen for tab switch events
  useEffect(() => {
    const handleTabSwitch = (event: CustomEvent) => {
      setActiveTab(event.detail);
    };

    window.addEventListener('leader-details:switch-tab', handleTabSwitch as EventListener);
    return () => {
      window.removeEventListener('leader-details:switch-tab', handleTabSwitch as EventListener);
    };
  }, []);

  const loadReferrals = async () => {
    if (!leader) return;

    setLoadingReferrals(true);
    try {
      const response = isOrganizer 
        ? await getOrganizerReferralsByLeader(leader.id)
        : await getReferralsByLeader(leader.id);
      if (response.success && response.data) {
        setReferrals(response.data);
      } else {
        toast.error(response.error || "Erro ao carregar referências");
      }
    } catch (error) {
      console.error("Erro ao carregar referências:", error);
      toast.error("Erro ao carregar referências");
    } finally {
      setLoadingReferrals(false);
    }
  };

  const loadCommissions = async () => {
    if (!leader) return;

    setLoadingCommissions(true);
    try {
      const response = isOrganizer
        ? await getOrganizerCommissionsByLeader(leader.id)
        : await getCommissionsByLeader(leader.id);
      if (response.success && response.data) {
        setCommissions(response.data);
      } else {
        toast.error(response.error || "Erro ao carregar comissões");
      }
    } catch (error) {
      console.error("Erro ao carregar comissões:", error);
      toast.error("Erro ao carregar comissões");
    } finally {
      setLoadingCommissions(false);
    }
  };

  const loadInvitationProgress = async () => {
    if (!leader) return;

    setLoadingInvitationProgress(true);
    try {
      const response = await getLeaderInvitationProgress(leader.id, isOrganizer);
      if (response.success && response.data) {
        setInvitationProgress(response.data);
      }
    } catch (error) {
      console.error("Erro ao carregar progresso de convites:", error);
    } finally {
      setLoadingInvitationProgress(false);
    }
  };

  const loadPurchases = async () => {
    if (!leader) return;

    setLoadingPurchases(true);
    try {
      const response = isOrganizer
        ? await getLeaderCouponRegistrations(leader.id)
        : await getAdminLeaderCouponRegistrations(leader.id);
      if (response.success) {
        const list = Array.isArray(response.data) ? response.data : (response as any).data ?? [];
        setPurchases(list);
      }
    } catch (error) {
      console.error("Erro ao carregar compras:", error);
      toast.error("Erro ao carregar compras");
    } finally {
      setLoadingPurchases(false);
    }
  };

  const handleOpenChangeCoupon = async (reg: LeaderRegistration) => {
    setRegistrationForChangeCoupon(reg);
    setSelectedCommissionIdForChange("");
    try {
      const response = await getEventCommissionsByEvent(reg.event_id, !isOrganizer);
      if (response.success && response.data) {
        const list = Array.isArray(response.data) ? response.data : [];
        const forLeader = list.filter((c: EventCommissionOption) => c.leader_id === leader?.id);
        setEventCommissionsForCoupon(forLeader);
      }
    } catch (error) {
      console.error("Erro ao carregar comissões do evento:", error);
      toast.error("Erro ao carregar comissões");
    }
  };

  const handleConfirmChangeCoupon = async () => {
    if (!registrationForChangeCoupon || !selectedCommissionIdForChange) return;
    setChangingCoupon(true);
    try {
      const response = await changeRegistrationCommission(registrationForChangeCoupon.id, {
        leader_event_commission_id: selectedCommissionIdForChange,
      });
      if (response.success) {
        toast.success((response as any).message || "Cupom trocado com sucesso");
        setRegistrationForChangeCoupon(null);
        loadPurchases();
        loadInvitationProgress();
      } else {
        toast.error((response as any).message || (response as any).error || "Erro ao trocar cupom");
      }
    } catch (error: any) {
      console.error("Erro ao trocar cupom:", error);
      toast.error(error?.response?.data?.message || error.message || "Erro ao trocar cupom");
    } finally {
      setChangingCoupon(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const pendingCommissions = (commissions || []).filter((c) => c.status === "pending");
  const paidCommissions = (commissions || []).filter((c) => c.status === "paid");
  const totalPending = pendingCommissions.reduce((sum, c) => {
    const amount = typeof c.commission_amount === 'string' ? parseFloat(c.commission_amount) : (c.commission_amount || 0);
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);
  const totalPaid = paidCommissions.reduce((sum, c) => {
    const amount = typeof c.commission_amount === 'string' ? parseFloat(c.commission_amount) : (c.commission_amount || 0);
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);

  // Group commissions by event
  const commissionsByEvent = useMemo(() => {
    const grouped: Record<string, LeaderCommission[]> = {};
    (commissions || []).forEach((commission) => {
      const eventId = commission.event_id;
      if (!grouped[eventId]) {
        grouped[eventId] = [];
      }
      grouped[eventId].push(commission);
    });
    return grouped;
  }, [commissions]);

  // Get unique events with statistics
  const eventsWithStats = useMemo(() => {
    const eventMap = new Map<string, {
      event_id: string;
      event_title: string;
      commissions: LeaderCommission[];
      totalCommissions: number;
      totalAmount: number;
      pendingAmount: number;
      paidAmount: number;
      pendingCount: number;
      paidCount: number;
    }>();

    (commissions || []).forEach((commission) => {
      const eventId = commission.event_id;
      const eventTitle = commission.event_title || "N/A";

      if (!eventMap.has(eventId)) {
        eventMap.set(eventId, {
          event_id: eventId,
          event_title: eventTitle,
          commissions: [],
          totalCommissions: 0,
          totalAmount: 0,
          pendingAmount: 0,
          paidAmount: 0,
          pendingCount: 0,
          paidCount: 0,
        });
      }

      const event = eventMap.get(eventId)!;
      event.commissions.push(commission);
      event.totalCommissions++;
      
      const commissionAmount = typeof commission.commission_amount === 'string' 
        ? parseFloat(commission.commission_amount) 
        : (commission.commission_amount || 0);
      const amount = isNaN(commissionAmount) ? 0 : commissionAmount;
      
      event.totalAmount += amount;

      if (commission.status === "pending") {
        event.pendingAmount += amount;
        event.pendingCount++;
      } else if (commission.status === "paid") {
        event.paidAmount += amount;
        event.paidCount++;
      }
    });

    return Array.from(eventMap.values()).sort((a, b) => {
      // Sort by most recent commission date
      const aLatest = a.commissions.sort((c1, c2) => 
        new Date(c2.created_at).getTime() - new Date(c1.created_at).getTime()
      )[0];
      const bLatest = b.commissions.sort((c1, c2) => 
        new Date(c2.created_at).getTime() - new Date(c1.created_at).getTime()
      )[0];
      return new Date(bLatest.created_at).getTime() - new Date(aLatest.created_at).getTime();
    });
  }, [commissions || []]);

  // Filter events by search term
  const filteredEvents = useMemo(() => {
    if (!eventSearchTerm.trim()) {
      return eventsWithStats;
    }
    const searchLower = eventSearchTerm.toLowerCase();
    return eventsWithStats.filter((event) =>
      event.event_title.toLowerCase().includes(searchLower)
    );
  }, [eventsWithStats, eventSearchTerm]);

  // Filter referrals by search (nome, email, CPF)
  const filteredReferrals = useMemo(() => {
    if (!referralSearchTerm.trim()) return referrals;
    const q = referralSearchTerm.toLowerCase();
    return referrals.filter(
      (r) =>
        (r.full_name || "").toLowerCase().includes(q) ||
        (r.email || "").toLowerCase().includes(q) ||
        (r.cpf || "").replace(/\D/g, "").includes(q.replace(/\D/g, ""))
    );
  }, [referrals, referralSearchTerm]);

  // Filter invitation progress by event title
  const filteredInvitationProgress = useMemo(() => {
    if (!invitationSearchTerm.trim()) return invitationProgress;
    const q = invitationSearchTerm.toLowerCase();
    return invitationProgress.filter((item) =>
      (item.event_title || "").toLowerCase().includes(q)
    );
  }, [invitationProgress, invitationSearchTerm]);

  // Filter purchases by evento, participante, cupom
  const filteredPurchases = useMemo(() => {
    if (!purchaseSearchTerm.trim()) return purchases;
    const q = purchaseSearchTerm.toLowerCase();
    return purchases.filter(
      (p) =>
        (p.event_title || "").toLowerCase().includes(q) ||
        (p.runner_name || "").toLowerCase().includes(q) ||
        (p.runner_email || "").toLowerCase().includes(q) ||
        (p.coupon_code || "").toLowerCase().includes(q)
    );
  }, [purchases, purchaseSearchTerm]);

  // Filter commissions by user search term for a specific event
  const getFilteredCommissionsForEvent = (eventId: string) => {
    const eventCommissions = commissionsByEvent[eventId] || [];
    const searchTerm = userSearchTerm[eventId] || "";
    
    if (!searchTerm.trim()) {
      return eventCommissions;
    }
    
    const searchLower = searchTerm.toLowerCase();
    return eventCommissions.filter((commission) => {
      const userName = commission.referred_user_name || "";
      const userEmail = commission.referred_user_email || "";
      return (
        userName.toLowerCase().includes(searchLower) ||
        userEmail.toLowerCase().includes(searchLower)
      );
    });
  };

  if (!leader) return null;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes do Líder</DialogTitle>
          <DialogDescription>Código: {leader.referral_code}</DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList>
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="referrals">Referências ({referrals.length})</TabsTrigger>
            <TabsTrigger value="commissions">Comissões ({commissions.length})</TabsTrigger>
            <TabsTrigger value="invitation-progress">Progresso de Convites ({invitationProgress.length})</TabsTrigger>
            <TabsTrigger value="purchases">Compras ({purchases.length})</TabsTrigger>
            <TabsTrigger value="event-commissions">Comissões por Evento</TabsTrigger>
            <TabsTrigger value="coupons">Cupons Exclusivos</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Código de Referência</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <code className="text-lg font-mono bg-muted px-3 py-2 rounded flex-1">
                      {leader.referral_code}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => onCopyCode(leader.referral_code)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Link de Referência</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono bg-muted px-3 py-2 rounded flex-1 truncate">
                      {window.location.origin}/cadastro?ref={leader.referral_code}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => onCopyLink(leader.referral_code)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Status</CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge variant={leader.is_active ? "default" : "secondary"}>
                    {leader.is_active ? (
                      <>
                        <CheckCircle className="mr-1 h-3 w-3" />
                        Ativo
                      </>
                    ) : (
                      <>
                        <XCircle className="mr-1 h-3 w-3" />
                        Inativo
                      </>
                    )}
                  </Badge>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Comissão</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">
                    Configure comissões por evento na aba "Comissões por Evento"
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total Referências</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-lg font-semibold">{leader.total_referrals}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total Ganhos</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-lg font-semibold">
                    {formatCurrency(leader.total_earnings)}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Comissões Pendentes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-yellow-600">
                    {formatCurrency(totalPending)}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {pendingCommissions.length} comissão(ões)
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Comissões Pagas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {formatCurrency(totalPaid)}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {paidCommissions.length} comissão(ões)
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="referrals" className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, e-mail ou CPF..."
                value={referralSearchTerm}
                onChange={(e) => setReferralSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            {loadingReferrals ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Data de Cadastro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReferrals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        {referrals.length === 0 ? "Nenhuma referência encontrada" : "Nenhum resultado para a busca"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredReferrals.map((referral) => (
                      <TableRow key={referral.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{referral.full_name || "N/A"}</div>
                            <div className="text-sm text-muted-foreground">{referral.email}</div>
                          </div>
                        </TableCell>
                        <TableCell>{referral.cpf || "N/A"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {referral.referral_type === "link" ? "Link" : "Código"}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(referral.created_at)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="commissions" className="space-y-4">
            {loadingCommissions ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : commissions.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">Nenhuma comissão encontrada</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {/* Busca de Eventos */}
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por evento..."
                    value={eventSearchTerm}
                    onChange={(e) => setEventSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {/* Lista de Eventos */}
                {filteredEvents.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <p className="text-muted-foreground">Nenhum evento encontrado</p>
                    </CardContent>
                  </Card>
                ) : (
                  <Accordion type="single" collapsible className="w-full">
                    {filteredEvents.map((event) => {
                      const filteredCommissions = getFilteredCommissionsForEvent(event.event_id);
                      return (
                        <AccordionItem key={event.event_id} value={event.event_id}>
                          <AccordionTrigger className="hover:no-underline">
                            <div className="flex items-center justify-between w-full pr-4">
                              <div className="flex-1 text-left">
                                <div className="font-semibold">{event.event_title}</div>
                                <div className="text-sm text-muted-foreground mt-1">
                                  {event.totalCommissions} comissão(ões) • Total: {formatCurrency(event.totalAmount)}
                                </div>
                              </div>
                              <div className="flex items-center gap-4 text-sm">
                                <div className="text-right">
                                  <div className="text-yellow-600 font-semibold">
                                    {formatCurrency(event.pendingAmount)}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {event.pendingCount} pendente(s)
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-green-600 font-semibold">
                                    {formatCurrency(event.paidAmount)}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {event.paidCount} paga(s)
                                  </div>
                                </div>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-4 pt-4">
                              {/* Busca de Usuários dentro do evento */}
                              <div className="relative">
                                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                  placeholder="Buscar por usuário..."
                                  value={userSearchTerm[event.event_id] || ""}
                                  onChange={(e) => {
                                    setUserSearchTerm((prev) => ({
                                      ...prev,
                                      [event.event_id]: e.target.value,
                                    }));
                                  }}
                                  className="pl-10"
                                />
                              </div>

                              {/* Tabela de Comissões do Evento */}
                              {filteredCommissions.length === 0 ? (
                                <Card>
                                  <CardContent className="py-8 text-center">
                                    <p className="text-muted-foreground">Nenhuma comissão encontrada</p>
                                  </CardContent>
                                </Card>
                              ) : (
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Usuário Referenciado</TableHead>
                                      <TableHead>Valor Inscrição</TableHead>
                                      <TableHead>Comissão</TableHead>
                                      <TableHead>Percentual</TableHead>
                                      <TableHead>Status</TableHead>
                                      <TableHead>Data</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {filteredCommissions.map((commission) => (
                                      <TableRow key={commission.id}>
                                        <TableCell>
                                          <div>
                                            <div className="font-medium">
                                              {commission.referred_user_name || "N/A"}
                                            </div>
                                            <div className="text-sm text-muted-foreground">
                                              {commission.referred_user_email}
                                            </div>
                                          </div>
                                        </TableCell>
                                        <TableCell>{formatCurrency(commission.registration_amount)}</TableCell>
                                        <TableCell className="font-semibold">
                                          {formatCurrency(commission.commission_amount)}
                                        </TableCell>
                                        <TableCell>{commission.commission_percentage}%</TableCell>
                                        <TableCell>
                                          <Badge
                                            variant={
                                              commission.status === "paid"
                                                ? "default"
                                                : commission.status === "pending"
                                                ? "secondary"
                                                : "destructive"
                                            }
                                          >
                                            {commission.status === "paid"
                                              ? "Pago"
                                              : commission.status === "pending"
                                              ? "Pendente"
                                              : "Cancelado"}
                                          </Badge>
                                        </TableCell>
                                        <TableCell>{formatDate(commission.created_at)}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              )}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="invitation-progress" className="space-y-4">
            {loadingInvitationProgress ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : invitationProgress.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">Nenhuma comissão com bônus de convite configurada</p>
                  <p className="text-sm text-muted-foreground mt-1">Configure comissões tipo &quot;Convite&quot; ou &quot;Comissão + Convite&quot; na aba Comissões por Evento</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por evento..."
                    value={invitationSearchTerm}
                    onChange={(e) => setInvitationSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Regra: a cada X inscrições pagas com o cupom do líder, ele ganha 1 convite (inscrição grátis) no evento.
                </p>
                <div className="grid gap-4">
                  {filteredInvitationProgress.length === 0 ? (
                    <p className="text-center text-muted-foreground py-6">
                      {invitationProgress.length === 0 ? "Nenhuma comissão com bônus de convite configurada" : "Nenhum resultado para a busca"}
                    </p>
                  ) : (
                  filteredInvitationProgress.map((item) => (
                    <Card key={item.commission_id}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{item.event_title}</CardTitle>
                        <CardDescription>
                          {item.commission_name || "Comissão"} • {item.required_purchases} inscrições pagas = 1 convite
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex flex-wrap gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Inscrições pagas:</span>{" "}
                            <span className="font-medium">{item.paid_count}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Convites já ganhos:</span>{" "}
                            <span className="font-medium">{item.invitations_granted}</span>
                          </div>
                          <div>
                            {item.next_convite_in === 0 ? (
                              <span className="text-green-600 font-medium">Próximo convite já disponível</span>
                            ) : (
                              <>
                                <span className="text-muted-foreground">Próximo convite em:</span>{" "}
                                <span className="font-medium">{item.next_convite_in} inscrições pagas</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{
                              width: `${item.next_convite_in === 0 ? 100 : ((item.required_purchases - item.next_convite_in) / item.required_purchases) * 100}%`,
                            }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {item.next_convite_in === 0
                            ? "Próximo convite já disponível (atingiu a cota)"
                            : `Progresso: ${item.required_purchases - item.next_convite_in}/${item.required_purchases} para o próximo convite`}
                        </p>
                      </CardContent>
                    </Card>
                  ))
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="purchases" className="space-y-4">
            {loadingPurchases ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : purchases.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">Nenhuma compra com cupom deste líder</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por evento, participante ou cupom..."
                      value={purchaseSearchTerm}
                      onChange={(e) => setPurchaseSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-muted-foreground hidden sm:block">
                      Inscrições com cupons do líder
                    </p>
                    <Button variant="outline" size="sm" onClick={loadPurchases} disabled={loadingPurchases}>
                      <RefreshCw className={`h-4 w-4 mr-1 ${loadingPurchases ? "animate-spin" : ""}`} />
                      Atualizar
                    </Button>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Evento</TableHead>
                      <TableHead>Participante</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Status pagamento</TableHead>
                      <TableHead>Cupom</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPurchases.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          {purchases.length === 0 ? "Nenhuma compra com cupom deste líder" : "Nenhum resultado para a busca"}
                        </TableCell>
                      </TableRow>
                    ) : (
                    filteredPurchases.map((reg) => (
                      <TableRow key={reg.id}>
                        <TableCell>
                          <div className="font-medium">{reg.event_title}</div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{reg.runner_name || "—"}</div>
                            <div className="text-xs text-muted-foreground">{reg.runner_email}</div>
                          </div>
                        </TableCell>
                        <TableCell>{formatCurrency(reg.total_amount ?? 0)}</TableCell>
                        <TableCell>
                          <Badge variant={reg.payment_status === "paid" ? "default" : reg.payment_status === "pending" ? "secondary" : "outline"}>
                            {reg.payment_status === "paid" ? "Pago" : reg.payment_status === "pending" ? "Pendente" : "Cancelado"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{reg.coupon_code || "—"}</TableCell>
                        <TableCell>{reg.created_at ? formatDate(reg.created_at) : "—"}</TableCell>
                        <TableCell className="text-right">
                          {reg.payment_status === "paid" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenChangeCoupon(reg)}
                            >
                              Trocar cupom
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="event-commissions" className="space-y-4">
            {leader && <LeaderEventCommissions leaderId={leader.id} isAdmin={!isOrganizer} />}
          </TabsContent>

          <TabsContent value="coupons" className="space-y-4">
            {leader && <LeaderCoupons leaderId={leader.id} isAdmin={!isOrganizer} />}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>

    {/* Modal Trocar cupom */}
    <Dialog open={!!registrationForChangeCoupon} onOpenChange={(open) => !open && setRegistrationForChangeCoupon(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Trocar cupom da inscrição</DialogTitle>
          <DialogDescription>
            {registrationForChangeCoupon && (
              <>
                Inscrição: {registrationForChangeCoupon.runner_name || registrationForChangeCoupon.runner_email} • {registrationForChangeCoupon.event_title}
                <br />
                Cupom atual: <code className="text-xs bg-muted px-1">{registrationForChangeCoupon.coupon_code || "—"}</code>
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {registrationForChangeCoupon && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Novo cupom (comissão por evento do líder + evento)</Label>
              <Select
                value={selectedCommissionIdForChange}
                onValueChange={setSelectedCommissionIdForChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma comissão/cupom" />
                </SelectTrigger>
                <SelectContent>
                  {eventCommissionsForCoupon.map((ec) => (
                    <SelectItem key={ec.id} value={ec.id}>
                      <span className="font-medium">{ec.name || ec.leader_referral_code}</span>
                      <span className="text-muted-foreground"> • {ec.commission_percentage}%</span>
                      {ec.bonus_type === "invitation" && <span className="text-muted-foreground"> • Convite</span>}
                      {ec.bonus_type === "both" && <span className="text-muted-foreground"> • Comissão + Convite</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                O bônus do cupom anterior será subtraído e o do novo cupom será aplicado.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRegistrationForChangeCoupon(null)} disabled={changingCoupon}>
                Cancelar
              </Button>
              <Button
                onClick={handleConfirmChangeCoupon}
                disabled={!selectedCommissionIdForChange || changingCoupon}
              >
                {changingCoupon ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Trocar cupom
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}

