import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Search, MoreVertical, Eye, FileDown, Loader2, Edit2, Save, X, Trash2, Link2, ChevronLeft, ChevronRight, Plus, ArrowRightLeft } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { getRegistrations, exportRegistrations, getRegistrationById, getRegistrationEditableKitContext, updateRegistration, previewRegistrationEdit, confirmDifferencePayment, completeRegistrationAttributes, removeRegistrationAttributes, attachRegistrationToCommission, getRegistrationCommission as getRegistrationCommissionForAttach, detachCommission, type Registration, type RegistrationCommissionInfo, type PreviewRegistrationEditResponse, type EditableKitIssue } from "@/lib/api/registrations";
import { getEventCommissionsByEvent, type EventCommissionOption } from "@/lib/api/leaderEventCommissions";
import { getRegistrationCommission, removeCommission, type LeaderCommissionRecord } from "@/lib/api/admin";
import { getEvents, type Event } from "@/lib/api/events";
import { getEventKits, type EventKit, type KitProduct } from "@/lib/api/eventKits";
import { getCategoriesByModality, getCategoryById, type Category } from "@/lib/api/categories";
import { getCategoryBatches } from "@/lib/api/categoryBatches";
import type { CategoryBatch } from "@/lib/api/categories";
import { getModalities, type Modality } from "@/lib/api/modalities";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/useDebounce";
import { getEnabledModules } from "@/lib/api/systemSettings";
import { TransferRegistrationAdminDialog, canAdminTransferRegistration } from "@/components/admin/TransferRegistrationAdminDialog";
import { calculateValueWithoutFee } from "@/lib/utils/feeCalculations";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EventSelect } from "@/components/ui/event-select";
import { RegisterAthleteStaffDialog } from "@/components/registration/RegisterAthleteStaffDialog";
import { groupRegistrationProductSelections } from "@/lib/utils/groupRegistrationProductSelections";
import { buildProductSelectionsForVariableKit } from "@/lib/utils/kitVariableProductSelectionUtils";
import { KitVariableProductSelectors } from "@/components/event-registrations/KitVariableProductSelectors";
import {
  ensureKitProductsForEdit,
  loadKitsForCategoryWithKitFallback,
} from "@/lib/utils/loadEventKitsWithKitFallback";

