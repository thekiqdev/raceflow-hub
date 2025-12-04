import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Download, Edit, Eye, Lock, Unlock, CheckCircle, XCircle, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getOrganizers,
  getAthletes,
  getAdmins,
  approveOrganizer,
  blockUser,
  unblockUser,
  resetUserPassword,
  type UserWithStats,
} from "@/lib/api/userManagement";

const UserManagement = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("organizers");
  const [loading, setLoading] = useState(false);
  const [organizers, setOrganizers] = useState<UserWithStats[]>([]);
  const [athletes, setAthletes] = useState<UserWithStats[]>([]);
  const [admins, setAdmins] = useState<UserWithStats[]>([]);

  useEffect(() => {
    loadData();
  }, [activeTab, searchTerm]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === "organizers") {
        const response = await getOrganizers(searchTerm || undefined);
        if (response.success && response.data) {
          setOrganizers(response.data);
        } else {
          toast.error("Erro ao carregar organizadores");
        }
      } else if (activeTab === "athletes") {
        const response = await getAthletes(searchTerm || undefined);
        if (response.success && response.data) {
          setAthletes(response.data);
        } else {
          toast.error("Erro ao carregar atletas");
        }
      } else if (activeTab === "admins") {
        const response = await getAdmins();
        if (response.success && response.data) {
          setAdmins(response.data);
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
  };

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

  const handleBlockUser = async (userId: string) => {
    try {
      const response = await blockUser(userId);
      if (response.success) {
        toast.success("Usuário bloqueado com sucesso!");
        loadData();
      } else {
        toast.error(response.error || "Erro ao bloquear usuário");
      }
    } catch (error) {
      toast.error("Erro ao bloquear usuário");
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
              <CardDescription>Gerenciar todos os organizadores da plataforma</CardDescription>
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
                                  onClick={() => handleBlockUser(org.id)}
                                >
                                  <XCircle className="h-4 w-4 text-red-500" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button size="icon" variant="ghost" title="Visualizar">
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" title="Editar">
                                  <Edit className="h-4 w-4" />
                                </Button>
                                {org.status === "active" && (
                                  <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    title="Bloquear"
                                    onClick={() => handleBlockUser(org.id)}
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
              <CardDescription>Gerenciar todos os atletas cadastrados</CardDescription>
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
                            <Button size="icon" variant="ghost" title="Visualizar">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" title="Editar">
                              <Edit className="h-4 w-4" />
                            </Button>
                            {athlete.status === "active" ? (
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                title="Bloquear"
                                onClick={() => handleBlockUser(athlete.id)}
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
              <CardDescription>Gerenciar acesso de administradores</CardDescription>
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
                            <Button size="icon" variant="ghost" title="Editar">
                              <Edit className="h-4 w-4" />
                            </Button>
                            {admin.status === "active" ? (
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                title="Desativar"
                                onClick={() => handleBlockUser(admin.id)}
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
    </div>
  );
};

export default UserManagement;
