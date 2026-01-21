import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Header } from "@/components/Header";
import { Trophy, MapPin, Calendar, Search, ExternalLink, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getEvents } from "@/lib/api/events";
import { toast } from "sonner";

interface Event {
  id: string;
  slug?: string;
  title: string;
  description?: string;
  event_date: string;
  location: string;
  city: string;
  state: string;
  banner_url: string | null;
  result_url: string | null;
  status: string;
}

interface EventCardProps {
  event: Event;
  onViewResults: (event: Event) => void;
  onCardClick: () => void;
}

function EventCard({ event, onViewResults, onCardClick }: EventCardProps) {
  const [imageError, setImageError] = useState(false);
  const eventDate = new Date(event.event_date);

  return (
    <Card 
      className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
      onClick={onCardClick}
    >
      {event.banner_url && !imageError && (
        <div className="relative h-48 w-full overflow-hidden">
          <img
            src={event.banner_url}
            alt={event.title}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        </div>
      )}
      <CardHeader>
        <CardTitle className="line-clamp-2">{event.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span>
              {format(eventDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            <span>
              {event.location}, {event.city} - {event.state}
            </span>
          </div>
        </div>
        
        <Button
          className="w-full"
          onClick={(e) => {
            e.stopPropagation();
            onViewResults(event);
          }}
        >
          <Trophy className="mr-2 h-4 w-4" />
          Ver Resultados
          <ExternalLink className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

export default function Results() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<Event[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    try {
      setLoading(true);
      
      // Buscar eventos finalizados com resultados disponíveis
      const finishedResponse = await getEvents({ status: 'finished' });
      
      // Buscar eventos publicados que já aconteceram e têm resultados
      const publishedResponse = await getEvents({ status: 'published' });
      
      const allEvents: Event[] = [];
      
      // Adicionar eventos finalizados com result_url
      if (finishedResponse.success && finishedResponse.data) {
        const eventsWithResults = finishedResponse.data.filter(event => 
          event.result_url && event.result_url.trim() !== ''
        );
        allEvents.push(...eventsWithResults);
      }
      
      // Adicionar eventos publicados que já aconteceram e têm resultados
      if (publishedResponse.success && publishedResponse.data) {
        const now = new Date();
        const pastEventsWithResults = publishedResponse.data.filter(event => {
          const eventDate = new Date(event.event_date);
          return eventDate < now && event.result_url && event.result_url.trim() !== '';
        });
        allEvents.push(...pastEventsWithResults);
      }
      
      // Remover duplicatas e ordenar por data (mais recente primeiro)
      const uniqueEvents = Array.from(
        new Map(allEvents.map(event => [event.id, event])).values()
      ).sort((a, b) => {
        const dateA = new Date(a.event_date).getTime();
        const dateB = new Date(b.event_date).getTime();
        return dateB - dateA;
      });
      
      setEvents(uniqueEvents);
    } catch (error) {
      console.error("Erro ao carregar eventos:", error);
      toast.error("Erro ao carregar resultados");
    } finally {
      setLoading(false);
    }
  };

  const filteredEvents = events.filter(event => {
    const searchLower = searchTerm.toLowerCase();
    return (
      event.title.toLowerCase().includes(searchLower) ||
      event.city.toLowerCase().includes(searchLower) ||
      event.state.toLowerCase().includes(searchLower) ||
      event.location.toLowerCase().includes(searchLower)
    );
  });

  const handleOpenResults = (event: Event) => {
    if (event.result_url) {
      // Corrigir URL se contiver template strings
      let urlToOpen = event.result_url;
      if (urlToOpen.includes('${')) {
        const port = window.location.port || '3001';
        urlToOpen = urlToOpen.replace(/\$\{API_PORT\}/g, port);
        // Se ainda tiver template strings, usar localhost:3001 como padrão
        if (urlToOpen.includes('${')) {
          urlToOpen = urlToOpen.replace(/http:\/\/localhost:\$\{API_PORT\}/g, 'http://localhost:3001');
        }
      }
      window.open(urlToOpen, '_blank');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background">
      <Header />
      
      <main className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4 flex items-center justify-center gap-3">
            <Trophy className="h-10 w-10 text-primary" />
            Resultados dos Eventos
          </h1>
          <p className="text-muted-foreground text-lg">
            Confira os resultados dos eventos que já foram realizados
          </p>
        </div>

        {/* Search Bar */}
        <div className="mb-8 max-w-2xl mx-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5" />
            <Input
              type="text"
              placeholder="Buscar por evento, cidade ou local..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-20">
            <Trophy className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-2xl font-semibold mb-2">
              {searchTerm ? "Nenhum resultado encontrado" : "Nenhum resultado disponível"}
            </h2>
            <p className="text-muted-foreground">
              {searchTerm 
                ? "Tente buscar com outros termos" 
                : "Os resultados dos eventos aparecerão aqui assim que forem publicados"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onViewResults={handleOpenResults}
                onCardClick={() => navigate(event.slug ? `/evento/${event.slug}` : `/events/${event.id}`)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

