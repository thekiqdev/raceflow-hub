import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, LogOut, TrendingUp, Users, DollarSign, Calendar, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { format, subDays, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Statistics {
  totalRegistrations: number;
  totalRevenue: number;
  averageTicket: number;
  registrationsByDay: { date: string; count: number }[];
  registrationsByGender: { gender: string; count: number }[];
  registrationsByAge: { ageGroup: string; count: number }[];
  upcomingEvents: number;
}

const OrganizerDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    // Mock data for testing
    setUserName("João Silva");
    
    const last30Days = eachDayOfInterval({
      start: subDays(new Date(), 29),
      end: new Date(),
    });

    const mockRegistrationsByDay = last30Days.map((day, index) => ({
      date: format(day, "dd/MM", { locale: ptBR }),
      count: Math.floor(Math.random() * 15) + (index > 20 ? 5 : 2), // Simula crescimento
    }));

    setStatistics({
      totalRegistrations: 147,
      totalRevenue: 12450.00,
      averageTicket: 84.69,
      registrationsByDay: mockRegistrationsByDay,
      registrationsByGender: [
        { gender: "Masculino", count: 89 },
        { gender: "Feminino", count: 54 },
        { gender: "Não informado", count: 4 },
      ],
      registrationsByAge: [
        { ageGroup: "18-25", count: 23 },
        { ageGroup: "26-35", count: 58 },
        { ageGroup: "36-45", count: 42 },
        { ageGroup: "46-55", count: 18 },
        { ageGroup: "56+", count: 6 },
      ],
      upcomingEvents: 3,
    });
    
    setLoading(false);
  }, []);

  const handleSignOut = () => {
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))", "hsl(var(--destructive))"];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background">
      <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1
            className="text-2xl font-bold bg-gradient-hero bg-clip-text text-transparent cursor-pointer"
            onClick={() => navigate("/dashboard")}
          >
            RunEvents
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Olá, {userName}</span>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">Dashboard do Organizador</h2>
          <p className="text-muted-foreground">Acompanhe o desempenho dos seus eventos</p>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card className="bg-gradient-card shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Inscrições</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {statistics?.totalRegistrations || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Atletas inscritos
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Faturamento Total</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-secondary">
                R$ {statistics?.totalRevenue.toFixed(2) || "0.00"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Receita total
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-accent">
                R$ {statistics?.averageTicket.toFixed(2) || "0.00"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Por inscrição
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Eventos Futuros</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statistics?.upcomingEvents || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Eventos publicados
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <Tabs defaultValue="timeline" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="timeline">
              <BarChart3 className="mr-2 h-4 w-4" />
              Inscrições por Dia
            </TabsTrigger>
            <TabsTrigger value="gender">
              <Users className="mr-2 h-4 w-4" />
              Por Gênero
            </TabsTrigger>
            <TabsTrigger value="age">
              <TrendingUp className="mr-2 h-4 w-4" />
              Por Faixa Etária
            </TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="space-y-4">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Inscrições nos Últimos 30 Dias</CardTitle>
                <CardDescription>Acompanhe a evolução diária das inscrições</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={statistics?.registrationsByDay || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="count"
                      name="Inscrições"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ fill: "hsl(var(--primary))" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="gender" className="space-y-4">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Distribuição por Gênero</CardTitle>
                <CardDescription>Perfil dos atletas inscritos</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <PieChart>
                    <Pie
                      data={statistics?.registrationsByGender || []}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ gender, percent }) => `${gender}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {statistics?.registrationsByGender.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="age" className="space-y-4">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Distribuição por Faixa Etária</CardTitle>
                <CardDescription>Idade dos atletas participantes</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={statistics?.registrationsByAge || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="ageGroup" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar
                      dataKey="count"
                      name="Inscrições"
                      fill="hsl(var(--secondary))"
                      radius={[8, 8, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default OrganizerDashboard;