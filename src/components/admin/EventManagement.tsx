import { useState, useEffect, useCallback } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, Download, Edit, Eye, CheckCircle, XCircle, Ban, ExternalLink, BarChart, Loader2, Award, Filter, Trash2, Plus, MoreVertical } from "lucide-react";
import { getEvents, updateEvent, deleteEvent } from "@/lib/api/events";
import { useToast } from "@/hooks/use-toast";
import { EventViewEditDialog } from "./EventViewEditDialog";
import { EventFormDialog } from "@/components/organizer/EventFormDialog";
import EventDetailedReport from "@/components/organizer/EventDetailedReport";
import { useNavigate } from "react-router-dom";
import { getEffectiveRegistrationStatus, getRegistrationStatusLabel, getRegistrationStatusVariant } from "@/lib/utils/eventRegistration";

const EventManagement = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [dateOrderFilter, setDateOrderFilter] = useState<string>("asc"); // 'asc' = mais próximo, 'desc' = mais longe
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<"view" | "edit">("view");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isResultDialogOpen, setIsResultDialogOpen] = useState(false);
  const [resultUrl, setResultUrl] = useState("");
  const [eventForResult, setEventForResult] = useState<any>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingRegistrationStatus, setEditingRegistrationStatus] = useState<string | null>(null);
  const [selectedEventIdForReport, setSelectedEventIdForReport] = useState<string | null>(null);
  const { toast } = useToast();

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const filters: any = {};
      if (searchTerm && searchTerm.trim()) {
        filters.search = searchTerm.trim();
      }
      if (statusFilter && statusFilter.trim()) {
        filters.status = statusFilter.trim();
      }
      if (dateOrderFilter) {
        filters.order_by_date = dateOrderFilter;
      }

      console.log('🔍 EventManagement - Carregando eventos com filtros:', filters);

      const response = await getEvents(filters);

      if (response.success && response.data) {
        const eventsWithStats = response.data.map((event: any) => {
          const registrationCount = event.registration_count || 0;
          const revenue = event.revenue || 0;
          const avgTicket = event.avg_ticket || 0;

          return {
            id: event.id,
            slug: event.slug, // Incluir slug para URLs amigáveis
            title: event.title,
            organizer: event.organizer_name || "Desconhecido",
            date: event.event_date,
            city: event.city,
            state: event.state,
            status: event.status,
            registration_status: event.registration_status,
            registration_start_date: event.registration_start_date,
            registration_end_date: event.registration_end_date,
            registration_auto_mode: event.registration_auto_mode,
            registrations: registrationCount,
            revenue,
            avgTicket,
            platformFeeRevenue: event.platform_fee_revenue || 0,
          };
        });

        console.log(`✅ EventManagement - ${eventsWithStats.length} eventos carregados`);
        setEvents(eventsWithStats);
      } else {
        console.warn('⚠️ EventManagement - Resposta sem sucesso ou sem dados:', response);
        setEvents([]);
      }
    } catch (error: any) {
      console.error('❌ EventManagement - Erro ao carregar eventos:', error);
      toast({
        title: "Erro ao carregar eventos",
        description: error.message || "Erro desconhecido",
        variant: "destructive",
      });
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, statusFilter, dateOrderFilter, toast]);

  // Load events on mount and when filters change (with debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      loadEvents();
    }, 500);

    return () => clearTimeout(timer);
  }, [loadEvents]);

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

  const handleDeleteEvent = (event: any) => {
    setEventToDelete(event);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteEvent = async () => {
    if (!eventToDelete) return;

    setDeleting(true);
    try {
      const response = await deleteEvent(eventToDelete.id);

      if (response.success) {
        toast({
          title: "Evento excluído",
          description: "O evento foi excluído com sucesso.",
        });
        setIsDeleteDialogOpen(false);
        setEventToDelete(null);
        loadEvents();
      } else {
        throw new Error(response.error || "Erro ao excluir evento");
      }
    } catch (error: any) {
      toast({
        title: "Erro ao excluir evento",
        description: error.message || "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
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

  // Se um evento foi selecionado para relatório, mostrar apenas o relatório
  if (selectedEventIdForReport) {
    return (
      <EventDetailedReport
        eventId={selectedEventIdForReport}
        onBack={() => setSelectedEventIdForReport(null)}
      />
    );
  }

  return (
    <div className="space-y-6 px-0 sm:px-0">
      <div>
        <h2 className="text-2xl sm:text-3xl font-bold mb-2">Gestão de Eventos</h2>
        <p className="text-sm text-muted-foreground">Gerenciar todos os eventos da plataforma</p>
      </div>

      <Card>
        <CardHeader className="space-y-4 pb-4">
          <div>
            <CardTitle>Eventos</CardTitle>
            <CardDescription>Aprovar, visualizar e gerenciar eventos</CardDescription>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
            <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, organizador ou cidade..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full"
              />
            </div>
            <Select value={statusFilter || "all"} onValueChange={(value) => setStatusFilter(value === "all" ? "" : value)}>
              <SelectTrigger className="w-full sm:w-[180px]">
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
            <Select value={dateOrderFilter} onValueChange={setDateOrderFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Ordenar por data" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Mais próximo primeiro</SelectItem>
                <SelectItem value="desc">Mais longe primeiro</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" className="flex-1 sm:flex-none">
                <Download className="mr-2 h-4 w-4" />
                Exportar
              </Button>
              <Button onClick={() => setIsCreateDialogOpen(true)} className="flex-1 sm:flex-none">
                <Plus className="mr-2 h-4 w-4" />
                Criar Evento
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 pt-0">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <>
              {/* Desktop: tabela */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Evento</TableHead>
                  <TableHead>Organizador</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Status Inscrições</TableHead>
                  <TableHead>Inscrições</TableHead>
                  <TableHead>Faturamento</TableHead>
                  <TableHead>Ticket Médio</TableHead>
                  <TableHead>Taxa Plataforma</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
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
                      <TableCell>
                        {(() => {
                          const effectiveStatus = getEffectiveRegistrationStatus(event);
                          if (effectiveStatus !== null) {
                            return editingRegistrationStatus === event.id ? (
                              <Select
                                value={effectiveStatus || "default"}
                                onValueChange={async (value) => {
                                  try {
                                    const newStatus = value === "default" ? null : value;
                                    const response = await updateEvent(event.id, {
                                      registration_status: newStatus,
                                      registration_auto_mode: false, // Desativa modo automático ao mudar manualmente
                                    });
                                    if (response.success) {
                                      toast({
                                        title: "Sucesso",
                                        description: "Status de inscrições atualizado com sucesso!",
                                      });
                                      setEditingRegistrationStatus(null);
                                      loadEvents();
                                    } else {
                                      throw new Error(response.error || "Erro ao atualizar status");
                                    }
                                  } catch (error: any) {
                                    toast({
                                      title: "Erro",
                                      description: error.message || "Erro ao atualizar status de inscrições",
                                      variant: "destructive",
                                    });
                                  }
                                }}
                                onOpenChange={(open) => {
                                  if (!open) {
                                    setEditingRegistrationStatus(null);
                                  }
                                }}
                              >
                                <SelectTrigger className="w-[200px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="not_open">Inscrições em Breve</SelectItem>
                                  <SelectItem value="open">Inscrições Abertas</SelectItem>
                                  <SelectItem value="closed">Inscrições Encerradas</SelectItem>
                                  <SelectItem value="default">Usar Status Padrão</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge
                                variant={getRegistrationStatusVariant(event)}
                                className="cursor-pointer hover:opacity-80"
                                onClick={() => setEditingRegistrationStatus(event.id)}
                              >
                                {getRegistrationStatusLabel(event)}
                              </Badge>
                            );
                          }
                          return <span className="text-muted-foreground text-sm">-</span>;
                        })()}
                      </TableCell>
                      <TableCell>{event.registrations}</TableCell>
                      <TableCell>{formatCurrency(event.revenue)}</TableCell>
                      <TableCell>{formatCurrency(event.avgTicket)}</TableCell>
                      <TableCell className="font-semibold text-primary">
                        {formatCurrency(event.platformFeeRevenue)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-9 w-9 touch-manipulation">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" side="bottom" collisionPadding={12}>
                            {event.status === "draft" ? (
                              <>
                                <DropdownMenuItem onClick={() => handleApprove(event.id)}>
                                  <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                                  Aprovar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleReject(event.id)}>
                                  <XCircle className="mr-2 h-4 w-4 text-red-500" />
                                  Reprovar
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <>
                                <DropdownMenuItem onClick={() => navigate(event.slug ? `/evento/${event.slug}` : `/events/${event.id}`)}>
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  Visualizar Evento (Página Pública)
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleViewEvent(event.id)}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  Visualizar Detalhes
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleEditEvent(event.id)}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => setSelectedEventIdForReport(event.id)}
                                >
                                  <BarChart className="mr-2 h-4 w-4" />
                                  Estatísticas
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => {
                                    setEventForResult(event);
                                    setResultUrl("");
                                    setIsResultDialogOpen(true);
                                  }}
                                >
                                  <Award className="mr-2 h-4 w-4 text-yellow-500" />
                                  Enviar Resultado
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="text-destructive"
                                  onClick={() => handleDeleteEvent(event)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Excluir Evento
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
              </div>

              {/* Mobile: cards */}
              <div className="md:hidden space-y-3 px-4 pb-4">
                {events.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground text-sm">Nenhum evento encontrado</p>
                ) : (
                  events.map((event) => (
                    <Card key={event.id} className="p-4">
                      <div className="space-y-3">
                        <div className="flex justify-between items-start gap-2">
                          <h3 className="font-medium text-sm line-clamp-2">{event.title}</h3>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="h-8 w-8 p-0 shrink-0 touch-manipulation">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" side="bottom" collisionPadding={12}>
                              {event.status === "draft" ? (
                                <>
                                  <DropdownMenuItem onClick={() => handleApprove(event.id)}>
                                    <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                                    Aprovar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleReject(event.id)}>
                                    <XCircle className="mr-2 h-4 w-4 text-red-500" />
                                    Reprovar
                                  </DropdownMenuItem>
                                </>
                              ) : (
                                <>
                                  <DropdownMenuItem onClick={() => navigate(event.slug ? `/evento/${event.slug}` : `/events/${event.id}`)}>
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    Ver página pública
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleViewEvent(event.id)}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    Visualizar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleEditEvent(event.id)}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Editar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setSelectedEventIdForReport(event.id)}>
                                    <BarChart className="mr-2 h-4 w-4" />
                                    Estatísticas
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => { setEventForResult(event); setResultUrl(""); setIsResultDialogOpen(true); }}>
                                    <Award className="mr-2 h-4 w-4 text-yellow-500" />
                                    Enviar Resultado
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteEvent(event)}>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Excluir
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{event.organizer}</span>
                          <span>{new Date(event.date).toLocaleDateString('pt-BR')}</span>
                          <span>{event.city}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={getStatusColor(event.status)} className="text-xs">
                            {getStatusLabel(event.status)}
                          </Badge>
                          {getEffectiveRegistrationStatus(event) !== null ? (
                            editingRegistrationStatus === event.id ? (
                              <Select
                                value={getEffectiveRegistrationStatus(event) || "default"}
                                onValueChange={async (value) => {
                                  try {
                                    const newStatus = value === "default" ? null : value;
                                    const response = await updateEvent(event.id, {
                                      registration_status: newStatus,
                                      registration_auto_mode: false,
                                    });
                                    if (response.success) {
                                      toast({ title: "Sucesso", description: "Status de inscrições atualizado!" });
                                      setEditingRegistrationStatus(null);
                                      loadEvents();
                                    } else throw new Error(response.error);
                                  } catch (err: any) {
                                    toast({ title: "Erro", description: err.message, variant: "destructive" });
                                  }
                                }}
                                onOpenChange={(open) => !open && setEditingRegistrationStatus(null)}
                              >
                                <SelectTrigger className="h-7 text-xs w-[160px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="not_open">Em Breve</SelectItem>
                                  <SelectItem value="open">Abertas</SelectItem>
                                  <SelectItem value="closed">Encerradas</SelectItem>
                                  <SelectItem value="default">Padrão</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge
                                variant={getRegistrationStatusVariant(event)}
                                className="text-xs cursor-pointer touch-manipulation"
                                onClick={() => setEditingRegistrationStatus(event.id)}
                              >
                                {getRegistrationStatusLabel(event)}
                              </Badge>
                            )
                          ) : null}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t">
                          <div>
                            <span className="text-muted-foreground">Inscrições:</span> {event.registrations}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Faturamento:</span> {formatCurrency(event.revenue)}
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </>
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir o evento "{eventToDelete?.title}"? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Ao excluir este evento, todas as informações relacionadas serão removidas permanentemente, incluindo:
            </p>
            <ul className="list-disc list-inside mt-2 text-sm text-muted-foreground space-y-1">
              <li>Inscrições do evento</li>
              <li>Categorias e modalidades</li>
              <li>Kits do evento</li>
              <li>Comissões de líderes relacionadas</li>
            </ul>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setEventToDelete(null);
              }}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDeleteEvent}
              disabled={deleting}
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {deleting ? "Excluindo..." : "Excluir Evento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Event Dialog */}
      <EventFormDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={() => {
          setIsCreateDialogOpen(false);
          loadEvents();
        }}
        isAdmin={true}
      />
    </div>
  );
};

export default EventManagement;
