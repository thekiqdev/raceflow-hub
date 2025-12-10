import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Search, MoreVertical, Edit, Eye, Trash2, BarChart3, Calendar, Loader2, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { EventFormDialog } from "./EventFormDialog";
import { getEvents, deleteEvent, type Event } from "@/lib/api/events";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const OrganizerEvents = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<Event[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadEvents();
  }, []);

  useEffect(() => {
    // Escutar evento para abrir o dialog de criação
    const handleOpenCreateEvent = () => {
      console.log('🎯 Evento recebido: abrir dialog de criação');
      setSelectedEvent(null);
      setIsDialogOpen(true);
    };

    window.addEventListener('organizer:open-create-event', handleOpenCreateEvent);
    
    return () => {
      window.removeEventListener('organizer:open-create-event', handleOpenCreateEvent);
    };
  }, []);

  // Também escutar quando o componente é montado para verificar se há um evento pendente
  useEffect(() => {
    // Verificar se há um evento pendente no localStorage
    const shouldOpenDialog = sessionStorage.getItem('organizer:should-open-create-dialog');
    if (shouldOpenDialog === 'true') {
      sessionStorage.removeItem('organizer:should-open-create-dialog');
      setSelectedEvent(null);
      setIsDialogOpen(true);
    }
  }, []);

  const loadEvents = async () => {
    if (!user) {
      console.log("❌ No user, skipping loadEvents");
      return;
    }

    try {
      setLoading(true);
      console.log("🔄 Loading events for organizer:", user.id);
      
      const response = await getEvents({ organizer_id: user.id });

      console.log("📥 Full response:", response);
      console.log("📥 Response success:", response.success);
      console.log("📥 Response data:", response.data);
      console.log("📥 Response data type:", typeof response.data);
      console.log("📥 Response data is array:", Array.isArray(response.data));
      console.log("📥 Response data length:", response.data?.length);

      if (response.success && response.data) {
        const eventsArray = Array.isArray(response.data) ? response.data : [];
        console.log("✅ Events loaded:", eventsArray.length, "events");
        console.log("✅ Events data:", eventsArray);
        setEvents(eventsArray);
      } else {
        console.error("❌ Error loading events:", response);
        toast.error(response.error || "Erro ao carregar eventos");
        setEvents([]);
      }
    } catch (error) {
      console.error("❌ Exception loading events:", error);
      toast.error("Erro ao carregar eventos");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "published":
        return <Badge variant="default">Publicado</Badge>;
      case "draft":
        return <Badge variant="secondary">Rascunho</Badge>;
      case "finished":
        return <Badge variant="outline">Finalizado</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const filteredEvents = events.filter(event =>
    event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    event.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
    event.state.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm("Tem certeza que deseja excluir este evento? Esta ação não pode ser desfeita.")) {
      return;
    }

    try {
      setIsDeleting(eventId);
      const response = await deleteEvent(eventId);

      if (!response.success) {
        throw new Error(response.error || "Erro ao excluir evento");
      }

      toast.success("Evento excluído com sucesso!");
      loadEvents();
    } catch (error: any) {
      console.error("Error deleting event:", error);
      toast.error(error.message || "Erro ao excluir evento");
    } finally {
      setIsDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">Gestão de Eventos</h2>
        <p className="text-muted-foreground">Crie e gerencie suas corridas</p>
      </div>

      {/* Actions Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou cidade..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button onClick={() => {
              setSelectedEvent(null);
              setIsDialogOpen(true);
            }}>
              <Plus className="mr-2 h-4 w-4" />
              Criar Novo Evento
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Events Table */}
      <Card>
        <CardHeader>
          <CardTitle>Meus Eventos</CardTitle>
          <CardDescription>
            {loading ? "Carregando..." : `${filteredEvents.length} ${filteredEvents.length === 1 ? "evento encontrado" : "eventos encontrados"}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {searchQuery ? "Nenhum evento encontrado com essa busca" : "Você ainda não criou nenhum evento"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome do Evento</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Localização</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Inscrições</TableHead>
                    <TableHead className="text-right">Faturamento</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="font-medium">{event.title}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {format(new Date(event.event_date), "dd 'de' MMM, yyyy", { locale: ptBR })}
                        </div>
                      </TableCell>
                      <TableCell>
                        {event.city}, {event.state}
                      </TableCell>
                      <TableCell>{getStatusBadge(event.status || "draft")}</TableCell>
                      <TableCell className="text-right">
                        <span className="font-medium">{event.confirmed_registrations || event.registration_count || 0}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-semibold text-secondary">
                          R$ {(event.revenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" disabled={isDeleting === event.id}>
                              {isDeleting === event.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MoreVertical className="h-4 w-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/events/${event.id}`)}>
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Visualizar Evento
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                              setSelectedEvent(event);
                              setIsDialogOpen(true);
                            }}>
                              <Edit className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <BarChart3 className="mr-2 h-4 w-4" />
                              Estatísticas
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={() => handleDeleteEvent(event.id)}
                              disabled={isDeleting === event.id}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Statistics Summary */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Eventos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{events.length}</div>
            <p className="text-xs text-muted-foreground">
              {events.filter(e => e.status === "published").length} publicados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Inscrições</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {events.reduce((sum, e) => sum + (e.confirmed_registrations || e.registration_count || 0), 0)}
            </div>
            <p className="text-xs text-muted-foreground">Todos os eventos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receita Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-secondary">
              R$ {events.reduce((sum, e) => sum + (e.revenue || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">Acumulado</p>
          </CardContent>
        </Card>
      </div>

      <EventFormDialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setSelectedEvent(null);
          }
        }}
        event={selectedEvent}
        onSuccess={async () => {
          setSelectedEvent(null);
          // Small delay to ensure backend has processed the event
          await new Promise(resolve => setTimeout(resolve, 300));
          // Refresh events list
          await loadEvents();
        }}
      />
    </div>
  );
};

export default OrganizerEvents;
