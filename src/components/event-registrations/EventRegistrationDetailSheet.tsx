import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ExternalLink, Loader2, Pencil } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  getRegistrationById,
  getRegistrationEditableKitContext,
  updateRegistration,
  previewRegistrationEdit,
  type Registration,
  type UpdateRegistrationData,
  type PreviewRegistrationEditResponse,
  type EditableKitIssue,
} from "@/lib/api/registrations";
import { getModalities, type Modality } from "@/lib/api/modalities";
import { getCategoriesByModality, getCategoryById, type Category, type CategoryBatch } from "@/lib/api/categories";
import { getCategoryBatches } from "@/lib/api/categoryBatches";
import { getEventKits, type EventKit, type KitProduct } from "@/lib/api/eventKits";
import { maskCpf } from "@/lib/utils/masks";
import { getRegistrationListTypeBadge, getRegistrationOriginKind } from "@/lib/utils/registrationOrigin";
import { groupRegistrationProductSelections } from "@/lib/utils/groupRegistrationProductSelections";
import { deriveProductSelectionsPayloadFromCanonicalRows } from "@/lib/utils/deriveProductSelectionsFromCanonicalRows";
import {
  buildProductSelectionsForVariableKit,
  kitHasVariableProductsWithAttributes,
  seedEditingAttributesFromCanonicalRows,
} from "@/lib/utils/kitVariableProductSelectionUtils";
import { KitVariableProductSelectors } from "@/components/event-registrations/KitVariableProductSelectors";
import { loadKitsForCategoryWithKitFallback } from "@/lib/utils/loadEventKitsWithKitFallback";
import { getEnabledModules } from "@/lib/api/systemSettings";
import { getCanonicalRegistrationDisplayValue } from "@/lib/utils/feeCalculations";

function formatMoney(n: number): string {
  return `R$ ${Number(n || 0).toFixed(2).replace(".", ",")}`;
}

function paymentStatusLabel(ps: string | undefined): string {
  const m: Record<string, string> = {
    paid: "Pago",
    pending: "Pendente",
    partially_paid: "Parcial",
    refunded: "Reembolsado",
    failed: "Falhou",
    convidado: "Convidado",
  };
  return m[ps || ""] || ps || "—";
}

function registrationStatusLabel(st: string | undefined): string {
  const m: Record<string, string> = {
    confirmed: "Confirmada",
    pending: "Pendente",
    cancelled: "Cancelada",
    refund_requested: "Reembolso solicitado",
    refunded: "Reembolsada",
    transferred: "Transferida",
  };
  return m[st || ""] || st || "—";
}

function paymentMethodLabel(pm: string | undefined): string {
  const m: Record<string, string> = {
    pix: "PIX",
    credit_card: "Cartão",
    boleto: "Boleto",
    free_bonus: "Bônus / convite",
  };
  return m[pm || ""] || pm || "—";
}

export interface EventRegistrationDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  registrationId: string | null;
  /** Evento da listagem (para carregar modalidades, categorias, kits). */
  eventId: string;
  rolePage: "admin" | "organizer";
  fullEditHref: string;
  onRefreshList: () => void;
  onConfirmRegistration: (id: string) => void;
  onCancelRegistration: (id: string) => void;
  onDeleteRegistration?: (id: string) => void;
  confirmingId: string | null;
  cancellingId: string | null;
  deletingId: string | null;
  detailRefreshToken: number;
}

