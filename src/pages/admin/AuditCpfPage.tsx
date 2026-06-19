import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatChartDayLabel } from "@/lib/utils/chartDate";
import { Loader2, IdCard, AlertTriangle, CheckCircle2, Clock, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { toast } from "sonner";
import {
  getCpfAuditDaily,
  getCpfAuditOverview,
  getCpfRecentErrors,
  type CpfAuditDailyRow,
  type CpfAuditOverview,
  type CpfAuditRecentError,
  type ProviderHealthLevel,
} from "@/lib/api/cpfAudit";

const chartConfig = {
  success: { label: "Sucesso", color: "hsl(142 76% 36%)" },
  manual: { label: "Manual", color: "hsl(221 83% 53%)" },
  invalid: { label: "Inválido", color: "hsl(0 84% 60%)" },
  timeout: { label: "Timeout", color: "hsl(38 92% 50%)" },
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function healthLabel(level: ProviderHealthLevel): string {
  switch (level) {
    case "excellent":
      return "Excelente";
    case "good":
      return "Boa";
    case "attention":
      return "Atenção";
    default:
      return "Crítica";
  }
}

function healthBadgeClass(level: ProviderHealthLevel): string {
  switch (level) {
    case "excellent":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "good":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "attention":
      return "bg-amber-100 text-amber-900 border-amber-200";
    default:
      return "bg-red-100 text-red-800 border-red-200";
  }
}

export default function AuditCpfPage() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<CpfAuditOverview | null>(null);
  const [daily, setDaily] = useState<CpfAuditDailyRow[]>([]);
  const [recentErrors, setRecentErrors] = useState<CpfAuditRecentError[]>([]);

  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [overviewRes, dailyRes, errorsRes] = await Promise.all([
        getCpfAuditOverview(30),
        getCpfAuditDaily(30),
        getCpfRecentErrors(50),
      ]);
      if (overviewRes.success && overviewRes.data) {
        setOverview(overviewRes.data);
      } else {
        setOverview(null);
      }
      if (dailyRes.success && dailyRes.data) {
        setDaily(dailyRes.data);
      } else {
        setDaily([]);
      }
      if (errorsRes.success && errorsRes.data) {
        setRecentErrors(errorsRes.data);
      } else {
        setRecentErrors([]);
      }
    } catch {
      toast.error("Erro ao carregar auditoria de CPF");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Carregando auditoria CPF…</span>
      </div>
    );
  }

  const kpis = overview ?? {
    CPF_LOOKUP_OK: 0,
    CPF_NOT_IN_REGISTRY: 0,
    LOCAL_INVALID_FORMAT: 0,
    EXTERNAL_TIMEOUT: 0,
    EXTERNAL_QUOTA: 0,
    EXTERNAL_AUTH: 0,
    EXTERNAL_PLAN: 0,
    EXTERNAL_BAD_RESPONSE: 0,
    RATE_LIMITED: 0,
    total_lookups: 0,
    api_success_rate_pct: 0,
    manual_count: 0,
    manual_pct: 0,
    provider_health: "critical" as ProviderHealthLevel,
    period_days: 30,
  };

  const chartData = daily.map((row) => ({
    ...row,
    label: formatChartDayLabel(row.day),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">Auditoria — CPF</h2>
        <p className="text-muted-foreground">
          Qualidade da API CPF Brasil e cadastros manuais — últimos {kpis.period_days} dias
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Consultas bem-sucedidas
            </CardDescription>
            <CardTitle className="text-2xl">{formatNumber(kpis.CPF_LOOKUP_OK)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <IdCard className="h-4 w-4 text-blue-600" />
              Cadastro manual
            </CardDescription>
            <CardTitle className="text-2xl">{formatNumber(kpis.CPF_NOT_IN_REGISTRY)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              CPF inválido
            </CardDescription>
            <CardTitle className="text-2xl">{formatNumber(kpis.LOCAL_INVALID_FORMAT)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-600" />
              Timeout da API
            </CardDescription>
            <CardTitle className="text-2xl">{formatNumber(kpis.EXTERNAL_TIMEOUT)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Limite de quota", value: kpis.EXTERNAL_QUOTA },
          { label: "Erro autenticação", value: kpis.EXTERNAL_AUTH },
          { label: "Plano insuficiente", value: kpis.EXTERNAL_PLAN },
          { label: "Resposta inválida", value: kpis.EXTERNAL_BAD_RESPONSE },
          { label: "Rate limit", value: kpis.RATE_LIMITED },
        ].map((item) => (
          <Card key={item.label}>
            <CardHeader className="pb-2">
              <CardDescription>{item.label}</CardDescription>
              <CardTitle className="text-xl">{formatNumber(item.value)}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Taxa de sucesso da API CPF</CardTitle>
            <CardDescription>
              CPF_LOOKUP_OK ÷ total de consultas no período
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-end gap-4">
            <p className="text-4xl font-bold">{kpis.api_success_rate_pct.toLocaleString("pt-BR")}%</p>
            <p className="text-sm text-muted-foreground pb-1">
              {formatNumber(kpis.CPF_LOOKUP_OK)} de {formatNumber(kpis.total_lookups)} consultas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" />
              Saúde do provedor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className={`text-base px-3 py-1 ${healthBadgeClass(kpis.provider_health)}`}>
              {healthLabel(kpis.provider_health)}
            </Badge>
            <p className="text-xs text-muted-foreground mt-3">
              Excelente &gt;98% · Boa 95–98% · Atenção 90–95% · Crítica &lt;90%
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Evolução diária</CardTitle>
          <CardDescription>Últimos 30 dias — sucesso, manual, inválido e timeout</CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nenhum dado no período. As métricas são registradas a partir das consultas de CPF no cadastro.
            </p>
          ) : (
            <ChartContainer config={chartConfig} className="h-[320px] w-full">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="success" stroke="var(--color-success)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="manual" stroke="var(--color-manual)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="invalid" stroke="var(--color-invalid)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="timeout" stroke="var(--color-timeout)" strokeWidth={2} dot={false} />
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Cadastro manual</CardTitle>
            <CardDescription>CPF válido não encontrado (CPF_NOT_IN_REGISTRY)</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {formatNumber(kpis.manual_count)}
              <span className="text-lg font-normal text-muted-foreground ml-2">
                ({kpis.manual_pct.toLocaleString("pt-BR")}%)
              </span>
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Usuários que preencheram dados manualmente após consulta sem retorno na base nacional.
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Erros recentes</CardTitle>
            <CardDescription>Sem dados pessoais — apenas código e request ID</CardDescription>
          </CardHeader>
          <CardContent>
            {recentErrors.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum erro registrado recentemente.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Request ID</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Provider</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentErrors.map((row, idx) => (
                    <TableRow key={`${row.created_at}-${row.request_id ?? idx}`}>
                      <TableCell className="whitespace-nowrap">
                        {format(parseISO(row.created_at), "dd/MM HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.result_code}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-[140px] truncate">
                        {row.request_id ?? "—"}
                      </TableCell>
                      <TableCell>{row.source}</TableCell>
                      <TableCell>{row.provider ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
