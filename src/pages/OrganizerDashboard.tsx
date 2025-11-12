import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
    checkAuth();
    loadStatistics();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", session.user.id)
      .single();

    if (profile) {
      setUserName(profile.full_name);
    }

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id);

    const isOrganizer = roles?.some(r => r.role === "organizer" || r.role === "admin");
    if (!isOrganizer) {
      navigate("/dashboard");
      toast.error("Acesso não autorizado");
    }
  };

  const loadStatistics = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Get organizer's events
      const { data: events, error: eventsError } = await supabase
        .from("events")
        .select("id, event_date, status")
        .eq("organizer_id", session.user.id);

      if (eventsError) throw eventsError;

      const eventIds = events?.map(e => e.id) || [];
      const upcomingEvents = events?.filter(e => 
        new Date(e.event_date) > new Date() && e.status === "published"
      ).length || 0;

      if (eventIds.length === 0) {
        setStatistics({
          totalRegistrations: 0,
          totalRevenue: 0,
          averageTicket: 0,
          registrationsByDay: [],
          registrationsByGender: [],
          registrationsByAge: [],
          upcomingEvents,
        });
        setLoading(false);
        return;
      }

      // Get registrations with runner profiles
      const { data: registrations, error: registrationsError } = await supabase
        .from("registrations")
        .select(`
          id,
          total_amount,
          created_at,
          runner_id,
          profiles!registrations_runner_id_fkey (
            gender,
            birth_date
          )
        `)
        .in("event_id", eventIds);

      if (registrationsError) throw registrationsError;

      const totalRegistrations = registrations?.length || 0;
      const totalRevenue = registrations?.reduce((sum, r) => sum + parseFloat(String(r.total_amount)), 0) || 0;
      const averageTicket = totalRegistrations > 0 ? totalRevenue / totalRegistrations : 0;

      // Registrations by day (last 30 days)
      const last30Days = eachDayOfInterval({
        start: subDays(new Date(), 29),
        end: new Date(),
      });

      const registrationsByDay = last30Days.map(day => {
        const dayStr = format(day, "yyyy-MM-dd");
        const count = registrations?.filter(r => 
          format(new Date(r.created_at), "yyyy-MM-dd") === dayStr
        ).length || 0;
        return {
          date: format(day, "dd/MM", { locale: ptBR }),
          count,
        };
      });

      // Registrations by gender
      const genderCounts: Record<string, number> = {};
      registrations?.forEach(r => {
        const gender = r.profiles?.gender || "Não informado";
        genderCounts[gender] = (genderCounts[gender] || 0) + 1;
      });

      const registrationsByGender = Object.entries(genderCounts).map(([gender, count]) => ({
        gender,
        count,
      }));

      // Registrations by age group
      const calculateAge = (birthDate: string) => {
        const today = new Date();
        const birth = new Date(birthDate);
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
          age--;
        }
        return age;
      };

      const ageGroups: Record<string, number> = {
        "18-25": 0,
        "26-35": 0,
        "36-45": 0,
        "46-55": 0,
        "56+": 0,
      };

      registrations?.forEach(r => {
        if (r.profiles?.birth_date) {
          const age = calculateAge(r.profiles.birth_date);
          if (age >= 18 && age <= 25) ageGroups["18-25"]++;
          else if (age >= 26 && age <= 35) ageGroups["26-35"]++;
          else if (age >= 36 && age <= 45) ageGroups["36-45"]++;
          else if (age >= 46 && age <= 55) ageGroups["46-55"]++;
          else if (age >= 56) ageGroups["56+"]++;
        }
      });

      const registrationsByAge = Object.entries(ageGroups)
        .map(([ageGroup, count]) => ({ ageGroup, count }))
        .filter(item => item.count > 0);

      setStatistics({
        totalRegistrations,
        totalRevenue,
        averageTicket,
        registrationsByDay,
        registrationsByGender,
        registrationsByAge,
        upcomingEvents,
      });
    } catch (error) {
      console.error("Error loading statistics:", error);
      toast.error("Erro ao carregar estatísticas");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
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