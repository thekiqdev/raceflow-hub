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
import { Search, UserPlus, Edit, Eye, Loader2, CheckCircle, XCircle, Copy, MoreVertical, DollarSign, Ticket } from "lucide-react";
import { toast } from "sonner";
import {
  getOrganizerGroupLeaders,
  createOrganizerGroupLeader,
  updateOrganizerGroupLeader,
  deactivateOrganizerGroupLeader,
  activateOrganizerGroupLeader,
  type GroupLeader,
} from "@/lib/api/groupLeaders";
import { GroupLeaderDialog } from "@/components/admin/GroupLeaderDialog";
import { GroupLeaderDetails } from "@/components/admin/GroupLeaderDetails";
import { getRegistrations, type Registration } from "@/lib/api/registrations";
import { useAuth } from "@/contexts/AuthContext";

interface UserOption {
  id: string;
  name: string;
  email: string;
}

export function OrganizerGroupLeaders() {
  const { user } = useAuth();
  const [leaders, setLeaders] = useState<GroupLeader[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedLeader, setSelectedLeader] = useState<GroupLeader | null>(null);
  const [editingLeader, setEditingLeader] = useState<GroupLeader | null>(null);
  const [availableUsers, setAvailableUsers] = useState<UserOption[]>([]);

  useEffect(() => {
    loadLeaders();
    loadAvailableUsers();
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

  const loadAvailableUsers = async () => {
    if (!user) return;
    
    try {
      // Buscar usuários através das inscrições do organizador
      const response = await getRegistrations({ organizer_id: user.id });
      if (response.success && response.data) {
        // Extrair usuários únicos das inscrições
        const usersMap = new Map<string, UserOption>();
        response.data.forEach((reg: Registration) => {
          if (reg.runner_id && reg.runner_name) {
            if (!usersMap.has(reg.runner_id)) {
              usersMap.set(reg.runner_id, {
                id: reg.runner_id,
                name: reg.runner_name,
                email: "", // Email não está disponível nas inscrições
              });
            }
          }
        });
        setAvailableUsers(Array.from(usersMap.values()));
      }
    } catch (error) {
      console.error("Erro ao carregar usuários:", error);
    }
  };

  const handleCreateLeader = () => {
    setEditingLeader(null);
    setDialogOpen(true);
  };

  const handleEditLeader = (leader: GroupLeader) => {
    setEditingLeader(leader);
    setDialogOpen(true);
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

  const handleSaveLeader = async (data: { user_id: string; referral_code?: string }) => {
    try {
      if (editingLeader) {
        const updateData: any = {};
        if (data.referral_code) {
          updateData.referral_code = data.referral_code;
        }
        const response = await updateOrganizerGroupLeader(editingLeader.id, updateData);
        if (response.success) {
          toast.success("Líder atualizado com sucesso!");
          loadLeaders();
          setDialogOpen(false);
        } else {
          toast.error(response.error || "Erro ao atualizar líder");
        }
      } else {
        const response = await createOrganizerGroupLeader(data);
        if (response.success) {
          toast.success("Líder criado com sucesso!");
          loadLeaders();
          setDialogOpen(false);
        } else {
          toast.error(response.error || "Erro ao criar líder");
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar líder");
    }
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

  const filteredLeaders = leaders.filter((leader) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      leader.referral_code.toLowerCase().includes(searchLower) ||
      leader.user_id.toLowerCase().includes(searchLower)
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
              <CardDescription>Lista de todos os líderes cadastrados</CardDescription>
            </div>
            <Button onClick={handleCreateLeader}>
              <UserPlus className="mr-2 h-4 w-4" />
              Novo Líder
            </Button>
          </div>
          <div className="flex gap-2 pt-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por código ou ID..."
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
                    const user = availableUsers.find((u) => u.id === leader.user_id);
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
                          {user ? (
                            <div>
                              <div className="font-medium">{user.name || "N/A"}</div>
                              {user.email && (
                                <div className="text-sm text-muted-foreground">{user.email}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Carregando...</span>
                          )}
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
      <GroupLeaderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        leader={editingLeader}
        availableUsers={availableUsers.map(u => ({
          id: u.id,
          name: u.name,
          email: u.email || "",
          cpf: "",
          phone: "",
          status: "active",
          created_at: "",
        }))}
        onSave={handleSaveLeader}
      />

      <GroupLeaderDetails
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        leader={selectedLeader}
        onCopyCode={handleCopyCode}
        onCopyLink={handleCopyLink}
        isOrganizer={true}
      />
    </div>
  );
}

