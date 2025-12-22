import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Plus, Search, MoreVertical, Eye, MessageSquare, FileDown, Loader2, UserCog, Mail } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { getRegistrations, exportRegistrations, createRegistrationByOrganizer, type Registration } from "@/lib/api/registrations";
import { getEvents, type Event } from "@/lib/api/events";
import { getModalities, type Modality } from "@/lib/api/modalities";
import { getCategories, type Category } from "@/lib/api/categories";
import { getEventKits, type EventKit } from "@/lib/api/eventKits";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/useDebounce";
import { createOrganizerGroupLeader } from "@/lib/api/groupLeaders";

const OrganizerRegistrations = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");
  const [isExporting, setIsExporting] = useState(false);
  
  // Dialog states
  const [isRegisterDialogOpen, setIsRegisterDialogOpen] = useState(false);
  const [registerEmail, setRegisterEmail] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [selectedModalityId, setSelectedModalityId] = useState<string>("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [selectedKitId, setSelectedKitId] = useState<string>("");
  const [modalities, setModalities] = useState<Modality[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [kits, setKits] = useState<EventKit[]>([]);
  const [loadingModalities, setLoadingModalities] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [loadingKits, setLoadingKits] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const debouncedSearch = useDebounce(searchQuery, 500);

  useEffect(() => {
    if (user) {
      loadEvents();
      loadRegistrations();
    }
  }, [user, debouncedSearch, statusFilter, paymentStatusFilter, eventFilter]);

  const loadEvents = async () => {
    if (!user) return;

    try {
      const response = await getEvents({ organizer_id: user.id });
      if (response.success && response.data) {
        setEvents(response.data);
      }
    } catch (error) {
      console.error("Error loading events:", error);
    }
  };

  const loadRegistrations = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const filters: any = {
        organizer_id: user.id,
      };

      if (statusFilter !== "all") {
        filters.status = statusFilter;
      }

      if (paymentStatusFilter !== "all") {
        filters.payment_status = paymentStatusFilter;
      }

      if (eventFilter !== "all") {
        filters.event_id = eventFilter;
      }

      if (debouncedSearch) {
        filters.search = debouncedSearch;
      }

      const response = await getRegistrations(filters);

      if (response.success && response.data) {
        setRegistrations(response.data);
      } else {
        toast.error(response.error || "Erro ao carregar inscrições");
      }
    } catch (error: any) {
      console.error("Error loading registrations:", error);
      toast.error("Erro ao carregar inscrições");
    } finally {
      setLoading(false);
    }
  };

  // Load modalities, categories and kits when event is selected
  useEffect(() => {
    if (selectedEventId) {
      loadModalities();
      loadCategories();
      loadKits();
    } else {
      setModalities([]);
      setCategories([]);
      setKits([]);
      setSelectedModalityId("");
      setSelectedCategoryId("");
      setSelectedKitId("");
    }
  }, [selectedEventId]);

  // Load categories when modality is selected
  useEffect(() => {
    if (selectedModalityId) {
      loadCategoriesByModality();
    } else if (selectedEventId) {
      loadCategories();
    }
    setSelectedCategoryId("");
  }, [selectedModalityId]);

  const loadModalities = async () => {
    if (!selectedEventId) return;
    
    try {
      setLoadingModalities(true);
      const response = await getModalities(selectedEventId);
      if (response.success && response.data) {
        setModalities(response.data);
      }
    } catch (error) {
      console.error("Error loading modalities:", error);
      toast.error("Erro ao carregar modalidades");
    } finally {
      setLoadingModalities(false);
    }
  };

  const loadCategories = async () => {
    if (!selectedEventId) return;
    
    try {
      setLoadingCategories(true);
      const response = await getCategories(selectedEventId);
      if (response.success && response.data) {
        setCategories(response.data);
      }
    } catch (error) {
      console.error("Error loading categories:", error);
      toast.error("Erro ao carregar categorias");
    } finally {
      setLoadingCategories(false);
    }
  };

  const loadCategoriesByModality = async () => {
    if (!selectedModalityId) return;
    
    try {
      setLoadingCategories(true);
      const { getCategoriesByModality } = await import("@/lib/api/categories");
      const response = await getCategoriesByModality(selectedModalityId);
      if (response.success && response.data) {
        setCategories(response.data);
      }
    } catch (error) {
      console.error("Error loading categories by modality:", error);
      toast.error("Erro ao carregar categorias");
    } finally {
      setLoadingCategories(false);
    }
  };

  const loadKits = async () => {
    if (!selectedEventId) return;
    
    try {
      setLoadingKits(true);
      const response = await getEventKits(selectedEventId);
      if (response.success && response.data) {
        setKits(response.data);
      }
    } catch (error) {
      console.error("Error loading kits:", error);
      toast.error("Erro ao carregar kits");
    } finally {
      setLoadingKits(false);
    }
  };

  const handleOpenRegisterDialog = () => {
    setIsRegisterDialogOpen(true);
    setRegisterEmail("");
    setSelectedEventId("");
    setSelectedModalityId("");
    setSelectedCategoryId("");
    setSelectedKitId("");
  };

  const handleCloseRegisterDialog = () => {
    setIsRegisterDialogOpen(false);
    setRegisterEmail("");
    setSelectedEventId("");
    setSelectedModalityId("");
    setSelectedCategoryId("");
    setSelectedKitId("");
  };

  const handleRegisterAthlete = async () => {
    if (!registerEmail || !selectedEventId || !selectedCategoryId) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(registerEmail)) {
      toast.error("Email inválido");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await createRegistrationByOrganizer({
        email: registerEmail,
        event_id: selectedEventId,
        category_id: selectedCategoryId,
        kit_id: selectedKitId || undefined,
      });

      if (response.success) {
        toast.success("Atleta inscrito com sucesso!");
        handleCloseRegisterDialog();
        loadRegistrations();
      } else {
        toast.error(response.error || "Erro ao inscrever atleta");
      }
    } catch (error: any) {
      console.error("Error registering athlete:", error);
      toast.error(error.message || "Erro ao inscrever atleta");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConvertToLeader = async (registration: Registration) => {
    if (!registration.runner_id) {
      toast.error("Não é possível converter: runner_id não encontrado");
      return;
    }

    if (!confirm(`Deseja converter "${registration.runner_name || 'este usuário'}" em líder de grupo?`)) {
      return;
    }

    try {
      const response = await createOrganizerGroupLeader({
        user_id: registration.runner_id,
        commission_percentage: null, // Usar percentual global
      });

      if (response.success) {
        toast.success("Usuário convertido para líder de grupo com sucesso!");
        // Opcional: recarregar registros ou navegar para a seção de líderes
        window.dispatchEvent(new CustomEvent('organizer:navigate-to-section', { detail: 'group-leaders' }));
      } else {
        toast.error(response.error || "Erro ao converter para líder de grupo");
      }
    } catch (error: any) {
      console.error("Erro ao converter para líder:", error);
      toast.error(error.message || "Erro ao converter para líder de grupo");
    }
  };

  const handleExport = async () => {
    if (!user) return;

    try {
      setIsExporting(true);
      const filters: any = {};

      if (statusFilter !== "all") {
        filters.status = statusFilter;
      }

      if (paymentStatusFilter !== "all") {
        filters.payment_status = paymentStatusFilter;
      }

      if (eventFilter !== "all") {
        filters.event_id = eventFilter;
      }

      await exportRegistrations(filters);
      toast.success("Lista exportada com sucesso!");
    } catch (error: any) {
      console.error("Error exporting registrations:", error);
      toast.error(error.message || "Erro ao exportar lista");
    } finally {
      setIsExporting(false);
    }
  };


  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed":
        return <Badge variant="default">Confirmado</Badge>;
      case "pending":
        return <Badge variant="secondary">Pendente</Badge>;
      case "cancelled":
        return <Badge variant="outline">Cancelado</Badge>;
      case "refund_requested":
        return <Badge variant="secondary">Reembolso Solicitado</Badge>;
      case "refunded":
        return <Badge variant="destructive">Reembolsado</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge variant="default" className="bg-green-500">Pago</Badge>;
      case "pending":
        return <Badge variant="secondary">Pendente</Badge>;
      case "refunded":
        return <Badge variant="destructive">Reembolsado</Badge>;
      case "failed":
        return <Badge variant="destructive">Falhou</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatCPF = (cpf: string) => {
    if (!cpf) return "";
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  };

  const formatCurrency = (value: number) => {
    if (value === 0 || !value) {
      return ''; // Retorna espaço em branco ao invés de "Grátis" ou "R$ 0,00"
    }
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  // Calculate statistics
  const totalRegistrations = registrations.length;
  const paidRegistrations = registrations.filter(r => r.payment_status === "paid").length;
  const pendingRegistrations = registrations.filter(r => r.payment_status === "pending").length;
  const refundedRegistrations = registrations.filter(r => r.payment_status === "refunded" || r.status === "refunded").length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">Gestão de Inscrições</h2>
        <p className="text-muted-foreground">Controle todos os atletas inscritos</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total de Inscrições</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRegistrations}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pagamentos Confirmados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {paidRegistrations}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {pendingRegistrations}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Reembolsos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {refundedRegistrations}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou CPF..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              <Select value={eventFilter} onValueChange={setEventFilter}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Filtrar por evento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os eventos</SelectItem>
                  {events.map(event => (
                    <SelectItem key={event.id} value={event.id}>{event.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="confirmed">Confirmado</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                  <SelectItem value="refund_requested">Reembolso Solicitado</SelectItem>
                  <SelectItem value="refunded">Reembolsado</SelectItem>
                </SelectContent>
              </Select>

              <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Status Pagamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="paid">Pago</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="refunded">Reembolsado</SelectItem>
                  <SelectItem value="failed">Falhou</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleOpenRegisterDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Inscrever Atleta
              </Button>
              <Button 
                variant="outline" 
                onClick={handleExport}
                disabled={isExporting}
              >
                {isExporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="mr-2 h-4 w-4" />
                )}
                Exportar Lista
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Registrations Table */}
      <Card>
        <CardHeader>
          <CardTitle>Inscrições</CardTitle>
          <CardDescription>
            {loading ? "Carregando..." : `${registrations.length} ${registrations.length === 1 ? "inscrição encontrada" : "inscrições encontradas"}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Atleta</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Modalidade/Kit</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registrations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        Nenhuma inscrição encontrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    registrations.map((registration) => (
                      <TableRow key={registration.id}>
                        <TableCell className="font-medium">{registration.runner_name || "N/A"}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {registration.runner_cpf ? formatCPF(registration.runner_cpf) : "N/A"}
                        </TableCell>
                        <TableCell>{registration.event_title || "N/A"}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="text-sm">
                              {registration.category_name || "N/A"}
                              {registration.category_distance && ` - ${registration.category_distance}`}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {registration.kit_name || "Sem kit"}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(parseFloat(String(registration.total_amount || 0)))}
                        </TableCell>
                        <TableCell>{getStatusBadge(registration.status || "pending")}</TableCell>
                        <TableCell>{getPaymentStatusBadge(registration.payment_status || "pending")}</TableCell>
                        <TableCell>
                          {registration.created_at
                            ? format(new Date(registration.created_at), "dd/MM/yyyy", { locale: ptBR })
                            : "N/A"}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <Eye className="mr-2 h-4 w-4" />
                                Ver Detalhes
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <MessageSquare className="mr-2 h-4 w-4" />
                                Enviar Mensagem
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleConvertToLeader(registration)}>
                                <UserCog className="mr-2 h-4 w-4" />
                                Converter para Líder de Grupo
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Register Athlete Dialog */}
      <Dialog open={isRegisterDialogOpen} onOpenChange={setIsRegisterDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Inscrever Atleta</DialogTitle>
            <DialogDescription>
              Inscreva um atleta no evento informando apenas o email. O atleta não precisa ter perfil público.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email do Atleta *</Label>
              <Input
                id="email"
                type="email"
                placeholder="atleta@email.com"
                value={registerEmail}
                onChange={(e) => setRegisterEmail(e.target.value)}
              />
            </div>

            {/* Event */}
            <div className="space-y-2">
              <Label htmlFor="event">Evento *</Label>
              <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                <SelectTrigger id="event">
                  <SelectValue placeholder="Selecione o evento" />
                </SelectTrigger>
                <SelectContent>
                  {events
                    .filter(e => e.status === 'published' || e.status === 'ongoing')
                    .map((event) => (
                      <SelectItem key={event.id} value={event.id}>
                        {event.title}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Modality (optional) */}
            {selectedEventId && (
              <div className="space-y-2">
                <Label htmlFor="modality">Modalidade</Label>
                <Select 
                  value={selectedModalityId || undefined} 
                  onValueChange={(value) => setSelectedModalityId(value || "")}
                  disabled={loadingModalities}
                >
                  <SelectTrigger id="modality">
                    <SelectValue placeholder={loadingModalities ? "Carregando..." : "Selecione a modalidade (opcional)"} />
                  </SelectTrigger>
                  <SelectContent>
                    {modalities.map((modality) => (
                      <SelectItem key={modality.id} value={modality.id}>
                        {modality.name} {modality.distance && `- ${modality.distance}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedModalityId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setSelectedModalityId("")}
                  >
                    Limpar seleção
                  </Button>
                )}
              </div>
            )}

            {/* Category */}
            {selectedEventId && (
              <div className="space-y-2">
                <Label htmlFor="category">Categoria *</Label>
                <Select 
                  value={selectedCategoryId} 
                  onValueChange={setSelectedCategoryId}
                  disabled={loadingCategories}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder={loadingCategories ? "Carregando..." : "Selecione a categoria"} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name} - R$ {category.price.toFixed(2).replace('.', ',')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Kit (optional) */}
            {selectedEventId && (
              <div className="space-y-2">
                <Label htmlFor="kit">Kit</Label>
                <Select 
                  value={selectedKitId || undefined} 
                  onValueChange={(value) => setSelectedKitId(value || "")}
                  disabled={loadingKits}
                >
                  <SelectTrigger id="kit">
                    <SelectValue placeholder={loadingKits ? "Carregando..." : "Selecione o kit (opcional)"} />
                  </SelectTrigger>
                  <SelectContent>
                    {kits.map((kit) => (
                      <SelectItem key={kit.id} value={kit.id}>
                        {kit.name} - R$ {kit.price.toFixed(2).replace('.', ',')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedKitId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setSelectedKitId("")}
                  >
                    Remover kit
                  </Button>
                )}
              </div>
            )}

            {/* Total amount preview */}
            {selectedCategoryId && (
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Total:</span>
                  <span className="text-lg font-bold">
                    R$ {(
                      (categories.find(c => c.id === selectedCategoryId)?.price || 0) +
                      (selectedKitId ? (kits.find(k => k.id === selectedKitId)?.price || 0) : 0)
                    ).toFixed(2).replace('.', ',')}
                  </span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseRegisterDialog} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handleRegisterAthlete} disabled={isSubmitting || !registerEmail || !selectedEventId || !selectedCategoryId}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Inscrevendo...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Inscrever Atleta
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrganizerRegistrations;
