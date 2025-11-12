import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Download, Edit, Eye, Lock, Unlock, CheckCircle, XCircle, RotateCcw } from "lucide-react";

const UserManagement = () => {
  const [searchTerm, setSearchTerm] = useState("");

  // Mock data
  const organizers = [
    { id: 1, name: "Maria Santos", email: "maria@eventos.com", cnpj: "12.345.678/0001-90", status: "ativo", events: 5, registrations: 243, revenue: 85000 },
    { id: 2, name: "João Corridas", email: "joao@corridas.com", cnpj: "98.765.432/0001-10", status: "pendente", events: 0, registrations: 0, revenue: 0 },
    { id: 3, name: "Carlos Eventos", email: "carlos@sport.com", cnpj: "55.444.333/0001-22", status: "ativo", events: 12, registrations: 567, revenue: 198000 },
  ];

  const athletes = [
    { id: 1, name: "Pedro Silva", cpf: "123.456.789-00", email: "pedro@email.com", status: "ativo", registrations: 8 },
    { id: 2, name: "Ana Costa", cpf: "987.654.321-00", email: "ana@email.com", status: "ativo", registrations: 15 },
    { id: 3, name: "Lucas Oliveira", cpf: "456.789.123-00", email: "lucas@email.com", status: "bloqueado", registrations: 3 },
  ];

  const admins = [
    { id: 1, name: "Super Admin", email: "admin@runevents.com", role: "super_admin", status: "ativo" },
    { id: 2, name: "Admin Financeiro", email: "financeiro@runevents.com", role: "financial", status: "ativo" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">Gestão de Usuários</h2>
        <p className="text-muted-foreground">Gerenciar organizadores, atletas e administradores</p>
      </div>

      <Tabs defaultValue="organizers" className="space-y-4">
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
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Eventos</TableHead>
                    <TableHead>Inscrições</TableHead>
                    <TableHead>Faturamento</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {organizers.map((org) => (
                    <TableRow key={org.id}>
                      <TableCell className="font-medium">{org.name}</TableCell>
                      <TableCell>{org.email}</TableCell>
                      <TableCell>{org.cnpj}</TableCell>
                      <TableCell>
                        <Badge variant={org.status === "ativo" ? "default" : "secondary"}>
                          {org.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{org.events}</TableCell>
                      <TableCell>{org.registrations}</TableCell>
                      <TableCell>R$ {org.revenue.toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {org.status === "pendente" ? (
                            <>
                              <Button size="icon" variant="ghost" title="Aprovar">
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              </Button>
                              <Button size="icon" variant="ghost" title="Reprovar">
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
                              <Button size="icon" variant="ghost" title="Redefinir senha">
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
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
                  {athletes.map((athlete) => (
                    <TableRow key={athlete.id}>
                      <TableCell className="font-medium">{athlete.name}</TableCell>
                      <TableCell>{athlete.cpf}</TableCell>
                      <TableCell>{athlete.email}</TableCell>
                      <TableCell>
                        <Badge variant={athlete.status === "ativo" ? "default" : "destructive"}>
                          {athlete.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{athlete.registrations}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" title="Visualizar">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Editar">
                            <Edit className="h-4 w-4" />
                          </Button>
                          {athlete.status === "ativo" ? (
                            <Button size="icon" variant="ghost" title="Bloquear">
                              <Lock className="h-4 w-4 text-red-500" />
                            </Button>
                          ) : (
                            <Button size="icon" variant="ghost" title="Desbloquear">
                              <Unlock className="h-4 w-4 text-green-500" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
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
                  {admins.map((admin) => (
                    <TableRow key={admin.id}>
                      <TableCell className="font-medium">{admin.name}</TableCell>
                      <TableCell>{admin.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{admin.role}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="default">{admin.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" title="Editar">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Desativar">
                            <Lock className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
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
