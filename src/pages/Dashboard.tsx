import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, LogOut, Calendar, Users, Trophy, Settings } from "lucide-react";
import { toast } from "sonner";

interface UserProfile {
  full_name: string;
  roles: string[];
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate("/auth");
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", session.user.id)
        .single();

      if (profileError) throw profileError;

      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);

      if (rolesError) throw rolesError;

      setProfile({
        full_name: profileData.full_name,
        roles: rolesData.map(r => r.role),
      });
    } catch (error) {
      console.error("Error loading profile:", error);
      toast.error("Erro ao carregar perfil");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Erro ao fazer logout");
    } else {
      toast.success("Logout realizado com sucesso!");
      navigate("/");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isAdmin = profile?.roles.includes("admin");
  const isOrganizer = profile?.roles.includes("organizer");
  const isRunner = profile?.roles.includes("runner");

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background">
      <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-gradient-hero bg-clip-text text-transparent">
            RunEvents
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              Olá, {profile?.full_name}
            </span>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">Dashboard</h2>
          <p className="text-muted-foreground">
            Bem-vindo à sua área de gestão
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {isAdmin && (
            <>
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <Users className="h-8 w-8 text-primary mb-2" />
                  <CardTitle>Usuários</CardTitle>
                  <CardDescription>Gerenciar organizadores e atletas</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full">Acessar</Button>
                </CardContent>
              </Card>
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <Settings className="h-8 w-8 text-primary mb-2" />
                  <CardTitle>Configurações</CardTitle>
                  <CardDescription>Taxas e comissões da plataforma</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full">Acessar</Button>
                </CardContent>
              </Card>
            </>
          )}

          {(isOrganizer || isAdmin) && (
            <>
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <Settings className="h-8 w-8 text-primary mb-2" />
                  <CardTitle>Dashboard Organizador</CardTitle>
                  <CardDescription>Estatísticas e relatórios completos</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full" onClick={() => navigate("/organizer/dashboard")}>
                    Ver Dashboard
                  </Button>
                </CardContent>
              </Card>
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <Calendar className="h-8 w-8 text-primary mb-2" />
                  <CardTitle>Meus Eventos</CardTitle>
                  <CardDescription>Criar e gerenciar eventos</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full">Acessar</Button>
                </CardContent>
              </Card>
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <Trophy className="h-8 w-8 text-primary mb-2" />
                  <CardTitle>Inscrições</CardTitle>
                  <CardDescription>Gerenciar inscrições de atletas</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full">Acessar</Button>
                </CardContent>
              </Card>
            </>
          )}

          {isRunner && (
            <>
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <Calendar className="h-8 w-8 text-primary mb-2" />
                  <CardTitle>Explorar Eventos</CardTitle>
                  <CardDescription>Descobrir próximas corridas</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full" onClick={() => navigate("/events")}>
                    Explorar
                  </Button>
                </CardContent>
              </Card>
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <Trophy className="h-8 w-8 text-primary mb-2" />
                  <CardTitle>Minhas Inscrições</CardTitle>
                  <CardDescription>Ver histórico de participações</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full">Ver Histórico</Button>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;