import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, ExternalLink, Loader2, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { type GroupLeader, getReferralsByLeader, getCommissionsByLeader, type UserReferral, type LeaderCommission } from "@/lib/api/groupLeaders";

interface GroupLeaderDetailsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leader: GroupLeader | null;
  onCopyCode: (code: string) => void;
  onCopyLink: (code: string) => void;
}

export function GroupLeaderDetails({
  open,
  onOpenChange,
  leader,
  onCopyCode,
  onCopyLink,
}: GroupLeaderDetailsProps) {
  const [referrals, setReferrals] = useState<UserReferral[]>([]);
  const [commissions, setCommissions] = useState<LeaderCommission[]>([]);
  const [loadingReferrals, setLoadingReferrals] = useState(false);
  const [loadingCommissions, setLoadingCommissions] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (open && leader) {
      loadReferrals();
      loadCommissions();
    }
  }, [open, leader]);

  const loadReferrals = async () => {
    if (!leader) return;

    setLoadingReferrals(true);
    try {
      const response = await getReferralsByLeader(leader.id);
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
      const response = await getCommissionsByLeader(leader.id);
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

  if (!leader) return null;

  const pendingCommissions = commissions.filter((c) => c.status === "pending");
  const paidCommissions = commissions.filter((c) => c.status === "paid");
  const totalPending = pendingCommissions.reduce((sum, c) => sum + c.commission_amount, 0);
  const totalPaid = paidCommissions.reduce((sum, c) => sum + c.commission_amount, 0);

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
                  <div className="text-lg font-semibold">
                    {leader.commission_percentage !== null
                      ? `${leader.commission_percentage}%`
                      : "Global"}
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
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Evento</TableHead>
                    <TableHead>Usuário Referenciado</TableHead>
                    <TableHead>Valor Inscrição</TableHead>
                    <TableHead>Comissão</TableHead>
                    <TableHead>Percentual</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commissions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Nenhuma comissão encontrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    commissions.map((commission) => (
                      <TableRow key={commission.id}>
                        <TableCell>{commission.event_title || "N/A"}</TableCell>
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
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

