import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { Search, MapPin, Calendar, Award, Users, Zap, Shield, Clock } from "lucide-react";
import heroImage from "@/assets/hero-running.jpg";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Event {
  id: string;
  title: string;
  event_date: string;
  city: string;
  state: string;
  banner_url: string | null;
}

const Index = () => {
  const navigate = useNavigate();
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);

  useEffect(() => {
    // Mock upcoming events for testing
    const mockEvents: Event[] = [
      {
        id: "1",
        title: "Corrida de São Silvestre 2024",
        event_date: "2024-12-31T07:00:00Z",
        city: "São Paulo",
        state: "SP",
        banner_url: null,
      },
      {
        id: "2",
        title: "Maratona do Rio 2025",
        event_date: "2025-06-15T06:00:00Z",
        city: "Rio de Janeiro",
        state: "RJ",
        banner_url: null,
      },
      {
        id: "3",
        title: "Meia Maratona de Florianópolis",
        event_date: "2025-09-20T07:30:00Z",
        city: "Florianópolis",
        state: "SC",
        banner_url: null,
      },
    ];
    setUpcomingEvents(mockEvents);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="absolute top-0 left-0 right-0 z-50 bg-transparent">
        <div className="container mx-auto px-4 py-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white drop-shadow-lg">
            RunEvents
          </h1>
          <div className="flex gap-4">
            <Button
              variant="ghost"
              className="text-white hover:bg-white/20"
              onClick={() => navigate("/events")}
            >
              Eventos
            </Button>
            <Button
              variant="outline"
              className="bg-white/10 backdrop-blur-sm border-white/20 text-white hover:bg-white/20"
              onClick={() => navigate("/auth")}
            >
              Entrar
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative h-[700px] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src={heroImage}
            alt="Corredores em ação"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/80" />
        </div>
        
        <div className="relative z-10 container mx-auto px-4 text-center text-white">
          <Badge className="mb-4 bg-primary/90 text-white border-none text-sm px-4 py-1">
            Encontre sua próxima corrida
          </Badge>
          <h1 className="text-5xl md:text-7xl font-bold mb-6 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            Sua Corrida,<br />Seu Desafio
          </h1>
          <p className="text-xl md:text-2xl mb-8 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-200 opacity-90">
            Descubra e participe das melhores corridas de rua do Brasil
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-300">
            <Button
              size="lg"
              className="text-lg px-8 shadow-glow"
              onClick={() => navigate("/events")}
            >
              <Search className="mr-2 h-5 w-5" />
              Encontrar Corridas
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-lg px-8 bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/20 text-white"
              onClick={() => navigate("/auth")}
            >
              Criar Conta Grátis
            </Button>
          </div>
        </div>
      </section>

      {/* Upcoming Events Preview */}
      {upcomingEvents.length > 0 && (
        <section className="py-16 bg-gradient-to-b from-muted/30 to-background">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Próximos Eventos
              </h2>
              <p className="text-muted-foreground text-lg">
                Não perca as corridas mais aguardadas
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3 mb-8">
              {upcomingEvents.map((event) => (
                <Card key={event.id} className="overflow-hidden hover:shadow-xl transition-all hover:-translate-y-1 cursor-pointer" onClick={() => navigate("/events")}>
                  {event.banner_url ? (
                    <div className="h-48 bg-muted overflow-hidden">
                      <img
                        src={event.banner_url}
                        alt={event.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="h-48 bg-gradient-hero flex items-center justify-center">
                      <Award className="h-16 w-16 text-white opacity-50" />
                    </div>
                  )}
                  <CardHeader>
                    <CardTitle className="line-clamp-2">{event.title}</CardTitle>
                    <div className="flex flex-col gap-2 text-sm text-muted-foreground mt-2">
                      <div className="flex items-center">
                        <Calendar className="mr-2 h-4 w-4" />
                        {format(new Date(event.event_date), "dd 'de' MMMM", { locale: ptBR })}
                      </div>
                      <div className="flex items-center">
                        <MapPin className="mr-2 h-4 w-4" />
                        {event.city}, {event.state}
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>

            <div className="text-center">
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate("/events")}
              >
                Ver Todas as Corridas
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Benefits Section */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Por que correr com a gente?
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Tudo que você precisa para encontrar e participar da corrida perfeita
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-gradient-card border-none shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
              <CardContent className="pt-6 text-center">
                <div className="w-16 h-16 bg-gradient-hero rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Fácil de Encontrar</h3>
                <p className="text-muted-foreground">
                  Busque corridas por cidade, data ou distância
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-card border-none shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
              <CardContent className="pt-6 text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-secondary to-secondary/80 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Zap className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Inscrição Rápida</h3>
                <p className="text-muted-foreground">
                  Inscreva-se em minutos de forma simples e segura
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-card border-none shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
              <CardContent className="pt-6 text-center">
                <div className="w-16 h-16 bg-gradient-accent rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Pagamento Seguro</h3>
                <p className="text-muted-foreground">
                  Seus dados protegidos com total segurança
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-card border-none shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
              <CardContent className="pt-6 text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-primary to-destructive rounded-full flex items-center justify-center mx-auto mb-4">
                  <Clock className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Confirmação Instantânea</h3>
                <p className="text-muted-foreground">
                  Receba sua confirmação na hora por email
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-20 bg-gradient-to-b from-background to-muted/20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Como Funciona
            </h2>
            <p className="text-muted-foreground text-lg">
              Três passos simples para sua próxima corrida
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center mx-auto mb-4 text-white text-2xl font-bold shadow-glow">
                1
              </div>
              <h3 className="text-xl font-semibold mb-2">Encontre sua Corrida</h3>
              <p className="text-muted-foreground">
                Explore eventos por localização, data ou modalidade
              </p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4 text-white text-2xl font-bold">
                2
              </div>
              <h3 className="text-xl font-semibold mb-2">Faça sua Inscrição</h3>
              <p className="text-muted-foreground">
                Escolha sua categoria, kit e complete o pagamento
              </p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 bg-accent rounded-full flex items-center justify-center mx-auto mb-4 text-white text-2xl font-bold">
                3
              </div>
              <h3 className="text-xl font-semibold mb-2">Corra e Supere-se</h3>
              <p className="text-muted-foreground">
                Receba sua confirmação e prepare-se para o grande dia
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-hero">
        <div className="container mx-auto px-4 text-center text-white">
          <Users className="h-16 w-16 mx-auto mb-6 opacity-90" />
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Junte-se a milhares de corredores
          </h2>
          <p className="text-lg mb-8 max-w-2xl mx-auto opacity-90">
            Crie sua conta gratuita agora e comece a descobrir as melhores corridas de rua do Brasil
          </p>
          <Button
            size="lg"
            variant="secondary"
            className="text-lg px-8 shadow-lg"
            onClick={() => navigate("/auth")}
          >
            Criar Conta Gratuita
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t bg-card/50">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p className="text-sm">
            © 2024 RunEvents. Plataforma de corridas de rua.
          </p>
          <div className="mt-4 text-sm">
            <Button
              variant="link"
              className="text-muted-foreground"
              onClick={() => navigate("/auth")}
            >
              É organizador? Clique aqui
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
