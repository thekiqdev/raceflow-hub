import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, Trash2, Upload, X, ChevronUp, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { createEvent, updateEvent, getEventById } from "@/lib/api/events";
import { getEventCategories } from "@/lib/api/eventCategories";
import { getEventKits } from "@/lib/api/eventKits";
import { getModalities, createModality, updateModality, deleteModality, reorderModalities, type Modality as ModalityType } from "@/lib/api/modalities";
import { getCategories, createCategory, updateCategory, deleteCategory, reorderCategories, type Category as CategoryType, type CategoryType as CategoryTypeEnum, type CategoryGender } from "@/lib/api/categories";
import { reorderEventKits } from "@/lib/api/eventKits";
import { FileUpload } from "@/components/ui/file-upload";
import { deleteUploadedFile } from "@/lib/api/upload";
import { getOrganizers } from "@/lib/api/userManagement";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

const eventFormSchema = z.object({
  title: z.string().min(3, "Nome deve ter no mínimo 3 caracteres"),
  description: z.string().min(10, "Descrição deve ter no mínimo 10 caracteres"),
  location: z.string().min(5, "Endereço completo é obrigatório"),
  city: z.string().min(2, "Cidade é obrigatória"),
  state: z.string().length(2, "UF deve ter 2 caracteres"),
  event_date: z.date({ required_error: "Data do evento é obrigatória" }),
  banner_url: z.string().optional(),
  regulation_url: z.string().optional(),
  status: z.enum(["draft", "published", "finished"]),
  registration_status: z.enum(["not_open", "open", "closed"]).nullable().optional(),
  registration_start_date: z.string().nullable().optional(),
  registration_end_date: z.string().nullable().optional(),
  registration_auto_mode: z.boolean().optional(),
}).refine((data) => {
  // Se modo automático está ativado, datas são obrigatórias
  if (data.registration_auto_mode === true) {
    return data.registration_start_date !== null && 
           data.registration_start_date !== undefined && 
           data.registration_start_date !== "" &&
           data.registration_end_date !== null && 
           data.registration_end_date !== undefined &&
           data.registration_end_date !== "";
  }
  return true;
}, {
  message: 'Data de abertura e encerramento são obrigatórias quando o modo automático está ativado',
  path: ['registration_start_date'],
}).refine((data) => {
  // Validar que data fim >= data início
  if (data.registration_start_date && data.registration_end_date && 
      data.registration_start_date !== "" && data.registration_end_date !== "") {
    const startDate = new Date(data.registration_start_date);
    const endDate = new Date(data.registration_end_date);
    return endDate >= startDate;
  }
  return true;
}, {
  message: 'Data de encerramento deve ser maior ou igual à data de abertura',
  path: ['registration_end_date'],
});

type EventFormValues = z.infer<typeof eventFormSchema>;

interface Batch {
  id?: string;
  price: number;
  valid_from: string | null;
}

interface Modality {
  id?: string;
  name: string;
  distance: string;
}

interface Category {
  id?: string;
  name: string;
  price: number;
  category_type: CategoryTypeEnum;
  gender: CategoryGender;
  min_age: number | null;
  max_age: number | null;
  max_participants: number | null;
  is_default: boolean;
  modality_ids: string[];
}

interface ProductVariant {
  id?: string;
  name: string;
  variant_group_name?: string | null;
  available_quantity?: number | null;
  sku?: string | null;
}

interface VariantAttribute {
  name: string;
  values: string[];
}

interface GeneratedVariant {
  id?: string; // ID da variação se já existir no banco
  attributes: Record<string, string>; // { "Cor": "Amarelo", "Tamanho": "G" }
  name: string; // "Amarelo - G"
  available_quantity: number | null;
  sku: string;
}

interface Product {
  id?: string;
  name: string;
  description: string;
  type: 'variable' | 'unique';
  image_url: string;
  variants: ProductVariant[];
  // New fields for attribute-based variants
  variantAttributes?: VariantAttribute[];
  generatedVariants?: GeneratedVariant[];
  variant_attributes?: string[] | null; // Array of attribute names in order
}

interface PickupTimeSlot {
  start_time: string; // HH:MM format
  end_time: string; // HH:MM format
}

interface PickupScheduleItem {
  date: string; // YYYY-MM-DD format
  time_slots: PickupTimeSlot[];
}

interface PickupLocation {
  id?: string;
  name: string;
  address: string;
  additional_info?: string;
  pickup_date?: string; // Kept for backward compatibility
  pickup_schedule: PickupScheduleItem[]; // New: multiple dates and time slots
  latitude?: string;
  longitude?: string;
}

interface Kit {
  id?: string;
  name: string;
  description: string;
  price: number;
  products: Product[];
}

interface EventFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: any;
  onSuccess?: () => void;
  isAdmin?: boolean; // Se true, permite selecionar o organizador
}

