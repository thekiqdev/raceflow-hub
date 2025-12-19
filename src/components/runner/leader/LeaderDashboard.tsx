import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  UserCog,
  Copy,
  ExternalLink,
  Users,
  DollarSign,
  TrendingUp,
  Loader2,
  CheckCircle,
  XCircle,
  Calendar,
  Search,
  Gift,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import {
  getMyGroupLeader,
  getMyReferrals,
  getMyCommissions,
  getMyStats,
  type GroupLeader,
  type UserReferral,
  type LeaderCommission,
} from "@/lib/api/groupLeaders";
import { getMyEventCommissions, type LeaderEventCommission } from "@/lib/api/leaderEventCommissions";
import { getMyCouponRegistrations, type LeaderRegistration } from "@/lib/api/leaderRegistrations";
import { getMyInvitations, sendInvitation, type LeaderInvitation } from "@/lib/api/leaderInvitations";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function LeaderDashboard() {
  const [loading, setLoading] = useState(true);
  const [leader, setLeader] = useState<GroupLeader | null>(null);
  const [referrals, setReferrals] = useState<UserReferral[]>([]);
  const [commissions, setCommissions] = useState<LeaderCommission[]>([]);
  const [eventCommissions, setEventCommissions] = useState<LeaderEventCommission[]>([]);
  const [couponRegistrations, setCouponRegistrations] = useState<LeaderRegistration[]>([]);
  const [loadingRegistrations, setLoadingRegistrations] = useState(false);
  const [eventSearch, setEventSearch] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<string>("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("all");
  const [invitations, setInvitations] = useState<LeaderInvitation[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [sendInvitationDialogOpen, setSendInvitationDialogOpen] = useState(false);
  const [selectedInvitation, setSelectedInvitation] = useState<LeaderInvitation | null>(null);
  const [runnerCpf, setRunnerCpf] = useState("");
  const [sendingInvitation, setSendingInvitation] = useState(false);
  const [stats, setStats] = useState<{
    total_referrals: number;
    total_registrations: number;
    total_commissions: number;
    pending_commissions: number;
    paid_commissions: number;
  } | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    loadLeaderData();
  }, []);

  const loadLeaderData = async () => {
    try {
      setLoading(true);
      const [leaderResponse, referralsResponse, commissionsResponse, statsResponse, eventCommissionsResponse] = await Promise.all([
        getMyGroupLeader(),
        getMyReferrals(),
        getMyCommissions(),
        getMyStats(),
        getMyEventCommissions(),
      ]);

      if (leaderResponse.success && leaderResponse.data) {
        setLeader(leaderResponse.data);
      }

      if (referralsResponse.success && referralsResponse.data) {
        setReferrals(referralsResponse.data);
      }

      if (commissionsResponse.success && commissionsResponse.data) {
        setCommissions(commissionsResponse.data);
      }

      if (statsResponse.success && statsResponse.data?.stats) {
        setStats(statsResponse.data.stats);
      }

      if (eventCommissionsResponse.success && eventCommissionsResponse.data) {
        setEventCommissions(eventCommissionsResponse.data);
      }
    } catch (error: any) {
      console.error("Erro ao carregar dados do líder:", error);
      if (error.message?.includes("not a group leader")) {
        // Usuário não é líder, não mostrar erro
        return;
      }
      toast.error("Erro ao carregar dados do líder");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Código copiado!");
  };

  const handleCopyLink = (code: string) => {
    const link = `${window.location.origin}/cadastro?ref=${code}`;
    navigator.clipboard.writeText(link);
    toast.success("Link copiado!");
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
    });
  };

  const loadCouponRegistrations = async () => {
    setLoadingRegistrations(true);
    try {
      const filters: {
        event_id?: string;
        payment_status?: 'pending' | 'paid' | 'cancelled';
      } = {};
      
      if (selectedEventId && selectedEventId !== "all") {
        filters.event_id = selectedEventId;
      }
      
      if (paymentStatusFilter && paymentStatusFilter !== "all") {
        filters.payment_status = paymentStatusFilter as 'pending' | 'paid' | 'cancelled';
      }
      
      const response = await getMyCouponRegistrations(filters);
      console.log('📊 Resposta completa:', response);
      if (response.success && response.data) {
        // Backend retorna { data: { data: registrations, count: number } }
        const registrations = (response.data as any)?.data || [];
        console.log('📊 Registrações carregadas:', registrations.length, registrations);
        setCouponRegistrations(registrations);
      } else {
        console.error('❌ Erro ao carregar registrações:', response.error);
      }
    } catch (error) {
      console.error("Erro ao carregar registrações:", error);
      toast.error("Erro ao carregar registrações");
    } finally {
      setLoadingRegistrations(false);
    }
  };

  useEffect(() => {
    if (leader) {
      loadCouponRegistrations();
      loadInvitations();
    }
  }, [selectedEventId, paymentStatusFilter, leader]);

  const loadInvitations = async () => {
    setLoadingInvitations(true);
    try {
      const response = await getMyInvitations();
      if (response.success && response.data) {
        setInvitations(response.data);
      }
    } catch (error) {
      console.error("Erro ao carregar convites:", error);
      toast.error("Erro ao carregar convites");
    } finally {
      setLoadingInvitations(false);
    }
  };

  const handleOpenSendDialog = (invitation: LeaderInvitation) => {
    setSelectedInvitation(invitation);
    setRunnerCpf("");
    setSendInvitationDialogOpen(true);
  };

  const handleSendInvitation = async () => {
    if (!selectedInvitation || !runnerCpf.trim()) {
      toast.error("Por favor, informe o CPF do runner");
      return;
    }

    setSendingInvitation(true);
    try {
      const response = await sendInvitation({
        invitation_id: selectedInvitation.id,
        runner_cpf: runnerCpf.trim(),
      });

      if (response.success) {
        toast.success("Convite enviado com sucesso!");
        setSendInvitationDialogOpen(false);
        setSelectedInvitation(null);
        setRunnerCpf("");
        loadInvitations();
      } else {
        toast.error(response.error || "Erro ao enviar convite");
      }
    } catch (error: any) {
      console.error("Erro ao enviar convite:", error);
      toast.error(error.message || "Erro ao enviar convite");
    } finally {
      setSendingInvitation(false);
    }
  };

  // Get unique events from event commissions (events with leader coupons)
  const uniqueEvents = Array.from(
    new Map(
      eventCommissions.map((ec) => [ec.event_id, { id: ec.event_id, title: ec.event_title || "Evento" }])
    ).values()
  );

  // Filter events by search
  const filteredEvents = uniqueEvents.filter((event) =>
    event.title.toLowerCase().includes(eventSearch.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!leader) {
    return null; // Não é líder, não mostrar nada
  }

  const referralLink = `${window.location.origin}/cadastro?ref=${leader.referral_code}`;
  const pendingCommissions = commissions.filter((c) => c.status === "pending");
  const paidCommissions = commissions.filter((c) => c.status === "paid");
  const totalPending = pendingCommissions.reduce((sum, c) => sum + c.commission_amount, 0);
  const totalPaid = paidCommissions.reduce((sum, c) => sum + c.commission_amount, 0);

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="bg-gradient-hero p-6">
        <div className="flex items-center gap-3 mb-2">
          <UserCog className="h-6 w-6 text-white" />
          <h1 className="text-2xl font-bold text-white">Líder de Grupo</h1>
        </div>
        <p className="text-white/80 text-sm">
          Gerencie seu código de referência e acompanhe suas comissões
        </p>
      </div>

      {/* Overview Cards */}
      <div className="px-4 mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-muted-foreground">Referências</div>
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-bold text-primary">
                {stats?.total_referrals || leader.total_referrals || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-muted-foreground">Ganhos Totais</div>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(leader.total_earnings)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Referral Code Card */}
        <Card className="shadow-lg">
          <CardContent className="p-6">
            <div className="mb-4">
              <h3 className="font-semibold mb-1">Seu Código de Referência</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Compartilhe este código ou link para ganhar comissões
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-2 block">Código</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-muted px-4 py-3 rounded-lg text-lg font-mono font-bold text-center">
                    {leader.referral_code}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleCopyCode(leader.referral_code)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-2 block">Link de Referência</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-muted px-4 py-2 rounded-lg text-xs font-mono truncate">
                    {referralLink}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleCopyLink(leader.referral_code)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="pt-2 border-t">
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-muted-foreground">Status</span>
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
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-muted-foreground">Comissões Pendentes</div>
                <TrendingUp className="h-4 w-4 text-yellow-600" />
              </div>
              <div className="text-xl font-bold text-yellow-600">
                {formatCurrency(totalPending)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {pendingCommissions.length} comissão(ões)
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-muted-foreground">Comissões Pagas</div>
                <CheckCircle className="h-4 w-4 text-green-600" />
              </div>
              <div className="text-xl font-bold text-green-600">
                {formatCurrency(totalPaid)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {paidCommissions.length} comissão(ões)
              </div>
            </CardContent>
          </Card>
        </div>

         {/* Tabs */}
         <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
           <TabsList className="flex flex-wrap w-full gap-1.5 md:gap-2 p-1.5 md:p-2 h-auto">
             <TabsTrigger value="referrals" className="flex-1 min-w-[calc(50%-0.375rem)] md:min-w-0 md:flex-none text-xs md:text-sm px-2 md:px-3 py-2 whitespace-nowrap">
               Referências ({referrals.length})
             </TabsTrigger>
             <TabsTrigger value="commissions" className="flex-1 min-w-[calc(50%-0.375rem)] md:min-w-0 md:flex-none text-xs md:text-sm px-2 md:px-3 py-2 whitespace-nowrap">
               Comissões ({commissions.length})
             </TabsTrigger>
             <TabsTrigger value="event-commissions" className="flex-1 min-w-[calc(50%-0.375rem)] md:min-w-0 md:flex-none text-xs md:text-sm px-2 md:px-3 py-2 whitespace-nowrap">
               Links de Eventos ({eventCommissions.length})
             </TabsTrigger>
             <TabsTrigger value="purchases" className="flex-1 min-w-[calc(50%-0.375rem)] md:min-w-0 md:flex-none text-xs md:text-sm px-2 md:px-3 py-2 whitespace-nowrap">
               Compras ({couponRegistrations.length})
             </TabsTrigger>
             <TabsTrigger value="invitations" className="flex-1 min-w-[calc(50%-0.375rem)] md:min-w-0 md:flex-none text-xs md:text-sm px-2 md:px-3 py-2 whitespace-nowrap">
               Convites ({invitations.filter(i => i.status === 'available').length})
             </TabsTrigger>
           </TabsList>

          <TabsContent value="referrals" className="space-y-4 mt-4">
            {referrals.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Nenhuma referência ainda</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Compartilhe seu código ou link para começar a ganhar comissões
                  </p>
                </CardContent>
              </Card>
            ) : (
              referrals.map((referral) => (
                <Card key={referral.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-semibold mb-1">
                          {referral.full_name || "Usuário"}
                        </div>
                        <div className="text-sm text-muted-foreground mb-2">
                          {referral.email}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {referral.referral_type === "link" ? "Link" : "Código"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(referral.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="event-commissions" className="space-y-4 mt-4">
            {eventCommissions.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Nenhuma comissão por evento configurada</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Os organizadores podem criar comissões específicas por evento para você
                  </p>
                </CardContent>
              </Card>
            ) : (
              eventCommissions.map((commission) => {
                const stats = commission.stats || { paid_registrations: 0, invitations_earned: 0, total_commission_earned: 0 };
                const paidCount = stats.paid_registrations;
                const invitationsEarned = stats.invitations_earned;
                const totalCommissionEarned = stats.total_commission_earned || 0;
                const requiredPurchases = commission.required_purchases || 0;
                
                // Calculate progress for next invitation
                let nextInvitationProgress = 0;
                let remainingForNext = 0;
                
                if (commission.bonus_type === 'invitation' || commission.bonus_type === 'both') {
                  if (requiredPurchases > 0) {
                    // Calculate how many invitations should have been earned
                    const expectedInvitations = Math.floor(paidCount / requiredPurchases);
                    // Calculate progress towards next invitation
                    const currentCycle = paidCount % requiredPurchases;
                    nextInvitationProgress = (currentCycle / requiredPurchases) * 100;
                    remainingForNext = requiredPurchases - currentCycle;
                  }
                }
                
                return (
                <Card key={commission.id}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="font-semibold mb-1">
                          {commission.event_title || "Evento"}
                        </div>
                        <div className="text-sm text-muted-foreground mb-2">
                          {commission.event_date
                            ? formatDate(commission.event_date)
                            : "Data não informada"}
                        </div>
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          {commission.bonus_type === 'commission' && (
                            <Badge variant="default" className="text-xs">
                              💰 Comissão: {commission.commission_percentage}%
                            </Badge>
                          )}
                          {commission.bonus_type === 'invitation' && (
                            <Badge variant="secondary" className="text-xs">
                              🎁 Convite: {requiredPurchases} compras
                            </Badge>
                          )}
                          {commission.bonus_type === 'both' && (
                            <>
                              <Badge variant="default" className="text-xs">
                                💰 Comissão: {commission.commission_percentage}%
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                🎁 Convite: {requiredPurchases} compras
                              </Badge>
                            </>
                          )}
                        </div>
                        
                        {/* Display total commission earned for commission/both types */}
                        {(commission.bonus_type === 'commission' || commission.bonus_type === 'both') && (
                          <div className="mt-3 p-3 bg-muted/50 rounded-md">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-muted-foreground">
                                Total de Comissão Ganha:
                              </span>
                              <span className="text-lg font-bold text-green-600">
                                R$ {totalCommissionEarned.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        )}
                        
                        {/* Progress bar for invitations */}
                        {(commission.bonus_type === 'invitation' || commission.bonus_type === 'both') && requiredPurchases > 0 && (
                          <div className="mt-4 space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">
                                Convites ganhos: <strong className="text-foreground">{invitationsEarned}</strong>
                              </span>
                              <span className="text-muted-foreground">
                                Compras pagas: <strong className="text-foreground">{paidCount}</strong>
                              </span>
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>Progresso para próximo convite</span>
                                <span>{remainingForNext > 0 ? `${remainingForNext} compras restantes` : 'Pronto para ganhar!'}</span>
                              </div>
                              <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                                <div
                                  className="bg-primary h-2.5 rounded-full transition-all duration-300"
                                  style={{ width: `${Math.min(nextInvitationProgress, 100)}%` }}
                                />
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {paidCount} / {requiredPurchases} compras neste ciclo
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {commission.coupon?.link ? (
                      <div className="pt-4 border-t">
                        <label className="text-xs text-muted-foreground mb-2 block">
                          Link de Referência com Cupom
                        </label>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 bg-muted px-4 py-2 rounded-lg text-xs font-mono break-all">
                            {commission.coupon.link}
                          </code>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => {
                              navigator.clipboard.writeText(commission.coupon!.link);
                              toast.success("Link copiado!");
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => {
                              const link = commission.coupon!.link;
                              // Clean link if it has multiple URLs (shouldn't happen, but just in case)
                              const cleanLink = link.includes(',') ? link.split(',')[0].trim() : link;
                              window.open(cleanLink, '_blank', 'noopener,noreferrer');
                            }}
                            title="Abrir link em nova aba"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Cupom: <strong>{commission.coupon.code}</strong> - Compartilhe este link para que as pessoas se inscrevam com desconto automático
                        </p>
                      </div>
                    ) : (
                      <div className="pt-4 border-t">
                        <p className="text-xs text-muted-foreground">
                          Link de referência ainda não disponível
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="purchases" className="space-y-4 mt-4">
            {/* Filters */}
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground mb-2 block">
                      Buscar Evento
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Digite o nome do evento..."
                        value={eventSearch}
                        onChange={(e) => setEventSearch(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="sm:w-48">
                    <label className="text-xs text-muted-foreground mb-2 block">
                      Filtrar por Evento
                    </label>
                    <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Todos os eventos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os eventos</SelectItem>
                        {filteredEvents.map((event) => (
                          <SelectItem key={event.id} value={event.id}>
                            {event.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:w-48">
                    <label className="text-xs text-muted-foreground mb-2 block">
                      Status de Pagamento
                    </label>
                    <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="pending">Pendente</SelectItem>
                        <SelectItem value="paid">Finalizado</SelectItem>
                        <SelectItem value="cancelled">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Registrations List */}
            {loadingRegistrations ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : couponRegistrations.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Nenhuma compra encontrada</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {selectedEventId !== "all" || paymentStatusFilter !== "all"
                      ? "Tente ajustar os filtros"
                      : "As compras realizadas via seus links aparecerão aqui"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {couponRegistrations.map((registration) => (
                  <Card key={registration.id}>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="font-semibold mb-1">
                            {registration.runner_name || "Usuário"}
                          </div>
                          <div className="text-sm text-muted-foreground mb-2">
                            {registration.runner_email}
                          </div>
                          <div className="text-sm text-muted-foreground mb-2">
                            CPF: {registration.runner_cpf || "N/A"}
                          </div>
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="text-xs">
                              {registration.event_title}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {registration.category_name}
                            </Badge>
                            <Badge
                              variant={
                                registration.payment_status === "paid"
                                  ? "default"
                                  : registration.payment_status === "pending"
                                  ? "secondary"
                                  : "destructive"
                              }
                              className="text-xs"
                            >
                              {registration.payment_status === "paid"
                                ? "Finalizado"
                                : registration.payment_status === "pending"
                                ? "Pendente"
                                : "Cancelado"}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-primary">
                            {formatCurrency(registration.total_amount)}
                          </div>
                          {registration.coupon_code ? (
                            <div className="text-xs text-muted-foreground mt-1">
                              Cupom: {registration.coupon_code}
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground mt-1">
                              Via referência
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-4 border-t">
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(registration.created_at)}
                        </div>
                        {registration.confirmation_code && (
                          <div className="text-xs text-muted-foreground">
                            Código: {registration.confirmation_code}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="commissions" className="space-y-4 mt-4">
            {commissions.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <DollarSign className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Nenhuma comissão ainda</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Comissões aparecerão aqui quando seus referenciados se inscreverem
                  </p>
                </CardContent>
              </Card>
            ) : (
              commissions.map((commission) => (
                <Card key={commission.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="font-semibold mb-1">
                          {commission.event_title || "Evento"}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {commission.referred_user_name || "Usuário"}
                        </div>
                      </div>
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
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-3 border-t">
                      <div>
                        <div className="text-xs text-muted-foreground">Valor Inscrição</div>
                        <div className="text-sm font-semibold">
                          {formatCurrency(commission.registration_amount)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Sua Comissão</div>
                        <div className="text-sm font-semibold text-primary">
                          {formatCurrency(commission.commission_amount)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-3 border-t">
                      <div className="text-xs text-muted-foreground">
                        {commission.commission_percentage}% de comissão
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(commission.created_at)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="invitations" className="space-y-4 mt-4">
            {loadingInvitations ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : invitations.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Gift className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Nenhum convite disponível</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Você receberá convites quando atingir as metas de compras configuradas pelos organizadores
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {/* Available Invitations */}
                {invitations.filter(i => i.status === 'available').length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
                      Convites Disponíveis ({invitations.filter(i => i.status === 'available').length})
                    </h3>
                    <div className="space-y-3">
                      {invitations
                        .filter(i => i.status === 'available')
                        .map((invitation) => (
                          <Card key={invitation.id}>
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="font-semibold mb-1">
                                    {invitation.event_title || "Evento"}
                                  </div>
                                  {invitation.event_date && (
                                    <div className="text-sm text-muted-foreground mb-2">
                                      {formatDate(invitation.event_date)}
                                    </div>
                                  )}
                                  <Badge variant="default" className="text-xs">
                                    Disponível
                                  </Badge>
                                </div>
                                <Button
                                  size="sm"
                                  onClick={() => handleOpenSendDialog(invitation)}
                                >
                                  <Send className="h-4 w-4 mr-2" />
                                  Enviar
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                    </div>
                  </div>
                )}

                {/* Sent Invitations */}
                {invitations.filter(i => i.status === 'sent').length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
                      Convites Enviados ({invitations.filter(i => i.status === 'sent').length})
                    </h3>
                    <div className="space-y-3">
                      {invitations
                        .filter(i => i.status === 'sent')
                        .map((invitation) => (
                          <Card key={invitation.id}>
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="font-semibold mb-1">
                                    {invitation.event_title || "Evento"}
                                  </div>
                                  {invitation.runner_name && (
                                    <div className="text-sm mb-1">
                                      Para: <span className="font-medium">{invitation.runner_name}</span>
                                    </div>
                                  )}
                                  {invitation.runner_cpf && (
                                    <div className="text-xs text-muted-foreground mb-2">
                                      CPF: {invitation.runner_cpf}
                                    </div>
                                  )}
                                  {invitation.sent_at && (
                                    <div className="text-xs text-muted-foreground">
                                      Enviado em: {formatDate(invitation.sent_at)}
                                    </div>
                                  )}
                                  <Badge variant="secondary" className="text-xs mt-2">
                                    Enviado
                                  </Badge>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                    </div>
                  </div>
                )}

                {/* Used Invitations */}
                {invitations.filter(i => i.status === 'used').length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
                      Convites Utilizados ({invitations.filter(i => i.status === 'used').length})
                    </h3>
                    <div className="space-y-3">
                      {invitations
                        .filter(i => i.status === 'used')
                        .map((invitation) => (
                          <Card key={invitation.id}>
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="font-semibold mb-1">
                                    {invitation.event_title || "Evento"}
                                  </div>
                                  {invitation.runner_name && (
                                    <div className="text-sm mb-1">
                                      Para: <span className="font-medium">{invitation.runner_name}</span>
                                    </div>
                                  )}
                                  {invitation.used_at && (
                                    <div className="text-xs text-muted-foreground mb-2">
                                      Utilizado em: {formatDate(invitation.used_at)}
                                    </div>
                                  )}
                                  <Badge variant="outline" className="text-xs mt-2">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Utilizado
                                  </Badge>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Send Invitation Dialog */}
      <Dialog open={sendInvitationDialogOpen} onOpenChange={setSendInvitationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar Convite</DialogTitle>
            <DialogDescription>
              Envie este convite de inscrição grátis para um runner cadastrado no site
            </DialogDescription>
          </DialogHeader>
          {selectedInvitation && (
            <div className="space-y-4">
              <div>
                <Label>Evento</Label>
                <div className="text-sm font-medium mt-1">
                  {selectedInvitation.event_title || "Evento"}
                </div>
              </div>
              <div>
                <Label htmlFor="runner_cpf">CPF do Runner *</Label>
                <Input
                  id="runner_cpf"
                  placeholder="000.000.000-00"
                  value={runnerCpf}
                  onChange={(e) => setRunnerCpf(e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Informe o CPF do runner que já está cadastrado no site
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSendInvitationDialogOpen(false)}
              disabled={sendingInvitation}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSendInvitation}
              disabled={sendingInvitation || !runnerCpf.trim()}
            >
              {sendingInvitation ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Enviar Convite
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

