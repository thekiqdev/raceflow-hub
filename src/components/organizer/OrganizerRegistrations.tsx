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
import { Plus, Search, MoreVertical, Eye, MessageSquare, FileDown, Loader2, Mail, ChevronDown, ChevronUp, Edit2, Save, X, Trash2, Link2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getRegistrations, exportRegistrations, createRegistrationByOrganizer, getRegistrationById, updateRegistration, completeRegistrationAttributes, removeRegistrationAttributes, attachRegistrationToCommission, getRegistrationCommission, detachCommission, type Registration, type RegistrationCommissionInfo } from "@/lib/api/registrations";
import { getPublicProfileByCpf, type Profile } from "@/lib/api/profiles";
import { maskCpf, maskPhone, unmask } from "@/lib/utils/masks";
import { validateCpf } from "@/lib/utils/validators";
import { getEventCommissionsByEvent, type EventCommissionOption } from "@/lib/api/leaderEventCommissions";
import { getEvents, type Event } from "@/lib/api/events";
import { getModalities, type Modality } from "@/lib/api/modalities";
import { getCategories, getCategoryById, type Category } from "@/lib/api/categories";
import { getEventKits, type EventKit, type KitProduct, type ProductVariant } from "@/lib/api/eventKits";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/useDebounce";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { getEnabledModules } from "@/lib/api/systemSettings";
import { calculateValueWithoutFee } from "@/lib/utils/feeCalculations";
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
  const [registerStep, setRegisterStep] = useState<1 | 2 | 3>(1);
  const [registerCpf, setRegisterCpf] = useState("");
  const [registerCpfLookupLoading, setRegisterCpfLookupLoading] = useState(false);
  const [athleteFound, setAthleteFound] = useState<boolean | null>(null);
  const [athleteData, setAthleteData] = useState<Profile | null>(null);
  const [runnerData, setRunnerData] = useState<{ full_name: string; birth_date: string; city: string; gender: string; team?: string; email?: string; phone?: string } | null>(null);
  const [athleteFormData, setAthleteFormData] = useState({ full_name: "", birth_date: "", city: "", gender: "", team: "", email: "", phone: "" });
  const [athleteFormErrors, setAthleteFormErrors] = useState<Record<string, string>>({});
  const [registerCpfError, setRegisterCpfError] = useState<string>("");
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [selectedModalityId, setSelectedModalityId] = useState<string>("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [selectedKitId, setSelectedKitId] = useState<string>("");
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
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
  const [organizerEditAttributesEnabled, setOrganizerEditAttributesEnabled] = useState<boolean>(false);
  
  // Edit mode
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingStatus, setEditingStatus] = useState<string>("");
  const [editingPaymentStatus, setEditingPaymentStatus] = useState<string>("");
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
      loadRegistrations();
    }
  }, [user, debouncedSearch, statusFilter, paymentStatusFilter, eventFilter]);

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
        if (response.data.length === 1) {
          setSelectedModalityId(response.data[0].id);
        }
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
        if (response.data.length === 1) {
          setSelectedCategoryId(response.data[0].id);
        }
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
        if (response.data.length === 1) {
          setSelectedCategoryId(response.data[0].id);
        }
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
        if (response.data.length === 1) {
          setSelectedKitId(response.data[0].id);
          setExpandedKits((prev) => new Set(prev).add(response.data![0].id));
        }
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
    setRegisterStep(1);
    setRegisterCpf("");
    setRegisterCpfLookupLoading(false);
    setAthleteFound(null);
    setAthleteData(null);
    setRunnerData(null);
    setAthleteFormData({ full_name: "", birth_date: "", city: "", gender: "", team: "", email: "", phone: "" });
    setAthleteFormErrors({});
    setRegisterCpfError("");
    setSelectedEventId("");
    setSelectedModalityId("");
    setSelectedCategoryId("");
    setSelectedKitId("");
    setCustomFieldValues({});
    setExpandedKits(new Set());
    setSelectedProducts(new Map());
    setVariantSelections(new Map());
  };

  const handleCloseRegisterDialog = () => {
    setIsRegisterDialogOpen(false);
    setRegisterStep(1);
    setRegisterCpf("");
    setRegisterCpfLookupLoading(false);
    setAthleteFound(null);
    setAthleteData(null);
    setRunnerData(null);
    setAthleteFormData({ full_name: "", birth_date: "", city: "", gender: "", team: "", email: "", phone: "" });
    setAthleteFormErrors({});
    setRegisterCpfError("");
    setSelectedEventId("");
    setSelectedModalityId("");
    setSelectedCategoryId("");
    setSelectedKitId("");
    setCustomFieldValues({});
    setExpandedKits(new Set());
    setSelectedProducts(new Map());
    setVariantSelections(new Map());
  };

  const handleAthleteFormNext = () => {
    const err: Record<string, string> = {};
    if (!athleteFormData.full_name?.trim()) err.full_name = "Nome é obrigatório";
    if (athleteFormData.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(athleteFormData.email)) err.email = "Email inválido";
    setAthleteFormErrors(err);
    if (Object.keys(err).length > 0) return;
    setRunnerData({
      full_name: athleteFormData.full_name.trim(),
      birth_date: athleteFormData.birth_date?.trim() || undefined,
      city: athleteFormData.city?.trim() || undefined,
      gender: athleteFormData.gender || undefined,
      team: athleteFormData.team?.trim() || undefined,
      email: athleteFormData.email?.trim() || undefined,
      phone: athleteFormData.phone?.trim() ? unmask(athleteFormData.phone) : undefined,
    });
    setRegisterStep(3);
  };

  const handleCpfLookup = async () => {
    const cleanCpf = unmask(registerCpf);
    setRegisterCpfError("");
    if (cleanCpf.length !== 11) {
      toast.error("Informe um CPF com 11 dígitos");
      setRegisterCpfError("O CPF deve conter 11 dígitos.");
      return;
    }
    if (!validateCpf(registerCpf)) {
      toast.error("CPF inválido. Verifique os dígitos.");
      setRegisterCpfError("CPF inválido. Verifique os dígitos verificadores.");
      return;
    }
    setRegisterCpfLookupLoading(true);
    setAthleteFound(null);
    setAthleteData(null);
    try {
      const response = await getPublicProfileByCpf(registerCpf);
      if (response.success && response.data) {
        setAthleteFound(true);
        setAthleteData(response.data);
      } else {
        setAthleteFound(false);
        setAthleteData(null);
      }
    } catch {
      setAthleteFound(false);
      setAthleteData(null);
    } finally {
      setRegisterCpfLookupLoading(false);
    }
  };

  const handleRegisterAthlete = async () => {
    const cleanCpf = unmask(registerCpf);
    if (cleanCpf.length !== 11) {
      toast.error("CPF é obrigatório e deve ter 11 dígitos.");
      return;
    }
    if (!validateCpf(registerCpf)) {
      toast.error("CPF inválido. Verifique os dígitos.");
      return;
    }
    if (!selectedEventId || !selectedCategoryId) {
      toast.error("Selecione o evento e a categoria");
      return;
    }
    if (athleteFound === false && !runnerData) {
      toast.error("Preencha os dados do atleta no passo anterior (Nome completo, Sexo e Data de nascimento são obrigatórios).");
      return;
    }
    if (athleteFound === false && runnerData) {
      if (!runnerData.full_name?.trim()) {
        toast.error("Nome completo do atleta é obrigatório.");
        return;
      }
      if (!runnerData.birth_date) {
        toast.error("Data de nascimento do atleta é obrigatória.");
        return;
      }
      if (!runnerData.gender) {
        toast.error("Sexo do atleta é obrigatório.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
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
        cpf: cleanCpf,
        runner_data: runnerData || undefined,
        event_id: selectedEventId,
        category_id: selectedCategoryId,
        kit_id: selectedKitId || undefined,
        modality_id: selectedModalityId || undefined,
        product_selections: productSelections.length > 0 ? productSelections : undefined,
        custom_field_values: Object.keys(customFieldValues).length > 0 ? customFieldValues : undefined,
      });

      if (response.success) {
        toast.success("Atleta inscrito com sucesso!");
        handleCloseRegisterDialog();
        loadRegistrations();
      } else {
        toast.error(response.message || response.error || "Erro ao inscrever atleta");
      }
    } catch (error: any) {
      console.error("Error registering athlete:", error);
      toast.error(error?.message || error?.response?.data?.message || "Erro ao inscrever atleta");
    } finally {
      setIsSubmitting(false);
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
        setEditingStatus(response.data.status || "pending");
        setEditingPaymentStatus(response.data.payment_status || "pending");
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
    // Reset to original values
    if (registrationDetails) {
      setEditingStatus(registrationDetails.status || "pending");
      setEditingPaymentStatus(registrationDetails.payment_status || "pending");
    }
  };

  const handleSaveEdit = async () => {
    if (!registrationDetails) return;

    setSaving(true);

    try {
      // Update registration status, payment status and custom field values
      const updateData: any = {};
      if (editingStatus !== registrationDetails.status) {
        updateData.status = editingStatus;
      }
      if (editingPaymentStatus !== registrationDetails.payment_status) {
        updateData.payment_status = editingPaymentStatus;
      }
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
        setEditingStatus(response.data.status || "pending");
        setEditingPaymentStatus(response.data.payment_status || "pending");
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
        setEditingStatus(response.data.status || "pending");
        setEditingPaymentStatus(response.data.payment_status || "pending");
        
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

      {/* Register Athlete Dialog */}
      <Dialog open={isRegisterDialogOpen} onOpenChange={setIsRegisterDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Inscrever Atleta</DialogTitle>
            <DialogDescription>
              {registerStep === 1 && "Informe o CPF do atleta. Se já tiver cadastro, os dados serão preenchidos automaticamente."}
              {registerStep === 2 && "Preencha os dados do atleta para criar o cadastro."}
              {registerStep === 3 && "Selecione evento, modalidade, categoria e kit para concluir a inscrição."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Step 1: CPF */}
            {registerStep === 1 && (
              <>
            <div className="space-y-2">
                  <Label htmlFor="register-cpf">CPF do Atleta * (obrigatório)</Label>
                  <div className="flex gap-2">
              <Input
                      id="register-cpf"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="000.000.000-00"
                      value={registerCpf}
                      onChange={(e) => {
                        setRegisterCpf(maskCpf(e.target.value));
                        setAthleteFound(null);
                        setRegisterCpfError("");
                      }}
                      onKeyDown={(e) => e.key === "Enter" && handleCpfLookup()}
                      aria-invalid={!!registerCpfError}
                      aria-describedby={registerCpfError ? "register-cpf-error" : undefined}
                    />
                    <Button type="button" onClick={handleCpfLookup} disabled={registerCpfLookupLoading || unmask(registerCpf).length !== 11} aria-label="Buscar atleta por CPF">
                      {registerCpfLookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      <span className="ml-1">{registerCpfLookupLoading ? "Buscando..." : "Buscar"}</span>
                    </Button>
                  </div>
                  {registerCpfError && <p id="register-cpf-error" className="text-sm text-destructive" role="alert">{registerCpfError}</p>}
                </div>
                {athleteFound === true && athleteData && (
                  <p className="text-sm text-green-600 dark:text-green-400">
                    Atleta encontrado. Dados preenchidos abaixo. Clique em &quot;Próximo: Inscrição&quot; para continuar.
                  </p>
                )}
                {athleteFound === false && (
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    CPF não cadastrado. Preencha os dados do atleta no próximo passo.
                  </p>
                )}
              </>
            )}

            {/* Step 2: Dados do atleta (quando CPF não cadastrado) */}
            {registerStep === 2 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Os dados serão utilizados para inscrição no evento e criação de cadastro na plataforma.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="athlete-full_name">Nome completo * (obrigatório)</Label>
                  <Input
                    id="athlete-full_name"
                    placeholder="Nome do atleta"
                    value={athleteFormData.full_name}
                    onChange={(e) => {
                      setAthleteFormData((prev) => ({ ...prev, full_name: e.target.value }));
                      if (athleteFormErrors.full_name) setAthleteFormErrors((prev) => ({ ...prev, full_name: "" }));
                    }}
                  />
                  {athleteFormErrors.full_name && <p className="text-sm text-destructive">{athleteFormErrors.full_name}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="athlete-birth_date">Data de nascimento * (obrigatório)</Label>
                  <Input
                    id="athlete-birth_date"
                    type="date"
                    value={athleteFormData.birth_date}
                    onChange={(e) => {
                      setAthleteFormData((prev) => ({ ...prev, birth_date: e.target.value }));
                      if (athleteFormErrors.birth_date) setAthleteFormErrors((prev) => ({ ...prev, birth_date: "" }));
                    }}
                  />
                  {athleteFormErrors.birth_date && <p className="text-sm text-destructive">{athleteFormErrors.birth_date}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="athlete-city">Cidade *</Label>
                  <Input
                    id="athlete-city"
                    placeholder="Cidade"
                    value={athleteFormData.city}
                    onChange={(e) => {
                      setAthleteFormData((prev) => ({ ...prev, city: e.target.value }));
                      if (athleteFormErrors.city) setAthleteFormErrors((prev) => ({ ...prev, city: "" }));
                    }}
                  />
                  {athleteFormErrors.city && <p className="text-sm text-destructive">{athleteFormErrors.city}</p>}
                </div>
                <div className="space-y-2" role="group" aria-labelledby="athlete-gender-label">
                  <Label id="athlete-gender-label">Sexo * (obrigatório)</Label>
                  <RadioGroup
                    value={athleteFormData.gender}
                    onValueChange={(value) => {
                      setAthleteFormData((prev) => ({ ...prev, gender: value }));
                      if (athleteFormErrors.gender) setAthleteFormErrors((prev) => ({ ...prev, gender: "" }));
                    }}
                    className="flex gap-6"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="M" id="athlete-gender-m" />
                      <Label htmlFor="athlete-gender-m" className="cursor-pointer font-normal">Masculino</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="F" id="athlete-gender-f" />
                      <Label htmlFor="athlete-gender-f" className="cursor-pointer font-normal">Feminino</Label>
                    </div>
                  </RadioGroup>
                  {athleteFormErrors.gender && <p className="text-sm text-destructive">{athleteFormErrors.gender}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="athlete-team">Equipe (opcional)</Label>
                  <Input
                    id="athlete-team"
                    placeholder="Nome da equipe"
                    value={athleteFormData.team}
                    onChange={(e) => setAthleteFormData((prev) => ({ ...prev, team: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="athlete-email">Email (opcional)</Label>
                    <Input
                      id="athlete-email"
                type="email"
                      placeholder="email@exemplo.com"
                      value={athleteFormData.email}
                      onChange={(e) => {
                        setAthleteFormData((prev) => ({ ...prev, email: e.target.value }));
                        if (athleteFormErrors.email) setAthleteFormErrors((prev) => ({ ...prev, email: "" }));
                      }}
                    />
                    {athleteFormErrors.email && <p className="text-sm text-destructive">{athleteFormErrors.email}</p>}
            </div>
                  <div className="space-y-2">
                    <Label htmlFor="athlete-phone">Telefone (opcional)</Label>
                    <Input
                      id="athlete-phone"
                      placeholder="(00) 00000-0000"
                      value={athleteFormData.phone}
                      onChange={(e) => setAthleteFormData((prev) => ({ ...prev, phone: maskPhone(e.target.value) }))}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Event, modality, category, kit */}
            {registerStep === 3 && (
              <>
            {/* Resumo do atleta */}
            {(athleteData || runnerData) && (
              <div className="rounded-lg border bg-muted/50 p-3 text-sm">
                <p className="font-medium text-muted-foreground mb-1">Inscrição para:</p>
                <p className="font-medium">
                  {(athleteData?.full_name ?? runnerData?.full_name) || "—"}
                  {registerCpf && (
                    <span className="text-muted-foreground font-normal"> · CPF {formatCPF(unmask(registerCpf))}</span>
                  )}
                </p>
                <p className="text-muted-foreground mt-0.5">
                  {(() => {
                    const birth = athleteData?.birth_date || runnerData?.birth_date;
                    return birth ? <span>Nasc. {format(new Date(birth), "dd/MM/yyyy", { locale: ptBR })}</span> : null;
                  })()}
                  {(athleteData?.city ?? runnerData?.city) && (
                    <span> · {(athleteData?.city ?? runnerData?.city)}</span>
                  )}
                  {(athleteData?.gender || runnerData?.gender) && (
                    <span> · {(athleteData?.gender === "M" || runnerData?.gender === "M" ? "Masculino" : athleteData?.gender === "F" || runnerData?.gender === "F" ? "Feminino" : athleteData?.gender || runnerData?.gender)}</span>
                  )}
                  {(athleteData?.team ?? runnerData?.team) && (
                    <span> · Equipe: {athleteData?.team ?? runnerData?.team}</span>
                  )}
                </p>
              </div>
            )}

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
                  onValueChange={(v) => {
                    setSelectedCategoryId(v);
                    setCustomFieldValues({});
                  }}
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

            {/* Campos personalizados da categoria */}
            {selectedCategoryId && (() => {
              const selectedCat = categories.find((c) => c.id === selectedCategoryId);
              const customFields = selectedCat?.custom_fields ?? [];
              if (customFields.length === 0) return null;
              return (
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Campos extras</Label>
                  <div className="grid gap-2">
                    {customFields.map((f) => (
                      <div key={f.id} className="space-y-1.5">
                        <Label htmlFor={`org-custom-${f.id}`} className="text-xs text-muted-foreground">
                          {f.label}
                        </Label>
                        <Input
                          id={`org-custom-${f.id}`}
                          type={f.field_type === "number" ? "number" : "text"}
                          value={customFieldValues[f.id] ?? ""}
                          onChange={(e) =>
                            setCustomFieldValues((prev) => ({ ...prev, [f.id]: e.target.value }))
                          }
                          placeholder={f.field_type === "number" ? "0" : ""}
                          className="max-w-xs"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

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
              </>
            )}
          </div>

          <DialogFooter>
            {registerStep === 1 && (
              <>
                <Button variant="outline" onClick={handleCloseRegisterDialog}>
              Cancelar
            </Button>
                {athleteFound === true && (
                  <Button onClick={() => setRegisterStep(3)}>
                    Próximo: Inscrição
                  </Button>
                )}
                {athleteFound === false && (
                  <Button onClick={() => setRegisterStep(2)}>
                    Próximo: Dados do atleta
                  </Button>
                )}
              </>
            )}
            {registerStep === 2 && (
              <>
                <Button variant="outline" onClick={() => setRegisterStep(1)}>
                  Voltar
                </Button>
                <Button onClick={handleAthleteFormNext}>
                  Próximo: Inscrição
                </Button>
              </>
            )}
            {registerStep === 3 && (
              <>
                <Button variant="outline" onClick={() => setRegisterStep(athleteFound === false ? 2 : 1)} disabled={isSubmitting}>
                  Voltar
                </Button>
                <Button
                  onClick={handleRegisterAthlete}
                  disabled={isSubmitting || !selectedEventId || !selectedCategoryId || (athleteFound === false && !runnerData)}
                >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Inscrevendo...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                      Confirmar inscrição
                </>
              )}
            </Button>
              </>
            )}
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
                    {isEditMode ? (
                      <Select value={editingStatus} onValueChange={setEditingStatus}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pendente</SelectItem>
                          <SelectItem value="confirmed">Confirmado</SelectItem>
                          <SelectItem value="cancelled">Cancelado</SelectItem>
                          <SelectItem value="refund_requested">Reembolso Solicitado</SelectItem>
                          <SelectItem value="refunded">Reembolsado</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                    <div className="mt-1">{getStatusBadge(registrationDetails.status || "pending")}</div>
                    )}
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Status do Pagamento</Label>
                    {isEditMode ? (
                      <Select value={editingPaymentStatus} onValueChange={setEditingPaymentStatus}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pendente</SelectItem>
                          <SelectItem value="paid">Pago</SelectItem>
                          <SelectItem value="convidado">Convite</SelectItem>
                          <SelectItem value="partially_paid">Pago parcialmente</SelectItem>
                          <SelectItem value="refunded">Reembolsado</SelectItem>
                          <SelectItem value="failed">Falhou</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                    <div className="mt-1">{getPaymentStatusBadge(registrationDetails.payment_status || "pending")}</div>
                    )}
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
