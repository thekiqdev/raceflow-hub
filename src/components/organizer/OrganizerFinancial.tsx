import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DollarSign, TrendingUp, TrendingDown, Wallet, Download } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const OrganizerFinancial = () => {
  const withdrawals = [
    {
      id: "1",
      amount: 5000.00,
      fee: 50.00,
      net: 4950.00,
      method: "Pix",
      status: "paid" as const,
      date: new Date(2024, 10, 10),
    },
    {
      id: "2",
      amount: 3000.00,
      fee: 30.00,
      net: 2970.00,
      method: "Pix",
      status: "pending" as const,
      date: new Date(2024, 10, 15),
    },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge variant="default">Pago</Badge>;
      case "pending":
        return <Badge variant="secondary">Em Análise</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejeitado</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">Painel Financeiro</h2>
        <p className="text-muted-foreground">Gerencie seus recebimentos e saques</p>
      </div>

      {/* Financial Summary */}
      <div className="grid gap-6 md:grid-cols-4">
        <Card className="bg-gradient-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Arrecadado</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">R$ 12.450,00</div>
            <p className="text-xs text-muted-foreground mt-1">Receita bruta</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Líquido</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-secondary">R$ 11.205,00</div>
            <p className="text-xs text-muted-foreground mt-1">Após taxas (10%)</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo Disponível</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">R$ 3.285,00</div>
            <p className="text-xs text-muted-foreground mt-1">Disponível para saque</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxas da Plataforma</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">R$ 1.245,00</div>
            <p className="text-xs text-muted-foreground mt-1">10% do total</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="withdrawals" className="space-y-6">
        <TabsList>
          <TabsTrigger value="withdrawals">Solicitações de Saque</TabsTrigger>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="withdrawals" className="space-y-6">
          {/* Request Withdrawal */}
          <Card>
            <CardHeader>
              <CardTitle>Solicitar Saque</CardTitle>
              <CardDescription>
                Transfira seu saldo disponível para sua conta
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="amount">Valor do Saque</Label>
                  <Input
                    id="amount"
                    type="number"
                    placeholder="0,00"
                    max={3285.00}
                  />
                  <p className="text-xs text-muted-foreground">
                    Saldo disponível: R$ 3.285,00
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pix">Chave PIX</Label>
                  <Input
                    id="pix"
                    placeholder="email@exemplo.com ou CPF"
                  />
                </div>
              </div>

              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Valor solicitado:</span>
                  <span className="font-medium">R$ 0,00</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Taxa de saque (1%):</span>
                  <span className="font-medium">R$ 0,00</span>
                </div>
                <div className="flex justify-between text-base font-bold pt-2 border-t">
                  <span>Valor a receber:</span>
                  <span className="text-secondary">R$ 0,00</span>
                </div>
                <p className="text-xs text-muted-foreground pt-2">
                  Prazo estimado: 2-3 dias úteis
                </p>
              </div>

              <Button className="w-full">
                <Download className="mr-2 h-4 w-4" />
                Solicitar Saque
              </Button>
            </CardContent>
          </Card>

          {/* Withdrawal History */}
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Saques</CardTitle>
              <CardDescription>Suas solicitações anteriores</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Valor Bruto</TableHead>
                    <TableHead>Taxa</TableHead>
                    <TableHead>Valor Líquido</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {withdrawals.map((withdrawal) => (
                    <TableRow key={withdrawal.id}>
                      <TableCell>
                        {format(withdrawal.date, "dd/MM/yyyy", { locale: ptBR })}
                      </TableCell>
                      <TableCell>R$ {withdrawal.amount.toFixed(2)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        -R$ {withdrawal.fee.toFixed(2)}
                      </TableCell>
                      <TableCell className="font-semibold text-secondary">
                        R$ {withdrawal.net.toFixed(2)}
                      </TableCell>
                      <TableCell>{withdrawal.method}</TableCell>
                      <TableCell>{getStatusBadge(withdrawal.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Dados Bancários</CardTitle>
              <CardDescription>Configure sua conta para recebimentos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bank">Banco</Label>
                  <Input id="bank" placeholder="Nome do banco" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="account">Agência e Conta</Label>
                  <Input id="account" placeholder="0000-0 / 00000-0" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pix-key">Chave PIX Padrão</Label>
                  <Input id="pix-key" placeholder="Chave PIX cadastrada" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="holder">Titular da Conta</Label>
                  <Input id="holder" placeholder="Nome completo" />
                </div>
              </div>

              <Button>Salvar Configurações</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Política de Reembolso</CardTitle>
              <CardDescription>Configure as regras de devolução</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="refund-days">Prazo para Reembolso</Label>
                  <Input
                    id="refund-days"
                    type="number"
                    placeholder="Dias antes do evento"
                    defaultValue={7}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="refund-fee">Taxa de Reembolso (%)</Label>
                  <Input
                    id="refund-fee"
                    type="number"
                    placeholder="Porcentagem"
                    defaultValue={10}
                  />
                </div>
              </div>

              <Button>Salvar Política</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default OrganizerFinancial;
