import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Search, Edit, Eye, Loader2, CheckCircle, XCircle, Copy, MoreVertical, DollarSign, Ticket, UserPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  getOrganizerGroupLeaders,
  getAvailableLeadersForOrganizer,
  addLeaderToOrganizer,
  removeLeaderFromOrganizer,
  updateOrganizerGroupLeader,
  deactivateOrganizerGroupLeader,
  activateOrganizerGroupLeader,
  type GroupLeader,
} from "@/lib/api/groupLeaders";
import { GroupLeaderDetails } from "@/components/admin/GroupLeaderDetails";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";


export function OrganizerGroupLeaders() {
  const [leaders, setLeaders] = useState<GroupLeader[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedLeader, setSelectedLeader] = useState<GroupLeader | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [availableLeaders, setAvailableLeaders] = useState<GroupLeader[]>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);

  useEffect(() => {
    loadLeaders();
  }, []);

  const loadLeaders = async () => {
    setLoading(true);
    try {
      const response = await getOrganizerGroupLeaders();
      if (response.success && response.data) {
        setLeaders(response.data);
      } else {
        toast.error(response.error || "Erro ao carregar líderes");
      }
    } catch (error) {
      console.error("Erro ao carregar líderes:", error);
      toast.error("Erro ao carregar líderes");
    } finally {
      setLoading(false);
    }
  };

  const handleEditLeader = (leader: GroupLeader) => {
    // Organizador pode apenas editar código de referência e status
    // Não pode criar novos líderes (apenas admin)
    setSelectedLeader(leader);
    setDetailsOpen(true);
  };

  const handleViewDetails = (leader: GroupLeader) => {
    setSelectedLeader(leader);
    setDetailsOpen(true);
  };

  const handleManageEventCommissions = (leader: GroupLeader) => {
    setSelectedLeader(leader);
    setDetailsOpen(true);
    // Navegar para a aba de comissões por evento após abrir o dialog
    setTimeout(() => {
      const event = new CustomEvent('leader-details:switch-tab', { detail: 'event-commissions' });
      window.dispatchEvent(event);
    }, 100);
  };

  const handleCreateLeaderCoupon = (leader: GroupLeader) => {
    setSelectedLeader(leader);
    setDetailsOpen(true);
    // Navegar para a aba de cupons após abrir o dialog
    setTimeout(() => {
      const event = new CustomEvent('leader-details:switch-tab', { detail: 'coupons' });
      window.dispatchEvent(event);
    }, 100);
  };


  const handleToggleActive = async (leader: GroupLeader) => {
    try {
      const response = leader.is_active
        ? await deactivateOrganizerGroupLeader(leader.id)
        : await activateOrganizerGroupLeader(leader.id);

      if (response.success) {
        toast.success(`Líder ${leader.is_active ? "desativado" : "ativado"} com sucesso!`);
        loadLeaders();
      } else {
        toast.error(response.error || "Erro ao alterar status do líder");
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao alterar status do líder");
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Código copiado para a área de transferência!");
  };

  const handleCopyLink = (code: string) => {
    const link = `${window.location.origin}/cadastro?ref=${code}`;
    navigator.clipboard.writeText(link);
    toast.success("Link copiado para a área de transferência!");
  };

  const handleOpenAddDialog = async () => {
    setAddDialogOpen(true);
    setLoadingAvailable(true);
    try {
      const response = await getAvailableLeadersForOrganizer();
      if (response.success && response.data) {
        setAvailableLeaders(response.data);
      } else {
        toast.error(response.error || "Erro ao carregar líderes disponíveis");
      }
    } catch (error) {
      console.error("Erro ao carregar líderes disponíveis:", error);
      toast.error("Erro ao carregar líderes disponíveis");
    } finally {
      setLoadingAvailable(false);
    }
  };

  const handleAddLeader = async (leaderId: string) => {
    try {
      const response = await addLeaderToOrganizer(leaderId);
      if (response.success) {
        toast.success("Líder adicionado com sucesso!");
        setAddDialogOpen(false);
        loadLeaders();
      } else {
        toast.error(response.error || "Erro ao adicionar líder");
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao adicionar líder");
    }
  };

  const handleRemoveLeader = async (leaderId: string) => {
    if (!confirm("Tem certeza que deseja remover este líder da sua lista?")) {
      return;
    }

    try {
      const response = await removeLeaderFromOrganizer(leaderId);
      if (response.success) {
        toast.success("Líder removido com sucesso!");
        loadLeaders();
      } else {
        toast.error(response.error || "Erro ao remover líder");
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao remover líder");
    }
  };

  const filteredLeaders = leaders.filter((leader) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      leader.referral_code.toLowerCase().includes(searchLower) ||
      leader.user_id.toLowerCase().includes(searchLower) ||
      (leader.user_name && leader.user_name.toLowerCase().includes(searchLower)) ||
      (leader.user_email && leader.user_email.toLowerCase().includes(searchLower))
    );
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">Líderes de Grupo</h2>
        <p className="text-muted-foreground">Gerenciar líderes de grupo e afiliados</p>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total de Líderes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{leaders.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Líderes Ativos</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {leaders.filter((l) => l.is_active).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total de Referências</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {leaders.reduce((sum, l) => sum + l.total_referrals, 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total de Comissões</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(leaders.reduce((sum, l) => sum + l.total_earnings, 0))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Líderes */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Líderes de Grupo</CardTitle>
              <CardDescription>Lista de líderes adicionados à sua lista</CardDescription>
            </div>
            <Button onClick={handleOpenAddDialog}>
              <UserPlus className="mr-2 h-4 w-4" />
              Adicionar Líder
            </Button>
          </div>
          <div className="flex gap-2 pt-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por código, nome ou email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Referências</TableHead>
                  <TableHead>Ganhos</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeaders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Nenhum líder encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLeaders.map((leader) => {
                    return (
                      <TableRow key={leader.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                              {leader.referral_code}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => handleCopyCode(leader.referral_code)}
                              title="Copiar código"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{leader.user_name || "N/A"}</div>
                            {leader.user_email && (
                              <div className="text-sm text-muted-foreground">{leader.user_email}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
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
                        </TableCell>
                        <TableCell>{leader.total_referrals}</TableCell>
                        <TableCell>{formatCurrency(leader.total_earnings)}</TableCell>
                        <TableCell>
                          {new Date(leader.created_at).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleViewDetails(leader)}>
                                <Eye className="mr-2 h-4 w-4" />
                                Ver Detalhes
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEditLeader(leader)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleManageEventCommissions(leader)}>
                                <DollarSign className="mr-2 h-4 w-4" />
                                Definir Comissão por Evento
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleCreateLeaderCoupon(leader)}>
                                <Ticket className="mr-2 h-4 w-4" />
                                Criar Cupom Exclusivo
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="text-destructive"
                                onClick={() => handleRemoveLeader(leader.id)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remover da Lista
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleToggleActive(leader)}>
                                {leader.is_active ? (
                                  <>
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Desativar
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="mr-2 h-4 w-4" />
                                    Ativar
                                  </>
                                )}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <GroupLeaderDetails
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        leader={selectedLeader}
        onCopyCode={handleCopyCode}
        onCopyLink={handleCopyLink}
        isOrganizer={true}
      />

      {/* Add Leader Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adicionar Líder</DialogTitle>
            <DialogDescription>
              Selecione um líder disponível para adicionar à sua lista
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {loadingAvailable ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : availableLeaders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum líder disponível. Todos os líderes já foram adicionados.
              </div>
            ) : (
              <div className="space-y-2">
                {availableLeaders.map((leader) => (
                  <div
                    key={leader.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                  >
                    <div className="flex-1">
                      <div className="font-medium">{leader.user_name || "N/A"}</div>
                      {leader.user_email && (
                        <div className="text-sm text-muted-foreground">{leader.user_email}</div>
                      )}
                      <div className="text-xs text-muted-foreground mt-1">
                        Código: <code className="font-mono">{leader.referral_code}</code>
                      </div>
                    </div>
                    <Button
                      onClick={() => handleAddLeader(leader.id)}
                      size="sm"
                    >
                      <UserPlus className="mr-2 h-4 w-4" />
                      Adicionar
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

