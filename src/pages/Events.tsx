import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, MapPin, Calendar as CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { EventFilters, EventFiltersState } from "@/components/event/EventFilters";
import { Header } from "@/components/Header";

interface Event {
  id: string;
  title: string;
  description: string;
  event_date: string;
  location: string;
  city: string;
  state: string;
  banner_url: string | null;
}

const Events = () => {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<Event[]>([]);
  const [filters, setFilters] = useState<EventFiltersState>({
    city: "",
    month: "",
    category: "",
    search: "",
  });

  useEffect(() => {
    // Mock events data for testing
    const mockEvents: Event[] = [
      {
        id: "1",
        title: "Corrida de São Silvestre 2024",
        description: "A tradicional corrida de São Silvestre que marca o fim do ano na capital paulista. 15km de pura emoção.",
        event_date: "2024-12-31T07:00:00Z",
        location: "Av. Paulista",
        city: "São Paulo",
        state: "SP",
        banner_url: null,
      },
      {
        id: "2",
        title: "Maratona do Rio 2025",
        description: "Meia maratona pelos principais pontos turísticos do Rio de Janeiro. Vista deslumbrante da cidade maravilhosa.",
        event_date: "2025-06-15T06:00:00Z",
        location: "Zona Sul",
        city: "Rio de Janeiro",
        state: "RJ",
        banner_url: null,
      },
      {
        id: "3",
        title: "Meia Maratona de Florianópolis",
        description: "Corrida à beira-mar na ilha de Florianópolis. Paisagens incríveis e clima perfeito para correr.",
        event_date: "2025-09-20T07:30:00Z",
        location: "Beira-mar Norte",
        city: "Florianópolis",
        state: "SC",
        banner_url: null,
      },
      {
        id: "4",
        title: "Circuito das Estações - Curitiba",
        description: "Corrida de 10km pelos parques mais bonitos de Curitiba. Evento para toda a família.",
        event_date: "2025-03-15T06:30:00Z",
        location: "Parque Barigui",
        city: "Curitiba",
        state: "PR",
        banner_url: null,
      },
      {
        id: "5",
        title: "Corrida do Bem - Belo Horizonte",
        description: "Corrida beneficente de 5km. Toda a arrecadação será destinada a instituições de caridade.",
        event_date: "2025-05-10T07:00:00Z",
        location: "Lagoa da Pampulha",
        city: "Belo Horizonte",
        state: "MG",
        banner_url: null,
      },
    ];
    setEvents(mockEvents);
    setLoading(false);
  }, []);

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
            {filteredEvents.map((event) => (
              <Card key={event.id} className="hover:shadow-lg transition-shadow overflow-hidden">
                {event.banner_url && (
                  <div className="h-48 bg-muted overflow-hidden">
                    <img
                      src={event.banner_url}
                      alt={event.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
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
                  <Button className="w-full">Ver Detalhes</Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Events;