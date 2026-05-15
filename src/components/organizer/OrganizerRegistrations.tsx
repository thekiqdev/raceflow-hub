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
import { Plus, Search, MoreVertical, Eye, MessageSquare, FileDown, Loader2, Mail, ChevronDown, ChevronUp, Edit2, Save, X, Trash2, Link2, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getRegistrations, exportRegistrations, getRegistrationById, updateRegistration, completeRegistrationAttributes, removeRegistrationAttributes, attachRegistrationToCommission, getRegistrationCommission, detachCommission, type Registration, type RegistrationCommissionInfo } from "@/lib/api/registrations";

const REGISTRATIONS_PAGE_SIZE = 20;
import { maskCpf, unmask } from "@/lib/utils/masks";
import { getEventCommissionsByEvent, type EventCommissionOption } from "@/lib/api/leaderEventCommissions";
import { getEvents, type Event } from "@/lib/api/events";
import { getCategoryById, type Category } from "@/lib/api/categories";
import { getEventKits, type EventKit, type KitProduct } from "@/lib/api/eventKits";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/useDebounce";
import { getEnabledModules } from "@/lib/api/systemSettings";
import { getCanonicalRegistrationDisplayValue } from "@/lib/utils/feeCalculations";
import { EventSelect } from "@/components/ui/event-select";
import { RegisterAthleteStaffDialog } from "@/components/registration/RegisterAthleteStaffDialog";
import { groupRegistrationProductSelections } from "@/lib/utils/groupRegistrationProductSelections";

