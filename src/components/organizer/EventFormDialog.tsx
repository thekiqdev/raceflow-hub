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
import { CalendarIcon, Plus, Trash2, Upload, X, ChevronUp, ChevronDown, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn, isoToDatetimeLocal, processDatetimeLocalForSave, datetimeLocalToISO } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { createEvent, updateEvent, getEventById, type CronogramaItemInput } from "@/lib/api/events";
import { getEventCategories } from "@/lib/api/eventCategories";
import { getEventKits } from "@/lib/api/eventKits";
import { getModalities, createModality, updateModality as updateModalityAPI, deleteModality, reorderModalities, type Modality as ModalityType } from "@/lib/api/modalities";
import { getCategories, createCategory, updateCategory, deleteCategory, reorderCategories, type Category as CategoryType, type CategoryType as CategoryTypeEnum, type CategoryGender, type CategoryBatch, type CategoryCustomField } from "@/lib/api/categories";
import { createCategoryCustomField, updateCategoryCustomField, deleteCategoryCustomField } from "@/lib/api/categoryCustomFields";
import { getCategoryBatches, createCategoryBatch, updateCategoryBatch, deleteCategoryBatch } from "@/lib/api/categoryBatches";
import { reorderEventKits } from "@/lib/api/eventKits";
import { FileUpload } from "@/components/ui/file-upload";
import { Switch } from "@/components/ui/switch";
import { deleteUploadedFile } from "@/lib/api/upload";
import { getOrganizers } from "@/lib/api/userManagement";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const eventFormSchema = z.object({
  title: z.string().min(3, "Nome deve ter no mínimo 3 caracteres"),
  description: z.string().min(10, "Descrição deve ter no mínimo 10 caracteres"),
  location: z.string().min(5, "Endereço completo é obrigatório"),
  city: z.string().min(2, "Cidade é obrigatória"),
  state: z.string().length(2, "UF deve ter 2 caracteres"),
  event_date: z.string().min(1, "Data do evento é obrigatória"),
  event_time: z.string().optional(),
  banner_url: z.string().optional(),
  regulation_url: z.string().optional(),
  status: z.enum(["draft", "published", "finished"]),
  registration_status: z.enum(["not_open", "open", "closed"]).nullable().optional(),
  registration_start_date: z.string().nullable().optional(),
  registration_end_date: z.string().nullable().optional(),
  registration_auto_mode: z.boolean().optional(),
  pix_enabled: z.boolean().optional(),
  pix_disabled_at: z.string().nullable().optional(),
  credit_card_enabled: z.boolean().optional(),
  credit_card_disabled_at: z.string().nullable().optional(),
  transfers_enabled: z.boolean().optional(),
  transfer_until: z.string().optional().nullable(),
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
  max_participants?: number | null;
  route_image_url?: string | null;
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
  batches?: CategoryBatch[];
  custom_fields?: CategoryCustomField[];
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
  category_ids?: string[];
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

function CustomFieldInlineForm({
  label: initialLabel,
  field_type: initialFieldType,
  saving,
  onSave,
  onCancel,
}: {
  label: string;
  field_type: "text" | "number";
  saving: boolean;
  onSave: (label: string, field_type: "text" | "number") => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initialLabel);
  const [fieldType, setFieldType] = useState<"text" | "number">(initialFieldType);
  useEffect(() => {
    setLabel(initialLabel);
    setFieldType(initialFieldType);
  }, [initialLabel, initialFieldType]);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
      <div className="space-y-2">
        <Label className="text-xs font-medium">Nome do campo</Label>
        <Input
          placeholder="Ex.: Número da camisa"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="h-9"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs font-medium">Tipo</Label>
        <Select value={fieldType} onValueChange={(v) => setFieldType(v as "text" | "number")}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">Texto</SelectItem>
            <SelectItem value="number">Número</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2 md:col-span-2">
        <Button type="button" size="sm" onClick={() => onSave(label, fieldType)} disabled={saving || !label.trim()}>
          {saving ? "Salvando..." : "Salvar"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </div>
  );
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
  const [premiacaoHtml, setPremiacaoHtml] = useState<string>("");
  const [cronogramaItems, setCronogramaItems] = useState<CronogramaItemInput[]>([]);
  const [cronogramaHtml, setCronogramaHtml] = useState<string>("");
  const [customFieldAddingCategoryIndex, setCustomFieldAddingCategoryIndex] = useState<number | null>(null);
  const [customFieldEditing, setCustomFieldEditing] = useState<{ fieldId: string; categoryId: string; categoryIndex: number; label: string; field_type: "text" | "number" } | null>(null);
  const [customFieldSaving, setCustomFieldSaving] = useState(false);

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      title: "",
      description: "",
      location: "",
      city: "",
      state: "",
      event_date: "",
      event_time: "",
      banner_url: "",
      regulation_url: "",
      status: "draft",
      registration_status: null,
      registration_start_date: null,
      registration_end_date: null,
      registration_auto_mode: false,
      pix_enabled: true,
      pix_disabled_at: null,
      credit_card_enabled: true,
      credit_card_disabled_at: null,
      transfers_enabled: true,
      transfer_until: "",
    },
  });

  const transfersEnabled = form.watch("transfers_enabled");

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
          event_date: "",
          event_time: "",
          banner_url: "",
          regulation_url: "",
          status: "draft",
          registration_status: null,
          registration_start_date: null,
          registration_end_date: null,
          registration_auto_mode: false,
          pix_enabled: true,
          pix_disabled_at: null,
          credit_card_enabled: true,
          credit_card_disabled_at: null,
          transfers_enabled: true,
          transfer_until: "",
        });
        setRegistrationAutoMode(false);
        setModalities([]);
        setCategories([]);
        setKits([]);
        setPickupLocations([]);
        setActiveTab("info");
        setSelectedOrganizerId("");
        setOrganizers([]);
        setPremiacaoHtml("");
        setCronogramaItems([]);
        setCronogramaHtml("");
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
            
            // Converter event_date para separar data e horário
            const eventDateTime = eventData.event_date ? isoToDatetimeLocal(eventData.event_date) : "";
            const [eventDate, eventTime] = eventDateTime ? eventDateTime.split('T') : ["", ""];
            
            form.reset({
              title: eventData.title || "",
              description: eventData.description || "",
              location: eventData.location || "",
              city: eventData.city || "",
              state: eventData.state || "",
              event_date: eventDate || "",
              event_time: eventTime || "",
              banner_url: eventData.banner_url || "",
              regulation_url: eventData.regulation_url || "",
              status: eventData.status || "draft",
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

            // Set organizer ID for admin editing
            if (isAdmin && eventData.organizer_id) {
              setSelectedOrganizerId(eventData.organizer_id);
            }

            // Load modalities
            const modalitiesResponse = await getModalities(event.id);
            if (modalitiesResponse.success && modalitiesResponse.data) {
              const loadedModalities: Modality[] = modalitiesResponse.data.map((mod: ModalityType) => ({
                id: mod.id,
                name: mod.name,
                distance: mod.distance,
                max_participants: mod.max_participants ?? null,
                route_image_url: mod.route_image_url ?? null,
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
                batches: cat.batches || [],
                custom_fields: cat.custom_fields || [],
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
                category_ids: kit.category_ids,
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
          event_date: "",
          event_time: "",
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

  // Load organizers for admin when dialog opens (both creating and editing)
  useEffect(() => {
    const loadOrganizers = async () => {
      // Load organizers for admin when creating or editing event
      if (!isAdmin || !open) return;
      setLoadingOrganizers(true);
      try {
        const response = await getOrganizers();
        if (response.success && response.data) {
          setOrganizers(response.data);
          // Se o usuário atual for um organizador e estiver criando novo evento, selecionar por padrão
          if (!event?.id && user && response.data.find((o: any) => o.id === user.id)) {
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

    if (open && isAdmin) {
      loadOrganizers();
    }
  }, [open, isAdmin, event?.id, user, toast]);

  // Função para validar campos obrigatórios de cada etapa
  const validateStep = async (step: string): Promise<boolean> => {
    const values = form.getValues();
    
    if (step === "info") {
      // Validar campos obrigatórios da aba Informações
      const fieldsToValidate: (keyof EventFormValues)[] = [
        "title",
        "description",
        "location",
        "city",
        "state",
        "event_date",
      ];
      
      // Trigger validation apenas para os campos desta etapa
      const result = await form.trigger(fieldsToValidate);
      
      if (!result) {
        // Mostrar toast com erro
        toast({
          title: "Campos obrigatórios não preenchidos",
          description: "Por favor, preencha todos os campos obrigatórios da aba Informações antes de continuar.",
          variant: "destructive",
        });
        return false;
      }
      
      return true;
    }
    
    // Para outras etapas, permitir avançar (pode adicionar validações futuras)
    return true;
  };

  // Função para lidar com mudança de aba com validação
  const handleTabChange = async (newTab: string) => {
    const tabs = ["info", "premiacao", "cronograma", "modalities", "categories", "kits", "pickup", "payment", "publish"];
    const currentIndex = tabs.indexOf(activeTab);
    const newIndex = tabs.indexOf(newTab);
    
    // Se está tentando avançar (não retroceder), validar etapa atual
    if (newIndex > currentIndex) {
      const isValid = await validateStep(activeTab);
      if (!isValid) {
        return; // Não permite mudar de aba se validação falhar
      }
    }
    
    // Se validação passou ou está retrocedendo, permite mudança
    setActiveTab(newTab);
  };

  const addModality = () => {
    setModalities([
      ...modalities,
      { name: "", distance: "", max_participants: null },
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

  // Cronograma (timeline)
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
        batches: [],
        custom_fields: [],
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

  const refetchCategoriesForCustomFields = async () => {
    if (!event?.id) return;
    const res = await getCategories(event.id);
    if (res.success && res.data) setCategories(res.data as Category[]);
  };

  const isPendingCustomField = (f: { id: string }) => f.id.startsWith("temp-");
  const isCategorySaved = (c: Category) => c.id && !c.id.startsWith("temp-");

  const addPendingCustomField = (categoryIndex: number, label: string, field_type: "text" | "number") => {
    const updated = [...categories];
    const cat = updated[categoryIndex];
    const list = cat.custom_fields ?? [];
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
    const list = cat.custom_fields ?? [];
    updated[categoryIndex] = {
      ...cat,
      custom_fields: list.map((f) =>
        f.id === fieldId ? { ...f, label: label.trim(), field_type } : f
      ),
    };
    setCategories(updated);
    setCustomFieldEditing(null);
  };

  const removeCustomFieldLocal = (categoryIndex: number, fieldId: string) => {
    const updated = [...categories];
    const cat = updated[categoryIndex];
    const list = cat.custom_fields ?? [];
    updated[categoryIndex] = { ...cat, custom_fields: list.filter((f) => f.id !== fieldId) };
    setCategories(updated);
    setCustomFieldEditing(null);
  };

  const handleCreateCustomField = async (categoryIndex: number, label: string, field_type: "text" | "number") => {
    const category = categories[categoryIndex];
    if (!label.trim()) return;
    if (!isCategorySaved(category)) {
      addPendingCustomField(categoryIndex, label, field_type);
      toast({ title: "Campo adicionado", description: "Será salvo ao salvar o evento." });
      return;
    }
    setCustomFieldSaving(true);
    try {
      const res = await createCategoryCustomField(category.id!, { label: label.trim(), field_type });
      if (res.success) {
        await refetchCategoriesForCustomFields();
        setCustomFieldAddingCategoryIndex(null);
        toast({ title: "Campo adicionado", description: "Campo personalizado criado com sucesso." });
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
        toast({ title: "Campo atualizado", description: "Campo personalizado atualizado com sucesso." });
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
    if (!confirm("Remover este campo personalizado? Os valores já preenchidos em inscrições serão mantidos, mas o campo não aparecerá mais na categoria.")) return;
    setCustomFieldSaving(true);
    try {
      const res = await deleteCategoryCustomField(categoryId, fieldId);
      if (res.success) {
        await refetchCategoriesForCustomFields();
        setCustomFieldEditing(null);
        toast({ title: "Campo removido", description: "Campo personalizado removido." });
      } else {
        toast({ title: "Erro", description: res.message || res.error || "Não foi possível remover.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "Não foi possível remover.", variant: "destructive" });
    } finally {
      setCustomFieldSaving(false);
    }
  };

  const addKit = () => {
    setKits([...kits, { name: "", description: "", price: 0, products: [], category_ids: undefined }]);
  };

  const removeKit = (index: number) => {
    const kit = kits[index];
    if (kit?.id) {
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
      // - If admin selected an organizer (and it's different from current), use it
      // - If admin selected "self" or didn't select and editing event, keep current organizer_id
      // - If admin didn't select and creating event, use admin's own ID (admin becomes organizer)
      // - If not admin, use current user's ID
      let organizerId: string;
      if (isAdmin) {
        if (selectedOrganizerId && selectedOrganizerId !== "self" && selectedOrganizerId !== (event?.organizer_id || "")) {
          // Admin selected a different organizer
          organizerId = selectedOrganizerId;
          console.log('🔄 Admin alterando organizador:', {
            current: event?.organizer_id,
            new: selectedOrganizerId,
            eventId: event?.id
          });
        } else if (event?.id && event.organizer_id) {
          // Editing event: keep current organizer if not changed
          organizerId = event.organizer_id;
        } else {
          // Creating event: use admin's ID
          organizerId = user.id;
        }
      } else {
        // Not admin: use current user's ID
        organizerId = user.id;
      }

      // Combinar data e horário em ISO datetime
      let eventDateISO: string | null = null;
      if (values.event_date) {
        const datetimeLocal = values.event_time 
          ? `${values.event_date}T${values.event_time}`
          : `${values.event_date}T00:00`;
        eventDateISO = datetimeLocalToISO(datetimeLocal);
      }
      
      if (!eventDateISO) {
        toast({
          title: "Erro",
          description: "Data do evento é obrigatória",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      // Insert or update event
      const eventData = {
        title: values.title,
        description: values.description,
        location: values.location,
        city: values.city,
        state: values.state,
        event_date: eventDateISO,
        banner_url: values.banner_url || undefined,
        regulation_url: values.regulation_url || undefined,
        status: values.status,
        organizer_id: organizerId,
        registration_status: values.registration_status || null,
        registration_start_date: values.registration_start_date || null,
        registration_end_date: values.registration_end_date || null,
        registration_auto_mode: values.registration_auto_mode || false,
        pix_enabled: values.pix_enabled ?? true,
        pix_disabled_at: values.pix_disabled_at || null,
        credit_card_enabled: values.credit_card_enabled ?? true,
        credit_card_disabled_at: values.credit_card_disabled_at || null,
        transfers_enabled: values.transfers_enabled ?? true,
        transfer_until:
          (values.transfers_enabled ?? true) &&
          values.transfer_until &&
          String(values.transfer_until).trim() !== ""
            ? String(values.transfer_until).trim().slice(0, 10)
            : null,
        premiacao: premiacaoHtml?.trim() || null,
        cronograma: cronogramaHtml?.trim() || null,
      };

      let eventId = event?.id;

      const normalizedCronogramaItems = cronogramaItems
        .filter((it) => (it.title ?? "").trim().length > 0 && (it.time ?? "").trim().length > 0)
        .map((it, i) => ({
          time: it.time.trim(),
          title: it.title.trim(),
          description: (it.description ?? "").trim() || null,
          display_order: i + 1,
        }));

      if (event?.id) {
        const eventDataWithCronograma = {
          ...eventData,
          cronograma_items: normalizedCronogramaItems,
        };
        const response = await updateEvent(event.id, eventDataWithCronograma);
        if (!response.success) {
          throw new Error(response.error || "Erro ao atualizar evento");
        }
      } else {
        const response = await createEvent(eventData);
        if (!response.success || !response.data) {
          throw new Error(response.error || "Erro ao criar evento");
        }
        eventId = response.data.id;
        if (normalizedCronogramaItems.length > 0) {
          await updateEvent(eventId, { cronograma_items: normalizedCronogramaItems });
        }
      }

      // Sync modalities first (create/update only), then categories; delete modalities only after categories no longer reference them
      let finalModalities = modalities;
      let modalitiesToDelete: string[] = [];
      if (eventId) {
        try {
          console.log('📤 Syncing modalities:', modalities.length);
          
          // Get existing modalities from the server
          const existingModalitiesResponse = await getModalities(eventId);
          const existingModalities = existingModalitiesResponse.success && existingModalitiesResponse.data 
            ? existingModalitiesResponse.data 
            : [];
          
          // Find modalities to create, update, and delete (delete will run after categories sync)
          const modalitiesToCreate = modalities.filter(m => !m.id && m.name && m.distance);
          const modalitiesToUpdate = modalities.filter(m => m.id && m.name && m.distance);
          const existingIds = existingModalities.map(m => m.id);
          const currentIds = modalities.filter(m => m.id).map(m => m.id!);
          modalitiesToDelete = existingIds.filter(id => !currentIds.includes(id));
          
          // Create new modalities and update local state with returned IDs
          const createdModalities: Modality[] = [];
          for (const modality of modalitiesToCreate) {
            const maxParticipants = (modality.max_participants === undefined || modality.max_participants === null) 
              ? null 
              : (typeof modality.max_participants === 'number' ? modality.max_participants : null);
            
            console.log('🔍 Creating modality:', { 
              name: modality.name, 
              distance: modality.distance,
              max_participants_raw: modality.max_participants,
              max_participants_processed: maxParticipants,
              type: typeof modality.max_participants
            });
            
            const response = await createModality({
              event_id: eventId,
              name: modality.name,
              distance: modality.distance,
              max_participants: maxParticipants,
              route_image_url: modality.route_image_url || null,
            });
            
            console.log('✅ Create modality response:', response);
            
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
                const maxParticipants = (modality.max_participants === undefined || modality.max_participants === null) 
                  ? null 
                  : (typeof modality.max_participants === 'number' ? modality.max_participants : null);
                
                console.log('🔍 Updating modality:', { 
                  id: modality.id,
              name: modality.name,
              distance: modality.distance,
                  max_participants_raw: modality.max_participants,
                  max_participants_processed: maxParticipants,
                  type: typeof modality.max_participants
                });
                
                const updatePayload = {
                  name: modality.name,
                  distance: modality.distance,
                  max_participants: maxParticipants,
                  route_image_url: modality.route_image_url || null,
                };
                
                console.log('📤 Sending update payload:', updatePayload);
                
                const response = await updateModalityAPI(modality.id, updatePayload);
                
                console.log('✅ Update modality response:', response);
                console.log('✅ Response type:', typeof response);
                console.log('✅ Response keys:', response ? Object.keys(response) : 'null/undefined');
                
                if (!response) {
                  console.error('❌ Response is null/undefined');
                } else if (!response.success) {
                  console.error('❌ Error updating modality:', response.error);
                } else {
                  console.log('✅ Modality updated successfully:', response.data);
                }
              } catch (error) {
                console.error('Error updating modality:', error);
              }
            }
          }
          
          // Do not delete modalities here: categories may still reference them. Delete after categories sync.

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
              .filter((id): id is string => id !== null && id !== undefined)
              .filter(id => !modalitiesToDelete.includes(id)); // Excluir modalidades que serão removidas (permite deletar depois)
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
                batches: cat.batches || [],
                custom_fields: cat.custom_fields || [],
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

              // Sync batches for all categories
              try {
                for (const category of categoriesToProcess) {
                  let categoryId = category.id;
                  
                  if (!categoryId || categoryId.startsWith('temp-')) {
                    // Find the saved category by name and price
                    const savedCategory = savedCategories.find(sc => 
                      sc.name === category.name && 
                      sc.price === category.price &&
                      sc.category_type === category.category_type
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
                    
                    console.log('📅 Enviando batch com datas (organizador):', {
                      batch_id: batch.id,
                      valid_from: validFrom,
                      valid_to: validTo,
                      valid_from_type: typeof batch.valid_from,
                      valid_to_type: typeof batch.valid_to,
                    });

                    if (batch.id && batch.id.startsWith('temp-')) {
                      // Create new batch
                      await createCategoryBatch(categoryId, {
                        name: batch.name || null,
                        price: batch.price,
                        valid_from: validFrom,
                        valid_to: validTo,
                      });
                    } else if (batch.id && existingBatchIds.has(batch.id)) {
                      // Update existing batch
                      await updateCategoryBatch(categoryId, batch.id, {
                        name: batch.name || null,
                        price: batch.price,
                        valid_from: validFrom,
                        valid_to: validTo,
                      });
                    }
                  }

                  // Sync custom fields (criar no backend os que estavam pendentes / temp)
                  const customFields = category.custom_fields ?? [];
                  for (const cf of customFields) {
                    if (cf.id.startsWith("temp-")) {
                      try {
                        await createCategoryCustomField(categoryId, {
                          label: cf.label,
                          field_type: cf.field_type,
                          display_order: cf.display_order,
                        });
                      } catch (err: any) {
                        console.error("Error creating custom field:", err);
                      }
                    }
                  }
                }

                // Recarregar categorias para trazer custom_fields com IDs reais
                const finalReload = await getCategories(eventId);
                if (finalReload.success && finalReload.data) {
                  const withCustomFields: Category[] = finalReload.data.map((cat: CategoryType) => ({
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
                    batches: cat.batches || [],
                    custom_fields: cat.custom_fields || [],
                  }));
                  setCategories(withCustomFields);
                }
              } catch (error: any) {
                console.error('Error syncing batches/custom fields:', error);
            toast({
              title: "Aviso",
                  description: "Evento salvo, mas houve erro ao salvar lotes ou campos personalizados",
              variant: "destructive",
            });
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

        // Excluir modalidades removidas somente após as categorias não as referenciarem
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
      }

      // Sync kits
      if (kits.length > 0 && eventId) {
        try {
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          const isValidId = (id: string | null | undefined): id is string =>
            typeof id === "string" && id.length > 0 && !id.startsWith("temp-") && uuidRegex.test(id);
          const savedCatsRes = await getCategories(eventId);
          const savedCategoryList = savedCatsRes.success && savedCatsRes.data ? savedCatsRes.data : [];
          const validCategoryIds = (ids: (string | null | undefined)[] | undefined): string[] | undefined => {
            if (!ids?.length) return undefined;
            const mapped = ids.map((id, i) => (isValidId(id) ? id : savedCategoryList[i]?.id)).filter((id): id is string => isValidId(id));
            return mapped.length > 0 ? mapped : undefined;
          };
          const kitsData = kits.map((kit, index) => ({
            id: kit.id,
            name: kit.name,
            description: kit.description || null,
            price: kit.price,
            display_order: index,
            category_ids: validCategoryIds(kit.category_ids),
            products: kit.products.map((product) => {
              /* Não usar product.variant_attributes quando for [] — em JS [] é truthy e o sync gravava array vazio no PG.
               * Preferir nomes não vazios do estado da UI (variantAttributes), depois variant_attributes persistido. */
              const fromStored = Array.isArray(product.variant_attributes)
                ? product.variant_attributes.map((s) => String(s).trim()).filter(Boolean)
                : [];
              const fromUi =
                product.variantAttributes?.map((attr) => attr.name.trim()).filter(Boolean) ?? [];
              const variantAttributeNames =
                fromStored.length > 0 ? fromStored : fromUi.length > 0 ? fromUi : null;

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
              title: "Não foi possível salvar os kits",
              description: kitsResponse.message || kitsResponse.error || "Evento salvo, mas houve erro ao salvar kits.",
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
            title: "Não foi possível salvar os kits",
            description: error?.message || "Evento salvo, mas houve erro ao salvar kits.",
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
      <DialogContent className="fixed inset-0 z-50 w-screen h-screen max-w-none translate-x-0 translate-y-0 rounded-none border-0 bg-background p-6 overflow-y-auto data-[state=open]:zoom-in-100">
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
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList className="grid w-full grid-cols-9">
                <TabsTrigger value="info">Informações</TabsTrigger>
                <TabsTrigger value="premiacao">Premiação</TabsTrigger>
                <TabsTrigger value="cronograma">Cronograma</TabsTrigger>
                <TabsTrigger value="modalities">Modalidades</TabsTrigger>
                <TabsTrigger value="categories">Categorias</TabsTrigger>
                <TabsTrigger value="kits">Kits</TabsTrigger>
                <TabsTrigger value="pickup">Retirada</TabsTrigger>
                <TabsTrigger value="payment">Pagamentos</TabsTrigger>
                <TabsTrigger value="publish">Publicação</TabsTrigger>
              </TabsList>

              {/* Tab 1: Informações Gerais */}
              <TabsContent value="info" className="space-y-4">
                {/* Organizer selection for admin when creating or editing event */}
                {isAdmin && (
                  <div className="space-y-2">
                    <Label htmlFor="organizer-select">
                      {event?.id ? "Organizador" : "Organizador (Opcional)"}
                    </Label>
                    <Select
                      value={selectedOrganizerId || (event?.id && event.organizer_id ? event.organizer_id : "self")}
                      onValueChange={(value) => {
                        if (value === "self") {
                          // Se estiver editando, manter organizador atual; se criando, usar admin
                          setSelectedOrganizerId(event?.id && event.organizer_id ? event.organizer_id : "");
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
                        <SelectItem value="self">
                          {event?.id ? "Manter organizador atual" : "Criar no meu nome (Admin)"}
                        </SelectItem>
                        {organizers.map((organizer) => (
                          <SelectItem key={organizer.id} value={organizer.id}>
                            {organizer.name} ({organizer.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {event?.id 
                        ? "Altere o organizador responsável por este evento"
                        : "Selecione um organizador responsável ou escolha 'Criar no meu nome' para criar o evento no seu nome"
                      }
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

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="event_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data da Largada</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            value={field.value || ""}
                            onChange={(e) => field.onChange(e.target.value)}
                            className="w-full"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="event_time"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Horário da Largada</FormLabel>
                        <FormControl>
                          <Input
                            type="time"
                            value={field.value || ""}
                            onChange={(e) => field.onChange(e.target.value)}
                            className="w-full"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

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

                <div className="space-y-4 border-t pt-4 mt-2">
                  <FormField
                    control={form.control}
                    name="transfers_enabled"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5 pr-4">
                          <FormLabel>Transferências de inscrição</FormLabel>
                          <FormDescription>
                            Permite que corredores com inscrição confirmada solicitem transferência (conforme regras da plataforma).
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value !== false}
                            onCheckedChange={(v) => {
                              field.onChange(v);
                              if (!v) {
                                form.setValue("transfer_until", "");
                              }
                            }}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  {transfersEnabled !== false && (
                    <FormField
                      control={form.control}
                      name="transfer_until"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Transferências permitidas até</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              value={field.value || ""}
                              onChange={(e) => field.onChange(e.target.value || "")}
                              className="w-full max-w-xs"
                            />
                          </FormControl>
                          <FormDescription>
                            Opcional. Em branco = sem limite de data (enquanto as transferências estiverem ativas).
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              </TabsContent>

              {/* Tab Premiação */}
              <TabsContent value="premiacao" className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold">Premiação</h3>
                  <p className="text-sm text-muted-foreground">
                    Descreva as premiações do evento (pódios, categorias premiadas, etc.). Opcional.
                  </p>
                </div>
                <RichTextEditor
                  editorKey={event?.id ?? "new"}
                  value={premiacaoHtml}
                  onChange={setPremiacaoHtml}
                  placeholder="Descreva as premiações do evento…"
                  minHeight={200}
                  className="mt-2"
                />
              </TabsContent>

              {/* Tab Cronograma */}
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
                  <Button type="button" onClick={addCronogramaItem} size="sm" disabled={cronogramaItems.length >= 50}>
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar horário
                  </Button>
                </div>
                {cronogramaItems.length === 0 ? (
                  <Card>
                    <CardContent className="pt-6 text-center text-muted-foreground">
                      Nenhum item. Clique em &quot;Adicionar horário&quot; para começar.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {cronogramaItems.map((item, index) => (
                      <Card key={index}>
                        <CardContent className="pt-4 pb-4">
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
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
                <div>
                  <Label className="text-sm font-medium">Observações / informações adicionais (opcional)</Label>
                  <RichTextEditor
                    editorKey={`cronograma-${event?.id ?? "new"}`}
                    value={cronogramaHtml}
                    onChange={setCronogramaHtml}
                    placeholder="Informações adicionais de cronograma em texto livre…"
                    minHeight={120}
                    className="mt-2"
                  />
                </div>
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
                                const inputValue = e.target.value.trim();
                                let value: number | null = null;
                                
                                if (inputValue === "" || inputValue === null || inputValue === undefined) {
                                  value = null;
                                } else {
                                  const parsed = parseInt(inputValue, 10);
                                  value = (isNaN(parsed) || parsed <= 0) ? null : parsed;
                                }
                                
                                console.log('🔍 Updating max_participants:', { 
                                  inputValue, 
                                  value, 
                                  modalityIndex: index,
                                  modalityName: modality.name,
                                  currentValue: modality.max_participants
                                });
                                
                                updateModality(index, "max_participants", value);
                              }}
                              onBlur={(e) => {
                                // Garantir que o valor seja salvo quando o campo perder o foco
                                const inputValue = e.target.value.trim();
                                let value: number | null = null;
                                
                                if (inputValue === "" || inputValue === null || inputValue === undefined) {
                                  value = null;
                                } else {
                                  const parsed = parseInt(inputValue, 10);
                                  value = (isNaN(parsed) || parsed <= 0) ? null : parsed;
                                }
                                
                                updateModality(index, "max_participants", value);
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
                              onChange={(url) => updateModality(index, "route_image_url", url)}
                              onDelete={() => updateModality(index, "route_image_url", null)}
                              label="Upload da imagem do percurso"
                              description="Faça upload da imagem do percurso desta modalidade"
                            />
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
                                title="Remover ou desativar"
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
                                              key={`date-from-org-${batch.id || batchIndex}-${batch.valid_from || 'empty'}`}
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
                                                console.log('📅 onBlur date valid_from (organizador):', dateValue);
                                                
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
                                                  console.log('📅 onBlur date valid_from (organizador) processado:', processedValue);
                                                  
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
                                                console.log('📅 onChange time valid_from (organizador):', timeValue);
                                                
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
                                                console.log('📅 onChange time valid_from (organizador) processado:', processedValue);
                                                
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
                                              key={`date-to-org-${batch.id || batchIndex}-${batch.valid_to || 'empty'}`}
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
                                                console.log('📅 onBlur date valid_to (organizador):', dateValue);
                                                
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
                                                  console.log('📅 onBlur date valid_to (organizador) processado:', processedValue);
                                                  
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
                                                console.log('📅 onChange time valid_to (organizador):', timeValue);
                                                
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
                                                console.log('📅 onChange time valid_to (organizador) processado:', processedValue);
                                                
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
                                      <CustomFieldInlineForm
                                        label=""
                                        field_type="text"
                                        saving={customFieldSaving}
                                        onSave={(label, field_type) => handleCreateCustomField(index, label, field_type)}
                                        onCancel={() => setCustomFieldAddingCategoryIndex(null)}
                                      />
                                    </CardContent>
                                  </Card>
                                )}
                                {(category.custom_fields ?? []).map((f) =>
                                  customFieldEditing?.fieldId === f.id ? (
                                    <Card key={f.id} className="bg-muted/30">
                                      <CardContent className="pt-4">
                                        <CustomFieldInlineForm
                                          label={customFieldEditing.label}
                                          field_type={customFieldEditing.field_type}
                                          saving={customFieldSaving}
                                          onSave={(label, field_type) =>
                                            isPendingCustomField(f)
                                              ? updatePendingCustomField(index, f.id, label, field_type)
                                              : handleUpdateCustomField(category.id!, f.id, label, field_type)
                                          }
                                          onCancel={() => setCustomFieldEditing(null)}
                                        />
                                      </CardContent>
                                    </Card>
                                  ) : (
                                    <div key={f.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                                      <span className="text-sm font-medium">{f.label}</span>
                                      <div className="flex items-center gap-2">
                                        {isPendingCustomField(f) && (
                                          <Badge variant="outline" className="text-xs">Pendente</Badge>
                                        )}
                                        <Badge variant="secondary" className="text-xs">
                                          {f.field_type === "number" ? "Número" : "Texto"}
                                        </Badge>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => setCustomFieldEditing({ fieldId: f.id, categoryId: category.id ?? "", categoryIndex: index, label: f.label, field_type: f.field_type })}
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
                                            if (isPendingCustomField(f)) {
                                              removeCustomFieldLocal(index, f.id);
                                            } else if (category.id) {
                                              handleDeleteCustomField(category.id, f.id);
                                            }
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
                                     <div key={categoryId ?? index} className="flex items-center space-x-2">
                                       <input
                                         type="checkbox"
                                         id={`kit-${index}-category-${categoryId ?? index}`}
                                         checked={isChecked}
                                         onChange={() => {
                                           const currentCategoryIds = kit.category_ids || [];
                                           const newCategoryIds = isChecked
                                             ? currentCategoryIds.filter(id => id !== categoryId)
                                             : [...currentCategoryIds, categoryId];
                                           updateKit(index, "category_ids", newCategoryIds.length > 0 ? newCategoryIds : undefined);
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

              {/* Tab 5: Pagamentos */}
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
                        <FormField
                          control={form.control}
                          name="pix_enabled"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value ?? true}
                                  onCheckedChange={(checked) => {
                                    field.onChange(checked);
                                    if (!checked) {
                                      form.setValue("pix_disabled_at", null);
                                    }
                                  }}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      {form.watch("pix_enabled") && (
                        <div className="space-y-2 pl-12">
                          <Label className="text-sm font-normal">
                            Desabilitar automaticamente em:
                          </Label>
                          <FormField
                            control={form.control}
                            name="pix_disabled_at"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input
                                    type="datetime-local"
                                    value={field.value ? new Date(field.value).toISOString().slice(0, 16) : ""}
                                    onChange={(e) => {
                                      const value = e.target.value ? new Date(e.target.value).toISOString() : null;
                                      field.onChange(value);
                                    }}
                                    placeholder="Opcional - deixe em branco para manter sempre habilitado"
                                  />
                                </FormControl>
                                <FormDescription className="text-xs">
                                  Se preenchido, o PIX será desabilitado automaticamente nesta data/hora
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
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
                        <FormField
                          control={form.control}
                          name="credit_card_enabled"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value ?? true}
                                  onCheckedChange={(checked) => {
                                    field.onChange(checked);
                                    if (!checked) {
                                      form.setValue("credit_card_disabled_at", null);
                                    }
                                  }}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      {form.watch("credit_card_enabled") && (
                        <div className="space-y-2 pl-12">
                          <Label className="text-sm font-normal">
                            Desabilitar automaticamente em:
                          </Label>
                          <FormField
                            control={form.control}
                            name="credit_card_disabled_at"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input
                                    type="datetime-local"
                                    value={field.value ? new Date(field.value).toISOString().slice(0, 16) : ""}
                                    onChange={(e) => {
                                      const value = e.target.value ? new Date(e.target.value).toISOString() : null;
                                      field.onChange(value);
                                    }}
                                    placeholder="Opcional - deixe em branco para manter sempre habilitado"
                                  />
                                </FormControl>
                                <FormDescription className="text-xs">
                                  Se preenchido, o cartão de crédito será desabilitado automaticamente nesta data/hora
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      )}
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
                            ? (() => {
                                const dateStr = form.watch("event_date");
                                const timeStr = form.watch("event_time") || "00:00";
                                const dateTime = new Date(`${dateStr}T${timeStr}`);
                                return format(dateTime, "PPP 'às' HH:mm", {
                                  locale: ptBR,
                                });
                              })()
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
                      const tabs = ["info", "premiacao", "cronograma", "modalities", "categories", "kits", "pickup", "payment", "publish"];
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
                      onClick={async () => {
                        const tabs = ["info", "premiacao", "cronograma", "modalities", "categories", "kits", "pickup", "payment", "publish"];
                        const currentIndex = tabs.indexOf(activeTab);
                        if (currentIndex < tabs.length - 1) {
                          // Validar etapa atual antes de avançar
                          const isValid = await validateStep(activeTab);
                          if (isValid) {
                            setActiveTab(tabs[currentIndex + 1]);
                          }
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
