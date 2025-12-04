import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileText, Calendar, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getRegistrationsByPeriod,
  getNewUsersByMonth,
  getRevenueByEvent,
  getTopOrganizers,
  getAthleteBehavior,
  getMonthlyEvolution,
  getEventPerformance,
} from "@/lib/api/reports";

const AdvancedReports = () => {
  const [loading, setLoading] = useState<string | null>(null);
  const [customReportType, setCustomReportType] = useState<string>("financial");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const reports = [
    { 
      id: 1, 
      title: "Inscrições por Período", 
      description: "Relatório detalhado de inscrições por data", 
      icon: Calendar,
      action: async () => {
        setLoading("registrations");
        try {
          const response = await getRegistrationsByPeriod({ start_date: startDate, end_date: endDate });
          if (response.success && response.data) {
            toast.success(`Relatório gerado com ${response.data.length} registros`);
            // TODO: Implementar download PDF/Excel
          } else {
            toast.error(response.error || "Erro ao gerar relatório");
          }
        } catch (error) {
          toast.error("Erro ao gerar relatório");
        } finally {
          setLoading(null);
        }
      }
    },
    { 
      id: 2, 
      title: "Novos Usuários por Mês", 
      description: "Análise de crescimento da base de usuários", 
      icon: FileText,
      action: async () => {
        setLoading("users");
        try {
          const response = await getNewUsersByMonth(12);
          if (response.success && response.data) {
            toast.success(`Relatório gerado com ${response.data.length} meses`);
            // TODO: Implementar download PDF/Excel
          } else {
            toast.error(response.error || "Erro ao gerar relatório");
          }
        } catch (error) {
          toast.error("Erro ao gerar relatório");
        } finally {
          setLoading(null);
        }
      }
    },
    { 
      id: 3, 
      title: "Faturamento Detalhado", 
      description: "Receita por evento e organizador", 
      icon: FileText,
      action: async () => {
        setLoading("revenue");
        try {
          const response = await getRevenueByEvent({ start_date: startDate, end_date: endDate });
          if (response.success && response.data) {
            toast.success(`Relatório gerado com ${response.data.length} eventos`);
            // TODO: Implementar download PDF/Excel
          } else {
            toast.error(response.error || "Erro ao gerar relatório");
          }
        } catch (error) {
          toast.error("Erro ao gerar relatório");
        } finally {
          setLoading(null);
        }
      }
    },
    { 
      id: 4, 
      title: "Ranking de Organizadores", 
      description: "Organizadores mais ativos e rentáveis", 
      icon: FileText,
      action: async () => {
        setLoading("organizers");
        try {
          const response = await getTopOrganizers(10);
          if (response.success && response.data) {
            toast.success(`Relatório gerado com ${response.data.length} organizadores`);
            // TODO: Implementar download PDF/Excel
          } else {
            toast.error(response.error || "Erro ao gerar relatório");
          }
        } catch (error) {
          toast.error("Erro ao gerar relatório");
        } finally {
          setLoading(null);
        }
      }
    },
    { 
      id: 5, 
      title: "Média de Inscrições por Atleta", 
      description: "Comportamento dos atletas", 
      icon: FileText,
      action: async () => {
        setLoading("athletes");
        try {
          const response = await getAthleteBehavior(100);
          if (response.success && response.data) {
            toast.success(`Relatório gerado com ${response.data.length} atletas`);
            // TODO: Implementar download PDF/Excel
          } else {
            toast.error(response.error || "Erro ao gerar relatório");
          }
        } catch (error) {
          toast.error("Erro ao gerar relatório");
        } finally {
          setLoading(null);
        }
      }
    },
    { 
      id: 6, 
      title: "Evolução de Inscrições", 
      description: "Tendências e crescimento mensal", 
      icon: Calendar,
      action: async () => {
        setLoading("evolution");
        try {
          const response = await getMonthlyEvolution(12);
          if (response.success && response.data) {
            toast.success(`Relatório gerado com ${response.data.length} meses`);
            // TODO: Implementar download PDF/Excel
          } else {
            toast.error(response.error || "Erro ao gerar relatório");
          }
        } catch (error) {
          toast.error("Erro ao gerar relatório");
        } finally {
          setLoading(null);
        }
      }
    },
  ];

  const handleGenerateCustomReport = async () => {
    setLoading("custom");
    try {
      let response;
      
      switch (customReportType) {
        case "financial":
          response = await getRevenueByEvent({ start_date: startDate, end_date: endDate });
          break;
        case "users":
          response = await getNewUsersByMonth();
          break;
        case "events":
          response = await getEventPerformance({ start_date: startDate, end_date: endDate });
          break;
        case "complete":
          // Gerar múltiplos relatórios
          const [financial, users, events] = await Promise.all([
            getRevenueByEvent({ start_date: startDate, end_date: endDate }),
            getNewUsersByMonth(),
            getEventPerformance({ start_date: startDate, end_date: endDate }),
          ]);
          if (financial.success && users.success && events.success) {
            toast.success("Relatório completo gerado com sucesso!");
            // TODO: Implementar download PDF/Excel combinado
          }
          setLoading(null);
          return;
        default:
          toast.error("Tipo de relatório inválido");
          setLoading(null);
          return;
      }
      
      if (response?.success && response.data) {
        toast.success("Relatório gerado com sucesso!");
        // TODO: Implementar download PDF/Excel
      } else {
        toast.error(response?.error || "Erro ao gerar relatório");
      }
    } catch (error) {
      toast.error("Erro ao gerar relatório");
    } finally {
      setLoading(null);
    }
  };

  const handleClearFilters = () => {
    setStartDate("");
    setEndDate("");
    setCustomReportType("financial");
  };

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
                <Button 
                  className="flex-1" 
                  onClick={report.action}
                  disabled={!!loading}
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="mr-2 h-4 w-4" />
                  )}
                  Gerar PDF
                </Button>
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={report.action}
                  disabled={!!loading}
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
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
              <Label htmlFor="start-date">Data Inicial</Label>
              <Input 
                id="start-date"
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-2" 
              />
            </div>
            <div>
              <Label htmlFor="end-date">Data Final</Label>
              <Input 
                id="end-date"
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-2" 
              />
            </div>
            <div>
              <Label htmlFor="report-type">Tipo de Relatório</Label>
              <Select value={customReportType} onValueChange={setCustomReportType}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="financial">Financeiro</SelectItem>
                  <SelectItem value="users">Usuários</SelectItem>
                  <SelectItem value="events">Eventos</SelectItem>
                  <SelectItem value="complete">Completo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleGenerateCustomReport} disabled={loading === "custom"}>
              {loading === "custom" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                "Gerar Relatório"
              )}
            </Button>
            <Button variant="outline" onClick={handleClearFilters}>
              Limpar Filtros
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdvancedReports;
