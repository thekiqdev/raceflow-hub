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
import { Search, Download, Edit, Eye, CheckCircle, XCircle, Ban, ExternalLink, BarChart, Loader2, Award } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { EventViewEditDialog } from "./EventViewEditDialog";

const EventManagement = () => {
  const [searchTerm, setSearchTerm] = useState("");
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
      const { data, error } = await supabase
        .from("events")
        .select(`
          *,
          profiles(full_name),
          event_categories(id),
          registrations(id, total_amount)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const eventsWithStats = data?.map((event) => {
        const registrations = event.registrations || [];
        const registrationCount = registrations.length;
        const revenue = registrations.reduce((sum, reg) => sum + Number(reg.total_amount || 0), 0);
        const avgTicket = registrationCount > 0 ? revenue / registrationCount : 0;

        return {
          id: event.id,
          title: event.title,
          organizer: event.profiles?.full_name || "Desconhecido",
          date: event.event_date,
          city: event.city,
          status: event.status,
          registrations: registrationCount,
          revenue,
          avgTicket,
        };
      }) || [];

      setEvents(eventsWithStats);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar eventos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (eventId: string) => {
    try {
      const { error } = await supabase
        .from("events")
        .update({ status: "published" })
        .eq("id", eventId);

      if (error) throw error;

      toast({
        title: "Evento aprovado",
        description: "O evento foi publicado com sucesso.",
      });
      loadEvents();
    } catch (error: any) {
      toast({
        title: "Erro ao aprovar evento",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleReject = async (eventId: string) => {
    try {
      const { error } = await supabase
        .from("events")
        .update({ status: "cancelled" })
        .eq("id", eventId);

      if (error) throw error;

      toast({
        title: "Evento reprovado",
        description: "O evento foi cancelado.",
      });
      loadEvents();
    } catch (error: any) {
      toast({
        title: "Erro ao reprovar evento",
        description: error.message,
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
    if (!resultUrl.trim()) {
      toast({
        title: "Erro",
        description: "Por favor, insira o link dos resultados",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from("events")
        .update({ result_url: resultUrl })
        .eq("id", eventForResult.id);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Link de resultados enviado com sucesso!",
      });
      setIsResultDialogOpen(false);
      setResultUrl("");
      setEventForResult(null);
      loadEvents();
    } catch (error: any) {
      toast({
        title: "Erro ao enviar link de resultados",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const filteredEvents = events.filter((event) =>
    event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    event.organizer.toLowerCase().includes(searchTerm.toLowerCase()) ||
    event.city.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
                {filteredEvents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">
                      Nenhum evento encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEvents.map((event) => (
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
                      <TableCell>R$ {event.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell>R$ {event.avgTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
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
                                title="Visualizar"
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
