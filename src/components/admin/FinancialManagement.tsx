import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, TrendingUp, TrendingDown, CheckCircle, XCircle, Clock } from "lucide-react";

const FinancialManagement = () => {
  // Mock data
  const withdrawRequests = [
    { id: 1, organizer: "Maria Santos", amount: 8500, fee: 425, method: "PIX", date: "2024-12-15", status: "pendente" },
    { id: 2, organizer: "Carlos Eventos", amount: 19800, fee: 990, method: "TED", date: "2024-12-14", status: "aprovado" },
  ];

  const refundRequests = [
    { id: 1, athlete: "Pedro Silva", event: "Corrida de São Silvestre", amount: 245, reason: "Lesão", date: "2024-12-10", status: "em_analise" },
    { id: 2, athlete: "Ana Costa", event: "Maratona do Rio", amount: 350, reason: "Imprevisto familiar", date: "2024-12-12", status: "aprovado" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">Gestão Financeira</h2>
        <p className="text-muted-foreground">Controle de receitas, saques e reembolsos</p>
      </div>

      {/* Visão Geral */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Arrecadado</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ 547.000</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-green-500" />
              <span className="text-green-500">+12%</span> vs mês anterior
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Comissões da Plataforma</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ 27.350</div>
            <p className="text-xs text-muted-foreground">
              5% das transações
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saques Realizados</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ 485.200</div>
            <p className="text-xs text-muted-foreground">
              88,7% do total arrecadado
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo Disponível</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ 34.450</div>
            <p className="text-xs text-muted-foreground">
              Aguardando saque
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="withdrawals" className="space-y-4">
        <TabsList>
          <TabsTrigger value="withdrawals">Solicitações de Saque</TabsTrigger>
          <TabsTrigger value="refunds">Reembolsos</TabsTrigger>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
        </TabsList>

        {/* Saques */}
        <TabsContent value="withdrawals">
          <Card>
            <CardHeader>
              <CardTitle>Solicitações de Saque</CardTitle>
              <CardDescription>Aprovar e gerenciar saques dos organizadores</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organizador</TableHead>
                    <TableHead>Valor Solicitado</TableHead>
                    <TableHead>Taxa (5%)</TableHead>
                    <TableHead>Valor Líquido</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {withdrawRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="font-medium">{request.organizer}</TableCell>
                      <TableCell>R$ {request.amount.toLocaleString()}</TableCell>
                      <TableCell>R$ {request.fee.toLocaleString()}</TableCell>
                      <TableCell className="font-bold">R$ {(request.amount - request.fee).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{request.method}</Badge>
                      </TableCell>
                      <TableCell>{new Date(request.date).toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell>
                        <Badge variant={request.status === "aprovado" ? "default" : "secondary"}>
                          {request.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {request.status === "pendente" && (
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" title="Aprovar">
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            </Button>
                            <Button size="icon" variant="ghost" title="Rejeitar">
                              <XCircle className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reembolsos */}
        <TabsContent value="refunds">
          <Card>
            <CardHeader>
              <CardTitle>Solicitações de Reembolso</CardTitle>
              <CardDescription>Analisar e processar reembolsos de atletas</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Atleta</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {refundRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="font-medium">{request.athlete}</TableCell>
                      <TableCell>{request.event}</TableCell>
                      <TableCell>R$ {request.amount}</TableCell>
                      <TableCell>{request.reason}</TableCell>
                      <TableCell>{new Date(request.date).toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell>
                        <Badge 
                          variant={
                            request.status === "aprovado" ? "default" : 
                            request.status === "em_analise" ? "secondary" : "outline"
                          }
                        >
                          {request.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {request.status === "em_analise" && (
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" title="Aprovar">
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            </Button>
                            <Button size="icon" variant="ghost" title="Recusar">
                              <XCircle className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Configurações */}
        <TabsContent value="settings">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Taxas da Plataforma</CardTitle>
                <CardDescription>Configurar comissões e taxas</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Percentual de Comissão</label>
                  <Input type="number" defaultValue="5" className="mt-2" />
                  <p className="text-xs text-muted-foreground mt-1">Percentual sobre cada inscrição</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Valor Mínimo para Saque</label>
                  <Input type="number" defaultValue="100" className="mt-2" />
                  <p className="text-xs text-muted-foreground mt-1">Valor mínimo em reais</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Prazo Mínimo (dias)</label>
                  <Input type="number" defaultValue="7" className="mt-2" />
                  <p className="text-xs text-muted-foreground mt-1">Dias após o evento para solicitar saque</p>
                </div>
                <Button>Salvar Configurações</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Relatórios Rápidos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start">
                  <DollarSign className="mr-2 h-4 w-4" />
                  Relatório de Comissões
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <TrendingDown className="mr-2 h-4 w-4" />
                  Histórico de Saques
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <Clock className="mr-2 h-4 w-4" />
                  Fluxo de Caixa Mensal
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FinancialManagement;