const OrganizerRegistrations = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [summary, setSummary] = useState({
    total_registrations: 0,
    confirmed_payments: 0,
    pending_payments: 0,
    refunds: 0,
  });
  const [events, setEvents] = useState<Event[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");
  const [isExporting, setIsExporting] = useState(false);
  
  const [isRegisterDialogOpen, setIsRegisterDialogOpen] = useState(false);

  // Registration details dialog
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [selectedRegistration, setSelectedRegistration] = useState<Registration | null>(null);
  const [registrationDetails, setRegistrationDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [platformFee, setPlatformFee] = useState<number>(0);
  const [platformFeeType, setPlatformFeeType] = useState<'fixed' | 'percentage'>('fixed');
  const [organizerEditAttributesEnabled, setOrganizerEditAttributesEnabled] = useState<boolean>(false);
  
  // Edit mode
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingProductAttributes, setEditingProductAttributes] = useState<Record<string, Record<string, string>>>({});
  const [kitProducts, setKitProducts] = useState<KitProduct[]>([]);
  const [loadingKit, setLoadingKit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedCategoryForDetails, setSelectedCategoryForDetails] = useState<Category | null>(null);
  const [editingCustomFieldValues, setEditingCustomFieldValues] = useState<Record<string, string>>({});

  // Atrelar inscrição a comissão (cupom criado após a compra)
  const [isAttachCommissionDialogOpen, setIsAttachCommissionDialogOpen] = useState(false);
  const [registrationForAttach, setRegistrationForAttach] = useState<Registration | null>(null);
  const [eventCommissionsForAttach, setEventCommissionsForAttach] = useState<EventCommissionOption[]>([]);
  const [selectedCommissionIdForAttach, setSelectedCommissionIdForAttach] = useState<string>("");
  const [loadingAttachCommissions, setLoadingAttachCommissions] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [currentAttachCommission, setCurrentAttachCommission] = useState<RegistrationCommissionInfo | null>(null);
  const [detachingCommission, setDetachingCommission] = useState(false);

  const debouncedSearch = useDebounce(searchQuery, 500);

  useEffect(() => {
    if (user) {
      loadPlatformFeeSettings();
      loadEvents();
    }
  }, [user]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, paymentStatusFilter, eventFilter]);

  useEffect(() => {
    if (user) {
      loadRegistrations();
    }
  }, [user, page, debouncedSearch, statusFilter, paymentStatusFilter, eventFilter]);

  const loadPlatformFeeSettings = async () => {
    try {
      const response = await getEnabledModules();
      if (response.success && response.data) {
        setPlatformFee(response.data.platform_fee || 0);
        setPlatformFeeType(response.data.platform_fee_type || 'fixed');
        // Check if organizer edit attributes is enabled
        setOrganizerEditAttributesEnabled(
          response.data.enabled_modules?.organizer_edit_attributes || false
        );
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

      const response = await getRegistrations(filters, {
        page,
        limit: REGISTRATIONS_PAGE_SIZE,
      });

      if (response.success && response.data && "items" in response.data) {
        const d = response.data;
        setRegistrations(d.items);
        setTotalPages(d.total_pages);
        setSummary(d.summary);
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

  const handleViewDetails = async (registration: Registration) => {
    setSelectedRegistration(registration);
    setIsDetailsDialogOpen(true);
    setLoadingDetails(true);
    setIsEditMode(false);
    setEditingProductAttributes({});
    setKitProducts([]);
    
    try {
      const response = await getRegistrationById(registration.id);
      if (response.success && response.data) {
        setRegistrationDetails(response.data);
        setSelectedCategoryForDetails(null);
        if (response.data.category_id) {
          const catRes = await getCategoryById(response.data.category_id);
          if (catRes.success && catRes.data) setSelectedCategoryForDetails(catRes.data);
        }
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

  const handleOpenAttachCommission = async (registration: Registration) => {
    setRegistrationForAttach(registration);
    setSelectedCommissionIdForAttach("");
    setEventCommissionsForAttach([]);
    setCurrentAttachCommission(null);
    setIsAttachCommissionDialogOpen(true);
    setLoadingAttachCommissions(true);
    try {
      const [commissionsResponse, currentCommResponse] = await Promise.all([
        getEventCommissionsByEvent(registration.event_id, false),
        getRegistrationCommission(registration.id),
      ]);
      if (commissionsResponse.success && commissionsResponse.data) {
        const list = commissionsResponse.data || [];
        setEventCommissionsForAttach(list);
        // Não pré-selecionar: deixar o usuário escolher explicitamente (evita sempre mostrar o mesmo líder)
      } else {
        toast.error(commissionsResponse.error || "Erro ao carregar comissões");
      }
      if (currentCommResponse.success && currentCommResponse.data) {
        setCurrentAttachCommission(currentCommResponse.data);
      } else {
        setCurrentAttachCommission(null);
      }
    } catch (error: any) {
      console.error("Error loading attach commission data:", error);
      toast.error("Erro ao carregar dados");
      setCurrentAttachCommission(null);
    } finally {
      setLoadingAttachCommissions(false);
    }
  };

  const handleDetachCommission = async () => {
    if (!registrationForAttach) return;
    if (!confirm("Remover o atrelamento atual? O valor será descontado do total do líder. Depois você poderá escolher outra comissão.")) return;
    setDetachingCommission(true);
    try {
      const response = await detachCommission(registrationForAttach.id);
      if (response.success) {
        toast.success((response as any).message || "Atrelamento removido");
        setCurrentAttachCommission(null);
        loadRegistrations();
      } else {
        toast.error(response.message || response.error || "Erro ao remover atrelamento");
      }
    } catch (error: any) {
      console.error("Error detaching commission:", error);
      toast.error(error?.response?.data?.message || error.message || "Erro ao remover atrelamento");
    } finally {
      setDetachingCommission(false);
    }
  };

  const handleConfirmAttachCommission = async () => {
    if (!registrationForAttach || !selectedCommissionIdForAttach) return;
    setAttaching(true);
    try {
      const response = await attachRegistrationToCommission(registrationForAttach.id, {
        leader_event_commission_id: selectedCommissionIdForAttach,
      });
      if (response.success) {
        toast.success((response as any).message || "Inscrição atrelada à comissão com sucesso");
        setIsAttachCommissionDialogOpen(false);
        setRegistrationForAttach(null);
        setSelectedCommissionIdForAttach("");
        setEventCommissionsForAttach([]);
        loadRegistrations();
      } else {
        toast.error(response.message || response.error || "Erro ao atrelar comissão");
      }
    } catch (error: any) {
      console.error("Error attaching commission:", error);
      toast.error(error?.response?.data?.message || error.message || "Erro ao atrelar comissão");
    } finally {
      setAttaching(false);
    }
  };

  const handleEditClick = async () => {
    if (!registrationDetails?.kit_id) {
      toast.error("Esta inscrição não possui kit para editar atributos");
      setIsEditMode(true);
      return;
    }

    setIsEditMode(true);
    setEditingCustomFieldValues((registrationDetails.custom_field_values && typeof registrationDetails.custom_field_values === "object") ? { ...registrationDetails.custom_field_values } : {});
    setLoadingKit(true);

    try {
      // Load kit products with variants
      const kitsResponse = await getEventKits(registrationDetails.event_id);
      if (kitsResponse.success && kitsResponse.data) {
        const kit = kitsResponse.data.find((k) => k.id === registrationDetails.kit_id);
        if (kit && kit.products) {
          setKitProducts(kit.products);

          // Initialize editing attributes from existing selections
          const currentAttributes: Record<string, Record<string, string>> = {};
          if (registrationDetails.product_selections) {
            registrationDetails.product_selections.forEach((selection: any) => {
              if (!currentAttributes[selection.product_id]) {
                currentAttributes[selection.product_id] = {};
              }
              if (selection.attribute_name && selection.attribute_value) {
                currentAttributes[selection.product_id][selection.attribute_name] = selection.attribute_value;
              }
            });
          }
          setEditingProductAttributes(currentAttributes);
        }
      }
    } catch (error: any) {
      console.error("Error loading kit products:", error);
      toast.error("Erro ao carregar produtos do kit");
    } finally {
      setLoadingKit(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    setEditingProductAttributes({});
    setEditingCustomFieldValues({});
  };

  const handleSaveEdit = async () => {
    if (!registrationDetails) return;

    setSaving(true);

    try {
      // Status / pagamento: somente admin (via painel admin). Organizador: campos personalizados e demais regras do backend.
      const updateData: any = {};
      if (selectedCategoryForDetails?.custom_fields?.length) {
        updateData.custom_field_values = editingCustomFieldValues;
      } else if (selectedCategoryForDetails) {
        updateData.custom_field_values = {};
      }

      if (Object.keys(updateData).length > 0) {
        const updateResponse = await updateRegistration(registrationDetails.id, updateData);
        if (!updateResponse.success) {
          toast.error(updateResponse.error || "Erro ao atualizar inscrição");
          setSaving(false);
          return;
        }
      }

      // Update product attributes if kit exists and has variable products
      if (registrationDetails.kit_id && kitProducts.length > 0) {
        const variableProducts = kitProducts.filter((p) => p.type === "variable" && p.variant_attributes && p.variant_attributes.length > 0);
        
        if (variableProducts.length > 0) {
          const productSelections = variableProducts
            .map((product) => {
              const attributes = editingProductAttributes[product.id] || {};
              
              // Only include products that have at least one attribute selected
              const hasAttributes = Object.keys(attributes).length > 0 && 
                Object.values(attributes).some((val) => val && val.trim() !== "");
              
              if (!hasAttributes) {
                return null; // Skip products without attributes
              }
              
              // Find matching variant if all attributes are selected
              let variantId: string | undefined;
              if (product.variants && product.variant_attributes) {
                const selectedValues = product.variant_attributes.map((attr) => attributes[attr] || "").filter(Boolean);
                if (selectedValues.length === product.variant_attributes.length) {
                  const variant = product.variants.find((v) => {
                    const variantValues = v.name.split(" - ").map((v) => v.trim());
                    return product.variant_attributes!.every((attr, idx) => variantValues[idx] === attributes[attr]);
                  });
                  if (variant) {
                    variantId = variant.id;
                  }
                }
              }

              return {
                product_id: product.id,
                variant_id: variantId,
                attribute_selections: attributes,
              };
            })
            .filter((selection) => selection !== null) as Array<{
              product_id: string;
              variant_id?: string;
              attribute_selections: Record<string, string>;
            }>;

          // Only update if there are products with attributes selected
          if (productSelections.length > 0) {
            const attributesResponse = await completeRegistrationAttributes(
              registrationDetails.id,
              {
                product_selections: productSelections,
              }
            );
            if (!attributesResponse.success) {
              toast.error(attributesResponse.error || "Erro ao atualizar atributos");
              setSaving(false);
              return;
            }
          }
        }
      }

      toast.success("Inscrição atualizada com sucesso!");
      
      // Reload registration details
      const response = await getRegistrationById(registrationDetails.id);
      if (response.success && response.data) {
        setRegistrationDetails(response.data);
        if (response.data.category_id) {
          const catRes = await getCategoryById(response.data.category_id);
          if (catRes.success && catRes.data) setSelectedCategoryForDetails(catRes.data);
        } else {
          setSelectedCategoryForDetails(null);
        }
      }

      // Reload registrations list
      loadRegistrations();

      setIsEditMode(false);
    } catch (error: any) {
      console.error("Error saving registration:", error);
      toast.error(error.message || "Erro ao salvar alterações");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAttributes = async (productId?: string) => {
    if (!registrationDetails) return;

    const confirmMessage = productId
      ? "Deseja remover os atributos selecionados deste produto? O corredor receberá uma notificação para selecionar novamente."
      : "Deseja remover todos os atributos selecionados? O corredor receberá uma notificação para selecionar novamente.";

    if (!confirm(confirmMessage)) {
      return;
    }

    setSaving(true);

    try {
      const removeResponse = await removeRegistrationAttributes(
        registrationDetails.id,
        productId ? { product_ids: [productId] } : undefined
      );

      if (!removeResponse.success) {
        toast.error(removeResponse.error || "Erro ao remover atributos");
        setSaving(false);
        return;
      }

      toast.success("Atributos removidos com sucesso! O corredor receberá uma notificação.");

      // Reload registration details
      const response = await getRegistrationById(registrationDetails.id);
      if (response.success && response.data) {
        setRegistrationDetails(response.data);
        // Reset editing attributes if in edit mode
        if (isEditMode && registrationDetails.kit_id) {
          const currentAttributes: Record<string, Record<string, string>> = {};
          if (response.data.product_selections) {
            response.data.product_selections.forEach((selection: any) => {
              if (!currentAttributes[selection.product_id]) {
                currentAttributes[selection.product_id] = {};
              }
              if (selection.attribute_name && selection.attribute_value) {
                currentAttributes[selection.product_id][selection.attribute_name] = selection.attribute_value;
              }
            });
          }
          setEditingProductAttributes(currentAttributes);
        }
      }

      // Reload registrations list
      loadRegistrations();
    } catch (error: any) {
      console.error("Error removing attributes:", error);
      toast.error(error.message || "Erro ao remover atributos");
    } finally {
      setSaving(false);
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
      case "partially_paid":
        return <Badge variant="default" className="bg-amber-500">Pago parcialmente</Badge>;
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
            <div className="text-2xl font-bold">{summary.total_registrations}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pagamentos Confirmados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {summary.confirmed_payments}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {summary.pending_payments}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Reembolsos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {summary.refunds}
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
              <Button onClick={() => setIsRegisterDialogOpen(true)}>
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
                            getCanonicalRegistrationDisplayValue(
                              registration,
                              platformFee,
                              platformFeeType
                            )
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
                              {registration.payment_status === "paid" && (
                                <DropdownMenuItem onClick={() => handleOpenAttachCommission(registration)}>
                                  <Link2 className="mr-2 h-4 w-4" />
                                  Atrelar a comissão
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem>
                                <MessageSquare className="mr-2 h-4 w-4" />
                                Enviar Mensagem
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
          {!loading && totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t mt-4">
              <p className="text-sm text-muted-foreground">
                Página {page} de {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Página anterior"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="Próxima página"
                >
                  Próxima
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Atrelar inscrição a comissão (cupom criado após a compra) - só cupons de líderes do evento da compra */}
      <Dialog open={isAttachCommissionDialogOpen} onOpenChange={setIsAttachCommissionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Atrelar inscrição a comissão</DialogTitle>
            <DialogDescription>
              Escolha a comissão por evento à qual esta inscrição (já paga) será atrelada. Só aparecem cupons de líderes atrelados a este evento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {loadingAttachCommissions ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : eventCommissionsForAttach.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma comissão por evento para este evento. Crie uma em Líderes de grupo → comissões por evento.
              </p>
            ) : (
              <>
                {registrationForAttach?.event_title && (
                  <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Evento da compra: </span>
                    <span className="font-medium">{registrationForAttach.event_title}</span>
                  </div>
                )}
                {currentAttachCommission && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 space-y-2 text-sm">
                    <div className="font-medium text-foreground">Inscrição já atrelada a</div>
                    <div><span className="text-muted-foreground">Líder:</span> {currentAttachCommission.leader_name || currentAttachCommission.leader_referral_code || "—"}</div>
                    {(currentAttachCommission as any).bonus_type === "invitation" ? (
                      <div><span className="text-muted-foreground">Tipo:</span> Bônus de convite (sem valor em dinheiro)</div>
                    ) : (
                      <>
                        <div><span className="text-muted-foreground">Comissão:</span> {currentAttachCommission.commission_percentage}% • {formatCurrency(currentAttachCommission.commission_amount || 0)}</div>
                        <div><span className="text-muted-foreground">Status:</span> {currentAttachCommission.status === "paid" ? "Pago" : currentAttachCommission.status === "pending" ? "Pendente" : "Cancelado"}</div>
                      </>
                    )}
                    <Button variant="destructive" size="sm" onClick={handleDetachCommission} disabled={detachingCommission}>
                      {detachingCommission ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Remover atrelamento
                    </Button>
                    <p className="text-xs text-muted-foreground">Remova o atrelamento atual para escolher outra comissão.</p>
                  </div>
                )}
                <Label>Comissão por evento (líder • % • nome)</Label>
                <Select
                  value={selectedCommissionIdForAttach}
                  onValueChange={setSelectedCommissionIdForAttach}
                  disabled={!!currentAttachCommission}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma comissão" />
                  </SelectTrigger>
                  <SelectContent>
                    {eventCommissionsForAttach.map((ec) => (
                      <SelectItem key={ec.id} value={ec.id}>
                        <span className="font-medium">{ec.leader_name || ec.leader_referral_code}</span>
                        <span className="text-muted-foreground"> • {ec.commission_percentage}%</span>
                        {ec.name ? <span className="text-muted-foreground"> • {ec.name}</span> : null}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedCommissionIdForAttach && (() => {
                  const ec = eventCommissionsForAttach.find((c) => c.id === selectedCommissionIdForAttach);
                  if (!ec) return null;
                  const isInvitation = ec.bonus_type === "invitation";
                  const isBoth = ec.bonus_type === "both";
                  const reqPurchases = ec.required_purchases;
                  return (
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
                      <div className="font-medium text-foreground">Detalhes da comissão selecionada</div>
                      <div><span className="text-muted-foreground">Evento:</span> {ec.event_title || registrationForAttach?.event_title || "—"}</div>
                      <div><span className="text-muted-foreground">Líder:</span> {ec.leader_name || ec.leader_referral_code}</div>
                      {isInvitation ? (
                        <>
                          <div><span className="text-muted-foreground">Tipo:</span> Bônus de convite</div>
                          {reqPurchases != null && reqPurchases > 0 && (
                            <div><span className="text-muted-foreground">Inscrições pagas para ganhar 1 convite:</span> {reqPurchases}</div>
                          )}
                        </>
                      ) : isBoth ? (
                        <>
                          <div><span className="text-muted-foreground">Comissão:</span> {ec.commission_percentage}%</div>
                          <div><span className="text-muted-foreground">Bônus de convite:</span> sim{reqPurchases != null && reqPurchases > 0 ? ` (${reqPurchases} inscrições pagas para ganhar 1 convite)` : ""}</div>
                        </>
                      ) : (
                        <div><span className="text-muted-foreground">Comissão:</span> {ec.commission_percentage}%</div>
                      )}
                      {ec.name && <div><span className="text-muted-foreground">Nome:</span> {ec.name}</div>}
                    </div>
                  );
                })()}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAttachCommissionDialogOpen(false)} disabled={attaching}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmAttachCommission}
              disabled={!!currentAttachCommission || attaching || loadingAttachCommissions || eventCommissionsForAttach.length === 0 || !selectedCommissionIdForAttach}
            >
              {attaching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Atrelando...
                </>
              ) : (
                "Atrelar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RegisterAthleteStaffDialog
        mode="organizer"
        open={isRegisterDialogOpen}
        onOpenChange={setIsRegisterDialogOpen}
        events={events}
        onSuccess={loadRegistrations}
      />

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
                  {!isEditMode && selectedCategoryForDetails?.custom_fields?.length ? (
                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-sm text-muted-foreground">Campos personalizados</Label>
                      <div className="space-y-1.5">
                        {selectedCategoryForDetails.custom_fields
                          .sort((a, b) => a.display_order - b.display_order)
                          .map((f) => (
                            <div key={f.id}>
                              <span className="text-xs text-muted-foreground">{f.label}:</span>{" "}
                              <span className="font-medium">{registrationDetails.custom_field_values?.[f.id] ?? "—"}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  ) : null}
                  {isEditMode && selectedCategoryForDetails?.custom_fields?.length ? (
                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-sm text-muted-foreground">Campos personalizados</Label>
                      <div className="space-y-2">
                        {[...selectedCategoryForDetails.custom_fields]
                          .sort((a, b) => a.display_order - b.display_order)
                          .map((f) => (
                            <div key={f.id}>
                              <Label className="text-xs">{f.label}</Label>
                              <Input
                                type={f.field_type === "number" ? "number" : "text"}
                                className="mt-1"
                                value={editingCustomFieldValues[f.id] ?? ""}
                                onChange={(e) => setEditingCustomFieldValues((prev) => ({ ...prev, [f.id]: e.target.value }))}
                              />
                            </div>
                          ))}
                      </div>
                    </div>
                  ) : null}
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
                        getCanonicalRegistrationDisplayValue(
                          registrationDetails,
                          platformFee,
                          platformFeeType
                        )
                      )}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Status</Label>
                    <div className="mt-1">{getStatusBadge(registrationDetails.status || "pending")}</div>
                    {isEditMode && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Alteração de status e de pagamento é feita apenas pelo administrador.
                      </p>
                    )}
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

              {/* Produto e Variações Selecionadas - Edit Mode */}
              {isEditMode && registrationDetails.kit_id && (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold border-b pb-2">Editar Atributos dos Produtos</h3>
                  {loadingKit ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {kitProducts
                        .filter((p) => p.type === "variable" && p.variant_attributes && p.variant_attributes.length > 0)
                        .map((product) => {
                          const currentAttributes = editingProductAttributes[product.id] || {};
                          const attributeNames = product.variant_attributes || [];
                          const hasSelectedAttributes = Object.keys(currentAttributes).length > 0 && 
                            attributeNames.some((attr) => currentAttributes[attr]);

                          return (
                            <div key={product.id} className="border rounded-lg p-4 bg-muted/50">
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="font-semibold text-base">{product.name}</h4>
                                {hasSelectedAttributes && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleRemoveAttributes(product.id)}
                                    disabled={saving}
                                    className="text-destructive hover:text-destructive"
                                  >
                                    <Trash2 className="w-4 h-4 mr-1" />
                                    Remover Atributos
                                  </Button>
                                )}
                              </div>
                              <div className="space-y-3">
                                {attributeNames.map((attrName) => {
                                  // Get available values for this attribute from variants
                                  const availableValues = new Set<string>();
                                  if (product.variants) {
                                    product.variants.forEach((variant) => {
                                      const variantValues = variant.name.split(" - ").map((v) => v.trim());
                                      const attrIndex = attributeNames.indexOf(attrName);
                                      if (attrIndex >= 0 && attrIndex < variantValues.length) {
                                        availableValues.add(variantValues[attrIndex]);
                                      }
                                    });
                                  }

                                  return (
                                    <div key={attrName} className="space-y-1">
                                      <Label className="text-sm">{attrName}</Label>
                                      <Select
                                        value={currentAttributes[attrName] || ""}
                                        onValueChange={(value) => {
                                          setEditingProductAttributes((prev) => ({
                                            ...prev,
                                            [product.id]: {
                                              ...prev[product.id],
                                              [attrName]: value,
                                            },
                                          }));
                                        }}
                                      >
                                        <SelectTrigger>
                                          <SelectValue placeholder={`Selecione ${attrName}`} />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {Array.from(availableValues).map((value) => (
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
                            </div>
                          );
                        })}
                      {kitProducts.filter((p) => p.type === "variable" && p.variant_attributes && p.variant_attributes.length > 0).length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Nenhum produto com variações encontrado neste kit.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Produto e Variações Selecionadas - View Mode */}
              {!isEditMode && registrationDetails.product_selections && registrationDetails.product_selections.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h3 className="text-lg font-semibold">Produto e Variações Selecionadas</h3>
                    {organizerEditAttributesEnabled && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemoveAttributes()}
                        disabled={saving}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Remover Todos os Atributos
                      </Button>
                    )}
                  </div>
                  <div className="space-y-4">
                    {groupRegistrationProductSelections(registrationDetails.product_selections).map((g) => (
                      <div key={g.product_id} className="border rounded-lg p-4 bg-muted/50">
                        <h4 className="font-semibold mb-3 text-base">{g.product_name}</h4>
                        <div className="space-y-2">
                          {g.variation_labels.length > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground min-w-[100px]">Variação:</span>
                              <span className="font-medium">{g.variation_labels.join(" · ")}</span>
                            </div>
                          )}
                          {g.other_attributes.map((attr, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground min-w-[100px]">{attr.attribute_name}:</span>
                              <span className="font-medium">{attr.attribute_value}</span>
                            </div>
                          ))}
                          {g.variation_labels.length === 0 && g.other_attributes.length === 0 && (
                            <p className="text-sm text-muted-foreground">Sem detalhes adicionais.</p>
                          )}
                        </div>
                      </div>
                    ))}
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
                     registrationDetails.payment_method === 'free_bonus' ? 'Convite' :
                     registrationDetails.payment_status === 'convidado' ? 'Convite' :
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
            {registrationDetails && !isEditMode && (
              <>
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
                {organizerEditAttributesEnabled && (
                  <Button variant="default" onClick={handleEditClick}>
                    <Edit2 className="w-4 h-4 mr-2" />
                    Editar
                  </Button>
                )}
              </>
            )}
            {registrationDetails && isEditMode && (
              <>
                <Button variant="outline" onClick={handleCancelEdit} disabled={saving}>
                  <X className="w-4 h-4 mr-2" />
                  Cancelar
                </Button>
                <Button variant="default" onClick={handleSaveEdit} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Salvar
                    </>
                  )}
                </Button>
              </>
            )}
            {!isEditMode && (
            <Button variant="outline" onClick={() => setIsDetailsDialogOpen(false)}>
              Fechar
            </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrganizerRegistrations;
