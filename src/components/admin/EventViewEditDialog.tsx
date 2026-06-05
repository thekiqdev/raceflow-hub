import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { getEventById, updateEvent, type CronogramaItemInput } from "@/lib/api/events";
import { getRegistrations } from "@/lib/api/registrations";
import { getModalities, createModality, updateModality, deleteModality, reorderModalities } from "@/lib/api/modalities";
import { getCategories, createCategory, updateCategory, deleteCategory, reorderCategories, type CategoryType as CategoryTypeEnum, type CategoryGender, type CategoryBatch } from "@/lib/api/categories";
import { getCategoryBatches, createCategoryBatch, updateCategoryBatch, deleteCategoryBatch } from "@/lib/api/categoryBatches";
import { createCategoryCustomField, updateCategoryCustomField, deleteCategoryCustomField } from "@/lib/api/categoryCustomFields";
import type { CategoryCustomField } from "@/lib/api/categoryCustomFields";
import { getEventKits, syncEventKits } from "@/lib/api/eventKits";
import { getEventPickupLocations, createPickupLocation, updatePickupLocation, deletePickupLocation } from "@/lib/api/kitPickup";
import { getOrganizers } from "@/lib/api/userManagement";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MapPin, Calendar, Users, DollarSign, Package, MapPin as MapPinIcon, Plus, Trash2, ChevronUp, ChevronDown, X, AlertTriangle, ArrowRight, Eye, EyeOff } from "lucide-react";
import { FileUpload } from "@/components/ui/file-upload";
import { Switch } from "@/components/ui/switch";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { isoToDatetimeLocal, processDatetimeLocalForSave, datetimeLocalToISO } from "@/lib/utils";
import { RegisterAthleteStaffDialog } from "@/components/registration/RegisterAthleteStaffDialog";
import { getAdminEventRegistrationsPath } from "@/lib/utils/navigation";