export function EventRegistrationDetailSheet({
  open,
  onOpenChange,
  registrationId,
  eventId,
  rolePage,
  fullEditHref,
  onRefreshList,
  onConfirmRegistration,
  onCancelRegistration,
  onDeleteRegistration,
  confirmingId,
  cancellingId,
  deletingId,
  detailRefreshToken,
}: EventRegistrationDetailSheetProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<Registration | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [hydratingEdit, setHydratingEdit] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const [modalities, setModalities] = useState<Modality[]>([]);
  const [filteredCategories, setFilteredCategories] = useState<Category[]>([]);
  const [kits, setKits] = useState<EventKit[]>([]);
  const [batches, setBatches] = useState<CategoryBatch[]>([]);
  const [categoryForFields, setCategoryForFields] = useState<Category | null>(null);

  const [editStatus, setEditStatus] = useState<string>("");
  const [editPayment, setEditPayment] = useState<string>("");
  const [editPaymentMethod, setEditPaymentMethod] = useState<string>("pix");
  const [editModalityId, setEditModalityId] = useState<string>("");
  const [editCategoryId, setEditCategoryId] = useState<string>("");
  const [editKitId, setEditKitId] = useState<string>("");
  const [editBatchId, setEditBatchId] = useState<string>("");
  const [editCouponCode, setEditCouponCode] = useState<string>("");
  const [editCustomFieldValues, setEditCustomFieldValues] = useState<Record<string, string>>({});

  const [preview, setPreview] = useState<PreviewRegistrationEditResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  /** Fluxo pós-409: aviso persistente + reescolha assistida no próprio drawer. */
  const [reselectionRequired, setReselectionRequired] = useState<{
    reasons: string[];
    message?: string;
  } | null>(null);
  const [kitProductsForEdit, setKitProductsForEdit] = useState<KitProduct[]>([]);
  const [editableKitContextIssues, setEditableKitContextIssues] = useState<EditableKitIssue[]>([]);
  const [editingProductAttributes, setEditingProductAttributes] = useState<
    Record<string, Record<string, string>>
  >({});
  const kitAttributesSeedKeyRef = useRef<string | null>(null);

  const isAdmin = rolePage === "admin";
  const [platformFee, setPlatformFee] = useState(0);
  const [platformFeeType, setPlatformFeeType] = useState<"fixed" | "percentage">("fixed");

  useEffect(() => {
    if (isAdmin) return;
    void getEnabledModules().then((response) => {
      if (response.success && response.data) {
        setPlatformFee(response.data.platform_fee || 0);
        setPlatformFeeType(response.data.platform_fee_type || "fixed");
      }
    });
  }, [isAdmin]);

  const displayRegistrationAmount = useCallback(
    (reg: Registration) => {
      if (isAdmin) return Number(reg.total_amount) || 0;
      return getCanonicalRegistrationDisplayValue(reg, platformFee, platformFeeType);
    },
    [isAdmin, platformFee, platformFeeType]
  );

  const loadDetail = useCallback(async () => {
    if (!registrationId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    try {
      const res = await getRegistrationById(registrationId);
      if (res.success && res.data) {
        setDetail(res.data);
      } else {
        setDetail(null);
        toast({
          title: "Erro",
          description: res.error || "Não foi possível carregar a inscrição.",
          variant: "destructive",
        });
      }
    } catch (e: unknown) {
      setDetail(null);
      toast({
        title: "Erro",
        description: e instanceof Error ? e.message : "Falha ao carregar.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [registrationId, toast]);

  useEffect(() => {
    if (open && registrationId) {
      void loadDetail();
    }
    if (!open) {
      setDetail(null);
      setEditMode(false);
      setReselectionRequired(null);
      setEditingProductAttributes({});
      setKitProductsForEdit([]);
      setEditableKitContextIssues([]);
      kitAttributesSeedKeyRef.current = null;
    }
  }, [open, registrationId, loadDetail, detailRefreshToken]);

  const [loadingKitProductsForEdit, setLoadingKitProductsForEdit] = useState(false);

  useEffect(() => {
    if (!editMode || !editKitId || !eventId) {
      setKitProductsForEdit([]);
      setLoadingKitProductsForEdit(false);
      setEditableKitContextIssues([]);
      return;
    }

    const matchesSavedRegistrationKit =
      !!registrationId && !!detail?.kit_id && editKitId === detail.kit_id;

    let cancelled = false;
    setLoadingKitProductsForEdit(true);

    void (async () => {
      try {
        if (matchesSavedRegistrationKit && registrationId) {
          const ctxRes = await getRegistrationEditableKitContext(registrationId);
          if (cancelled) return;
          if (ctxRes.success && ctxRes.data) {
            setEditableKitContextIssues(ctxRes.data.issues ?? []);
            if (ctxRes.data.products.length > 0) {
              setKitProductsForEdit(ctxRes.data.products);
              setLoadingKitProductsForEdit(false);
              return;
            }
          } else {
            setEditableKitContextIssues([]);
          }
        }

        const kitFromState = kits.find((x) => x.id === editKitId);
        if (kitFromState?.products && kitFromState.products.length > 0) {
          if (!cancelled) {
            setKitProductsForEdit(kitFromState.products);
            if (!matchesSavedRegistrationKit) setEditableKitContextIssues([]);
            setLoadingKitProductsForEdit(false);
          }
          return;
        }

        const { kitProducts } = await loadKitsForCategoryWithKitFallback({
          eventId,
          categoryId: editCategoryId || undefined,
          registrationKitId: editKitId,
        });
        if (!cancelled) {
          setKitProductsForEdit(kitProducts);
          if (!matchesSavedRegistrationKit) setEditableKitContextIssues([]);
          setLoadingKitProductsForEdit(false);
        }
      } catch {
        if (!cancelled) {
          setKitProductsForEdit([]);
          setEditableKitContextIssues([]);
          setLoadingKitProductsForEdit(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [editMode, editKitId, editCategoryId, eventId, kits, registrationId, detail?.kit_id]);

  /** Pré-preenche atributos a partir das seleções canônicas ao editar ou ao mudar kit (mesmo sem 409). */
  useEffect(() => {
    if (!editMode || !detail?.id || !editKitId || kitProductsForEdit.length === 0) return;
    const key = `${detail.id}:${editKitId}:${[...kitProductsForEdit.map((p) => p.id)].sort().join(",")}`;
    if (kitAttributesSeedKeyRef.current === key) return;
    kitAttributesSeedKeyRef.current = key;
    const seeded = seedEditingAttributesFromCanonicalRows(kitProductsForEdit, detail.product_selections ?? null);
    setEditingProductAttributes((prev) => ({ ...prev, ...seeded }));
  }, [editMode, detail?.id, detail?.product_selections, editKitId, kitProductsForEdit]);

  useEffect(() => {
    if (!open || !eventId) return;
    void (async () => {
      const modRes = await getModalities(eventId);
      if (modRes.success && modRes.data) {
        setModalities([...modRes.data].sort((a, b) => a.display_order - b.display_order));
      } else setModalities([]);
    })();
  }, [open, eventId]);

  const hydrateEditFromDetail = useCallback(
    async (d: Registration) => {
      setHydratingEdit(true);
      try {
        setEditStatus(d.status || "pending");
        setEditPayment(d.payment_status || "pending");
        const pm = d.payment_method;
        setEditPaymentMethod(pm && ["pix", "credit_card", "boleto"].includes(pm) ? pm : "pix");
        setEditCouponCode(d.coupon_code || "");
        setEditModalityId(d.modality_id || "");
        setEditCategoryId(d.category_id || "");
        setEditKitId(d.kit_id || "");
        setEditBatchId(d.category_batch_id || "");
        setEditCustomFieldValues(
          d.custom_field_values && typeof d.custom_field_values === "object" ? { ...d.custom_field_values } : {}
        );

        if (!d.modality_id) {
          setFilteredCategories([]);
          setKits([]);
          setBatches([]);
          setCategoryForFields(null);
          return;
        }

        const catRes = await getCategoriesByModality(d.modality_id);
        const cats = catRes.success && catRes.data ? catRes.data : [];
        setFilteredCategories(cats);

        if (!d.category_id) {
          setKits([]);
          setBatches([]);
          setCategoryForFields(null);
          return;
        }

        const [kitsRes, batchesRes, catRes2] = await Promise.all([
          getEventKits(eventId, { categoryId: d.category_id, context: 'management' }),
          getCategoryBatches(d.category_id),
          getCategoryById(d.category_id),
        ]);

        if (kitsRes.success && kitsRes.data) setKits(kitsRes.data);
        else setKits([]);

        const bl = Array.isArray(batchesRes.data) ? batchesRes.data : [];
        setBatches(bl);

        if (catRes2.success && catRes2.data) setCategoryForFields(catRes2.data);
        else setCategoryForFields(null);
      } finally {
        setHydratingEdit(false);
      }
    },
    [eventId]
  );

  const startEdit = async () => {
    if (!detail) return;
    setReselectionRequired(null);
    setEditingProductAttributes({});
    kitAttributesSeedKeyRef.current = null;
    setEditMode(true);
    await hydrateEditFromDetail(detail);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setPreview(null);
    setReselectionRequired(null);
    setEditingProductAttributes({});
    setEditableKitContextIssues([]);
    kitAttributesSeedKeyRef.current = null;
    if (detail) {
      void hydrateEditFromDetail(detail);
    }
  };

  const handleModalityChange = async (newModalityId: string) => {
    setReselectionRequired(null);
    setEditModalityId(newModalityId);
    setEditCategoryId("");
    setEditKitId("");
    setEditBatchId("");
    setEditCustomFieldValues({});
    setKits([]);
    setBatches([]);
    setCategoryForFields(null);
    setPreview(null);
    if (!newModalityId) {
      setFilteredCategories([]);
      return;
    }
    const catRes = await getCategoriesByModality(newModalityId);
    setFilteredCategories(catRes.success && catRes.data ? catRes.data : []);
  };

  const handleCategoryChange = async (newCategoryId: string) => {
    setReselectionRequired(null);
    setEditCategoryId(newCategoryId);
    setEditKitId("");
    setEditBatchId("");
    setEditCustomFieldValues({});
    setPreview(null);
    if (!newCategoryId) {
      setKits([]);
      setBatches([]);
      setCategoryForFields(null);
      return;
    }
    const [kitsRes, batchesRes, catFull] = await Promise.all([
      getEventKits(eventId, { categoryId: newCategoryId, context: 'management' }),
      getCategoryBatches(newCategoryId),
      getCategoryById(newCategoryId),
    ]);
    if (kitsRes.success && kitsRes.data) setKits(kitsRes.data);
    else setKits([]);
    setBatches(Array.isArray(batchesRes.data) ? batchesRes.data : []);
    if (catFull.success && catFull.data) setCategoryForFields(catFull.data);
    else setCategoryForFields(null);
  };

  useEffect(() => {
    if (!editMode || !detail?.id || !editCategoryId) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await previewRegistrationEdit(detail.id, {
            category_id: editCategoryId,
            kit_id: editKitId || null,
            modality_id: editModalityId || null,
            batch_id: editBatchId || null,
          });
          if (!cancelled && res.success && res.data) setPreview(res.data as PreviewRegistrationEditResponse);
          else if (!cancelled) setPreview(null);
        } catch {
          if (!cancelled) setPreview(null);
        } finally {
          if (!cancelled) setPreviewLoading(false);
        }
      })();
    }, 380);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [editMode, detail?.id, editCategoryId, editKitId, editModalityId, editBatchId]);

  const handleSaveAll = async () => {
    if (!detail) return;
    if (editKitId && loadingKitProductsForEdit) {
      toast({
        title: "Aguarde",
        description: "Carregando produtos do kit antes de salvar.",
        variant: "destructive",
      });
      return;
    }
    const body: UpdateRegistrationData = {};

    if (isAdmin) {
      if (editStatus !== detail.status) body.status = editStatus as UpdateRegistrationData["status"];
      if (editPayment !== detail.payment_status) {
        body.payment_status = editPayment as UpdateRegistrationData["payment_status"];
      }
      if (editPayment !== "convidado") {
        const leavingConvite = detail.payment_status === "convidado" && editPayment !== "convidado";
        const methodChanged = editPaymentMethod !== (detail.payment_method || "");
        if (leavingConvite || methodChanged) {
          body.payment_method = editPaymentMethod as UpdateRegistrationData["payment_method"];
        }
      }
    }

    if (editCategoryId && editCategoryId !== detail.category_id) body.category_id = editCategoryId;
    if ((editKitId || "") !== (detail.kit_id || "")) body.kit_id = editKitId || null;
    if ((editModalityId || "") !== (detail.modality_id || "")) body.modality_id = editModalityId || null;
    if ((editBatchId || "") !== (detail.category_batch_id || "")) body.batch_id = editBatchId || null;

    const couponTrim = editCouponCode.trim();
    const prevCoupon = (detail.coupon_code || "").trim();
    if (couponTrim !== prevCoupon) {
      body.coupon_code = couponTrim || null;
    }

    const effCat =
      categoryForFields?.id === editCategoryId
        ? categoryForFields
        : filteredCategories.find((c) => c.id === editCategoryId);
    if (effCat?.custom_fields?.length) {
      body.custom_field_values = { ...editCustomFieldValues };
    } else if (editCategoryId !== detail.category_id) {
      body.custom_field_values = {};
    }

    const structuralCategoryOrKitChange =
      body.category_id !== undefined || body.kit_id !== undefined;
    const kitUnchanged = (editKitId || "") === (detail.kit_id || "");
    const variableKitLoaded =
      !!editKitId && kitHasVariableProductsWithAttributes(kitProductsForEdit);

    if (variableKitLoaded) {
      const complete = buildProductSelectionsForVariableKit(
        kitProductsForEdit,
        editingProductAttributes,
        { requireAll: true }
      );
      if (!complete || complete.length === 0) {
        toast({
          title: "Seleções incompletas",
          description:
            "Preencha todas as variações do kit (cada atributo obrigatório) na seção «Produtos do kit» antes de salvar.",
          variant: "destructive",
        });
        return;
      }
      body.product_selections = complete;
    } else if (
      structuralCategoryOrKitChange &&
      kitUnchanged &&
      detail.product_selections?.length
    ) {
      /**
       * `product_id` nas linhas canônicas referem `kit_products` do kit atual.
       * Se o kit mudar, reenviar esse bundle invalidaria o PUT — o backend já faz remap/reaproveitamento sem payload.
       * Só aplica quando o kit não tem produtos variáveis no payload local (não substitui o editor de atributos).
       */
      const derived = deriveProductSelectionsPayloadFromCanonicalRows(detail.product_selections);
      if (derived?.length) body.product_selections = derived;
    }

    if (Object.keys(body).length === 0) {
      toast({ title: "Nada para salvar", description: "Altere algum campo antes de salvar." });
      return;
    }

    setSavingEdit(true);
    try {
      const res = await updateRegistration(detail.id, body);
      if (res.success) {
        const sync = (res as unknown as {
          selection_sync?: {
            kept_existing?: boolean;
            selections_replaced?: boolean;
            remapped_from_kit_change?: boolean;
          };
        }).selection_sync;
        let description = "Alterações salvas. A listagem será atualizada.";
        if (sync?.remapped_from_kit_change) {
          description = "Alterações salvas. Variantes foram realinhadas ao novo kit.";
        } else if (sync?.kept_existing && (body.category_id || body.kit_id !== undefined)) {
          description = "Alterações salvas. Seleções do kit foram mantidas (compatíveis).";
        }
        toast({
          title: "Inscrição atualizada",
          description,
        });
        setReselectionRequired(null);
        setEditingProductAttributes({});
        kitAttributesSeedKeyRef.current = null;
        setEditMode(false);
        setPreview(null);
        await loadDetail();
        onRefreshList();
      } else {
        const raw = res.details ?? res;
        const det = raw as {
          requires_product_reselection?: boolean;
          reasons?: string[];
          message?: string;
        };
        if (det?.requires_product_reselection && Array.isArray(det.reasons) && det.reasons.length > 0) {
          setReselectionRequired({
            reasons: det.reasons,
            message: det.message,
          });
          toast({
            title: "Reescolha necessária",
            description:
              "O servidor não pôde manter as seleções atuais. Ajuste as opções na área destacada abaixo e salve de novo.",
            variant: "destructive",
          });
        } else {
          toast({ title: "Erro", description: res.error || "Falha ao salvar.", variant: "destructive" });
        }
      }
    } catch (e: unknown) {
      toast({
        title: "Erro",
        description: e instanceof Error ? e.message : "Falha ao salvar.",
        variant: "destructive",
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const typeBadge = detail ? getRegistrationListTypeBadge(detail) : null;
  const originKind = detail ? getRegistrationOriginKind(detail) : null;

  let createdStr = "—";
  let updatedStr = "—";
  if (detail?.created_at) {
    try {
      createdStr = format(parseISO(detail.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR });
    } catch {
      createdStr = detail.created_at;
    }
  }
  if (detail?.updated_at) {
    try {
      updatedStr = format(parseISO(detail.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR });
    } catch {
      updatedStr = detail.updated_at;
    }
  }

  const customFieldsSorted =
    categoryForFields?.custom_fields?.length ?
      [...categoryForFields.custom_fields].sort((a, b) => a.display_order - b.display_order)
    : [];

  const groupedKitSelections = useMemo(
    () =>
      detail?.product_selections?.length
        ? groupRegistrationProductSelections(detail.product_selections)
        : [],
    [detail?.product_selections]
  );

  const showKitVariableEditors =
    editMode && !!editKitId && kitHasVariableProductsWithAttributes(kitProductsForEdit);

  const incompleteVariableProductIds = useMemo(() => {
    if (!showKitVariableEditors) return [];
    return kitProductsForEdit
      .filter((p) => p.type === "variable" && (p.variant_attributes?.length ?? 0) > 0)
      .filter(
        (p) =>
          !p.variant_attributes!.every((a) =>
            (editingProductAttributes[p.id]?.[a] || "").trim()
          )
      )
      .map((p) => p.id);
  }, [showKitVariableEditors, kitProductsForEdit, editingProductAttributes]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-lg md:max-w-2xl"
      >
        <SheetHeader className="space-y-1 border-b px-6 py-4 text-left">
          <SheetTitle className="pr-8">Detalhe da inscrição</SheetTitle>
          <SheetDescription className="line-clamp-2">
            {detail?.runner_name || "Carregando…"}
            {detail?.confirmation_code ? ` · ${detail.confirmation_code}` : ""}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !detail ? (
          <p className="p-6 text-sm text-muted-foreground">Selecione uma inscrição na tabela.</p>
        ) : (
          <ScrollArea className="min-h-0 flex-1 px-6">
            <div className="space-y-6 py-4 pr-3">
              <div className="flex flex-wrap gap-2">
                {!editMode ? (
                  <Button type="button" variant="default" size="sm" className="gap-1" onClick={() => void startEdit()}>
                    <Pencil className="h-3.5 w-3.5" />
                    Editar inscrição
                  </Button>
                ) : (
                  <>
                    <Button type="button" variant="outline" size="sm" onClick={cancelEdit} disabled={savingEdit}>
                      Cancelar edição
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={savingEdit || hydratingEdit || loadingKitProductsForEdit}
                      onClick={() => void handleSaveAll()}
                    >
                      {savingEdit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Salvar alterações
                    </Button>
                  </>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => navigate(fullEditHref)}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Edição completa
                </Button>
                {!editMode && detail.status !== "confirmed" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={confirmingId === detail.id}
                    onClick={() => onConfirmRegistration(detail.id)}
                  >
                    {confirmingId === detail.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar + pago"}
                  </Button>
                )}
                {!editMode && detail.status !== "cancelled" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={cancellingId === detail.id}
                    onClick={() => onCancelRegistration(detail.id)}
                  >
                    {cancellingId === detail.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancelar inscrição"}
                  </Button>
                )}
                {!editMode && isAdmin && onDeleteRegistration && (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={deletingId === detail.id}
                    onClick={() => onDeleteRegistration(detail.id)}
                  >
                    {deletingId === detail.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
                  </Button>
                )}
              </div>

              {editMode && hydratingEdit && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Carregando opções de edição…
                </p>
              )}

              {editMode && reselectionRequired && (
                <Alert variant="destructive" className="bg-destructive/5">
                  <AlertTitle>Reescolha necessária</AlertTitle>
                  <AlertDescription className="space-y-3">
                    <p>
                      O servidor não conseguiu aplicar automaticamente as seleções com a última alteração.
                      Ajuste as variações na secção «Produtos do kit» deste formulário e salve de novo.
                    </p>
                    {reselectionRequired.message ? (
                      <p className="text-destructive/90 font-medium">{reselectionRequired.message}</p>
                    ) : null}
                    <ul className="list-inside list-disc space-y-1">
                      {reselectionRequired.reasons.map((r, i) => (
                        <li key={`${i}-${r.slice(0, 24)}`}>{r}</li>
                      ))}
                    </ul>
                    {!showKitVariableEditors && editKitId ? (
                      <div className="border-t border-destructive/25 pt-3 space-y-2">
                        <p className="text-sm">
                          Este kit não tem produtos com variação editável aqui, ou os dados do kit ainda estão carregando.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-destructive/40"
                          onClick={() => navigate(fullEditHref)}
                        >
                          Abrir edição completa
                        </Button>
                      </div>
                    ) : null}
                  </AlertDescription>
                </Alert>
              )}

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dados pessoais</h3>
                <div className="rounded-lg border bg-card/50 p-3 text-sm space-y-1.5">
                  <p>
                    <span className="text-muted-foreground">Nome: </span>
                    {detail.runner_name || "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">CPF: </span>
                    {detail.runner_cpf ? maskCpf(detail.runner_cpf) : "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">E-mail: </span>
                    {detail.runner_email || "—"}
                  </p>
                  <p className="text-xs text-muted-foreground pt-1">
                    Nome, CPF, e-mail e telefone são dados do perfil do corredor. Para alterá-los, use o cadastro de
                    usuário / corredor no sistema — não pela inscrição.
                  </p>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inscrição</h3>
                {!editMode ? (
                  <div className="rounded-lg border bg-card/50 p-3 text-sm space-y-1.5">
                    <p>
                      <span className="text-muted-foreground">Modalidade: </span>
                      {detail.modality_name || "—"}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Categoria: </span>
                      {detail.category_name || "—"}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Kit: </span>
                      {detail.kit_name || "—"}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Valor: </span>
                      {formatMoney(displayRegistrationAmount(detail))}
                    </p>
                    {detail.leader_name && (
                      <p>
                        <span className="text-muted-foreground">Líder (cupom): </span>
                        {detail.leader_name}
                      </p>
                    )}
                    {detail.coupon_code && (
                      <p>
                        <span className="text-muted-foreground">Cupom: </span>
                        {detail.coupon_code}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border bg-card/50 p-3 text-sm space-y-3">
                    <div className="space-y-1.5">
                      <Label>Modalidade</Label>
                      <Select value={editModalityId || "none"} onValueChange={(v) => void handleModalityChange(v === "none" ? "" : v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Não definida</SelectItem>
                          {modalities.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name} {m.distance ? `(${m.distance})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Categoria</Label>
                      <Select
                        value={editCategoryId}
                        onValueChange={(v) => void handleCategoryChange(v)}
                        disabled={!editModalityId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={editModalityId ? "Selecione a categoria" : "Escolha a modalidade primeiro"} />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredCategories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {editCategoryId && (
                      <div className="space-y-1.5">
                        <Label>Lote (preço)</Label>
                        <Select
                          value={editBatchId || "base"}
                          onValueChange={(v) => {
                            setEditBatchId(v === "base" ? "" : v);
                            setPreview(null);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Preço base da categoria" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="base">Preço base da categoria</SelectItem>
                            {batches.map((b) => (
                              <SelectItem key={b.id} value={b.id}>
                                {b.name || `Lote — ${formatMoney(Number(b.price))}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label>Kit</Label>
                      <Select
                        value={editKitId || "none"}
                        onValueChange={(v) => {
                          setReselectionRequired(null);
                          setEditKitId(v === "none" ? "" : v);
                          setPreview(null);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sem kit" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem kit</SelectItem>
                          {kits.map((k) => (
                            <SelectItem key={k.id} value={k.id}>
                              {k.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Código de cupom (opcional)</Label>
                      <Input
                        value={editCouponCode}
                        onChange={(e) => setEditCouponCode(e.target.value)}
                        placeholder="Altere apenas se o cupom for válido no evento"
                        className="font-mono text-sm"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        O backend valida o cupom. Vínculo com comissão de líder pode exigir fluxo na central de inscrições.
                      </p>
                    </div>
                    {customFieldsSorted.length > 0 && (
                      <div className="space-y-2 border-t pt-3">
                        <Label>Campos personalizados da categoria</Label>
                        {customFieldsSorted.map((f) => (
                          <div key={f.id} className="space-y-1">
                            <Label className="text-xs font-normal text-muted-foreground">{f.label}</Label>
                            <Input
                              value={editCustomFieldValues[f.id] ?? ""}
                              onChange={(e) =>
                                setEditCustomFieldValues((prev) => ({ ...prev, [f.id]: e.target.value }))
                              }
                              type={f.field_type === "number" ? "number" : "text"}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    {editKitId && loadingKitProductsForEdit && (
                      <p className="flex items-center gap-2 text-xs text-muted-foreground border-t pt-3">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Carregando produtos do kit…
                      </p>
                    )}
                    {editableKitContextIssues.length > 0 && (
                      <Alert variant="destructive" className="border-t">
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
                    {showKitVariableEditors && (
                      <div className="space-y-2 border-t pt-3">
                        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Produtos do kit (variações)
                        </Label>
                        <p className="text-[11px] text-muted-foreground">
                          Escolhas de produto da inscrição. Alterações são validadas no servidor (estoque, kit e categoria).
                        </p>
                        <KitVariableProductSelectors
                          kitProducts={kitProductsForEdit}
                          value={editingProductAttributes}
                          onChange={(productId, attrName, attrValue) =>
                            setEditingProductAttributes((prev) => ({
                              ...prev,
                              [productId]: { ...prev[productId], [attrName]: attrValue },
                            }))
                          }
                          disabled={savingEdit || hydratingEdit || loadingKitProductsForEdit}
                          highlightIncompleteProductIds={incompleteVariableProductIds}
                          emptyMessage="Nenhum produto variável configurado neste kit."
                        />
                      </div>
                    )}
                    {editMode && editCategoryId && (
                      <div className="border-t pt-3 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Prévia de valores (estimativa)</p>
                        {previewLoading ? (
                          <p className="text-xs text-muted-foreground flex items-center gap-2">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Calculando…
                          </p>
                        ) : preview ? (
                          <div className="text-xs space-y-1 rounded-md bg-muted/40 p-2">
                            <p>
                              Novo total (est.): <span className="font-medium">{formatMoney(preview.new_total)}</span>
                            </p>
                            {preview.difference_to_pay >= 0.01 && (
                              <p className="text-amber-700 dark:text-amber-400">
                                Diferença a cobrar: {formatMoney(preview.difference_to_pay)}
                              </p>
                            )}
                            {preview.difference_to_refund >= 0.01 && (
                              <p className="text-blue-700 dark:text-blue-300">
                                Diferença a devolver (operacional): {formatMoney(preview.difference_to_refund)}
                              </p>
                            )}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}
              </section>

              {!editMode && groupedKitSelections.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Produtos do kit (somente leitura)
                  </h3>
                  <div className="space-y-3">
                    {groupedKitSelections.map((g) => (
                      <div
                        key={g.product_id}
                        className="rounded-lg border bg-card/50 p-3 text-sm space-y-2"
                      >
                        <p className="font-medium text-foreground">{g.product_name}</p>
                        {g.variation_labels.length > 0 && (
                          <p>
                            <span className="text-muted-foreground">Variação: </span>
                            {g.variation_labels.join(" · ")}
                          </p>
                        )}
                        {g.other_attributes.length > 0 && (
                          <ul className="list-inside list-disc space-y-0.5 text-sm">
                            {g.other_attributes.map((a, i) => (
                              <li key={`${g.product_id}-${i}`}>
                                <span className="text-muted-foreground">{a.attribute_name}: </span>
                                {a.attribute_value}
                              </li>
                            ))}
                          </ul>
                        )}
                        {g.variation_labels.length === 0 && g.other_attributes.length === 0 && (
                          <p className="text-xs text-muted-foreground">Sem detalhes de variação ou atributo.</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pagamento</h3>
                {!editMode || !isAdmin ? (
                  <div className="rounded-lg border bg-card/50 p-3 text-sm space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{registrationStatusLabel(detail.status)}</Badge>
                      <Badge variant={detail.payment_status === "paid" ? "default" : "secondary"}>
                        {paymentStatusLabel(detail.payment_status)}
                      </Badge>
                    </div>
                    <p>
                      <span className="text-muted-foreground">Meio: </span>
                      {paymentMethodLabel(detail.payment_method)}
                    </p>
                    {detail.amount_paid != null && (
                      <p>
                        <span className="text-muted-foreground">Valor pago: </span>
                        {formatMoney(Number(detail.amount_paid))}
                      </p>
                    )}
                    {detail.has_pending_difference && detail.pending_difference_amount != null && (
                      <p className="text-amber-700 dark:text-amber-400">
                        Diferença pendente: {formatMoney(Number(detail.pending_difference_amount))}
                      </p>
                    )}
                    {!isAdmin && (
                      <p className="text-xs text-muted-foreground">
                        Apenas o super admin pode alterar status e pagamento aqui. Como organizador, use a central ou
                        confirme fluxos permitidos.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border bg-card/50 p-3 text-sm space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Status da inscrição</Label>
                        <Select value={editStatus} onValueChange={setEditStatus}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pendente</SelectItem>
                            <SelectItem value="confirmed">Confirmada</SelectItem>
                            <SelectItem value="cancelled">Cancelada</SelectItem>
                            <SelectItem value="refund_requested">Reembolso solicitado</SelectItem>
                            <SelectItem value="refunded">Reembolsada</SelectItem>
                            <SelectItem value="transferred">Transferida</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Status do pagamento</Label>
                        <Select value={editPayment} onValueChange={setEditPayment}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pendente</SelectItem>
                            <SelectItem value="paid">Pago</SelectItem>
                            <SelectItem value="partially_paid">Parcial</SelectItem>
                            <SelectItem value="convidado">Convidado / cortesia</SelectItem>
                            <SelectItem value="refunded">Reembolsado</SelectItem>
                            <SelectItem value="failed">Falhou</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {editPayment !== "convidado" && (
                      <div className="space-y-1.5">
                        <Label>Meio de pagamento (cobrável)</Label>
                        <Select value={editPaymentMethod} onValueChange={setEditPaymentMethod}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pix">PIX</SelectItem>
                            <SelectItem value="credit_card">Cartão</SelectItem>
                            <SelectItem value="boleto">Boleto</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">
                          Ao sair de &quot;convidado&quot; para fluxo pago, o servidor pode definir PIX se faltar método.
                          Alterar categoria/kit pode gerar cobrança de diferença no Asaas (regra já existente).
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipo / origem</h3>
                <div className="rounded-lg border bg-card/50 p-3 text-sm space-y-2">
                  {typeBadge && (
                    <div>
                      <Badge variant="outline" className={typeBadge.className} title={typeBadge.hint}>
                        {typeBadge.label}
                      </Badge>
                      {typeBadge.hint && <p className="mt-1 text-xs text-muted-foreground">{typeBadge.hint}</p>}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Classificação:{" "}
                    <span className="font-medium text-foreground">
                      {originKind === "courtesy" ? "Cortesia" : originKind === "leader_coupon" ? "Cupom / líder" : "Comercial"}
                    </span>
                  </p>
                  {editMode && isAdmin && (
                    <p className="text-[11px] text-muted-foreground">
                      Cortesia/convite é controlada pelo status de pagamento &quot;Convidado&quot; e método no servidor.
                      Não há campo separado de &quot;origem&quot; na API.
                    </p>
                  )}
                </div>
              </section>

              <Separator />

              <section className="space-y-2 pb-6">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Histórico</h3>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>Criada em: {createdStr}</p>
                  <p>Atualizada em: {updatedStr}</p>
                  <p className="text-xs pt-1">Não há campo de observações internas na inscrição nesta API.</p>
                </div>
              </section>
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}
