import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, MapPin, Calendar as CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { EventFilters, EventFiltersState } from "@/components/event/EventFilters";
import { Header } from "@/components/Header";
import { getEvents } from "@/lib/api/events";

interface Event {
  id: string;
  title: string;
  description?: string;
  event_date: string;
  location: string;
  city: string;
  state: string;
  banner_url: string | null;
  status?: string;
}

const Events = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<Event[]>([]);
  const [filters, setFilters] = useState<EventFiltersState>({
    city: "",
    month: "",
    category: "",
    search: "",
  });

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    try {
      setLoading(true);
      
      // Buscar eventos publicados e ongoing (eventos com inscrição aberta)
      const publishedResponse = await getEvents({ status: 'published' });
      const ongoingResponse = await getEvents({ status: 'ongoing' });
      
      const allEvents: Event[] = [];
      
      // Adicionar eventos publicados
      if (publishedResponse.success && publishedResponse.data) {
        allEvents.push(...publishedResponse.data);
      }
      
      // Adicionar eventos ongoing
      if (ongoingResponse.success && ongoingResponse.data) {
        allEvents.push(...ongoingResponse.data);
      }
      
      // Remover duplicatas e ordenar por data (mais próximo primeiro)
      const uniqueEvents = Array.from(
        new Map(allEvents.map(event => [event.id, event])).values()
      ).sort((a, b) => {
        const dateA = new Date(a.event_date).getTime();
        const dateB = new Date(b.event_date).getTime();
        return dateA - dateB;
      });
      
      setEvents(uniqueEvents);
    } catch (error) {
      console.error("Erro ao carregar eventos:", error);
      toast.error("Erro ao carregar eventos");
    } finally {
      setLoading(false);
    }
  };

  const cities = Array.from(new Set(events.map(e => e.city))).sort();
  const categories = ["5K", "10K", "Meia Maratona", "Maratona", "Trail Run"];

  const filteredEvents = events.filter(event => {
    const matchesSearch = 
      event.title.toLowerCase().includes(filters.search.toLowerCase()) ||
      event.city.toLowerCase().includes(filters.search.toLowerCase()) ||
      event.state.toLowerCase().includes(filters.search.toLowerCase());
    
    const matchesCity = !filters.city || filters.city === "all" || event.city === filters.city;
    
    const eventMonth = event.event_date ? format(new Date(event.event_date), "MM") : "";
    const matchesMonth = !filters.month || filters.month === "all" || eventMonth === filters.month;
    
    const matchesCategory = !filters.category || filters.category === "all";
    
    return matchesSearch && matchesCity && matchesMonth && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background">
      <Header />

      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold mb-2 bg-gradient-hero bg-clip-text text-transparent">
          Eventos Disponíveis
        </h1>
        <p className="text-muted-foreground mb-8">
          Encontre sua próxima corrida e faça sua inscrição
        </p>

        <div className="mb-8 max-w-4xl">
          <EventFilters
            filters={filters}
            onFiltersChange={setFilters}
            cities={cities}
            categories={categories}
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {filters.search ? "Nenhum evento encontrado" : "Nenhum evento disponível no momento"}
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredEvents.map((event) => {
              const EventCard = () => {
                const [imageError, setImageError] = useState(false);
                
                // Função para construir URL completa da imagem
                const getImageUrl = (url: string | null | undefined): string | null => {
                  if (!url) return null;
                  
                  // Se já é uma URL completa (http:// ou https://), retornar como está
                  if (url.startsWith('http://') || url.startsWith('https://')) {
                    return url;
                  }
                  
                  // Se começa com /, assumir que é relativo ao backend
                  if (url.startsWith('/')) {
                    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
                    const baseUrl = apiUrl.replace('/api', '');
                    return `${baseUrl}${url}`;
                  }
                  
                  // Caso contrário, retornar como está (pode ser um caminho relativo ou URL completa)
                  return url;
                };
                
                const imageUrl = getImageUrl(event.banner_url);
                
                return (
                  <Card key={event.id} className="hover:shadow-lg transition-shadow overflow-hidden">
                    <div className="h-48 bg-muted overflow-hidden flex items-center justify-center">
                      {imageUrl && !imageError ? (
                        <img
                          src={imageUrl}
                          alt={event.title}
                          className="w-full h-full object-cover"
                          onError={() => {
                            console.error('Erro ao carregar imagem do banner:', imageUrl);
                            setImageError(true);
                          }}
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                          <div className="text-center p-4">
                            <CalendarIcon className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                            <p className="text-sm text-muted-foreground font-medium">{event.title}</p>
                          </div>
                        </div>
                      )}
                    </div>
                <CardHeader>
                  <CardTitle className="line-clamp-1">{event.title}</CardTitle>
                  <CardDescription className="line-clamp-2">
                    {event.description || "Corrida de rua"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center text-sm text-muted-foreground">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(new Date(event.event_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  </div>
                  <div className="flex items-center text-sm text-muted-foreground">
                    <MapPin className="mr-2 h-4 w-4" />
                    {event.city}, {event.state}
                  </div>
                </CardContent>
                    <CardFooter>
                      <Button 
                        className="w-full"
                        onClick={() => navigate(`/events/${event.id}`)}
                      >
                        Ver Detalhes
                      </Button>
                    </CardFooter>
                  </Card>
                );
              };
              
              return <EventCard key={event.id} />;
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Events;