export function EventFormDialog({ open, onOpenChange, event, onSuccess, isAdmin = false }: EventFormDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("info");
  const [modalities, setModalities] = useState<Modality[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [kits, setKits] = useState<Kit[]>([]);
  const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedOrganizerId, setSelectedOrganizerId] = useState<string>("");
  const [organizers, setOrganizers] = useState<any[]>([]);
  const [loadingOrganizers, setLoadingOrganizers] = useState(false);
  const [registrationAutoMode, setRegistrationAutoMode] = useState(false);

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      title: "",
      description: "",
      location: "",
      city: "",
      state: "",
      event_date: undefined,
      banner_url: "",
      regulation_url: "",
      status: "draft",
      registration_status: null,
      registration_start_date: null,
      registration_end_date: null,
      registration_auto_mode: false,
    },
  });

  // Load event data when editing
  useEffect(() => {
    const loadEventData = async () => {
      if (!open) {
        // Reset when dialog closes
        form.reset({
          title: "",
          description: "",
          location: "",
          city: "",
          state: "",
          event_date: undefined,
          banner_url: "",
          regulation_url: "",
          status: "draft",
          registration_status: null,
          registration_start_date: null,
          registration_end_date: null,
          registration_auto_mode: false,
        });
        setRegistrationAutoMode(false);
        setModalities([]);
        setCategories([]);
        setKits([]);
        setPickupLocations([]);
        setActiveTab("info");
        setSelectedOrganizerId("");
        return;
      }

      if (event?.id) {
        try {
          console.log("🔄 Carregando dados do evento para edição:", event.id);
          
          // Load full event data
          const eventResponse = await getEventById(event.id);
          if (eventResponse.success && eventResponse.data) {
            const eventData = eventResponse.data;
            console.log("✅ Dados do evento carregados:", eventData);
            
            // Update form with event data
            const autoMode = eventData.registration_auto_mode || false;
            form.reset({
              title: eventData.title || "",
              description: eventData.description || "",
              location: eventData.location || "",
              city: eventData.city || "",
              state: eventData.state || "",
              event_date: eventData.event_date ? new Date(eventData.event_date) : undefined,
              banner_url: eventData.banner_url || "",
              regulation_url: eventData.regulation_url || "",
              status: eventData.status || "draft",
              registration_status: eventData.registration_status || null,
              registration_start_date: eventData.registration_start_date || null,
              registration_end_date: eventData.registration_end_date || null,
              registration_auto_mode: autoMode,
            });
            setRegistrationAutoMode(autoMode);

            // Load modalities
            const modalitiesResponse = await getModalities(event.id);
            if (modalitiesResponse.success && modalitiesResponse.data) {
              const loadedModalities: Modality[] = modalitiesResponse.data.map((mod: ModalityType) => ({
                id: mod.id,
                name: mod.name,
                distance: mod.distance,
              }));
              console.log("✅ Modalidades carregadas:", loadedModalities.length);
              setModalities(loadedModalities);
            } else {
              console.log("⚠️ Nenhuma modalidade encontrada");
              setModalities([]);
            }

            // Load categories
            const categoriesResponse = await getCategories(event.id);
            if (categoriesResponse.success && categoriesResponse.data) {
              const loadedCategories: Category[] = categoriesResponse.data.map((cat: CategoryType) => ({
                id: cat.id,
                name: cat.name,
                price: cat.price,
                category_type: cat.category_type,
                gender: cat.gender,
                min_age: cat.min_age,
                max_age: cat.max_age,
                max_participants: cat.max_participants,
                is_default: cat.is_default === true, // Garantir boolean explícito
                modality_ids: cat.modality_ids || [],
              }));
              console.log("✅ Categorias carregadas:", loadedCategories.length);
              console.log("📋 Categorias com is_default:", loadedCategories.map(c => ({ name: c.name, is_default: c.is_default })));
              setCategories(loadedCategories);
            } else {
              console.log("⚠️ Nenhuma categoria encontrada");
              setCategories([]);
            }

            // Load kits
            const kitsResponse = await getEventKits(event.id);
            if (kitsResponse.success && kitsResponse.data) {
              const loadedKits: Kit[] = kitsResponse.data.map((kit: any) => ({
                id: kit.id,
                name: kit.name,
                description: kit.description || "",
                price: kit.price,
                products: kit.products?.map((product: any) => {
                  const variants = product.variants?.map((variant: any) => ({
                    id: variant.id,
                    name: variant.name,
                    variant_group_name: variant.variant_group_name || null,
                    available_quantity: variant.available_quantity || null,
                    sku: variant.sku || null,
                  })) || [];
                  
                  // Reconstruct variantAttributes and generatedVariants from saved variants
                  let variantAttributes: VariantAttribute[] | undefined = undefined;
                  let generatedVariants: GeneratedVariant[] | undefined = undefined;
                  
                  if (product.type === 'variable' && variants.length > 0) {
                    // Use saved attribute names if available, otherwise reconstruct
                    const savedAttributeNames = product.variant_attributes || [];
                    
                    // Extract attributes from variants
                    const firstAttributeName = savedAttributeNames[0] || variants[0]?.variant_group_name;
                    if (firstAttributeName) {
                      // Get all unique values for the first attribute, preserving order of first occurrence
                      const firstAttributeValues: string[] = [];
                      const firstAttributeValuesSet = new Set<string>();
                      const allVariantValues: string[][] = [];
                      
                      variants.forEach(variant => {
                        // Parse variant name: "Valor1 - Valor2 - Valor3"
                        const values = variant.name.split(' - ').map(v => v.trim());
                        allVariantValues.push(values);
                        
                        // First value should match variant_group_name or be the first in the name
                        // Preserve order of first occurrence
                        if (values.length > 0 && !firstAttributeValuesSet.has(values[0])) {
                          firstAttributeValues.push(values[0]);
                          firstAttributeValuesSet.add(values[0]);
                        }
                      });
                      
                      // Determine number of attributes from the longest variant name
                      const maxValues = Math.max(...allVariantValues.map(v => v.length), 0);
                      
                      if (maxValues > 0) {
                        variantAttributes = [];
                        
                        // First attribute
                        variantAttributes.push({
                          name: firstAttributeName,
                          values: firstAttributeValues // Preserva ordem de primeira ocorrência
                        });
                        
                        // Additional attributes (if any)
                        for (let i = 1; i < maxValues; i++) {
                          // Preserve order of first occurrence for each attribute
                          const attributeValues: string[] = [];
                          const attributeValuesSet = new Set<string>();
                          
                          allVariantValues.forEach(values => {
                            if (values[i] && !attributeValuesSet.has(values[i])) {
                              attributeValues.push(values[i]);
                              attributeValuesSet.add(values[i]);
                            }
                          });
                          
                          if (attributeValues.length > 0) {
                            // Use saved name if available, otherwise generic name
                            const attributeName = savedAttributeNames[i] || `Atributo ${i + 1}`;
                            variantAttributes.push({
                              name: attributeName,
                              values: attributeValues // Preserva ordem de primeira ocorrência
                            });
                          }
                        }
                        
                        // Reconstruct generatedVariants from existing variants
                        generatedVariants = variants.map(variant => {
                          const values = variant.name.split(' - ').map(v => v.trim());
                          const attributes: Record<string, string> = {};
                          
                          variantAttributes.forEach((attr, idx) => {
                            if (values[idx]) {
                              attributes[attr.name] = values[idx];
                            }
                          });
                          
                          return {
                            id: variant.id, // Preserve variant ID
                            attributes,
                            name: variant.name,
                            available_quantity: variant.available_quantity || null,
                            sku: variant.sku || '',
                          };
                        });
                      }
                    }
                  }
                  
                  return {
                    id: product.id,
                    name: product.name,
                    description: product.description || "",
                    type: product.type,
                    image_url: product.image_url || "",
                    variants,
                    variantAttributes,
                    generatedVariants,
                    variant_attributes: product.variant_attributes || null, // Preserve variant_attributes
                  };
                }) || [],
              }));
              console.log("✅ Kits carregados:", loadedKits.length);
              setKits(loadedKits);
            } else {
              console.log("⚠️ Nenhum kit encontrado");
              setKits([]);
            }

            // Load pickup locations
            try {
              const { getEventPickupLocations } = await import('@/lib/api/kitPickup');
              const pickupResponse = await getEventPickupLocations(event.id);
              if (pickupResponse.success && pickupResponse.data) {
                // Format locations with new structure (name, pickup_schedule)
                const formattedLocations: PickupLocation[] = pickupResponse.data.map((loc: any) => {
                  // If pickup_schedule exists, use it; otherwise, create from pickup_date for backward compatibility
                  let pickup_schedule: PickupScheduleItem[] = loc.pickup_schedule || [];
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
                    id: loc.id,
                    name: loc.name || "",
                    address: loc.address,
                    pickup_schedule: pickup_schedule,
                    latitude: loc.latitude?.toString() || "",
                    longitude: loc.longitude?.toString() || "",
                  };
                });
                console.log("✅ Locais de retirada carregados:", formattedLocations.length);
                setPickupLocations(formattedLocations);
              } else {
                console.log("⚠️ Nenhum local de retirada encontrado");
                setPickupLocations([]);
              }
            } catch (error: any) {
              console.error("❌ Erro ao carregar locais de retirada:", error);
              setPickupLocations([]);
            }
          } else {
            console.error("❌ Erro ao carregar evento:", eventResponse.error);
            toast({
              title: "Erro",
              description: eventResponse.error || "Erro ao carregar dados do evento",
              variant: "destructive",
            });
          }
        } catch (error: any) {
          console.error("❌ Erro ao carregar dados do evento:", error);
          toast({
            title: "Erro",
            description: error.message || "Erro ao carregar dados do evento",
            variant: "destructive",
          });
        }
      } else {
        // Reset form for new event
        console.log("🆕 Criando novo evento");
        form.reset({
          title: "",
          description: "",
          location: "",
          city: "",
          state: "",
          event_date: undefined,
          banner_url: "",
          regulation_url: "",
          status: "draft",
          registration_status: null,
          registration_start_date: null,
          registration_end_date: null,
          registration_auto_mode: false,
        });
        setRegistrationAutoMode(false);
        setModalities([]);
        setCategories([]);
        setKits([]);
        setPickupLocations([]);
        setActiveTab("info");
      }
    };

    loadEventData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event?.id]);

  // Load organizers for admin when dialog opens
  useEffect(() => {
    const loadOrganizers = async () => {
      if (!isAdmin || !open || event?.id) return;
      setLoadingOrganizers(true);
      try {
        const response = await getOrganizers();
        if (response.success && response.data) {
          setOrganizers(response.data);
          // Se o usuário atual for um organizador, selecionar por padrão
          if (user && response.data.find((o: any) => o.id === user.id)) {
            setSelectedOrganizerId(user.id);
          }
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

    if (open && isAdmin && !event?.id) {
      loadOrganizers();
    }
  }, [open, isAdmin, event?.id, user, toast]);

  const addModality = () => {
    setModalities([
      ...modalities,
      { name: "", distance: "" },
    ]);
  };

  const removeModality = (index: number) => {
    setModalities(modalities.filter((_, i) => i !== index));
  };

  const updateModality = (index: number, field: keyof Modality, value: any) => {
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

  const addCategory = () => {
    setCategories([
      ...categories,
      {
        name: "",
        price: 0,
        category_type: "geral",
        gender: "ambos",
        min_age: null,
        max_age: null,
        max_participants: null,
        is_default: categories.length === 0, // Primeira categoria sempre é padrão
        modality_ids: [],
      },
    ]);
  };

  const removeCategory = (index: number) => {
    setCategories(categories.filter((_, i) => i !== index));
  };

  const updateCategoryLocal = (index: number, field: keyof Category, value: any) => {
    console.log(`🔄 updateCategoryLocal chamado: index=${index}, field=${String(field)}, value=${value}`);
    console.log(`📋 Estado ANTES de updateCategoryLocal:`, categories.map(c => ({ name: c.name, is_default: c.is_default })));
    const updated = [...categories];
    updated[index] = { ...updated[index], [field]: value };
    console.log(`📋 Estado DEPOIS de updateCategoryLocal (antes de setCategories):`, updated.map(c => ({ name: c.name, is_default: c.is_default })));
    setCategories(updated);
  };

  const toggleCategoryModality = (categoryIndex: number, modalityId: string | undefined, modalityIndex?: number) => {
    const category = categories[categoryIndex];
    const currentIds = category.modality_ids || [];
    
    // Se a modalidade não tem ID (ainda não foi salva), usar um identificador temporário baseado no índice
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

  const addKit = () => {
    setKits([...kits, { name: "", description: "", price: 0, products: [] }]);
  };

  const removeKit = (index: number) => {
    setKits(kits.filter((_, i) => i !== index));
  };

  const updateKit = (index: number, field: keyof Kit, value: any) => {
    const updated = [...kits];
    updated[index] = { ...updated[index], [field]: value };
    setKits(updated);
  };

  const moveKitUp = (index: number) => {
    if (index === 0) return;
    const updated = [...kits];
    [updated[index], updated[index - 1]] = [updated[index - 1], updated[index]];
    setKits(updated);
  };

  const moveKitDown = (index: number) => {
    if (index === kits.length - 1) return;
    const updated = [...kits];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    setKits(updated);
  };

  const addProduct = (kitIndex: number) => {
    const updated = [...kits];
    updated[kitIndex].products.push({
      name: "",
      description: "",
      type: "unique",
      image_url: "",
      variants: [],
    });
    setKits(updated);
  };

  const removeProduct = (kitIndex: number, productIndex: number) => {
    const updated = [...kits];
    updated[kitIndex].products = updated[kitIndex].products.filter(
      (_, i) => i !== productIndex
    );
    setKits(updated);
  };

  const updateProduct = (
    kitIndex: number,
    productIndex: number,
    field: keyof Product,
    value: any
  ) => {
    const updated = [...kits];
    updated[kitIndex].products[productIndex] = {
      ...updated[kitIndex].products[productIndex],
      [field]: value,
    };
    setKits(updated);
  };

  const addVariant = (kitIndex: number, productIndex: number) => {
    const updated = [...kits];
    const product = updated[kitIndex].products[productIndex];
    // Use the first variant's group name if exists, otherwise empty
    const groupName = product.variants.length > 0 ? product.variants[0].variant_group_name : null;
    updated[kitIndex].products[productIndex].variants.push({ 
      name: "",
      variant_group_name: groupName,
      available_quantity: null,
    });
    setKits(updated);
  };

  const removeVariant = (
    kitIndex: number,
    productIndex: number,
    variantIndex: number
  ) => {
    const updated = [...kits];
    updated[kitIndex].products[productIndex].variants = updated[kitIndex].products[
      productIndex
    ].variants.filter((_, i) => i !== variantIndex);
    setKits(updated);
  };

  const updateVariant = (
    kitIndex: number,
    productIndex: number,
    variantIndex: number,
    field: 'name' | 'variant_group_name' | 'available_quantity',
    value: string | number | null
  ) => {
    const updated = [...kits];
    if (field === 'available_quantity') {
      updated[kitIndex].products[productIndex].variants[variantIndex][field] = value === '' ? null : (typeof value === 'number' ? value : parseInt(value as string) || null);
    } else {
      updated[kitIndex].products[productIndex].variants[variantIndex][field] = value;
    }
    setKits(updated);
  };

  // Functions for attribute-based variants
  const addAttribute = (kitIndex: number, productIndex: number) => {
    const updated = [...kits];
    if (!updated[kitIndex].products[productIndex].variantAttributes) {
      updated[kitIndex].products[productIndex].variantAttributes = [];
    }
    updated[kitIndex].products[productIndex].variantAttributes!.push({
      name: "",
      values: [],
    });
    setKits(updated);
  };

  const removeAttribute = (kitIndex: number, productIndex: number, attributeIndex: number) => {
    const updated = [...kits];
    if (updated[kitIndex].products[productIndex].variantAttributes) {
      updated[kitIndex].products[productIndex].variantAttributes = updated[kitIndex].products[productIndex].variantAttributes!.filter(
        (_, i) => i !== attributeIndex
      );
      // Clear generated variants when attributes change
      updated[kitIndex].products[productIndex].generatedVariants = [];
      updated[kitIndex].products[productIndex].variants = [];
    }
    setKits(updated);
  };

  const updateAttributeName = (kitIndex: number, productIndex: number, attributeIndex: number, name: string) => {
    const updated = [...kits];
    if (updated[kitIndex].products[productIndex].variantAttributes) {
      updated[kitIndex].products[productIndex].variantAttributes![attributeIndex].name = name;
      // Update variant_attributes array to reflect the new name
      if (updated[kitIndex].products[productIndex].variant_attributes) {
        updated[kitIndex].products[productIndex].variant_attributes![attributeIndex] = name;
      } else {
        updated[kitIndex].products[productIndex].variant_attributes = 
          updated[kitIndex].products[productIndex].variantAttributes!.map(attr => attr.name);
      }
      // Clear generated variants when attributes change (but preserve IDs if regenerating)
      // Don't clear variants array - we'll regenerate from existing variants if needed
      updated[kitIndex].products[productIndex].generatedVariants = [];
    }
    setKits(updated);
  };

  const addAttributeValue = (kitIndex: number, productIndex: number, attributeIndex: number) => {
    const updated = [...kits];
    if (updated[kitIndex].products[productIndex].variantAttributes) {
      updated[kitIndex].products[productIndex].variantAttributes![attributeIndex].values.push("");
      // Clear generated variants when attributes change
      updated[kitIndex].products[productIndex].generatedVariants = [];
      updated[kitIndex].products[productIndex].variants = [];
    }
    setKits(updated);
  };

  const removeAttributeValue = (kitIndex: number, productIndex: number, attributeIndex: number, valueIndex: number) => {
    const updated = [...kits];
    if (updated[kitIndex].products[productIndex].variantAttributes) {
      updated[kitIndex].products[productIndex].variantAttributes![attributeIndex].values = 
        updated[kitIndex].products[productIndex].variantAttributes![attributeIndex].values.filter(
          (_, i) => i !== valueIndex
        );
      // Clear generated variants when attributes change
      updated[kitIndex].products[productIndex].generatedVariants = [];
      updated[kitIndex].products[productIndex].variants = [];
    }
    setKits(updated);
  };

  const updateAttributeValue = (kitIndex: number, productIndex: number, attributeIndex: number, valueIndex: number, value: string) => {
    const updated = [...kits];
    if (updated[kitIndex].products[productIndex].variantAttributes) {
      updated[kitIndex].products[productIndex].variantAttributes![attributeIndex].values[valueIndex] = value;
      // Clear generated variants when attributes change
      updated[kitIndex].products[productIndex].generatedVariants = [];
      updated[kitIndex].products[productIndex].variants = [];
    }
    setKits(updated);
  };

  const moveAttributeValueUp = (kitIndex: number, productIndex: number, attributeIndex: number, valueIndex: number) => {
    if (valueIndex === 0) return;
    const updated = [...kits];
    if (updated[kitIndex].products[productIndex].variantAttributes) {
      // Create a new array copy to ensure React detects the change
      const oldValues = updated[kitIndex].products[productIndex].variantAttributes![attributeIndex].values;
      const newValues = [...oldValues];
      [newValues[valueIndex], newValues[valueIndex - 1]] = [newValues[valueIndex - 1], newValues[valueIndex]];
      
      // Create a new variantAttributes array with the updated values
      const variantAttributes = [...updated[kitIndex].products[productIndex].variantAttributes!];
      variantAttributes[attributeIndex] = {
        ...variantAttributes[attributeIndex],
        values: newValues
      };
      
      // Create a new products array with the updated variantAttributes
      const products = [...updated[kitIndex].products];
      products[productIndex] = {
        ...products[productIndex],
        variantAttributes: variantAttributes,
        generatedVariants: [], // Clear generated variants when order changes
        variants: [] // Clear variants when order changes
      };
      
      // Update the kit with the new products array
      updated[kitIndex] = {
        ...updated[kitIndex],
        products: products
      };
    }
    setKits(updated);
  };

  const moveAttributeValueDown = (kitIndex: number, productIndex: number, attributeIndex: number, valueIndex: number) => {
    const updated = [...kits];
    if (updated[kitIndex].products[productIndex].variantAttributes) {
      const oldValues = updated[kitIndex].products[productIndex].variantAttributes![attributeIndex].values;
      if (valueIndex === oldValues.length - 1) return;
      
      // Create a new array copy to ensure React detects the change
      const newValues = [...oldValues];
      [newValues[valueIndex], newValues[valueIndex + 1]] = [newValues[valueIndex + 1], newValues[valueIndex]];
      
      // Create a new variantAttributes array with the updated values
      const variantAttributes = [...updated[kitIndex].products[productIndex].variantAttributes!];
      variantAttributes[attributeIndex] = {
        ...variantAttributes[attributeIndex],
        values: newValues
      };
      
      // Create a new products array with the updated variantAttributes
      const products = [...updated[kitIndex].products];
      products[productIndex] = {
        ...products[productIndex],
        variantAttributes: variantAttributes,
        generatedVariants: [], // Clear generated variants when order changes
        variants: [] // Clear variants when order changes
      };
      
      // Update the kit with the new products array
      updated[kitIndex] = {
        ...updated[kitIndex],
        products: products
      };
    }
    setKits(updated);
  };

  // Generate all combinations of attributes
  const generateVariants = (kitIndex: number, productIndex: number) => {
    const product = kits[kitIndex].products[productIndex];
    if (!product.variantAttributes || product.variantAttributes.length === 0) {
      return;
    }

    // Filter out empty attributes and values
    const validAttributes = product.variantAttributes.filter(
      attr => attr.name.trim() !== "" && attr.values.length > 0 && attr.values.some(v => v.trim() !== "")
    );

    if (validAttributes.length === 0) {
      return;
    }

    // Generate all combinations using cartesian product
    const generateCombinations = (attributes: VariantAttribute[]): GeneratedVariant[] => {
      if (attributes.length === 0) return [];
      
      // Recursive function to generate cartesian product
      const cartesian = (arrays: string[][]): string[][] => {
        if (arrays.length === 0) return [[]];
        if (arrays.length === 1) return arrays[0].map(v => [v]);
        
        const [first, ...rest] = arrays;
        const restCombinations = cartesian(rest);
        const result: string[][] = [];
        
        first.forEach(firstValue => {
          restCombinations.forEach(restCombo => {
            result.push([firstValue, ...restCombo]);
          });
        });
        
        return result;
      };
      
      // Get attribute names and their values
      const attributeNames = validAttributes.map(attr => attr.name);
      const valueArrays = validAttributes.map(attr => 
        attr.values.filter(v => v.trim() !== "")
      );
      
      // Generate all combinations
      const valueCombinations = cartesian(valueArrays);
      
      // Convert to GeneratedVariant format
      return valueCombinations.map(combo => {
        const attributes: Record<string, string> = {};
        attributeNames.forEach((name, idx) => {
          attributes[name] = combo[idx];
        });
        
        // Generate name: "Amarelo - G" or "Amarelo"
        const name = combo.join(" - ");
        
        // Generate SKU: "produto-amarelo-g" (lowercase, replace spaces with hyphens)
        const skuParts = combo.map(v => v.toLowerCase().replace(/\s+/g, '-'));
        const sku = `${product.name.toLowerCase().replace(/\s+/g, '-')}-${skuParts.join('-')}`;
        
        return {
          attributes,
          name,
          available_quantity: null,
          sku,
        };
      });
    };

    const generated = generateCombinations(validAttributes);
    
    // Preserve IDs and data from existing variants if they match
    const existingVariants = product.variants || [];
    const existingGeneratedVariants = product.generatedVariants || [];
    
    // Match generated variants with existing ones by name
    const generatedWithIds = generated.map(gv => {
      // First try to find in existing generatedVariants (by name)
      const existingGenerated = existingGeneratedVariants.find(egv => egv.name === gv.name);
      if (existingGenerated) {
        return { 
          ...gv, 
          id: existingGenerated.id,
          available_quantity: existingGenerated.available_quantity,
          sku: existingGenerated.sku,
        };
      }
      
      // Then try to find in existing variants (by name)
      const existingVariant = existingVariants.find(ev => ev.name === gv.name);
      if (existingVariant) {
        return { 
          ...gv, 
          id: existingVariant.id,
          available_quantity: existingVariant.available_quantity,
          sku: existingVariant.sku || gv.sku, // Use existing SKU or generated one
        };
      }
      
      // New variant, no ID yet
      return gv;
    });
    
    // Save attribute names for later reconstruction
    const attributeNames = validAttributes.map(attr => attr.name);
    
    const updated = [...kits];
    updated[kitIndex].products[productIndex].generatedVariants = generatedWithIds;
    // Store attribute names in the product for saving
    updated[kitIndex].products[productIndex].variant_attributes = attributeNames;
    setKits(updated);
  };

  const updateGeneratedVariant = (
    kitIndex: number,
    productIndex: number,
    variantIndex: number,
    field: 'available_quantity' | 'sku' | 'price',
    value: string | number | null
  ) => {
    const updated = [...kits];
    if (updated[kitIndex].products[productIndex].generatedVariants) {
      if (field === 'available_quantity' || field === 'price') {
        updated[kitIndex].products[productIndex].generatedVariants![variantIndex][field] = 
          value === '' || value === null ? null : (typeof value === 'number' ? value : parseFloat(value as string) || null);
      } else {
        updated[kitIndex].products[productIndex].generatedVariants![variantIndex][field] = value as string;
      }
    }
    setKits(updated);
  };

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
      },
    ]);
  };

  const removePickupLocation = (locationIndex: number) => {
    setPickupLocations(pickupLocations.filter((_, i) => i !== locationIndex));
  };

  const updatePickupLocation = (
    locationIndex: number,
    field: keyof PickupLocation,
    value: string | PickupScheduleItem[]
  ) => {
    const updated = [...pickupLocations];
    updated[locationIndex][field] = value as never;
    setPickupLocations(updated);
  };

  const addPickupDate = (locationIndex: number) => {
    const updated = [...pickupLocations];
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

  const addBatch = (modalityIndex: number) => {
    const updated = [...modalities];
    updated[modalityIndex].batches.push({
      price: 0,
      valid_from: null,
    });
    setModalities(updated);
  };

  const removeBatch = (modalityIndex: number, batchIndex: number) => {
    const updated = [...modalities];
    updated[modalityIndex].batches = updated[modalityIndex].batches.filter(
      (_, i) => i !== batchIndex
    );
    setModalities(updated);
  };

  const updateBatch = (
    modalityIndex: number,
    batchIndex: number,
    field: keyof Batch,
    value: any
  ) => {
    console.log(`🔄 updateBatch called:`, {
      modalityIndex,
      batchIndex,
      field,
      value,
      valueType: typeof value,
      currentModalitiesCount: modalities.length,
      currentBatchesCount: modalities[modalityIndex]?.batches?.length,
    });
    
    // Deep clone to ensure state update
    const updated = modalities.map((mod, modIdx) => {
      if (modIdx === modalityIndex) {
        return {
          ...mod,
          batches: mod.batches.map((batch, batchIdx) => {
            if (batchIdx === batchIndex) {
              const updatedBatch = {
                ...batch,
                [field]: value,
              };
              console.log(`  ✅ Batch updated:`, updatedBatch);
              return updatedBatch;
            }
            return batch;
          }),
        };
      }
      return mod;
    });
    
    console.log(`📦 State updated. New batch value:`, updated[modalityIndex].batches[batchIndex]);
    setModalities(updated);
  };

  const onSubmit = async (values: EventFormValues) => {
    setIsSubmitting(true);
    try {
      if (!user) {
        toast({
          title: "Erro",
          description: "Você precisa estar autenticado",
          variant: "destructive",
        });
        return;
      }

      // Determine organizer_id: 
      // - If admin selected an organizer, use it
      // - If admin didn't select, use admin's own ID (admin becomes organizer)
      // - If not admin, use current user's ID
      const organizerId = isAdmin && selectedOrganizerId 
        ? selectedOrganizerId 
        : user.id; // Admin's ID if no selection, or regular user's ID

      // Insert or update event
      const eventData = {
        title: values.title,
        description: values.description,
        location: values.location,
        city: values.city,
        state: values.state,
        event_date: values.event_date.toISOString(),
        banner_url: values.banner_url || undefined,
        regulation_url: values.regulation_url || undefined,
        status: values.status,
        organizer_id: organizerId,
        registration_status: values.registration_status || null,
        registration_start_date: values.registration_start_date || null,
        registration_end_date: values.registration_end_date || null,
        registration_auto_mode: values.registration_auto_mode || false,
      };

      let eventId = event?.id;

      if (event?.id) {
        const response = await updateEvent(event.id, eventData);
        if (!response.success) {
          throw new Error(response.error || "Erro ao atualizar evento");
        }
      } else {
        const response = await createEvent(eventData);
        if (!response.success || !response.data) {
          throw new Error(response.error || "Erro ao criar evento");
        }
        eventId = response.data.id;
      }

      // Sync modalities first, then categories (categories depend on modality IDs)
      let finalModalities = modalities;
      if (eventId) {
        try {
          console.log('📤 Syncing modalities:', modalities.length);
          
          // Get existing modalities from the server
          const existingModalitiesResponse = await getModalities(eventId);
          const existingModalities = existingModalitiesResponse.success && existingModalitiesResponse.data 
            ? existingModalitiesResponse.data 
            : [];
          
          // Find modalities to create, update, and delete
          const modalitiesToCreate = modalities.filter(m => !m.id && m.name && m.distance);
          const modalitiesToUpdate = modalities.filter(m => m.id && m.name && m.distance);
          const existingIds = existingModalities.map(m => m.id);
          const currentIds = modalities.filter(m => m.id).map(m => m.id!);
          const modalitiesToDelete = existingIds.filter(id => !currentIds.includes(id));
          
          // Create new modalities and update local state with returned IDs
          const createdModalities: Modality[] = [];
          for (const modality of modalitiesToCreate) {
            const response = await createModality({
              event_id: eventId,
              name: modality.name,
              distance: modality.distance,
            });
            if (response.success && response.data) {
              createdModalities.push(response.data);
            } else {
              console.error('Error creating modality:', response.error);
            }
          }
          
          // Update existing modalities
          for (const modality of modalitiesToUpdate) {
            if (modality.id) {
              try {
                const response = await updateModality(modality.id, {
                  name: modality.name,
                  distance: modality.distance,
                });
                if (response && !response.success) {
                  console.error('Error updating modality:', response.error);
                }
              } catch (error) {
                console.error('Error updating modality:', error);
              }
            }
          }
          
          // Delete removed modalities
          for (const id of modalitiesToDelete) {
            try {
              const response = await deleteModality(id);
              if (response && !response.success) {
                console.error('Error deleting modality:', response.error);
              }
            } catch (error) {
              console.error('Error deleting modality:', error);
            }
          }
          
          // Update local modalities state with new IDs from created modalities
          if (createdModalities.length > 0) {
            finalModalities = modalities.map(mod => {
              // Find matching created modality by name and distance
              const created = createdModalities.find(
                cm => cm.name === mod.name && cm.distance === mod.distance && !mod.id
              );
              return created ? { ...mod, id: created.id } : mod;
            });
            setModalities(finalModalities);
          }
          
          console.log('✅ Modalidades sincronizadas com sucesso');
          
          // Reordenar modalidades se houver IDs salvos
          // Recarregar modalidades do servidor para obter IDs atualizados
          const reloadModalitiesResponse = await getModalities(eventId);
          if (reloadModalitiesResponse.success && reloadModalitiesResponse.data) {
            const savedModalities = reloadModalitiesResponse.data;
            if (savedModalities.length > 1) {
              try {
                // Mapear a ordem atual dos itens locais para os IDs salvos
                const modalityOrders = modalities
                  .map((localMod, index) => {
                    // Encontrar a modalidade salva correspondente pelo nome e distância
                    const savedMod = savedModalities.find(sm => 
                      sm.name === localMod.name && 
                      sm.distance === localMod.distance
                    );
                    return savedMod ? { id: savedMod.id, display_order: index + 1 } : null;
                  })
                  .filter((order): order is { id: string; display_order: number } => order !== null);
                
                if (modalityOrders.length > 1) {
                  await reorderModalities(eventId, { modalityOrders });
                }
              } catch (error) {
                console.error('Error reordering modalities:', error);
              }
            }
          }
        } catch (error: any) {
          console.error('Error syncing modalities:', error);
          toast({
            title: "Aviso",
            description: "Evento salvo, mas houve erro ao salvar modalidades",
            variant: "destructive",
          });
        }
      }

      // Sync categories (use finalModalities which has updated IDs)
      if (eventId) {
        try {
          console.log('📤 Syncing categories:', categories.length);
          
          // Get existing categories from the server
          const existingCategoriesResponse = await getCategories(eventId);
          const existingCategories = existingCategoriesResponse.success && existingCategoriesResponse.data 
            ? existingCategoriesResponse.data 
            : [];
          
          // Validate categories before syncing
          const categoryErrors: string[] = [];
          categories.forEach((category, index) => {
            if (!category.name || category.name.trim().length === 0) {
              categoryErrors.push(`Categoria ${index + 1}: Nome é obrigatório`);
            }
            if (category.price < 0) {
              categoryErrors.push(`Categoria ${index + 1}: Preço deve ser maior ou igual a zero`);
            }
            if (!category.modality_ids || category.modality_ids.length === 0) {
              categoryErrors.push(`Categoria ${index + 1}: Selecione pelo menos uma modalidade`);
            }
          });
          
          if (categoryErrors.length > 0) {
            toast({
              title: "Erro de validação",
              description: categoryErrors.join('\n'),
              variant: "destructive",
            });
            return;
          }
          
          // Map temporary modality IDs to real IDs using finalModalities (which has updated IDs)
          const mapModalityIds = (modalityIds: string[]): string[] => {
            return modalityIds
              .map(id => {
                // Se for um ID temporário (temp-X), encontrar a modalidade correspondente pelo índice
                if (id.startsWith('temp-')) {
                  const tempIndex = parseInt(id.replace('temp-', ''));
                  const modality = finalModalities[tempIndex];
                  return modality?.id || null;
                }
                // Se for um ID real, retornar como está
                return id;
              })
              .filter((id): id is string => id !== null && id !== undefined);
          };
          
          // Garantir que apenas uma categoria seja padrão antes de processar
          let categoriesToProcess = [...categories];
          console.log('🔍 Estado inicial das categorias:', categories.map(c => ({ 
            id: c.id, 
            name: c.name, 
            is_default: c.is_default,
            hasId: !!c.id,
            hasName: !!c.name && c.name.trim().length > 0,
            hasValidPrice: c.price >= 0
          })));
          
          const defaultCategories = categoriesToProcess.filter(c => c.is_default === true);
          if (defaultCategories.length > 1) {
            console.warn('⚠️ Múltiplas categorias marcadas como padrão. Mantendo apenas a primeira.');
            const firstDefaultIndex = categoriesToProcess.findIndex(c => c.is_default === true);
            categoriesToProcess = categoriesToProcess.map((cat, idx) => ({
              ...cat,
              is_default: idx === firstDefaultIndex,
            }));
            // Atualizar o estado local também
            setCategories(categoriesToProcess);
          }
          
          // Find categories to create, update, and delete (usando categoriesToProcess)
          const categoriesToCreate = categoriesToProcess.filter(c => !c.id && c.name && c.name.trim().length > 0 && c.price >= 0);
          const categoriesToUpdate = categoriesToProcess.filter(c => c.id && c.name && c.name.trim().length > 0 && c.price >= 0);
          
          console.log('🔍 Categorias para criar:', categoriesToCreate.length);
          console.log('🔍 Categorias para atualizar:', categoriesToUpdate.length);
          console.log('🔍 Detalhes das categorias para atualizar:', categoriesToUpdate.map(c => ({ 
            id: c.id, 
            name: c.name, 
            is_default: c.is_default 
          })));
          const existingIds = existingCategories.map(c => c.id);
          const currentIds = categoriesToProcess.filter(c => c.id).map(c => c.id!);
          const categoriesToDelete = existingIds.filter(id => !currentIds.includes(id));
          
          // Create new categories
          for (let i = 0; i < categoriesToCreate.length; i++) {
            const category = categoriesToCreate[i];
            const mappedModalityIds = mapModalityIds(category.modality_ids || []);
            // Se for a primeira categoria do evento, marcar como padrão
            const shouldBeDefault = existingCategories.length === 0 && i === 0 
              ? true 
              : category.is_default === true;
            
            const response = await createCategory({
              event_id: eventId,
              name: category.name,
              price: category.price,
              category_type: category.category_type,
              gender: category.gender,
              min_age: category.min_age,
              max_age: category.max_age,
              max_participants: category.max_participants,
              is_default: shouldBeDefault,
              modality_ids: mappedModalityIds,
            });
            if (!response.success) {
              console.error('Error creating category:', response.error);
            }
          }
          
          // Update existing categories
          console.log(`📋 Total de categorias para atualizar: ${categoriesToUpdate.length}`);
          console.log(`📋 Estado atual das categorias antes de salvar:`, categoriesToUpdate.map(c => ({ 
            id: c.id, 
            name: c.name, 
            is_default: c.is_default 
          })));
          
          for (const category of categoriesToUpdate) {
            if (category.id) {
              try {
                const mappedModalityIds = mapModalityIds(category.modality_ids || []);
                const isDefaultValue = category.is_default === true; // Garantir boolean explícito
                console.log(`📤 Atualizando categoria "${category.name}" (ID: ${category.id}): is_default = ${isDefaultValue}`);
                
                const updatePayload = {
                  name: category.name,
                  price: category.price,
                  category_type: category.category_type,
                  gender: category.gender,
                  min_age: category.min_age ?? null,
                  max_age: category.max_age ?? null,
                  max_participants: category.max_participants ?? null,
                  is_default: isDefaultValue, // Sempre enviar, mesmo se false
                  modality_ids: mappedModalityIds,
                };
                console.log('📤 Atualizando categoria com max_age:', {
                  name: category.name,
                  min_age: category.min_age,
                  max_age: category.max_age,
                  payload: updatePayload,
                });
                console.log(`📦 Payload enviado para API:`, JSON.stringify(updatePayload, null, 2));
                console.log(`📦 Tipo de is_default no payload:`, typeof updatePayload.is_default);
                console.log(`📦 Valor de is_default no payload:`, updatePayload.is_default);
                
                const response = await updateCategory(category.id, updatePayload);
                
                if (response && !response.success) {
                  console.error(`❌ Erro ao atualizar categoria "${category.name}":`, response.error);
                } else if (response && response.success) {
                  console.log(`✅ Categoria "${category.name}" atualizada. is_default = ${response.data?.is_default}`);
                  console.log(`📥 Resposta completa:`, JSON.stringify(response.data, null, 2));
                } else {
                  console.error(`❌ Resposta inválida ao atualizar categoria "${category.name}":`, response);
                }
              } catch (error) {
                console.error(`❌ Erro ao atualizar categoria "${category.name}":`, error);
              }
            }
          }
          
          // Delete removed categories
          for (const id of categoriesToDelete) {
            try {
              const response = await deleteCategory(id);
              if (response && !response.success) {
                console.error('Error deleting category:', response.error);
              }
            } catch (error) {
              console.error('Error deleting category:', error);
            }
          }
          
          console.log('✅ Categorias sincronizadas com sucesso');
          
          // Recarregar categorias do servidor para garantir que os valores estão atualizados
          if (eventId) {
            const reloadResponse = await getCategories(eventId);
            if (reloadResponse.success && reloadResponse.data) {
              const reloadedCategories: Category[] = reloadResponse.data.map((cat: CategoryType) => ({
                id: cat.id,
                name: cat.name,
                price: cat.price,
                category_type: cat.category_type,
                gender: cat.gender,
                min_age: cat.min_age,
                max_age: cat.max_age,
                max_participants: cat.max_participants,
                is_default: cat.is_default === true,
                modality_ids: cat.modality_ids || [],
              }));
              console.log("🔄 Categorias recarregadas após salvar:", reloadedCategories.map(c => ({ name: c.name, is_default: c.is_default })));
              setCategories(reloadedCategories);
              
              // Reordenar categorias se houver IDs salvos
              const savedCategories = reloadedCategories;
              if (savedCategories.length > 1) {
                try {
                  // Mapear a ordem atual dos itens locais para os IDs salvos
                  const categoryOrders = categoriesToProcess
                    .map((localCat, index) => {
                      // Encontrar a categoria salva correspondente pelo nome e preço
                      const savedCat = savedCategories.find(sc => 
                        sc.name === localCat.name && 
                        sc.price === localCat.price &&
                        sc.category_type === localCat.category_type
                      );
                      return savedCat ? { id: savedCat.id, display_order: index + 1 } : null;
                    })
                    .filter((order): order is { id: string; display_order: number } => order !== null);
                  
                  if (categoryOrders.length > 1) {
                    await reorderCategories(eventId, { categoryOrders });
                  }
                } catch (error) {
                  console.error('Error reordering categories:', error);
                }
              }
            }
          }
        } catch (error: any) {
          console.error('Error syncing categories:', error);
          toast({
            title: "Aviso",
            description: "Evento salvo, mas houve erro ao salvar categorias",
            variant: "destructive",
          });
        }
      }

      // Sync kits
      if (kits.length > 0 && eventId) {
        try {
          const kitsData = kits.map((kit) => ({
            id: kit.id,
            name: kit.name,
            description: kit.description || null,
            price: kit.price,
            products: kit.products.map((product) => {
              // Extract variant_attributes from product if available
              const variantAttributeNames = product.variant_attributes || 
                                           (product.variantAttributes?.map(attr => attr.name)) || 
                                           null;
              
              return {
                id: product.id,
                name: product.name,
                description: product.description || null,
                type: product.type,
                image_url: product.image_url || null,
                variant_attributes: variantAttributeNames,
                variants: product.type === 'variable' 
                ? (product.generatedVariants && product.generatedVariants.length > 0
                    // Convert generated variants to old format
                    ? product.generatedVariants.map((gv) => {
                        // Use the first attribute name as variant_group_name for grouping
                        // This allows variants to be grouped by their first attribute (e.g., "Cor")
                        const firstAttributeName = Object.keys(gv.attributes)[0] || null;
                        return {
                          id: gv.id, // Preserve variant ID if it exists
                          name: gv.name,
                          variant_group_name: firstAttributeName,
                          available_quantity: gv.available_quantity || null,
                          sku: gv.sku || null,
                        } as any; // Type assertion needed because SyncVariantData may not have sku yet
                      })
                    // Fallback to old variants format if no generated variants
                    : product.variants.length > 0
                      ? product.variants.map((variant) => ({
                          id: variant.id,
                          name: variant.name,
                          variant_group_name: variant.variant_group_name || null,
                          available_quantity: variant.available_quantity || null,
                        }))
                      : undefined)
                : undefined,
              };
            }),
          }));
          
          const { syncEventKits } = await import('@/lib/api/eventKits');
          const kitsResponse = await syncEventKits(eventId, kitsData);
          
          if (!kitsResponse.success) {
            console.error('Error syncing kits:', kitsResponse.error);
            toast({
              title: "Aviso",
              description: "Evento salvo, mas houve erro ao salvar kits",
              variant: "destructive",
            });
          } else {
            // Reordenar kits se houver IDs salvos
            // Recarregar kits do servidor para obter IDs atualizados
            const reloadKitsResponse = await getEventKits(eventId);
            if (reloadKitsResponse.success && reloadKitsResponse.data) {
              const savedKits = reloadKitsResponse.data.filter(k => k.id);
              if (savedKits.length > 1) {
                try {
                  // Mapear a ordem atual dos kits locais para os IDs salvos
                  const kitOrders = kits
                    .map((localKit, index) => {
                      // Encontrar o kit salvo correspondente pelo nome
                      const savedKit = savedKits.find(sk => 
                        sk.name === localKit.name && 
                        sk.price === localKit.price
                      );
                      return savedKit ? { id: savedKit.id, display_order: index + 1 } : null;
                    })
                    .filter((order): order is { id: string; display_order: number } => order !== null);
                  
                  if (kitOrders.length > 1) {
                    await reorderEventKits(eventId, { kitOrders });
                  }
                } catch (error) {
                  console.error('Error reordering kits:', error);
                }
              }
            }
          }
        } catch (error: any) {
          console.error('Error syncing kits:', error);
          toast({
            title: "Aviso",
            description: "Evento salvo, mas houve erro ao salvar kits",
            variant: "destructive",
          });
        }
      }

      // Sync pickup locations
      if (pickupLocations.length > 0 && eventId) {
        try {
          const { getEventPickupLocations, createPickupLocation, updatePickupLocation, deletePickupLocation } = await import('@/lib/api/kitPickup');
          
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
            description: "Evento salvo, mas houve erro ao salvar locais de retirada",
            variant: "destructive",
          });
        }
      }

      toast({
        title: "Sucesso!",
        description: event?.id
          ? "Evento atualizado com sucesso"
          : "Evento criado com sucesso",
      });

      // Call onSuccess before closing dialog to ensure callback is executed
      onSuccess?.();
      
      // Small delay before closing to ensure callback completes
      setTimeout(() => {
        onOpenChange(false);
      }, 100);
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {event ? "Editar Evento" : "Criar Novo Evento"}
          </DialogTitle>
          <DialogDescription>
            Preencha as informações do evento nas abas abaixo
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              // Prevent automatic form submission
              // Only allow submission when explicitly clicking the submit button
            }} 
            className="space-y-6"
            onKeyDown={(e) => {
              // Prevent form submission on Enter key
              if (e.key === "Enter") {
                e.preventDefault();
              }
            }}
          >
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-7">
                <TabsTrigger value="info">Informações</TabsTrigger>
                <TabsTrigger value="modalities">Modalidades</TabsTrigger>
                <TabsTrigger value="categories">Categorias</TabsTrigger>
                <TabsTrigger value="kits">Kits</TabsTrigger>
                <TabsTrigger value="pickup">Retirada</TabsTrigger>
                <TabsTrigger value="payment">Valores</TabsTrigger>
                <TabsTrigger value="publish">Publicação</TabsTrigger>
              </TabsList>

              {/* Tab 1: Informações Gerais */}
              <TabsContent value="info" className="space-y-4">
                {/* Organizer selection for admin when creating new event */}
                {isAdmin && !event?.id && (
                  <div className="space-y-2">
                    <Label htmlFor="organizer-select">Organizador (Opcional)</Label>
                    <Select
                      value={selectedOrganizerId || "self"}
                      onValueChange={(value) => setSelectedOrganizerId(value === "self" ? "" : value)}
                      disabled={loadingOrganizers}
                    >
                      <SelectTrigger id="organizer-select">
                        <SelectValue placeholder={loadingOrganizers ? "Carregando organizadores..." : "Selecione um organizador ou deixe em branco para criar no seu nome"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="self">Criar no meu nome (Admin)</SelectItem>
                        {organizers.map((organizer) => (
                          <SelectItem key={organizer.id} value={organizer.id}>
                            {organizer.name} ({organizer.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Selecione um organizador responsável ou escolha "Criar no meu nome" para criar o evento no seu nome
                    </p>
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome do Evento</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Corrida do Sol 2024" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descrição / Regulamento</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Descreva os detalhes do evento..."
                          className="min-h-[120px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cidade</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: São Paulo" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estado (UF)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="SP"
                            maxLength={2}
                            {...field}
                            onChange={(e) =>
                              field.onChange(e.target.value.toUpperCase())
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Endereço Completo</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ex: Av. Paulista, 1000 - Bela Vista"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="event_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Data e Hora da Largada</FormLabel>
                      <FormControl>
                        <Input
                          type="datetime-local"
                          value={field.value ? format(field.value, "yyyy-MM-dd'T'HH:mm") : ""}
                          onChange={(e) => {
                            if (e.target.value) {
                              field.onChange(new Date(e.target.value));
                            } else {
                              field.onChange(undefined);
                            }
                          }}
                          className="w-full"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="banner_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Banner do Evento</FormLabel>
                      <FormControl>
                        <FileUpload
                          type="banner"
                          value={field.value || null}
                          onChange={(url) => field.onChange(url || '')}
                          maxSize={5}
                          description="Imagem de destaque do evento (recomendado: 1200x600px). Você pode fazer upload de uma imagem ou inserir uma URL."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="regulation_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Regulamento (PDF)</FormLabel>
                      <FormControl>
                        <FileUpload
                          type="regulation"
                          value={field.value || null}
                          onChange={(url) => field.onChange(url || '')}
                          maxSize={10}
                          description="Arquivo PDF com o regulamento do evento. Você pode fazer upload de um PDF ou inserir uma URL."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              {/* Tab 2: Modalidades */}
              <TabsContent value="modalities" className="space-y-4">
                <div className="flex justify-between items-center">
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
                              Modalidade {index + 1}
                            </CardTitle>
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
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-sm font-medium">
                                Nome da Modalidade
                              </label>
                              <Input
                                placeholder="Ex: Corrida 5km, Corrida 10km"
                                value={modality.name}
                                onChange={(e) =>
                                  updateModality(index, "name", e.target.value)
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
                                  updateModality(index, "distance", e.target.value)
                                }
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Tab 3: Categorias */}
              <TabsContent value="categories" className="space-y-4">
                <div className="flex justify-between items-center">
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
                              Categoria {index + 1}
                            </CardTitle>
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
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
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
                                  updateCategory(
                                    index,
                                    "category_type",
                                    e.target.value as CategoryTypeEnum
                                  )
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
                                  updateCategory(
                                    index,
                                    "gender",
                                    e.target.value as CategoryGender
                                  )
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
                                console.log(`🔄 Alterando is_default da categoria ${index} (${category.name}) para ${newValue}`);
                                // Se está marcando como padrão, desmarcar todas as outras
                                if (newValue) {
                                  setCategories(prevCategories => {
                                    const updated = prevCategories.map((cat, idx) => ({
                                      ...cat,
                                      is_default: idx === index ? true : false,
                                    }));
                                    console.log('📝 Categorias atualizadas:', updated.map(c => ({ name: c.name, is_default: c.is_default })));
                                    return updated;
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
                                  // Usar ID real se existir, senão usar identificador temporário baseado no índice
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
                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                      >
                                        {modality.name} ({modality.distance})
                                      </label>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Tab 4: Kits */}
              <TabsContent value="kits" className="space-y-4">
                <div className="flex justify-between items-center">
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

                {kits.length === 0 ? (
                  <Card>
                    <CardContent className="pt-6 text-center text-muted-foreground">
                      Nenhum kit adicionado ainda
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {kits.map((kit, index) => (
                      <Card key={index}>
                        <CardHeader className="pb-3">
                          <div className="flex justify-between items-center">
                            <CardTitle className="text-base">
                              Kit {index + 1}
                            </CardTitle>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => moveKitUp(index)}
                                disabled={index === 0}
                                title="Mover para cima"
                              >
                                <ChevronUp className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => moveKitDown(index)}
                                disabled={index === kits.length - 1}
                                title="Mover para baixo"
                              >
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeKit(index)}
                                title="Remover"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                         <CardContent className="space-y-4">
                           <div>
                             <label className="text-sm font-medium">
                               Nome do Kit
                             </label>
                             <Input
                               placeholder="Ex: Kit Básico, Kit Premium"
                               value={kit.name}
                               onChange={(e) =>
                                 updateKit(index, "name", e.target.value)
                               }
                             />
                           </div>

                           <div>
                             <label className="text-sm font-medium">
                               Descrição / Itens Inclusos
                             </label>
                             <Textarea
                               placeholder="Ex: Camisa, medalha, squeeze, número de peito"
                               value={kit.description}
                               onChange={(e) =>
                                 updateKit(index, "description", e.target.value)
                               }
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
                                 updateKit(
                                   index,
                                   "price",
                                   parseFloat(e.target.value) || 0
                                 )
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

                             {kit.products.length === 0 ? (
                               <p className="text-sm text-muted-foreground text-center py-4">
                                 Nenhum produto adicionado
                               </p>
                             ) : (
                               <div className="space-y-3">
                                 {kit.products.map((product, pIndex) => (
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
                                       value={product.name}
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
                                       value={product.description}
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
                                         Imagem do Produto
                                       </label>
                                       <div className="flex gap-2">
                                         <Input
                                           placeholder="URL da imagem do produto"
                                           value={product.image_url}
                                           onChange={(e) =>
                                             updateProduct(
                                               index,
                                               pIndex,
                                               "image_url",
                                               e.target.value
                                             )
                                           }
                                         />
                                         <Button
                                           type="button"
                                           variant="outline"
                                           size="icon"
                                         >
                                           <Upload className="h-4 w-4" />
                                         </Button>
                                       </div>
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
                                           onClick={() => {
                                             updateProduct(
                                               index,
                                               pIndex,
                                               "type",
                                               "variable"
                                             );
                                             // Initialize variantAttributes if not exists
                                             if (!product.variantAttributes) {
                                               const updated = [...kits];
                                               updated[index].products[pIndex].variantAttributes = [];
                                               setKits(updated);
                                             }
                                           }}
                                         >
                                           Variável
                                         </Button>
                                       </div>
                                     </div>

                                     {product.type === "variable" && (
                                       <div className="space-y-4">
                                         {/* Attributes Section */}
                                         <div className="space-y-3">
                                           <div className="flex justify-between items-center">
                                             <label className="text-sm font-semibold">
                                               Atributos
                                             </label>
                                             <Button
                                               type="button"
                                               variant="outline"
                                               size="sm"
                                               onClick={() => addAttribute(index, pIndex)}
                                             >
                                               <Plus className="mr-1 h-3 w-3" />
                                               Adicionar Atributo
                                             </Button>
                                           </div>

                                           {(!product.variantAttributes || product.variantAttributes.length === 0) ? (
                                             <p className="text-xs text-muted-foreground text-center py-2">
                                               Adicione atributos (ex: Cor, Tamanho, Material) e seus valores
                                             </p>
                                           ) : (
                                             <div className="space-y-3">
                                               {product.variantAttributes.map((attribute, attrIndex) => (
                                                 <div key={attrIndex} className="border rounded-lg p-3 space-y-2">
                                                   <div className="flex items-center gap-2">
                                                     <Input
                                                       placeholder="Nome do atributo (ex: Cor, Tamanho)"
                                                       value={attribute.name}
                                                       onChange={(e) => updateAttributeName(index, pIndex, attrIndex, e.target.value)}
                                                       className="flex-1 font-semibold"
                                                     />
                                                     <Button
                                                       type="button"
                                                       variant="ghost"
                                                       size="icon"
                                                       onClick={() => removeAttribute(index, pIndex, attrIndex)}
                                                     >
                                                       <X className="h-4 w-4" />
                                                     </Button>
                                                   </div>
                                                   <div className="space-y-2 ml-2">
                                                     <div className="flex justify-between items-center">
                                                       <label className="text-xs text-muted-foreground">
                                                         Valores
                                                       </label>
                                                       <Button
                                                         type="button"
                                                         variant="ghost"
                                                         size="sm"
                                                         onClick={() => addAttributeValue(index, pIndex, attrIndex)}
                                                       >
                                                         <Plus className="mr-1 h-3 w-3" />
                                                         Adicionar Valor
                                                       </Button>
                                                     </div>
                                                     <div className="space-y-1">
                                                       {attribute.values.map((value, valueIndex) => (
                                                         <div key={valueIndex} className="flex gap-1">
                                                           <div className="flex items-center gap-1">
                                                             <Button
                                                               type="button"
                                                               variant="ghost"
                                                               size="icon"
                                                               onClick={() => moveAttributeValueUp(index, pIndex, attrIndex, valueIndex)}
                                                               disabled={valueIndex === 0}
                                                               title="Mover para cima"
                                                               className="h-7 w-7"
                                                             >
                                                               <ChevronUp className="h-3 w-3" />
                                                             </Button>
                                                             <Button
                                                               type="button"
                                                               variant="ghost"
                                                               size="icon"
                                                               onClick={() => moveAttributeValueDown(index, pIndex, attrIndex, valueIndex)}
                                                               disabled={valueIndex === attribute.values.length - 1}
                                                               title="Mover para baixo"
                                                               className="h-7 w-7"
                                                             >
                                                               <ChevronDown className="h-3 w-3" />
                                                             </Button>
                                                           </div>
                                                           <Input
                                                             placeholder={`Valor ${valueIndex + 1} (ex: ${attribute.name === 'Cor' ? 'Amarelo' : attribute.name === 'Tamanho' ? 'G' : 'Valor'})`}
                                                             value={value}
                                                             onChange={(e) => updateAttributeValue(index, pIndex, attrIndex, valueIndex, e.target.value)}
                                                             className="flex-1"
                                                           />
                                                           <Button
                                                             type="button"
                                                             variant="ghost"
                                                             size="icon"
                                                             onClick={() => removeAttributeValue(index, pIndex, attrIndex, valueIndex)}
                                                             title="Remover"
                                                           >
                                                             <X className="h-4 w-4" />
                                                           </Button>
                                                         </div>
                                                       ))}
                                                       {attribute.values.length === 0 && (
                                                         <p className="text-xs text-muted-foreground text-center py-1">
                                                           Adicione valores para este atributo
                                                         </p>
                                                       )}
                                                     </div>
                                                   </div>
                                                 </div>
                                               ))}
                                             </div>
                                           )}
                                         </div>

                                         {/* Generate Variants Button */}
                                         {product.variantAttributes && product.variantAttributes.length > 0 && 
                                          product.variantAttributes.some(attr => attr.name.trim() !== "" && attr.values.some(v => v.trim() !== "")) && (
                                           <Button
                                             type="button"
                                             variant="default"
                                             size="sm"
                                             onClick={() => generateVariants(index, pIndex)}
                                             className="w-full"
                                           >
                                             Gerar Variações
                                           </Button>
                                         )}

                                         {/* Generated Variants Table */}
                                         {product.generatedVariants && product.generatedVariants.length > 0 && (
                                           <div className="space-y-2">
                                             <label className="text-sm font-semibold">
                                               Variações Geradas ({product.generatedVariants.length})
                                             </label>
                                             <div className="border rounded-lg overflow-hidden">
                                               <Table>
                                                 <TableHeader>
                                                   <TableRow>
                                                     {product.variantAttributes?.filter(attr => attr.name.trim() !== "").map((attr) => (
                                                       <TableHead key={attr.name} className="font-semibold">
                                                         {attr.name}
                                                       </TableHead>
                                                     ))}
                                                     <TableHead className="font-semibold">Estoque</TableHead>
                                                     <TableHead className="font-semibold">SKU</TableHead>
                                                   </TableRow>
                                                 </TableHeader>
                                                 <TableBody>
                                                   {product.generatedVariants.map((variant, vIndex) => (
                                                     <TableRow key={vIndex}>
                                                       {product.variantAttributes?.filter(attr => attr.name.trim() !== "").map((attr) => (
                                                         <TableCell key={attr.name}>
                                                           {variant.attributes[attr.name] || '-'}
                                                         </TableCell>
                                                       ))}
                                                       <TableCell>
                                                         <Input
                                                           type="number"
                                                           value={variant.available_quantity || ""}
                                                           onChange={(e) => updateGeneratedVariant(index, pIndex, vIndex, 'available_quantity', e.target.value)}
                                                           placeholder="0"
                                                           className="w-20"
                                                           min="0"
                                                         />
                                                       </TableCell>
                                                       <TableCell>
                                                         <Input
                                                           value={variant.sku || ""}
                                                           onChange={(e) => updateGeneratedVariant(index, pIndex, vIndex, 'sku', e.target.value)}
                                                           placeholder="sku"
                                                           className="w-32"
                                                         />
                                                       </TableCell>
                                                     </TableRow>
                                                   ))}
                                                 </TableBody>
                                               </Table>
                                             </div>
                                           </div>
                                         )}
                                       </div>
                                     )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Tab 4: Pickup Locations */}
              <TabsContent value="pickup" className="space-y-4">
                <div className="flex justify-between items-center">
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

                {pickupLocations.length === 0 ? (
                  <Card>
                    <CardContent className="pt-6 text-center text-muted-foreground">
                      Nenhum local de retirada adicionado ainda
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {pickupLocations.map((location, locationIndex) => (
                      <Card key={locationIndex}>
                        <CardHeader className="pb-3">
                          <div className="flex justify-between items-center">
                            <CardTitle className="text-base">
                              {location.name || `Local ${locationIndex + 1}`}
                            </CardTitle>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removePickupLocation(locationIndex)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {/* Nome do Local */}
                          <div>
                            <label className="text-sm font-medium">Nome do Local *</label>
                            <Input
                              placeholder="Ex: Loja Central, Estádio, Shopping..."
                              value={location.name}
                              onChange={(e) =>
                                updatePickupLocation(locationIndex, "name", e.target.value)
                              }
                            />
                          </div>

                          {/* Endereço */}
                          <div>
                            <label className="text-sm font-medium">Endereço *</label>
                            <Textarea
                              placeholder="Endereço completo do local de retirada"
                              className="min-h-[80px]"
                              value={location.address}
                              onChange={(e) =>
                                updatePickupLocation(locationIndex, "address", e.target.value)
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
                                updatePickupLocation(locationIndex, "additional_info", e.target.value)
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
                                onClick={() => addPickupDate(locationIndex)}
                              >
                                <Plus className="mr-2 h-3 w-3" />
                                Adicionar Data
                              </Button>
                            </div>

                            <div className="space-y-4">
                              {location.pickup_schedule.map((scheduleItem, dateIndex) => (
                                <Card key={dateIndex} className="bg-muted/50">
                                  <CardContent className="pt-4 space-y-3">
                                    <div className="flex justify-between items-center">
                                      <label className="text-sm font-medium">Data {dateIndex + 1}</label>
                                      {location.pickup_schedule.length > 1 && (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => removePickupDate(locationIndex, dateIndex)}
                                        >
                                          <X className="h-4 w-4 text-destructive" />
                                        </Button>
                                      )}
                                    </div>
                                    <Input
                                      type="date"
                                      value={scheduleItem.date}
                                      onChange={(e) =>
                                        updatePickupDate(locationIndex, dateIndex, e.target.value)
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
                                          onClick={() => addPickupTimeSlot(locationIndex, dateIndex)}
                                        >
                                          <Plus className="mr-1 h-3 w-3" />
                                          Adicionar Horário
                                        </Button>
                                      </div>
                                      <div className="space-y-2">
                                        {scheduleItem.time_slots.map((timeSlot, timeSlotIndex) => (
                                          <div key={timeSlotIndex} className="flex gap-2 items-center">
                                            <Input
                                              type="time"
                                              placeholder="Início"
                                              value={timeSlot.start_time}
                                              onChange={(e) =>
                                                updatePickupTimeSlot(
                                                  locationIndex,
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
                                              value={timeSlot.end_time}
                                              onChange={(e) =>
                                                updatePickupTimeSlot(
                                                  locationIndex,
                                                  dateIndex,
                                                  timeSlotIndex,
                                                  "end_time",
                                                  e.target.value
                                                )
                                              }
                                              className="flex-1"
                                            />
                                            {scheduleItem.time_slots.length > 1 && (
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={() =>
                                                  removePickupTimeSlot(locationIndex, dateIndex, timeSlotIndex)
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
                                  updatePickupLocation(locationIndex, "latitude", e.target.value)
                                }
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium">Longitude (Opcional)</label>
                              <Input
                                placeholder="-46.633308"
                                value={location.longitude || ""}
                                onChange={(e) =>
                                  updatePickupLocation(locationIndex, "longitude", e.target.value)
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
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Tab 5: Valores e Pagamento */}
              <TabsContent value="payment" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Configurações de Pagamento</CardTitle>
                    <CardDescription>
                      Configure as formas de pagamento aceitas
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-lg border p-4 space-y-2">
                      <h4 className="font-medium">Formas de Pagamento</h4>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge>Pix</Badge>
                          <Badge>Cartão de Crédito</Badge>
                          <Badge variant="outline">Boleto</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          As configurações de pagamento serão gerenciadas pelo sistema
                        </p>
                      </div>
                    </div>

                    <div className="rounded-lg border p-4 space-y-2">
                      <h4 className="font-medium">Política de Reembolso</h4>
                      <p className="text-sm text-muted-foreground">
                        Configure em Configurações {'>'} Financeiro
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Tab 6: Publicação */}
              <TabsContent value="publish" className="space-y-4">
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status do Evento</FormLabel>
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant={field.value === "draft" ? "default" : "outline"}
                            onClick={() => field.onChange("draft")}
                          >
                            📝 Rascunho
                          </Button>
                          <Button
                            type="button"
                            variant={
                              field.value === "published" ? "default" : "outline"
                            }
                            onClick={() => field.onChange("published")}
                          >
                            ✅ Publicado
                          </Button>
                          <Button
                            type="button"
                            variant={
                              field.value === "finished" ? "default" : "outline"
                            }
                            onClick={() => field.onChange("finished")}
                          >
                            🏁 Finalizado
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {field.value === "draft" &&
                            "O evento estará visível apenas para você"}
                          {field.value === "published" &&
                            "O evento será público e aceita inscrições"}
                          {field.value === "finished" &&
                            "O evento está encerrado e não aceita mais inscrições"}
                        </p>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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
                          form.setValue("registration_auto_mode", checked as boolean);
                          // Se desativar modo automático, limpar datas
                          if (!checked) {
                            form.setValue("registration_start_date", null);
                            form.setValue("registration_end_date", null);
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
                        <FormField
                          control={form.control}
                          name="registration_start_date"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Data/Hora de Abertura</FormLabel>
                              <FormControl>
                                <Input
                                  type="datetime-local"
                                  value={field.value ? new Date(field.value).toISOString().slice(0, 16) : ""}
                                  onChange={(e) => {
                                    const value = e.target.value ? new Date(e.target.value).toISOString() : null;
                                    field.onChange(value);
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="registration_end_date"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Data/Hora de Encerramento</FormLabel>
                              <FormControl>
                                <Input
                                  type="datetime-local"
                                  value={field.value ? new Date(field.value).toISOString().slice(0, 16) : ""}
                                  onChange={(e) => {
                                    const value = e.target.value ? new Date(e.target.value).toISOString() : null;
                                    field.onChange(value);
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    ) : (
                      <FormField
                        control={form.control}
                        name="registration_status"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Status das Inscrições</FormLabel>
                            <Select
                              value={field.value || "default"}
                              onValueChange={(value) => field.onChange(value === "default" ? null : value)}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione o status" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="not_open">Inscrições em Breve</SelectItem>
                                <SelectItem value="open">Inscrições Abertas</SelectItem>
                                <SelectItem value="closed">Inscrições Encerradas</SelectItem>
                                <SelectItem value="default">Usar Status Padrão</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              Deixe em branco para usar a lógica padrão baseada no status do evento
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Resumo do Evento</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Nome:</span>
                        <p className="font-medium">
                          {form.watch("title") || "Não informado"}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Data:</span>
                        <p className="font-medium">
                          {form.watch("event_date")
                            ? format(form.watch("event_date"), "PPP", {
                                locale: ptBR,
                              })
                            : "Não informada"}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Cidade:</span>
                        <p className="font-medium">
                          {form.watch("city") || "Não informada"}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Estado:</span>
                        <p className="font-medium">
                          {form.watch("state") || "Não informado"}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Modalidades:</span>
                        <p className="font-medium">{modalities.length}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Kits:</span>
                        <p className="font-medium">{kits.length}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <div className="flex justify-between pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <div className="flex gap-2">
                {activeTab !== "info" && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const tabs = ["info", "modalities", "categories", "kits", "pickup", "payment", "publish"];
                      const currentIndex = tabs.indexOf(activeTab);
                      if (currentIndex > 0) {
                        setActiveTab(tabs[currentIndex - 1]);
                      }
                    }}
                  >
                    Voltar
                  </Button>
                )}
                {activeTab !== "publish" ? (
                  <>
                    {event?.id && (
                      <Button
                        type="button"
                        variant="default"
                        disabled={isSubmitting}
                        onClick={() => {
                          form.handleSubmit(onSubmit)();
                        }}
                      >
                        {isSubmitting ? "Salvando..." : "Atualizar"}
                      </Button>
                    )}
                    <Button
                      type="button"
                      onClick={() => {
                        const tabs = ["info", "modalities", "categories", "kits", "pickup", "payment", "publish"];
                        const currentIndex = tabs.indexOf(activeTab);
                        if (currentIndex < tabs.length - 1) {
                          setActiveTab(tabs[currentIndex + 1]);
                        }
                      }}
                    >
                      Próximo
                    </Button>
                  </>
                ) : (
                  <Button 
                    type="button" 
                    disabled={isSubmitting}
                    onClick={() => {
                      form.handleSubmit(onSubmit)();
                    }}
                  >
                    {isSubmitting
                      ? "Salvando..."
                      : event
                      ? "Atualizar Evento"
                      : "Criar Evento"}
                  </Button>
                )}
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
