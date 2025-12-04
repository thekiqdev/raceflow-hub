import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Calendar, ChevronRight, Trophy, Loader2, AlertCircle, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, isPast, isFuture } from "date-fns";
import { ptBR } from "date-fns/locale";
import heroImage from "@/assets/hero-running.jpg";
import { EventFilters, EventFiltersState } from "@/components/event/EventFilters";
import { getEvents, type Event } from "@/lib/api/events";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/useDebounce";
import { Input } from "@/components/ui/input";

export function ExploreEvents() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 500);
  const [filters, setFilters] = useState<EventFiltersState>({
    city: "",
    month: "",
    category: "",
    search: "",
  });

  useEffect(() => {
    loadEvents();
  }, [debouncedSearchQuery]);

  const loadEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await getEvents({ 
        status: 'published',
        search: debouncedSearchQuery || undefined,
      });
      
      if (response.success && response.data) {
        setEvents(response.data);
      } else {
        setError(response.error || "Erro ao carregar eventos");
        toast.error(response.error || "Erro ao carregar eventos");
      }
    } catch (error: any) {
      console.error("Error loading events:", error);
      const errorMessage = error.message || "Erro ao carregar eventos. Tente novamente mais tarde.";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const cities = Array.from(new Set(events.map(e => e.city))).sort();
  const categories = ["5K", "10K", "Meia Maratona", "Maratona", "Trail Run"];

  // Calculate statistics
  const upcomingEvents = events.filter(e => isFuture(new Date(e.event_date)));
  const pastEvents = events.filter(e => isPast(new Date(e.event_date)));
  const eventsWithResults = events.filter(e => e.result_url);

  const filteredEvents = events.filter((event) => {
    const matchesCity = !filters.city || filters.city === "all" || event.city === filters.city;
    
    const eventMonth = event.event_date ? format(new Date(event.event_date), "MM") : "";
    const matchesMonth = !filters.month || filters.month === "all" || eventMonth === filters.month;
    
    const matchesCategory = !filters.category || filters.category === "all";
    
    // Also filter by search query if provided
    const matchesSearch = !debouncedSearchQuery || 
      event.title.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
      event.city.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
      event.state.toLowerCase().includes(debouncedSearchQuery.toLowerCase());
    
    return matchesCity && matchesMonth && matchesCategory && matchesSearch;
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

  if (loading) {
    return (
      <div className="pb-20">
        <div className="bg-gradient-hero p-6 pb-8">
          <h1 className="text-2xl font-bold text-white mb-4">Explorar Corridas</h1>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pb-20">
        <div className="bg-gradient-hero p-6 pb-8">
          <h1 className="text-2xl font-bold text-white mb-4">Explorar Corridas</h1>
        </div>
        <div className="px-4 mt-6">
          <Card>
            <CardContent className="py-12 text-center">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
              <h3 className="text-lg font-semibold mb-2">Erro ao carregar eventos</h3>
              <p className="text-muted-foreground mb-4">{error}</p>
              <Button onClick={loadEvents}>
                Tentar Novamente
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="bg-gradient-hero p-6 pb-8">
        <h1 className="text-2xl font-bold text-white mb-4">Explorar Corridas</h1>
        
        {/* Statistics Cards */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <Card className="bg-white/10 backdrop-blur-sm border-white/20">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-white">{upcomingEvents.length}</div>
              <div className="text-xs text-white/80">Próximas</div>
            </CardContent>
          </Card>
          <Card className="bg-white/10 backdrop-blur-sm border-white/20">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-white">{events.length}</div>
              <div className="text-xs text-white/80">Total</div>
            </CardContent>
          </Card>
          <Card className="bg-white/10 backdrop-blur-sm border-white/20">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-white">{eventsWithResults.length}</div>
              <div className="text-xs text-white/80">Com Resultado</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Search Bar */}
      <div className="px-4 -mt-4 mb-4">
        <Card className="shadow-lg">
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, cidade ou estado..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="px-4 mb-4">
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
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            {filteredEvents.length === 0 
              ? "Nenhuma corrida encontrada" 
              : `${filteredEvents.length} ${filteredEvents.length === 1 ? 'corrida encontrada' : 'corridas encontradas'}`}
          </h2>
        </div>
        
        {filteredEvents.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground mb-2">
                {searchQuery || filters.city !== "" || filters.month !== ""
                  ? "Nenhuma corrida encontrada com os filtros aplicados"
                  : "Nenhuma corrida disponível no momento"}
              </p>
              {(searchQuery || filters.city !== "" || filters.month !== "") && (
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setSearchQuery("");
                    setFilters({ city: "", month: "", category: "", search: "" });
                  }}
                  className="mt-4"
                >
                  Limpar Filtros
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          filteredEvents.map((event) => (
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
          ))
        )}
      </div>
    </div>
  );
}
