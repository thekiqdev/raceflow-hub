import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { 
  Loader2, 
  LogOut, 
  Calendar, 
  MapPin, 
  Trophy, 
  TrendingUp,
  Award,
  Target,
  Zap,
  Medal,
  Clock,
  CheckCircle2,
  XCircle
} from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Profile {
  full_name: string;
  cpf: string;
  phone: string;
  gender: string | null;
  birth_date: string;
}

interface Registration {
  id: string;
  status: string;
  payment_status: string;
  total_amount: number;
  created_at: string;
  confirmation_code: string | null;
  events: {
    title: string;
    event_date: string;
    city: string;
    state: string;
  };
  event_categories: {
    name: string;
    distance: string;
  };
}

interface Achievement {
  id: string;
  icon: any;
  title: string;
  description: string;
  unlocked: boolean;
  color: string;
}

const RunnerProfile = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);

  useEffect(() => {
    // Mock data for testing
    setProfile({
      full_name: "João Silva",
      cpf: "123.456.789-00",
      phone: "(11) 98765-4321",
      gender: "Masculino",
      birth_date: "1990-05-15",
    });

    const mockRegistrations: Registration[] = [
      {
        id: "1",
        status: "confirmed",
        payment_status: "paid",
        total_amount: 120.00,
        created_at: "2024-10-15T10:00:00Z",
        confirmation_code: "RUN2024001",
        events: {
          title: "Corrida de São Silvestre 2024",
          event_date: "2024-12-31T07:00:00Z",
          city: "São Paulo",
          state: "SP",
        },
        event_categories: {
          name: "Percurso Principal",
          distance: "15km",
        },
      },
      {
        id: "2",
        status: "confirmed",
        payment_status: "paid",
        total_amount: 85.00,
        created_at: "2024-09-20T14:30:00Z",
        confirmation_code: "RUN2024002",
        events: {
          title: "Maratona do Rio 2025",
          event_date: "2025-06-15T06:00:00Z",
          city: "Rio de Janeiro",
          state: "RJ",
        },
        event_categories: {
          name: "Meia Maratona",
          distance: "21km",
        },
      },
      {
        id: "3",
        status: "confirmed",
        payment_status: "paid",
        total_amount: 60.00,
        created_at: "2024-03-10T09:00:00Z",
        confirmation_code: "RUN2023003",
        events: {
          title: "Corrida do Bem",
          event_date: "2024-04-20T07:30:00Z",
          city: "Belo Horizonte",
          state: "MG",
        },
        event_categories: {
          name: "5K",
          distance: "5km",
        },
      },
      {
        id: "4",
        status: "confirmed",
        payment_status: "paid",
        total_amount: 95.00,
        created_at: "2024-06-05T11:00:00Z",
        confirmation_code: "RUN2024004",
        events: {
          title: "Circuito das Estações",
          event_date: "2024-07-28T06:30:00Z",
          city: "Curitiba",
          state: "PR",
        },
        event_categories: {
          name: "10K",
          distance: "10km",
        },
      },
    ];

    setRegistrations(mockRegistrations);
    calculateAchievements(mockRegistrations);
    setLoading(false);
  }, []);

  const calculateAchievements = (regs: Registration[]) => {
    const completedRaces = regs.filter(r => 
      new Date(r.events.event_date) < new Date() && 
      r.status === "confirmed"
    ).length;

    const totalDistance = regs.reduce((sum, r) => {
      const distance = parseFloat(r.event_categories.distance.replace(/[^0-9.]/g, ""));
      return sum + (isNaN(distance) ? 0 : distance);
    }, 0);

    const achievementsList: Achievement[] = [
      {
        id: "first_race",
        icon: Award,
        title: "Primeira Corrida",
        description: "Complete sua primeira corrida",
        unlocked: completedRaces >= 1,
        color: "text-primary"
      },
      {
        id: "five_races",
        icon: Medal,
        title: "Corredor Dedicado",
        description: "Complete 5 corridas",
        unlocked: completedRaces >= 5,
        color: "text-secondary"
      },
      {
        id: "ten_races",
        icon: Trophy,
        title: "Veterano",
        description: "Complete 10 corridas",
        unlocked: completedRaces >= 10,
        color: "text-accent"
      },
      {
        id: "distance_50k",
        icon: Target,
        title: "50km Totais",
        description: "Corra 50km no total",
        unlocked: totalDistance >= 50,
        color: "text-primary"
      },
      {
        id: "distance_100k",
        icon: Zap,
        title: "100km Totais",
        description: "Corra 100km no total",
        unlocked: totalDistance >= 100,
        color: "text-destructive"
      },
      {
        id: "early_bird",
        icon: Clock,
        title: "Madrugador",
        description: "Faça uma inscrição com mais de 30 dias de antecedência",
        unlocked: regs.some(r => 
          differenceInDays(new Date(r.events.event_date), new Date(r.created_at)) > 30
        ),
        color: "text-secondary"
      }
    ];

    setAchievements(achievementsList);
  };

  const handleSignOut = () => {
    navigate("/");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed":
        return <Badge className="bg-accent">Confirmada</Badge>;
      case "pending":
        return <Badge variant="secondary">Pendente</Badge>;
      case "cancelled":
        return <Badge variant="destructive">Cancelada</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge className="bg-accent"><CheckCircle2 className="mr-1 h-3 w-3" />Pago</Badge>;
      case "pending":
        return <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />Pendente</Badge>;
      case "refunded":
        return <Badge variant="outline">Reembolsado</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Falhou</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const upcomingRaces = registrations.filter(r => 
    new Date(r.events.event_date) >= new Date() && r.status === "confirmed"
  );

  const completedRaces = registrations.filter(r => 
    new Date(r.events.event_date) < new Date() && r.status === "confirmed"
  );

  const totalDistance = registrations
    .filter(r => r.status === "confirmed")
    .reduce((sum, r) => {
      const distance = parseFloat(r.event_categories.distance.replace(/[^0-9.]/g, ""));
      return sum + (isNaN(distance) ? 0 : distance);
    }, 0);

  const totalSpent = registrations
    .filter(r => r.payment_status === "paid")
    .reduce((sum, r) => sum + r.total_amount, 0);

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
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8">
        {/* Profile Header */}
        <Card className="mb-8 bg-gradient-card shadow-lg">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
              <Avatar className="h-24 w-24 border-4 border-primary">
                <AvatarFallback className="text-2xl bg-gradient-hero text-white">
                  {profile?.full_name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 text-center md:text-left">
                <h2 className="text-3xl font-bold mb-2">{profile?.full_name}</h2>
                <p className="text-muted-foreground mb-4">
                  {profile?.gender && `${profile.gender} • `}
                  Corredor desde {format(new Date(), "yyyy")}
                </p>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                  <div className="text-center p-4 bg-background/50 rounded-lg">
                    <div className="text-2xl font-bold text-primary">{registrations.length}</div>
                    <div className="text-sm text-muted-foreground">Inscrições</div>
                  </div>
                  <div className="text-center p-4 bg-background/50 rounded-lg">
                    <div className="text-2xl font-bold text-secondary">{completedRaces.length}</div>
                    <div className="text-sm text-muted-foreground">Completadas</div>
                  </div>
                  <div className="text-center p-4 bg-background/50 rounded-lg">
                    <div className="text-2xl font-bold text-accent">{totalDistance.toFixed(1)}km</div>
                    <div className="text-sm text-muted-foreground">Distância Total</div>
                  </div>
                  <div className="text-center p-4 bg-background/50 rounded-lg">
                    <div className="text-2xl font-bold text-foreground">R$ {totalSpent.toFixed(2)}</div>
                    <div className="text-sm text-muted-foreground">Investido</div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="upcoming" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upcoming">
              <Calendar className="mr-2 h-4 w-4" />
              Próximas ({upcomingRaces.length})
            </TabsTrigger>
            <TabsTrigger value="history">
              <Trophy className="mr-2 h-4 w-4" />
              Histórico ({completedRaces.length})
            </TabsTrigger>
            <TabsTrigger value="achievements">
              <Award className="mr-2 h-4 w-4" />
              Conquistas
            </TabsTrigger>
          </TabsList>

          {/* Upcoming Races */}
          <TabsContent value="upcoming" className="space-y-4">
            {upcomingRaces.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Nenhuma corrida futura confirmada</p>
                  <Button
                    className="mt-4"
                    onClick={() => navigate("/events")}
                  >
                    Explorar Eventos
                  </Button>
                </CardContent>
              </Card>
            ) : (
              upcomingRaces.map((reg) => (
                <Card key={reg.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div className="flex-1">
                        <CardTitle className="mb-2">{reg.events.title}</CardTitle>
                        <CardDescription className="space-y-1">
                          <div className="flex items-center">
                            <Calendar className="mr-2 h-4 w-4" />
                            {format(new Date(reg.events.event_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                          </div>
                          <div className="flex items-center">
                            <MapPin className="mr-2 h-4 w-4" />
                            {reg.events.city}, {reg.events.state}
                          </div>
                          <div className="flex items-center">
                            <Target className="mr-2 h-4 w-4" />
                            {reg.event_categories.name} - {reg.event_categories.distance}
                          </div>
                        </CardDescription>
                      </div>
                      <div className="flex flex-col gap-2">
                        {getStatusBadge(reg.status)}
                        {getPaymentStatusBadge(reg.payment_status)}
                        {reg.confirmation_code && (
                          <Badge variant="outline" className="font-mono text-xs">
                            {reg.confirmation_code}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <Separator />
                  <CardContent className="pt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">
                        Valor: R$ {reg.total_amount.toFixed(2)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        Faltam {differenceInDays(new Date(reg.events.event_date), new Date())} dias
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* History */}
          <TabsContent value="history" className="space-y-4">
            {completedRaces.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Trophy className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Nenhuma corrida completada ainda</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Suas corridas concluídas aparecerão aqui
                  </p>
                </CardContent>
              </Card>
            ) : (
              completedRaces.map((reg) => (
                <Card key={reg.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <CardTitle>{reg.events.title}</CardTitle>
                          <Trophy className="h-5 w-5 text-accent" />
                        </div>
                        <CardDescription className="space-y-1">
                          <div className="flex items-center">
                            <Calendar className="mr-2 h-4 w-4" />
                            {format(new Date(reg.events.event_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                          </div>
                          <div className="flex items-center">
                            <MapPin className="mr-2 h-4 w-4" />
                            {reg.events.city}, {reg.events.state}
                          </div>
                          <div className="flex items-center">
                            <Target className="mr-2 h-4 w-4" />
                            {reg.event_categories.name} - {reg.event_categories.distance}
                          </div>
                        </CardDescription>
                      </div>
                      <Badge className="bg-accent">Completada</Badge>
                    </div>
                  </CardHeader>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Achievements */}
          <TabsContent value="achievements" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Suas Conquistas</CardTitle>
                <CardDescription>
                  Desbloqueie conquistas participando de corridas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {achievements.map((achievement) => {
                    const Icon = achievement.icon;
                    return (
                      <div
                        key={achievement.id}
                        className={`p-4 rounded-lg border-2 transition-all ${
                          achievement.unlocked
                            ? "border-primary bg-primary/5"
                            : "border-muted bg-muted/20 opacity-60"
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <div
                            className={`p-3 rounded-full ${
                              achievement.unlocked
                                ? "bg-primary/10"
                                : "bg-muted"
                            }`}
                          >
                            <Icon
                              className={`h-6 w-6 ${
                                achievement.unlocked
                                  ? achievement.color
                                  : "text-muted-foreground"
                              }`}
                            />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold mb-1">
                              {achievement.title}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {achievement.description}
                            </p>
                            {achievement.unlocked && (
                              <Badge className="mt-2 bg-accent text-xs">
                                Desbloqueada!
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Statistics */}
            <Card>
              <CardHeader>
                <CardTitle>Estatísticas Gerais</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="p-4 rounded-lg bg-gradient-hero text-white">
                    <TrendingUp className="h-8 w-8 mb-2 opacity-80" />
                    <div className="text-2xl font-bold">{completedRaces.length}</div>
                    <div className="text-sm opacity-90">Corridas Completadas</div>
                  </div>
                  <div className="p-4 rounded-lg bg-secondary text-white">
                    <Target className="h-8 w-8 mb-2 opacity-80" />
                    <div className="text-2xl font-bold">{totalDistance.toFixed(1)}km</div>
                    <div className="text-sm opacity-90">Distância Percorrida</div>
                  </div>
                  <div className="p-4 rounded-lg bg-accent text-white">
                    <Award className="h-8 w-8 mb-2 opacity-80" />
                    <div className="text-2xl font-bold">
                      {achievements.filter(a => a.unlocked).length}/{achievements.length}
                    </div>
                    <div className="text-sm opacity-90">Conquistas Desbloqueadas</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default RunnerProfile;
