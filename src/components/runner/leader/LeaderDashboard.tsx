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

export function LeaderDashboard() {
  const [loading, setLoading] = useState(true);
  const [leader, setLeader] = useState<GroupLeader | null>(null);
  const [referrals, setReferrals] = useState<UserReferral[]>([]);
  const [commissions, setCommissions] = useState<LeaderCommission[]>([]);
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
      const [leaderResponse, referralsResponse, commissionsResponse, statsResponse] = await Promise.all([
        getMyGroupLeader(),
        getMyReferrals(),
        getMyCommissions(),
        getMyStats(),
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
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Percentual de Comissão</span>
                  <span className="font-semibold">
                    {leader.commission_percentage !== null
                      ? `${leader.commission_percentage}%`
                      : "Global"}
                  </span>
                </div>
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
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="referrals">
              Referências ({referrals.length})
            </TabsTrigger>
            <TabsTrigger value="commissions">
              Comissões ({commissions.length})
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
        </Tabs>
      </div>
    </div>
  );
}

