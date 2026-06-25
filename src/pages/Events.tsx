import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, MapPin, Calendar as CalendarIcon, CheckCircle2, Clock, Filter, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatDateOnlyBrasilia } from "@/lib/utils";
import { EventFilters, EventFiltersState } from "@/components/event/EventFilters";
import { Header } from "@/components/Header";
import { getEvents } from "@/lib/api/events";
import { getEffectiveRegistrationStatus, getRegistrationStatusLabel, getRegistrationStatusVariant } from "@/lib/utils/eventRegistration";
import { openEventFromCard } from "@/lib/utils/resolveEventDestination";

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
  status?: 'draft' | 'published' | 'ongoing' | 'finished' | 'cancelled';
  registration_status?: 'not_open' | 'open' | 'closed' | null;
  registration_start_date?: string | null;
  registration_end_date?: string | null;
  registration_auto_mode?: boolean;
  event_type?: string;
  external_url?: string | null;
  result_url?: string | null;
}

const Events = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<Event[]>([]);
  const [registrationFilter, setRegistrationFilter] = useState<'all' | 'open' | 'not_open'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<EventFiltersState>({
    city: "",
    month: "",
    category: "",
    search: "",
    order_by_date: 'asc',
  });

  // Recarregar eventos quando filtro de ordenação mudar
  useEffect(() => {
    loadEvents();
  }, [filters.order_by_date]);

  const loadEvents = async () => {
    try {
      setLoading(true);
      
      // Buscar eventos publicados, ongoing e finished (para incluir eventos encerrados)
      // Ordenar por data conforme filtro selecionado
      const orderBy = filters.order_by_date || 'asc';
      const publishedResponse = await getEvents({ status: 'published', order_by_date: orderBy });
      const ongoingResponse = await getEvents({ status: 'ongoing', order_by_date: orderBy });
      const finishedResponse = await getEvents({ status: 'finished', order_by_date: orderBy });
      
      const allEvents: Event[] = [];
      
      // Adicionar eventos publicados
      if (publishedResponse.success && publishedResponse.data) {
        allEvents.push(...publishedResponse.data);
      }
      
      // Adicionar eventos ongoing
      if (ongoingResponse.success && ongoingResponse.data) {
        allEvents.push(...ongoingResponse.data);
      }
      
      // Adicionar eventos finished (para mostrar eventos com inscrições encerradas)
      if (finishedResponse.success && finishedResponse.data) {
        allEvents.push(...finishedResponse.data);
      }
      
      // Remover duplicatas (já ordenados pelo backend)
      const uniqueEvents = Array.from(
        new Map(allEvents.map(event => [event.id, event])).values()
      );
      
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
    
    // Filtro de status de inscrição
    let matchesRegistrationStatus = true;
    if (registrationFilter !== 'all') {
      const effectiveStatus = getEffectiveRegistrationStatus(event);
      matchesRegistrationStatus = effectiveStatus === registrationFilter;
    }
    
    return matchesSearch && matchesCity && matchesMonth && matchesCategory && matchesRegistrationStatus;
  });

  // Ordenar eventos: primeiro inscrições abertas, depois em breve, depois encerradas
  const sortedEvents = filteredEvents.sort((a, b) => {
    const statusA = getEffectiveRegistrationStatus(a);
    const statusB = getEffectiveRegistrationStatus(b);
    
    // Definir ordem de prioridade: 'open' > 'not_open' > 'closed' > null
    const getStatusPriority = (status: 'open' | 'not_open' | 'closed' | null): number => {
      if (status === 'open') return 1;
      if (status === 'not_open') return 2;
      if (status === 'closed') return 3;
      return 4; // null ou outros
    };
    
    const priorityA = getStatusPriority(statusA);
    const priorityB = getStatusPriority(statusB);
    
    // Se prioridades diferentes, ordenar por prioridade
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    
    // Se mesma prioridade, ordenar por data do evento (mais próximo primeiro)
    const dateA = new Date(a.event_date).getTime();
    const dateB = new Date(b.event_date).getTime();
    return dateA - dateB;
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

        <div className="mb-8 w-full">
          {/* Desktop: Filtros e botões rápidos na mesma linha */}
          <div className="hidden md:flex items-center gap-3 w-full">
            <div className="flex-1 min-w-0">
              <EventFilters
                filters={filters}
                onFiltersChange={setFilters}
                cities={cities}
                categories={categories}
              />
            </div>
            <div className="flex gap-2 shrink-0 items-center">
              <Button
                variant={registrationFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRegistrationFilter('all')}
                className="gap-2 whitespace-nowrap"
              >
                Todos os Eventos
              </Button>
              <Button
                variant={registrationFilter === 'open' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRegistrationFilter('open')}
                className="gap-2 whitespace-nowrap"
              >
                <CheckCircle2 className="h-4 w-4" />
                Inscrições Abertas
              </Button>
              <Button
                variant={registrationFilter === 'not_open' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRegistrationFilter('not_open')}
                className="gap-2 whitespace-nowrap"
              >
                <Clock className="h-4 w-4" />
                Em Breve
              </Button>
            </div>
          </div>

          {/* Mobile: Botão + Filtros e botões rápidos fixos */}
          <div className="md:hidden space-y-3">
            {/* Botão para abrir/fechar filtros */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="w-full gap-2"
            >
              {showFilters ? (
                <>
                  <X className="h-4 w-4" />
                  Fechar Filtros
                </>
              ) : (
                <>
                  <Filter className="h-4 w-4" />
                  + Filtros
                </>
              )}
            </Button>

            {/* Filtros (colapsáveis) */}
            {showFilters && (
              <div className="space-y-4">
                <EventFilters
                  filters={filters}
                  onFiltersChange={setFilters}
                  cities={cities}
                  categories={categories}
                />
              </div>
            )}

            {/* Botões de filtro rápido (sempre visíveis no mobile) */}
            <div className="flex gap-2">
              <Button
                variant={registrationFilter === 'open' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRegistrationFilter('open')}
                className="gap-2 flex-1"
              >
                <CheckCircle2 className="h-4 w-4" />
                Inscrições Abertas
              </Button>
              <Button
                variant={registrationFilter === 'not_open' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRegistrationFilter('not_open')}
                className="gap-2 flex-1"
              >
                <Clock className="h-4 w-4" />
                Em Breve
              </Button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : sortedEvents.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {filters.search ? "Nenhum evento encontrado" : "Nenhum evento disponível no momento"}
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {sortedEvents.map((event) => {
              const EventCard = () => {
                const [imageError, setImageError] = useState(false);
                
                return (
                  <Card key={event.id} className="hover:shadow-lg transition-shadow overflow-hidden">
                    <div className="h-48 bg-muted overflow-hidden flex items-center justify-center">
                      {event.banner_url && !imageError ? (
                        <img
                          src={event.banner_url}
                          alt={event.title}
                          className="w-full h-full object-cover"
                          onError={() => {
                            console.error('Erro ao carregar imagem do banner:', event.banner_url);
                            setImageError(true);
                          }}
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                          <div className="text-center p-4">
                            <CalendarIcon className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                            <p className="text-sm text-muted-foreground font-medium line-clamp-2">{event.title}</p>
                          </div>
                        </div>
                      )}
                    </div>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <CardTitle className="line-clamp-1">{event.title}</CardTitle>
                      <CardDescription className="line-clamp-2">
                        {event.description || "Corrida de rua"}
                      </CardDescription>
                    </div>
                    {(() => {
                      const effectiveStatus = getEffectiveRegistrationStatus(event);
                      const label = getRegistrationStatusLabel(event);
                      
                      // Mostrar badge se:
                      // 1. Tem status efetivo (open, not_open, closed), OU
                      // 2. É evento publicado/ongoing (lógica de fallback para eventos sem registration_status)
                      const shouldShowBadge = effectiveStatus !== null || 
                        (event.status === 'published' || event.status === 'ongoing');
                      
                      if (shouldShowBadge && label && label !== 'Inscrições Indisponíveis') {
                        return (
                          <Badge variant={getRegistrationStatusVariant(event)} className="text-xs shrink-0">
                            {label}
                          </Badge>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center text-sm text-muted-foreground">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formatDateOnlyBrasilia(event.event_date)}
                  </div>
                  <div className="flex items-center text-sm text-muted-foreground">
                    <MapPin className="mr-2 h-4 w-4" />
                    {event.city}, {event.state}
                  </div>
                </CardContent>
                    <CardFooter>
                      <Button 
                        className="w-full"
                        onClick={() => openEventFromCard(event, navigate)}
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