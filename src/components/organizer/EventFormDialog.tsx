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
import { CalendarIcon, Plus, Trash2, Upload, X } from "lucide-react";
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
import { FileUpload } from "@/components/ui/file-upload";

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
  max_participants: number | null;
  price: number;
  batches: Batch[];
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

interface PickupLocation {
  id?: string;
  address: string;
  pickup_date: string;
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
}

export function EventFormDialog({ open, onOpenChange, event, onSuccess }: EventFormDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("info");
  const [modalities, setModalities] = useState<Modality[]>([]);
  const [kits, setKits] = useState<Kit[]>([]);
  const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        });
        setModalities([]);
        setKits([]);
        setPickupLocations([]);
        setActiveTab("info");
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
            });

            // Load categories (modalities)
            const categoriesResponse = await getEventCategories(event.id);
            if (categoriesResponse.success && categoriesResponse.data) {
              const loadedModalities: Modality[] = categoriesResponse.data.map((cat: any) => ({
                id: cat.id,
                name: cat.name,
                distance: cat.distance,
                price: cat.price,
                max_participants: cat.max_participants,
                batches: cat.batches?.map((batch: any) => {
                  // Convert UTC date from database to local date format (YYYY-MM-DD) with T00:00
                  // O campo agora é apenas data, então sempre salvamos com T00:00
                  let validFrom: string | null = null;
                  if (batch.valid_from) {
                    const date = new Date(batch.valid_from);
                    if (!isNaN(date.getTime())) {
                      // Get local date components (apenas data, sem hora)
                      const year = date.getFullYear();
                      const month = String(date.getMonth() + 1).padStart(2, '0');
                      const day = String(date.getDate()).padStart(2, '0');
                      // Sempre usar 00:00 para o campo de data
                      validFrom = `${year}-${month}-${day}T00:00`;
                    }
                  }
                  return {
                    id: batch.id,
                    price: batch.price,
                    valid_from: validFrom,
                  };
                }) || [],
              }));
              console.log("✅ Modalidades carregadas:", loadedModalities.length);
              setModalities(loadedModalities);
            } else {
              console.log("⚠️ Nenhuma modalidade encontrada");
              setModalities([]);
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
                      // Get all unique values for the first attribute
                      const firstAttributeValues = new Set<string>();
                      const allVariantValues: string[][] = [];
                      
                      variants.forEach(variant => {
                        // Parse variant name: "Valor1 - Valor2 - Valor3"
                        const values = variant.name.split(' - ').map(v => v.trim());
                        allVariantValues.push(values);
                        
                        // First value should match variant_group_name or be the first in the name
                        if (values.length > 0) {
                          firstAttributeValues.add(values[0]);
                        }
                      });
                      
                      // Determine number of attributes from the longest variant name
                      const maxValues = Math.max(...allVariantValues.map(v => v.length), 0);
                      
                      if (maxValues > 0) {
                        variantAttributes = [];
                        
                        // First attribute
                        variantAttributes.push({
                          name: firstAttributeName,
                          values: Array.from(firstAttributeValues).sort()
                        });
                        
                        // Additional attributes (if any)
                        for (let i = 1; i < maxValues; i++) {
                          const attributeValues = new Set<string>();
                          allVariantValues.forEach(values => {
                            if (values[i]) {
                              attributeValues.add(values[i]);
                            }
                          });
                          
                          if (attributeValues.size > 0) {
                            // Use saved name if available, otherwise generic name
                            const attributeName = savedAttributeNames[i] || `Atributo ${i + 1}`;
                            variantAttributes.push({
                              name: attributeName,
                              values: Array.from(attributeValues).sort()
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
        });
        setModalities([]);
        setKits([]);
        setPickupLocations([]);
        setActiveTab("info");
      }
    };

    loadEventData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event?.id]);

  const addModality = () => {
    setModalities([
      ...modalities,
      { name: "", distance: "", max_participants: null, price: 0, batches: [] },
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
        address: "",
        pickup_date: "",
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
    value: string
  ) => {
    const updated = [...pickupLocations];
    updated[locationIndex][field] = value as never;
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
        organizer_id: user.id,
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

      // Sync modalities (categories)
      if (modalities.length > 0 && eventId) {
        try {
          console.log('📤 Syncing modalities:', modalities.length);
          const modalitiesData = modalities.map((modality, modIndex) => {
            console.log(`📋 Modality ${modIndex + 1}:`, {
              id: modality.id,
              name: modality.name,
              batchesCount: modality.batches.length,
              batches: modality.batches.map(b => ({
                id: b.id,
                price: b.price,
                valid_from: b.valid_from,
              })),
            });
            
            return {
              id: modality.id,
              name: modality.name,
              distance: modality.distance,
              price: modality.price, // Use the initial price, not the first batch
              max_participants: modality.max_participants || null,
              batches: modality.batches.map((batch, batchIndex) => {
              // Convert datetime-local string to ISO string in UTC
              // datetime-local format: "YYYY-MM-DDTHH:mm" (local time, no timezone)
              let validFrom: string | null = null;
              // Check if valid_from exists and is not empty (handle null, undefined, and empty string)
              const validFromValue = batch.valid_from;
              if (validFromValue != null && validFromValue !== '' && String(validFromValue).trim() !== '') {
                try {
                  let validFromStr = String(validFromValue).trim();
                  
                  // Se for apenas data (sem hora), adicionar 00:00
                  if (validFromStr.length === 10 && !validFromStr.includes('T')) {
                    validFromStr = `${validFromStr}T00:00`;
                  }
                  
                  // Parse as local time - new Date() interprets datetime-local as local time
                  const localDate = new Date(validFromStr);
                  if (!isNaN(localDate.getTime())) {
                    // Convert to ISO string (will be in UTC)
                    // toISOString() automatically converts local time to UTC
                    validFrom = localDate.toISOString();
                    console.log(`📅 Modality ${modIndex + 1}, Batch ${batchIndex + 1} date conversion: "${validFromStr}" -> "${validFrom}"`);
                  } else {
                    console.warn(`⚠️ Modality ${modIndex + 1}, Batch ${batchIndex + 1}: Invalid date "${validFromStr}"`);
                  }
                } catch (error) {
                  console.error(`❌ Modality ${modIndex + 1}, Batch ${batchIndex + 1}: Error converting date "${validFromValue}":`, error);
                }
              } else {
                console.log(`ℹ️ Modality ${modIndex + 1}, Batch ${batchIndex + 1}: valid_from is null/empty. Value:`, validFromValue, `Type:`, typeof validFromValue);
              }
              return {
                id: batch.id,
                price: batch.price,
                valid_from: validFrom,
              };
            }),
            };
          });
          
          console.log('📤 Final modalitiesData to send:', JSON.stringify(modalitiesData, null, 2));
          
          const { syncEventCategories } = await import('@/lib/api/eventCategories');
          const categoriesResponse = await syncEventCategories(eventId, modalitiesData);
          
          if (!categoriesResponse.success) {
            console.error('Error syncing categories:', categoriesResponse.error);
            toast({
              title: "Aviso",
              description: "Evento salvo, mas houve erro ao salvar modalidades",
              variant: "destructive",
            });
          }
        } catch (error: any) {
          console.error('Error syncing categories:', error);
          toast({
            title: "Aviso",
            description: "Evento salvo, mas houve erro ao salvar modalidades",
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

      // Insert pickup locations
      // TODO: Create pickup locations endpoint
      // if (pickupLocations.length > 0) {
      //   // TODO: Create pickup locations endpoint
      // }

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
              <TabsList className="grid w-full grid-cols-6">
                <TabsTrigger value="info">Informações</TabsTrigger>
                <TabsTrigger value="modalities">Modalidades</TabsTrigger>
                <TabsTrigger value="kits">Kits</TabsTrigger>
                <TabsTrigger value="pickup">Retirada</TabsTrigger>
                <TabsTrigger value="payment">Valores</TabsTrigger>
                <TabsTrigger value="publish">Publicação</TabsTrigger>
              </TabsList>

              {/* Tab 1: Informações Gerais */}
              <TabsContent value="info" className="space-y-4">
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
                          value={field.value || undefined}
                          onChange={(url) => field.onChange(url || "")}
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
                          value={field.value || undefined}
                          onChange={(url) => field.onChange(url || "")}
                          description="Regulamento do evento em PDF. Você pode fazer upload de um arquivo PDF ou inserir uma URL."
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
                      Adicione as distâncias e categorias do evento
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
                      <Card key={index}>
                        <CardHeader className="pb-3">
                          <div className="flex justify-between items-center">
                            <CardTitle className="text-base">
                              Modalidade {index + 1}
                            </CardTitle>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeModality(index)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-sm font-medium">
                                Nome da Categoria
                              </label>
                              <Input
                                placeholder="Ex: Elite, Local, PCD"
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
                                placeholder="Ex: 5K, 10K"
                                value={modality.distance}
                                onChange={(e) =>
                                  updateModality(index, "distance", e.target.value)
                                }
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-sm font-medium">
                                Limite de Vagas
                              </label>
                              <Input
                                type="number"
                                placeholder="Deixe vazio para ilimitado"
                                value={modality.max_participants || ""}
                                onChange={(e) =>
                                  updateModality(
                                    index,
                                    "max_participants",
                                    e.target.value ? parseInt(e.target.value) : null
                                  )
                                }
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium">
                                Valor Inicial (R$)
                              </label>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={modality.price}
                                onChange={(e) =>
                                  updateModality(
                                    index,
                                    "price",
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                              />
                            </div>
                          </div>

                          {/* Batches Section */}
                          <div className="border-t pt-4 mt-4">
                            <div className="flex justify-between items-start mb-4">
                              <div>
                                <h4 className="text-base font-semibold mb-1">Lotes</h4>
                                <p className="text-sm text-muted-foreground">
                                  Configure a virada de lotes por data
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => addBatch(index)}
                              >
                                <Plus className="mr-2 h-4 w-4" />
                                Adicionar Lote
                              </Button>
                            </div>

                            <div className="space-y-3">
                              {modality.batches.map((batch, bIndex) => (
                                <div
                                  key={batch.id || `batch-${index}-${bIndex}`}
                                  className="flex gap-3 items-start p-4 border rounded-lg bg-background"
                                >
                                  <div className="flex-1 grid grid-cols-2 gap-4">
                                    <div>
                                      <label className="text-sm font-medium mb-2 block">
                                        Valor (R$)
                                      </label>
                                      <Input
                                        type="number"
                                        step="0.01"
                                        placeholder="200"
                                        value={batch.price}
                                        onChange={(e) =>
                                          updateBatch(
                                            index,
                                            bIndex,
                                            "price",
                                            parseFloat(e.target.value) || 0
                                          )
                                        }
                                      />
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium mb-2 block">
                                        Válido a partir de (opcional)
                                      </label>
                                      <Input
                                        type="date"
                                        value={batch.valid_from ? (batch.valid_from.includes('T') ? batch.valid_from.split('T')[0] : batch.valid_from.substring(0, 10)) : ""}
                                        onChange={(e) => {
                                          const dateValue = e.target.value;
                                          console.log(`📝 Date input onChange - raw value:`, dateValue);
                                          
                                          if (dateValue && dateValue.length === 10) {
                                            // Sempre adicionar 00:00 quando uma data for selecionada
                                            const valueWithTime = `${dateValue}T00:00`;
                                            console.log(`  ✅ Data selecionada, adicionando T00:00:`, valueWithTime);
                                            
                                            updateBatch(
                                              index,
                                              bIndex,
                                              "valid_from",
                                              valueWithTime
                                            );
                                          } else if (!dateValue) {
                                            // Se o campo for limpo, salvar como null
                                            console.log(`  🗑️ Campo limpo, salvando como null`);
                                            updateBatch(
                                              index,
                                              bIndex,
                                              "valid_from",
                                              null
                                            );
                                          }
                                        }}
                                        onBlur={(e) => {
                                          // Garantir que ao sair do campo, se houver data, ela tenha hora
                                          const dateValue = e.target.value;
                                          console.log(`👋 Date input onBlur - raw value:`, dateValue);
                                          
                                          if (dateValue && dateValue.length === 10) {
                                            const valueWithTime = `${dateValue}T00:00`;
                                            // Verificar se o estado atual não tem a hora
                                            const currentValue = batch.valid_from;
                                            if (!currentValue || !currentValue.includes('T') || currentValue.length === 10) {
                                              console.log(`  ✅ onBlur: Garantindo T00:00:`, valueWithTime);
                                              updateBatch(
                                                index,
                                                bIndex,
                                                "valid_from",
                                                valueWithTime
                                              );
                                            }
                                          }
                                        }}
                                      />
                                    </div>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-10 w-10 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => removeBatch(index, bIndex)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Tab 3: Kits */}
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
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeKit(index)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
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
                                                         <div key={valueIndex} className="flex gap-2">
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
                      Configure os locais e horários para retirada (válido para todos os kits do evento)
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
                    {pickupLocations.map((location, index) => (
                      <Card key={index}>
                        <CardHeader className="pb-3">
                          <div className="flex justify-between items-center">
                            <CardTitle className="text-base">
                              Local {index + 1}
                            </CardTitle>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removePickupLocation(index)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div>
                            <label className="text-sm font-medium">Endereço</label>
                            <Textarea
                              placeholder="Endereço completo do local de retirada"
                              className="min-h-[80px]"
                              value={location.address}
                              onChange={(e) =>
                                updatePickupLocation(index, "address", e.target.value)
                              }
                            />
                          </div>

                          <div>
                            <label className="text-sm font-medium">
                              Data e Hora da Retirada
                            </label>
                            <Input
                              type="datetime-local"
                              value={location.pickup_date}
                              onChange={(e) =>
                                updatePickupLocation(index, "pickup_date", e.target.value)
                              }
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-sm font-medium">Latitude</label>
                              <Input
                                placeholder="-23.550520"
                                value={location.latitude}
                                onChange={(e) =>
                                  updatePickupLocation(index, "latitude", e.target.value)
                                }
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium">Longitude</label>
                              <Input
                                placeholder="-46.633308"
                                value={location.longitude}
                                onChange={(e) =>
                                  updatePickupLocation(index, "longitude", e.target.value)
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
                      <h4 className="font-medium">Taxa de Serviço</h4>
                      <p className="text-sm text-muted-foreground">
                        Taxa da plataforma: <strong>5% + R$ 2,00</strong> por inscrição
                      </p>
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
                      const tabs = ["info", "modalities", "kits", "payment", "publish"];
                      const currentIndex = tabs.indexOf(activeTab);
                      setActiveTab(tabs[currentIndex - 1]);
                    }}
                  >
                    Voltar
                  </Button>
                )}
                {activeTab !== "publish" ? (
                  <Button
                    type="button"
                    onClick={() => {
                      const tabs = ["info", "modalities", "kits", "payment", "publish"];
                      const currentIndex = tabs.indexOf(activeTab);
                      setActiveTab(tabs[currentIndex + 1]);
                    }}
                  >
                    Próximo
                  </Button>
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
