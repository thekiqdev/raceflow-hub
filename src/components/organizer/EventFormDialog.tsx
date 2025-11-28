import { useState } from "react";
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
import { CalendarIcon, Plus, Trash2, Upload } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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
  valid_from: string;
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
}

interface Product {
  id?: string;
  name: string;
  description: string;
  type: 'variable' | 'unique';
  image_url: string;
  variants: ProductVariant[];
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
  const [activeTab, setActiveTab] = useState("info");
  const [modalities, setModalities] = useState<Modality[]>([]);
  const [kits, setKits] = useState<Kit[]>([]);
  const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      title: event?.title || "",
      description: event?.description || "",
      location: event?.location || "",
      city: event?.city || "",
      state: event?.state || "",
      event_date: event?.event_date ? new Date(event.event_date) : undefined,
      banner_url: event?.banner_url || "",
      regulation_url: event?.regulation_url || "",
      status: event?.status || "draft",
    },
  });

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
    updated[kitIndex].products[productIndex].variants.push({ name: "" });
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
    value: string
  ) => {
    const updated = [...kits];
    updated[kitIndex].products[productIndex].variants[variantIndex].name = value;
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
      valid_from: "",
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
    const updated = [...modalities];
    updated[modalityIndex].batches[batchIndex] = {
      ...updated[modalityIndex].batches[batchIndex],
      [field]: value,
    };
    setModalities(updated);
  };

  const onSubmit = async (values: EventFormValues) => {
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
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
        event_date: format(values.event_date, "yyyy-MM-dd"),
        banner_url: values.banner_url || null,
        regulation_url: values.regulation_url || null,
        status: values.status,
        organizer_id: user.id,
      };

      let eventId = event?.id;

      if (event?.id) {
        const { error } = await supabase
          .from("events")
          .update(eventData)
          .eq("id", event.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("events")
          .insert([eventData])
          .select()
          .single();

        if (error) throw error;
        eventId = data.id;
      }

      // Insert modalities
      if (modalities.length > 0) {
        for (const modality of modalities) {
          const modalityData = {
            name: modality.name,
            distance: modality.distance,
            max_participants: modality.max_participants,
            price: modality.price,
            event_id: eventId,
          };

          const { data: insertedModality, error: modalityError } = await supabase
            .from("event_categories")
            .insert([modalityData])
            .select()
            .single();

          if (modalityError) throw modalityError;

          // Insert batches for this modality
          if (modality.batches.length > 0) {
            const batchesData = modality.batches.map((batch) => ({
              category_id: insertedModality.id,
              price: batch.price,
              valid_from: batch.valid_from,
            }));

            const { error: batchesError } = await supabase
              .from("category_batches")
              .insert(batchesData);

            if (batchesError) throw batchesError;
          }
        }
      }

      // Insert kits
      if (kits.length > 0) {
        for (const kit of kits) {
          const kitData = {
            name: kit.name,
            description: kit.description,
            price: kit.price,
            event_id: eventId,
          };

          const { data: insertedKit, error: kitError } = await supabase
            .from("event_kits")
            .insert([kitData])
            .select()
            .single();

          if (kitError) throw kitError;

          // Insert products for this kit
          if (kit.products.length > 0) {
            for (const product of kit.products) {
              const productData = {
                kit_id: insertedKit.id,
                name: product.name,
                description: product.description,
                type: product.type,
                image_url: product.image_url || null,
              };

              const { data: insertedProduct, error: productError } = await supabase
                .from("kit_products")
                .insert([productData])
                .select()
                .single();

              if (productError) throw productError;

              // Insert variants if it's a variable product
              if (product.type === "variable" && product.variants.length > 0) {
                const variantsData = product.variants.map((v) => ({
                  product_id: insertedProduct.id,
                  name: v.name,
                }));

                const { error: variantsError } = await supabase
                  .from("product_variants")
                  .insert(variantsData);

                if (variantsError) throw variantsError;
              }
            }
          }

        }
      }

      // Insert pickup locations (universal for all kits)
      if (pickupLocations.length > 0) {
        const locationData = pickupLocations.map((location) => ({
          event_id: eventId,
          address: location.address,
          pickup_date: location.pickup_date,
          latitude: location.latitude ? parseFloat(location.latitude) : null,
          longitude: location.longitude ? parseFloat(location.longitude) : null,
        }));

        const { error: locationError } = await supabase
          .from("kit_pickup_locations")
          .insert(locationData);

        if (locationError) throw locationError;
      }

      toast({
        title: "Sucesso!",
        description: event?.id
          ? "Evento atualizado com sucesso"
          : "Evento criado com sucesso",
      });

      onSuccess?.();
      onOpenChange(false);
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                format(field.value, "PPP", { locale: ptBR })
                              ) : (
                                <span>Selecione a data</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) =>
                              date < new Date(new Date().setHours(0, 0, 0, 0))
                            }
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="banner_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL do Banner</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Input
                            placeholder="https://exemplo.com/banner.jpg"
                            {...field}
                          />
                          <Button type="button" variant="outline" size="icon">
                            <Upload className="h-4 w-4" />
                          </Button>
                        </div>
                      </FormControl>
                      <FormDescription>
                        Imagem de destaque do evento (recomendado: 1200x600px)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="regulation_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL do Regulamento (PDF)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://exemplo.com/regulamento.pdf"
                          {...field}
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
                                  key={bIndex}
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
                                        Válido a partir de
                                      </label>
                                      <Input
                                        type="datetime-local"
                                        value={batch.valid_from}
                                        onChange={(e) =>
                                          updateBatch(
                                            index,
                                            bIndex,
                                            "valid_from",
                                            e.target.value
                                          )
                                        }
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
                                             if (product.variants.length === 0) {
                                               addVariant(index, pIndex);
                                             }
                                           }}
                                         >
                                           Variável
                                         </Button>
                                       </div>
                                     </div>

                                     {product.type === "variable" && (
                                       <div className="space-y-2">
                                         <div className="flex justify-between items-center">
                                           <label className="text-xs font-medium">
                                             Variantes (ex: P, M, G)
                                           </label>
                                           <Button
                                             type="button"
                                             variant="ghost"
                                             size="sm"
                                             onClick={() =>
                                               addVariant(index, pIndex)
                                             }
                                           >
                                             <Plus className="mr-1 h-3 w-3" />
                                             Variante
                                           </Button>
                                         </div>
                                         <div className="space-y-2">
                                           {product.variants.map((variant, vIndex) => (
                                             <div
                                               key={vIndex}
                                               className="flex gap-2"
                                             >
                                               <Input
                                                 placeholder="Ex: P, M, G, Azul, Vermelho"
                                                 value={variant.name}
                                                 onChange={(e) =>
                                                   updateVariant(
                                                     index,
                                                     pIndex,
                                                     vIndex,
                                                     e.target.value
                                                   )
                                                 }
                                               />
                                               <Button
                                                 type="button"
                                                 variant="ghost"
                                                 size="icon"
                                                 onClick={() =>
                                                   removeVariant(
                                                     index,
                                                     pIndex,
                                                     vIndex
                                                   )
                                                 }
                                               >
                                                 <Trash2 className="h-4 w-4" />
                                               </Button>
                                             </div>
                                           ))}
                                         </div>
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
                  <Button type="submit" disabled={isSubmitting}>
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
