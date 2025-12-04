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
import { format, differenceInDays, isFuture, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { getOwnProfile, type Profile } from "@/lib/api/profiles";
import { getRegistrations, type Registration } from "@/lib/api/registrations";
import { getRunnerAchievements, type Achievement } from "@/lib/api/runnerStats";
import { getRunnerStats, type RunnerStats } from "@/lib/api/runnerStats";

const RunnerProfile = () => {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [stats, setStats] = useState<RunnerStats | null>(null);

  useEffect(() => {
    if (user) {
      loadProfileData();
    }
  }, [user]);

  const loadProfileData = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const [profileResponse, registrationsResponse, achievementsResponse, statsResponse] = await Promise.all([
        getOwnProfile(),
        getRegistrations({ runner_id: user.id }),
        getRunnerAchievements(),
        getRunnerStats(),
      ]);

      if (profileResponse.success && profileResponse.data) {
        setProfile(profileResponse.data);
      } else {
        toast.error(profileResponse.error || "Erro ao carregar perfil");
      }

      if (registrationsResponse.success && registrationsResponse.data) {
        setRegistrations(registrationsResponse.data);
      } else {
        toast.error(registrationsResponse.error || "Erro ao carregar inscrições");
      }

      if (achievementsResponse.success && achievementsResponse.data) {
        setAchievements(achievementsResponse.data);
      } else {
        toast.error(achievementsResponse.error || "Erro ao carregar conquistas");
      }

      if (statsResponse.success && statsResponse.data) {
        setStats(statsResponse.data);
      } else {
        toast.error(statsResponse.error || "Erro ao carregar estatísticas");
      }
    } catch (error: any) {
      console.error("Error loading profile data:", error);
      toast.error(error.message || "Erro ao carregar dados do perfil");
    } finally {
      setLoading(false);
    }
  };
  
  const handleSignOut = async () => {
    await logout();
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

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">Erro ao carregar perfil</p>
            <Button onClick={loadProfileData}>Tentar Novamente</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const upcomingRaces = registrations.filter(r => 
    r.event_date && isFuture(new Date(r.event_date)) && r.status === "confirmed"
  );

  const completedRaces = registrations.filter(r => 
    r.event_date && isPast(new Date(r.event_date)) && r.status === "confirmed"
  );

  const totalDistance = stats?.total_distance || 0;
  const totalSpent = stats?.total_spent || 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background">
      <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1
            className="text-2xl font-bold bg-gradient-hero bg-clip-text text-transparent cursor-pointer"
            onClick={() => navigate("/runner/dashboard")}
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
                  {profile.full_name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 text-center md:text-left">
                <h2 className="text-3xl font-bold mb-2">{profile.full_name}</h2>
                <p className="text-muted-foreground mb-4">
                  {profile.gender && `${profile.gender} • `}
                  Corredor desde {profile.created_at ? format(new Date(profile.created_at), "yyyy") : new Date().getFullYear()}
                </p>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                  <div className="text-center p-4 bg-background/50 rounded-lg">
                    <div className="text-2xl font-bold text-primary">{stats?.total_registrations || 0}</div>
                    <div className="text-sm text-muted-foreground">Inscrições</div>
                  </div>
                  <div className="text-center p-4 bg-background/50 rounded-lg">
                    <div className="text-2xl font-bold text-secondary">{stats?.completed_races || 0}</div>
                    <div className="text-sm text-muted-foreground">Completadas</div>
                  </div>
                  <div className="text-center p-4 bg-background/50 rounded-lg">
                    <div className="text-2xl font-bold text-accent">{totalDistance.toFixed(1)}km</div>
                    <div className="text-sm text-muted-foreground">Distância Total</div>
                  </div>
                  <div className="text-center p-4 bg-background/50 rounded-lg">
                    <div className="text-2xl font-bold text-foreground">
                      R$ {totalSpent.toFixed(2).replace('.', ',')}
                    </div>
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
                    onClick={() => navigate("/runner/dashboard?tab=home")}
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
                        <CardTitle className="mb-2">{reg.event_title || 'Evento'}</CardTitle>
                        <CardDescription className="space-y-1">
                          {reg.event_date && (
                            <div className="flex items-center">
                              <Calendar className="mr-2 h-4 w-4" />
                              {format(new Date(reg.event_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                            </div>
                          )}
                          {reg.category_name && (
                            <div className="flex items-center">
                              <Target className="mr-2 h-4 w-4" />
                              {reg.category_name} {reg.category_distance ? `(${reg.category_distance})` : ''}
                            </div>
                          )}
                        </CardDescription>
                      </div>
                      <div className="flex flex-col gap-2">
                        {getStatusBadge(reg.status || 'pending')}
                        {getPaymentStatusBadge(reg.payment_status || 'pending')}
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
                        Valor: R$ {reg.total_amount.toFixed(2).replace('.', ',')}
                      </span>
                      {reg.event_date && (
                        <span className="text-sm text-muted-foreground">
                          Faltam {differenceInDays(new Date(reg.event_date), new Date())} dias
                        </span>
                      )}
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
                          <CardTitle>{reg.event_title || 'Evento'}</CardTitle>
                          <Trophy className="h-5 w-5 text-accent" />
                        </div>
                        <CardDescription className="space-y-1">
                          {reg.event_date && (
                            <div className="flex items-center">
                              <Calendar className="mr-2 h-4 w-4" />
                              {format(new Date(reg.event_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                            </div>
                          )}
                          {reg.category_name && (
                            <div className="flex items-center">
                              <Target className="mr-2 h-4 w-4" />
                              {reg.category_name} {reg.category_distance ? `(${reg.category_distance})` : ''}
                            </div>
                          )}
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
                    // Map achievement IDs to icons
                    const iconMap: Record<string, any> = {
                      first_race: Award,
                      five_races: Medal,
                      ten_races: Trophy,
                      distance_50k: Target,
                      distance_100k: Zap,
                      early_bird: Clock,
                    };
                    const Icon = iconMap[achievement.id] || Award;
                    const colorMap: Record<string, string> = {
                      first_race: "text-primary",
                      five_races: "text-secondary",
                      ten_races: "text-accent",
                      distance_50k: "text-primary",
                      distance_100k: "text-destructive",
                      early_bird: "text-secondary",
                    };

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
                                  ? colorMap[achievement.id] || "text-primary"
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
                    <div className="text-2xl font-bold">{stats?.completed_races || 0}</div>
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
