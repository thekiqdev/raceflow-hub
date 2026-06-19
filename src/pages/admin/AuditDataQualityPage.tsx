import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatChartDayLabel } from "@/lib/utils/chartDate";
import {
  Loader2,
  AlertTriangle,
  UserX,
  Phone,
  MapPin,
  Building2,
  Home,
  Calendar,
  Users,
  Mail,
  ShieldAlert,
  Ban,
} from "lucide-react";
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
  getProfileQualityBySource,
  getProfileQualityDaily,
  getProfileQualityOverview,
  getProfileQualityTopErrors,
  type ProfileQualityBySourceRow,
  type ProfileQualityDailyRow,
  type ProfileQualityOverview,
  type ProfileQualityTopErrorRow,
  type QualityHealthLevel,
} from "@/lib/api/dataQualityAudit";

const chartConfig = {
  rejections: { label: "Rejeições", color: "hsl(0 84% 60%)" },
};

const SOURCE_LABELS: Record<string, string> = {
  "auth.register": "Cadastro (auth)",
  "profile.update": "Atualização de perfil",
  "manual.runner": "Corredor manual",
  "organizer.settings": "Organizador",
  "system.settings": "Configurações do sistema",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function healthLabel(level: QualityHealthLevel): string {
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

function healthBadgeClass(level: QualityHealthLevel): string {
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

export default function AuditDataQualityPage() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<ProfileQualityOverview | null>(null);
  const [daily, setDaily] = useState<ProfileQualityDailyRow[]>([]);
  const [topErrors, setTopErrors] = useState<ProfileQualityTopErrorRow[]>([]);
  const [bySource, setBySource] = useState<ProfileQualityBySourceRow[]>([]);

  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [overviewRes, dailyRes, topErrorsRes, bySourceRes] = await Promise.all([
        getProfileQualityOverview(30),
        getProfileQualityDaily(30),
        getProfileQualityTopErrors(30),
        getProfileQualityBySource(30),
      ]);
      setOverview(overviewRes.success && overviewRes.data ? overviewRes.data : null);
      setDaily(dailyRes.success && dailyRes.data ? dailyRes.data : []);
      setTopErrors(topErrorsRes.success && topErrorsRes.data ? topErrorsRes.data : []);
      setBySource(bySourceRes.success && bySourceRes.data ? bySourceRes.data : []);
    } catch {
      toast.error("Erro ao carregar qualidade dos dados");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Carregando qualidade dos dados…</span>
      </div>
    );
  }

  const kpis = overview ?? {
    period_days: 30,
    total_rejections: 0,
    invalid_full_name: 0,
    invalid_phone: 0,
    invalid_postal_code: 0,
    invalid_city: 0,
    invalid_neighborhood: 0,
    invalid_birth_date: 0,
    invalid_gender: 0,
    invalid_email: 0,
    total_validations: 0,
    rejection_rate_pct: 0,
    quality_status: "excellent" as QualityHealthLevel,
  };

  const chartData = daily.map((row) => ({
    ...row,
    label: formatChartDayLabel(row.day),
  }));

  const metricCards = [
    {
      title: "Cadastros rejeitados (30 dias)",
      value: kpis.total_rejections,
      icon: Ban,
      color: "text-red-600",
    },
    {
      title: "Nomes inválidos",
      value: kpis.invalid_full_name,
      icon: UserX,
      color: "text-rose-600",
      code: "INVALID_FULL_NAME",
    },
    {
      title: "Telefones inválidos",
      value: kpis.invalid_phone,
      icon: Phone,
      color: "text-orange-600",
      code: "INVALID_PHONE / INVALID_CONTACT_PHONE",
    },
    {
      title: "CEP inválido",
      value: kpis.invalid_postal_code,
      icon: MapPin,
      color: "text-amber-600",
      code: "INVALID_POSTAL_CODE",
    },
    {
      title: "Cidade inválida",
      value: kpis.invalid_city,
      icon: Building2,
      color: "text-yellow-600",
      code: "INVALID_CITY",
    },
    {
      title: "Bairro inválido",
      value: kpis.invalid_neighborhood,
      icon: Home,
      color: "text-lime-600",
      code: "INVALID_NEIGHBORHOOD",
    },
    {
      title: "Data de nascimento inválida",
      value: kpis.invalid_birth_date,
      icon: Calendar,
      color: "text-cyan-600",
      code: "INVALID_BIRTH_DATE",
    },
    {
      title: "Sexo inválido",
      value: kpis.invalid_gender,
      icon: Users,
      color: "text-blue-600",
      code: "INVALID_GENDER",
    },
    {
      title: "E-mail inválido",
      value: kpis.invalid_email,
      icon: Mail,
      color: "text-violet-600",
      code: "INVALID_EMAIL",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold mb-2">Auditoria — Qualidade dos Dados</h2>
          <p className="text-muted-foreground">
            Validações de perfil rejeitadas — últimos {kpis.period_days} dias (sem PII)
          </p>
        </div>
        <Card className="sm:min-w-[220px]">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />
              Status geral
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Badge
              variant="outline"
              className={`text-base px-3 py-1 ${healthBadgeClass(kpis.quality_status)}`}
            >
              {healthLabel(kpis.quality_status)}
            </Badge>
            <p className="text-xs text-muted-foreground mt-2">
              Taxa de rejeição: {kpis.rejection_rate_pct.toLocaleString("pt-BR")}%
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {metricCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <card.icon className={`h-4 w-4 ${card.color}`} />
                {card.title}
              </CardDescription>
              <CardTitle className="text-2xl">{formatNumber(card.value)}</CardTitle>
              {card.code ? (
                <p className="text-xs text-muted-foreground font-mono">{card.code}</p>
              ) : null}
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Série diária</CardTitle>
          <CardDescription>Rejeições por dia — últimos 30 dias</CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.every((row) => row.rejections === 0) ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nenhuma rejeição registrada no período. As métricas são coletadas nas validações de perfil
              (cadastro, atualização, corredor manual e configurações).
            </p>
          ) : (
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey="rejections"
                  stroke="var(--color-rejections)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Top erros
            </CardTitle>
            <CardDescription>Códigos de rejeição mais frequentes no período</CardDescription>
          </CardHeader>
          <CardContent>
            {topErrors.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhum erro no período.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topErrors.map((row) => (
                    <TableRow key={row.code}>
                      <TableCell className="font-mono text-sm">{row.code}</TableCell>
                      <TableCell className="text-right">{formatNumber(row.count)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribuição por origem</CardTitle>
            <CardDescription>De onde vieram as rejeições (source)</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Percentual</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bySource.map((row) => (
                  <TableRow key={row.source}>
                    <TableCell>{SOURCE_LABELS[row.source] ?? row.source}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.count)}</TableCell>
                    <TableCell className="text-right">
                      {row.pct.toLocaleString("pt-BR")}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Excelente &lt;2% · Boa 2–5% · Atenção 5–10% · Crítica &gt;10% — taxa de rejeição sobre validações
        com source informado. Métricas em memória (reinício do servidor zera o histórico).
      </p>
    </div>
  );
}