interface EventViewEditDialogProps {
  eventId: string | null;
  mode: "view" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function EventViewEditDialog({
  eventId,
  mode: initialMode,
  open,
  onOpenChange,
  onSuccess,
}: EventViewEditDialogProps) {
  const navigate = useNavigate();
  const [mode, setMode] = useState(initialMode);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const [event, setEvent] = useState<any>(null);
  const [modalities, setModalities] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [kits, setKits] = useState<any[]>([]);
  const [pickupLocations, setPickupLocations] = useState<any[]>([]);
  const [registrationTotalCount, setRegistrationTotalCount] = useState(0);
  const [selectedOrganizerId, setSelectedOrganizerId] = useState<string>("");
  const [organizers, setOrganizers] = useState<any[]>([]);
  const [loadingOrganizers, setLoadingOrganizers] = useState(false);
  const [customFieldAddingCategoryIndex, setCustomFieldAddingCategoryIndex] = useState<number | null>(null);
  const [addingCustomFieldLabel, setAddingCustomFieldLabel] = useState("");
  const [addingCustomFieldType, setAddingCustomFieldType] = useState<"text" | "number">("text");
  const [customFieldEditing, setCustomFieldEditing] = useState<{ fieldId: string; categoryId: string; categoryIndex: number; label: string; field_type: "text" | "number" } | null>(null);
  const [editingCustomFieldLabel, setEditingCustomFieldLabel] = useState("");
  const [editingCustomFieldType, setEditingCustomFieldType] = useState<"text" | "number">("text");
  const [customFieldSaving, setCustomFieldSaving] = useState(false);
  const [adminRegisterAthleteOpen, setAdminRegisterAthleteOpen] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    event_date: "",
    event_time: "",
    location: "",
    city: "",
    state: "",
    status: "draft" as "draft" | "published" | "ongoing" | "finished" | "cancelled",
    banner_url: "",
    regulation_url: "",
    registration_status: null as "not_open" | "open" | "closed" | null,
    registration_start_date: null as string | null,
    registration_end_date: null as string | null,
    registration_auto_mode: false,
    pix_enabled: true,
    pix_disabled_at: null as string | null,
    credit_card_enabled: true,
    credit_card_disabled_at: null as string | null,
    transfers_enabled: true,
    transfer_until: "",
  });
  const [registrationAutoMode, setRegistrationAutoMode] = useState(false);
  const [premiacaoHtml, setPremiacaoHtml] = useState<string>("");
  const [cronogramaItems, setCronogramaItems] = useState<CronogramaItemInput[]>([]);
  const [cronogramaHtml, setCronogramaHtml] = useState<string>("");

  useEffect(() => {
    if (open && eventId) {
      loadEventData();
      loadOrganizers();
    }
  }, [open, eventId]);

  // Load organizers for admin
  const loadOrganizers = async () => {
    if (!open) return;
    setLoadingOrganizers(true);
    try {
      const response = await getOrganizers();
      if (response.success && response.data) {
        setOrganizers(response.data);
      }
    } catch (error: any) {
      console.error("Erro ao carregar organizadores:", error);
      toast({
        title: "Erro",
        description: "Erro ao carregar lista de organizadores",
        variant: "destructive",
      });
    } finally {
      setLoadingOrganizers(false);
    }
  };

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (!open) {
      setPremiacaoHtml("");
      setCronogramaItems([]);
      setCronogramaHtml("");
    }
  }, [open]);

  const loadEventData = async () => {
    if (!eventId) return;

    setLoading(true);
    try {
      // Get event data
      const eventResponse = await getEventById(eventId);
      
      if (!eventResponse.success || !eventResponse.data) {
        throw new Error("Erro ao carregar evento");
      }

      const eventData = eventResponse.data;
      setEvent(eventData);
      const autoMode = eventData.registration_auto_mode || false;
      
      // Set organizer ID for admin editing
      if (eventData.organizer_id) {
        setSelectedOrganizerId(eventData.organizer_id);
      }
      
      // Converter event_date para separar data e horário
      const eventDateTime = eventData.event_date ? isoToDatetimeLocal(eventData.event_date) : "";
      const [eventDate, eventTime] = eventDateTime ? eventDateTime.split('T') : ["", ""];
      
      setFormData({
        title: eventData.title || "",
        description: eventData.description || "",
        event_date: eventDate || "",
        event_time: eventTime || "",
        location: eventData.location || "",
        city: eventData.city || "",
        state: eventData.state || "",
        status: eventData.status || "draft",
        banner_url: eventData.banner_url || "",
        regulation_url: eventData.regulation_url || "",
        registration_status: eventData.registration_status || null,
        registration_start_date: eventData.registration_start_date || null,
        registration_end_date: eventData.registration_end_date || null,
        registration_auto_mode: autoMode,
        pix_enabled: eventData.pix_enabled !== null && eventData.pix_enabled !== undefined ? eventData.pix_enabled : true,
        pix_disabled_at: eventData.pix_disabled_at || null,
        credit_card_enabled: eventData.credit_card_enabled !== null && eventData.credit_card_enabled !== undefined ? eventData.credit_card_enabled : true,
        credit_card_disabled_at: eventData.credit_card_disabled_at || null,
        transfers_enabled: eventData.transfers_enabled !== false,
        transfer_until: eventData.transfer_until
          ? String(eventData.transfer_until).slice(0, 10)
          : "",
      });
      setRegistrationAutoMode(autoMode);
      setPremiacaoHtml(eventData.premiacao ?? "");
      setCronogramaHtml(eventData.cronograma ?? "");
      const items = (eventData.cronograma_items ?? []).map((it: { time: string; title: string; description?: string | null; display_order: number }) => ({
        time: it.time,
        title: it.title,
        description: it.description ?? null,
        display_order: it.display_order,
      }));
      setCronogramaItems(items);

      const regCountRes = await getRegistrations({ event_id: eventId }, { page: 1, page_size: 30 });
      if (regCountRes.success && regCountRes.data && typeof regCountRes.data === "object" && "total" in regCountRes.data) {
        setRegistrationTotalCount(regCountRes.data.total);
      } else {
        setRegistrationTotalCount(0);
      }

      // Load modalities
      try {
        const modalitiesResponse = await getModalities(eventId);
        if (modalitiesResponse.success && modalitiesResponse.data) {
          setModalities(modalitiesResponse.data);
        } else {
          setModalities([]);
        }
      } catch (error) {
        console.error("Error loading modalities:", error);
        setModalities([]);
      }

      // Load categories
      try {
        const categoriesResponse = await getCategories(eventId);
        if (categoriesResponse.success && categoriesResponse.data) {
          const categoriesWithBatches = categoriesResponse.data.map((cat: any) => ({
            ...cat,
            batches: cat.batches || [],
            custom_fields: cat.custom_fields || [],
          }));
          setCategories(categoriesWithBatches);
        } else {
      setCategories([]);
        }
      } catch (error) {
        console.error("Error loading categories:", error);
        setCategories([]);
      }

      // Load kits
      try {
        const kitsResponse = await getEventKits(eventId, { context: 'management' });
        if (kitsResponse.success && kitsResponse.data) {
          setKits(kitsResponse.data);
        } else {
      setKits([]);
        }
      } catch (error) {
        console.error("Error loading kits:", error);
        setKits([]);
      }

      // Load pickup locations
      try {
        const pickupResponse = await getEventPickupLocations(eventId);
        if (pickupResponse.success && pickupResponse.data) {
          // Format locations with new structure (name, pickup_schedule)
          const formattedLocations = pickupResponse.data.map(loc => {
            // If pickup_schedule exists, use it; otherwise, create from pickup_date for backward compatibility
            let pickup_schedule = loc.pickup_schedule || [];
            if (pickup_schedule.length === 0 && loc.pickup_date) {
              const date = new Date(loc.pickup_date);
              const dateStr = date.toISOString().split('T')[0];
              const timeStr = date.toTimeString().slice(0, 5);
              pickup_schedule = [{
                date: dateStr,
                time_slots: [{
                  start_time: timeStr,
                  end_time: new Date(date.getTime() + 4 * 60 * 60 * 1000).toTimeString().slice(0, 5), // +4 hours
                }],
              }];
            }
            return {
              ...loc,
              name: loc.name || "",
              pickup_schedule: pickup_schedule,
              latitude: loc.latitude?.toString() || "",
              longitude: loc.longitude?.toString() || "",
            };
          });
          setPickupLocations(formattedLocations);
        } else {
          setPickupLocations([]);
        }
      } catch (error) {
        console.error("Error loading pickup locations:", error);
        setPickupLocations([]);
      }
    } catch (error: any) {
      toast({
        title: "Erro ao carregar evento",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Modalidades functions
  const addModality = () => {
    setModalities([...modalities, { name: "", distance: "", max_participants: null, route_image_url: null, id: `temp-${Date.now()}` }]);
  };

  const removeModality = (index: number) => {
    setModalities(modalities.filter((_, i) => i !== index));
  };

  const updateModalityLocal = (index: number, field: string, value: any) => {
    const updated = [...modalities];
    updated[index] = { ...updated[index], [field]: value };
    setModalities(updated);
  };

  const moveModalityUp = (index: number) => {
    if (index === 0) return;
    const updated = [...modalities];
    [updated[index], updated[index - 1]] = [updated[index - 1], updated[index]];
    setModalities(updated);
  };

  const moveModalityDown = (index: number) => {
    if (index === modalities.length - 1) return;
    const updated = [...modalities];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    setModalities(updated);
  };

  // Categories functions
  const addCategory = () => {
    setCategories([
      ...categories,
      {
        name: "",
        price: 0,
        category_type: "geral" as CategoryTypeEnum,
        gender: "ambos" as CategoryGender,
        min_age: null,
        max_age: null,
        max_participants: null,
        is_default: categories.length === 0,
        modality_ids: [],
        id: `temp-${Date.now()}`,
        custom_fields: [],
      },
    ]);
  };

  const removeCategory = (index: number) => {
    setCategories(categories.filter((_, i) => i !== index));
  };

  const updateCategoryLocal = (index: number, field: string, value: any) => {
    const updated = [...categories];
    updated[index] = { ...updated[index], [field]: value };
    setCategories(updated);
  };

  const toggleCategoryModality = (categoryIndex: number, modalityId: string | undefined, modalityIndex?: number) => {
    const category = categories[categoryIndex];
    const currentIds = category.modality_ids || [];
    const idToUse = modalityId || `temp-${modalityIndex}`;
    const newIds = currentIds.includes(idToUse)
      ? currentIds.filter(id => id !== idToUse)
      : [...currentIds, idToUse];
    updateCategoryLocal(categoryIndex, "modality_ids", newIds);
  };

  const moveCategoryUp = (index: number) => {
    if (index === 0) return;
    const updated = [...categories];
    [updated[index], updated[index - 1]] = [updated[index - 1], updated[index]];
    setCategories(updated);
  };

  const moveCategoryDown = (index: number) => {
    if (index === categories.length - 1) return;
    const updated = [...categories];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    setCategories(updated);
  };

  const isPendingCustomField = (f: { id: string }) => f.id.startsWith("temp-");
  const isCategorySaved = (c: any) => c.id && !c.id.startsWith("temp-");

  const refetchCategoriesForCustomFields = async () => {
    if (!eventId) return;
    const res = await getCategories(eventId);
    if (res.success && res.data) setCategories(res.data.map((cat: any) => ({ ...cat, batches: cat.batches || [], custom_fields: cat.custom_fields || [] })));
  };

  const addPendingCustomField = (categoryIndex: number, label: string, field_type: "text" | "number") => {
    const updated = [...categories];
    const cat = updated[categoryIndex];
    const list = cat.custom_fields || [];
    const newField: CategoryCustomField = {
      id: `temp-cf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      category_id: cat.id ?? "",
      label: label.trim(),
      field_type,
      display_order: list.length,
      created_at: "",
      updated_at: "",
    };
    updated[categoryIndex] = { ...cat, custom_fields: [...list, newField] };
    setCategories(updated);
    setCustomFieldAddingCategoryIndex(null);
  };

  const updatePendingCustomField = (categoryIndex: number, fieldId: string, label: string, field_type: "text" | "number") => {
    if (!fieldId.startsWith("temp-")) return;
    const updated = [...categories];
    const cat = updated[categoryIndex];
    const list = cat.custom_fields || [];
    updated[categoryIndex] = { ...cat, custom_fields: list.map((f) => (f.id === fieldId ? { ...f, label: label.trim(), field_type } : f)) };
    setCategories(updated);
    setCustomFieldEditing(null);
  };

  const removeCustomFieldLocal = (categoryIndex: number, fieldId: string) => {
    const updated = [...categories];
    const cat = updated[categoryIndex];
    updated[categoryIndex] = { ...cat, custom_fields: (cat.custom_fields || []).filter((f) => f.id !== fieldId) };
    setCategories(updated);
    setCustomFieldEditing(null);
  };

  const handleCreateCustomField = async (categoryIndex: number, label: string, field_type: "text" | "number") => {
    const category = categories[categoryIndex];
    if (!label.trim()) return;
    if (!isCategorySaved(category)) {
      addPendingCustomField(categoryIndex, label, field_type);
      toast({ title: "Campo adicionado", description: "Será salvo ao salvar o evento.", variant: "default" });
      return;
    }
    setCustomFieldSaving(true);
    try {
      const res = await createCategoryCustomField(category.id, { label: label.trim(), field_type });
      if (res.success) {
        await refetchCategoriesForCustomFields();
        setCustomFieldAddingCategoryIndex(null);
        toast({ title: "Campo adicionado", description: "Campo personalizado criado com sucesso.", variant: "default" });
      } else {
        toast({ title: "Erro", description: res.message || res.error || "Não foi possível criar o campo.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "Não foi possível criar o campo.", variant: "destructive" });
    } finally {
      setCustomFieldSaving(false);
    }
  };

  const handleUpdateCustomField = async (categoryId: string, fieldId: string, label: string, field_type: "text" | "number") => {
    if (!label.trim()) return;
    setCustomFieldSaving(true);
    try {
      const res = await updateCategoryCustomField(categoryId, fieldId, { label: label.trim(), field_type });
      if (res.success) {
        await refetchCategoriesForCustomFields();
        setCustomFieldEditing(null);
        toast({ title: "Campo atualizado", description: "Campo personalizado atualizado com sucesso.", variant: "default" });
      } else {
        toast({ title: "Erro", description: res.message || res.error || "Não foi possível atualizar.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "Não foi possível atualizar.", variant: "destructive" });
    } finally {
      setCustomFieldSaving(false);
    }
  };

  const handleDeleteCustomField = async (categoryId: string, fieldId: string) => {
    if (!confirm("Remover este campo personalizado? Os valores já preenchidos em inscrições serão mantidos.")) return;
    setCustomFieldSaving(true);
    try {
      const res = await deleteCategoryCustomField(categoryId, fieldId);
      if (res.success) {
        await refetchCategoriesForCustomFields();
        setCustomFieldEditing(null);
        toast({ title: "Campo removido", description: "Campo personalizado removido.", variant: "default" });
      } else {
        toast({ title: "Erro", description: res.message || res.error || "Não foi possível remover.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "Não foi possível remover.", variant: "destructive" });
    } finally {
      setCustomFieldSaving(false);
    }
  };

  // Batch functions
  const addBatchToCategory = (categoryIndex: number) => {
    const updated = [...categories];
    const category = updated[categoryIndex];
    const currentBatches = category.batches || [];
    updated[categoryIndex] = {
      ...category,
      batches: [
        ...currentBatches,
        {
          id: `temp-batch-${Date.now()}`,
          category_id: category.id || "",
          name: null,
          price: category.price || 0,
          valid_from: null,
          valid_to: null,
          created_at: new Date().toISOString(),
        },
      ],
    };
    setCategories(updated);
  };

  const removeBatchFromCategory = (categoryIndex: number, batchIndex: number) => {
    const updated = [...categories];
    const category = updated[categoryIndex];
    const currentBatches = category.batches || [];
    updated[categoryIndex] = {
      ...category,
      batches: currentBatches.filter((_, i) => i !== batchIndex),
    };
    setCategories(updated);
  };

  const updateBatchLocal = (categoryIndex: number, batchIndex: number, field: string, value: any) => {
    const updated = [...categories];
    const category = updated[categoryIndex];
    const currentBatches = category.batches || [];
    const updatedBatches = [...currentBatches];
    updatedBatches[batchIndex] = { ...updatedBatches[batchIndex], [field]: value };
    updated[categoryIndex] = {
      ...category,
      batches: updatedBatches,
    };
    setCategories(updated);
  };

  // Kits functions
  const addKit = () => {
    setKits([...kits, { name: "", description: "", price: 0, products: [], category_ids: [], is_visible: true, id: `temp-${Date.now()}` }]);
  };

  const toggleKitVisibility = (index: number) => {
    const kit = kits[index];
    updateKitLocal(index, "is_visible", kit.is_visible === false);
  };

  const removeKit = (index: number) => {
    const kit = kits[index];
    if (kit?.id && !String(kit.id).startsWith("temp-")) {
      const confirmed = window.confirm(
        "Se este kit possuir inscrições vinculadas, ele será apenas desativado para novas inscrições e continuará preservado no histórico. Deseja continuar?"
      );
      if (!confirmed) return;
      toast({
        title: "Kit será desativado se tiver inscrições",
        description: "Por segurança, kits vinculados a inscrições não são excluídos fisicamente. Eles deixam de aparecer para novas inscrições, mas continuam no histórico.",
      });
    }
    setKits(kits.filter((_, i) => i !== index));
  };

  const updateKitLocal = (index: number, field: string, value: any) => {
    const updated = [...kits];
    updated[index] = { ...updated[index], [field]: value };
    setKits(updated);
  };

  // Product functions
  const addProduct = (kitIndex: number) => {
    const updated = [...kits];
    if (!updated[kitIndex].products) {
      updated[kitIndex].products = [];
    }
    updated[kitIndex].products.push({
      name: "",
      description: "",
      type: "unique" as "unique" | "variable",
      image_url: "",
      variants: [],
    });
    setKits(updated);
  };

  const removeProduct = (kitIndex: number, productIndex: number) => {
    const updated = [...kits];
    updated[kitIndex].products = updated[kitIndex].products.filter((_, i) => i !== productIndex);
    setKits(updated);
  };

  const updateProduct = (kitIndex: number, productIndex: number, field: string, value: any) => {
    const updated = [...kits];
    updated[kitIndex].products[productIndex] = {
      ...updated[kitIndex].products[productIndex],
      [field]: value,
    };
    setKits(updated);
  };

  // Variant functions
  const addVariant = (kitIndex: number, productIndex: number) => {
    const updated = [...kits];
    const product = updated[kitIndex].products[productIndex];
    const groupName = product.variants && product.variants.length > 0 
      ? product.variants[0].variant_group_name 
      : null;
    if (!updated[kitIndex].products[productIndex].variants) {
      updated[kitIndex].products[productIndex].variants = [];
    }
    updated[kitIndex].products[productIndex].variants.push({
      name: "",
      variant_group_name: groupName,
      available_quantity: null,
      sku: "",
      price: null,
    });
    setKits(updated);
  };

  const removeVariant = (kitIndex: number, productIndex: number, variantIndex: number) => {
    const updated = [...kits];
    updated[kitIndex].products[productIndex].variants = updated[kitIndex].products[productIndex].variants.filter(
      (_, i) => i !== variantIndex
    );
    setKits(updated);
  };

  const updateVariant = (
    kitIndex: number,
    productIndex: number,
    variantIndex: number,
    field: string,
    value: any
  ) => {
    const updated = [...kits];
    if (field === 'available_quantity' || field === 'price') {
      updated[kitIndex].products[productIndex].variants[variantIndex][field] = 
        value === '' || value === null ? null : (typeof value === 'number' ? value : parseFloat(value) || null);
    } else {
      updated[kitIndex].products[productIndex].variants[variantIndex][field] = value;
    }
    setKits(updated);
  };

  // Pickup locations functions
  const addPickupLocation = () => {
    setPickupLocations([
      ...pickupLocations,
      {
        name: "",
        address: "",
        additional_info: "",
        pickup_schedule: [
          {
            date: "",
            time_slots: [
              {
                start_time: "",
                end_time: "",
              },
            ],
          },
        ],
        latitude: "",
        longitude: "",
        id: `temp-${Date.now()}`,
      },
    ]);
  };

  const removePickupLocation = (index: number) => {
    setPickupLocations(pickupLocations.filter((_, i) => i !== index));
  };

  const updatePickupLocationLocal = (index: number, field: string, value: any) => {
    const updated = [...pickupLocations];
    updated[index] = { ...updated[index], [field]: value };
    setPickupLocations(updated);
  };

  const addPickupDate = (locationIndex: number) => {
    const updated = [...pickupLocations];
    updated[locationIndex].pickup_schedule = updated[locationIndex].pickup_schedule || [];
    updated[locationIndex].pickup_schedule.push({
      date: "",
      time_slots: [
        {
          start_time: "",
          end_time: "",
        },
      ],
    });
    setPickupLocations(updated);
  };

  const removePickupDate = (locationIndex: number, dateIndex: number) => {
    const updated = [...pickupLocations];
    updated[locationIndex].pickup_schedule = updated[locationIndex].pickup_schedule.filter(
      (_, i) => i !== dateIndex
    );
    setPickupLocations(updated);
  };

  const updatePickupDate = (locationIndex: number, dateIndex: number, date: string) => {
    const updated = [...pickupLocations];
    updated[locationIndex].pickup_schedule[dateIndex].date = date;
    setPickupLocations(updated);
  };

  const addPickupTimeSlot = (locationIndex: number, dateIndex: number) => {
    const updated = [...pickupLocations];
    updated[locationIndex].pickup_schedule[dateIndex].time_slots.push({
      start_time: "",
      end_time: "",
    });
    setPickupLocations(updated);
  };

  const removePickupTimeSlot = (locationIndex: number, dateIndex: number, timeSlotIndex: number) => {
    const updated = [...pickupLocations];
    updated[locationIndex].pickup_schedule[dateIndex].time_slots = updated[locationIndex].pickup_schedule[dateIndex].time_slots.filter(
      (_, i) => i !== timeSlotIndex
    );
    setPickupLocations(updated);
  };

  const updatePickupTimeSlot = (
    locationIndex: number,
    dateIndex: number,
    timeSlotIndex: number,
    field: "start_time" | "end_time",
    value: string
  ) => {
    const updated = [...pickupLocations];
    updated[locationIndex].pickup_schedule[dateIndex].time_slots[timeSlotIndex][field] = value;
    setPickupLocations(updated);
  };

  const addCronogramaItem = () => {
    setCronogramaItems((prev) => [
      ...prev,
      { time: "07:00", title: "", description: null, display_order: prev.length + 1 },
    ]);
  };
  const removeCronogramaItem = (index: number) => {
    setCronogramaItems((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.map((it, i) => ({ ...it, display_order: i + 1 }));
    });
  };
  const updateCronogramaItem = (index: number, field: keyof CronogramaItemInput, value: string | number | null) => {
    setCronogramaItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };
  const moveCronogramaUp = (index: number) => {
    if (index === 0) return;
    setCronogramaItems((prev) => {
      const next = [...prev];
      [next[index], next[index - 1]] = [next[index - 1], next[index]];
      return next.map((it, i) => ({ ...it, display_order: i + 1 }));
    });
  };
  const moveCronogramaDown = (index: number) => {
    if (index === cronogramaItems.length - 1) return;
    setCronogramaItems((prev) => {
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next.map((it, i) => ({ ...it, display_order: i + 1 }));
    });
  };
  const hasDuplicateCronogramaTimes = () => {
    const times = cronogramaItems.map((it) => it.time.trim()).filter(Boolean);
    return times.length !== new Set(times).size;
  };

  const handleSave = async () => {
    if (!eventId) return;

    setSaving(true);
    try {
      // Combinar data e horário em ISO datetime
      let eventDateISO: string | null = null;
      if (formData.event_date) {
        const datetimeLocal = formData.event_time 
          ? `${formData.event_date}T${formData.event_time}`
          : `${formData.event_date}T00:00`;
        eventDateISO = datetimeLocalToISO(datetimeLocal);
      }
      
      const normalizedCronogramaItems = cronogramaItems
        .filter((it) => (it.title ?? "").trim().length > 0 && (it.time ?? "").trim().length > 0)
        .map((it, i) => ({
          time: it.time.trim(),
          title: it.title.trim(),
          description: (it.description ?? "").trim() || null,
          display_order: i + 1,
        }));

      // Prepare event data with organizer_id if changed
      const transferUntilTrimmed = (formData.transfer_until ?? "").trim();
      const eventUpdateData: any = {
        ...formData,
        event_date: eventDateISO || undefined,
        premiacao: premiacaoHtml?.trim() || null,
        cronograma: cronogramaHtml?.trim() || null,
        cronograma_items: normalizedCronogramaItems,
        transfers_enabled: formData.transfers_enabled !== false,
        transfer_until: transferUntilTrimmed ? transferUntilTrimmed.slice(0, 10) : null,
      };
      
      // Remover event_time do objeto antes de enviar (não é um campo do backend)
      delete eventUpdateData.event_time;
      
      // Include organizer_id if it was changed
      // Only update if selectedOrganizerId is set and different from current
      if (selectedOrganizerId && selectedOrganizerId !== "self" && selectedOrganizerId !== event?.organizer_id) {
        eventUpdateData.organizer_id = selectedOrganizerId;
        console.log('🔄 Atualizando organizador do evento:', {
          current: event?.organizer_id,
          new: selectedOrganizerId,
          eventId: eventId
        });
      } else if (selectedOrganizerId === "self" && event?.organizer_id) {
        // If "self" is selected, keep current organizer
        console.log('✅ Mantendo organizador atual:', event?.organizer_id);
      }
      
      // Update event basic info
      const response = await updateEvent(eventId, eventUpdateData);

      if (!response.success) {
        throw new Error(response.error || "Erro ao atualizar evento");
      }

      let modalitiesToDelete: string[] = [];
      // Sync modalities (create/update only; delete after categories sync)
      try {
        const existingModalitiesResponse = await getModalities(eventId);
        const existingModalities = existingModalitiesResponse.success && existingModalitiesResponse.data 
          ? existingModalitiesResponse.data 
          : [];
        
        const modalitiesToCreate = modalities.filter(m => (!m.id || m.id.startsWith('temp-')) && m.name && m.distance);
        const modalitiesToUpdate = modalities.filter(m => m.id && !m.id.startsWith('temp-') && m.name && m.distance);
        const existingIds = existingModalities.map(m => m.id);
        const currentIds = modalities.filter(m => m.id && !m.id.startsWith('temp-')).map(m => m.id!);
        modalitiesToDelete = existingIds.filter(id => !currentIds.includes(id));
        
        // Create new modalities
        const createdModalities: any[] = [];
        for (const modality of modalitiesToCreate) {
          const createResponse = await createModality({
            event_id: eventId,
            name: modality.name,
            distance: modality.distance,
            max_participants: modality.max_participants ?? null,
            route_image_url: modality.route_image_url ?? null,
          });
          if (createResponse.success && createResponse.data) {
            createdModalities.push(createResponse.data);
          }
        }
        
        // Update existing modalities (only those with real IDs, not temp IDs)
        for (const modality of modalitiesToUpdate) {
          if (modality.id && !modality.id.startsWith('temp-')) {
            await updateModality(modality.id, {
              name: modality.name,
              distance: modality.distance,
              max_participants: modality.max_participants ?? null,
              route_image_url: modality.route_image_url ?? null,
            });
          }
        }
        
        // Do not delete modalities here; categories may still reference them. Delete after categories sync.

        // Reorder modalities - reload to get all IDs (including newly created ones)
        const reloadModalitiesResponse = await getModalities(eventId);
        if (reloadModalitiesResponse.success && reloadModalitiesResponse.data) {
          const savedModalities = reloadModalitiesResponse.data;
          if (savedModalities.length > 1) {
            // Map local modalities to saved modalities by name and distance
            const modalityOrders = modalities
              .map((localMod, index) => {
                // Find saved modality by matching name and distance
                const savedMod = savedModalities.find(sm => 
                  sm.name === localMod.name && sm.distance === localMod.distance
                );
                return savedMod ? { id: savedMod.id, display_order: index + 1 } : null;
              })
              .filter((order): order is { id: string; display_order: number } => order !== null);
            
            if (modalityOrders.length > 1) {
              await reorderModalities(eventId, { modalityOrders });
            }
          }
        }
        
        // Store final modalities for category mapping
        const finalModalitiesForCategories = reloadModalitiesResponse.success && reloadModalitiesResponse.data 
          ? reloadModalitiesResponse.data 
          : [];
      } catch (error: any) {
        console.error('Error syncing modalities:', error);
        toast({
          title: "Aviso",
          description: "Evento atualizado, mas houve erro ao salvar modalidades",
          variant: "destructive",
        });
      }

      // Sync categories
      try {
        const existingCategoriesResponse = await getCategories(eventId);
        const existingCategories = existingCategoriesResponse.success && existingCategoriesResponse.data 
          ? existingCategoriesResponse.data 
          : [];
        
        // Map temporary modality IDs to real IDs
        const finalModalitiesResponse = await getModalities(eventId);
        const finalModalities = finalModalitiesResponse.success && finalModalitiesResponse.data 
          ? finalModalitiesResponse.data 
          : [];
        
        const mapModalityIds = (modalityIds: string[]): string[] => {
          return modalityIds
            .map(id => {
              if (id && id.startsWith('temp-')) {
                const tempModality = modalities.find(m => m.id === id);
                if (tempModality) {
                  const createdModality = finalModalities.find(fm => 
                    fm.name === tempModality.name && fm.distance === tempModality.distance
                  );
                  return createdModality?.id || null;
                }
                return null;
              }
              return id;
            })
            .filter((id): id is string => id !== null && id !== undefined)
            .filter(id => !modalitiesToDelete.includes(id));
        };
        
        // Ensure only one default category
        let categoriesToProcess = [...categories];
        const defaultCategories = categoriesToProcess.filter(c => c.is_default === true);
        if (defaultCategories.length > 1) {
          const firstDefaultIndex = categoriesToProcess.findIndex(c => c.is_default === true);
          categoriesToProcess = categoriesToProcess.map((cat, idx) => ({
            ...cat,
            is_default: idx === firstDefaultIndex,
          }));
        }
        
        const categoriesToCreate = categoriesToProcess.filter(c => (!c.id || (c.id && c.id.startsWith('temp-'))) && c.name && c.name.trim().length > 0 && c.price >= 0);
        const categoriesToUpdate = categoriesToProcess.filter(c => c.id && !c.id.startsWith('temp-') && c.name && c.name.trim().length > 0 && c.price >= 0);
        const existingCategoryIds = existingCategories.map(c => c.id);
        const currentCategoryIds = categoriesToProcess.filter(c => c.id && !c.id.startsWith('temp-')).map(c => c.id!);
        const categoriesToDelete = existingCategoryIds.filter(id => !currentCategoryIds.includes(id));
        
        // Create new categories
        for (const category of categoriesToCreate) {
          await createCategory({
            event_id: eventId,
            name: category.name,
            price: category.price,
            category_type: category.category_type,
            gender: category.gender,
            min_age: category.min_age,
            max_age: category.max_age,
            max_participants: category.max_participants,
            is_default: category.is_default,
            modality_ids: mapModalityIds(category.modality_ids || []),
          });
        }
        
        // Update existing categories
        for (const category of categoriesToUpdate) {
          if (category.id) {
            console.log('📤 Atualizando categoria com max_age:', {
              name: category.name,
              min_age: category.min_age,
              max_age: category.max_age,
            });
            await updateCategory(category.id, {
              name: category.name,
              price: category.price,
              category_type: category.category_type,
              gender: category.gender,
              min_age: category.min_age ?? null,
              max_age: category.max_age ?? null,
              max_participants: category.max_participants ?? null,
              is_default: category.is_default,
              modality_ids: mapModalityIds(category.modality_ids || []),
            });
          }
        }
        
        // Delete removed categories
        for (const id of categoriesToDelete) {
          await deleteCategory(id);
        }
        
        // Reorder categories and get saved categories for batch sync
        const reloadCategoriesResponse = await getCategories(eventId);
        let savedCategories: any[] = [];
        if (reloadCategoriesResponse.success && reloadCategoriesResponse.data) {
          savedCategories = reloadCategoriesResponse.data;
          if (savedCategories.length > 1) {
            const categoryOrders = categoriesToProcess
              .map((localCat, index) => {
                const savedCat = savedCategories.find(sc => 
                  sc.name === localCat.name && sc.price === localCat.price
                );
                return savedCat ? { id: savedCat.id, display_order: index + 1 } : null;
              })
              .filter((order): order is { id: string; display_order: number } => order !== null);
            
            if (categoryOrders.length > 1) {
              await reorderCategories(eventId, { categoryOrders });
            }
          }
        }

        // Sync batches for all categories
        try {
          // Reload categories to get all IDs (including newly created ones)
          const finalCategoriesResponse = await getCategories(eventId);
          const finalCategories = finalCategoriesResponse.success && finalCategoriesResponse.data
            ? finalCategoriesResponse.data
            : savedCategories;

          for (const category of categoriesToProcess) {
            let categoryId = category.id;
            
            if (!categoryId || categoryId.startsWith('temp-')) {
              // Find the saved category by name and price
              const savedCategory = finalCategories.find(sc => 
                sc.name === category.name && sc.price === category.price
              );
              if (!savedCategory) continue;
              categoryId = savedCategory.id;
            }

            const categoryBatches = category.batches || [];
            
            // Get existing batches for this category
            const existingBatchesResponse = await getCategoryBatches(categoryId);
            const existingBatches = existingBatchesResponse.success && existingBatchesResponse.data
              ? existingBatchesResponse.data
              : [];
            
            const existingBatchIds = new Set(existingBatches.map(b => b.id));
            const currentBatchIds = new Set(
              categoryBatches
                .filter(b => b.id && !b.id.startsWith('temp-'))
                .map(b => b.id!)
            );

            // Delete batches that were removed
            const batchesToDelete = existingBatches.filter(b => !currentBatchIds.has(b.id));
            for (const batch of batchesToDelete) {
              await deleteCategoryBatch(categoryId, batch.id);
            }

            // Create or update batches
            for (const batch of categoryBatches) {
              // Normalize dates: convert to ISO string or null
              const validFrom = batch.valid_from ? (typeof batch.valid_from === 'string' ? batch.valid_from : new Date(batch.valid_from).toISOString()) : null;
              const validTo = batch.valid_to ? (typeof batch.valid_to === 'string' ? batch.valid_to : new Date(batch.valid_to).toISOString()) : null;
              
              console.log('📅 Enviando batch com datas:', {
                batch_id: batch.id,
                valid_from: validFrom,
                valid_to: validTo,
                valid_from_type: typeof batch.valid_from,
                valid_to_type: typeof batch.valid_to,
              });

              if (batch.id && batch.id.startsWith('temp-')) {
                // Create new batch
                const createResponse = await createCategoryBatch(categoryId, {
                  name: batch.name || null,
                  price: batch.price,
                  valid_from: validFrom,
                  valid_to: validTo,
                });
                console.log('✅ Batch criado:', createResponse);
              } else if (batch.id && existingBatchIds.has(batch.id)) {
                // Update existing batch
                const updateResponse = await updateCategoryBatch(categoryId, batch.id, {
                  name: batch.name || null,
                  price: batch.price,
                  valid_from: validFrom,
                  valid_to: validTo,
                });
                console.log('✅ Batch atualizado:', updateResponse);
              }
            }

            // Sync custom fields (create pending/temp ones)
            const customFields = category.custom_fields || [];
            for (const cf of customFields) {
              if (cf.id.startsWith('temp-')) {
                try {
                  await createCategoryCustomField(categoryId, {
                    label: cf.label,
                    field_type: cf.field_type,
                    display_order: cf.display_order ?? 0,
                  });
                } catch (err: any) {
                  console.error('Error creating custom field:', err);
                }
              }
            }
          }

          // Reload categories to get custom_fields with real IDs
          const afterCfReload = await getCategories(eventId);
          if (afterCfReload.success && afterCfReload.data) {
            setCategories(afterCfReload.data.map((cat: any) => ({ ...cat, batches: cat.batches || [], custom_fields: cat.custom_fields || [] })));
          }
        } catch (error: any) {
          console.error('Error syncing batches/custom fields:', error);
          toast({
            title: "Aviso",
            description: "Evento atualizado, mas houve erro ao salvar lotes ou campos personalizados",
            variant: "destructive",
          });
        }
      } catch (error: any) {
        console.error('Error syncing categories:', error);
        toast({
          title: "Aviso",
          description: "Evento atualizado, mas houve erro ao salvar categorias",
          variant: "destructive",
        });
      }

      // Excluir modalidades removidas somente após as categorias não as referenciarem
      for (const id of modalitiesToDelete) {
        try {
          await deleteModality(id);
        } catch (err: any) {
          console.error('Error deleting modality:', err);
        }
      }

      // Sync kits
      try {
        const kitsData = kits
          .filter(kit => kit.name && kit.name.trim())
          .map((kit, index) => ({
            id: kit.id && !kit.id.startsWith('temp-') ? kit.id : undefined,
            name: kit.name,
            description: kit.description || null,
            price: kit.price,
            display_order: kit.display_order !== undefined ? kit.display_order : index,
            category_ids: Array.isArray(kit.category_ids) ? kit.category_ids : [],
            is_visible: kit.is_visible !== false,
            products: kit.products || [],
          }));
        
        const kitsResponse = await syncEventKits(eventId, kitsData);
        if (!kitsResponse.success) {
          toast({
            title: "Não foi possível salvar os kits",
            description: kitsResponse.message || kitsResponse.error || "Evento atualizado, mas houve erro ao salvar kits.",
            variant: "destructive",
          });
        } else if (kitsResponse.data) {
          setKits(kitsResponse.data);
        }
      } catch (error: any) {
        console.error('Error syncing kits:', error);
        toast({
          title: "Não foi possível salvar os kits",
          description: error?.message || "Evento atualizado, mas houve erro ao salvar kits.",
          variant: "destructive",
        });
      }

      // Sync pickup locations
      try {
        const existingLocationsResponse = await getEventPickupLocations(eventId);
        const existingLocations = existingLocationsResponse.success && existingLocationsResponse.data 
          ? existingLocationsResponse.data 
          : [];
        
        const locationsToCreate = pickupLocations.filter(l => (!l.id || l.id.startsWith('temp-')) && l.address && l.pickup_schedule && l.pickup_schedule.length > 0);
        const locationsToUpdate = pickupLocations.filter(l => l.id && !l.id.startsWith('temp-') && l.address && l.pickup_schedule && l.pickup_schedule.length > 0);
        const existingLocationIds = existingLocations.map(l => l.id);
        const currentLocationIds = pickupLocations.filter(l => l.id && !l.id.startsWith('temp-')).map(l => l.id!);
        const locationsToDelete = existingLocationIds.filter(id => !currentLocationIds.includes(id));
        
        // Create new locations
        for (const location of locationsToCreate) {
          await createPickupLocation(eventId, {
            name: location.name || null,
            address: location.address,
            additional_info: location.additional_info || null,
            pickup_schedule: location.pickup_schedule || [],
            latitude: location.latitude ? parseFloat(location.latitude) : null,
            longitude: location.longitude ? parseFloat(location.longitude) : null,
          });
        }
        
        // Update existing locations
        for (const location of locationsToUpdate) {
          if (location.id) {
            await updatePickupLocation(eventId, location.id, {
              name: location.name || null,
              address: location.address,
              additional_info: location.additional_info || null,
              pickup_schedule: location.pickup_schedule || [],
              latitude: location.latitude ? parseFloat(location.latitude) : null,
              longitude: location.longitude ? parseFloat(location.longitude) : null,
            });
          }
        }
        
        // Delete removed locations
        for (const id of locationsToDelete) {
          await deletePickupLocation(eventId, id);
        }
      } catch (error: any) {
        console.error('Error syncing pickup locations:', error);
        toast({
          title: "Aviso",
          description: "Evento atualizado, mas houve erro ao salvar locais de retirada",
          variant: "destructive",
        });
      }

      toast({
        title: "Evento atualizado",
        description: "As alterações foram salvas com sucesso.",
      });

      setMode("view");
      onSuccess?.();
      loadEventData();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: any = {
      draft: "secondary",
      published: "default",
      ongoing: "default",
      finished: "outline",
      cancelled: "destructive",
    };
    return <Badge variant={variants[status] || "secondary"}>{status}</Badge>;
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="fixed inset-0 z-50 w-screen h-screen max-w-none translate-x-0 translate-y-0 rounded-none border-0 bg-background p-6 overflow-y-auto data-[state=open]:zoom-in-100">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="fixed inset-0 z-50 w-screen h-screen max-w-none translate-x-0 translate-y-0 rounded-none border-0 bg-background p-6 overflow-y-auto data-[state=open]:zoom-in-100">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>
              {mode === "view" ? "Visualizar Evento" : "Editar Evento"}
            </DialogTitle>
            <div className="flex gap-2">
              {mode === "view" ? (
                <Button onClick={() => setMode("edit")}>Editar</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setMode("view")}>
                    Cancelar
                  </Button>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-10">
            <TabsTrigger value="details">Detalhes</TabsTrigger>
            <TabsTrigger value="premiacao">Premiação</TabsTrigger>
            <TabsTrigger value="cronograma">Cronograma</TabsTrigger>
            <TabsTrigger value="modalities">Modalidades</TabsTrigger>
            <TabsTrigger value="categories">Categorias</TabsTrigger>
            <TabsTrigger value="kits">Kits</TabsTrigger>
            <TabsTrigger value="pickup">Retirada</TabsTrigger>
            <TabsTrigger value="payment">Pagamentos</TabsTrigger>
            <TabsTrigger value="publish">Publicação</TabsTrigger>
            <TabsTrigger value="registrations">Inscrições</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="title">Título</Label>
                {mode === "view" ? (
                  <p className="text-sm">{formData.title}</p>
                ) : (
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="description">Descrição</Label>
                {mode === "view" ? (
                  <p className="text-sm">{formData.description || "Sem descrição"}</p>
                ) : (
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={4}
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="event_date">Data do Evento</Label>
                  {mode === "view" ? (
                    <p className="text-sm flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {formData.event_date && formData.event_time
                        ? `${new Date(`${formData.event_date}T${formData.event_time}`).toLocaleDateString("pt-BR")} às ${formData.event_time}`
                        : formData.event_date
                        ? new Date(`${formData.event_date}T00:00`).toLocaleDateString("pt-BR")
                        : "-"}
                    </p>
                  ) : (
                    <Input
                      id="event_date"
                      type="date"
                      value={formData.event_date}
                      onChange={(e) => setFormData({ ...formData, event_date: e.target.value })}
                    />
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="event_time">Horário do Evento</Label>
                  {mode === "view" ? (
                    <p className="text-sm flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {formData.event_time || "00:00"}
                    </p>
                  ) : (
                    <Input
                      id="event_time"
                      type="time"
                      value={formData.event_time}
                      onChange={(e) => setFormData({ ...formData, event_time: e.target.value })}
                    />
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="status">Status</Label>
                  {mode === "view" ? (
                    <div>{getStatusBadge(formData.status)}</div>
                  ) : (
                    <Select
                      value={formData.status}
                      onValueChange={(value) => setFormData({ ...formData, status: value as any })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Rascunho</SelectItem>
                        <SelectItem value="published">Publicado</SelectItem>
                        <SelectItem value="ongoing">Em andamento</SelectItem>
                        <SelectItem value="finished">Finalizado</SelectItem>
                        <SelectItem value="cancelled">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="location">Local</Label>
                {mode === "view" ? (
                  <p className="text-sm flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    {formData.location}
                  </p>
                ) : (
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="city">Cidade</Label>
                  {mode === "view" ? (
                    <p className="text-sm">{formData.city}</p>
                  ) : (
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    />
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="state">Estado</Label>
                  {mode === "view" ? (
                    <p className="text-sm">{formData.state}</p>
                  ) : (
                    <Input
                      id="state"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    />
                  )}
                </div>
              </div>

              {mode === "edit" ? (
                <div className="grid gap-2">
                  <Label htmlFor="organizer-select">Organizador</Label>
                  <Select
                    value={selectedOrganizerId || (event?.organizer_id || "self")}
                    onValueChange={(value) => {
                      if (value === "self") {
                        setSelectedOrganizerId(event?.organizer_id || "");
                      } else {
                        setSelectedOrganizerId(value);
                      }
                    }}
                    disabled={loadingOrganizers}
                  >
                    <SelectTrigger id="organizer-select">
                      <SelectValue placeholder={loadingOrganizers ? "Carregando organizadores..." : "Selecione um organizador"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="self">Manter organizador atual</SelectItem>
                      {organizers.map((organizer) => (
                        <SelectItem key={organizer.id} value={organizer.id}>
                          {organizer.name} ({organizer.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Altere o organizador responsável por este evento
                  </p>
                </div>
              ) : (
                event?.organizer_name && (
                <div className="grid gap-2">
                  <Label>Organizador</Label>
                  <p className="text-sm">{event.organizer_name}</p>
                </div>
                )
              )}

              <div className="grid gap-2">
                <Label htmlFor="banner_url">Banner do Evento</Label>
                {mode === "view" ? (
                  formData.banner_url ? (
                    <div className="relative w-full h-48 border rounded-md overflow-hidden bg-muted">
                      <img
                        src={formData.banner_url}
                        alt="Banner do evento"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhum banner definido</p>
                  )
                ) : (
                  <FileUpload
                    type="banner"
                    value={formData.banner_url || null}
                    onChange={(url) => setFormData({ ...formData, banner_url: url || "" })}
                    maxSize={5}
                    description="Imagem de destaque do evento (recomendado: 1200x600px). Você pode fazer upload de uma imagem ou inserir uma URL."
                  />
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="regulation_url">Regulamento (PDF)</Label>
                {mode === "view" ? (
                  formData.regulation_url ? (
                    <a
                      href={formData.regulation_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      Ver regulamento
                    </a>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhum regulamento definido</p>
                  )
                ) : (
                  <FileUpload
                    type="regulation"
                    value={formData.regulation_url || null}
                    onChange={(url) => setFormData({ ...formData, regulation_url: url || "" })}
                    maxSize={10}
                    description="Arquivo PDF do regulamento do evento. Você pode fazer upload de um arquivo PDF ou inserir uma URL."
                  />
                )}
              </div>

              <div className="rounded-lg border p-4 space-y-4">
                <div className="space-y-1">
                  <Label className="text-base">Transferências de inscrição</Label>
                  <p className="text-xs text-muted-foreground">
                    Define até que dia os corredores poderão solicitar transferência pelo site. O Super Admin continua
                    podendo transferir administrativamente.
                  </p>
                </div>
                {mode === "view" ? (
                  <div className="space-y-2 text-sm">
                    <p>
                      <span className="text-muted-foreground">Transferências: </span>
                      {formData.transfers_enabled !== false ? "Ativadas" : "Desativadas"}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Permitidas até: </span>
                      {formData.transfer_until
                        ? new Date(`${formData.transfer_until}T12:00:00`).toLocaleDateString("pt-BR")
                        : "Sem data limite"}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-row items-center justify-between gap-4">
                      <span className="text-sm font-medium">Permitir transferências</span>
                      <Switch
                        checked={formData.transfers_enabled !== false}
                        onCheckedChange={(checked) =>
                          setFormData((prev) => ({ ...prev, transfers_enabled: checked }))
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="admin-transfer-until">Transferências permitidas até</Label>
                      <Input
                        id="admin-transfer-until"
                        type="date"
                        value={formData.transfer_until || ""}
                        disabled={formData.transfers_enabled === false}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, transfer_until: e.target.value || "" }))
                        }
                        className="max-w-xs"
                      />
                      <p className="text-xs text-muted-foreground">
                        Opcional. Em branco = sem limite de data. Desativar transferências não remove a data salva;
                        ela permanece para quando reativar.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="premiacao" className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Premiação</h3>
              <p className="text-sm text-muted-foreground">
                Premiações do evento (pódios, categorias premiadas, etc.). Opcional.
              </p>
            </div>
            <RichTextEditor
              editorKey={eventId ?? "new"}
              value={premiacaoHtml}
              onChange={setPremiacaoHtml}
              placeholder="Descreva as premiações do evento…"
              minHeight={200}
              disabled={mode === "view"}
              className="mt-2"
            />
          </TabsContent>

          <TabsContent value="cronograma" className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Cronograma</h3>
              <p className="text-sm text-muted-foreground">
                Itens em formato de timeline (horário, título, descrição) e observações em texto livre. Opcional.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Ex.: 07:00 – Aquecimento | 08:00 – Largada 5km | 08:10 – Largada 10km | 09:30 – Premiação
            </p>
            {hasDuplicateCronogramaTimes() && (
              <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertTitle>Horários duplicados</AlertTitle>
                <AlertDescription>
                  Existem horários duplicados na lista. Verifique se está correto.
                </AlertDescription>
              </Alert>
            )}
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Itens da timeline</span>
              {mode === "edit" && (
                <Button type="button" onClick={addCronogramaItem} size="sm" disabled={cronogramaItems.length >= 50}>
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar horário
                </Button>
              )}
            </div>
            {cronogramaItems.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  Nenhum item. {mode === "edit" && 'Clique em "Adicionar horário" para começar.'}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {cronogramaItems.map((item, index) => (
                  <Card key={index}>
                    <CardContent className="pt-4 pb-4">
                      {mode === "view" ? (
                        <div className="flex gap-4">
                          <span className="font-mono text-sm font-medium w-14">{item.time}</span>
                          <div>
                            <p className="font-medium">{item.title}</p>
                            {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex gap-2 items-start">
                            <div className="flex flex-col gap-1 flex-shrink-0">
                              <Label className="text-xs">Horário</Label>
                              <Input
                                type="time"
                                value={item.time}
                                onChange={(e) => updateCronogramaItem(index, "time", e.target.value)}
                                className="w-[100px]"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <Label className="text-xs">Título (obrigatório, máx. 120)</Label>
                              <Input
                                placeholder="Ex: Largada 5km"
                                value={item.title}
                                onChange={(e) => updateCronogramaItem(index, "title", e.target.value)}
                                maxLength={120}
                              />
                            </div>
                            <div className="flex flex-col gap-1 flex-shrink-0">
                              <Button type="button" variant="ghost" size="icon" onClick={() => moveCronogramaUp(index)} disabled={index === 0} title="Mover para cima">
                                <ChevronUp className="h-4 w-4" />
                              </Button>
                              <Button type="button" variant="ghost" size="icon" onClick={() => moveCronogramaDown(index)} disabled={index === cronogramaItems.length - 1} title="Mover para baixo">
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                              <Button type="button" variant="ghost" size="icon" onClick={() => removeCronogramaItem(index)} title="Remover">
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                          <div className="mt-2">
                            <Label className="text-xs text-muted-foreground">Descrição (opcional)</Label>
                            <Input
                              placeholder="Detalhes do item"
                              value={item.description ?? ""}
                              onChange={(e) => updateCronogramaItem(index, "description", e.target.value)}
                              className="mt-1"
                            />
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            <div>
              <Label className="text-sm font-medium">Observações / informações adicionais (opcional)</Label>
              <RichTextEditor
                editorKey={`cronograma-admin-${eventId ?? "new"}`}
                value={cronogramaHtml}
                onChange={setCronogramaHtml}
                placeholder="Informações adicionais de cronograma em texto livre…"
                minHeight={120}
                disabled={mode === "view"}
                className="mt-2"
              />
            </div>
          </TabsContent>

          <TabsContent value="modalities" className="space-y-4">
            {mode === "edit" && (
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-lg font-semibold">Modalidades</h3>
                  <p className="text-sm text-muted-foreground">
                    Adicione as modalidades (distâncias) do evento
                  </p>
                </div>
                <Button type="button" onClick={addModality} size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar Modalidade
                </Button>
              </div>
            )}
            {modalities.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  Nenhuma modalidade adicionada ainda
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {modalities.map((modality, index) => (
                  <Card key={modality.id || index}>
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-base">
                          {mode === "edit" ? `Modalidade ${index + 1}` : modality.name}
                        </CardTitle>
                        {mode === "edit" && (
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => moveModalityUp(index)}
                              disabled={index === 0}
                              title="Mover para cima"
                            >
                              <ChevronUp className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => moveModalityDown(index)}
                              disabled={index === modalities.length - 1}
                              title="Mover para baixo"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeModality(index)}
                              title="Remover"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {mode === "edit" ? (
                        <>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-sm font-medium">
                              Nome da Modalidade
                            </label>
                            <Input
                              placeholder="Ex: Corrida 5km, Corrida 10km"
                              value={modality.name}
                              onChange={(e) =>
                                updateModalityLocal(index, "name", e.target.value)
                              }
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium">
                              Distância
                            </label>
                            <Input
                              placeholder="Ex: 5km, 10km, 21km, 42km"
                              value={modality.distance}
                              onChange={(e) =>
                                updateModalityLocal(index, "distance", e.target.value)
                              }
                            />
                          </div>
                        </div>
                          <div>
                            <label className="text-sm font-medium">
                              Limite de Inscrições (Opcional)
                            </label>
                            <Input
                              type="number"
                              min="1"
                              placeholder="Ex: 100 (deixe em branco para sem limite)"
                              value={modality.max_participants ?? ""}
                              onChange={(e) => {
                                const value = e.target.value === "" ? null : parseInt(e.target.value);
                                updateModalityLocal(index, "max_participants", value);
                              }}
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              Número máximo de participantes para esta modalidade. Deixe em branco para permitir inscrições ilimitadas.
                            </p>
                          </div>
                          <div>
                            <label className="text-sm font-medium">
                              Imagem do Percurso (Opcional)
                            </label>
                            <FileUpload
                              type="banner"
                              value={modality.route_image_url || ""}
                              onChange={(url) => updateModalityLocal(index, "route_image_url", url)}
                              onDelete={() => updateModalityLocal(index, "route_image_url", null)}
                              label="Upload da imagem do percurso"
                              description="Faça upload da imagem do percurso desta modalidade"
                            />
                          </div>
                        </>
                      ) : (
                        <div className="space-y-2">
                          <CardDescription>Distância: {modality.distance}</CardDescription>
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Ordem: {modality.display_order || 0}</span>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="categories" className="space-y-4">
            {mode === "edit" && (
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-lg font-semibold">Categorias</h3>
                  <p className="text-sm text-muted-foreground">
                    Configure as categorias de inscrição com restrições de tipo, gênero e idade
                  </p>
                </div>
                <Button type="button" onClick={addCategory} size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar Categoria
                </Button>
              </div>
            )}
              {categories.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  Nenhuma categoria adicionada ainda
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {categories.map((category, index) => (
                  <Card key={category.id || index}>
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-base">
                          {mode === "edit" ? `Categoria ${index + 1}` : category.name}
                        </CardTitle>
                        {mode === "edit" && (
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => moveCategoryUp(index)}
                              disabled={index === 0}
                              title="Mover para cima"
                            >
                              <ChevronUp className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => moveCategoryDown(index)}
                              disabled={index === categories.length - 1}
                              title="Mover para baixo"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeCategory(index)}
                              title="Remover"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {mode === "edit" ? (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-sm font-medium">
                                Nome da Categoria
                              </label>
                              <Input
                                placeholder="Ex: Masculino 18-29, Feminino 30-39"
                                value={category.name}
                                onChange={(e) =>
                                  updateCategoryLocal(index, "name", e.target.value)
                                }
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium">
                                Valor (R$)
                              </label>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="0.00"
                                value={category.price}
                                onChange={(e) => {
                                  const value = parseFloat(e.target.value);
                                  if (!isNaN(value) && value >= 0) {
                                    updateCategoryLocal(index, "price", value);
                                  } else if (e.target.value === "" || e.target.value === "-") {
                                    updateCategoryLocal(index, "price", 0);
                                  }
                                }}
                                required
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="text-sm font-medium">
                                Tipo
                              </label>
                              <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                value={category.category_type}
                                onChange={(e) =>
                                  updateCategoryLocal(index, "category_type", e.target.value as CategoryTypeEnum)
                                }
                              >
                                <option value="geral">Geral</option>
                                <option value="visitante">Visitante</option>
                                <option value="local">Local</option>
                                <option value="PCD">PCD</option>
                                <option value="militar">Militar</option>
                                <option value="civil">Civil</option>
                                <option value="outro">Outro</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-sm font-medium">
                                Sexo
                              </label>
                              <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                value={category.gender}
                                onChange={(e) =>
                                  updateCategoryLocal(index, "gender", e.target.value as CategoryGender)
                                }
                              >
                                <option value="ambos">Ambos</option>
                                <option value="masculino">Masculino</option>
                                <option value="feminino">Feminino</option>
                              </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="text-sm font-medium">
                                  Idade Mínima (opcional)
                                </label>
                                <Input
                                  type="number"
                                  min="0"
                                  max="120"
                                  placeholder="Deixe vazio para sem restrição"
                                  value={category.min_age || ""}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    if (value === "") {
                                      updateCategoryLocal(index, "min_age", null);
                                    } else {
                                      const numValue = parseInt(value);
                                      if (!isNaN(numValue) && numValue >= 0 && numValue <= 120) {
                                        updateCategoryLocal(index, "min_age", numValue);
                                      }
                                    }
                                  }}
                                />
                              </div>
                              <div>
                                <label className="text-sm font-medium">
                                  Idade Máxima (opcional)
                                </label>
                                <Input
                                  type="number"
                                  min="0"
                                  max="120"
                                  placeholder="Deixe vazio para sem restrição"
                                  value={category.max_age || ""}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    if (value === "") {
                                      updateCategoryLocal(index, "max_age", null);
                                    } else {
                                      const numValue = parseInt(value);
                                      if (!isNaN(numValue) && numValue >= 0 && numValue <= 120) {
                                        updateCategoryLocal(index, "max_age", numValue);
                                      }
                                    }
                                  }}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2 p-3 border rounded-md bg-muted/50">
                            <input
                              type="checkbox"
                              id={`category-${index}-is-default`}
                              checked={category.is_default === true}
                              onChange={(e) => {
                                const newValue = e.target.checked;
                                if (newValue) {
                                  setCategories(prevCategories => {
                                    return prevCategories.map((cat, idx) => ({
                                      ...cat,
                                      is_default: idx === index ? true : false,
                                    }));
                                  });
                                } else {
                                  updateCategoryLocal(index, "is_default", false);
                                }
                              }}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                            <label
                              htmlFor={`category-${index}-is-default`}
                              className="text-sm font-medium leading-none cursor-pointer"
                            >
                              Categoria Padrão (valor será exibido no site)
                            </label>
                            {category.is_default === true && (
                              <Badge variant="default" className="ml-2">
                                Padrão
                              </Badge>
                            )}
                          </div>

                          <div>
                            <label className="text-sm font-medium mb-2 block">
                              Modalidades Disponíveis
                            </label>
                            <p className="text-xs text-muted-foreground mb-3">
                              Selecione em quais modalidades esta categoria estará disponível
                            </p>
                            {modalities.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                Adicione modalidades primeiro na aba "Modalidades"
                              </p>
                            ) : (
                              <div className="space-y-2 border rounded-md p-3">
                                {modalities.map((modality, modIndex) => {
                                  const modalityIdentifier = modality.id || `temp-${modIndex}`;
                                  const isChecked = category.modality_ids?.includes(modalityIdentifier) || false;
                                  
                                  return (
                                    <div key={modalityIdentifier} className="flex items-center space-x-2">
                                      <input
                                        type="checkbox"
                                        id={`category-${index}-modality-${modalityIdentifier}`}
                                        checked={isChecked}
                                        onChange={() => {
                                          toggleCategoryModality(index, modality.id, modIndex);
                                        }}
                                        className="h-4 w-4 rounded border-gray-300"
                                      />
                                      <label
                                        htmlFor={`category-${index}-modality-${modalityIdentifier}`}
                                        className="text-sm font-medium leading-none cursor-pointer"
                                      >
                                        {modality.name} ({modality.distance})
                                      </label>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Lotes de Preço */}
                          <div className="border-t pt-4 mt-4">
                            <div className="flex justify-between items-center mb-3">
                              <div>
                                <label className="text-sm font-medium">
                                  Lotes de Preço
                                </label>
                                <p className="text-xs text-muted-foreground">
                                  Configure diferentes preços baseados em datas
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => addBatchToCategory(index)}
                              >
                                <Plus className="mr-2 h-3 w-3" />
                                Adicionar Lote
                              </Button>
                            </div>
                            
                            {(!category.batches || category.batches.length === 0) ? (
                              <p className="text-sm text-muted-foreground text-center py-4 border rounded-md">
                                Nenhum lote adicionado. O preço padrão da categoria será usado.
                              </p>
                            ) : (
                              <div className="space-y-3">
                                {category.batches.map((batch, batchIndex) => (
                                  <Card key={batch.id || `batch-${batchIndex}`} className="bg-muted/30">
                                    <CardContent className="pt-4">
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                          <label className="text-xs font-medium text-muted-foreground">
                                            Nome do Lote (opcional)
                                          </label>
                                          <Input
                                            placeholder="Ex: 1º Lote, 2º Lote, Promocional"
                                            value={batch.name || ""}
                                            onChange={(e) =>
                                              updateBatchLocal(index, batchIndex, "name", e.target.value || null)
                                            }
                                            className="h-9"
                                          />
                                        </div>
                                        <div>
                                          <label className="text-xs font-medium text-muted-foreground">
                                            Preço (R$)
                                          </label>
                                          <Input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            placeholder="0.00"
                                            value={batch.price}
                                            onChange={(e) => {
                                              const value = parseFloat(e.target.value);
                                              if (!isNaN(value) && value >= 0) {
                                                updateBatchLocal(index, batchIndex, "price", value);
                                              } else if (e.target.value === "" || e.target.value === "-") {
                                                updateBatchLocal(index, batchIndex, "price", 0);
                                              }
                                            }}
                                            className="h-9"
                                            required
                                          />
                                        </div>
                                        <div>
                                          <label className="text-xs font-medium text-muted-foreground">
                                            Data de Início (opcional)
                                          </label>
                                          <div className="flex gap-2">
                                            <Input
                                              type="date"
                                              key={`date-from-${batch.id || batchIndex}-${batch.valid_from || 'empty'}`}
                                              defaultValue={(() => {
                                                if (!batch.valid_from) return "";
                                                try {
                                                  const date = new Date(batch.valid_from);
                                                  if (isNaN(date.getTime())) return "";
                                                  // Usa UTC para evitar problemas de timezone
                                                  const year = date.getUTCFullYear();
                                                  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
                                                  const day = String(date.getUTCDate()).padStart(2, '0');
                                                  return `${year}-${month}-${day}`;
                                                } catch {
                                                  return "";
                                                }
                                              })()}
                                              onChange={(e) => {
                                                // Não faz nada durante a digitação - permite digitação livre
                                                // O valor será processado apenas no onBlur
                                              }}
                                              onBlur={(e) => {
                                                const dateValue = e.target.value;
                                                console.log('📅 onBlur date valid_from:', dateValue);
                                                
                                                if (!dateValue || dateValue.trim() === '') {
                                                  updateBatchLocal(
                                                    index,
                                                    batchIndex,
                                                    "valid_from",
                                                    null
                                                  );
                                                  return;
                                                }

                                                // Valida se a data está completa (YYYY-MM-DD = 10 caracteres)
                                                if (dateValue.length === 10 && dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
                                                  // Se tiver apenas a data, adiciona 00:00 automaticamente
                                                  const datetimeValue = `${dateValue}T00:00`;
                                                  const processedValue = processDatetimeLocalForSave(datetimeValue);
                                                  console.log('📅 onBlur date valid_from processado:', processedValue);
                                                  
                                                  if (processedValue) {
                                                    updateBatchLocal(
                                                      index,
                                                      batchIndex,
                                                      "valid_from",
                                                      processedValue
                                                    );
                                                  }
                                                }
                                              }}
                                              className="h-9 flex-1"
                                            />
                                            <Input
                                              type="time"
                                              value={batch.valid_from ? (() => {
                                                const date = new Date(batch.valid_from);
                                                if (isNaN(date.getTime())) return "00:00";
                                                return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
                                              })() : "00:00"}
                                              onChange={(e) => {
                                                const timeValue = e.target.value;
                                                console.log('📅 onChange time valid_from:', timeValue);
                                                
                                                // Pega a data atual do batch ou usa hoje
                                                const currentDate = batch.valid_from 
                                                  ? new Date(batch.valid_from)
                                                  : new Date();
                                                  
                                                if (isNaN(currentDate.getTime())) {
                                                  return;
                                                }

                                                const dateStr = `${currentDate.getUTCFullYear()}-${String(currentDate.getUTCMonth() + 1).padStart(2, '0')}-${String(currentDate.getUTCDate()).padStart(2, '0')}`;
                                                const datetimeValue = `${dateStr}T${timeValue || '00:00'}`;
                                                const processedValue = processDatetimeLocalForSave(datetimeValue);
                                                console.log('📅 onChange time valid_from processado:', processedValue);
                                                
                                                updateBatchLocal(
                                                  index,
                                                  batchIndex,
                                                  "valid_from",
                                                  processedValue
                                                );
                                              }}
                                              className="h-9 w-32"
                                            />
                                          </div>
                                        </div>
                                        <div>
                                          <label className="text-xs font-medium text-muted-foreground">
                                            Data de Término (opcional)
                                          </label>
                                          <div className="flex gap-2">
                                            <Input
                                              type="date"
                                              key={`date-to-${batch.id || batchIndex}-${batch.valid_to || 'empty'}`}
                                              defaultValue={(() => {
                                                if (!batch.valid_to) return "";
                                                try {
                                                  const date = new Date(batch.valid_to);
                                                  if (isNaN(date.getTime())) return "";
                                                  // Usa UTC para evitar problemas de timezone
                                                  const year = date.getUTCFullYear();
                                                  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
                                                  const day = String(date.getUTCDate()).padStart(2, '0');
                                                  return `${year}-${month}-${day}`;
                                                } catch {
                                                  return "";
                                                }
                                              })()}
                                              onChange={(e) => {
                                                // Não faz nada durante a digitação - permite digitação livre
                                                // O valor será processado apenas no onBlur
                                              }}
                                              onBlur={(e) => {
                                                const dateValue = e.target.value;
                                                console.log('📅 onBlur date valid_to:', dateValue);
                                                
                                                if (!dateValue || dateValue.trim() === '') {
                                                  updateBatchLocal(
                                                    index,
                                                    batchIndex,
                                                    "valid_to",
                                                    null
                                                  );
                                                  return;
                                                }

                                                // Valida se a data está completa (YYYY-MM-DD = 10 caracteres)
                                                if (dateValue.length === 10 && dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
                                                  // Se tiver apenas a data, adiciona 00:00 automaticamente
                                                  const datetimeValue = `${dateValue}T00:00`;
                                                  const processedValue = processDatetimeLocalForSave(datetimeValue);
                                                  console.log('📅 onBlur date valid_to processado:', processedValue);
                                                  
                                                  if (processedValue) {
                                                    updateBatchLocal(
                                                      index,
                                                      batchIndex,
                                                      "valid_to",
                                                      processedValue
                                                    );
                                                  }
                                                }
                                              }}
                                              className="h-9 flex-1"
                                            />
                                            <Input
                                              type="time"
                                              value={batch.valid_to ? (() => {
                                                const date = new Date(batch.valid_to);
                                                if (isNaN(date.getTime())) return "00:00";
                                                return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
                                              })() : "00:00"}
                                              onChange={(e) => {
                                                const timeValue = e.target.value;
                                                console.log('📅 onChange time valid_to:', timeValue);
                                                
                                                // Pega a data atual do batch ou usa hoje
                                                const currentDate = batch.valid_to 
                                                  ? new Date(batch.valid_to)
                                                  : new Date();
                                                  
                                                if (isNaN(currentDate.getTime())) {
                                                  return;
                                                }

                                                const dateStr = `${currentDate.getUTCFullYear()}-${String(currentDate.getUTCMonth() + 1).padStart(2, '0')}-${String(currentDate.getUTCDate()).padStart(2, '0')}`;
                                                const datetimeValue = `${dateStr}T${timeValue || '00:00'}`;
                                                const processedValue = processDatetimeLocalForSave(datetimeValue);
                                                console.log('📅 onChange time valid_to processado:', processedValue);
                                                
                                                updateBatchLocal(
                                                  index,
                                                  batchIndex,
                                                  "valid_to",
                                                  processedValue
                                                );
                                              }}
                                              className="h-9 w-32"
                                            />
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex justify-end mt-3">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => removeBatchFromCategory(index, batchIndex)}
                                          className="text-destructive hover:text-destructive"
                                        >
                                            <Trash2 className="h-4 w-4 mr-1" />
                                          Remover
                                        </Button>
                                      </div>
                                    </CardContent>
                                  </Card>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Campos personalizados */}
                          <div className="border-t pt-4 mt-4">
                            <div className="flex justify-between items-center mb-3">
                              <div>
                                <label className="text-sm font-medium">Campos personalizados</label>
                                <p className="text-xs text-muted-foreground">
                                  Campos que o corredor preenche ao se inscrever nesta categoria (ex.: número da camisa)
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setCustomFieldAddingCategoryIndex(index);
                                  setCustomFieldEditing(null);
                                }}
                                disabled={customFieldAddingCategoryIndex !== null}
                              >
                                <Plus className="mr-2 h-3 w-3" />
                                Adicionar campo personalizado
                              </Button>
                            </div>
                            {(category.custom_fields?.length ?? 0) === 0 && customFieldAddingCategoryIndex !== index ? (
                              <p className="text-sm text-muted-foreground text-center py-3 border rounded-md">
                                Nenhum campo personalizado. Clique em &quot;Adicionar campo personalizado&quot; para criar.
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {customFieldAddingCategoryIndex === index && (
                                  <Card className="bg-muted/30">
                                    <CardContent className="pt-4">
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                                        <div className="space-y-2">
                                          <Label className="text-xs font-medium">Nome do campo</Label>
                                          <Input
                                            placeholder="Ex.: Número da camisa"
                                            value={addingCustomFieldLabel}
                                            onChange={(e) => setAddingCustomFieldLabel(e.target.value)}
                                            className="h-9"
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <Label className="text-xs font-medium">Tipo</Label>
                                          <select
                                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                            value={addingCustomFieldType}
                                            onChange={(e) => setAddingCustomFieldType(e.target.value as "text" | "number")}
                                          >
                                            <option value="text">Texto</option>
                                            <option value="number">Número</option>
                                          </select>
                                        </div>
                                        <div className="flex gap-2 md:col-span-2">
                                          <Button
                                            type="button"
                                            size="sm"
                                            onClick={() => {
                                              if (addingCustomFieldLabel.trim()) {
                                                handleCreateCustomField(index, addingCustomFieldLabel.trim(), addingCustomFieldType);
                                                setAddingCustomFieldLabel("");
                                                setAddingCustomFieldType("text");
                                              }
                                            }}
                                            disabled={customFieldSaving || !addingCustomFieldLabel.trim()}
                                          >
                                            {customFieldSaving ? "Salvando..." : "Salvar"}
                                          </Button>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => { setCustomFieldAddingCategoryIndex(null); setAddingCustomFieldLabel(""); setAddingCustomFieldType("text"); }}
                                            disabled={customFieldSaving}
                                          >
                                            Cancelar
                                          </Button>
                                        </div>
                                      </div>
                                    </CardContent>
                                  </Card>
                                )}
                                {(category.custom_fields ?? []).map((f) =>
                                  customFieldEditing?.fieldId === f.id ? (
                                    <Card key={f.id} className="bg-muted/30">
                                      <CardContent className="pt-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                                          <div className="space-y-2">
                                            <Label className="text-xs font-medium">Nome do campo</Label>
                                            <Input
                                              value={editingCustomFieldLabel}
                                              onChange={(e) => setEditingCustomFieldLabel(e.target.value)}
                                              className="h-9"
                                            />
                                          </div>
                                          <div className="space-y-2">
                                            <Label className="text-xs font-medium">Tipo</Label>
                                            <select
                                              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                              value={editingCustomFieldType}
                                              onChange={(e) => setEditingCustomFieldType(e.target.value as "text" | "number")}
                                            >
                                              <option value="text">Texto</option>
                                              <option value="number">Número</option>
                                            </select>
                                          </div>
                                          <div className="flex gap-2 md:col-span-2">
                                            <Button
                                              type="button"
                                              size="sm"
                                              onClick={() => {
                                                if (editingCustomFieldLabel.trim()) {
                                                  if (isPendingCustomField(f)) updatePendingCustomField(index, f.id, editingCustomFieldLabel.trim(), editingCustomFieldType);
                                                  else handleUpdateCustomField(category.id, f.id, editingCustomFieldLabel.trim(), editingCustomFieldType);
                                                }
                                              }}
                                              disabled={customFieldSaving || !editingCustomFieldLabel.trim()}
                                            >
                                              {customFieldSaving ? "Salvando..." : "Salvar"}
                                            </Button>
                                            <Button type="button" size="sm" variant="outline" onClick={() => { setCustomFieldEditing(null); setEditingCustomFieldLabel(""); setEditingCustomFieldType("text"); }} disabled={customFieldSaving}>
                                              Cancelar
                                            </Button>
                                          </div>
                                        </div>
                                      </CardContent>
                                    </Card>
                                  ) : (
                                    <div key={f.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                                      <span className="text-sm font-medium">{f.label}</span>
                                      <div className="flex items-center gap-2">
                                        {isPendingCustomField(f) && <Badge variant="outline" className="text-xs">Pendente</Badge>}
                                        <Badge variant="secondary" className="text-xs">{f.field_type === "number" ? "Número" : "Texto"}</Badge>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => {
                                            setCustomFieldEditing({ fieldId: f.id, categoryId: category.id ?? "", categoryIndex: index, label: f.label, field_type: f.field_type });
                                            setEditingCustomFieldLabel(f.label);
                                            setEditingCustomFieldType(f.field_type);
                                          }}
                                          disabled={customFieldSaving}
                                        >
                                          Editar
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          className="text-destructive hover:text-destructive"
                                          onClick={() => {
                                            if (isPendingCustomField(f)) removeCustomFieldLocal(index, f.id);
                                            else if (category.id) handleDeleteCustomField(category.id, f.id);
                                          }}
                                          disabled={customFieldSaving}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </div>
                                  )
                                )}
                              </div>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="space-y-2">
                          <CardDescription>
                            Tipo: {category.category_type} | Gênero: {category.gender}
                            {category.min_age && ` | Idade mínima: ${category.min_age} anos`}
                            {category.max_age && ` | Idade máxima: ${category.max_age} anos`}
                          </CardDescription>
                      <div className="flex gap-4">
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4" />
                          <span className="text-sm">R$ {Number(category.price).toFixed(2)}</span>
                        </div>
                        {category.max_participants && (
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            <span className="text-sm">Máx: {category.max_participants}</span>
                          </div>
                        )}
                            {category.is_default && (
                              <Badge variant="default">Padrão</Badge>
                        )}
                      </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
            </div>
            )}
          </TabsContent>

          <TabsContent value="kits" className="space-y-4">
            {mode === "edit" && (
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-lg font-semibold">Kits e Produtos</h3>
                  <p className="text-sm text-muted-foreground">
                    Configure os kits disponíveis para compra
                  </p>
                </div>
                <Button type="button" onClick={addKit} size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar Kit
                </Button>
              </div>
            )}
              {kits.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  Nenhum kit adicionado ainda
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {kits.map((kit, index) => (
                  <Card key={kit.id || index}>
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-base flex items-center gap-2">
                          {mode === "edit" ? `Kit ${index + 1}` : kit.name}
                          {kit.is_visible === false && (
                            <span className="text-xs font-normal text-muted-foreground">(Oculto)</span>
                          )}
                        </CardTitle>
                        {mode === "edit" && (
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => toggleKitVisibility(index)}
                              title={kit.is_visible === false ? "Kit oculto na inscrição e página pública" : "Kit visível na inscrição e página pública"}
                            >
                              {kit.is_visible === false ? (
                                <EyeOff className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <Eye className="h-4 w-4 text-primary" />
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeKit(index)}
                              title="Remover ou desativar"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {mode === "edit" ? (
                        <>
                          <div>
                            <label className="text-sm font-medium">
                              Nome do Kit
                            </label>
                            <Input
                              placeholder="Ex: Kit Básico, Kit Premium"
                              value={kit.name}
                              onChange={(e) =>
                                updateKitLocal(index, "name", e.target.value)
                              }
                            />
                          </div>

                          <div>
                            <label className="text-sm font-medium">
                              Descrição / Itens Inclusos
                            </label>
                            <Textarea
                              placeholder="Ex: Camisa, medalha, squeeze, número de peito"
                              value={kit.description || ""}
                              onChange={(e) =>
                                updateKitLocal(index, "description", e.target.value)
                              }
                              rows={3}
                            />
                          </div>

                          <div>
                            <label className="text-sm font-medium">
                              Preço do Kit (R$)
                            </label>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={kit.price}
                              onChange={(e) =>
                                updateKitLocal(index, "price", parseFloat(e.target.value) || 0)
                              }
                            />
                          </div>

                          {/* Categories Selection */}
                          <div className="border-t pt-4">
                            <label className="text-sm font-medium mb-2 block">
                              Categorias Disponíveis
                            </label>
                            <p className="text-xs text-muted-foreground mb-3">
                              Selecione as categorias em que este kit estará disponível. Sem nenhuma categoria, o kit não aparece na página do evento nem na inscrição.
                            </p>
                            {categories.length === 0 ? (
                              <p className="text-sm text-muted-foreground text-center py-2">
                                Nenhuma categoria cadastrada ainda
                              </p>
                            ) : (
                              <div className="space-y-2 border rounded-md p-3 max-h-48 overflow-y-auto">
                                {categories.map((category) => {
                                  const categoryId = category.id;
                                  const isChecked = kit.category_ids?.includes(categoryId) || false;
                                  
                                  return (
                                    <div key={categoryId} className="flex items-center space-x-2">
                                      <input
                                        type="checkbox"
                                        id={`kit-${index}-category-${categoryId}`}
                                        checked={isChecked}
                                        onChange={() => {
                                          const currentCategoryIds = kit.category_ids || [];
                                          const newCategoryIds = isChecked
                                            ? currentCategoryIds.filter(id => id !== categoryId)
                                            : [...currentCategoryIds, categoryId];
                                          updateKitLocal(index, "category_ids", newCategoryIds);
                                        }}
                                        className="h-4 w-4 rounded border-gray-300"
                                      />
                                      <label
                                        htmlFor={`kit-${index}-category-${categoryId}`}
                                        className="text-sm font-medium leading-none cursor-pointer flex-1"
                                      >
                                        {category.name}
                                      </label>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {kit.category_ids && kit.category_ids.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-2">
                                {kit.category_ids.length} {kit.category_ids.length === 1 ? 'categoria selecionada' : 'categorias selecionadas'}
                              </p>
                            )}
                          </div>

                          {/* Products Section */}
                          <div className="border-t pt-4">
                            <div className="flex justify-between items-center mb-3">
                              <label className="text-sm font-medium">
                                Produtos do Kit
                              </label>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => addProduct(index)}
                              >
                                <Plus className="mr-1 h-3 w-3" />
                                Adicionar Produto
                              </Button>
                            </div>

                            {(!kit.products || kit.products.length === 0) ? (
                              <p className="text-sm text-muted-foreground text-center py-4">
                                Nenhum produto adicionado
                              </p>
                            ) : (
                              <div className="space-y-3">
                                {kit.products.map((product: any, pIndex: number) => (
                                  <div
                                    key={pIndex}
                                    className="border rounded-lg p-3 space-y-3 bg-muted/30"
                                  >
                                    <div className="flex justify-between items-start">
                                      <span className="text-sm font-medium">
                                        Produto {pIndex + 1}
                                      </span>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() =>
                                          removeProduct(index, pIndex)
                                        }
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>

                                    <Input
                                      placeholder="Nome do produto"
                                      value={product.name || ""}
                                      onChange={(e) =>
                                        updateProduct(
                                          index,
                                          pIndex,
                                          "name",
                                          e.target.value
                                        )
                                      }
                                    />

                                    <Textarea
                                      placeholder="Descrição do produto"
                                      className="min-h-[60px]"
                                      value={product.description || ""}
                                      onChange={(e) =>
                                        updateProduct(
                                          index,
                                          pIndex,
                                          "description",
                                          e.target.value
                                        )
                                      }
                                    />

                                    <div className="space-y-2">
                                      <label className="text-xs font-medium">
                                        Imagem do Produto (URL)
                                      </label>
                                      <Input
                                        placeholder="URL da imagem do produto"
                                        value={product.image_url || ""}
                                        onChange={(e) =>
                                          updateProduct(
                                            index,
                                            pIndex,
                                            "image_url",
                                            e.target.value
                                          )
                                        }
                                      />
                                      {product.image_url && (
                                        <div className="rounded border p-2">
                                          <img
                                            src={product.image_url}
                                            alt={product.name}
                                            className="h-20 w-20 object-cover rounded"
                                            onError={(e) => {
                                              e.currentTarget.style.display = 'none';
                                            }}
                                          />
                                        </div>
                                      )}
                                    </div>

                                    <div className="space-y-2">
                                      <label className="text-xs font-medium">
                                        Tipo de Produto
                                      </label>
                                      <div className="flex gap-2">
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant={
                                            product.type === "unique"
                                              ? "default"
                                              : "outline"
                                          }
                                          onClick={() =>
                                            updateProduct(
                                              index,
                                              pIndex,
                                              "type",
                                              "unique"
                                            )
                                          }
                                        >
                                          Único
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant={
                                            product.type === "variable"
                                              ? "default"
                                              : "outline"
                                          }
                                          onClick={() =>
                                            updateProduct(
                                              index,
                                              pIndex,
                                              "type",
                                              "variable"
                                            )
                                          }
                                        >
                                          Variável
                                        </Button>
                                      </div>
                                    </div>

                                    {product.type === "variable" && (
                                      <div className="space-y-3 border-t pt-3">
                                        <div className="flex justify-between items-center">
                                          <label className="text-xs font-semibold">
                                            Variações
                                          </label>
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => addVariant(index, pIndex)}
                                          >
                                            <Plus className="mr-1 h-3 w-3" />
                                            Adicionar Variação
                                          </Button>
                                        </div>

                                        {(!product.variants || product.variants.length === 0) ? (
                                          <p className="text-xs text-muted-foreground text-center py-2">
                                            Nenhuma variação adicionada
                                          </p>
                                        ) : (
                                          <div className="space-y-2">
                                            {product.variants.map((variant: any, vIndex: number) => (
                                              <div key={vIndex} className="border rounded p-2 space-y-2">
                                                <div className="flex justify-between items-start">
                                                  <span className="text-xs font-medium">
                                                    Variação {vIndex + 1}
                                                  </span>
                                                  <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-5 w-5"
                                                    onClick={() =>
                                                      removeVariant(index, pIndex, vIndex)
                                                    }
                                                  >
                                                    <Trash2 className="h-3 w-3" />
                                                  </Button>
                                                </div>
                                                <Input
                                                  placeholder="Nome da variação (ex: P, M, G)"
                                                  value={variant.name || ""}
                                                  onChange={(e) =>
                                                    updateVariant(
                                                      index,
                                                      pIndex,
                                                      vIndex,
                                                      "name",
                                                      e.target.value
                                                    )
                                                  }
                                                />
                                                <Input
                                                  placeholder="Grupo (ex: Tamanho)"
                                                  value={variant.variant_group_name || ""}
                                                  onChange={(e) =>
                                                    updateVariant(
                                                      index,
                                                      pIndex,
                                                      vIndex,
                                                      "variant_group_name",
                                                      e.target.value
                                                    )
                                                  }
                                                />
                                                <div className="grid grid-cols-2 gap-2">
                                                  <Input
                                                    type="number"
                                                    placeholder="Quantidade disponível"
                                                    value={variant.available_quantity || ""}
                                                    onChange={(e) =>
                                                      updateVariant(
                                                        index,
                                                        pIndex,
                                                        vIndex,
                                                        "available_quantity",
                                                        e.target.value
                                                      )
                                                    }
                                                  />
                                                  <Input
                                                    placeholder="SKU"
                                                    value={variant.sku || ""}
                                                    onChange={(e) =>
                                                      updateVariant(
                                                        index,
                                                        pIndex,
                                                        vIndex,
                                                        "sku",
                                                        e.target.value
                                                      )
                                                    }
                                                  />
                                                </div>
                                                <Input
                                                  type="number"
                                                  step="0.01"
                                                  placeholder="Preço (opcional)"
                                                  value={variant.price || ""}
                                                  onChange={(e) =>
                                                    updateVariant(
                                                      index,
                                                      pIndex,
                                                      vIndex,
                                                      "price",
                                                      e.target.value
                                                    )
                                                  }
                                                />
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="space-y-2">
                      {kit.description && (
                        <CardDescription>{kit.description}</CardDescription>
                      )}
                          <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                              <span className="text-sm font-medium">R$ {Number(kit.price).toFixed(2)}</span>
                      </div>
                            <div className="flex items-center gap-2">
                              <Package className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">Ordem: {kit.display_order || 0}</span>
                            </div>
                            {kit.products && kit.products.length > 0 && (
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">
                                  {kit.products.length} produto(s)
                                </span>
                              </div>
                            )}
                          </div>
                          {kit.products && kit.products.length > 0 && (
                            <div className="mt-4 pt-4 border-t">
                              <p className="text-sm font-semibold mb-2">Produtos:</p>
                              <div className="space-y-2">
                                {kit.products.map((product: any) => (
                                  <div key={product.id} className="text-sm text-muted-foreground">
                                    • {product.name} {product.type === 'variable' && product.variants && `(${product.variants.length} variantes)`}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="pickup" className="space-y-4">
            {mode === "edit" && (
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-lg font-semibold">Locais de Retirada dos Kits</h3>
                  <p className="text-sm text-muted-foreground">
                    Configure os locais, datas e horários para retirada (válido para todos os kits do evento)
                  </p>
            </div>
                <Button type="button" onClick={addPickupLocation} size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar Local
                </Button>
              </div>
            )}
            {pickupLocations.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  Nenhum local de retirada adicionado ainda
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {pickupLocations.map((location, index) => (
                  <Card key={location.id || index}>
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-base">
                          {mode === "edit" 
                            ? (location.name || `Local ${index + 1}`)
                            : (location.name || "Local de Retirada")}
                        </CardTitle>
                        {mode === "edit" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removePickupLocation(index)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {mode === "edit" ? (
                        <>
                          {/* Nome do Local */}
                          <div>
                            <label className="text-sm font-medium">Nome do Local *</label>
                            <Input
                              placeholder="Ex: Loja Central, Estádio, Shopping..."
                              value={location.name || ""}
                              onChange={(e) =>
                                updatePickupLocationLocal(index, "name", e.target.value)
                              }
                            />
                          </div>

                          {/* Endereço */}
                          <div>
                            <label className="text-sm font-medium">Endereço *</label>
                            <Textarea
                              placeholder="Endereço completo do local de retirada"
                              className="min-h-[80px]"
                              value={location.address || ""}
                              onChange={(e) =>
                                updatePickupLocationLocal(index, "address", e.target.value)
                              }
                            />
                          </div>

                          {/* Informações Adicionais */}
                          <div>
                            <label className="text-sm font-medium">Informações Adicionais</label>
                            <Textarea
                              placeholder="Ex: Estacionamento disponível, acessibilidade, ponto de referência..."
                              className="min-h-[80px]"
                              value={location.additional_info || ""}
                              onChange={(e) =>
                                updatePickupLocationLocal(index, "additional_info", e.target.value)
                              }
                            />
                          </div>

                          {/* Datas e Horários */}
                          <div>
                            <div className="flex justify-between items-center mb-3">
                              <label className="text-sm font-medium">Datas e Horários de Retirada *</label>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => addPickupDate(index)}
                              >
                                <Plus className="mr-2 h-3 w-3" />
                                Adicionar Data
                              </Button>
                            </div>

                            <div className="space-y-4">
                              {(location.pickup_schedule || []).map((scheduleItem: any, dateIndex: number) => (
                                <Card key={dateIndex} className="bg-muted/50">
                                  <CardContent className="pt-4 space-y-3">
                                    <div className="flex justify-between items-center">
                                      <label className="text-sm font-medium">Data {dateIndex + 1}</label>
                                      {(location.pickup_schedule || []).length > 1 && (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => removePickupDate(index, dateIndex)}
                                        >
                                          <X className="h-4 w-4 text-destructive" />
                                        </Button>
                                      )}
                                    </div>
                                    <Input
                                      type="date"
                                      value={scheduleItem.date || ""}
                                      onChange={(e) =>
                                        updatePickupDate(index, dateIndex, e.target.value)
                                      }
                                    />

                                    {/* Horários */}
                                    <div>
                                      <div className="flex justify-between items-center mb-2">
                                        <label className="text-xs text-muted-foreground">Horários</label>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => addPickupTimeSlot(index, dateIndex)}
                                        >
                                          <Plus className="mr-1 h-3 w-3" />
                                          Adicionar Horário
                                        </Button>
                                      </div>
                                      <div className="space-y-2">
                                        {(scheduleItem.time_slots || []).map((timeSlot: any, timeSlotIndex: number) => (
                                          <div key={timeSlotIndex} className="flex gap-2 items-center">
                                            <Input
                                              type="time"
                                              placeholder="Início"
                                              value={timeSlot.start_time || ""}
                                              onChange={(e) =>
                                                updatePickupTimeSlot(
                                                  index,
                                                  dateIndex,
                                                  timeSlotIndex,
                                                  "start_time",
                                                  e.target.value
                                                )
                                              }
                                              className="flex-1"
                                            />
                                            <span className="text-muted-foreground">até</span>
                                            <Input
                                              type="time"
                                              placeholder="Fim"
                                              value={timeSlot.end_time || ""}
                                              onChange={(e) =>
                                                updatePickupTimeSlot(
                                                  index,
                                                  dateIndex,
                                                  timeSlotIndex,
                                                  "end_time",
                                                  e.target.value
                                                )
                                              }
                                              className="flex-1"
                                            />
                                            {(scheduleItem.time_slots || []).length > 1 && (
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={() =>
                                                  removePickupTimeSlot(index, dateIndex, timeSlotIndex)
                                                }
                                              >
                                                <X className="h-4 w-4 text-destructive" />
                                              </Button>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              ))}
                            </div>
                          </div>

                          {/* Coordenadas (Opcional) */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-sm font-medium">Latitude (Opcional)</label>
                              <Input
                                placeholder="-23.550520"
                                value={location.latitude || ""}
                                onChange={(e) =>
                                  updatePickupLocationLocal(index, "latitude", e.target.value)
                                }
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium">Longitude (Opcional)</label>
                              <Input
                                placeholder="-46.633308"
                                value={location.longitude || ""}
                                onChange={(e) =>
                                  updatePickupLocationLocal(index, "longitude", e.target.value)
                                }
                              />
                            </div>
                          </div>

                          {/* Visualização no Mapa */}
                          {location.latitude && location.longitude && (
                            <div>
                              <label className="text-sm font-medium mb-2 block">
                                Visualização no Mapa
                              </label>
                              <div className="rounded border overflow-hidden">
                                <iframe
                                  width="100%"
                                  height="300"
                                  frameBorder="0"
                                  style={{ border: 0 }}
                                  src={`https://www.google.com/maps?q=${location.latitude},${location.longitude}&output=embed`}
                                  allowFullScreen
                                />
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="space-y-2">
                          {location.name && (
                            <div>
                              <Label className="text-xs text-muted-foreground">Nome do Local</Label>
                              <p className="text-sm font-medium">{location.name}</p>
                            </div>
                          )}
                          <div>
                            <Label className="text-xs text-muted-foreground">Endereço</Label>
                            <p className="text-sm">{location.address}</p>
                          </div>
                          {location.additional_info && (
                            <div>
                              <Label className="text-xs text-muted-foreground">Informações Adicionais</Label>
                              <p className="text-sm">{location.additional_info}</p>
                            </div>
                          )}
                          <div>
                            <Label className="text-xs text-muted-foreground">Datas e Horários de Retirada</Label>
                            <div className="space-y-2 mt-1">
                              {(location.pickup_schedule || []).map((scheduleItem: any, dateIndex: number) => (
                                <div key={dateIndex} className="text-sm">
                                  <p className="font-medium flex items-center gap-2">
                                    <Calendar className="h-4 w-4" />
                                    {scheduleItem.date ? new Date(scheduleItem.date).toLocaleDateString("pt-BR") : "Data não definida"}
                                  </p>
                                  <div className="ml-6 space-y-1">
                                    {(scheduleItem.time_slots || []).map((timeSlot: any, timeSlotIndex: number) => (
                                      <p key={timeSlotIndex} className="text-xs text-muted-foreground">
                                        {timeSlot.start_time && timeSlot.end_time
                                          ? `${timeSlot.start_time} até ${timeSlot.end_time}`
                                          : "Horário não definido"}
                                      </p>
                                    ))}
                                  </div>
                                </div>
                              ))}
                              {(!location.pickup_schedule || location.pickup_schedule.length === 0) && (
                                <p className="text-sm text-muted-foreground">Nenhuma data/horário configurado</p>
                              )}
                            </div>
                          </div>
                          {(location.latitude || location.longitude) && (
                            <div>
                              <Label className="text-xs text-muted-foreground">Coordenadas</Label>
                              <p className="text-sm">
                                {location.latitude && `Lat: ${location.latitude}`}
                                {location.latitude && location.longitude && " | "}
                                {location.longitude && `Lng: ${location.longitude}`}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="payment" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Configurações de Pagamento</CardTitle>
                <CardDescription>
                  Configure quais métodos de pagamento estão disponíveis para este evento
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* PIX */}
                <div className="rounded-lg border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-xl">📱</span>
                      </div>
                      <div>
                        <h4 className="font-medium">PIX</h4>
                        <p className="text-sm text-muted-foreground">
                          Pagamento instantâneo via PIX
                        </p>
                      </div>
                    </div>
                    {mode === "view" ? (
                      <Badge variant={formData.pix_enabled ? "default" : "secondary"}>
                        {formData.pix_enabled ? "Habilitado" : "Desabilitado"}
                      </Badge>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="pix_enabled"
                          checked={formData.pix_enabled}
                          onCheckedChange={(checked) => {
                            setFormData({
                              ...formData,
                              pix_enabled: checked as boolean,
                              pix_disabled_at: !checked ? null : formData.pix_disabled_at,
                            });
                          }}
                        />
                        <Label htmlFor="pix_enabled" className="cursor-pointer">
                          Habilitado
                        </Label>
                      </div>
                    )}
                  </div>
                  {formData.pix_enabled && (
                    <div className="space-y-2 pl-12">
                      <Label className="text-sm font-normal">
                        Desabilitar automaticamente em:
                      </Label>
                      {mode === "view" ? (
                        <p className="text-sm text-muted-foreground">
                          {formData.pix_disabled_at
                            ? new Date(formData.pix_disabled_at).toLocaleString("pt-BR")
                            : "Não configurado"}
                        </p>
                      ) : (
                        <>
                          <Input
                            type="datetime-local"
                            value={formData.pix_disabled_at ? new Date(formData.pix_disabled_at).toISOString().slice(0, 16) : ""}
                            onChange={(e) => {
                              const value = e.target.value ? new Date(e.target.value).toISOString() : null;
                              setFormData({ ...formData, pix_disabled_at: value });
                            }}
                            placeholder="Opcional - deixe em branco para manter sempre habilitado"
                          />
                          <p className="text-xs text-muted-foreground">
                            Se preenchido, o PIX será desabilitado automaticamente nesta data/hora
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Cartão de Crédito */}
                <div className="rounded-lg border p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-xl">💳</span>
                      </div>
                      <div>
                        <h4 className="font-medium">Cartão de Crédito</h4>
                        <p className="text-sm text-muted-foreground">
                          Pagamento via cartão de crédito
                        </p>
                      </div>
                    </div>
                    {mode === "view" ? (
                      <Badge variant={formData.credit_card_enabled ? "default" : "secondary"}>
                        {formData.credit_card_enabled ? "Habilitado" : "Desabilitado"}
                      </Badge>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="credit_card_enabled"
                          checked={formData.credit_card_enabled}
                          onCheckedChange={(checked) => {
                            setFormData({
                              ...formData,
                              credit_card_enabled: checked as boolean,
                              credit_card_disabled_at: !checked ? null : formData.credit_card_disabled_at,
                            });
                          }}
                        />
                        <Label htmlFor="credit_card_enabled" className="cursor-pointer">
                          Habilitado
                        </Label>
                      </div>
                    )}
                  </div>
                  {formData.credit_card_enabled && (
                    <div className="space-y-2 pl-12">
                      <Label className="text-sm font-normal">
                        Desabilitar automaticamente em:
                      </Label>
                      {mode === "view" ? (
                        <p className="text-sm text-muted-foreground">
                          {formData.credit_card_disabled_at
                            ? new Date(formData.credit_card_disabled_at).toLocaleString("pt-BR")
                            : "Não configurado"}
                        </p>
                      ) : (
                        <>
                          <Input
                            type="datetime-local"
                            value={formData.credit_card_disabled_at ? new Date(formData.credit_card_disabled_at).toISOString().slice(0, 16) : ""}
                            onChange={(e) => {
                              const value = e.target.value ? new Date(e.target.value).toISOString() : null;
                              setFormData({ ...formData, credit_card_disabled_at: value });
                            }}
                            placeholder="Opcional - deixe em branco para manter sempre habilitado"
                          />
                          <p className="text-xs text-muted-foreground">
                            Se preenchido, o cartão de crédito será desabilitado automaticamente nesta data/hora
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="publish" className="space-y-4">
            {mode === "view" ? (
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label>Status do Evento</Label>
                  <div>{getStatusBadge(formData.status)}</div>
                </div>
                <Card>
                  <CardHeader>
                    <CardTitle>Controle de Inscrições</CardTitle>
                    <CardDescription>
                      Configure quando as inscrições estarão abertas para este evento
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label className="font-medium">Modo Automático:</Label>
                        <Badge variant={formData.registration_auto_mode ? "default" : "secondary"}>
                          {formData.registration_auto_mode ? "Ativado" : "Desativado"}
                        </Badge>
                      </div>
                      {formData.registration_auto_mode ? (
                        <>
                          <div>
                            <Label className="text-muted-foreground">Data/Hora de Abertura:</Label>
                            <p className="text-sm">
                              {formData.registration_start_date
                                ? new Date(formData.registration_start_date).toLocaleString("pt-BR")
                                : "Não definida"}
                            </p>
                          </div>
                          <div>
                            <Label className="text-muted-foreground">Data/Hora de Encerramento:</Label>
                            <p className="text-sm">
                              {formData.registration_end_date
                                ? new Date(formData.registration_end_date).toLocaleString("pt-BR")
                                : "Não definida"}
                            </p>
                          </div>
                        </>
                      ) : (
                        <div>
                          <Label className="text-muted-foreground">Status Manual:</Label>
                          <p className="text-sm">
                            {formData.registration_status === "not_open"
                              ? "Inscrições em Breve"
                              : formData.registration_status === "open"
                              ? "Inscrições Abertas"
                              : formData.registration_status === "closed"
                              ? "Inscrições Encerradas"
                              : "Usar Status Padrão"}
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="status">Status do Evento</Label>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      type="button"
                      variant={formData.status === "draft" ? "default" : "outline"}
                      onClick={() => setFormData({ ...formData, status: "draft" })}
                    >
                      📝 Rascunho
                    </Button>
                    <Button
                      type="button"
                      variant={formData.status === "published" ? "default" : "outline"}
                      onClick={() => setFormData({ ...formData, status: "published" })}
                    >
                      ✅ Publicado
                    </Button>
                    <Button
                      type="button"
                      variant={formData.status === "ongoing" ? "default" : "outline"}
                      onClick={() => setFormData({ ...formData, status: "ongoing" })}
                    >
                      🏃 Em Andamento
                    </Button>
                    <Button
                      type="button"
                      variant={formData.status === "finished" ? "default" : "outline"}
                      onClick={() => setFormData({ ...formData, status: "finished" })}
                    >
                      🏁 Finalizado
                    </Button>
                    <Button
                      type="button"
                      variant={formData.status === "cancelled" ? "default" : "outline"}
                      onClick={() => setFormData({ ...formData, status: "cancelled" })}
                    >
                      ❌ Cancelado
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formData.status === "draft" &&
                      "O evento estará visível apenas para você"}
                    {formData.status === "published" &&
                      "O evento será público e aceita inscrições"}
                    {formData.status === "ongoing" &&
                      "O evento está em andamento"}
                    {formData.status === "finished" &&
                      "O evento está encerrado e não aceita mais inscrições"}
                    {formData.status === "cancelled" &&
                      "O evento foi cancelado"}
                  </p>
                </div>

                {/* Controle de Inscrições */}
                <Card>
                  <CardHeader>
                    <CardTitle>Controle de Inscrições</CardTitle>
                    <CardDescription>
                      Configure quando as inscrições estarão abertas para este evento
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="registration_auto_mode"
                        checked={registrationAutoMode}
                        onCheckedChange={(checked) => {
                          setRegistrationAutoMode(checked as boolean);
                          setFormData({ ...formData, registration_auto_mode: checked as boolean });
                          // Se desativar modo automático, limpar datas
                          if (!checked) {
                            setFormData({
                              ...formData,
                              registration_auto_mode: false,
                              registration_start_date: null,
                              registration_end_date: null,
                            });
                          }
                        }}
                      />
                      <Label htmlFor="registration_auto_mode" className="cursor-pointer font-normal">
                        Modo Automático (baseado em datas)
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {registrationAutoMode
                        ? "O status será atualizado automaticamente baseado nas datas definidas abaixo."
                        : "Controle manual do status de inscrições."}
                    </p>

                    {registrationAutoMode ? (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="registration_start_date">Data/Hora de Abertura</Label>
                          <Input
                            id="registration_start_date"
                            type="datetime-local"
                            value={
                              formData.registration_start_date
                                ? new Date(formData.registration_start_date).toISOString().slice(0, 16)
                                : ""
                            }
                            onChange={(e) => {
                              const value = e.target.value ? new Date(e.target.value).toISOString() : null;
                              setFormData({ ...formData, registration_start_date: value });
                            }}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="registration_end_date">Data/Hora de Encerramento</Label>
                          <Input
                            id="registration_end_date"
                            type="datetime-local"
                            value={
                              formData.registration_end_date
                                ? new Date(formData.registration_end_date).toISOString().slice(0, 16)
                                : ""
                            }
                            onChange={(e) => {
                              const value = e.target.value ? new Date(e.target.value).toISOString() : null;
                              setFormData({ ...formData, registration_end_date: value });
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-2">
                        <Label htmlFor="registration_status">Status das Inscrições</Label>
                        <Select
                          value={formData.registration_status || "default"}
                          onValueChange={(value) =>
                            setFormData({ ...formData, registration_status: value === "default" ? null : value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="not_open">Inscrições em Breve</SelectItem>
                            <SelectItem value="open">Inscrições Abertas</SelectItem>
                            <SelectItem value="closed">Inscrições Encerradas</SelectItem>
                            <SelectItem value="default">Usar Status Padrão</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Deixe em branco para usar a lógica padrão baseada no status do evento
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="registrations" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Inscrições deste evento</CardTitle>
                <CardDescription>
                  A gestão operacional (filtros, exportação CSV, listagem e ações) foi movida para uma tela dedicada.
                  Aqui você encontra um resumo e atalhos.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Total aproximado de inscrições:{" "}
                  <span className="font-semibold text-foreground">{registrationTotalCount}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => eventId && navigate(getAdminEventRegistrationsPath(eventId))}
                    disabled={!eventId}
                  >
                    <ArrowRight className="mr-2 h-4 w-4" />
                    Visualizar inscritos
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setAdminRegisterAthleteOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Inscrever atleta
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
    {eventId ? (
      <RegisterAthleteStaffDialog
        mode="super_admin"
        open={adminRegisterAthleteOpen}
        onOpenChange={setAdminRegisterAthleteOpen}
        events={event ? [event] : []}
        lockedEventId={eventId}
        onSuccess={() => {
          void loadEventData();
        }}
      />
    ) : null}
    </>
  );
}
