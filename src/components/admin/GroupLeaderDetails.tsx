import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Copy, ExternalLink, Loader2, CheckCircle, XCircle, Search } from "lucide-react";
import { toast } from "sonner";
import { 
  type GroupLeader, 
  getReferralsByLeader, 
  getCommissionsByLeader,
  getOrganizerReferralsByLeader,
  getOrganizerCommissionsByLeader,
  type UserReferral, 
  type LeaderCommission 
} from "@/lib/api/groupLeaders";
import { LeaderEventCommissions } from "@/components/organizer/LeaderEventCommissions";
import { LeaderCoupons } from "@/components/organizer/LeaderCoupons";

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
  const [loadingReferrals, setLoadingReferrals] = useState(false);
  const [loadingCommissions, setLoadingCommissions] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [eventSearchTerm, setEventSearchTerm] = useState("");
  const [userSearchTerm, setUserSearchTerm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open && leader) {
      loadReferrals();
      loadCommissions();
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
                  {referrals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        Nenhuma referência encontrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    referrals.map((referral) => (
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

          <TabsContent value="event-commissions" className="space-y-4">
            {leader && <LeaderEventCommissions leaderId={leader.id} isAdmin={!isOrganizer} />}
          </TabsContent>

          <TabsContent value="coupons" className="space-y-4">
            {leader && <LeaderCoupons leaderId={leader.id} isAdmin={!isOrganizer} />}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

