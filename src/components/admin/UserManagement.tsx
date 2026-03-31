import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Download, Edit, Eye, Lock, Unlock, CheckCircle, XCircle, RotateCcw, Loader2, UserPlus, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import {
  getOrganizers,
  getAthletes,
  getAdmins,
  approveOrganizer,
  blockUser,
  unblockUser,
  resetUserPassword,
  convertAthleteToOrganizer,
  hardDeleteUserProfile,
  type UserWithStats,
} from "@/lib/api/userManagement";
import { UserProfileDialog } from "./UserProfileDialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDebounce } from "@/hooks/useDebounce";

const UserManagement = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [activeTab, setActiveTab] = useState("organizers");
  const [loading, setLoading] = useState(false);
  const [organizers, setOrganizers] = useState<UserWithStats[]>([]);
  const [athletes, setAthletes] = useState<UserWithStats[]>([]);
  const [admins, setAdmins] = useState<UserWithStats[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<30 | 50>(30);
  const [listTotal, setListTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const filterKeyRef = useRef<string | null>(null);
  const lastRequestKeyRef = useRef<string>("");
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [userToBlock, setUserToBlock] = useState<{ id: string; name: string } | null>(null);

  const listFilterKey = useMemo(
    () => `${activeTab}|${activeTab === "admins" ? "" : debouncedSearch}|${pageSize}`,
    [activeTab, debouncedSearch, pageSize]
  );

  const loadDataWithPage = useCallback(
    async (effectivePage: number) => {
      setLoading(true);
      const pagination = { page: effectivePage, page_size: pageSize };
      try {
        if (activeTab === "organizers") {
          const response = await getOrganizers(debouncedSearch || undefined, pagination);
          if (response.success && response.data && "items" in response.data) {
            setOrganizers(response.data.items);
            setListTotal(response.data.total);
            setTotalPages(response.data.total_pages);
          } else {
            toast.error("Erro ao carregar organizadores");
          }
        } else if (activeTab === "athletes") {
          const response = await getAthletes(debouncedSearch || undefined, pagination);
          if (response.success && response.data && "items" in response.data) {
            setAthletes(response.data.items);
            setListTotal(response.data.total);
            setTotalPages(response.data.total_pages);
          } else {
            toast.error("Erro ao carregar atletas");
          }
        } else if (activeTab === "admins") {
          const response = await getAdmins(pagination);
          if (response.success && response.data && "items" in response.data) {
            setAdmins(response.data.items);
            setListTotal(response.data.total);
            setTotalPages(response.data.total_pages);
          } else {
            toast.error("Erro ao carregar administradores");
          }
        }
      } catch (error) {
        console.error("Erro ao carregar dados:", error);
        toast.error("Erro ao carregar dados");
      } finally {
        setLoading(false);
      }
    },
    [activeTab, debouncedSearch, pageSize]
  );

  const loadData = useCallback(() => {
    lastRequestKeyRef.current = "";
    void loadDataWithPage(page);
  }, [page, loadDataWithPage]);

  useEffect(() => {
    const filtersChanged = filterKeyRef.current !== null && filterKeyRef.current !== listFilterKey;
    filterKeyRef.current = listFilterKey;
    const effectivePage = filtersChanged ? 1 : page;
    if (filtersChanged && page !== 1) {
      setPage(1);
    }
    const requestKey = `${listFilterKey}|${effectivePage}`;
    if (lastRequestKeyRef.current === requestKey) {
      return;
    }
    lastRequestKeyRef.current = requestKey;
    void loadDataWithPage(effectivePage);
  }, [listFilterKey, page, loadDataWithPage]);

  const handleApproveOrganizer = async (userId: string) => {
    try {
      const response = await approveOrganizer(userId);
      if (response.success) {
        toast.success("Organizador aprovado com sucesso!");
        loadData();
      } else {
        toast.error(response.error || "Erro ao aprovar organizador");
      }
    } catch (error) {
      toast.error("Erro ao aprovar organizador");
    }
  };

  const handleBlockUser = async (userId: string, userName: string) => {
    setUserToBlock({ id: userId, name: userName });
    setBlockDialogOpen(true);
  };

  const confirmBlockUser = async () => {
    if (!userToBlock) return;
    
    try {
      const response = await blockUser(userToBlock.id);
      if (response.success) {
        toast.success("Usuário bloqueado com sucesso!");
        loadData();
        setBlockDialogOpen(false);
        setUserToBlock(null);
      } else {
        toast.error(response.error || "Erro ao bloquear usuário");
      }
    } catch (error) {
      toast.error("Erro ao bloquear usuário");
    }
  };

  const confirmDeleteUser = async () => {
    if (!userToBlock) return;
    
    if (!confirm(`Tem certeza que deseja DELETAR PERMANENTEMENTE o perfil de "${userToBlock.name}"?\n\nEsta ação não pode ser desfeita e removerá todos os dados relacionados ao usuário.`)) {
      return;
    }

    try {
      const response = await hardDeleteUserProfile(userToBlock.id);
      if (response.success) {
        toast.success("Perfil deletado permanentemente!");
        loadData();
        setBlockDialogOpen(false);
        setUserToBlock(null);
      } else {
        toast.error(response.error || "Erro ao deletar perfil");
      }
    } catch (error) {
      toast.error("Erro ao deletar perfil");
    }
  };

  const handleUnblockUser = async (userId: string) => {
    try {
      const response = await unblockUser(userId);
      if (response.success) {
        toast.success("Usuário desbloqueado com sucesso!");
        loadData();
      } else {
        toast.error(response.error || "Erro ao desbloquear usuário");
      }
    } catch (error) {
      toast.error("Erro ao desbloquear usuário");
    }
  };

  const handleConvertToOrganizer = async (userId: string, userName: string) => {
    if (!confirm(`Tem certeza que deseja converter o atleta "${userName}" em organizador? Esta ação não pode ser desfeita.`)) {
      return;
    }

    try {
      const response = await convertAthleteToOrganizer(userId);
      if (response.success) {
        toast.success("Atleta convertido para organizador com sucesso!");
        loadData();
      } else {
        toast.error(response.error || "Erro ao converter atleta em organizador");
      }
    } catch (error) {
      toast.error("Erro ao converter atleta em organizador");
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatCPF = (cpf: string) => {
    if (!cpf) return '-';
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  };

  const getStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      active: 'ativo',
      pending: 'pendente',
      blocked: 'bloqueado',
    };
    return statusMap[status] || status;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">Gestão de Usuários</h2>
        <p className="text-muted-foreground">Gerenciar organizadores, atletas e administradores</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="organizers">Organizadores</TabsTrigger>
          <TabsTrigger value="athletes">Atletas</TabsTrigger>
          <TabsTrigger value="admins">Administradores</TabsTrigger>
        </TabsList>

        {/* Organizadores */}
        <TabsContent value="organizers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Organizadores</CardTitle>
              <CardDescription>
                {activeTab !== "organizers"
                  ? "Gerenciar todos os organizadores da plataforma"
                  : loading
                    ? "Carregando..."
                    : listTotal === 0
                      ? "Nenhum resultado com os filtros atuais"
                      : `Exibindo ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, listTotal)} de ${listTotal}`}
              </CardDescription>
              <div className="flex gap-2 pt-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, email ou CNPJ..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  Exportar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Eventos</TableHead>
                    <TableHead>Inscrições</TableHead>
                    <TableHead>Faturamento</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : organizers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        Nenhum organizador encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    organizers.map((org) => (
                      <TableRow key={org.id}>
                        <TableCell className="font-medium">{org.name}</TableCell>
                        <TableCell>{org.email}</TableCell>
                        <TableCell>{formatCPF(org.cpf || '')}</TableCell>
                        <TableCell>
                          <Badge variant={org.status === "active" ? "default" : org.status === "pending" ? "secondary" : "destructive"}>
                            {getStatusLabel(org.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>{org.events || 0}</TableCell>
                        <TableCell>{org.registrations || 0}</TableCell>
                        <TableCell>{formatCurrency(org.revenue || 0)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {org.status === "pending" ? (
                              <>
                                <Button 
                                  size="icon" 
                                  variant="ghost" 
                                  title="Aprovar"
                                  onClick={() => handleApproveOrganizer(org.id)}
                                >
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                </Button>
                                <Button 
                                  size="icon" 
                                  variant="ghost" 
                                  title="Reprovar"
                                  onClick={() => handleBlockUser(org.id, org.name)}
                                >
                                  <XCircle className="h-4 w-4 text-red-500" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button 
                                  size="icon" 
                                  variant="ghost" 
                                  title="Visualizar/Editar Perfil"
                                  onClick={() => {
                                    setSelectedUserId(org.id);
                                    setProfileDialogOpen(true);
                                  }}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                {org.status === "active" && (
                                  <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    title="Bloquear"
                                    onClick={() => handleBlockUser(org.id, org.name)}
                                  >
                                    <Lock className="h-4 w-4 text-red-500" />
                                  </Button>
                                )}
                                {org.status === "blocked" && (
                                  <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    title="Desbloquear"
                                    onClick={() => handleUnblockUser(org.id)}
                                  >
                                    <Unlock className="h-4 w-4 text-green-500" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Atletas */}
        <TabsContent value="athletes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Atletas</CardTitle>
              <CardDescription>
                {activeTab !== "athletes"
                  ? "Gerenciar todos os atletas cadastrados"
                  : loading
                    ? "Carregando..."
                    : listTotal === 0
                      ? "Nenhum resultado com os filtros atuais"
                      : `Exibindo ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, listTotal)} de ${listTotal}`}
              </CardDescription>
              <div className="flex gap-2 pt-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, CPF ou email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  Exportar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Inscrições</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : athletes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Nenhum atleta encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    athletes.map((athlete) => (
                      <TableRow key={athlete.id}>
                        <TableCell className="font-medium">{athlete.name}</TableCell>
                        <TableCell>{formatCPF(athlete.cpf || '')}</TableCell>
                        <TableCell>{athlete.email}</TableCell>
                        <TableCell>
                          <Badge variant={athlete.status === "active" ? "default" : "destructive"}>
                            {getStatusLabel(athlete.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>{athlete.registrations || 0}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              title="Visualizar/Editar Perfil"
                              onClick={() => {
                                setSelectedUserId(athlete.id);
                                setProfileDialogOpen(true);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              title="Converter em Organizador"
                              onClick={() => handleConvertToOrganizer(athlete.id, athlete.name)}
                              className="text-blue-500 hover:text-blue-600"
                            >
                              <UserPlus className="h-4 w-4" />
                            </Button>
                            {athlete.status === "active" ? (
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                title="Bloquear"
                                onClick={() => handleBlockUser(athlete.id, athlete.name)}
                              >
                                <Lock className="h-4 w-4 text-red-500" />
                              </Button>
                            ) : (
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                title="Desbloquear"
                                onClick={() => handleUnblockUser(athlete.id)}
                              >
                                <Unlock className="h-4 w-4 text-green-500" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Administradores */}
        <TabsContent value="admins" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Administradores</CardTitle>
              <CardDescription>
                {activeTab !== "admins"
                  ? "Gerenciar acesso de administradores"
                  : loading
                    ? "Carregando..."
                    : listTotal === 0
                      ? "Nenhum administrador cadastrado"
                      : `Exibindo ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, listTotal)} de ${listTotal}`}
              </CardDescription>
              <Button className="mt-4">Criar Novo Admin</Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Função</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : admins.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Nenhum administrador encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    admins.map((admin) => (
                      <TableRow key={admin.id}>
                        <TableCell className="font-medium">{admin.name}</TableCell>
                        <TableCell>{admin.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{admin.role || 'admin'}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={admin.status === "active" ? "default" : "destructive"}>
                            {getStatusLabel(admin.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              title="Visualizar/Editar Perfil"
                              onClick={() => {
                                setSelectedUserId(admin.id);
                                setProfileDialogOpen(true);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {admin.status === "active" ? (
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                title="Desativar"
                                onClick={() => handleBlockUser(admin.id, admin.name)}
                              >
                                <Lock className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                title="Ativar"
                                onClick={() => handleUnblockUser(admin.id)}
                              >
                                <Unlock className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {!loading && listTotal > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Página {page} de {Math.max(1, totalPages || 1)}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={String(pageSize)}
              onValueChange={(v) => setPageSize(Number(v) as 30 | 50)}
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
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages || totalPages === 0}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Próxima página"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <UserProfileDialog
        open={profileDialogOpen}
        onOpenChange={setProfileDialogOpen}
        userId={selectedUserId}
        onSuccess={() => {
          loadData();
        }}
      />

      {/* Dialog de confirmação para bloquear ou deletar */}
      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ação para {userToBlock?.name}</DialogTitle>
            <DialogDescription>
              Escolha uma ação para este usuário:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                <strong>Bloquear:</strong> O usuário será bloqueado, mas o perfil será mantido.
              </p>
              <p className="text-sm text-muted-foreground">
                <strong>Deletar Perfil:</strong> Remove permanentemente o perfil e todos os dados relacionados. Esta ação não pode ser desfeita.
              </p>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setBlockDialogOpen(false);
                setUserToBlock(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="default"
              onClick={confirmBlockUser}
              className="flex items-center gap-2"
            >
              <Lock className="h-4 w-4" />
              Bloquear Usuário
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteUser}
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Deletar Perfil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserManagement;
