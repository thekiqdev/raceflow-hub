import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search,
  UserPlus,
  Edit,
  Eye,
  Loader2,
  CheckCircle,
  XCircle,
  Copy,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  getAllGroupLeaders,
  createGroupLeader,
  updateGroupLeader,
  deactivateGroupLeader,
  activateGroupLeader,
  deleteGroupLeader,
  type GroupLeader,
  type GroupLeadersAdminSummary,
} from "@/lib/api/groupLeaders";
import { GroupLeaderDialog } from "./GroupLeaderDialog";
import { GroupLeaderDetails } from "./GroupLeaderDetails";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDebounce } from "@/hooks/useDebounce";

const defaultSummary: GroupLeadersAdminSummary = {
  total_leaders: 0,
  active_leaders: 0,
  total_referrals: 0,
  total_earnings: 0,
};

export function GroupLeadersManagement() {
  const [leaders, setLeaders] = useState<GroupLeader[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<30 | 50>(30);
  const [listTotal, setListTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [summary, setSummary] = useState<GroupLeadersAdminSummary>(defaultSummary);
  const filterKeyRef = useRef<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedLeader, setSelectedLeader] = useState<GroupLeader | null>(null);
  const [editingLeader, setEditingLeader] = useState<GroupLeader | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [leaderToDelete, setLeaderToDelete] = useState<GroupLeader | null>(null);
  const [deleting, setDeleting] = useState(false);

  const listFilterKey = useMemo(
    () => `${debouncedSearch}|${pageSize}`,
    [debouncedSearch, pageSize]
  );

  const loadLeadersWithPage = useCallback(
    async (effectivePage: number) => {
      setLoading(true);
      try {
        const response = await getAllGroupLeaders(debouncedSearch || undefined, {
          page: effectivePage,
          page_size: pageSize,
        });
        if (response.success && response.data && "items" in response.data) {
          setLeaders(response.data.items);
          setListTotal(response.data.total);
          setTotalPages(response.data.total_pages);
          setSummary(response.data.summary);
        } else {
          toast.error(response.error || "Erro ao carregar líderes");
        }
      } catch (error) {
        console.error("Erro ao carregar líderes:", error);
        toast.error("Erro ao carregar líderes");
      } finally {
        setLoading(false);
      }
    },
    [debouncedSearch, pageSize]
  );

  useEffect(() => {
    const filtersChanged = filterKeyRef.current !== null && filterKeyRef.current !== listFilterKey;
    if (filtersChanged) {
      setPage(1);
    }
    filterKeyRef.current = listFilterKey;
    const effectivePage = filtersChanged ? 1 : page;
    void loadLeadersWithPage(effectivePage);
  }, [page, listFilterKey, loadLeadersWithPage]);

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

  const handleSaveLeader = async (data: { user_id: string }) => {
    try {
      if (editingLeader) {
        const response = await updateGroupLeader(editingLeader.id, {});
        if (response.success) {
          toast.success("Líder atualizado com sucesso!");
          void loadLeadersWithPage(page);
          setDialogOpen(false);
        } else {
          toast.error(response.error || "Erro ao atualizar líder");
        }
      } else {
        const response = await createGroupLeader(data);
        if (response.success) {
          toast.success("Líder criado com sucesso!");
          setPage(1);
          void loadLeadersWithPage(1);
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
        ? await deactivateGroupLeader(leader.id)
        : await activateGroupLeader(leader.id);

      if (response.success) {
        toast.success(`Líder ${leader.is_active ? "desativado" : "ativado"} com sucesso!`);
        void loadLeadersWithPage(page);
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

  const handleDeleteClick = (leader: GroupLeader) => {
    setLeaderToDelete(leader);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!leaderToDelete) return;

    setDeleting(true);
    try {
      const response = await deleteGroupLeader(leaderToDelete.id);
      if (response.success) {
        toast.success("Líder excluído permanentemente!");
        const nextPage = leaders.length === 1 && page > 1 ? page - 1 : page;
        setPage(nextPage);
        void loadLeadersWithPage(nextPage);
        setDeleteDialogOpen(false);
        setLeaderToDelete(null);
      } else {
        toast.error(response.error || "Erro ao excluir líder");
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao excluir líder");
    } finally {
      setDeleting(false);
    }
  };

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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total de Líderes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.total_leaders}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Líderes Ativos</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.active_leaders}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total de Referências</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.total_referrals}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total de Comissões</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.total_earnings)}</div>
          </CardContent>
        </Card>
      </div>

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
                placeholder="Buscar por nome, e-mail ou código..."
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
                {leaders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Nenhum líder encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  leaders.map((leader) => (
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
                          <div className="text-sm text-muted-foreground">{leader.user_email || "N/A"}</div>
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
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleViewDetails(leader)}
                            title="Ver detalhes"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditLeader(leader)}
                            title="Editar"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleToggleActive(leader)}
                            title={leader.is_active ? "Desativar" : "Ativar"}
                          >
                            {leader.is_active ? (
                              <XCircle className="h-4 w-4 text-destructive" />
                            ) : (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteClick(leader)}
                            title="Excluir permanentemente"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {!loading && listTotal > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Página {page} de {Math.max(1, totalPages || 1)}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={String(pageSize)}
              onValueChange={(value) => setPageSize(Number(value) as 30 | 50)}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Por página" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 por página</SelectItem>
                <SelectItem value="50">50 por página</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages || totalPages === 0}
              onClick={() => setPage((current) => current + 1)}
              aria-label="Próxima página"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <GroupLeaderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        leader={editingLeader}
        onSave={handleSaveLeader}
      />

      <GroupLeaderDetails
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        leader={selectedLeader}
        onCopyCode={handleCopyCode}
        onCopyLink={handleCopyLink}
      />

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Líder de Grupo</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir permanentemente o líder{" "}
              <strong>{leaderToDelete?.referral_code}</strong>?
              <br />
              <br />
              <span className="text-destructive font-semibold">
                Esta ação não pode ser desfeita. Todos os dados relacionados serão excluídos permanentemente, incluindo:
              </span>
              <ul className="list-disc list-inside mt-2 text-sm text-muted-foreground">
                <li>Referências de usuários</li>
                <li>Comissões</li>
                <li>Comissões por evento</li>
                <li>Convites</li>
                <li>Cupons exclusivos</li>
              </ul>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setLeaderToDelete(null);
              }}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Excluindo...
                </>
              ) : (
                "Excluir Permanentemente"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
