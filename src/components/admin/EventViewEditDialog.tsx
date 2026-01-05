import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getEventById, updateEvent } from "@/lib/api/events";
import { getRegistrations, updateRegistration } from "@/lib/api/registrations";
import { getModalities, createModality, updateModality, deleteModality, reorderModalities } from "@/lib/api/modalities";
import { getCategories, createCategory, updateCategory, deleteCategory, reorderCategories, type CategoryType as CategoryTypeEnum, type CategoryGender } from "@/lib/api/categories";
import { getEventKits, syncEventKits } from "@/lib/api/eventKits";
import { getEventPickupLocations, createPickupLocation, updatePickupLocation, deletePickupLocation } from "@/lib/api/kitPickup";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MapPin, Calendar, Users, DollarSign, Search, CheckCircle, Package, MapPin as MapPinIcon, Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";

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
  const [mode, setMode] = useState(initialMode);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const [event, setEvent] = useState<any>(null);
  const [modalities, setModalities] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [kits, setKits] = useState<any[]>([]);
  const [pickupLocations, setPickupLocations] = useState<any[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [allRegistrations, setAllRegistrations] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [confirmingRegistration, setConfirmingRegistration] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    event_date: "",
    location: "",
    city: "",
    state: "",
    status: "draft" as "draft" | "published" | "ongoing" | "finished" | "cancelled",
    banner_url: "",
    regulation_url: "",
  });

  useEffect(() => {
    if (open && eventId) {
      loadEventData();
    }
  }, [open, eventId]);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

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
      setFormData({
        title: eventData.title || "",
        description: eventData.description || "",
        event_date: eventData.event_date || "",
        location: eventData.location || "",
        city: eventData.city || "",
        state: eventData.state || "",
        status: eventData.status || "draft",
        banner_url: eventData.banner_url || "",
        regulation_url: eventData.regulation_url || "",
      });

      // Get registrations
      const registrationsResponse = await getRegistrations({ event_id: eventId });
      
      if (registrationsResponse.success && registrationsResponse.data) {
        // Transform API response to match expected format
        const regs = registrationsResponse.data.map((reg: any) => ({
          id: reg.id,
          event_id: reg.event_id,
          runner_id: reg.runner_id,
          total_amount: reg.total_amount,
          payment_status: reg.payment_status,
          status: reg.status,
          created_at: reg.created_at,
          runner_name: reg.runner_name,
          runner_cpf: reg.runner_cpf,
          profiles: reg.runner_name ? {
            full_name: reg.runner_name,
          } : undefined,
        }));
        setAllRegistrations(regs);
        setRegistrations(regs);
      } else {
        setAllRegistrations([]);
        setRegistrations([]);
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
          setCategories(categoriesResponse.data);
        } else {
          setCategories([]);
        }
      } catch (error) {
        console.error("Error loading categories:", error);
        setCategories([]);
      }

      // Load kits
      try {
        const kitsResponse = await getEventKits(eventId);
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
          // Convert pickup_date to string format for datetime-local input
          const formattedLocations = pickupResponse.data.map(loc => ({
            ...loc,
            pickup_date: loc.pickup_date ? new Date(loc.pickup_date).toISOString().slice(0, 16) : "",
            latitude: loc.latitude?.toString() || "",
            longitude: loc.longitude?.toString() || "",
          }));
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
    setModalities([...modalities, { name: "", distance: "", id: `temp-${Date.now()}` }]);
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
        max_participants: null,
        is_default: categories.length === 0,
        modality_ids: [],
        id: `temp-${Date.now()}`,
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

  // Kits functions
  const addKit = () => {
    setKits([...kits, { name: "", description: "", price: 0, products: [], id: `temp-${Date.now()}` }]);
  };

  const removeKit = (index: number) => {
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
        address: "",
        pickup_date: "",
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

  const handleSave = async () => {
    if (!eventId) return;

    setSaving(true);
    try {
      // Update event basic info
      const response = await updateEvent(eventId, formData);

      if (!response.success) {
        throw new Error(response.error || "Erro ao atualizar evento");
      }

      // Sync modalities
      try {
        const existingModalitiesResponse = await getModalities(eventId);
        const existingModalities = existingModalitiesResponse.success && existingModalitiesResponse.data 
          ? existingModalitiesResponse.data 
          : [];
        
        // Filter out temporary IDs (those starting with "temp-")
        const modalitiesToCreate = modalities.filter(m => (!m.id || m.id.startsWith('temp-')) && m.name && m.distance);
        const modalitiesToUpdate = modalities.filter(m => m.id && !m.id.startsWith('temp-') && m.name && m.distance);
        const existingIds = existingModalities.map(m => m.id);
        const currentIds = modalities.filter(m => m.id && !m.id.startsWith('temp-')).map(m => m.id!);
        const modalitiesToDelete = existingIds.filter(id => !currentIds.includes(id));
        
        // Create new modalities
        const createdModalities: any[] = [];
        for (const modality of modalitiesToCreate) {
          const createResponse = await createModality({
            event_id: eventId,
            name: modality.name,
            distance: modality.distance,
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
            });
          }
        }
        
        // Delete removed modalities
        for (const id of modalitiesToDelete) {
          await deleteModality(id);
        }
        
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
                // Find the modality in the original modalities array by matching the temp ID
                const tempModality = modalities.find(m => m.id === id);
                if (tempModality) {
                  // Find the created modality by matching name and distance
                  const createdModality = finalModalities.find(fm => 
                    fm.name === tempModality.name && fm.distance === tempModality.distance
                  );
                  return createdModality?.id || null;
                }
                return null;
              }
              return id;
            })
            .filter((id): id is string => id !== null && id !== undefined);
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
            max_participants: category.max_participants,
            is_default: category.is_default,
            modality_ids: mapModalityIds(category.modality_ids || []),
          });
        }
        
        // Update existing categories
        for (const category of categoriesToUpdate) {
          if (category.id) {
            await updateCategory(category.id, {
              name: category.name,
              price: category.price,
              category_type: category.category_type,
              gender: category.gender,
              min_age: category.min_age,
              max_participants: category.max_participants,
              is_default: category.is_default,
              modality_ids: mapModalityIds(category.modality_ids || []),
            });
          }
        }
        
        // Delete removed categories
        for (const id of categoriesToDelete) {
          await deleteCategory(id);
        }
        
        // Reorder categories
        const reloadCategoriesResponse = await getCategories(eventId);
        if (reloadCategoriesResponse.success && reloadCategoriesResponse.data) {
          const savedCategories = reloadCategoriesResponse.data;
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
      } catch (error: any) {
        console.error('Error syncing categories:', error);
        toast({
          title: "Aviso",
          description: "Evento atualizado, mas houve erro ao salvar categorias",
          variant: "destructive",
        });
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
            products: kit.products || [],
          }));
        
        await syncEventKits(eventId, kitsData);
      } catch (error: any) {
        console.error('Error syncing kits:', error);
        toast({
          title: "Aviso",
          description: "Evento atualizado, mas houve erro ao salvar kits",
          variant: "destructive",
        });
      }

      // Sync pickup locations
      try {
        const existingLocationsResponse = await getEventPickupLocations(eventId);
        const existingLocations = existingLocationsResponse.success && existingLocationsResponse.data 
          ? existingLocationsResponse.data 
          : [];
        
        const locationsToCreate = pickupLocations.filter(l => (!l.id || l.id.startsWith('temp-')) && l.address && l.pickup_date);
        const locationsToUpdate = pickupLocations.filter(l => l.id && !l.id.startsWith('temp-') && l.address && l.pickup_date);
        const existingLocationIds = existingLocations.map(l => l.id);
        const currentLocationIds = pickupLocations.filter(l => l.id && !l.id.startsWith('temp-')).map(l => l.id!);
        const locationsToDelete = existingLocationIds.filter(id => !currentLocationIds.includes(id));
        
        // Create new locations
        for (const location of locationsToCreate) {
          await createPickupLocation(eventId, {
            address: location.address,
            pickup_date: location.pickup_date,
            latitude: location.latitude ? parseFloat(location.latitude) : null,
            longitude: location.longitude ? parseFloat(location.longitude) : null,
          });
        }
        
        // Update existing locations
        for (const location of locationsToUpdate) {
          if (location.id) {
            await updatePickupLocation(eventId, location.id, {
              address: location.address,
              pickup_date: location.pickup_date,
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

  const handleSearch = (term: string) => {
    setSearchTerm(term);
    if (!term.trim()) {
      setRegistrations(allRegistrations);
      return;
    }

    const filtered = allRegistrations.filter((reg) => {
      const name = (reg.runner_name || reg.profiles?.full_name || "").toLowerCase();
      const cpf = (reg.runner_cpf || "").replace(/\D/g, "");
      const searchLower = term.toLowerCase().replace(/\D/g, "");
      
      return name.includes(term.toLowerCase()) || cpf.includes(searchLower);
    });
    
    setRegistrations(filtered);
  };

  const handleConfirmRegistration = async (registrationId: string) => {
    if (!confirm("Deseja confirmar esta inscrição e o pagamento manualmente?")) {
      return;
    }

    setConfirmingRegistration(registrationId);
    try {
      const response = await updateRegistration(registrationId, {
        status: "confirmed",
        payment_status: "paid",
      });

      if (response.success) {
        toast({
          title: "Inscrição e pagamento confirmados",
          description: "A inscrição e o pagamento foram confirmados com sucesso!",
        });
        // Reload registrations
        await loadEventData();
      } else {
        toast({
          title: "Erro ao confirmar inscrição",
          description: response.error || "Ocorreu um erro ao confirmar a inscrição",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Error confirming registration:", error);
      toast({
        title: "Erro ao confirmar inscrição",
        description: error.message || "Ocorreu um erro ao confirmar a inscrição",
        variant: "destructive",
      });
    } finally {
      setConfirmingRegistration(null);
    }
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="details">Detalhes</TabsTrigger>
            <TabsTrigger value="modalities">Modalidades</TabsTrigger>
            <TabsTrigger value="categories">Categorias</TabsTrigger>
            <TabsTrigger value="kits">Kits</TabsTrigger>
            <TabsTrigger value="pickup">Retirada</TabsTrigger>
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
                  <Label htmlFor="event_date">Data</Label>
                  {mode === "view" ? (
                    <p className="text-sm flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {new Date(formData.event_date).toLocaleDateString("pt-BR")}
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

              {event?.organizer_name && (
                <div className="grid gap-2">
                  <Label>Organizador</Label>
                  <p className="text-sm">{event.organizer_name}</p>
                </div>
              )}
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
                        </>
                      ) : (
                        <div className="space-y-2">
                          <CardDescription>
                            Tipo: {category.category_type} | Gênero: {category.gender}
                            {category.min_age && ` | Idade mínima: ${category.min_age} anos`}
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
                        <CardTitle className="text-base">
                          {mode === "edit" ? `Kit ${index + 1}` : kit.name}
                        </CardTitle>
                        {mode === "edit" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeKit(index)}
                            title="Remover"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
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
                    Configure os locais e horários para retirada (válido para todos os kits do evento)
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
                          {mode === "edit" ? `Local ${index + 1}` : "Local de Retirada"}
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
                    <CardContent className="space-y-3">
                      {mode === "edit" ? (
                        <>
                          <div>
                            <label className="text-sm font-medium">Endereço</label>
                            <Textarea
                              placeholder="Endereço completo do local de retirada"
                              className="min-h-[80px]"
                              value={location.address || ""}
                              onChange={(e) =>
                                updatePickupLocationLocal(index, "address", e.target.value)
                              }
                            />
                          </div>

                          <div>
                            <label className="text-sm font-medium">
                              Data e Hora da Retirada
                            </label>
                            <Input
                              type="datetime-local"
                              value={location.pickup_date || ""}
                              onChange={(e) =>
                                updatePickupLocationLocal(index, "pickup_date", e.target.value)
                              }
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-sm font-medium">Latitude</label>
                              <Input
                                placeholder="-23.550520"
                                value={location.latitude || ""}
                                onChange={(e) =>
                                  updatePickupLocationLocal(index, "latitude", e.target.value)
                                }
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium">Longitude</label>
                              <Input
                                placeholder="-46.633308"
                                value={location.longitude || ""}
                                onChange={(e) =>
                                  updatePickupLocationLocal(index, "longitude", e.target.value)
                                }
                              />
                            </div>
                          </div>

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
                          <div>
                            <Label className="text-xs text-muted-foreground">Endereço</Label>
                            <p className="text-sm">{location.address}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Data de Retirada</Label>
                            <p className="text-sm flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              {location.pickup_date ? new Date(location.pickup_date).toLocaleDateString("pt-BR") : "Não definida"}
                            </p>
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

          <TabsContent value="registrations" className="space-y-4">
            <div className="grid gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  Total: {allRegistrations.length} inscrições
                  {searchTerm && ` (${registrations.length} encontradas)`}
                </h3>
              </div>
              
              {/* Search bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou CPF..."
                  value={searchTerm}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pl-10"
                />
              </div>

              {registrations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {searchTerm ? "Nenhuma inscrição encontrada" : "Nenhuma inscrição"}
                </p>
              ) : (
                <div className="space-y-2">
                  {registrations.map((reg) => (
                    <Card key={reg.id}>
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="font-medium">{reg.runner_name || reg.profiles?.full_name || "Sem nome"}</p>
                            <div className="flex items-center gap-4 mt-1">
                              {reg.runner_cpf && (
                                <p className="text-sm text-muted-foreground">
                                  CPF: {reg.runner_cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}
                                </p>
                              )}
                              <p className="text-sm text-muted-foreground">
                                {new Date(reg.created_at).toLocaleDateString("pt-BR")}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="font-medium">R$ {Number(reg.total_amount).toFixed(2).replace('.', ',')}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant={reg.payment_status === "paid" || reg.payment_status === "convidado" ? "default" : "secondary"}>
                                  {reg.payment_status === "paid" ? "Pago" : reg.payment_status === "convidado" ? "Convite" : reg.payment_status === "pending" ? "Pendente" : reg.payment_status}
                                </Badge>
                                {reg.status && (
                                  <Badge variant={reg.status === "confirmed" ? "default" : "outline"}>
                                    {reg.status === "confirmed" ? "Confirmado" : reg.status === "pending" ? "Pendente" : reg.status}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            {reg.status !== "confirmed" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleConfirmRegistration(reg.id)}
                                disabled={confirmingRegistration === reg.id}
                                title="Confirmar inscrição manualmente"
                              >
                                {confirmingRegistration === reg.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <CheckCircle className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
