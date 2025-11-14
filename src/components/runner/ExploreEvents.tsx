import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Calendar, DollarSign, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import heroImage from "@/assets/hero-running.jpg";
import { EventFilters, EventFiltersState } from "@/components/event/EventFilters";

interface Event {
  id: string;
  title: string;
  event_date: string;
  city: string;
  state: string;
  banner_url: string | null;
  price_from: number;
}

export function ExploreEvents() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const [filters, setFilters] = useState<EventFiltersState>({
    city: "",
    month: "",
    category: "",
    search: "",
  });

  useEffect(() => {
    // Mock events data
    const mockEvents: Event[] = [
      {
        id: "1",
        title: "Corrida de São Silvestre 2024",
        event_date: "2024-12-31T07:00:00Z",
        city: "São Paulo",
        state: "SP",
        banner_url: null,
        price_from: 59.90,
      },
      {
        id: "2",
        title: "Maratona do Rio 2025",
        event_date: "2025-06-15T06:00:00Z",
        city: "Rio de Janeiro",
        state: "RJ",
        banner_url: null,
        price_from: 120.00,
      },
      {
        id: "3",
        title: "Meia Maratona de Florianópolis",
        event_date: "2025-09-20T07:30:00Z",
        city: "Florianópolis",
        state: "SC",
        banner_url: null,
        price_from: 80.00,
      },
      {
        id: "4",
        title: "Circuito das Estações - Primavera",
        event_date: "2025-10-15T06:30:00Z",
        city: "Curitiba",
        state: "PR",
        banner_url: null,
        price_from: 45.00,
      },
    ];
    setEvents(mockEvents);
  }, []);

  const cities = Array.from(new Set(events.map(e => e.city))).sort();
  const categories = ["5K", "10K", "Meia Maratona", "Maratona", "Trail Run"];

  const filteredEvents = events.filter((event) => {
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
    <div className="pb-20">
      {/* Header with Filters */}
      <div className="bg-gradient-hero p-6 pb-8">
        <h1 className="text-2xl font-bold text-white mb-4">Explorar Corridas</h1>
      </div>

      {/* Filters */}
      <div className="px-4 -mt-4 mb-4">
        <Card className="shadow-lg">
          <CardContent className="p-4">
            <EventFilters
              filters={filters}
              onFiltersChange={setFilters}
              cities={cities}
              categories={categories}
            />
          </CardContent>
        </Card>
      </div>

      {/* Events List */}
      <div className="px-4 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Próximas Corridas</h2>
        
        {filteredEvents.map((event) => (
          <Card
            key={event.id}
            className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => navigate(`/events/${event.id}`)}
          >
            <div className="flex">
              <div className="w-28 h-28 flex-shrink-0 bg-gradient-hero relative">
                {event.banner_url ? (
                  <img src={event.banner_url} alt={event.title} className="w-full h-full object-cover" />
                ) : (
                  <img src={heroImage} alt={event.title} className="w-full h-full object-cover opacity-50" />
                )}
              </div>
              
              <div className="flex-1 p-4 flex flex-col justify-between">
                <div>
                  <h3 className="font-semibold text-sm mb-2 line-clamp-2">{event.title}</h3>
                  
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>{format(new Date(event.event_date), "dd 'de' MMM, yyyy", { locale: ptBR })}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      <span>{event.city} - {event.state}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-1 text-primary font-semibold text-sm">
                    <DollarSign className="h-3 w-3" />
                    <span>A partir de R$ {event.price_from.toFixed(2)}</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
