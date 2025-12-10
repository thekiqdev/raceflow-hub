import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Download, Edit, Eye, CheckCircle, XCircle, Ban, ExternalLink, BarChart, Loader2, Award, Filter } from "lucide-react";
import { getEvents, updateEvent } from "@/lib/api/events";
import { useToast } from "@/hooks/use-toast";
import { EventViewEditDialog } from "./EventViewEditDialog";
import { useNavigate } from "react-router-dom";

const EventManagement = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<"view" | "edit">("view");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isResultDialogOpen, setIsResultDialogOpen] = useState(false);
  const [resultUrl, setResultUrl] = useState("");
  const [eventForResult, setEventForResult] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const filters: any = {};
      if (searchTerm) {
        filters.search = searchTerm;
      }
      if (statusFilter) {
        filters.status = statusFilter;
      }

      const response = await getEvents(filters);

      if (response.success && response.data) {
        const eventsWithStats = response.data.map((event: any) => {
          const registrationCount = event.registration_count || 0;
          const revenue = event.revenue || 0;
          const avgTicket = event.avg_ticket || 0;

          return {
            id: event.id,
            title: event.title,
            organizer: event.organizer_name || "Desconhecido",
            date: event.event_date,
            city: event.city,
            state: event.state,
            status: event.status,
            registrations: registrationCount,
            revenue,
            avgTicket,
          };
        });

        setEvents(eventsWithStats);
      }
    } catch (error: any) {
      toast({
        title: "Erro ao carregar eventos",
        description: error.message || "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Reload events when search term or status filter changes (with debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      loadEvents();
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm, statusFilter]);

  const handleApprove = async (eventId: string) => {
    try {
      const response = await updateEvent(eventId, { status: "published" });

      if (response.success) {
        toast({
          title: "Evento aprovado",
          description: "O evento foi publicado com sucesso.",
        });
        loadEvents();
      } else {
        throw new Error(response.error || "Erro ao aprovar evento");
      }
    } catch (error: any) {
      toast({
        title: "Erro ao aprovar evento",
        description: error.message || "Erro desconhecido",
        variant: "destructive",
      });
    }
  };

  const handleReject = async (eventId: string) => {
    try {
      const response = await updateEvent(eventId, { status: "cancelled" });

      if (response.success) {
        toast({
          title: "Evento reprovado",
          description: "O evento foi cancelado.",
        });
        loadEvents();
      } else {
        throw new Error(response.error || "Erro ao reprovar evento");
      }
    } catch (error: any) {
      toast({
        title: "Erro ao reprovar evento",
        description: error.message || "Erro desconhecido",
        variant: "destructive",
      });
    }
  };

  const handleViewEvent = (eventId: string) => {
    setSelectedEventId(eventId);
    setDialogMode("view");
    setDialogOpen(true);
  };

  const handleEditEvent = (eventId: string) => {
    setSelectedEventId(eventId);
    setDialogMode("edit");
    setDialogOpen(true);
  };

  const handleSendResult = async () => {
    if (!resultUrl.trim() || !eventForResult) {
      toast({
        title: "Erro",
        description: "Por favor, insira o link dos resultados",
        variant: "destructive",
      });
      return;
    }

    try {
      // Atualizar evento com result_url e status finished
      const response = await updateEvent(eventForResult.id, { 
        result_url: resultUrl,
        status: "finished"
      });

      if (response.success) {
        toast({
          title: "Sucesso",
          description: "Link de resultados enviado com sucesso! O evento foi marcado como finalizado.",
        });
        setIsResultDialogOpen(false);
        setResultUrl("");
        setEventForResult(null);
        loadEvents();
      } else {
        throw new Error(response.error || "Erro ao atualizar evento");
      }
    } catch (error: any) {
      toast({
        title: "Erro ao enviar link de resultados",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "published":
        return "default";
      case "draft":
        return "secondary";
      case "finished":
        return "outline";
      case "cancelled":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: any = {
      draft: "rascunho",
      published: "publicado",
      ongoing: "em andamento",
      finished: "finalizado",
      cancelled: "cancelado",
    };
    return labels[status] || status;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">Gestão de Eventos</h2>
        <p className="text-muted-foreground">Gerenciar todos os eventos da plataforma</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Eventos</CardTitle>
          <CardDescription>Aprovar, visualizar e gerenciar eventos</CardDescription>
          <div className="flex gap-2 pt-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, organizador ou cidade..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter || "all"} onValueChange={(value) => setStatusFilter(value === "all" ? "" : value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Todos os status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="draft">Rascunho</SelectItem>
                <SelectItem value="published">Publicado</SelectItem>
                <SelectItem value="ongoing">Em andamento</SelectItem>
                <SelectItem value="finished">Finalizado</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Exportar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Evento</TableHead>
                  <TableHead>Organizador</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Inscrições</TableHead>
                  <TableHead>Faturamento</TableHead>
                  <TableHead>Ticket Médio</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : events.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Nenhum evento encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="font-medium">{event.title}</TableCell>
                      <TableCell>{event.organizer}</TableCell>
                      <TableCell>{new Date(event.date).toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell>{event.city}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusColor(event.status)}>
                          {getStatusLabel(event.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>{event.registrations}</TableCell>
                      <TableCell>{formatCurrency(event.revenue)}</TableCell>
                      <TableCell>{formatCurrency(event.avgTicket)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {event.status === "draft" ? (
                            <>
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                title="Aprovar"
                                onClick={() => handleApprove(event.id)}
                              >
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              </Button>
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                title="Reprovar"
                                onClick={() => handleReject(event.id)}
                              >
                                <XCircle className="h-4 w-4 text-red-500" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                title="Visualizar Evento (Página Pública)"
                                onClick={() => navigate(`/events/${event.id}`)}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                title="Visualizar Detalhes"
                                onClick={() => handleViewEvent(event.id)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                title="Editar"
                                onClick={() => handleEditEvent(event.id)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                title="Enviar Resultado"
                                onClick={() => {
                                  setEventForResult(event);
                                  setResultUrl("");
                                  setIsResultDialogOpen(true);
                                }}
                              >
                                <Award className="h-4 w-4 text-yellow-500" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Relatórios rápidos */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Eventos com Mais Atletas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">Corrida de São Silvestre</span>
                <span className="font-bold">523</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Meia Maratona de Curitiba</span>
                <span className="font-bold">287</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Eventos com Maior Faturamento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">Corrida de São Silvestre</span>
                <span className="font-bold">R$ 128k</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Meia Maratona de Curitiba</span>
                <span className="font-bold">R$ 65k</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Solicitações de Reembolso</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">Corrida de São Silvestre</span>
                <span className="font-bold text-red-500">5</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Meia Maratona de Curitiba</span>
                <span className="font-bold text-red-500">2</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <EventViewEditDialog
        eventId={selectedEventId}
        mode={dialogMode}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={loadEvents}
      />

      {/* Result URL Dialog */}
      <Dialog open={isResultDialogOpen} onOpenChange={setIsResultDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar Resultado do Evento</DialogTitle>
            <DialogDescription>
              Insira o link para os resultados de {eventForResult?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="result-url">Link dos Resultados</Label>
              <Input
                id="result-url"
                placeholder="https://exemplo.com/resultados"
                value={resultUrl}
                onChange={(e) => setResultUrl(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsResultDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSendResult}>
              Enviar Resultado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EventManagement;
