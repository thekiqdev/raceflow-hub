import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, FileText, Calendar } from "lucide-react";

const AdvancedReports = () => {
  const reports = [
    { id: 1, title: "Inscrições por Período", description: "Relatório detalhado de inscrições por data", icon: Calendar },
    { id: 2, title: "Novos Usuários por Mês", description: "Análise de crescimento da base de usuários", icon: FileText },
    { id: 3, title: "Faturamento Detalhado", description: "Receita por evento e organizador", icon: FileText },
    { id: 4, title: "Ranking de Organizadores", description: "Organizadores mais ativos e rentáveis", icon: FileText },
    { id: 5, title: "Média de Inscrições por Atleta", description: "Comportamento dos atletas", icon: FileText },
    { id: 6, title: "Evolução de Inscrições", description: "Tendências e crescimento mensal", icon: Calendar },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">Relatórios Avançados</h2>
        <p className="text-muted-foreground">Análises e relatórios detalhados do sistema</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {reports.map((report) => {
          const Icon = report.icon;
          return (
            <Card key={report.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <Icon className="h-8 w-8 text-primary mb-2" />
                <CardTitle className="text-lg">{report.title}</CardTitle>
                <CardDescription>{report.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button className="flex-1">
                  <FileText className="mr-2 h-4 w-4" />
                  Gerar PDF
                </Button>
                <Button variant="outline" className="flex-1">
                  <Download className="mr-2 h-4 w-4" />
                  Excel
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Relatórios Personalizados</CardTitle>
          <CardDescription>Configure filtros e períodos para gerar relatórios customizados</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-sm font-medium">Data Inicial</label>
              <Input type="date" className="mt-2" />
            </div>
            <div>
              <label className="text-sm font-medium">Data Final</label>
              <Input type="date" className="mt-2" />
            </div>
            <div>
              <label className="text-sm font-medium">Tipo de Relatório</label>
              <select className="mt-2 w-full h-10 rounded-md border border-input bg-background px-3 py-2">
                <option>Financeiro</option>
                <option>Usuários</option>
                <option>Eventos</option>
                <option>Completo</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button>Gerar Relatório</Button>
            <Button variant="outline">Limpar Filtros</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdvancedReports;
