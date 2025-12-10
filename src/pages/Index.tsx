import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { MapPin, Calendar, Award, Users, Clock, TrendingUp, BarChart3, MessageSquare, FileText, Wifi, Trophy, Facebook, Instagram, Linkedin } from "lucide-react";
import heroImage from "@/assets/hero-running.jpg";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { EventFilters, EventFiltersState } from "@/components/event/EventFilters";
import { Header } from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";
import { getHomePageSettings, updateHomePageSettings } from "@/lib/api/homePageSettings";
import { getEvents } from "@/lib/api/events";
import { VisualEditorProvider } from "@/contexts/VisualEditorContext";
import { EditableText } from "@/components/visual-editor/EditableText";
import { EditableImage } from "@/components/visual-editor/EditableImage";
import { EditorToolbar } from "@/components/visual-editor/EditorToolbar";
import { toast } from "sonner";
interface Event {
  id: string;
  title: string;
  event_date: string;
  city: string;
  state: string;
  banner_url: string | null;
  result_url: string | null;
  status: string;
}
const Index = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.roles?.includes('admin') || false;
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);
  const [filters, setFilters] = useState<EventFiltersState>({
    city: "",
    month: "",
    category: "",
    search: ""
  });
  const [pageSettings, setPageSettings] = useState({
    hero_title: "SOMOS UMA EMPRESA DE CRONOMETRAGEM ESPORTIVA",
    hero_subtitle: "ESPECIALIZADA EM CORRIDA DE RUA, TRABALHANDO COM O SISTEMA DE CHIPS",
    hero_image_url: heroImage,
    whatsapp_number: "85 99108-4183",
    whatsapp_text: "Tire suas dúvidas sobre inscrições e cronometragem",
    consultoria_title: "CONSULTORIA DE CORRIDAS DE RUA",
    consultoria_description: "A RunEvents mais que uma empresa de cronometragem esportiva. Nós temos experiência e damos suporte a todos os pontos que é preciso para a execução de qualquer evento de corrida de rua.",
    stats_events: "290",
    stats_events_label: "Corridas executadas",
    stats_runners: "71500",
    stats_runners_label: "Atletas cadastrados",
    stats_cities: "47",
    stats_cities_label: "Cidades atendidas",
    stats_years: "40",
    stats_years_label: "Média de corridas por ano",
  });
  useEffect(() => {
    loadPageSettings();
    loadUpcomingEvents(); // Load events from API instead of mock
  }, []);

  const loadUpcomingEvents = async () => {
    try {
      // Buscar eventos publicados
      const publishedResponse = await getEvents({ status: 'published' });
      
      // Buscar eventos finalizados com resultados disponíveis
      const finishedResponse = await getEvents({ status: 'finished' });
      
      const allEvents: Event[] = [];
      
      // Adicionar eventos publicados
      if (publishedResponse.success && publishedResponse.data) {
        allEvents.push(...publishedResponse.data);
      }
      
      // Adicionar eventos finalizados que têm result_url
      if (finishedResponse.success && finishedResponse.data) {
        const eventsWithResults = finishedResponse.data.filter(event => event.result_url);
        allEvents.push(...eventsWithResults);
      }
      
      setUpcomingEvents(allEvents);
    } catch (error) {
      console.error("Erro ao carregar eventos:", error);
      toast.error("Erro ao carregar eventos");
    }
  };

  const loadPageSettings = async () => {
    try {
      const response = await getHomePageSettings();

      if (!response.success) {
        console.warn('Failed to load page settings:', response.error);
        return; // Use default settings if API fails
      }

      if (response.data) {
        const data = response.data;
        setPageSettings({
          hero_title: data.hero_title || pageSettings.hero_title,
          hero_subtitle: data.hero_subtitle || pageSettings.hero_subtitle,
          hero_image_url: data.hero_image_url || heroImage,
          whatsapp_number: data.whatsapp_number || pageSettings.whatsapp_number,
          whatsapp_text: data.whatsapp_text || pageSettings.whatsapp_text,
          consultoria_title: data.consultoria_title || pageSettings.consultoria_title,
          consultoria_description: data.consultoria_description || pageSettings.consultoria_description,
          stats_events: data.stats_events || pageSettings.stats_events,
          stats_events_label: data.stats_events_label || pageSettings.stats_events_label,
          stats_runners: data.stats_runners || pageSettings.stats_runners,
          stats_runners_label: data.stats_runners_label || pageSettings.stats_runners_label,
          stats_cities: data.stats_cities || pageSettings.stats_cities,
          stats_cities_label: data.stats_cities_label || pageSettings.stats_cities_label,
          stats_years: data.stats_years || pageSettings.stats_years,
          stats_years_label: data.stats_years_label || pageSettings.stats_years_label,
        });
      }
    } catch (error) {
      console.error("Erro ao carregar configurações:", error);
    }
  };

  const handleSaveChanges = async (editedContent: Record<string, any>) => {
    try {
      const response = await updateHomePageSettings({
        hero_title: editedContent.hero_title,
        hero_subtitle: editedContent.hero_subtitle,
        hero_image_url: editedContent.hero_image_url,
        whatsapp_text: editedContent.whatsapp_text,
        consultoria_title: editedContent.consultoria_title,
        consultoria_description: editedContent.consultoria_description,
        stats_events: editedContent.stats_events,
        stats_events_label: editedContent.stats_events_label,
        stats_runners: editedContent.stats_runners,
        stats_runners_label: editedContent.stats_runners_label,
        stats_cities: editedContent.stats_cities,
        stats_cities_label: editedContent.stats_cities_label,
        stats_years: editedContent.stats_years,
        stats_years_label: editedContent.stats_years_label,
      });

      if (!response.success) {
        throw new Error(response.error || 'Erro ao salvar configurações');
      }

      await loadPageSettings();
      toast.success('Configurações salvas com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar configurações:', error);
      toast.error('Erro ao salvar configurações');
      throw error;
    }
  };
  const cities = Array.from(new Set(upcomingEvents.map(e => e.city))).sort();
  const categories = ["5K", "10K", "Meia Maratona", "Maratona", "Trail Run"];
  const filteredUpcomingEvents = upcomingEvents.filter(event => {
    const matchesSearch = event.title.toLowerCase().includes(filters.search.toLowerCase()) || event.city.toLowerCase().includes(filters.search.toLowerCase());
    const matchesCity = !filters.city || filters.city === "all" || event.city === filters.city;
    const eventMonth = event.event_date ? format(new Date(event.event_date), "MM") : "";
    const matchesMonth = !filters.month || filters.month === "all" || eventMonth === filters.month;
    const matchesCategory = !filters.category || filters.category === "all";
    return matchesSearch && matchesCity && matchesMonth && matchesCategory;
  });
  return (
    <VisualEditorProvider 
      initialContent={pageSettings}
      onSave={handleSaveChanges}
    >
      <div className="min-h-screen bg-background">
        {isAdmin && <EditorToolbar />}
        {/* Navigation */}
        <Header />

        {/* Hero Section */}
        <section className="relative h-[600px] flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 z-0">
            <EditableImage
              contentKey="hero_image_url"
              defaultValue={pageSettings.hero_image_url}
              className="w-full h-full object-cover"
              alt="Corredores em ação"
            />
            <div className="absolute inset-0 bg-black/60" />
          </div>

          <div className="relative z-10 container mx-auto px-4 text-center text-white">
            <EditableText
              contentKey="hero_title"
              defaultValue={pageSettings.hero_title}
              as="h1"
              className="text-4xl md:text-5xl font-bold mb-6 leading-tight"
            />
            <EditableText
              contentKey="hero_subtitle"
              defaultValue={pageSettings.hero_subtitle}
              as="p"
              className="text-lg md:text-xl mb-8 max-w-3xl mx-auto"
            />
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
              <span>{pageSettings.whatsapp_number}</span>
              <MessageSquare className="h-12 w-12 md:h-16 md:w-16" />
            </div>
            <EditableText
              contentKey="whatsapp_text"
              defaultValue={pageSettings.whatsapp_text}
              as="p"
              className="text-lg text-muted-foreground"
            />
            <p className="text-sm text-muted-foreground">Somente whatsapp em horário comercial</p>
          </div>
        </section>

        {/* Calendar Section - Upcoming Events */}
        <section className="container mx-auto px-4 py-16">
          <h2 className="text-3xl font-bold mb-8 text-center">Calendário de Eventos</h2>
          
          <div className="mb-8 max-w-4xl mx-auto">
            <EventFilters filters={filters} onFiltersChange={setFilters} cities={cities} categories={categories} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredUpcomingEvents.map(event => <Card key={event.id} className="overflow-hidden hover:shadow-xl transition-all hover:-translate-y-1 cursor-pointer" onClick={() => navigate(`/events/${event.id}`)}>
                    <div className="h-48 bg-gradient-hero flex items-center justify-center">
                      <Award className="h-16 w-16 text-white opacity-50" />
                    </div>
                    <CardContent className="pt-4">
                      <h3 className="font-bold text-sm mb-2">
                        {format(new Date(event.event_date), "dd 'DE' MMMM 'DE' yyyy", {
                  locale: ptBR
                }).toUpperCase()}
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
                        {event.result_url ? (
                          <Button 
                            size="sm" 
                            className="flex-1 text-xs" 
                            onClick={e => {
                              e.stopPropagation();
                              // Corrigir URL se contiver template strings
                              let urlToOpen = event.result_url!;
                              if (urlToOpen.includes('${')) {
                                const port = window.location.port || '3001';
                                urlToOpen = urlToOpen.replace(/\$\{API_PORT\}/g, port);
                                // Se ainda tiver template strings, usar localhost:3001 como padrão
                                if (urlToOpen.includes('${')) {
                                  urlToOpen = urlToOpen.replace(/http:\/\/localhost:\$\{API_PORT\}/g, 'http://localhost:3001');
                                }
                              }
                              window.open(urlToOpen, '_blank');
                            }}
                          >
                            <Trophy className="h-3 w-3 mr-1" />
                            RESULTADOS
                          </Button>
                        ) : (
                          <Button 
                            size="sm" 
                            className="flex-1 text-xs" 
                            onClick={e => {
                              e.stopPropagation();
                              navigate(`/events/${event.id}`);
                            }}
                          >
                            Inscrever-se
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>)}
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
                <EditableText
                  contentKey="consultoria_title"
                  defaultValue={pageSettings.consultoria_title}
                  as="h2"
                  className="text-3xl font-bold mb-4"
                />
                <EditableText
                  contentKey="consultoria_description"
                  defaultValue={pageSettings.consultoria_description}
                  as="p"
                  className="text-muted-foreground mb-6"
                  multiline
                />
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
                  <EditableText
                    contentKey="stats_events"
                    defaultValue={pageSettings.stats_events}
                    className="text-4xl font-bold text-secondary mb-1"
                  />
                  <EditableText
                    contentKey="stats_events_label"
                    defaultValue={pageSettings.stats_events_label}
                    as="p"
                    className="text-sm font-semibold"
                  />
                  <p className="text-xs text-muted-foreground">
                    Confira aqui as corridas que já tivemos o prazer de executar
                  </p>
                </div>

                <div className="text-center">
                  <div className="flex items-center justify-center mb-2">
                    <Trophy className="h-12 w-12 text-secondary" />
                  </div>
                  <EditableText
                    contentKey="stats_runners"
                    defaultValue={pageSettings.stats_runners}
                    className="text-4xl font-bold text-secondary mb-1"
                  />
                  <EditableText
                    contentKey="stats_runners_label"
                    defaultValue={pageSettings.stats_runners_label}
                    as="p"
                    className="text-sm font-semibold"
                  />
                  <p className="text-xs text-muted-foreground">
                    Já podemos te chamar de amigo! São milhares de atletas que já estão no nosso site
                  </p>
                </div>

                <div className="text-center">
                  <div className="flex items-center justify-center mb-2">
                    <TrendingUp className="h-12 w-12 text-secondary" />
                  </div>
                  <EditableText
                    contentKey="stats_years"
                    defaultValue={pageSettings.stats_years}
                    className="text-4xl font-bold text-secondary mb-1"
                  />
                  <EditableText
                    contentKey="stats_years_label"
                    defaultValue={pageSettings.stats_years_label}
                    as="p"
                    className="text-sm font-semibold"
                  />
                  <p className="text-xs text-muted-foreground">Realizamos em média 40 corridas por ano</p>
                </div>

                <div className="text-center">
                  <div className="flex items-center justify-center mb-2">
                    <MapPin className="h-12 w-12 text-secondary" />
                  </div>
                  <EditableText
                    contentKey="stats_cities"
                    defaultValue={pageSettings.stats_cities}
                    className="text-4xl font-bold text-secondary mb-1"
                  />
                  <EditableText
                    contentKey="stats_cities_label"
                    defaultValue={pageSettings.stats_cities_label}
                    as="p"
                    className="text-sm font-semibold"
                  />
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
    </VisualEditorProvider>
  );
};
export default Index;