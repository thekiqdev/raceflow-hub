import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import {
  MapPin,
  Calendar,
  Award,
  Users,
  Clock,
  TrendingUp,
  BarChart3,
  MessageSquare,
  FileText,
  Wifi,
  Award as Trophy,
  Facebook,
  Instagram,
  Linkedin,
} from "lucide-react";
import heroImage from "@/assets/hero-running.jpg";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { EventFilters, EventFiltersState } from "@/components/event/EventFilters";

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
  const [filters, setFilters] = useState<EventFiltersState>({
    city: "",
    month: "",
    category: "",
    search: "",
  });

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
      {
        id: "4",
        title: "Circuito das Estações - Curitiba",
        event_date: "2025-03-15T06:30:00Z",
        city: "Curitiba",
        state: "PR",
        banner_url: null,
      },
      {
        id: "5",
        title: "Corrida do Bem - Belo Horizonte",
        event_date: "2025-05-10T07:00:00Z",
        city: "Belo Horizonte",
        state: "MG",
        banner_url: null,
      },
    ];
    setUpcomingEvents(mockEvents);
  }, []);

  const cities = Array.from(new Set(upcomingEvents.map(e => e.city))).sort();
  const categories = ["5K", "10K", "Meia Maratona", "Maratona", "Trail Run"];

  const filteredUpcomingEvents = upcomingEvents.filter(event => {
    const matchesSearch = 
      event.title.toLowerCase().includes(filters.search.toLowerCase()) ||
      event.city.toLowerCase().includes(filters.search.toLowerCase());
    
    const matchesCity = !filters.city || filters.city === "all" || event.city === filters.city;
    
    const eventMonth = event.event_date ? format(new Date(event.event_date), "MM") : "";
    const matchesMonth = !filters.month || filters.month === "all" || eventMonth === filters.month;
    
    const matchesCategory = !filters.category || filters.category === "all";
    
    return matchesSearch && matchesCity && matchesMonth && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="bg-card border-b sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-gradient-hero bg-clip-text text-transparent">RunEvents</h1>
          <div className="hidden md:flex items-center gap-6">
            <Button variant="ghost" onClick={() => navigate("/")}>
              HOME
            </Button>
            <Button variant="ghost" onClick={() => navigate("/events")}>
              INSCRIÇÕES
            </Button>
            <Button variant="ghost">SERVIÇOS</Button>
            <Button variant="ghost">ORÇAMENTO</Button>
            <Button variant="ghost">DÚVIDAS</Button>
            <Button variant="ghost">RESULTADOS</Button>
          </div>
          <Button className="bg-accent hover:bg-accent/90" size="sm">
            <MessageSquare className="mr-2 h-4 w-4" />
            (85) 99108-4183
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative h-[600px] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img src={heroImage} alt="Corredores em ação" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/60" />
        </div>

        <div className="relative z-10 container mx-auto px-4 text-center text-white">
          <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
            SOMOS UMA EMPRESA DE CRONOMETRAGEM ESPORTIVA
          </h1>
          <p className="text-lg md:text-xl mb-8 max-w-3xl mx-auto">
            ESPECIALIZADA EM CORRIDA DE RUA, TRABALHANDO COM O SISTEMA DE CHIPS
          </p>
          <Button size="lg" className="shadow-lg">
            SAIBA MAIS
          </Button>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="w-8 h-12 border-2 border-white rounded-full flex items-start justify-center p-2">
            <div className="w-1 h-3 bg-white rounded-full"></div>
          </div>
        </div>
      </section>

      {/* WhatsApp Contact Section */}
      <section className="py-16 bg-muted">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">FALE COM A GENTE!</h2>
          <div className="flex items-center justify-center gap-2 text-4xl md:text-6xl font-bold text-accent mb-4">
            <MessageSquare className="h-12 w-12 md:h-16 md:w-16" />
            <span>85 99108-4183</span>
            <MessageSquare className="h-12 w-12 md:h-16 md:w-16" />
          </div>
          <p className="text-lg text-muted-foreground">Tire suas dúvidas sobre inscrições e cronometragem</p>
          <p className="text-sm text-muted-foreground">Somente whatsapp em horário comercial</p>
        </div>
      </section>

      {/* Calendar Section - Upcoming Events */}
      <section className="container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold mb-8 text-center">Calendário de Eventos</h2>
        
        <div className="mb-8 max-w-4xl mx-auto">
          <EventFilters
            filters={filters}
            onFiltersChange={setFilters}
            cities={cities}
            categories={categories}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredUpcomingEvents.map((event) => (
                <Card
                  key={event.id}
                  className="overflow-hidden hover:shadow-xl transition-all hover:-translate-y-1 cursor-pointer"
                  onClick={() => navigate(`/events/${event.id}`)}
                >
                  <div className="h-48 bg-gradient-hero flex items-center justify-center">
                    <Award className="h-16 w-16 text-white opacity-50" />
                  </div>
                  <CardContent className="pt-4">
                    <h3 className="font-bold text-sm mb-2">
                      {format(new Date(event.event_date), "dd 'DE' MMMM 'DE' yyyy", { locale: ptBR }).toUpperCase()}
                    </h3>
                    <p className="text-xs text-muted-foreground mb-3">{event.title}</p>
                    <div className="space-y-1 text-xs mb-4">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3 w-3" />
                        <span>
                          {event.city} - {event.state}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3 w-3" />
                        <span>CORRIDA - CP</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1 text-xs" onClick={(e) => {
                        e.stopPropagation();
                        navigate("/events");
                      }}>
                        RESULTADOS INSCRITOS
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

      {/* Consultoria Section */}
      <section className="py-16 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <img src={heroImage} alt="Consultoria" className="rounded-lg shadow-lg" />
            </div>
            <div>
              <h2 className="text-3xl font-bold mb-4">CONSULTORIA DE CORRIDAS DE RUA</h2>
              <p className="text-muted-foreground mb-6">
                A RunEvents mais que uma empresa de cronometragem esportiva. Nós temos experiência e damos suporte a
                todos os pontos que é preciso para a execução de qualquer evento de corrida de rua.
              </p>
              <p className="text-muted-foreground mb-8">
                Veja o que nós podemos te ajudar em toda a logística e prepare-se uma corra será incrível!
              </p>
              <Button size="lg" className="bg-accent hover:bg-accent/90">
                <MessageSquare className="mr-2 h-5 w-5" />
                FALE CONOSCO
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold">NOSSOS SERVIÇOS</h2>
          </div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            <Card className="border-none shadow-md hover:shadow-xl transition-all">
              <CardContent className="pt-6 text-center">
                <FileText className="h-12 w-12 mx-auto mb-4 text-primary" />
                <h3 className="font-semibold mb-2">INSCRIÇÕES ON-LINE</h3>
                <p className="text-sm text-muted-foreground">
                  Utilize nosso site para realizar inscrições de forma rápida e intuitiva.
                </p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md hover:shadow-xl transition-all">
              <CardContent className="pt-6 text-center">
                <Clock className="h-12 w-12 mx-auto mb-4 text-primary" />
                <h3 className="font-semibold mb-2">MENSAGENS SMS</h3>
                <p className="text-sm text-muted-foreground">
                  Envie e receba confirmações de inscrição direto no celular.
                </p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md hover:shadow-xl transition-all">
              <CardContent className="pt-6 text-center">
                <TrendingUp className="h-12 w-12 mx-auto mb-4 text-primary" />
                <h3 className="font-semibold mb-2">CHIPS DESCARTÁVEIS</h3>
                <p className="text-sm text-muted-foreground">
                  Utilize os melhores chips para garantir precisão no evento.
                </p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md hover:shadow-xl transition-all">
              <CardContent className="pt-6 text-center">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 text-primary" />
                <h3 className="font-semibold mb-2">NÚMERO DE PEITO</h3>
                <p className="text-sm text-muted-foreground">Personalize os números com o nome do corredor.</p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md hover:shadow-xl transition-all">
              <CardContent className="pt-6 text-center">
                <Trophy className="h-12 w-12 mx-auto mb-4 text-primary" />
                <h3 className="font-semibold mb-2">FILMAGEM</h3>
                <p className="text-sm text-muted-foreground">
                  Capture todos os momentos importantes do evento em alta definição.
                </p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md hover:shadow-xl transition-all">
              <CardContent className="pt-6 text-center">
                <Wifi className="h-12 w-12 mx-auto mb-4 text-primary" />
                <h3 className="font-semibold mb-2">RESULTADOS ONLINE</h3>
                <p className="text-sm text-muted-foreground">Confira os resultados em tempo real pela internet.</p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md hover:shadow-xl transition-all">
              <CardContent className="pt-6 text-center">
                <FileText className="h-12 w-12 mx-auto mb-4 text-primary" />
                <h3 className="font-semibold mb-2">PONTOS ADICIONAIS</h3>
                <p className="text-sm text-muted-foreground">
                  Adicione pontos de controle extras no percurso para maior confiabilidade.
                </p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md hover:shadow-xl transition-all">
              <CardContent className="pt-6 text-center">
                <Users className="h-12 w-12 mx-auto mb-4 text-primary" />
                <h3 className="font-semibold mb-2">CRONÔMETROS</h3>
                <p className="text-sm text-muted-foreground">
                  Equipamentos de última geração para cronometragem precisa.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-2">NOSSOS NÚMEROS</h2>
            <p className="text-sm text-muted-foreground">ACOMPANHE NOSSAS REALIZAÇÕES</p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
            <div>
              <img src={heroImage} alt="Evento" className="rounded-lg shadow-lg" />
            </div>

            <div className="grid grid-cols-2 gap-8">
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <Users className="h-12 w-12 text-secondary" />
                </div>
                <div className="text-4xl font-bold text-secondary mb-1">290</div>
                <p className="text-sm font-semibold">Corridas executadas</p>
                <p className="text-xs text-muted-foreground">
                  Confira aqui as corridas que já tivemos o prazer de executar
                </p>
              </div>

              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <Trophy className="h-12 w-12 text-secondary" />
                </div>
                <div className="text-4xl font-bold text-secondary mb-1">71500</div>
                <p className="text-sm font-semibold">Atletas cadastrados</p>
                <p className="text-xs text-muted-foreground">
                  Já podemos te chamar de amigo! São milhares de atletas que já estão no nosso site
                </p>
              </div>

              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <TrendingUp className="h-12 w-12 text-secondary" />
                </div>
                <div className="text-4xl font-bold text-secondary mb-1">40</div>
                <p className="text-sm font-semibold">Média de corridas por ano</p>
                <p className="text-xs text-muted-foreground">Realizamos em média 40 corridas por ano</p>
              </div>

              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <MapPin className="h-12 w-12 text-secondary" />
                </div>
                <div className="text-4xl font-bold text-secondary mb-1">47</div>
                <p className="text-sm font-semibold">Cidades atendidas</p>
                <p className="text-xs text-muted-foreground">Já atuamos em 47 cidades que ficam no Ceará</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 bg-card border-t">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-center gap-6 mb-4">
            <Button variant="ghost" size="icon" className="hover:text-primary">
              <Facebook className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="hover:text-primary">
              <Instagram className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="hover:text-primary">
              <Linkedin className="h-5 w-5" />
            </Button>
          </div>
          <p className="text-sm text-center text-muted-foreground">© 2024 RunEvents. Plataforma de corridas de rua.</p>
          <div className="mt-4 text-center">
            <Button variant="link" className="text-muted-foreground text-sm" onClick={() => navigate("/auth")}>
              É organizador? Clique aqui
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
