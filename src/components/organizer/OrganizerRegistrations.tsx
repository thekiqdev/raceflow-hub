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
import { Plus, Search, MoreVertical, Eye, MessageSquare, FileDown, Loader2, UserCog, Mail, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getRegistrations, exportRegistrations, createRegistrationByOrganizer, getRegistrationById, type Registration } from "@/lib/api/registrations";
import { getEvents, type Event } from "@/lib/api/events";
import { getModalities, type Modality } from "@/lib/api/modalities";
import { getCategories, type Category } from "@/lib/api/categories";
import { getEventKits, type EventKit } from "@/lib/api/eventKits";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/useDebounce";
import { createOrganizerGroupLeader } from "@/lib/api/groupLeaders";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getEnabledModules } from "@/lib/api/systemSettings";
import { calculateValueWithoutFee } from "@/lib/utils/feeCalculations";
import type { KitProduct, ProductVariant } from "@/lib/api/eventKits";
import { EventSelect } from "@/components/ui/event-select";

const OrganizerRegistrations = () => {
  const navigate = useNavigate();
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
  
  // Kit products and variants selection
  const [expandedKits, setExpandedKits] = useState<Set<string>>(new Set());
  const [selectedProducts, setSelectedProducts] = useState<Map<string, { productId: string; variantId?: string }>>(new Map());
  const [variantSelections, setVariantSelections] = useState<Map<string, Record<string, string>>>(new Map());
  
  // Registration details dialog
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [selectedRegistration, setSelectedRegistration] = useState<Registration | null>(null);
  const [registrationDetails, setRegistrationDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [platformFee, setPlatformFee] = useState<number>(0);
  const [platformFeeType, setPlatformFeeType] = useState<'fixed' | 'percentage'>('fixed');

  const debouncedSearch = useDebounce(searchQuery, 500);

  useEffect(() => {
    if (user) {
      loadPlatformFeeSettings();
      loadEvents();
      loadRegistrations();
    }
  }, [user, debouncedSearch, statusFilter, paymentStatusFilter, eventFilter]);

  const loadPlatformFeeSettings = async () => {
    try {
      const response = await getEnabledModules();
      if (response.success && response.data) {
        setPlatformFee(response.data.platform_fee || 0);
        setPlatformFeeType(response.data.platform_fee_type || 'fixed');
      }
    } catch (error) {
      console.error("Error loading platform fee settings:", error);
    }
  };

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

  // Reload kits when category changes
  useEffect(() => {
    if (selectedEventId) {
      loadKits();
    }
  }, [selectedCategoryId]);

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
      // Load kits filtered by category if category is selected
      const response = await getEventKits(selectedEventId, selectedCategoryId || undefined);
      if (response.success && response.data) {
        setKits(response.data);
      } else {
        setKits([]);
      }
    } catch (error) {
      console.error("Error loading kits:", error);
      toast.error("Erro ao carregar kits");
      setKits([]);
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
    setExpandedKits(new Set());
    setSelectedProducts(new Map());
    setVariantSelections(new Map());
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
      // Build product_selections from selectedProducts and variantSelections
      const productSelections: Array<{ product_id: string; variant_id?: string; attribute_selections?: Record<string, string> }> = [];
      
      if (selectedKitId && selectedProducts.has(selectedKitId)) {
        const selection = selectedProducts.get(selectedKitId);
        if (selection) {
          const kitKey = `${selectedKitId}-${selection.productId}`;
          const variantSelection = variantSelections.get(kitKey);
          
          productSelections.push({
            product_id: selection.productId,
            variant_id: selection.variantId,
            attribute_selections: variantSelection || undefined,
          });
        }
      }

      const response = await createRegistrationByOrganizer({
        email: registerEmail,
        event_id: selectedEventId,
        category_id: selectedCategoryId,
        kit_id: selectedKitId || undefined,
        product_selections: productSelections.length > 0 ? productSelections : undefined,
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

  const handleViewDetails = async (registration: Registration) => {
    setSelectedRegistration(registration);
    setIsDetailsDialogOpen(true);
    setLoadingDetails(true);
    
    try {
      const response = await getRegistrationById(registration.id);
      if (response.success && response.data) {
        setRegistrationDetails(response.data);
      } else {
        toast.error(response.error || "Erro ao carregar detalhes da inscrição");
      }
    } catch (error: any) {
      console.error("Error loading registration details:", error);
      toast.error("Erro ao carregar detalhes da inscrição");
    } finally {
      setLoadingDetails(false);
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

      if (searchQuery && searchQuery.trim()) {
        filters.search = searchQuery.trim();
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
      case "convidado":
        return <Badge variant="default" className="bg-blue-500">Convite</Badge>;
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

              <EventSelect
                events={events}
                value={eventFilter}
                onValueChange={setEventFilter}
                placeholder="Filtrar por evento"
                className="w-full sm:w-[200px]"
              />

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
                          {formatCurrency(
                            (registration.total_amount || 0) > 0
                              ? calculateValueWithoutFee(
                                  parseFloat(String(registration.total_amount || 0)),
                                  platformFee,
                                  platformFeeType
                                )
                              : parseFloat(String(registration.total_amount || 0))
                          )}
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
                              <DropdownMenuItem onClick={() => handleViewDetails(registration)}>
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
              <div className="space-y-4">
                <Label htmlFor="kit">Kit (opcional)</Label>
                {loadingKits ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="ml-2 text-sm text-muted-foreground">Carregando kits...</span>
                  </div>
                ) : kits.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum kit disponível para este evento</p>
                ) : (
              <div className="space-y-2">
                <Select 
                  value={selectedKitId || undefined} 
                      onValueChange={(value) => {
                        setSelectedKitId(value || "");
                        if (!value) {
                          setExpandedKits(new Set());
                          setSelectedProducts(new Map());
                          setVariantSelections(new Map());
                        } else {
                          // Expand kit when selected
                          setExpandedKits(prev => new Set(prev).add(value));
                        }
                      }}
                  disabled={loadingKits}
                >
                  <SelectTrigger id="kit">
                        <SelectValue placeholder="Selecione o kit (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {kits.map((kit) => (
                      <SelectItem key={kit.id} value={kit.id}>
                        {kit.name} - R$ {kit.price.toFixed(2).replace('.', ',')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                    
                    {/* Show products and variants when kit is selected */}
                    {selectedKitId && (() => {
                      const selectedKit = kits.find(k => k.id === selectedKitId);
                      if (!selectedKit) return null;
                      
                      const kitProducts = selectedKit.products || [];
                      const isExpanded = expandedKits.has(selectedKitId);
                      
                      return (
                        <div className="mt-4">
                          <Collapsible open={isExpanded} onOpenChange={(open) => {
                            if (open) {
                              setExpandedKits(prev => new Set(prev).add(selectedKitId));
                            } else {
                              setExpandedKits(prev => {
                                const newSet = new Set(prev);
                                newSet.delete(selectedKitId);
                                return newSet;
                              });
                            }
                          }}>
                            <CollapsibleTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                className="w-full justify-between"
                              >
                                <span>Ver produtos do kit</span>
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="mt-4 space-y-4 border-t pt-4">
                                {kitProducts.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">Este kit não possui produtos cadastrados</p>
                                ) : (
                                  kitProducts.map((product: KitProduct) => {
                                    const productKey = `${selectedKitId}-${product.id}`;
                                    const selections = variantSelections.get(productKey) || {};
                                    const selectedProduct = selectedProducts.get(selectedKitId);
                                    const isProductSelected = selectedProduct?.productId === product.id;
                                    
                                    return (
                                      <Card key={product.id} className={isProductSelected ? "ring-2 ring-primary" : ""}>
                                        <CardHeader>
                                          <CardTitle className="text-base">{product.name}</CardTitle>
                                          {product.description && (
                                            <CardDescription>{product.description}</CardDescription>
                                          )}
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                          {product.type === 'variable' && product.variants && product.variants.length > 0 ? (
                                            <div className="space-y-3">
                                              <Label className="text-sm font-medium">Selecione a variação:</Label>
                                              {(() => {
                                                // Get variant attributes
                                                const savedAttributeNames = product.variant_attributes as string[] | undefined;
                                                let attributeOrder: string[] = [];
                                                
                                                if (savedAttributeNames && savedAttributeNames.length > 0) {
                                                  attributeOrder = savedAttributeNames;
                                                } else {
                                                  // Extract from variants
                                                  const firstAttributes = new Set<string>();
                                                  product.variants.forEach(variant => {
                                                    if (variant.variant_group_name) {
                                                      firstAttributes.add(variant.variant_group_name);
                                                    }
                                                  });
                                                  if (firstAttributes.size > 0) {
                                                    attributeOrder.push(Array.from(firstAttributes)[0]);
                                                  }
                                                  let maxValues = 0;
                                                  product.variants.forEach(variant => {
                                                    const values = variant.name.split(' - ').map(v => v.trim());
                                                    maxValues = Math.max(maxValues, values.length);
                                                  });
                                                  for (let i = 1; i < maxValues; i++) {
                                                    attributeOrder.push(`Atributo ${i + 1}`);
                                                  }
                                                }
                                                
                                                // Filter variants based on selections
                                                const getAvailableVariants = (attributeIndex: number): ProductVariant[] => {
                                                  return product.variants!.filter(variant => {
                                                    const variantValues = variant.name.split(' - ').map(v => v.trim());
                                                    for (let i = 0; i < attributeIndex; i++) {
                                                      const attrName = attributeOrder[i];
                                                      const selectedValue = selections[attrName];
                                                      if (selectedValue && variantValues[i]?.trim() !== selectedValue) {
                                                        return false;
                                                      }
                                                    }
                                                    return variant.available_quantity === null || variant.available_quantity > 0;
                                                  });
                                                };
                                                
                                                const getAvailableValues = (attributeIndex: number): string[] => {
                                                  const availableVariants = getAvailableVariants(attributeIndex);
                                                  const orderedValues: string[] = [];
                                                  const seen = new Set<string>();
                                                  
                                                  availableVariants.forEach(variant => {
                                                    const variantValues = variant.name.split(' - ').map(v => v.trim());
                                                    const value = variantValues[attributeIndex]?.trim();
                                                    if (value && !seen.has(value)) {
                                                      seen.add(value);
                                                      orderedValues.push(value);
                                                    }
                                                  });
                                                  
                                                  return orderedValues;
                                                };
                                                
                                                return (
                                                  <div className="space-y-3">
                                                    {attributeOrder.map((attrName, attrIndex) => {
                                                      const availableValues = getAvailableValues(attrIndex);
                                                      const selectedValue = selections[attrName];
                                                      
                                                      return (
                                                        <div key={attrIndex} className="space-y-2">
                                                          <Label className="text-sm">{attrName}</Label>
                                                          <Select
                                                            value={selectedValue || ""}
                                                            onValueChange={(value) => {
                                                              const newSelections = { ...selections, [attrName]: value };
                                                              setVariantSelections(prev => {
                                                                const newMap = new Map(prev);
                                                                newMap.set(productKey, newSelections);
                                                                return newMap;
                                                              });
                                                              
                                                              // Find matching variant
                                                              const matchingVariant = product.variants!.find(variant => {
                                                                const variantValues = variant.name.split(' - ').map(v => v.trim());
                                                                return variantValues.every((val, idx) => {
                                                                  const attr = attributeOrder[idx];
                                                                  return !newSelections[attr] || val === newSelections[attr];
                                                                });
                                                              });
                                                              
                                                              if (matchingVariant) {
                                                                setSelectedProducts(prev => {
                                                                  const newMap = new Map(prev);
                                                                  newMap.set(selectedKitId, {
                                                                    productId: product.id,
                                                                    variantId: matchingVariant.id
                                                                  });
                                                                  return newMap;
                                                                });
                                                              }
                                                            }}
                                                          >
                                                            <SelectTrigger>
                                                              <SelectValue placeholder={`Selecione ${attrName.toLowerCase()}`} />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                              {availableValues.map((value) => (
                                                                <SelectItem key={value} value={value}>
                                                                  {value}
                                                                </SelectItem>
                                                              ))}
                                                            </SelectContent>
                                                          </Select>
                                                        </div>
                                                      );
                                                    })}
                                                  </div>
                                                );
                                              })()}
                                            </div>
                                          ) : (
                                            <div className="flex items-center justify-between">
                                              <span className="text-sm text-muted-foreground">Produto único</span>
                                              <Button
                                                type="button"
                                                variant={isProductSelected ? "default" : "outline"}
                                                size="sm"
                                                onClick={() => {
                                                  if (isProductSelected) {
                                                    setSelectedProducts(prev => {
                                                      const newMap = new Map(prev);
                                                      newMap.delete(selectedKitId);
                                                      return newMap;
                                                    });
                                                  } else {
                                                    setSelectedProducts(prev => {
                                                      const newMap = new Map(prev);
                                                      newMap.set(selectedKitId, {
                                                        productId: product.id
                                                      });
                                                      return newMap;
                                                    });
                                                  }
                                                }}
                                              >
                                                {isProductSelected ? "Selecionado" : "Selecionar"}
                                              </Button>
                                            </div>
                                          )}
                                        </CardContent>
                                      </Card>
                                    );
                                  })
                                )}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                          
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                            className="h-8 text-xs mt-2"
                            onClick={() => {
                              setSelectedKitId("");
                              setExpandedKits(new Set());
                              setSelectedProducts(new Map());
                              setVariantSelections(new Map());
                            }}
                  >
                    Remover kit
                  </Button>
                        </div>
                      );
                    })()}
                  </div>
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

      {/* Registration Details Dialog */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da Inscrição</DialogTitle>
            <DialogDescription>
              Informações completas da inscrição
            </DialogDescription>
          </DialogHeader>

          {loadingDetails ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : registrationDetails ? (
            <div className="space-y-6 py-4">
              {/* Dados do Inscrito */}
              <div className="space-y-3">
                <h3 className="text-lg font-semibold border-b pb-2">Dados do Inscrito</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm text-muted-foreground">Nome Completo</Label>
                    <p className="font-medium">{registrationDetails.runner_name || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">CPF</Label>
                    <p className="font-medium font-mono">{registrationDetails.runner_cpf ? formatCPF(registrationDetails.runner_cpf) : "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Email</Label>
                    <p className="font-medium">{registrationDetails.runner_email || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Telefone</Label>
                    <p className="font-medium">{registrationDetails.runner_phone || "N/A"}</p>
                  </div>
                  {registrationDetails.runner_birth_date && (
                    <div>
                      <Label className="text-sm text-muted-foreground">Data de Nascimento</Label>
                      <p className="font-medium">
                        {format(new Date(registrationDetails.runner_birth_date), "dd/MM/yyyy", { locale: ptBR })}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Dados da Inscrição */}
              <div className="space-y-3">
                <h3 className="text-lg font-semibold border-b pb-2">Dados da Inscrição</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm text-muted-foreground">Evento</Label>
                    <p className="font-medium">{registrationDetails.event_title || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Categoria</Label>
                    <p className="font-medium">
                      {registrationDetails.category_name || "N/A"}
                      {registrationDetails.category_distance && ` - ${registrationDetails.category_distance}`}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Tipo de Categoria</Label>
                    <p className="font-medium capitalize">{registrationDetails.category_type || "N/A"}</p>
                  </div>
                  {registrationDetails.modality_names && registrationDetails.modality_names.length > 0 && (
                    <div>
                      <Label className="text-sm text-muted-foreground">Modalidade(s)</Label>
                      <p className="font-medium">{registrationDetails.modality_names.join(', ')}</p>
                    </div>
                  )}
                  <div>
                    <Label className="text-sm text-muted-foreground">Kit</Label>
                    <p className="font-medium">{registrationDetails.kit_name || "Sem kit"}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Valor Total</Label>
                    <p className="font-medium text-lg">
                      {formatCurrency(
                        (registrationDetails.total_amount || 0) > 0
                          ? calculateValueWithoutFee(
                              parseFloat(String(registrationDetails.total_amount || 0)),
                              platformFee,
                              platformFeeType
                            )
                          : parseFloat(String(registrationDetails.total_amount || 0))
                      )}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Status</Label>
                    <div className="mt-1">{getStatusBadge(registrationDetails.status || "pending")}</div>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Status do Pagamento</Label>
                    <div className="mt-1">{getPaymentStatusBadge(registrationDetails.payment_status || "pending")}</div>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Data da Inscrição</Label>
                    <p className="font-medium">
                      {registrationDetails.created_at
                        ? format(new Date(registrationDetails.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                        : "N/A"}
                    </p>
                  </div>
                  {registrationDetails.confirmation_code && (
                    <div>
                      <Label className="text-sm text-muted-foreground">Código de Confirmação</Label>
                      <p className="font-medium font-mono">{registrationDetails.confirmation_code}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Produto e Variações Selecionadas */}
              {registrationDetails.product_selections && registrationDetails.product_selections.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold border-b pb-2">Produto e Variações Selecionadas</h3>
                  <div className="space-y-4">
                    {(() => {
                      // Group selections by product
                      const productGroups = new Map<string, {
                        product_id: string;
                        variant_id: string | null;
                        variant_name: string | null;
                        attributes: Array<{
                          attribute_name: string;
                          attribute_value: string;
                        }>;
                      }>();
                      
                      registrationDetails.product_selections.forEach((selection: any) => {
                        const key = selection.product_id;
                        if (!productGroups.has(key)) {
                          productGroups.set(key, {
                            product_id: selection.product_id,
                            variant_id: selection.variant_id,
                            variant_name: selection.variant_name,
                            attributes: [],
                          });
                        }
                        productGroups.get(key)!.attributes.push({
                          attribute_name: selection.attribute_name,
                          attribute_value: selection.attribute_value,
                        });
                      });
                      
                      return Array.from(productGroups.entries()).map(([productId, productData]) => {
                        const productName = registrationDetails.product_selections.find(
                          (s: any) => s.product_id === productId
                        )?.product_name || 'Produto';
                        
                        return (
                          <div key={productId} className="border rounded-lg p-4 bg-muted/50">
                            <h4 className="font-semibold mb-3 text-base">{productName}</h4>
                            <div className="space-y-2">
                              {productData.attributes.map((attr, index) => (
                                <div key={index} className="flex items-center gap-2">
                                  <span className="text-sm text-muted-foreground min-w-[100px]">{attr.attribute_name}:</span>
                                  <span className="font-medium">{attr.attribute_value}</span>
                                </div>
                              ))}
                              {productData.variant_name && (
                                <div className="mt-3 pt-3 border-t">
                                  <span className="text-sm text-muted-foreground">Variação completa: </span>
                                  <span className="font-medium">{productData.variant_name}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              {/* Forma de Pagamento */}
              <div className="space-y-3">
                <h3 className="text-lg font-semibold border-b pb-2">Forma de Pagamento</h3>
                <div>
                  <Label className="text-sm text-muted-foreground">Método de Pagamento</Label>
                  <p className="font-medium">
                    {registrationDetails.payment_method === 'pix' ? 'PIX' :
                     registrationDetails.payment_method === 'credit_card' ? 'Cartão de Crédito' :
                     registrationDetails.payment_method === 'boleto' ? 'Boleto' :
                     registrationDetails.payment_status === 'convidado' ? 'Convite (Grátis)' :
                     'N/A'}
                  </p>
                </div>
              </div>

              {/* Cupom de Desconto */}
              {registrationDetails.coupon_code && (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold border-b pb-2">Cupom de Desconto</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm text-muted-foreground">Código do Cupom</Label>
                      <p className="font-medium font-mono">{registrationDetails.coupon_code}</p>
                    </div>
                    {registrationDetails.coupon_name && (
                      <div>
                        <Label className="text-sm text-muted-foreground">Nome do Cupom</Label>
                        <p className="font-medium">{registrationDetails.coupon_name}</p>
                      </div>
                    )}
                    {registrationDetails.coupon_type && registrationDetails.coupon_discount_value && (
                      <div>
                        <Label className="text-sm text-muted-foreground">Desconto</Label>
                        <p className="font-medium">
                          {registrationDetails.coupon_type === 'percentage' 
                            ? `${registrationDetails.coupon_discount_value}%`
                            : `R$ ${parseFloat(registrationDetails.coupon_discount_value).toFixed(2).replace('.', ',')}`}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Cupom de Líder */}
              {registrationDetails.coupon_leader_id && registrationDetails.leader_name && (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold border-b pb-2">Cupom de Líder</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm text-muted-foreground">Líder</Label>
                      <p className="font-medium">{registrationDetails.leader_name}</p>
                    </div>
                    {registrationDetails.leader_referral_code && (
                      <div>
                        <Label className="text-sm text-muted-foreground">Código de Referência</Label>
                        <p className="font-medium font-mono">{registrationDetails.leader_referral_code}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              Nenhum detalhe disponível
            </div>
          )}

          <DialogFooter>
            {registrationDetails && (
              <Button
                variant="outline"
                onClick={() => {
                  setIsDetailsDialogOpen(false);
                  navigate(`/registration/validate/${registrationDetails.id}`);
                }}
              >
                <Eye className="w-4 h-4 mr-2" />
                Visualizar Inscrição
              </Button>
            )}
            <Button variant="outline" onClick={() => setIsDetailsDialogOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrganizerRegistrations;