const AdminRegistrations = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");
  const [isExporting, setIsExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<30 | 50>(30);
  const [listTotal, setListTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [summary, setSummary] = useState({
    total_registrations: 0,
    confirmed_payments: 0,
    pending_payments: 0,
    refunds: 0,
  });

  // Registration details dialog
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [selectedRegistration, setSelectedRegistration] = useState<Registration | null>(null);
  const [registrationDetails, setRegistrationDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [platformFee, setPlatformFee] = useState<number>(0);
  const [platformFeeType, setPlatformFeeType] = useState<'fixed' | 'percentage'>('fixed');
  
  // Edit mode
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingStatus, setEditingStatus] = useState<string>("");
  const [editingPaymentStatus, setEditingPaymentStatus] = useState<string>("");
  /** Admin: PIX / cartão / boleto ao editar inscrição fora de convite */
  const [editingPaymentMethod, setEditingPaymentMethod] = useState<string>("pix");
  const [editingCategoryId, setEditingCategoryId] = useState<string>("");
  const [editingKitId, setEditingKitId] = useState<string>("");
  const [editingModalityId, setEditingModalityId] = useState<string>("");
  const [eventCategoriesList, setEventCategoriesList] = useState<Category[]>([]);
  const [eventKitsList, setEventKitsList] = useState<EventKit[]>([]);
  const [eventModalitiesList, setEventModalitiesList] = useState<Modality[]>([]);
  const [editingProductAttributes, setEditingProductAttributes] = useState<Record<string, Record<string, string>>>({});
  const [kitProducts, setKitProducts] = useState<KitProduct[]>([]);
  const [editableKitContextIssues, setEditableKitContextIssues] = useState<EditableKitIssue[]>([]);
  const [loadingKit, setLoadingKit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categoryBatchesList, setCategoryBatchesList] = useState<CategoryBatch[]>([]);
  const [editingBatchId, setEditingBatchId] = useState<string>("");
  const [previewData, setPreviewData] = useState<PreviewRegistrationEditResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [isConfirmDiffDialogOpen, setIsConfirmDiffDialogOpen] = useState(false);
  const [selectedCategoryForDetails, setSelectedCategoryForDetails] = useState<Category | null>(null);
  const [editingCustomFieldValues, setEditingCustomFieldValues] = useState<Record<string, string>>({});
  const [confirmingDiff, setConfirmingDiff] = useState(false);

  // Atrelar inscrição a comissão (admin)
  const [isAttachCommissionDialogOpen, setIsAttachCommissionDialogOpen] = useState(false);
  const [registrationForAttach, setRegistrationForAttach] = useState<Registration | null>(null);
  const [eventCommissionsForAttach, setEventCommissionsForAttach] = useState<EventCommissionOption[]>([]);
  const [selectedCommissionIdForAttach, setSelectedCommissionIdForAttach] = useState<string>("");
  const [loadingAttachCommissions, setLoadingAttachCommissions] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [currentAttachCommission, setCurrentAttachCommission] = useState<RegistrationCommissionInfo | null>(null);
  const [detachingCommission, setDetachingCommission] = useState(false);

  // Comissão da inscrição (detalhe) - para botão Remover comissão
  const [registrationCommission, setRegistrationCommission] = useState<LeaderCommissionRecord | null>(null);
  const [removingCommission, setRemovingCommission] = useState(false);
  const [isRegisterAthleteDialogOpen, setIsRegisterAthleteDialogOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [registrationToTransfer, setRegistrationToTransfer] = useState<Registration | null>(null);

  const debouncedSearch = useDebounce(searchQuery, 500);

  useEffect(() => {
    loadEvents();
    loadPlatformFeeSettings();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, paymentStatusFilter, eventFilter, pageSize]);

  useEffect(() => {
    loadRegistrations();
  }, [debouncedSearch, statusFilter, paymentStatusFilter, eventFilter, page, pageSize]);

  // Pré-visualização ao alterar categoria/kit/modalidade/lote (Etapa 8)
  useEffect(() => {
    if (!isEditMode || !registrationDetails?.id) {
      setPreviewData(null);
      return;
    }
    const categoryId = editingCategoryId || registrationDetails.category_id;
    if (!categoryId) {
      setPreviewData(null);
      return;
    }
    let cancelled = false;
    setLoadingPreview(true);
    previewRegistrationEdit(registrationDetails.id, {
      category_id: categoryId,
      kit_id: editingKitId || undefined,
      modality_id: editingModalityId || undefined,
      batch_id: editingBatchId || undefined,
    })
      .then((res) => {
        if (!cancelled && res.success && res.data) setPreviewData(res.data as PreviewRegistrationEditResponse);
        else if (!cancelled) setPreviewData(null);
      })
      .catch(() => {
        if (!cancelled) setPreviewData(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });
    return () => { cancelled = true; };
  }, [isEditMode, registrationDetails?.id, registrationDetails?.category_id, editingCategoryId, editingKitId, editingModalityId, editingBatchId]);

  const loadPlatformFeeSettings = async () => {
    try {
      const res = await getEnabledModules();
      if (res.success && res.data) {
        const pf = res.data.platform_fee;
        if (typeof pf === "number") {
          setPlatformFee(pf);
        }
        setPlatformFeeType(res.data.platform_fee_type ?? "fixed");
      }
    } catch (error) {
      console.error("Error loading platform fee settings:", error);
    }
  };

  const loadEvents = async () => {
    try {
      const response = await getEvents();
      if (response.success && response.data) {
        setEvents(response.data);
      }
    } catch (error) {
      console.error("Error loading events:", error);
    }
  };

  const loadRegistrations = async () => {
    try {
      setLoading(true);
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

      if (debouncedSearch) {
        filters.search = debouncedSearch;
      }

      const response = await getRegistrations(filters, { page, page_size: pageSize });

      if (response.success && response.data) {
        const d = response.data;
        setRegistrations(d.items);
        setListTotal(d.total);
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
    setRegistrationCommission(null);

    try {
      const response = await getRegistrationById(registration.id);
      if (response.success && response.data) {
        setRegistrationDetails(response.data);
        setEditingStatus(response.data.status || "pending");
        setEditingPaymentStatus(response.data.payment_status || "pending");
        const pm = response.data.payment_method;
        setEditingPaymentMethod(
          pm && ["pix", "credit_card", "boleto"].includes(pm) ? pm : "pix"
        );
        setSelectedCategoryForDetails(null);
        if (response.data.category_id) {
          const catRes = await getCategoryById(response.data.category_id);
          if (catRes.success && catRes.data) setSelectedCategoryForDetails(catRes.data);
        }
      } else {
        toast.error(response.error || "Erro ao carregar detalhes");
      }
      const commResponse = await getRegistrationCommission(registration.id);
      if (commResponse.success && commResponse.data) {
        setRegistrationCommission(commResponse.data);
      } else {
        setRegistrationCommission(null);
      }
    } catch (error: any) {
      console.error("Error loading registration details:", error);
      toast.error("Erro ao carregar detalhes da inscrição");
      setRegistrationCommission(null);
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
        getEventCommissionsByEvent(registration.event_id, true),
        getRegistrationCommissionForAttach(registration.id),
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

  const handleDetachCommissionInAttachPopup = async () => {
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
        toast.success("Inscrição atrelada à comissão com sucesso");
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

  const handleRemoveCommission = async () => {
    if (!registrationCommission || !selectedRegistration) return;
    const isInvitationOnly = (registrationCommission as any).bonus_type === "invitation" || !registrationCommission.id;
    const message = isInvitationOnly
      ? "Remover o atrelamento ao bônus de convite? O líder terá os convites recalculados."
      : "Tem certeza que deseja remover esta comissão? O valor será descontado do total do líder.";
    if (!confirm(message)) return;
    setRemovingCommission(true);
    try {
      const response = isInvitationOnly
        ? await detachCommission(selectedRegistration.id)
        : await removeCommission(registrationCommission.id);
      if (response.success) {
        toast.success((response as any).message || "Comissão removida com sucesso");
        setRegistrationCommission(null);
        if (registrationDetails?.coupon_code) {
          const refetch = await getRegistrationById(selectedRegistration.id);
          if (refetch.success && refetch.data) setRegistrationDetails(refetch.data);
        }
      } else {
        toast.error((response as any).message || (response as any).error || "Erro ao remover comissão");
      }
    } catch (error: any) {
      console.error("Error removing commission:", error);
      toast.error(error?.response?.data?.message || error.message || "Erro ao remover comissão");
    } finally {
      setRemovingCommission(false);
    }
  };

  const handleEditClick = async () => {
    if (!registrationDetails) return;

    setIsEditMode(true);
    const pm0 = registrationDetails.payment_method;
    setEditingPaymentMethod(
      pm0 && ["pix", "credit_card", "boleto"].includes(pm0) ? pm0 : "pix"
    );
    setEditingModalityId(registrationDetails.modality_id || "");
    setEditingCategoryId(registrationDetails.category_id || "");
    setEditingKitId(registrationDetails.kit_id || "");
    setEditingBatchId((registrationDetails as any).category_batch_id || "");
    setEditingCustomFieldValues((registrationDetails.custom_field_values && typeof registrationDetails.custom_field_values === "object") ? { ...registrationDetails.custom_field_values } : {});
    setPreviewData(null);
    setLoadingKit(true);

    try {
      const modalitiesResponse = await getModalities(registrationDetails.event_id);
      if (modalitiesResponse.success && modalitiesResponse.data) {
        setEventModalitiesList(modalitiesResponse.data);
      } else {
        setEventModalitiesList([]);
      }

      // Carregar categorias pela modalidade (se já tiver modalidade na inscrição)
      if (registrationDetails.modality_id) {
        const categoriesResponse = await getCategoriesByModality(registrationDetails.modality_id);
        if (categoriesResponse.success && categoriesResponse.data) {
          setEventCategoriesList(categoriesResponse.data);
        } else {
          setEventCategoriesList([]);
        }
      } else {
        setEventCategoriesList([]);
      }

      const [fallback, ctxRes] = await Promise.all([
        loadKitsForCategoryWithKitFallback({
          eventId: registrationDetails.event_id,
          categoryId: registrationDetails.category_id || undefined,
          registrationKitId: registrationDetails.kit_id,
        }),
        getRegistrationEditableKitContext(registrationDetails.id),
      ]);

      setEventKitsList(fallback.kitsForDropdown);

      const ctx = ctxRes.success ? ctxRes.data : null;
      setEditableKitContextIssues(ctx?.issues ?? []);

      const productsForEditor =
        ctx?.products && ctx.products.length > 0 ? ctx.products : fallback.kitProducts;

      if (productsForEditor.length > 0) {
        setKitProducts(productsForEditor);
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
      } else {
        setKitProducts([]);
        setEditingProductAttributes({});
      }

      if (registrationDetails.category_id) {
        try {
          const batchesRes = await getCategoryBatches(registrationDetails.category_id);
          if (batchesRes.data) setCategoryBatchesList(Array.isArray(batchesRes.data) ? batchesRes.data : []);
          else setCategoryBatchesList([]);
        } catch {
          setCategoryBatchesList([]);
        }
      } else {
        setCategoryBatchesList([]);
      }
    } catch (error: any) {
      console.error("Error loading modalities/categories/kits:", error);
      toast.error("Erro ao carregar dados para edição");
    } finally {
      setLoadingKit(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    setEditingProductAttributes({});
    setEditableKitContextIssues([]);
    setEditingCategoryId("");
    setEditingKitId("");
    setEditingModalityId("");
    setEditingBatchId("");
    setEditingCustomFieldValues({});
    setEventCategoriesList([]);
    setEventKitsList([]);
    setEventModalitiesList([]);
    setCategoryBatchesList([]);
    setPreviewData(null);
    if (registrationDetails) {
      setEditingStatus(registrationDetails.status || "pending");
      setEditingPaymentStatus(registrationDetails.payment_status || "pending");
      const pm = registrationDetails.payment_method;
      setEditingPaymentMethod(
        pm && ["pix", "credit_card", "boleto"].includes(pm) ? pm : "pix"
      );
    }
  };

  const handleEditingModalityChange = async (newModalityId: string) => {
    setEditingModalityId(newModalityId);
    setEditingCategoryId("");
    setEditingKitId("");
    setEditingBatchId("");
    setEventKitsList([]);
    setKitProducts([]);
    setEditingProductAttributes({});
    if (!newModalityId) {
      setEventCategoriesList([]);
      setCategoryBatchesList([]);
      return;
    }
    setLoadingKit(true);
    try {
      const categoriesResponse = await getCategoriesByModality(newModalityId);
      if (categoriesResponse.success && categoriesResponse.data) {
        setEventCategoriesList(categoriesResponse.data);
        const categories = categoriesResponse.data;
        const currentCategoryId = registrationDetails?.category_id;
        const currentKitId = registrationDetails?.kit_id;
        const currentBatchId = (registrationDetails as any)?.category_batch_id;
        const categoryExists = currentCategoryId && categories.some((c: Category) => c.id === currentCategoryId);
        if (categoryExists && currentCategoryId) {
          setEditingCategoryId(currentCategoryId);
          const kitsRes = await getEventKits(registrationDetails!.event_id, {
            categoryId: currentCategoryId,
            context: 'management',
          });
          if (kitsRes.success && kitsRes.data) {
            setEventKitsList(kitsRes.data);
            const kitExists = currentKitId && kitsRes.data.some((k: EventKit) => k.id === currentKitId);
            if (kitExists && currentKitId) {
              setEditingKitId(currentKitId);
              const kit = kitsRes.data.find((k: EventKit) => k.id === currentKitId);
              let productList = kit?.products?.length ? kit.products : [];
              if (productList.length === 0 && registrationDetails?.event_id) {
                productList = await ensureKitProductsForEdit(
                  registrationDetails.event_id,
                  currentKitId,
                  kit
                );
              }
              if (productList.length > 0) {
                setKitProducts(productList);
                const attrs: Record<string, Record<string, string>> = {};
                if (registrationDetails?.product_selections?.length) {
                  registrationDetails.product_selections.forEach((selection: any) => {
                    if (!attrs[selection.product_id]) attrs[selection.product_id] = {};
                    if (selection.attribute_name && selection.attribute_value) attrs[selection.product_id][selection.attribute_name] = selection.attribute_value;
                  });
                }
                setEditingProductAttributes(attrs);
              }
            }
          }
          const batchesRes = await getCategoryBatches(currentCategoryId);
          if (batchesRes.data && Array.isArray(batchesRes.data)) {
            setCategoryBatchesList(batchesRes.data);
            const batchExists = currentBatchId && batchesRes.data.some((b: CategoryBatch) => b.id === currentBatchId);
            if (batchExists) setEditingBatchId(currentBatchId);
          } else setCategoryBatchesList([]);
        } else if (categories.length === 1) {
          setEditingCategoryId(categories[0].id);
          const kitsRes = await getEventKits(registrationDetails!.event_id, {
            categoryId: categories[0].id,
            context: 'management',
          });
          if (kitsRes.success && kitsRes.data) setEventKitsList(kitsRes.data);
          const batchesRes = await getCategoryBatches(categories[0].id);
          setCategoryBatchesList(Array.isArray(batchesRes?.data) ? batchesRes.data : []);
        } else {
          setCategoryBatchesList([]);
        }
      } else {
        setEventCategoriesList([]);
        setCategoryBatchesList([]);
      }
    } catch (error: any) {
      console.error("Error loading categories for modality:", error);
      setEventCategoriesList([]);
      setCategoryBatchesList([]);
    } finally {
      setLoadingKit(false);
    }
  };

  const handleEditingCategoryChange = async (newCategoryId: string) => {
    setEditingCategoryId(newCategoryId);
    setEditingKitId("");
    setEditingBatchId("");
    setEditingCustomFieldValues({});
    setKitProducts([]);
    if (!registrationDetails?.event_id) return;
    const currentKitId = registrationDetails.kit_id;
    const currentBatchId = (registrationDetails as any)?.category_batch_id;
    const currentAttrs = { ...editingProductAttributes };
    setLoadingKit(true);
    try {
      const kitsResponse = await getEventKits(registrationDetails.event_id, {
        categoryId: newCategoryId || undefined,
        context: 'management',
      });
      if (kitsResponse.success && kitsResponse.data) {
        setEventKitsList(kitsResponse.data);
        const kits = kitsResponse.data;
        const kitExists = currentKitId && kits.some((k: EventKit) => k.id === currentKitId);
        if (kitExists && currentKitId) {
          setEditingKitId(currentKitId);
          const kit = kits.find((k: EventKit) => k.id === currentKitId);
          let productList = kit?.products?.length ? kit.products : [];
          if (productList.length === 0) {
            productList = await ensureKitProductsForEdit(
              registrationDetails.event_id,
              currentKitId,
              kit
            );
          }
          if (productList.length > 0) {
            setKitProducts(productList);
            setEditingProductAttributes(currentAttrs);
          } else {
            setEditingProductAttributes({});
          }
        } else {
          setEditingProductAttributes({});
          if (kits.length === 1) {
            setEditingKitId(kits[0].id);
            if (kits[0].products?.length) setKitProducts(kits[0].products);
          }
        }
      } else {
        setEventKitsList([]);
      }
      if (newCategoryId) {
        const batchesRes = await getCategoryBatches(newCategoryId);
        const batches = Array.isArray(batchesRes?.data) ? batchesRes.data : [];
        setCategoryBatchesList(batches);
        const batchExists = currentBatchId && batches.some((b: CategoryBatch) => b.id === currentBatchId);
        if (batchExists) setEditingBatchId(currentBatchId);
      } else {
        setCategoryBatchesList([]);
      }
    } catch (error: any) {
      console.error("Error loading kits for category:", error);
      setEventKitsList([]);
      setCategoryBatchesList([]);
    } finally {
      setLoadingKit(false);
    }
  };

  const handleEditingKitChange = async (newKitId: string) => {
    setEditingKitId(newKitId);
    if (!newKitId) {
      setKitProducts([]);
      setEditingProductAttributes({});
      return;
    }
    if (!registrationDetails?.event_id) {
      setKitProducts([]);
      setEditingProductAttributes({});
      return;
    }
    const kit = eventKitsList.find((k) => k.id === newKitId);
    let productList = kit?.products?.length ? kit.products : [];
    if (productList.length === 0) {
      productList = await ensureKitProductsForEdit(registrationDetails.event_id, newKitId, kit);
    }
    if (productList.length > 0) {
      setKitProducts(productList);
      setEditingProductAttributes({});
    } else {
      setKitProducts([]);
      setEditingProductAttributes({});
    }
  };

  const handleSaveEdit = async () => {
    if (!registrationDetails) return;

    setSaving(true);

    try {
      // Update registration status, payment status, category and kit
      const updateData: any = {};
      if (editingStatus !== registrationDetails.status) {
        updateData.status = editingStatus;
      }
      if (editingPaymentStatus !== registrationDetails.payment_status) {
        updateData.payment_status = editingPaymentStatus;
      }
      if (editingPaymentStatus !== "convidado") {
        const leavingConvite =
          registrationDetails.payment_status === "convidado" &&
          editingPaymentStatus !== "convidado";
        const methodChanged =
          editingPaymentMethod !== (registrationDetails.payment_method || "");
        if (leavingConvite || methodChanged) {
          updateData.payment_method = editingPaymentMethod as "pix" | "credit_card" | "boleto";
        }
      }
      if (editingCategoryId && editingCategoryId !== registrationDetails.category_id) {
        updateData.category_id = editingCategoryId;
      }
      if (editingKitId !== (registrationDetails.kit_id || "")) {
        updateData.kit_id = editingKitId || null;
      }
      if (editingModalityId !== (registrationDetails.modality_id || "")) {
        updateData.modality_id = editingModalityId || null;
      }
      if (editingBatchId !== ((registrationDetails as any).category_batch_id || "")) {
        updateData.batch_id = editingBatchId || null;
      }

      const effectiveCategory = eventCategoriesList.find((c) => c.id === (editingCategoryId || registrationDetails.category_id));
      if (effectiveCategory) {
        updateData.custom_field_values = effectiveCategory.custom_fields?.length ? editingCustomFieldValues : {};
      }

      let productSelectionsForVariableKit: Array<{
        product_id: string;
        variant_id?: string;
        attribute_selections: Record<string, string>;
      }> | null = null;

      if (editingKitId && kitProducts.length > 0) {
        const built = buildProductSelectionsForVariableKit(kitProducts, editingProductAttributes, {
          requireAll: false,
        });
        if (built.length > 0) productSelectionsForVariableKit = built;
      }

      const categoryOrKitChanging =
        (!!updateData.category_id && updateData.category_id !== registrationDetails.category_id) ||
        (updateData.kit_id !== undefined &&
          (updateData.kit_id || null) !== (registrationDetails.kit_id || null));

      if (categoryOrKitChanging && productSelectionsForVariableKit?.length) {
        updateData.product_selections = productSelectionsForVariableKit;
      }

      let updateResponse: {
        success: boolean;
        error?: string;
        details?: unknown;
        selection_sync?: {
          kept_existing?: boolean;
          selections_replaced?: boolean;
          remapped_from_kit_change?: boolean;
        };
      } | null = null;

      if (Object.keys(updateData).length > 0) {
        updateResponse = await updateRegistration(registrationDetails.id, updateData);
        if (!updateResponse.success) {
          const det = updateResponse.details as {
            requires_product_reselection?: boolean;
            reasons?: string[];
          } | null;
          if (det?.requires_product_reselection && Array.isArray(det.reasons) && det.reasons.length > 0) {
            toast.error(det.reasons.join("\n"));
          } else {
            toast.error(updateResponse.error || "Erro ao atualizar inscrição");
          }
          setSaving(false);
          return;
        }
        if (updateResponse.selection_sync?.remapped_from_kit_change) {
          toast.success("Variantes realinhadas automaticamente para o novo kit.");
        } else if (categoryOrKitChanging && updateResponse.selection_sync?.kept_existing) {
          toast.success("Seleções do kit mantidas (compatíveis com a alteração).");
        }
      }

      const skipAttributeFollowUp =
        !!updateData.product_selections ||
        !!(updateResponse && updateResponse.selection_sync?.selections_replaced);

      if (!skipAttributeFollowUp && productSelectionsForVariableKit?.length) {
        const attributesResponse = await completeRegistrationAttributes(registrationDetails.id, {
          product_selections: productSelectionsForVariableKit,
        });
        if (!attributesResponse.success) {
          toast.error(attributesResponse.error || "Erro ao atualizar atributos");
          setSaving(false);
          return;
        }
      }

      toast.success("Inscrição atualizada com sucesso!");
      
      // Reload registration details
      const response = await getRegistrationById(registrationDetails.id);
      if (response.success && response.data) {
        setRegistrationDetails(response.data);
        setEditingStatus(response.data.status || "pending");
        setEditingPaymentStatus(response.data.payment_status || "pending");
        const pmR = response.data.payment_method;
        setEditingPaymentMethod(
          pmR && ["pix", "credit_card", "boleto"].includes(pmR) ? pmR : "pix"
        );
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

  const handleConfirmDifferencePayment = async () => {
    if (!registrationDetails?.id) return;
    setConfirmingDiff(true);
    try {
      const res = await confirmDifferencePayment(registrationDetails.id);
      if (res.success) {
        toast.success("Pagamento da diferença confirmado.");
        setIsConfirmDiffDialogOpen(false);
        const response = await getRegistrationById(registrationDetails.id);
        if (response.success && response.data) setRegistrationDetails(response.data);
        loadRegistrations();
      } else {
        toast.error(res.error || "Erro ao confirmar pagamento");
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao confirmar pagamento");
    } finally {
      setConfirmingDiff(false);
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
        const pmA = response.data.payment_method;
        setEditingPaymentMethod(
          pmA && ["pix", "credit_card", "boleto"].includes(pmA) ? pmA : "pix"
        );
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

      if (debouncedSearch) {
        filters.search = debouncedSearch;
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
      return '';
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
        <p className="text-muted-foreground">Visualize todas as inscrições de todos os eventos</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total de Inscrições</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.total_registrations}</div>
            <p className="text-xs text-muted-foreground mt-1">Total filtrado completo</p>
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
            <p className="text-xs text-muted-foreground mt-1">Total filtrado completo</p>
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
            <p className="text-xs text-muted-foreground mt-1">Total filtrado completo</p>
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
            <p className="text-xs text-muted-foreground mt-1">Total filtrado completo</p>
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

              <Select
                value={String(pageSize)}
                onValueChange={(v) => setPageSize(Number(v) as 30 | 50)}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Por página" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 por página</SelectItem>
                  <SelectItem value="50">50 por página</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => setIsRegisterAthleteDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Inscrever atleta
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
            {loading
              ? "Carregando..."
              : listTotal === 0
                ? "Nenhuma inscrição com os filtros atuais"
                : `Exibindo ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, listTotal)} de ${listTotal} (${registrations.length} nesta página)`}
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
                    <TableHead className="text-right">Taxas da plataforma</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registrations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
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
                          {(() => {
                            const total = parseFloat(String(registration.total_amount || 0)) || 0;
                            const pf = Number(registration.platform_fee_amount) || 0;
                            const ef = Number(registration.registration_edit_fee_amount) || 0;
                            const valorSemTaxa = pf > 0 || ef > 0
                              ? Math.round((total - pf - ef) * 100) / 100
                              : calculateValueWithoutFee(total, platformFee, platformFeeType);
                            return formatCurrency(valorSemTaxa);
                          })()}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatCurrency((Number(registration.platform_fee_amount) || 0) + (Number(registration.registration_edit_fee_amount) || 0))}
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
                              {canAdminTransferRegistration(registration) && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setRegistrationToTransfer(registration);
                                    setTransferDialogOpen(true);
                                  }}
                                >
                                  <ArrowRightLeft className="mr-2 h-4 w-4" />
                                  Transferir inscrição
                                </DropdownMenuItem>
                              )}
                              {registration.payment_status === "paid" && (
                                <DropdownMenuItem onClick={() => handleOpenAttachCommission(registration)}>
                                  <Link2 className="mr-2 h-4 w-4" />
                                  Atrelar a comissão
                                </DropdownMenuItem>
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
          )}
          {!loading && listTotal > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t mt-4">
              <p className="text-sm text-muted-foreground">
                Página {page} de {Math.max(1, totalPages || 1)}
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
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || totalPages === 0}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Próxima página"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Atrelar inscrição a comissão (admin) - só cupons de líderes do evento da compra */}
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
                    <div><span className="text-muted-foreground">Comissão:</span> {currentAttachCommission.commission_percentage}% • {formatCurrency(currentAttachCommission.commission_amount || 0)}</div>
                    <div><span className="text-muted-foreground">Status:</span> {currentAttachCommission.status === "paid" ? "Pago" : currentAttachCommission.status === "pending" ? "Pendente" : "Cancelado"}</div>
                    <Button variant="destructive" size="sm" onClick={handleDetachCommissionInAttachPopup} disabled={detachingCommission}>
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

      {/* Registration Details Dialog */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                  {/* Ordem na edição: 1º Modalidade, 2º Categoria (disponíveis para a modalidade), 3º Kit */}
                  <div>
                    <Label className="text-sm text-muted-foreground">Modalidade</Label>
                    {isEditMode ? (
                      <Select
                        value={editingModalityId || "none"}
                        onValueChange={(v) => handleEditingModalityChange(v === "none" ? "" : v)}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Selecione a modalidade" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Não definida</SelectItem>
                          {eventModalitiesList.map((mod) => (
                            <SelectItem key={mod.id} value={mod.id}>
                              {mod.name} {mod.distance ? `(${mod.distance})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="font-medium">
                        {registrationDetails.modality_name || "Não definida"}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Categoria</Label>
                    {isEditMode ? (
                      <Select
                        value={editingCategoryId}
                        onValueChange={handleEditingCategoryChange}
                        disabled={!editingModalityId}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue
                            placeholder={
                              editingModalityId
                                ? "Selecione a categoria"
                                : "Selecione a modalidade primeiro"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {eventCategoriesList.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="font-medium">
                        {registrationDetails.category_name || "N/A"}
                        {registrationDetails.category_distance && ` - ${registrationDetails.category_distance}`}
                      </p>
                    )}
                  </div>
                  {isEditMode && editingCategoryId && (
                    <div>
                      <Label className="text-sm text-muted-foreground">Lote</Label>
                      <Select
                        value={editingBatchId || "base"}
                        onValueChange={(v) => setEditingBatchId(v === "base" ? "" : v)}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Preço base da categoria" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="base">Preço base da categoria</SelectItem>
                          {categoryBatchesList.map((batch) => (
                            <SelectItem key={batch.id} value={batch.id}>
                              {batch.name || `Lote - R$ ${Number(batch.price).toFixed(2).replace(".", ",")}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {!isEditMode && (
                    <div>
                      <Label className="text-sm text-muted-foreground">Tipo de Categoria</Label>
                      <p className="font-medium capitalize">{registrationDetails.category_type || "N/A"}</p>
                    </div>
                  )}
                  {!isEditMode && selectedCategoryForDetails?.custom_fields?.length ? (
                    <div className="space-y-2">
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
                  {isEditMode && (() => {
                    const cat = eventCategoriesList.find((c) => c.id === editingCategoryId);
                    return cat?.custom_fields?.length ? (
                      <div className="space-y-2">
                        <Label className="text-sm text-muted-foreground">Campos personalizados</Label>
                        <div className="space-y-2">
                          {[...cat.custom_fields].sort((a, b) => a.display_order - b.display_order).map((f) => (
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
                    ) : null;
                  })()}
                  <div>
                    <Label className="text-sm text-muted-foreground">Kit</Label>
                    {isEditMode ? (
                      <Select
                        value={editingKitId || "none"}
                        onValueChange={(v) => void handleEditingKitChange(v === "none" ? "" : v)}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Selecione o kit (opcional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem kit</SelectItem>
                          {eventKitsList.map((kit) => (
                            <SelectItem key={kit.id} value={kit.id}>
                              {kit.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="font-medium">{registrationDetails.kit_name || "Sem kit"}</p>
                    )}
                  </div>
                  {isEditMode && (
                    <Card className="bg-muted/50 w-full md:col-span-2">
                      <CardHeader className="py-2 px-4">
                        <CardTitle className="text-sm">Pré-visualização da edição</CardTitle>
                        <CardDescription className="text-xs">
                          Valores recalculados ao alterar categoria, kit, modalidade ou lote
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="py-2 px-4 text-sm min-h-[7.5rem]">
                        {loadingPreview ? (
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                            <span>Calculando...</span>
                          </div>
                        ) : previewData ? (
                          <div className="space-y-4">
                            {/* O que já foi pago */}
                            <div className="space-y-1">
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">O que já foi pago</p>
                              <p className="font-medium">Total pago pelo corredor: {formatCurrency(previewData.amount_paid) || "R$ 0,00"}</p>
                              <p className="text-xs text-muted-foreground">
                                Valor líquido (organizador): {formatCurrency(previewData.amount_paid_for_organizer ?? 0) || "R$ 0,00"}
                                {(() => {
                                  const oldTotal = previewData.old_total ?? 0;
                                  const pf = Number(registrationDetails?.platform_fee_amount) || 0;
                                  const taxaInscricao = pf > 0 ? pf : 0;
                                  if (taxaInscricao > 0) return ` · Taxa plataforma: ${formatCurrency(taxaInscricao)}`;
                                  return "";
                                })()}
                              </p>
                            </div>

                            {/* Valor após edição */}
                            <div className="space-y-1 border-t pt-3">
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Valor após edição</p>
                              <p>Novo valor (categoria + kit): <strong>{formatCurrency(previewData.new_subtotal)}</strong></p>
                              {previewData.update_fee > 0 && (
                                <p>Taxa de atualização: <strong>{formatCurrency(previewData.update_fee)}</strong></p>
                              )}
                            </div>

                            {/* Diferença */}
                            <div className="border-t pt-3">
                              {previewData.difference_to_pay > 0 && (
                                <p className="text-amber-600 font-semibold">Diferença a cobrar: {formatCurrency(previewData.difference_to_pay)}</p>
                              )}
                              {previewData.difference_to_refund > 0 && (
                                <p className="text-blue-600 font-semibold">Diferença a reembolsar (manual): {formatCurrency(previewData.difference_to_refund)}</p>
                              )}
                              {previewData.difference_to_pay <= 0 && previewData.difference_to_refund <= 0 && (
                                <p className="text-muted-foreground text-sm">Nenhuma diferença a cobrar ou reembolsar.</p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Altere categoria, kit, modalidade ou lote para ver o resumo.</span>
                        )}
                      </CardContent>
                    </Card>
                  )}
                  <div>
                    <Label className="text-sm text-muted-foreground">Valor líquido</Label>
                    <p className="font-medium text-lg">
                      {formatCurrency(
                        (() => {
                          const total = parseFloat(String(registrationDetails.total_amount || 0)) || 0;
                          const pf = Number(registrationDetails.platform_fee_amount) || 0;
                          const ef = Number(registrationDetails.registration_edit_fee_amount) || 0;
                          if (pf > 0 || ef > 0) return Math.round((total - pf - ef) * 100) / 100;
                          return total > 0 ? calculateValueWithoutFee(total, platformFee, platformFeeType) : total;
                        })()
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
                      <Select
                        value={editingPaymentStatus}
                        onValueChange={(v) => {
                          setEditingPaymentStatus(v);
                          if (v !== "convidado" && registrationDetails?.payment_status === "convidado") {
                            setEditingPaymentMethod("pix");
                          }
                        }}
                      >
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
                  {isEditMode && editingPaymentStatus !== "convidado" && (
                    <div>
                      <Label className="text-sm text-muted-foreground">Método de pagamento</Label>
                      <p className="text-xs text-muted-foreground mb-1">
                        Ao sair de convite, o valor da inscrição é recalculado (categoria, kit e taxas).
                      </p>
                      <Select value={editingPaymentMethod} onValueChange={setEditingPaymentMethod}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pix">PIX</SelectItem>
                          <SelectItem value="credit_card">Cartão de crédito</SelectItem>
                          <SelectItem value="boleto">Boleto</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
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

              {/* Comissão gerada (admin: remover comissão) */}
              {registrationCommission && (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold border-b pb-2">Comissão gerada</h3>
                  {(registrationCommission as any).bonus_type === "invitation" ? (
                    <div>
                      <Label className="text-sm text-muted-foreground">Tipo</Label>
                      <p className="font-medium">Bônus de convite (sem valor em dinheiro)</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm text-muted-foreground">Valor da comissão</Label>
                        <p className="font-medium">{formatCurrency(registrationCommission.commission_amount || 0)}</p>
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground">Status</Label>
                        <div className="mt-1">
                          {registrationCommission.status === "paid" && <Badge variant="default">Pago</Badge>}
                          {registrationCommission.status === "pending" && <Badge variant="secondary">Pendente</Badge>}
                          {registrationCommission.status === "cancelled" && <Badge variant="outline">Cancelado</Badge>}
                        </div>
                      </div>
                    </div>
                  )}
                  <Button variant="destructive" size="sm" onClick={handleRemoveCommission} disabled={removingCommission}>
                    {removingCommission ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Remover comissão
                  </Button>
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

              {/* Pagamento da diferença pendente – apenas quando há cobrança pendente e inscrição não está totalmente paga */}
              {(registrationDetails.pending_difference_amount ?? 0) > 0 && registrationDetails.payment_status !== 'paid' && (
                <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4">
                  <h3 className="text-lg font-semibold border-b border-amber-200 dark:border-amber-800 pb-2">Pagamento da diferença pendente</h3>
                  <p className="text-sm">
                    Valor a receber: <strong>{formatCurrency(registrationDetails.pending_difference_amount ?? 0)}</strong>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Se o corredor pagou em dinheiro ou transferência, confirme abaixo. O PIX da diferença será invalidado.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => setIsConfirmDiffDialogOpen(true)}
                    disabled={confirmingDiff}
                  >
                    {confirmingDiff ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Confirmar pagamento recebido
                  </Button>
                </div>
              )}

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

              {/* Produto e Variações Selecionadas */}
              {isEditMode && editingKitId && (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold border-b pb-2">Editar Atributos dos Produtos</h3>
                  {editableKitContextIssues.length > 0 && (
                    <Alert variant="destructive">
                      <AlertTitle>Inconsistências nos dados do kit</AlertTitle>
                      <AlertDescription>
                        <ul className="list-disc pl-4 text-sm space-y-1 mt-1">
                          {editableKitContextIssues.map((issue, i) => (
                            <li key={`${issue.code}-${i}`}>{issue.message}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}
                  {loadingKit ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : (
                    <KitVariableProductSelectors
                      kitProducts={kitProducts}
                      value={editingProductAttributes}
                      onChange={(productId, attrName, attrValue) =>
                        setEditingProductAttributes((prev) => ({
                          ...prev,
                          [productId]: { ...prev[productId], [attrName]: attrValue },
                        }))
                      }
                      disabled={saving}
                      onRemoveProductAttributes={(productId) => void handleRemoveAttributes(productId)}
                      emptyMessage="Nenhum produto com variações encontrado neste kit."
                    />
                  )}
                </div>
              )}

              {/* Produto e Variações Selecionadas (View Mode) */}
              {!isEditMode && registrationDetails.product_selections && registrationDetails.product_selections.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h3 className="text-lg font-semibold">Produto e Variações Selecionadas</h3>
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
            </div>
          ) : null}

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
                <Button variant="default" onClick={handleEditClick}>
                  <Edit2 className="w-4 h-4 mr-2" />
                  Editar
                </Button>
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

      {/* Modal: Confirmar pagamento da diferença recebido (só admin) */}
      <Dialog open={isConfirmDiffDialogOpen} onOpenChange={setIsConfirmDiffDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar pagamento recebido</DialogTitle>
            <DialogDescription>
              O corredor pagou a diferença de {formatCurrency(registrationDetails?.pending_difference_amount ?? 0)}? Esta ação marcará o pagamento como confirmado e invalidará o PIX da diferença.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfirmDiffDialogOpen(false)} disabled={confirmingDiff}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmDifferencePayment} disabled={confirmingDiff}>
              {confirmingDiff ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Sim, confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TransferRegistrationAdminDialog
        open={transferDialogOpen}
        onOpenChange={(open) => {
          setTransferDialogOpen(open);
          if (!open) setRegistrationToTransfer(null);
        }}
        registrationId={registrationToTransfer?.id ?? null}
        subtitle={
          registrationToTransfer
            ? `${registrationToTransfer.runner_name || "—"} • ${registrationToTransfer.confirmation_code || registrationToTransfer.id}`
            : undefined
        }
        onSuccess={() => void loadRegistrations()}
      />

      <RegisterAthleteStaffDialog
        mode="super_admin"
        open={isRegisterAthleteDialogOpen}
        onOpenChange={setIsRegisterAthleteDialogOpen}
        events={events}
        onSuccess={loadRegistrations}
      />
    </div>
  );
};

export default AdminRegistrations;
