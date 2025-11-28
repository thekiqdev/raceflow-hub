import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Calendar, DollarSign, ChevronRight, Trophy } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import heroImage from "@/assets/hero-running.jpg";
import { EventFilters, EventFiltersState } from "@/components/event/EventFilters";
import { supabase } from "@/integrations/supabase/client";

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
    loadEvents();
  }, []);

  const loadEvents = async () => {
    try {
      const { data, error } = await supabase
        .from("events")
        .select("id, title, event_date, city, state, banner_url, result_url, status")
        .eq("status", "published")
        .order("event_date", { ascending: true });

      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      console.error("Error loading events:", error);
    }
  };

  const cities = Array.from(new Set(events.map(e => e.city))).sort();
  const categories = ["5K", "10K", "Meia Maratona", "Maratona", "Trail Run"];

  const filteredEvents = events.filter((event) => {
    const matchesCity = !filters.city || filters.city === "all" || event.city === filters.city;
    
    const eventMonth = event.event_date ? format(new Date(event.event_date), "MM") : "";
    const matchesMonth = !filters.month || filters.month === "all" || eventMonth === filters.month;
    
    const matchesCategory = !filters.category || filters.category === "all";
    
    return matchesCity && matchesMonth && matchesCategory;
  });

  const getEventStatus = (event: Event) => {
    if (event.result_url) {
      return { label: "Resultado Disponível", variant: "default" as const, icon: Trophy };
    }
    if (isPast(new Date(event.event_date))) {
      return { label: "Inscrições Finalizadas", variant: "secondary" as const };
    }
    return { label: "Inscrições Abertas", variant: "default" as const };
  };

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
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-semibold text-sm line-clamp-2 flex-1">{event.title}</h3>
                    {(() => {
                      const status = getEventStatus(event);
                      const StatusIcon = status.icon;
                      return (
                        <Badge variant={status.variant} className="flex items-center gap-1 text-xs whitespace-nowrap">
                          {StatusIcon && <StatusIcon className="h-3 w-3" />}
                          {status.label}
                        </Badge>
                      );
                    })()}
                  </div>
                  
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
                
                <div className="flex items-center justify-end mt-2">
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
